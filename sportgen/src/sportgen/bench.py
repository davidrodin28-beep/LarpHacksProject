"""sportgen --bench m1,m2 [--judge m]: same constraint sets through each model, scored by ONE fixed judge.

Self-judging (the default pipeline) is fine for picking the best of a batch but not for comparing models:
a stricter model lowers its own score. Here every winner is re-scored by the judge model in a single call per
constraint set, so the numbers are comparable. Fit violations and failed candidates are counted in code.
"""

import asyncio
import time

from . import prompts as P
from .config import settings
from .generator import critique, generate
from .models import Constraints, fit_violations

SETS = [
    Constraints(players="3v3", space="half gym", minutes=15, equipment=["1 soft ball", "6 cones"], audience="kids 10-12"),
    Constraints(players="4v4", space="tennis court", minutes=12, equipment=["2 pickleball paddles", "1 foam ball"], audience="teens"),
    Constraints(players="6 free-for-all", space="backyard", minutes=10, equipment=["none"], intensity="high", audience="adults party"),
    Constraints(players="2v2", space="living room", minutes=8, equipment=["4 balloons"], intensity="low", audience="family"),
    Constraints(players="8-12", space="parking lot", minutes=20, equipment=["1 frisbee", "8 cones"], audience="college students"),
]


async def run(models: list[str], judge: str, sets: list[Constraints] = SETS) -> list[dict]:
    rows = {m: {"model": m, "secs": 0.0, "fit_viol": 0, "errors": 0, "judge": []} for m in models}
    winners: list[dict[str, object]] = []  # per set: {model: Sport}
    for c in sets:
        got = {}
        for m in models:
            settings.model = m
            t = time.perf_counter()
            try:
                res = await generate(c)
                got[m] = res.sport
                rows[m]["fit_viol"] += len(fit_violations(res.sport, c))
            except Exception as e:
                rows[m]["errors"] += 1
                print(f"  [{m}] {c.players}/{c.space}: {type(e).__name__}: {str(e)[:120]}")
            rows[m]["secs"] += time.perf_counter() - t
        winners.append(got)
        if got:
            settings.model = judge
            names = list(got)
            crits = await critique(c.render(), [got[n] for n in names])
            for cr in crits:
                rows[names[cr.index]]["judge"].append(cr.scores.total)
    out = []
    for r in rows.values():
        j = r["judge"]
        out.append({**r, "judge": round(sum(j) / len(j), 1) if j else None, "secs": round(r["secs"] / len(sets), 1)})
    return out


def main(models: list[str], judge: str | None):
    judge = judge or models[0]
    rows = asyncio.run(run(models, judge))
    print(f"\n  judge: {judge}   ({len(SETS)} constraint sets)\n")
    print(f"  {'model':48} {'judge/30':>8} {'fit viol':>8} {'errors':>6} {'avg s':>7}")
    for r in sorted(rows, key=lambda r: -(r["judge"] or 0)):
        print(f"  {r['model']:48} {str(r['judge']):>8} {r['fit_viol']:>8} {r['errors']:>6} {r['secs']:>7}")
