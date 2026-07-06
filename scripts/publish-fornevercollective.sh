#!/usr/bin/env bash
# Sync qbpm → fornevercollective/Qbpm and push (GitHub Pages at /Qbpm/)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/Qbpm"

echo "→ Syncing source into ${DEST}"

mkdir -p "$DEST/deploy" "$DEST/graphs" "$DEST/scripts" "$DEST/.github/workflows"

rsync -aL --delete \
  --exclude '.git' \
  "$ROOT/web/" "$DEST/web/"

rsync -a "$ROOT/graphs/" "$DEST/graphs/"
cp "$ROOT/deploy/build-static.sh" "$DEST/deploy/build-static.sh"
cp "$ROOT/scripts/publish-fornevercollective.sh" "$DEST/scripts/publish-fornevercollective.sh"
chmod +x "$DEST/deploy/build-static.sh" "$DEST/scripts/publish-fornevercollective.sh"

# Workflow for fornevercollective Pages
cat > "$DEST/.github/workflows/deploy-pages.yml" <<'YAML'
name: Deploy Qbpm to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - name: Build static shell
        run: chmod +x deploy/build-static.sh && ./deploy/build-static.sh Qbpm _site

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

      - id: deployment
        uses: actions/deploy-pages@v4
YAML

# README
cat > "$DEST/README.md" <<'MD'
# Qbpm

**Quantum BPM — Music Collab** · spatial node graph · live jam · mass collaboration

Live: **https://fornevercollective.github.io/Qbpm/**

Static shell (canvas, music lab, dock UI). Full API stack: [qbitOS/qbpm](https://github.com/qbitOS/qbpm) · `./start.sh` on port 8796.

## Deploy

1. **Settings → Pages → Source:** GitHub Actions
2. Push to `main` — workflow builds with base path `/Qbpm/`

## Sync from qbitOS/qbpm

```bash
./scripts/publish-fornevercollective.sh
cd Qbpm && git add -A && git commit -m "sync pages" && git push
```

Apache-2.0
MD

cd "$DEST"
if git rev-parse --git-dir >/dev/null 2>&1; then
  git add -A
  if git diff --staged --quiet; then
    echo "No changes to commit in Qbpm"
  else
    git commit -m "Sync qbpm static shell for GitHub Pages (/Qbpm/)"
    git push origin main
    echo "Pushed to https://github.com/fornevercollective/Qbpm"
  fi
else
  echo "Qbpm/.git not found — init or clone fornevercollective/Qbpm first"
fi