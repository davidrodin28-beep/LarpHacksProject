"""sportgen                         interactive survey, then generate
sportgen --players 3v3 --space gym --minutes 15 --equipment "1 soft ball" --equipment "4 cones" [--json]"""

import argparse
import asyncio
import json
import logging
import sys
import threading
import time

from .config import settings
from .generator import generate
from .models import MAX_SCORE, Constraints, Sport, complexity


def render(s: Sport) -> str:
    moves = "\n".join(f"    - {m.name} [{m.trigger}]: {m.rule}" for m in s.moves)
    fouls = "\n".join(f"    - {f}" for f in s.fouls)
    return (f"\n  {s.name.upper()} - {s.tagline}\n\n  Objective: {s.objective}\n  Players:   {s.players}\n"
            f"  Equipment: {', '.join(s.equipment)}\n  Field:     {s.field}\n  Moves:\n{moves}\n"
            f"  Scoring:   {s.scoring}\n  Fouls:\n{fouls}\n  Twist:     {s.twist}\n  Catch-up:  {s.catch_up}\n"
            f"  Duration:  {s.duration}\n  Start:     {s.first_30_seconds}\n")


def _ask(q: str, default: str, choices: list[str] | None = None) -> str:
    hint = f" [{'/'.join(choices)}]" if choices else ""
    while True:
        v = input(f"  {q}{hint} ({default}): ").strip() or default
        if not choices or v.lower() in choices:
            return v.lower() if choices else v
        print(f"    pick one of: {', '.join(choices)}")


def pick_model() -> None:
    """'fast' = Nemotron 3.5 Lightning (~1 min), 'best' = current default model unchanged (Ultra, ~2-5 min)."""
    if _ask("Which engine? fast = Nemotron 3.5 Lightning (~1 min), best = Nemotron 3 Ultra (~2-5 min)",
            "best", ["fast", "best"]) == "fast":
        settings.use_fast()


def survey() -> Constraints:
    """The questions a new user answers. Enter accepts the default shown in parentheses."""
    print("\n  Let's invent a sport. 9 quick questions - press Enter to accept a default.\n")
    pick_model()
    players = _ask("How many players, and how are they grouped? e.g. 3v3, 2v2, 6 free-for-all, 1", "4-6")
    space = _ask("Where will you play? e.g. gym, backyard, living room, tennis court, hallway", "gym")
    while True:
        m = _ask("How many minutes do you have?", "15")
        if m.isdigit() and 0 < int(m) <= 180:
            break
        print("    enter a number of minutes, 1-180")
    eq = _ask("What equipment is available? comma-separated, or 'none'. e.g. 1 soft ball, 4 cones", "1 soft ball")
    equipment = [e.strip() for e in eq.split(",") if e.strip()] or ["none"]
    intensity = _ask("How physical should it be?", "medium", ["low", "medium", "high"])
    audience = _ask("Who is playing? e.g. kids 10-12, teens, adults, family, party", "adults")
    depth = _ask("How many rules? simple = explain in 30 s, deep = tactical", "simple", ["simple", "normal", "deep"])
    notes = _ask("Anything else? injuries, noise limits, a vibe, a theme (optional)", "")
    c = Constraints(players=players, space=space, minutes=int(m), equipment=equipment,
                    intensity=intensity, audience=audience, depth=depth, notes=notes)
    print(f"\n  Got it -> {c.render()}\n")
    return c


def _spinner(stop: threading.Event):
    frames, i, t0 = "|/-\\", 0, time.perf_counter()
    stages = [(0, "inventing 5 candidate sports"), (60, "judging candidates"), (120, "refining the winner")]
    while not stop.is_set():
        el = time.perf_counter() - t0
        stage = next(s for t, s in reversed(stages) if el >= t)
        sys.stderr.write(f"\r  {frames[i % 4]} {stage}... {el:4.0f}s  ")
        sys.stderr.flush()
        i += 1
        stop.wait(0.25)
    sys.stderr.write("\r" + " " * 60 + "\r")


def main(argv=None):
    ap = argparse.ArgumentParser(prog="sportgen", description="Run with no arguments for the interactive survey.")
    ap.add_argument("--players")
    ap.add_argument("--space")
    ap.add_argument("--minutes", type=int)
    ap.add_argument("--equipment", action="append")
    ap.add_argument("--intensity", choices=["low", "medium", "high"])
    ap.add_argument("--audience")
    ap.add_argument("--depth", choices=["simple", "normal", "deep"], help="rule complexity (default simple)")
    ap.add_argument("--notes")
    ap.add_argument("--fast", action="store_true", help="use Nemotron 3.5 Lightning (~1 min) instead of Ultra")
    ap.add_argument("-n", type=int, default=None, help="candidate count")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--list-models", action="store_true", help="show model ids your key can reach, then exit")
    ap.add_argument("--bench", metavar="M1,M2", help="compare models on fixed constraint sets with one judge")
    ap.add_argument("--judge", metavar="MODEL", help="judge model for --bench (default: first model)")
    a = ap.parse_args(argv)
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    if a.list_models:
        from .llm import list_models
        print("\n".join(asyncio.run(list_models())))
        return
    if a.bench:
        from .bench import main as bench_main
        bench_main([m.strip() for m in a.bench.split(",") if m.strip()], a.judge)
        return

    if a.fast:
        settings.use_fast()
    given = {k: v for k, v in vars(a).items() if k in Constraints.model_fields and v is not None}
    c = Constraints(**given) if given else survey()
    print(f"  engine: {settings.model}", file=sys.stderr)

    stop = threading.Event()
    spin = threading.Thread(target=_spinner, args=(stop,), daemon=True)
    if not a.json and sys.stderr.isatty():
        spin.start()
    t0 = time.perf_counter()
    try:
        res = asyncio.run(generate(c, n=a.n))
    finally:
        stop.set()
        if spin.is_alive():
            spin.join()
    dt = time.perf_counter() - t0
    if a.json:
        print(res.model_dump_json(indent=2))
        return
    print(render(res.sport))
    cr = res.final_critique or res.critique
    sc = cr.scores
    mv, fl, cond = complexity(res.sport)
    label = "judge" if res.final_critique else "judge (pre-refine)"
    print(f"  {label}: {sc.total}/{MAX_SCORE}  (clarity {sc.clarity} simplicity {sc.simplicity} decisions {sc.decisions} "
          f"catch-up {sc.catch_up} novelty {sc.novelty} safety {sc.safety} fit {sc.fit}) closest: "
          f"{cr.closest_existing_sport} {cr.similarity_pct}%")
    if res.final_critique:
        print(f"  refine: {res.critique.scores.total} -> {sc.total}, fixed {len(res.critique.fixes)} findings"
              + (f"; still open: {'; '.join(cr.fixes)[:160]}" if cr.fixes else ""))
    print(f"  complexity: {mv} moves, {fl} fouls, {cond} conditional clauses")
    print(f"  alternatives: {', '.join(s.name for s in res.alternatives) or '-'}")
    print(f"  {dt:.1f}s", file=sys.stderr)


if __name__ == "__main__":
    main()
