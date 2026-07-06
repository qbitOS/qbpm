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
                "category": "keyboard batch",
                "label": "kbatch",
                "description": "keyboard batch — world keyboard & quantum analyzer",
                "channels": ["kbatch-keyboard-data", "kbatch-training", "feed-caption", "qbpm-live"],
                "stack": ["jax", "python", "json", "wasm", "repel"],
                "tabs": [
                    "analyzer",
                    "layouts",
                    "dictionary",
                    "quantum",
                    "training",
                    "capsules",
                    "contrails",
                    "musica",
                    "symbollab",
                    "lattice",
                ],
                "panels": ["code-cell", "terminal"],
                "patternModes": ["dance", "flow", "contrails", "rhythm", "heatmap", "ergo"],
            },
            "blank-ingest": {
                "role": "video-ingest",
                "category": "ingest",
                "label": "blank ingest",
                "stack": ["yt-dlp", "ffmpeg", "ffplay", "ffprobe"],
                "api": "/api/video/resolve",
            },
            "imagine-browser": {
                "role": "imagine-presets",
                "category": "imagine",
                "label": "imagine",
                "api": "/api/imagine/slugs",
                "repo": "fornevercollective/imagine",
            },
            "vwall": {
                "role": "media-wall",
                "category": "media",
                "label": "vwall",
                "stack": ["hls.js", "ffprobe"],
                "repo": "fornevercollective/vwall",
            },
            "grok-pipe": {
                "role": "grok-generate",
                "category": "grok",
                "label": "grok pipe",
                "stack": ["imagine", "resolve", "colossus"],
                "repo": "fornevercollective/grok-public-folder",
            },
        }
        if child.name in roles:
            manifest.update(roles[child.name])
        tools.append(manifest)
    tools.append(
        {
            "id": "jam-hub",
            "role": "live-jam",
            "category": "collab · strudel · TD",
            "label": "live jam hub",
            "description": "DAW ecosystem refs · () flare · mass collab routing",
            "url": "jam-ecosystem.json",
            "stack": ["strudel", "touchdesigner", "grok", "kbatch", "vexflow"],
            "channels": ["qbpm-jam", "qbpm-live", "piano-buddy-state"],
            "external": True,
        }
    )
    return tools