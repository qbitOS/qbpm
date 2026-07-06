"""qbpm app tools registry — kbatch and other tools/ children."""

from __future__ import annotations

from pathlib import Path
from typing import Any


def discover_tools(root: Path) -> list[dict[str, Any]]:
    tools_dir = root / "tools"
    if not tools_dir.is_dir():
        return []

    tools: list[dict[str, Any]] = []
    for child in sorted(tools_dir.iterdir()):
        if not child.is_dir() or child.name.startswith("."):
            continue
        web = child / "web"
        entry = child / "start.sh"
        manifest = {
            "id": child.name,
            "path": str(child.relative_to(root)),
            "start": str(entry.relative_to(root)) if entry.exists() else None,
        }
        if web.is_dir():
            html = web / f"{child.name}.html"
            if not html.exists():
                for candidate in web.glob("*.html"):
                    html = candidate
                    break
            if html.exists():
                manifest["web"] = str(html.relative_to(root))
                manifest["url"] = f"/tools/{child.name}/{html.name}"
                manifest["embed"] = f"/tools/{child.name}/{html.name}?qbpm=1"
        roles = {
            "kbatch": {
                "role": "keyboard-live",
                "channels": ["kbatch-keyboard-data", "kbatch-training", "feed-caption", "qbpm-live"],
                "stack": ["jax", "python", "json", "wasm", "repel"],
            },
            "blank-ingest": {
                "role": "video-ingest",
                "stack": ["yt-dlp", "ffmpeg", "ffplay", "ffprobe"],
                "api": "/api/video/resolve",
            },
            "imagine-browser": {
                "role": "imagine-presets",
                "api": "/api/imagine/slugs",
                "repo": "fornevercollective/imagine",
            },
            "vwall": {
                "role": "media-wall",
                "stack": ["hls.js", "ffprobe"],
                "repo": "fornevercollective/vwall",
            },
            "grok-pipe": {
                "role": "grok-generate",
                "stack": ["imagine", "resolve", "colossus"],
                "repo": "fornevercollective/grok-public-folder",
            },
        }
        if child.name in roles:
            manifest.update(roles[child.name])
        tools.append(manifest)
    return tools