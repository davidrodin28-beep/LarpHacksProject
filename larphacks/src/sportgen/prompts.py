"""Design rules + gold examples. This file is the quality lever; the code around it is plumbing."""

import json

from .models import Sport

DESIGN_RULES = """\
You design NEW physical games that are genuinely fun to play. Follow every rule:

1. ONE clear goal a 10-year-old can state in one sentence.
2. A meaningful risk-vs-safe decision every few seconds (e.g. go long for 3 points or short for 1).
3. A catch-up mechanic: the trailing side gets something, so it never feels decided early.
4. A tension loop: build-up -> release every 20-40 seconds.
5. Everyone is involved all the time. No benching, no "last one standing" for groups over 4.
6. Exactly ONE twist. 80% familiar mechanics + 20% one novel rule. Two twists = confusing.
7. Learnable in 60 seconds, deeper over 10 minutes.
8. Physically safe: no head contact, no tackling, no blindfolds, no sprinting into walls.
9. Use ONLY the listed players, space, equipment and time. Not one item more.
10. Moves must use ONLY these body triggers (a camera detects them): jump, squat, arm_raise,
    hold_pose, step_zone, touch_ground, spin, clap. Every rule involving the body must map to one.
11. SIMPLICITY BUDGET. Every rule is one plain sentence with at most one condition. No stacked numeric
    sub-conditions ("within 2 s AND within 1 m AND arm raised"). No exceptions to exceptions. Scoring is one
    sentence plus at most one bonus. Never use a capitalised term ('Deep Return') unless you define it in the
    same rule. If a rule is not needed for the twist to work, delete it.
    rules depth "simple": 2-3 moves, 2 fouls, a 10-year-old explains the whole game after hearing it once.
    rules depth "normal": up to 3 moves, 3 fouls.   "deep": up to 4 moves, 4 fouls, tactical layers allowed.
12. Think like a referee before you write: play the first 60 seconds in your head. If you cannot say who
    does what and what gets called, the rule is not finished. Objects behave like real objects: a cone can be
    knocked over or stood up, not "flipped to a colour"; a ball cannot be "held" by a zone.

NEVER produce: dodgeball, tag, capture the flag, kickball, soccer, basketball, volleyball,
musical chairs, red light/green light, or any of these with a renamed ball. Judges check.
NEVER reuse mechanics from the gold examples below (squat-stepping carrier, jumping on a beat, partner-spin
scoring windows, arms-raised immunity). They show the standard, not the ingredients.
Names: short, punchy, pronounceable, no puns on existing sports."""

GOLD: list[Sport] = [
    Sport(
        name="Lantern",
        tagline="Hold the light, lose the legs.",
        objective="Score by carrying the ball into the far zone, but whoever holds it can only move by squatting.",
        players="3v3",
        equipment=["1 soft ball", "4 cones"],
        field="Rectangle 12x6 m marked by cones; a 2 m end zone at each end.",
        moves=[
            {"name": "Lantern step", "trigger": "squat", "rule": "The ball carrier may only advance one step per full squat."},
            {"name": "Flare", "trigger": "arm_raise", "rule": "A teammate with both arms raised is open; a pass to them cannot be intercepted."},
            {"name": "Snuff", "trigger": "touch_ground", "rule": "A defender touching the ground with one hand within 1 m of the carrier forces a pass within 3 s."},
        ],
        scoring="1 point for carrying the ball into the end zone; 3 points if the carrier entered by squat-steps only without passing.",
        fouls=["Carrier walks or runs while holding the ball: turnover.", "Contact with the carrier: free pass from the spot."],
        twist="Possession makes you slow. The team WITH the ball is the one under pressure.",
        catch_up="The trailing team may use 'Flare' with one arm instead of two.",
        duration="Three 4-minute rounds; swap ends each round.",
        first_30_seconds="Pass fast, squat-step when nobody is near, raise both arms when you are free.",
        twist_category="asymmetry",
    ),
    Sport(
        name="Pulse",
        tagline="Everyone jumps on the beat, except the thief.",
        objective="Be the player with the most tokens when the clock runs out.",
        players="5-8 free-for-all",
        equipment=["10 beanbags", "1 phone playing a steady beat"],
        field="Circle about 6 m across; beanbags piled in the centre.",
        moves=[
            {"name": "Pulse", "trigger": "jump", "rule": "Every player must jump on each beat; miss two beats in a row and you return one token."},
            {"name": "Reach", "trigger": "step_zone", "rule": "Step into the centre zone between beats to take exactly one token."},
            {"name": "Freeze", "trigger": "hold_pose", "rule": "Hold a pose for 3 beats to become immune to steals, but you cannot take tokens."},
        ],
        scoring="One point per token held at the final beat.",
        fouls=["Taking two tokens in one reach: return both.", "Touching another player: return one token."],
        twist="Movement is rationed by rhythm. You can only act in the gaps between beats.",
        catch_up="Players with the fewest tokens may skip one beat without penalty.",
        duration="One 6-minute track; the beat speeds up in the last minute.",
        first_30_seconds="Jump on the beat, step in for a token when the centre is empty, step out before the next beat.",
        twist_category="rhythm",
    ),
    Sport(
        name="Hinge",
        tagline="Your partner's spin is your shot clock.",
        objective="Pairs score by one partner touching the ground in the target zone while the other is mid-spin.",
        players="2v2 or 3v3 in pairs",
        equipment=["none"],
        field="Half a gym; two target zones (3x3 m) in opposite corners, marked with tape or cones.",
        moves=[
            {"name": "Hinge", "trigger": "spin", "rule": "A full 360 spin by one partner opens a 3-second window for the other to score."},
            {"name": "Plant", "trigger": "touch_ground", "rule": "Touching the ground with one hand inside a target zone during the window scores."},
            {"name": "Wall", "trigger": "arm_raise", "rule": "A defender with arms raised inside a target zone closes it for everyone."},
        ],
        scoring="1 point per plant; 2 if the spinning partner was in the OTHER target zone at the time.",
        fouls=["Spinning within 1 m of another player: window void.", "Planting with two hands: no score."],
        twist="You cannot score alone; the scoring action is only legal while your partner is doing something useless.",
        catch_up="The trailing pair's window lasts 5 seconds instead of 3.",
        duration="Two 5-minute halves.",
        first_30_seconds="Split up: one partner heads for a zone, the other spins when the defender's arms drop.",
        twist_category="cooperation",
    ),
]

TWIST_HINTS = {
    "asymmetry": "the two sides, or the player with the object, have different abilities",
    "hidden_info": "something matters that not everyone can see (a secret role, a hidden target)",
    "role_swap": "roles rotate on a trigger, so nobody stays attacker or defender for long",
    "territory": "space is captured, held or lost, and controls what you can do",
    "rhythm": "actions are rationed by timing, beats or windows",
    "cooperation": "you literally cannot score without a partner's simultaneous action",
    "momentum": "scoring streaks change the rules for the leader or the field",
}


def gold_block(idx: int | None = None) -> str:
    """All gold examples, or just one (rotated per candidate so no single mechanic dominates the batch)."""
    picks = GOLD if idx is None else [GOLD[idx % len(GOLD)]]
    return "\n\n".join(f"GOLD EXAMPLE {i + 1}:\n{s.model_dump_json(exclude={'twist_category'})}" for i, s in enumerate(picks))


SPORT_SHAPE = ("Output format: ONE JSON object with exactly the same keys as the gold examples "
               "(name, tagline, objective, players, equipment, field, moves[{name,trigger,rule}], scoring, fouls, "
               "twist, catch_up, duration, first_30_seconds, twist_category). Fill it with YOUR new sport. "
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
