#!/usr/bin/env bash
# Sync qbpm → fornevercollective/Qbpm and push (GitHub Pages at /Qbpm/)
# Local: uses Qbpm/ submodule clone
# CI:    FORNEVER_DEPLOY_TOKEN clones into /tmp/Qbpm-forge
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN="${FORNEVER_DEPLOY_TOKEN:-}"
DEST="${FORGE_DEST:-}"

if [ -z "$TOKEN" ] && [ ! -d "$ROOT/Qbpm/.git" ]; then
  echo "Skip forge sync — set FORNEVER_DEPLOY_TOKEN or clone Qbpm/ locally"
  exit 0
fi

if [ -z "$DEST" ]; then
  if [ -n "$TOKEN" ]; then
    DEST="/tmp/Qbpm-forge"
    rm -rf "$DEST"
    git clone --depth 1 "https://x-access-token:${TOKEN}@github.com/fornevercollective/Qbpm.git" "$DEST"
  else
    DEST="$ROOT/Qbpm"
  fi
fi

echo "→ Syncing source into ${DEST}"

mkdir -p "$DEST/deploy" "$DEST/deploy/variants" "$DEST/graphs" "$DEST/scripts" "$DEST/.github/workflows"

rsync -aL --delete \
  --exclude '.git' \
  "$ROOT/web/" "$DEST/web/"

rsync -a "$ROOT/graphs/" "$DEST/graphs/"
rsync -a "$ROOT/deploy/variants/" "$DEST/deploy/variants/" 2>/dev/null || true
mkdir -p "$DEST/docs/screenshots"
rsync -a "$ROOT/docs/screenshots/" "$DEST/docs/screenshots/" 2>/dev/null || true
# Drop any prior docs/ build artifacts (keep screenshots only)
if [ -d "$DEST/docs" ]; then
  find "$DEST/docs" -mindepth 1 -maxdepth 1 ! -name screenshots -exec rm -rf {} + 2>/dev/null || true
fi
cp "$ROOT/README.md" "$DEST/README.md"

echo "→ Building forge static shell for Pages (repo root)"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT
chmod +x "$ROOT/deploy/build-static.sh"
VARIANT=forge "$ROOT/deploy/build-static.sh" Qbpm "$BUILD_DIR/out"
# Publish built app at repo root so GitHub Pages (main /) serves qbpm, not README via Jekyll
rsync -aL "$BUILD_DIR/out/" "$DEST/" \
  --exclude '.git' \
  --exclude 'README.md' \
  --exclude 'web' \
  --exclude 'deploy' \
  --exclude 'graphs' \
  --exclude 'scripts' \
  --exclude '.github' \
  --exclude 'docs'
touch "$DEST/.nojekyll"
cp "$ROOT/deploy/build-static.sh" "$DEST/deploy/build-static.sh"
cp "$ROOT/scripts/publish-fornevercollective.sh" "$DEST/scripts/publish-fornevercollective.sh"
chmod +x "$DEST/deploy/build-static.sh" "$DEST/scripts/publish-fornevercollective.sh"

cat > "$DEST/.github/workflows/deploy-pages.yml" <<'YAML'
name: Deploy Qbpm to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build static shell (forge variant)
        run: chmod +x deploy/build-static.sh && VARIANT=forge ./deploy/build-static.sh Qbpm _site

      - name: Publish gh-pages branch
        uses: peaceiris/actions-gh-pages@v4
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./_site
          publish_branch: gh-pages
          commit_message: "deploy: forge Pages from ${{ github.sha }}"
YAML

printf '_site/\n' > "$DEST/.gitignore"

cd "$DEST"
if [ ! -d .git ]; then
  echo "No .git in ${DEST} — init or set FORNEVER_DEPLOY_TOKEN for CI"
  exit 1
fi

git rm -r --cached _site 2>/dev/null || true
git add -A
if git diff --staged --quiet; then
  echo "No changes to commit in fornevercollective/Qbpm"
  exit 0
fi

git config user.email "qbpm-sync@users.noreply.github.com"
git config user.name "qbpm sync"
git commit -m "Sync qbpm static shell for GitHub Pages (/Qbpm/)"
git push origin main
echo "Pushed to https://github.com/fornevercollective/Qbpm"