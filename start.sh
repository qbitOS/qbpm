#!/usr/bin/env bash
# qbpm — spatial JSON node runtime (Python/JAX up, CUDA down)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if command -v uv >/dev/null 2>&1; then
  uv sync --extra dev
  exec uv run qbpm
fi

python3 -m pip install -e ".[dev]" -q
exec python3 -m qbpm.api