#!/usr/bin/env bash
set -euo pipefail
# Use the shared website/API entrypoint even when invoked from this directory.
exec bash "$(dirname "$0")/../start.sh"
