#!/usr/bin/env bash
# Start the sport engine on Render regardless of Root Directory (repo root or sportgen/).
exec uvicorn sportgen.server:app --host 0.0.0.0 --port "${PORT:-10000}"
