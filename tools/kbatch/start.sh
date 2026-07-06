#!/usr/bin/env bash
# kbatch tool — serve live-fast build (mu.eee deps via symlinks in web/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-8795}"
cd "$ROOT/web"
echo "kbatch live-fast → http://localhost:${PORT}/kbatch.html"
exec python3 -m http.server "$PORT"