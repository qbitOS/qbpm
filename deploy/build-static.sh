#!/usr/bin/env bash
# Build static shell for Pages / Cloudflare / forge mirror.
#
# Usage:
#   ./deploy/build-static.sh [project-slug] [out-dir]
#   VARIANT=cloudflare ./deploy/build-static.sh
#   VARIANT=forge ./deploy/build-static.sh Qbpm _site
#
# Variants: desktop | pages | forge | cloudflare | cloud
# Config:   deploy/variants/<variant>.env

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VARIANT="${VARIANT:-}"
if [ -n "$VARIANT" ] && [ -n "${1:-}" ] && [ -z "${2:-}" ]; then
  case "$1" in
    qbpm|Qbpm) SLUG_ARG="$1"; OUT="_site" ;;
    *) SLUG_ARG=""; OUT="$1" ;;
  esac
else
  SLUG_ARG="${1:-}"
  OUT="${2:-_site}"
fi

if [ -n "$VARIANT" ] && [ -f "$ROOT/deploy/variants/${VARIANT}.env" ]; then
  # shellcheck source=/dev/null
  source "$ROOT/deploy/variants/${VARIANT}.env"
fi

if [ -n "$SLUG_ARG" ]; then
  SLUG="$SLUG_ARG"
elif [ -z "${SLUG+x}" ]; then
  SLUG=qbpm
fi
BASE="${BASE_PATH:-/${SLUG}}"
BASE="${BASE%/}"
[ -n "$BASE" ] && BASE="/${BASE#/}"

if [ "$VARIANT" = "cloudflare" ] || [ -z "$SLUG" ]; then
  BASE="/"
  PAGES_REWRITE=0
else
  BASE="/${SLUG#/}"
  PAGES_REWRITE=1
fi

echo "Building static shell → ${OUT}"
echo "  variant=${VARIANT:-pages} slug=${SLUG:-root} base=${BASE}/ origin=${ORIGIN:-auto}"

rm -rf "$OUT"
mkdir -p "$OUT/static/graphs" "$OUT/static/icons" "$OUT/static/piano"

rsync -aL --delete \
  --exclude 'index.html' \
  --exclude 'manifest.webmanifest' \
  --exclude 'sw.js' \
  "$ROOT/web/" "$OUT/static/"

cp "$ROOT/web/index.html" "$OUT/index.html"
cp "$ROOT/web/manifest.webmanifest" "$OUT/manifest.webmanifest"
cp "$ROOT/web/sw.js" "$OUT/sw.js"
cp "$ROOT/web/static-tools.json" "$OUT/static/tools.json"
cp "$ROOT/web/launch-config.json" "$OUT/static/launch-config.json"
cp "$ROOT/graphs/"*.json "$OUT/static/graphs/" 2>/dev/null || true

touch "$OUT/.nojekyll"

# Cloudflare Pages routing + headers
if [ "$VARIANT" = "cloudflare" ]; then
  cp "$ROOT/deploy/cloudflare/_redirects" "$OUT/_redirects"
  cp "$ROOT/deploy/cloudflare/_headers" "$OUT/_headers"
fi

rewrite_file() {
  local f="$1"
  [ -f "$f" ] || return 0
  if [ "$PAGES_REWRITE" = "1" ]; then
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
  fi
}

rewrite_file "$OUT/index.html"
rewrite_file "$OUT/sw.js"
cp "$OUT/index.html" "$OUT/404.html"

# Baked runtime env — pages-boot reads static/env-config.json
export VARIANT="${VARIANT:-}"
export SLUG="${SLUG:-}"
export BASE_PATH="${BASE:-}"
export ORIGIN="${ORIGIN:-}"
export DEFAULT_API_BASE="${DEFAULT_API_BASE:-}"
export STATIC_SHELL="${STATIC_SHELL:-1}"
export LAUNCH_LABEL="${LAUNCH_LABEL:-}"
python3 - "$OUT/static/env-config.json" <<PY
import json, os, sys
out = sys.argv[1]
variant = os.environ.get("VARIANT") or ("forge" if os.environ.get("SLUG") == "Qbpm" else "pages")
cfg = {
    "variant": variant,
    "label": os.environ.get("LAUNCH_LABEL") or variant,
    "origin": os.environ.get("ORIGIN") or "",
    "basePath": os.environ.get("BASE_PATH") or "/",
    "staticShell": os.environ.get("STATIC_SHELL", "1") == "1",
    "defaultApiBase": os.environ.get("DEFAULT_API_BASE") or "",
    "buildTs": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat().replace("+00:00", "Z"),
}
with open(out, "w") as f:
    json.dump(cfg, f, indent=2)
print("env-config:", json.dumps(cfg))
PY

# Manifest
MANIFEST="$OUT/manifest.webmanifest"
if [ -f "$MANIFEST" ]; then
  python3 - "$MANIFEST" "$BASE" "${ORIGIN:-}" "${VARIANT:-}" <<'PY'
import json, sys
path, base, origin, variant = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
with open(path) as f:
    m = json.load(f)
if origin:
    o = origin if origin.endswith("/") else origin + "/"
else:
    o = (
        f"https://fornevercollective.github.io{base}/"
        if base == "/Qbpm"
        else f"https://qbitos.github.io{base}/"
    )
m["start_url"] = o
m["scope"] = o
m["id"] = o
if variant == "forge" or base == "/Qbpm":
    m["name"] = "Qbpm — Quantum BPM"
    m["short_name"] = "Qbpm"
elif variant == "cloudflare":
    m["name"] = "qbpm — qbitos.ai"
    m["short_name"] = "qbpm"
for icon in m.get("icons", []):
    icon["src"] = icon["src"].replace("/static/", "./static/")
with open(path, "w") as f:
    json.dump(m, f, indent=2)
PY
fi

echo "Done: $(find "$OUT" -type f | wc -l | tr -d ' ') files in ${OUT}"