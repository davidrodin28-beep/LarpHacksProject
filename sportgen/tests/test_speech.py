"""Speech routing and provider failures, without paid API calls."""
import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from sportgen import speech as S


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(S.router)
    app.dependency_overrides[S.require_user] = lambda: "test-user"
    monkeypatch.setattr(S.settings, "elevenlabs_api_key", "private-test-key")
    monkeypatch.setattr(S.settings, "elevenlabs_voice_id", "test-voice")
    S._usage.clear()
    S._cache.clear()
    with TestClient(app) as client:
        yield client


def provider(monkeypatch, response=None, error=None):
    calls = []

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, **kwargs):
            calls.append((url, kwargs))
            if error:
                raise error
            return response

    monkeypatch.setattr(S.httpx, "AsyncClient", FakeClient)
    return calls


def test_voice_requires_authentication():
    app = FastAPI()
    app.include_router(S.router)
    with TestClient(app) as c:
        assert c.post("/speech", json={"text": "Get ready."}).status_code == 401


@pytest.mark.asyncio
async def test_auth_rejects_invalid_supabase_session(monkeypatch):
    monkeypatch.setattr(S.settings, "supabase_url", "https://project.supabase.co")
    monkeypatch.setattr(S.settings, "supabase_publishable_key", "sb_publishable_test")
    calls = []

    class AuthClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, **kwargs):
            calls.append((url, kwargs))
            return httpx.Response(401)

    monkeypatch.setattr(S.httpx, "AsyncClient", AuthClient)
    with pytest.raises(S.HTTPException) as error:
        await S.require_user(S.HTTPAuthorizationCredentials(scheme="Bearer", credentials="expired"))
    assert error.value.status_code == 401
    assert calls[0][0] == "https://project.supabase.co/auth/v1/user"
    assert calls[0][1]["headers"]["Authorization"] == "Bearer expired"


def test_voice_returns_mp3_and_caches_repeat_cues(client, monkeypatch):
    calls = provider(monkeypatch, httpx.Response(200, content=b"mp3-data", headers={"content-type": "audio/mpeg"}))
    for _ in range(2):
        response = client.post("/speech", json={"text": "Get ready."})
        assert response.status_code == 200
        assert response.content == b"mp3-data"
        assert response.headers["content-type"] == "audio/mpeg"
        assert response.headers["cache-control"] == "no-store"
        assert b"private-test-key" not in response.content
    assert len(calls) == 1
    url, options = calls[0]
    assert url == "https://api.elevenlabs.io/v1/text-to-speech/test-voice"
    assert options["headers"]["xi-api-key"] == "private-test-key"
    assert options["json"]["text"] == "Get ready."


def test_voice_reports_missing_configuration(client, monkeypatch):
    monkeypatch.setattr(S.settings, "elevenlabs_api_key", "")
    assert client.post("/speech", json={"text": "Get ready."}).status_code == 503


@pytest.mark.parametrize("text", ["", "   ", "x" * 3001])
def test_voice_rejects_invalid_text(client, text):
    assert client.post("/speech", json={"text": text}).status_code == 422


@pytest.mark.parametrize("status,expected", [(401, 502), (429, 429), (500, 502)])
def test_voice_does_not_expose_provider_errors(client, monkeypatch, status, expected):
    provider(monkeypatch, httpx.Response(status, text="private-test-key provider internals"))
    response = client.post("/speech", json={"text": "Get ready."})
    assert response.status_code == expected
    assert "private-test-key" not in response.text


def test_voice_handles_network_failure(client, monkeypatch):
    provider(monkeypatch, error=httpx.ConnectError("private-test-key"))
    response = client.post("/speech", json={"text": "Get ready."})
    assert response.status_code == 502
    assert "private-test-key" not in response.text


def test_voice_limits_requests_per_user(client, monkeypatch):
    provider(monkeypatch, httpx.Response(200, content=b"mp3", headers={"content-type": "audio/mpeg"}))
    for _ in range(20):
        assert client.post("/speech", json={"text": "Get ready."}).status_code == 200
    assert client.post("/speech", json={"text": "Get ready."}).status_code == 429
