"""Design rules + gold examples. This file is the quality lever; the code around it is plumbing."""

import json

from .models import Sport

DESIGN_RULES = """\
You design NEW webcam sports: physical games played standing in front of a laptop camera, upper body in
frame, scored LIVE by a motion tracker. The player sees a timer and a score. Follow every rule:

1. ONE clear goal a 10-year-old can state in one sentence.
2. A meaningful risk-vs-safe decision every few seconds (e.g. fast punches for 1 point each vs a slow full
   extension for 3).
3. A catch-up mechanic: when behind (vs an opponent taking turns, or vs your own last round), you get something.
4. A tension loop: build-up -> release every 10-20 seconds.
5. The player is always acting. No waiting rules, no "stand still for 10 seconds".
6. Exactly ONE twist. 80% familiar mechanics + 20% one novel rule. Two twists = confusing.
7. Learnable in 30 seconds, deeper over 3 rounds.
8. Physically safe for a person standing at a desk: no jumping, no contact, nothing near the screen.
9. Use ONLY the listed players, space, equipment and time. Body only unless equipment is listed.
10. Moves must use ONLY these triggers, which the camera counts automatically:
      arm_extend  - an arm goes from bent to fully straight
      punch       - a fast bent-to-straight arm (jab or cross)
      hand_open   - a closed hand opens
      hand_close  - an open hand closes into a fist
      head_tilt   - the head tilts to one side
      slip        - a boxer's duck/sway to one side
    Each move has `points` (1..5, or negative for a penalised move). The app adds exactly `points` every time
    the camera detects that move during a round of `round_seconds`; the rule text must state that same number
    and may not promise bonuses, multipliers or streaks the app does not compute. Rules the camera cannot verify (speed,
    direction, "only if", rhythm the app does not keep) are NOT allowed as scoring conditions; they may only
    appear as flavour the player self-enforces.
11. SIMPLICITY BUDGET. Every rule is one plain sentence with at most one condition. No stacked numeric
    sub-conditions ("within 2 s AND within 1 m AND arm raised"). No exceptions to exceptions. Scoring is one
    sentence plus at most one bonus. Never use a capitalised term ('Deep Return') unless you define it in the
    same rule. If a rule is not needed for the twist to work, delete it.
    rules depth "simple": 2-3 moves, 2 fouls, a 10-year-old explains the whole game after hearing it once.
    rules depth "normal": up to 3 moves, 3 fouls.   "deep": up to 4 moves, 4 fouls, tactical layers allowed.
12. Think like a referee before you write: play the first 60 seconds in your head. If you cannot say who
    does what and what gets called, the rule is not finished. Objects behave like real objects: a cone can be
    knocked over or stood up, not "flipped to a colour"; a ball cannot be "held" by a zone.

NEVER produce: plain shadowboxing, "do as many punches as you can", Simon says, or a fitness rep counter
with a sport name. Judges check.
NEVER reuse mechanics from the gold examples below (the left/right hand asymmetry, the forbidden-move trap,
the open-close-extend sequence). They show the standard, not the ingredients.
Names: short, punchy, pronounceable, no puns on existing sports."""

GOLD: list[Sport] = [
    Sport(
        name="Southpaw",
        tagline="Your weak hand pays triple.",
        objective="Score the most points in 60 seconds by punching, knowing your non-dominant hand is worth three times more.",
        players="solo, or 1v1 taking turns",
        equipment=["none"],
        field="Stand one big step back from the laptop so both shoulders and both fists are in frame.",
        moves=[
            {"name": "Lead", "trigger": "punch", "rule": "Any punch with your dominant hand scores 1 point.", "points": 1},
            {"name": "Off-hand", "trigger": "punch", "rule": "Any punch with your non-dominant hand scores 3 points; you choose which hand is which before the round.", "points": 3},
            {"name": "Reset", "trigger": "slip", "rule": "A slip to either side lets you switch which hand counts as dominant for the rest of the round.", "points": 0},
        ],
        scoring="Total points when the timer ends; most points wins the round.",
        fouls=["Punching toward the screen: that punch does not count.", "Both hands at once: neither counts."],
        twist="The hand you are worse with is the one that pays. Slipping lets you swap the rule mid-round when your weak arm tires.",
        catch_up="If you are behind after round 1, both your hands score 3 in round 2.",
        duration="Three 60-second rounds with 20 seconds rest.",
        round_seconds=60,
        first_30_seconds="Pick your weak hand, throw slow clean punches with it, slip once when it burns and keep going with the other.",
        twist_category="asymmetry",
    ),
    Sport(
        name="Hot Hand",
        tagline="Open hands score. One fist ends your streak.",
        objective="Build the longest chain of open-hand reaches without the camera ever seeing you make a fist.",
        players="solo",
        equipment=["none"],
        field="Sit or stand so both hands are in frame from the elbows up.",
        moves=[
            {"name": "Flash", "trigger": "hand_open", "rule": "Opening a hand scores 1 point.", "points": 1},
            {"name": "Reach", "trigger": "arm_extend", "rule": "Fully extending an arm with an open hand scores 2 points.", "points": 2},
            {"name": "Burn", "trigger": "hand_close", "rule": "Closing a hand into a fist costs 3 points: every open hand needs a close first, so plan it.", "points": -3},
        ],
        scoring="Points at the end of the round; your best round is your record.",
        fouls=["Hands out of frame for more than 5 seconds: round ends early."],
        twist="The move you need to set up every score is the move that punishes you, so you ration fists and farm reaches.",
        catch_up="Below zero at the halfway mark? Fists are free for the rest of the round.",
        duration="One 45-second round, repeat to beat your record.",
        round_seconds=45,
        first_30_seconds="Close both fists once, then open and reach, open and reach, and keep arms pumping without closing again.",
        twist_category="forbidden",
    ),
    Sport(
        name="Combination Lock",
        tagline="Open, close, extend: in that order or nothing.",
        objective="Score by completing the three-move combination as many times as possible in 90 seconds.",
        players="1v1 taking turns",
        equipment=["none"],
        field="Stand facing the camera with one arm free; the other hand stays at your side.",
        moves=[
            {"name": "Dial", "trigger": "hand_open", "rule": "Open your hand to start a combination.", "points": 1},
            {"name": "Click", "trigger": "hand_close", "rule": "Close it into a fist.", "points": 1},
            {"name": "Unlock", "trigger": "arm_extend", "rule": "Punch the fist out to a full extension to finish the combination.", "points": 3},
        ],
        scoring="Every move scores its points; a full open-close-extend chain is worth 5 and the app counts all three.",
        fouls=["Extending without a fist first: the extension does not count.", "Switching arms mid-round: restart your count at zero."],
        twist="Nothing scores alone; the order is the game, and the camera sees each step.",
        catch_up="The second player gets 10 extra seconds if the first player scored more than 30.",
        duration="One 90-second round each, then compare.",
        round_seconds=90,
        first_30_seconds="Open, close, extend, slowly, until it is smooth, then speed up.",
        twist_category="sequence",
    ),
]

TWIST_HINTS = {
    "asymmetry": "left and right sides, or two moves that look alike, are worth very different amounts",
    "hidden_info": "the player commits to something before the round (a secret move, a hand) that changes scoring",
    "role_swap": "the scoring rules flip at a trigger or at the halfway mark, so nobody can just repeat one move",
    "forbidden": "one natural move is penalised, and avoiding it is the skill",
    "rhythm": "the player must alternate or pace moves (self-enforced; the app only counts)",
    "sequence": "points come from doing moves in a specific order",
    "momentum": "a scoring streak changes what the moves are worth for the rest of the round",
}


def gold_block(idx: int | None = None) -> str:
    """All gold examples, or just one (rotated per candidate so no single mechanic dominates the batch)."""
    picks = GOLD if idx is None else [GOLD[idx % len(GOLD)]]
    return "\n\n".join(f"GOLD EXAMPLE {i + 1}:\n{s.model_dump_json(exclude={'twist_category'})}" for i, s in enumerate(picks))


SPORT_SHAPE = ("Output format: ONE JSON object with exactly the same keys as the gold examples "
               "(name, tagline, objective, players, equipment, field, moves[{name,trigger,rule,points}], scoring, fouls, "
               "twist, catch_up, duration, round_seconds, first_30_seconds, twist_category). Fill it with YOUR new sport. "
               "Never output a schema, $defs, 'properties' or 'type' keys. No prose outside the JSON.")

CRITIQUE_SHAPE = json.dumps({
    "critiques": [{
        "index": 0,
        "playtest": "<narrate 0s..60s of THIS candidate: who moves, what the referee calls, when score changes>",
        "undefined_terms": ["<only terms THIS candidate uses without explaining; usually an empty list>"],
        "contradictions": ["<only conflicts you actually found in THIS candidate; usually an empty list>"],
        "scores": {"clarity": 4, "simplicity": 3, "decisions": 3, "catch_up": 2, "novelty": 4, "safety": 5, "fit": 3},
        "closest_existing_sport": "<existing sport name>",
        "similarity_pct": 45,
        "weaknesses": ["<concrete, fixable instruction>", "<concrete, fixable instruction>"],
    }]
}, separators=(",", ":"))


def candidate_system(example_idx: int | None = None) -> str:
    return (f"{DESIGN_RULES}\n\nThis is the quality bar. Match its structure and standard, never its content:\n\n"
            f"{gold_block(example_idx)}\n\n{SPORT_SHAPE}")


def candidate_user(constraints: str, twist: str) -> str:
    return (f"Constraints -> {constraints}\n\nTwist category to use: {twist} ({TWIST_HINTS[twist]}). "
            f"Set twist_category to \"{twist}\". Invent one sport.")


def critic_system() -> str:
    return ("You are a strict playtest judge for new physical games. For EACH candidate, FIRST simulate the first 60 "
            "seconds of play as a referee, step by step (who moves, what is called, what score changes) and write it in "
            "'playtest'. While simulating, collect: 'undefined_terms' (capitalised or quoted terms never explained), and "
            "'contradictions' (two rules that cannot both be applied, a situation the rules do not cover, a tagline or "
            "objective that says something the rules do not, or a move whose trigger does not match the action described). "
            "THEN score 1-5: clarity (one-sentence goal, every rule unambiguous), simplicity (could a 10-year-old explain "
            "the whole game after hearing it once? 5 = yes; 1 = needs a rulebook), decisions (risk/safe choice every few "
            "seconds?), catch_up (does trailing side get help?), novelty (is the twist genuinely new?), safety (1 = someone "
            "gets hurt), fit (uses exactly the listed people, space, equipment, time, depth, and only the allowed body "
            "triggers). Name the closest existing sport and estimate similarity 0-100. Novelty is at most 2 if the sport "
            "reuses any of: squat-stepping ball carrier, jumping on a beat, partner-spin scoring windows, arms-raised "
            "immunity, or a hidden object with no equipment. List up to 3 concrete weaknesses as fixable instructions. "
            "Report ONLY defects present in the candidate's own text; never invent terms or rules it does not contain. "
            "Use empty lists when there is nothing to report. "
            f"Reply with ONE JSON object shaped like this template (one entry per candidate), nothing else:\n{CRITIQUE_SHAPE}")


def critic_user(constraints: str, candidates: list[Sport]) -> str:
    body = "\n\n".join(f"CANDIDATE {i}:\n{c.model_dump_json()}" for i, c in enumerate(candidates))
    return f"Constraints -> {constraints}\n\n{body}\n\nReturn one critique per candidate, index 0..{len(candidates) - 1}."


def refine_user(constraints: str, sport: Sport, weaknesses: list[str]) -> str:
    fixes = "\n".join(f"- {w}" for w in weaknesses) or "- none; tighten wording only"
    return (f"Constraints -> {constraints}\n\nCURRENT SPORT:\n{sport.model_dump_json()}\n\nPLAYTEST FINDINGS:\n{fixes}\n\n"
            "Fix every finding. Then SIMPLIFY: rewrite each rule as one plain sentence with at most one condition, delete "
            "any rule not needed for the twist to work, define or remove every capitalised term. Do NOT add rules or a "
            "second twist. Keep the name unless it is a pun on an existing sport. Keep twist_category. "
            "Return the full improved sport as JSON.")


def remix_user(constraints: str, sport: Sport, instruction: str) -> str:
    return (f"Constraints -> {constraints}\n\nCURRENT SPORT:\n{sport.model_dump_json()}\n\nCHANGE REQUEST: {instruction}\n\n"
            "Apply the change with the minimum number of edits so the sport stays coherent. Return the full sport as JSON.")
