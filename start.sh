#!/usr/bin/env bash
set -euo pipefail
# Serve the built website and API together. Run scripts/build_static.py first.
cd "$(dirname "$0")"
exec python3 -m uvicorn app:app --host 0.0.0.0 --port "${PORT:-10000}"
