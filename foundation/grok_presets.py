"""Imagine preset slug loader for qbpm."""

from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from foundation.grok_paths import IMAGINE_REPO, PRESET_CACHE, PRESETS_MANIFEST

IMAGINE_RAW = "https://raw.githubusercontent.com/fornevercollective/imagine/main"


def load_manifest() -> dict:
    if PRESETS_MANIFEST.exists():
        return json.loads(PRESETS_MANIFEST.read_text(encoding="utf-8"))
    return {"featured_templates": [], "groups": {}}


def all_slugs() -> list[str]:
    manifest = load_manifest()
    slugs: list[str] = []
    slugs.extend(manifest.get("featured_templates", []))
    for group in manifest.get("groups", {}).values():
        slugs.extend(group)
    seen: set[str] = set()
    out: list[str] = []
    for slug in slugs:
        if slug not in seen:
            seen.add(slug)
            out.append(slug)
    return out


def slug_prompt(slug: str) -> str | None:
    if IMAGINE_REPO.exists():
        local = IMAGINE_REPO / "style_presets" / slug / "prompt.txt"
        if local.exists():
            return local.read_text(encoding="utf-8").strip()
    cached = PRESET_CACHE / f"{slug}.txt"
    if cached.exists():
        return cached.read_text(encoding="utf-8").strip()
    try:
        url = f"{IMAGINE_RAW}/style_presets/{slug}/prompt.txt"
        with urllib.request.urlopen(url, timeout=12) as resp:
            text = resp.read().decode("utf-8").strip()
        PRESET_CACHE.mkdir(parents=True, exist_ok=True)
        cached.write_text(text, encoding="utf-8")
        return text
    except Exception:
        return None