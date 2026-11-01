"""Schema = the real guardrail. A sport that type-checks is already playable; the critic decides if it's fun."""

import re
from typing import Literal, get_args

from pydantic import BaseModel, Field, model_validator

# The motion tracker's vocabulary. Generated sports may ONLY use these triggers, so every rule is
# machine-checkable. Extend this enum when the tracker learns a new event.
Trigger = Literal["jump", "squat", "arm_raise", "hold_pose", "step_zone", "touch_ground", "spin", "clap"]

Twist = Literal["asymmetry", "hidden_info", "role_swap", "territory", "rhythm", "cooperation", "momentum"]
TWISTS: tuple[Twist, ...] = ("asymmetry", "hidden_info", "role_swap", "territory", "rhythm", "cooperation", "momentum")


class Constraints(BaseModel):
    players: str = "4-6"
    space: str = "gym"
    minutes: int = 15
    equipment: list[str] = Field(default_factory=lambda: ["1 soft ball"])
    intensity: Literal["low", "medium", "high"] = "medium"
    audience: str = "adults"
    depth: Literal["simple", "normal", "deep"] = "simple"
    notes: str = ""

    def render(self) -> str:
        eq = ", ".join(self.equipment) or "none"
        s = (f"players: {self.players}; space: {self.space}; time: {self.minutes} min; "
             f"equipment: {eq}; intensity: {self.intensity}; audience: {self.audience}; rules depth: {self.depth}")
        return s + (f"; notes: {self.notes}" if self.notes else "")


# Complexity budget per depth: (max moves, max fouls, max conditional clauses across all rule text)
DEPTH_BUDGET = {"simple": (3, 2, 5), "normal": (3, 3, 9), "deep": (4, 4, 14)}


class Move(BaseModel):
    name: str
    trigger: Trigger
    rule: str = Field(description="When this move counts, in one sentence a referee could apply.")


class Sport(BaseModel):
    name: str
    tagline: str = Field(max_length=90)
    objective: str = Field(description="One sentence: what wins.")
    players: str
    equipment: list[str]
    field: str = Field(description="Layout in plain words: zones, lines, cones.")
    moves: list[Move] = Field(min_length=2, max_length=4)
    scoring: str = Field(description="One plain sentence. At most one bonus condition.")
    fouls: list[str] = Field(min_length=1, max_length=4)
    twist: str = Field(description="THE one rule nobody has seen before.")
    catch_up: str = Field(description="What the trailing side gets so it never feels decided early.")
    duration: str
    first_30_seconds: str = Field(description="What a brand-new player does the moment play starts.")
    twist_category: Twist | None = None

    def rule_text(self) -> str:
        return " ".join([self.objective, self.scoring, self.twist, self.catch_up, *(m.rule for m in self.moves), *self.fouls])

    @model_validator(mode="before")
    @classmethod
    def _coerce(cls, data):
        # Small models invent triggers ("score_change") or overflow lists; salvage instead of discarding the sport.
        if isinstance(data, dict):
            ok = set(get_args(Trigger))
            if isinstance(data.get("moves"), list):
                data["moves"] = [m for m in data["moves"] if isinstance(m, dict) and m.get("trigger") in ok][:4]
            if isinstance(data.get("fouls"), list):
                data["fouls"] = [f for f in data["fouls"] if isinstance(f, str)][:4]
            if data.get("twist_category") not in TWISTS:
                data["twist_category"] = None
            if isinstance(data.get("tagline"), str):
                data["tagline"] = data["tagline"][:90]
            if isinstance(data.get("scoring"), list):
                data["scoring"] = " ".join(str(x) for x in data["scoring"])
        return data


_STOP = {"none", "with", "soft", "small", "large", "foam", "pair", "pairs", "set", "sets", "the", "and", "for", "any"}


def _nouns(items: list[str]) -> set[str]:
    out = set()
    for it in items:
        for w in re.findall(r"[a-z]+", it.lower()):
            if len(w) > 3 and w not in _STOP:
                out.add(w.rstrip("s"))
    return out


def fit_violations(sport: Sport, c: Constraints) -> list[str]:
    """Deterministic faithfulness check, zero LLM cost. Catches the most common error: invented equipment."""
    allowed = _nouns(c.equipment) | {"cone", "line", "tape", "wall", "marker", "zone", "chalk"}  # free field markings
    no_gear = not c.equipment or all(e.strip().lower() in ("", "none") for e in c.equipment)
    bad = [e for e in sport.equipment if e.strip().lower() != "none" and not (_nouns([e]) & allowed)]
    if no_gear:
        bad = [e for e in sport.equipment if e.strip().lower() != "none" and not (_nouns([e]) & {"cone", "line", "tape", "marker", "chalk"})]
    out = [f"Remove equipment not provided: {', '.join(bad)}. Allowed: {', '.join(c.equipment) or 'none'}."] if bad else []
    # Gear smuggled in through the rules rather than the equipment list ("on each beat", "when the timer buzzes").
    smuggled = sorted({w for w in re.findall(r"\b(music|beat|song|speaker|phone|timer|metronome|whistle|bell|blindfold)s?\b",
                                             sport.rule_text().lower())} - allowed)
    if smuggled:
        out.append(f"Rules rely on {', '.join(smuggled)}, which is not in the equipment list. Use only: "
                   f"{', '.join(c.equipment) or 'none'} and players' own bodies/voices.")
    for m in sport.moves:
        if m.trigger not in get_args(Trigger):
            out.append(f"Move '{m.name}' uses unknown trigger {m.trigger}.")
    if c.minutes and (total := _duration_minutes(sport.duration)) > c.minutes * 1.5:
        out.append(f"Duration '{sport.duration}' (~{total} min) exceeds the {c.minutes}-minute budget.")
    return out


# Words a rule must contain to plausibly describe its trigger. A move named "Carry" with trigger touch_ground
# whose rule never mentions the ground will fire the wrong tracker event.
TRIGGER_WORDS: dict[str, tuple[str, ...]] = {
    "jump": ("jump", "hop", "leap", "feet leave"),
    "squat": ("squat", "crouch", "duck", "bend your knees", "bend knees"),
    "arm_raise": ("arm", "arms", "hand up", "hands up", "overhead", "above your head", "above the head", "reach up"),
    "hold_pose": ("hold", "freeze", "still", "pose", "statue"),
    "step_zone": ("step", "enter", "stand in", "into the", "cross", "inside"),
    "touch_ground": ("ground", "floor", "touch down", "palm down"),
    "spin": ("spin", "turn around", "360", "rotate", "twirl"),
    "clap": ("clap",),
}


def trigger_mismatches(sport: Sport) -> list[str]:
    out = []
    for m in sport.moves:
        text = f"{m.name} {m.rule}".lower()
        if not any(w in text for w in TRIGGER_WORDS[m.trigger]):
            out.append(f"Move '{m.name}' is tagged {m.trigger} but its rule never describes that body action "
                       f"({' / '.join(TRIGGER_WORDS[m.trigger][:3])}). Rewrite the rule around that action or change the trigger.")
    return out


_CONDITIONAL = re.compile(r"\b(if|unless|only when|only if|only after|within|except|provided|while|before|after)\b", re.I)


def complexity(sport: Sport) -> tuple[int, int, int]:
    """(moves, fouls, conditional clauses). Deterministic proxy for 'how much must a player hold in their head'."""
    return len(sport.moves), len(sport.fouls), len(_CONDITIONAL.findall(sport.rule_text()))


def complexity_violations(sport: Sport, c: Constraints) -> list[str]:
    max_moves, max_fouls, max_cond = DEPTH_BUDGET[c.depth]
    moves, fouls, cond = complexity(sport)
    out = []
    if moves > max_moves:
        out.append(f"Too many moves ({moves}); merge or cut to {max_moves} for '{c.depth}' rules.")
    if fouls > max_fouls:
        out.append(f"Too many fouls ({fouls}); keep the {max_fouls} that protect the twist.")
    if cond > max_cond:
        out.append(f"Rules have {cond} conditional clauses (if/unless/within/only when...); budget is {max_cond}. "
                   "Drop numeric sub-conditions and exceptions; one plain sentence per rule.")
    defined = {m.name.lower() for m in sport.moves} | {sport.name.lower()}
    text = sport.rule_text()
    undefined = [t for t in re.findall(r"'([A-Z][\w ]{2,25})'", text)
                 if t.lower() not in defined and text.lower().count(t.lower()) < 2]  # mentioned once, never explained
    if undefined:
        out.append(f"Terms used but never defined: {', '.join(dict.fromkeys(undefined))}.")
    return out


_COUNT = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8}


def _duration_minutes(text: str) -> int:
    """'Three 4-minute rounds' -> 12; 'Two 5-minute halves' -> 10; 'One 10-minute round' -> 10. Breaks ignored."""
    total = 0
    for count, mins in re.findall(r"(?:(\b[a-z]+\b|\d+)\s+)?(\d+)\s*-?\s*min", text.lower()):
        n = _COUNT.get(count, int(count) if count.isdigit() else 1)
        total += n * int(mins)
    return total


class Scores(BaseModel):
    clarity: int = Field(ge=1, le=5, description="Goal statable in one sentence; every rule unambiguous.")
    simplicity: int = Field(ge=1, le=5, description="Could a 10-year-old explain the whole game after hearing it once?")
    decisions: int = Field(ge=1, le=5, description="Meaningful risk/safe choices every few seconds.")
    catch_up: int = Field(ge=1, le=5)
    novelty: int = Field(ge=1, le=5)
    safety: int = Field(ge=1, le=5)
    fit: int = Field(ge=1, le=5, description="Uses exactly the listed players/space/equipment/time.")

    @property
    def total(self) -> int:
        return self.clarity + self.simplicity + self.decisions + self.catch_up + self.novelty + self.safety + self.fit


MAX_SCORE = 35


class Critique(BaseModel):
    index: int
    scores: Scores
    closest_existing_sport: str
    similarity_pct: int = Field(ge=0, le=100)
    playtest: str = Field(default="", description="The first 60 seconds of play, narrated: who does what, what gets called.")
    undefined_terms: list[str] = Field(default_factory=list)
    contradictions: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(max_length=3)

    @model_validator(mode="after")
    def _drop_template_echoes(self):
        # Small models sometimes return the template placeholders verbatim.
        self.undefined_terms = [t for t in self.undefined_terms if not t.startswith("<")]
        self.contradictions = [c for c in self.contradictions if not c.startswith("<")]
        self.weaknesses = [w for w in self.weaknesses if not w.startswith("<")]
        return self

    @property
    def fixes(self) -> list[str]:
        """Everything refine should act on, most concrete first."""
        out = [f"Define or remove the term '{t}'." for t in self.undefined_terms]
        out += [f"Resolve contradiction: {c}" for c in self.contradictions]
        return out + self.weaknesses

    @property
    def final(self) -> float:
        # Thin renames of known sports (or of our gold examples) lose points no matter how polished; so do games
        # that need a lawyer. Contradictions found in the playtest are the most expensive defect of all.
        s = self.scores
        return (s.total - 3 * (self.similarity_pct >= 80) - 5 * (s.novelty <= 2) - 10 * (s.safety <= 2)
                - 4 * (s.simplicity <= 2) - 3 * len(self.contradictions) - len(self.undefined_terms))


class CritiqueBatch(BaseModel):
    critiques: list[Critique]


class SportResult(BaseModel):
    sport: Sport
    critique: Critique = Field(description="Judge's view of the chosen candidate BEFORE refine (drives selection).")
    final_critique: Critique | None = Field(default=None, description="Judge's view of the shipped sport, after refine.")
    alternatives: list[Sport]
