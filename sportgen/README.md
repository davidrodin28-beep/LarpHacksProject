# sportgen

LLM pipeline that invents **playable, fun new sports** from your constraints. Three round-trips, ~10-20 s.
Works with any OpenAI-compatible endpoint; default is **NVIDIA Nemotron 3 Ultra 550B on build.nvidia.com**
(free, no card, ~2-5 min per generation; presets for Gemini, Groq, Ollama and Nebius in `.env.example`
with measured quality/latency):

1. **N parallel candidates** - one per twist category (asymmetry, hidden info, role swap, territory, rhythm,
   cooperation, momentum) so the batch is diverse without needing 20 samples. Thinking off, temperature 1.0.
2. **One critic call** - scores every candidate 1-5 on clarity / decisions / catch-up / novelty / safety / fit,
   names the closest existing sport, lists fixable weaknesses. Clones (>=80 % similar) and unsafe games are penalised.
3. **One refine call** - fixes the winner's weaknesses without adding rules.

Accuracy layers, cheapest first: provider-native **structured output** (`json_schema` on Gemini/OpenAI/Groq,
auto-fallback to `json_object`), pydantic validation with one error-fed retry, a **deterministic fit check**
(`models.fit_violations`: invented equipment, over-long duration) that drops unfaithful candidates before the
critic and feeds leftovers into refine, then the LLM critic.

The schema is the guardrail: every body rule must map to a trigger the motion tracker can detect
(`jump, squat, arm_raise, hold_pose, step_zone, touch_ground, spin, clap` - see `models.Trigger`).
Quality comes from `prompts.py`: a design-rules checklist, an anti-pattern list, and three hand-written gold examples.

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -e ".[dev]"
cp .env.example .env            # paste a free build.nvidia.com key (nvapi-...)
.venv/bin/sportgen --list-models   # confirm which model ids your key can reach

.venv/bin/sportgen --players 3v3 --space "half gym" --minutes 15 --equipment "1 soft ball" --equipment "6 cones" --audience "kids 10-12"
.venv/bin/sportgen ... --json   # full SportResult: winner + critique + alternatives

.venv/bin/uvicorn sportgen.server:app --reload   # POST /generate, POST /remix, GET /triggers
.venv/bin/python -m pytest -q                    # offline tests, no key needed
.venv/bin/sportgen --bench m1,m2 --judge m1      # compare models on 5 fixed constraint sets, one judge (slow)
```

## API

```
POST /generate   Constraints {players, space, minutes, equipment[], intensity, audience, notes}
                 -> {sport, critique, alternatives[]}
POST /remix      {constraints, sport, instruction: "make it harder"} -> sport
GET  /triggers   motion vocabulary the tracker must implement
```

Add a trigger: extend `Trigger` in `models.py` and mention it in `DESIGN_RULES` rule 10.
Improve quality: edit `GOLD` / `DESIGN_RULES` in `prompts.py` - that file matters more than any code.
