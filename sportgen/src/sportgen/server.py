"""FastAPI surface for the Stillwatch frontend.

  POST /jobs            start a generation -> {id}; body = Constraints + optional "engine": "fast"|"best"
  GET  /jobs/{id}       {status: queued|running|done|error, stage, elapsed_s, result?, error?}
  POST /generate        synchronous variant (fast engine only; best takes minutes and would time out proxies)
  POST /remix           {constraints, sport, instruction} -> Sport
  GET  /triggers        trigger -> tracker counter keys, so the UI can score live
  GET  /health

Jobs live in process memory: fine for one Render instance and a hackathon demo. Generations take ~1 min (fast)
to ~5-8 min (best), so the frontend polls /jobs/{id} every few seconds and shows the stage.
"""

import asyncio
import time
import uuid
from typing import Literal, get_args

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .generator import generate, remix
from .models import TRIGGER_COUNTERS, Constraints, Sport, SportResult, Trigger
from .speech import router as speech_router

app = FastAPI(title="sportgen", version="0.2.0")
app.include_router(speech_router)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins.split(","), allow_methods=["*"],
                   allow_headers=["*"])

Engine = Literal["fast", "best"]


class JobRequest(Constraints):
    engine: Engine = "fast"


class RemixRequest(BaseModel):
    constraints: Constraints
    sport: Sport
    instruction: str
    engine: Engine = "fast"


class Job(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "error"] = "queued"
    stage: str = "queued"
    engine: Engine
    started: float
    result: SportResult | None = None
    error: str | None = None

    @property
    def elapsed_s(self) -> float:
        return round(time.time() - self.started, 1)


JOBS: dict[str, Job] = {}
_lock = asyncio.Semaphore(2)  # free-tier rate limits: at most two generations in flight


def _model_for(engine: Engine) -> tuple[str, str, bool]:
    if engine == "fast":
        return settings.fast_model, settings.fast_api_key or settings.api_key, False
    return settings.model, settings.api_key, settings.think


async def _run(job: Job, c: Constraints):
    async with _lock:
        job.status, job.stage = "running", "inventing candidates"
        model, key, think = _model_for(job.engine)
        try:
            # settings are process-global; the semaphore keeps concurrent jobs from racing on different engines
            # only when they agree. Good enough for a demo; a per-call client would be the production fix.
            settings.model, settings.api_key, settings.think = model, key, think
            from . import llm
            llm.get_client.cache_clear()
            job.result = await generate(c)
            job.status, job.stage = "done", "done"
        except Exception as e:
            job.status, job.stage, job.error = "error", "failed", f"{type(e).__name__}: {str(e)[:300]}"


@app.post("/jobs")
async def create_job(req: JobRequest):
    job = Job(id=uuid.uuid4().hex[:10], engine=req.engine, started=time.time())
    JOBS[job.id] = job
    asyncio.create_task(_run(job, Constraints(**req.model_dump(exclude={"engine"}))))
    return {"id": job.id, "engine": job.engine}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "unknown job")
    return {**job.model_dump(), "elapsed_s": job.elapsed_s}


@app.post("/generate", response_model=SportResult)
async def generate_sync(c: Constraints):
    settings.use_fast()
    try:
        return await generate(c)
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@app.post("/remix", response_model=Sport)
async def remix_ep(req: RemixRequest):
    model, key, think = _model_for(req.engine)
    settings.model, settings.api_key, settings.think = model, key, think
    from . import llm
    llm.get_client.cache_clear()
    return await remix(req.constraints, req.sport, req.instruction)


@app.get("/triggers")
def triggers() -> dict[str, list[str]]:
    return {t: list(TRIGGER_COUNTERS[t]) for t in get_args(Trigger)}


@app.get("/health")
def health():
    return {"ok": True, "jobs": len(JOBS)}
