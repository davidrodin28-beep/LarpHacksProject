"""generate(): N parallel candidates (one twist category each) -> code fit check -> one critic call -> one refine call.

Three round-trips total regardless of N. Candidates run at high temperature for diversity; the critic reasons
(SPORTGEN_CRITIC_THINK) since it reads short JSON; refine is low-temperature editing. The deterministic fit check
removes candidates that invented equipment before the critic ever sees them, and feeds leftover violations into
the refine step so the winner is corrected even when every candidate slipped.
"""

import asyncio
import logging
import random

from . import prompts as P
from .config import settings
from .models import (TWISTS, Constraints, Critique, CritiqueBatch, Sport, SportResult, complexity_violations,
                     fit_violations, trigger_mismatches)
from .llm import complete_json

log = logging.getLogger(__name__)


async def _candidate(constraints: str, twist: str, i: int) -> Sport | None:
    msgs = [{"role": "system", "content": P.candidate_system(i)},
            {"role": "user", "content": P.candidate_user(constraints, twist)}]
    try:
        return await complete_json(msgs, Sport, think=settings.think, temperature=settings.candidate_temperature)
    except Exception as e:  # one bad candidate must not sink the batch
        log.warning("candidate[%s] failed: %s: %s", twist, type(e).__name__, str(e)[:300])
        return None


async def critique(constraints: str, candidates: list[Sport]) -> list[Critique]:
    msgs = [{"role": "system", "content": P.critic_system()},
            {"role": "user", "content": P.critic_user(constraints, candidates)}]
    batch = await complete_json(msgs, CritiqueBatch, think=settings.think, temperature=0.0)
    crits = batch.critiques[:len(candidates)]
    if sorted(c.index for c in crits) != list(range(len(crits))):  # model numbered 1..n or repeated: trust order
        for i, c in enumerate(crits):
            c.index = i
    return crits


async def refine(constraints: str, sport: Sport, weaknesses: list[str]) -> Sport:
    msgs = [{"role": "system", "content": P.candidate_system()},
            {"role": "user", "content": P.refine_user(constraints, sport, weaknesses)}]
    out = await complete_json(msgs, Sport, think=settings.think, temperature=0.3)
    out.twist_category = out.twist_category or sport.twist_category
    return out


async def generate(constraints: Constraints, n: int | None = None, twists: list[str] | None = None) -> SportResult:
    n = n or settings.candidates
    twists = twists or random.sample(TWISTS, k=min(n, len(TWISTS)))
    ctext = constraints.render()
    cands = [c for c in await asyncio.gather(*(_candidate(ctext, t, i) for i, t in enumerate(twists))) if c]
    if not cands:
        raise RuntimeError("no valid candidates generated")

    def code_checks(s: Sport) -> list[str]:
        return fit_violations(s, constraints) + complexity_violations(s, constraints) + trigger_mismatches(s)

    # Prefer faithful, simple candidates, but always give the critic at least 3 to choose from: a slightly
    # over-budget sport with a great twist beats a clean dull one once refine trims it.
    checked = sorted(((c, code_checks(c)) for c in cands), key=lambda t: len(t[1]))
    keep = max(3, sum(1 for _, v in checked if not v))
    for c, v in checked[keep:]:
        log.info("dropping %s: %s", c.name, v)
    cands = [c for c, _ in checked[:keep]]
    crits = await critique(ctext, cands)
    if not crits:
        raise RuntimeError("critic returned nothing usable")
    best = max(crits, key=lambda c: c.final)
    chosen = cands[best.index]
    winner = await refine(ctext, chosen, best.fixes + code_checks(chosen))
    if left := code_checks(winner):  # refine slipped: one more targeted pass, still cheap
        winner = await refine(ctext, winner, left)
    alts = [cands[c.index] for c in sorted(crits, key=lambda c: -c.final) if c.index != best.index]

    # Verify the edit: re-judge the shipped sport. Refine occasionally "fixes" a weakness by breaking something
    # else; if the post-refine score is worse than the candidate's, ship the candidate instead.
    final = None
    if settings.verify:
        try:
            final = (await critique(ctext, [winner]))[0]
            if final.final < best.final - 2 and not code_checks(chosen):
                log.info("refine regressed %s (%.0f -> %.0f); keeping pre-refine candidate", winner.name, best.final, final.final)
                winner, final = chosen, best
        except Exception as e:  # verification is a bonus, never a failure
            log.warning("verify skipped: %s", e)
    return SportResult(sport=winner, critique=best, final_critique=final, alternatives=alts)


async def remix(constraints: Constraints, sport: Sport, instruction: str) -> Sport:
    """'make it harder', 'swap the twist', 'no equipment' - one cheap edit call."""
    msgs = [{"role": "system", "content": P.candidate_system()},
            {"role": "user", "content": P.remix_user(constraints.render(), sport, instruction)}]
    out = await complete_json(msgs, Sport, think=settings.think, temperature=0.5)
    out.twist_category = out.twist_category or sport.twist_category
    return out
