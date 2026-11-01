"""Typed JSON completions over any OpenAI-compatible endpoint (Gemini by default).

Accuracy ladder, best first:
  1. response_format=json_schema (Gemini, OpenAI, Groq): the server constrains decoding, invalid JSON is impossible.
  2. response_format=json_object + pydantic validation + one retry with the error fed back (vLLM/Nebius/Ollama).
We try (1) and fall back to (2) on a 400, remembering the answer for the process lifetime.
"""

import json
import re
from functools import lru_cache
from typing import Any, TypeVar

import asyncio

from openai import AsyncOpenAI, BadRequestError, NotFoundError
from pydantic import BaseModel, ValidationError

from .config import settings

T = TypeVar("T", bound=BaseModel)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.S)
_STRIP_KEYS = {"title", "default", "maxLength", "minLength", "minItems", "maxItems", "minimum", "maximum"}
_schema_mode_ok: bool | None = None  # None = untested


@lru_cache(maxsize=1)
def get_client() -> AsyncOpenAI:
    if not settings.api_key and "localhost" not in settings.base_url and "127.0.0.1" not in settings.base_url:
        raise RuntimeError("SPORTGEN_API_KEY is not set (see .env.example)")
    # Retries cover 429s from free tiers. Timeout must exceed the slowest call we make: the critic on a 550B model
    # writing five playtest narratives can take 3-4 minutes, and a timeout + retry loop silently multiplies that.
    return AsyncOpenAI(api_key=settings.api_key or "ollama", base_url=settings.base_url,
                       timeout=settings.timeout_s, max_retries=3)


async def list_models() -> list[str]:
    return sorted([m.id async for m in get_client().models.list()])


def _extract_json(text: str) -> str:
    text = _FENCE.sub("", text.strip())
    if text.startswith("{") or text.startswith("["):
        return text
    start = min((i for i in (text.find("{"), text.find("[")) if i >= 0), default=-1)
    return text[start:] if start >= 0 else text


def portable_schema(model_cls: type[BaseModel]) -> dict:
    """Pydantic schema -> the subset every provider's structured-output mode accepts.
    Drops length/size keywords (our validator coerces those anyway) and collapses `X | None` to X."""
    def clean(node: Any) -> Any:
        if isinstance(node, list):
            return [clean(n) for n in node]
        if not isinstance(node, dict):
            return node
        if "anyOf" in node:
            branches = [b for b in node["anyOf"] if b.get("type") != "null"]
            if len(branches) == 1:
                node = {**{k: v for k, v in node.items() if k != "anyOf"}, **branches[0]}
        out = {k: clean(v) for k, v in node.items() if k not in _STRIP_KEYS}
        if out.get("type") == "object" and "properties" in out:
            out["required"] = list(out["properties"])
            out["additionalProperties"] = False
        return out
    return clean(model_cls.model_json_schema())


def _response_format(model_cls: type[BaseModel]) -> dict:
    if _schema_mode_ok is False or settings.vllm_style:
        return {"type": "json_object"}
    return {"type": "json_schema",
            "json_schema": {"name": model_cls.__name__, "strict": True, "schema": portable_schema(model_cls)}}


def _extra(think: bool) -> dict | None:
    if settings.vllm_style:
        return {"chat_template_kwargs": {"enable_thinking": think}}
    if settings.is_gemini or settings.is_groq:
        return {"reasoning_effort": "medium" if think else "low"}  # Gemini 3 cannot disable thinking; low is ~fastest
    return None


async def _create(client, msgs, model_cls, think, temperature, max_tokens):
    for i in range(3):  # build.nvidia.com intermittently answers "404 page not found" on a healthy model
        try:
            return await client.chat.completions.create(
                model=settings.model, messages=msgs, temperature=temperature, max_tokens=max_tokens,
                response_format=_response_format(model_cls), extra_body=_extra(think))
        except NotFoundError as e:
            if i == 2 or "page not found" not in str(e):  # a real "model not found" is not retried
                raise
            await asyncio.sleep(2 * (i + 1))


async def complete_json(messages: list[dict], model_cls: type[T], *, think: bool = False,
                        temperature: float = 0.9, max_tokens: int = 8000) -> T:
    """max_tokens is a ceiling, not a cost: reasoning models spend part of it thinking before the JSON."""
    global _schema_mode_ok
    client = get_client()
    msgs = list(messages)
    for attempt in range(2):
        try:
            resp = await _create(client, msgs, model_cls, think, temperature, max_tokens)
        except BadRequestError:
            if _schema_mode_ok is not False and not settings.vllm_style:
                _schema_mode_ok = False  # provider rejected json_schema: degrade to json_object for the session
                continue
            raise
        if _schema_mode_ok is None and not settings.vllm_style:
            _schema_mode_ok = True
        raw = resp.choices[0].message.content or ""
        try:
            return model_cls.model_validate_json(_extract_json(raw))
        except (ValidationError, json.JSONDecodeError) as e:
            if attempt:
                raise
            msgs = msgs + [{"role": "assistant", "content": raw},
                           {"role": "user", "content": f"Invalid: {e}\nReturn corrected JSON only."}]
    raise AssertionError("unreachable")
