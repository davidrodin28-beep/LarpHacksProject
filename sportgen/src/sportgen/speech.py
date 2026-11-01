"""Authenticated ElevenLabs proxy. Credentials never enter the static build."""

import asyncio
import time
from collections import OrderedDict
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, StringConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

from .config import _ROOT_ENV


class SpeechSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(_ROOT_ENV, ".env"), extra="ignore")
    elevenlabs_api_key: str = ""
    elevenlabs_voice_id: str = "JBFqnCBsd6RMkjVDRZzb"
    elevenlabs_model_id: str = "eleven_flash_v2_5"
    supabase_url: str = ""
    supabase_publishable_key: str = ""


settings = SpeechSettings()
router = APIRouter()
bearer = HTTPBearer(auto_error=False)
_slots = asyncio.Semaphore(2)
_usage: dict[str, tuple[float, int, int]] = {}
_cache: OrderedDict[tuple[str, str, str], bytes] = OrderedDict()
_CACHE_BYTES = 16 * 1024 * 1024


class SpeechRequest(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True)] = Field(min_length=1, max_length=3000)


async def require_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if not credentials:
        raise HTTPException(401, "Log in to use spoken instructions.")
    if not settings.supabase_url or not settings.supabase_publishable_key:
        raise HTTPException(503, "Voice authentication is not configured on the server.")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{settings.supabase_url.rstrip('/')}/auth/v1/user", headers={
                "apikey": settings.supabase_publishable_key,
                "Authorization": f"Bearer {credentials.credentials}",
            })
        if response.status_code in (401, 403):
            raise HTTPException(401, "Your session expired. Log in again to use spoken instructions.")
        if response.status_code != 200:
            raise HTTPException(503, "Unable to verify your voice session. Try again shortly.")
        user_id = response.json().get("id")
        if not isinstance(user_id, str) or not user_id:
            raise HTTPException(401, "Log in to use spoken instructions.")
        return user_id
    except (httpx.HTTPError, ValueError):
        raise HTTPException(503, "Unable to verify your voice session. Try again shortly.") from None


def _limit(user_id: str, characters: int) -> None:
    now = time.monotonic()
    for key, (start, _, _) in list(_usage.items()):
        if now - start >= 60:
            del _usage[key]
    start, calls, total = _usage.get(user_id, (now, 0, 0))
    if calls >= 20 or total + characters > 6000 or (user_id not in _usage and len(_usage) >= 2048):
        raise HTTPException(429, "Too many voice requests. Wait a minute and try again.")
    _usage[user_id] = (start, calls + 1, total + characters)


@router.post("/speech")
async def speech(request: SpeechRequest, user_id: str = Depends(require_user)):
    if not settings.elevenlabs_api_key:
        raise HTTPException(503, "Spoken instructions are not configured yet. Ask the site owner to enable voice.")
    _limit(user_id, len(request.text))
    key = (settings.elevenlabs_voice_id, settings.elevenlabs_model_id, request.text)
    async with _slots:
        audio = _cache.get(key)
        if audio is None:
            try:
                async with httpx.AsyncClient(timeout=45) as client:
                    response = await client.post(
                        f"https://api.elevenlabs.io/v1/text-to-speech/{settings.elevenlabs_voice_id}",
                        params={"output_format": "mp3_44100_128"},
                        headers={"xi-api-key": settings.elevenlabs_api_key, "Accept": "audio/mpeg"},
                        json={"text": request.text, "model_id": settings.elevenlabs_model_id},
                    )
                if response.status_code == 429:
                    raise HTTPException(429, "The voice service is busy or out of credits. Try again later.")
                if response.status_code != 200 or not response.content or not response.headers.get("content-type", "").startswith("audio/"):
                    raise HTTPException(502, "Unable to generate spoken instructions. Please try again.")
                audio = response.content
            except httpx.HTTPError:
                raise HTTPException(502, "Unable to reach the voice service. Please try again.") from None
            if len(audio) <= _CACHE_BYTES:
                while _cache and (len(_cache) >= 64 or sum(map(len, _cache.values())) + len(audio) > _CACHE_BYTES):
                    _cache.popitem(last=False)
                _cache[key] = audio
        if key in _cache:
            _cache.move_to_end(key)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})
