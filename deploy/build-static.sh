#!/usr/bin/env bash
# Build GitHub Pages static shell.
# Usage: ./deploy/build-static.sh [project-slug] [out-dir]
#   project-slug: qbpm (qbitOS) or Qbpm (fornevercollective) — default qbpm
#   out-dir: default _site

set -euo pipefail

SLUG="${1:-qbpm}"
OUT="${2:-_site}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="/${SLUG}"

echo "Building static shell → ${OUT} (base ${BASE}/)"

rm -rf "$OUT"
mkdir -p "$OUT/static/graphs" "$OUT/static/icons" "$OUT/static/piano"

# Static assets (everything under web/ except root index/manifest/sw).
# rsync -aL dereferences symlinks so CI never ships dangling links.
rsync -aL --delete \
  --exclude 'index.html' \
  --exclude 'manifest.webmanifest' \
  --exclude 'sw.js' \
  "$ROOT/web/" "$OUT/static/"

cp "$ROOT/web/index.html" "$OUT/index.html"
cp "$ROOT/web/manifest.webmanifest" "$OUT/manifest.webmanifest"
cp "$ROOT/web/sw.js" "$OUT/sw.js"
cp "$ROOT/web/static-tools.json" "$OUT/static/tools.json"
cp "$ROOT/graphs/"*.json "$OUT/static/graphs/" 2>/dev/null || true

touch "$OUT/.nojekyll"

# Relative paths for project pages (./static/ works for any slug)
rewrite_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  if sed --version 2>/dev/null | grep -q GNU; then
    sed -i "s|href=\"/static/|href=\"./static/|g" "$f"
    sed -i "s|src=\"/static/|src=\"./static/|g" "$f"
    sed -i "s|href=\"/manifest|href=\"./manifest|g" "$f"
    sed -i 's|register("/sw.js")|register("./sw.js")|g' "$f"
    sed -i 's|"/static/|"./static/|g' "$f"
    sed -i "s|'/static/|'./static/|g" "$f"
  else
    sed -i '' "s|href=\"/static/|href=\"./static/|g" "$f"
    sed -i '' "s|src=\"/static/|src=\"./static/|g" "$f"
    sed -i '' "s|href=\"/manifest|href=\"./manifest|g" "$f"
    sed -i '' 's|register("/sw.js")|register("./sw.js")|g' "$f"
    sed -i '' 's|"/static/|"./static/|g' "$f"
    sed -i '' "s|'/static/|'./static/|g" "$f"
  fi
}

rewrite_file "$OUT/index.html"
rewrite_file "$OUT/sw.js"

# Manifest for Pages
MANIFEST="$OUT/manifest.webmanifest"
if [ -f "$MANIFEST" ]; then
  python3 - "$MANIFEST" "$BASE" <<'PY'
import json, sys
path, base = sys.argv[1], sys.argv[2]
with open(path) as f:
    m = json.load(f)
origin = f"https://fornevercollective.github.io{base}/" if base == "/Qbpm" else f"https://qbitos.github.io{base}/"
m["start_url"] = origin
m["scope"] = origin
m["id"] = origin
m["name"] = "Qbpm — Quantum BPM" if base == "/Qbpm" else m.get("name", "qbpm")
m["short_name"] = "Qbpm" if base == "/Qbpm" else m.get("short_name", "qbpm")
for icon in m.get("icons", []):
    icon["src"] = icon["src"].replace("/static/", "./static/")
with open(path, "w") as f:
    json.dump(m, f, indent=2)
PY
fi

echo "Done: $(find "$OUT" -type f | wc -l | tr -d ' ') files in ${OUT}"