"""Video ingest API — yt-dlp / ffmpeg / ffplay recipes (blank + grok-public-folder)."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
FOUNDATION = ROOT / "foundation"
GROK_PUBLIC = Path.home() / "film" / "grok-public-folder"


def _which(name: str) -> str | None:
    return shutil.which(name)


def resolve_url(url: str) -> dict[str, Any]:
    """Resolve watch URL via yt-dlp (blank / grok-public-folder compatible)."""
    url = url.strip()
    ytdlp = _which("yt-dlp")
    if not ytdlp:
        return {"ok": False, "error": "yt-dlp not on PATH", "url": url}

    proc = subprocess.run(
        [ytdlp, "-J", "--no-warnings", url],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr or proc.stdout, "url": url}
    try:
        meta = json.loads(proc.stdout)
        return {
            "ok": True,
            "url": url,
            "title": meta.get("title"),
            "id": meta.get("id"),
            "duration": meta.get("duration"),
            "commands": commands_for(url),
        }
    except json.JSONDecodeError:
        return {"ok": False, "error": "invalid yt-dlp JSON", "url": url}


def commands_for(url: str) -> dict[str, str]:
    ytdlp = _which("yt-dlp") or "yt-dlp"
    ffplay = _which("ffplay") or "ffplay"
    ffmpeg = _which("ffmpeg") or "ffmpeg"
    dl = str(ROOT / "media" / "blank" / "downloads")
    return {
        "play": f'{ffplay} -autoexit -window_title "qbpm" "$({ytdlp} -g -f bv*+ba/b {url!r} | head -1)"',
        "download": f"{ytdlp} -f bv*+ba/b -o {dl!r}/%(title)s.%(ext)s {url!r}",
        "snapshot": f"{ffmpeg} -ss 00:00:05 -i \"$({ytdlp} -g {url!r} | head -1)\" -frames:v 1 {dl!r}/snap.jpg",
    }


def list_tools() -> dict[str, Any]:
    return {
        "ok": True,
        "tools": {
            "yt-dlp": _which("yt-dlp"),
            "ffmpeg": _which("ffmpeg"),
            "ffplay": _which("ffplay"),
            "ffprobe": _which("ffprobe"),
        },
        "grok_public_folder": str(GROK_PUBLIC) if GROK_PUBLIC.exists() else None,
        "foundation": str(FOUNDATION),
    }