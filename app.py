"""Serve the sport API and the allowlisted website from the same origin."""
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from sportgen.server import app


@app.middleware("http")
async def response_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    # Revalidate assets so a new deployment cannot retain an obsolete engine URL.
    if request.url.path == "/auth-config.json":
        response.headers["Cache-Control"] = "no-store"
    else:
        # Preserve stronger API policies, including speech's private audio.
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


# Register last so /jobs, /health and the other API routes take precedence.
# Never serve the repository root: only build_static.py's allowlisted output.
app.mount("/", StaticFiles(directory=Path(__file__).resolve().parent / "dist", html=True), name="website")
