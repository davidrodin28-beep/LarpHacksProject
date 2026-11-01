"""Pipeline logic with the LLM mocked: fit filtering, critic index repair, refine loop, alternatives."""

import pytest

from sportgen import generator as G
from sportgen import prompts as P
from sportgen.models import Constraints, Critique, CritiqueBatch, Scores, Sport


def _sport(name, equipment, duration="Three 60-second rounds"):
    return P.GOLD[0].model_copy(update={"name": name, "equipment": equipment, "duration": duration})


class _Calls(list):
    verify_novelty = 5


@pytest.fixture
def fake_llm(monkeypatch):
    calls = _Calls()

    async def complete_json(messages, model_cls, **kw):
        calls.append(model_cls.__name__)
        user = messages[-1]["content"]
        if model_cls is Sport:
            if "CURRENT SPORT" in user:  # refine/remix: return a fixed, clean sport
                return _sport("Refined", ["none"])
            twist = user.split("Twist category to use: ")[1].split(" ")[0]
            return {"asymmetry": _sport("Clean A", ["none"]),
                    "rhythm": _sport("Dirty", ["1 phone playing a beat"]),
                    "forbidden": _sport("Clean B", ["none"])}[twist]
        if model_cls is CritiqueBatch:  # 1-based indices on purpose, B scores higher
            mk = lambda i, nov: Critique(index=i, scores=Scores(clarity=4, simplicity=4, decisions=4, catch_up=4, novelty=nov, safety=5, fit=4),
                                         closest_existing_sport="x", similarity_pct=30, weaknesses=["tighten scoring"])
            if user.count("CANDIDATE ") == 1:  # verify pass on the refined sport
                return CritiqueBatch(critiques=[mk(0, calls.verify_novelty)])
            return CritiqueBatch(critiques=[mk(1, 3), mk(2, 5)])
        raise AssertionError(model_cls)

    monkeypatch.setattr(G, "complete_json", complete_json)
    return calls


async def test_generate_filters_unfaithful_and_repairs_indices(fake_llm):
    c = Constraints(players="solo", equipment=["none"], minutes=3)
    res = await G.generate(c, twists=["asymmetry", "rhythm", "forbidden"])
    assert res.sport.name == "Refined"
    assert [a.name for a in res.alternatives] == ["Clean A"]  # Dirty dropped by fit check, B won
    assert res.critique.index == 1 and res.critique.scores.novelty == 5
    assert res.final_critique is not None and res.final_critique.scores.total == res.critique.scores.total
    assert fake_llm == ["Sport"] * 3 + ["CritiqueBatch", "Sport", "CritiqueBatch"]  # candidates, critic, refine, verify


async def test_generate_keeps_candidate_when_refine_regresses(fake_llm):
    fake_llm.verify_novelty = 1  # refined sport judged much worse (novelty 5 -> 1, plus the <=2 penalty)
    c = Constraints(players="solo", equipment=["none"], minutes=3)
    res = await G.generate(c, twists=["asymmetry", "rhythm", "forbidden"])
    assert res.sport.name == "Clean B" and res.final_critique is res.critique


async def test_generate_keeps_dirty_candidates_when_nothing_is_clean(fake_llm):
    c = Constraints(players="solo", equipment=["none"], minutes=3)
    res = await G.generate(c, twists=["asymmetry", "rhythm"])
    assert res.sport.name == "Refined" and len(res.alternatives) == 1
