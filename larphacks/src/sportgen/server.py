"""FastAPI surface for the frontend / motion tracker.

  POST /generate   Constraints -> SportResult (winner + critique + alternatives)
  POST /remix      {constraints, sport, instruction} -> Sport
  GET  /triggers   the motion vocabulary the tracker must implement
"""

from typing import get_args

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .generator import generate, remix
from .models import Constraints, Sport, SportResult, Trigger

app = FastAPI(title="sportgen", version="0.1.0")


class RemixRequest(BaseModel):
    constraints: Constraints
    sport: Sport
    instruction: str


@app.post("/generate", response_model=SportResult)
async def generate_ep(c: Constraints):
    try:
        return await generate(c)
    except RuntimeError as e:
        raise HTTPException(502, str(e))


@app.post("/remix", response_model=Sport)
async def remix_ep(req: RemixRequest):
    return await remix(req.constraints, req.sport, req.instruction)


@app.get("/triggers")
def triggers() -> list[str]:
    return list(get_args(Trigger))


@app.get("/health")
def health():
    return {"ok": True}
