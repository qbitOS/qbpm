"""Imagine preset API for qbpm."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from foundation.grok_presets import all_slugs, load_manifest, slug_prompt  # noqa: E402


def list_slugs() -> dict[str, Any]:
    return {"ok": True, "slugs": all_slugs(), "manifest": load_manifest()}


def get_slug(slug: str) -> dict[str, Any]:
    prompt = slug_prompt(slug)
    if not prompt:
        return {"ok": False, "slug": slug, "error": "prompt not found"}
    return {"ok": True, "slug": slug, "prompt": prompt}