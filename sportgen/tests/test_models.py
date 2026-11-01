import json

import pytest
from pydantic import ValidationError

from sportgen import prompts as P
from sportgen.llm import _extract_json, portable_schema
from sportgen.models import (TRIGGER_COUNTERS, Constraints, Critique, Scores, Sport, complexity_violations,
                             fit_violations, trigger_mismatches)

GOOD = dict(clarity=5, simplicity=5, decisions=5, catch_up=5, novelty=5, safety=5, fit=5)


def test_gold_examples_validate_and_are_live_scorable():
    for s in P.GOLD:
        Sport.model_validate(s.model_dump())
        assert 2 <= len(s.moves) <= 4 and 15 <= s.round_seconds <= 300
        assert all(m.trigger in TRIGGER_COUNTERS for m in s.moves)
        assert any(m.points > 0 for m in s.moves), s.name  # something must score


def test_sport_drops_unknown_trigger_moves_but_needs_two():
    d = P.GOLD[0].model_dump()
    d["moves"][0]["trigger"] = "jump"
    assert len(Sport.model_validate(d).moves) == 2
    d["moves"][1]["trigger"] = "squat"
    with pytest.raises(ValidationError):
        Sport.model_validate(d)


def test_gold_rotation():
    assert "GOLD EXAMPLE 2" not in P.candidate_system(0) and "Southpaw" in P.candidate_system(3)


def test_prompts_contain_examples_not_schemas():
    json.loads(P.CRITIQUE_SHAPE)
    sys_prompt = P.candidate_system()
    assert "GOLD EXAMPLE 3" in sys_prompt and '"properties"' not in sys_prompt
    assert "rhythm" in P.candidate_user(Constraints().render(), "rhythm")


def test_critique_penalises_clones_danger_and_contradictions():
    base = dict(index=0, closest_existing_sport="x", weaknesses=[])
    good = Critique(scores=Scores(**GOOD), similarity_pct=20, **base)
    clone = good.model_copy(update={"similarity_pct": 90})
    unsafe = Critique(scores=Scores(**{**GOOD, "safety": 1}), similarity_pct=20, **base)
    contradicted = good.model_copy(update={"contradictions": ["a", "b"], "undefined_terms": ["T"]})
    assert good.final == 35 and clone.final == 32 and unsafe.final < 25 and contradicted.final == 28
    echo = Critique(scores=Scores(**GOOD), similarity_pct=20, undefined_terms=["<placeholder>"], **base)
    assert echo.undefined_terms == []


def test_fit_violations_catch_invented_equipment_and_long_duration():
    c = Constraints(players="solo", equipment=["none"], minutes=3)
    for s in P.GOLD:
        assert fit_violations(s, c) == [], s.name
    bad = P.GOLD[0].model_copy(update={"equipment": ["1 phone playing a beat"], "duration": "Four 10-minute quarters"})
    v = fit_violations(bad, c)
    assert any("phone" in x for x in v) and any("Duration" in x for x in v)
    smuggled = P.GOLD[0].model_copy(update={"twist": "Punch only when the ball is visible."})
    assert any("ball" in x for x in fit_violations(smuggled, c))
    assert fit_violations(smuggled, Constraints(equipment=["1 soft ball"], minutes=3)) == []


def test_gold_examples_pass_simple_complexity_budget():
    for s in P.GOLD:
        assert complexity_violations(s, Constraints(depth="simple")) == [], s.name


def test_complexity_violations_flag_dense_rules_and_undefined_terms():
    dense = P.GOLD[0].model_copy(update={
        "scoring": "1 point if you punch within 3 s, unless your hand is open, except after a 'Deep Return'.",
        "fouls": ["a", "b", "c"]})
    v = complexity_violations(dense, Constraints(depth="simple"))
    assert any("fouls" in x for x in v) and any("conditional" in x for x in v) and any("Deep Return" in x for x in v)
    assert complexity_violations(dense, Constraints(depth="deep")) == ["Terms used but never defined: Deep Return."]


def test_trigger_mismatches():
    for s in P.GOLD:
        assert trigger_mismatches(s) == [], s.name
    bad = Sport.model_validate({**P.GOLD[0].model_dump(), "moves": [
        {"name": "Carry", "trigger": "slip", "rule": "Hold the pose while the timer runs."},
        {"name": "Jab", "trigger": "punch", "rule": "A fast jab scores."}]})
    v = trigger_mismatches(bad)
    assert len(v) == 1 and "Carry" in v[0] and "slip" in v[0]


def test_portable_schema_is_provider_safe():
    sc = json.dumps(portable_schema(Sport))
    assert "anyOf" not in sc and "maxLength" not in sc and '"additionalProperties": false' in sc
    assert "twist_category" in json.loads(sc)["required"]


def test_extract_json_strips_fences_and_preamble():
    assert _extract_json('```json\n{"a":1}\n```') == '{"a":1}'
    assert _extract_json('Sure! {"a":1}') == '{"a":1}'
