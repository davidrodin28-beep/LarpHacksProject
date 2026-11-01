"""Verify that the combined host serves the UI without shadowing API routes."""
import importlib.util
from pathlib import Path
from unittest.mock import patch

from fastapi.staticfiles import StaticFiles
from fastapi.testclient import TestClient

from sportgen.server import app


def load_file(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_combined_host_serves_website_auth_and_speech(tmp_path, monkeypatch):
    root = Path(__file__).resolve().parents[2]
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    output = load_file("static_build", root / "scripts/build_static.py").build(tmp_path / "dist")
    routes, middleware = list(app.router.routes), list(app.user_middleware)
    overrides = dict(app.dependency_overrides)
    try:
        with patch("fastapi.staticfiles.StaticFiles", return_value=StaticFiles(directory=output, html=True)):
            combined = load_file("combined_app", root / "app.py")
        with TestClient(combined.app) as client:
            assert client.get("/").status_code == 200
            assert client.get("/reset-password.html").status_code == 200
            assert client.get("/src/coaching/narration.js").status_code == 200
            assert client.get("/auth-config.json").headers["cache-control"] == "no-store"
            assert client.get("/health").json()["ok"] is True
            assert "punch" in client.get("/triggers").json()
            assert client.post("/speech", json={"text": "Get ready."}).status_code == 401
            for path in ("/.env", "/app.py", "/sportgen/src/sportgen/speech.py"):
                assert client.get(path).status_code == 404
            # A successful speech response must keep its explicit no-store policy.
            from sportgen import speech as S
            monkeypatch.setattr(S.settings, "elevenlabs_api_key", "test-key")
            monkeypatch.setattr(S, "_usage", {})
            monkeypatch.setitem(S._cache, (S.settings.elevenlabs_voice_id, S.settings.elevenlabs_model_id, "Get ready."), b"mp3-data")
            app.dependency_overrides[S.require_user] = lambda: "test-user"
            response = client.post("/speech", json={"text": "Get ready."})
            assert response.content == b"mp3-data"
            assert response.headers["cache-control"] == "no-store"
    finally:
        app.router.routes[:] = routes
        app.user_middleware[:] = middleware
        app.dependency_overrides.clear()
        app.dependency_overrides.update(overrides)
        app.middleware_stack = None
