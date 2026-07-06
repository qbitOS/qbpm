"""qbpm foundation — path SSOT (adapted from grok-public-folder)."""

from __future__ import annotations

import os
from pathlib import Path

QBPM_ROOT = Path(__file__).resolve().parents[1]
FOUNDATION = QBPM_ROOT / "foundation"
TOOLS = QBPM_ROOT / "tools"
GRAPHS = QBPM_ROOT / "graphs"
MEDIA = QBPM_ROOT / "media"

GROK_PUBLIC = Path(os.environ.get("GROK_PUBLIC_FOLDER", Path.home() / "film" / "grok-public-folder"))
IMAGINE_REPO = Path(os.environ.get("IMAGINE_REPO", Path.home() / "film" / "imagine"))

VIDEO_DIR = MEDIA / "video"
IMAGE_DIR = MEDIA / "image"
STREAMING_DIR = MEDIA / "streaming"
BLANK_DIR = MEDIA / "blank"
BLANK_DOWNLOADS = BLANK_DIR / "downloads"
BLANK_SNAPSHOTS = BLANK_DIR / "snapshots"
BLANK_CACHE = BLANK_DIR / "cache"

PROJECT_DIR = FOUNDATION / "project"
PRESETS_MANIFEST = PROJECT_DIR / "presets-manifest.json"
PRESET_CACHE = PROJECT_DIR / "preset-cache"