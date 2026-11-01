import json

import pytest
from pydantic import ValidationError

from sportgen import prompts as P
from sportgen.llm import _extract_json
from sportgen.models import Constraints, Critique, Scores, Sport


def test_gold_examples_validate_and_use_tracker_vocab():
    for s in P.GOLD:
        Sport.model_validate(s.model_dump())
        assert 2 <= len(s.moves) <= 4


def test_sport_drops_unknown_trigger_moves_but_needs_two():
    d = P.GOLD[0].model_dump()
    d["moves"][0]["trigger"] = "tackle"
    assert len(Sport.model_validate(d).moves) == 2
    d["moves"][1]["trigger"] = "score_change"
    with pytest.raises(ValidationError):
        Sport.model_validate(d)


def test_gold_rotation():
    assert "GOLD EXAMPLE 2" not in P.candidate_system(0) and "Lantern" in P.candidate_system(3)


def test_prompts_contain_examples_not_schemas():
    json.loads(P.CRITIQUE_SHAPE)
    sys_prompt = P.candidate_system()
    assert "GOLD EXAMPLE 3" in sys_prompt and '"properties"' not in sys_prompt
    assert "rhythm" in P.candidate_user(Constraints().render(), "rhythm")


def test_critique_penalises_clones_and_danger():
    base = dict(index=0, closest_existing_sport="x", weaknesses=[])
    good = Critique(scores=Scores(clarity=5, simplicity=5, decisions=5, catch_up=5, novelty=5, safety=5, fit=5), similarity_pct=20, **base)
    clone = good.model_copy(update={"similarity_pct": 90})
    unsafe = Critique(scores=Scores(clarity=5, simplicity=5, decisions=5, catch_up=5, novelty=5, safety=1, fit=5), similarity_pct=20, **base)
    assert good.final == 35 and clone.final == 32 and unsafe.final < 25


def test_fit_violations_catch_invented_equipment_and_long_duration():
    from sportgen.models import fit_violations
    c = Constraints(players="3v3", equipment=["1 soft ball", "4 cones"], minutes=15)
    s = P.GOLD[0]  # Lantern: 1 soft ball + 4 cones, three 4-minute rounds
    assert fit_violations(s, c) == []
    bad = s.model_copy(update={"equipment": ["1 soft ball", "1 phone playing a beat"], "duration": "Four 10-minute quarters"})
    v = fit_violations(bad, c)
    assert any("phone" in x for x in v) and any("Duration" in x for x in v)
    assert fit_violations(P.GOLD[2], Constraints(equipment=["none"])) == []  # "none" + field markings are fine
    smuggled = P.GOLD[0].model_copy(update={"twist": "You may only move on the beat of the music."})
    assert any("beat" in x and "music" in x for x in fit_violations(smuggled, c))
    assert fit_violations(P.GOLD[1], Constraints(equipment=["10 beanbags", "1 phone playing a steady beat"])) == []


def test_gold_examples_pass_simple_complexity_budget():
    from sportgen.models import complexity_violations
    for s in P.GOLD:
        assert complexity_violations(s, Constraints(depth="simple")) == [], s.name


def test_complexity_violations_flag_dense_rules_and_undefined_terms():
    from sportgen.models import complexity_violations
    dense = P.GOLD[0].model_copy(update={
        "scoring": "1 point if the carrier enters within 3 s, unless a defender is within 1 m, except after a 'Deep Return'.",
        "fouls": ["a", "b", "c"]})
    v = complexity_violations(dense, Constraints(depth="simple"))
    assert any("fouls" in x for x in v) and any("conditional" in x for x in v) and any("Deep Return" in x for x in v)
    assert complexity_violations(dense, Constraints(depth="deep")) == ["Terms used but never defined: Deep Return."]


def test_trigger_mismatches():
    from sportgen.models import trigger_mismatches
    for s in P.GOLD:
        assert trigger_mismatches(s) == [], s.name
    bad = Sport.model_validate({**P.GOLD[0].model_dump(), "moves": [
        {"name": "Carry", "trigger": "touch_ground", "rule": "The ball carrier may only move while holding the ball."},
        {"name": "Flare", "trigger": "arm_raise", "rule": "A teammate with both arms raised is open."}]})
    v = trigger_mismatches(bad)
    assert len(v) == 1 and "Carry" in v[0] and "touch_ground" in v[0]


def test_portable_schema_is_provider_safe():
    from sportgen.llm import portable_schema
    sc = json.dumps(portable_schema(Sport))
    assert "anyOf" not in sc and "maxLength" not in sc and '"additionalProperties": false' in sc
    assert "twist_category" in json.loads(sc)["required"]


def test_extract_json_strips_fences_and_preamble():
    assert _extract_json('```json\n{"a":1}\n```') == '{"a":1}'
    assert _extract_json('Sure! {"a":1}') == '{"a":1}'
