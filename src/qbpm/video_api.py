"""Video ingest API — yt-dlp / ffmpeg / ffplay (blank + grok-public-folder compatible)."""

from __future__ import annotations

import json
import os
import re
import secrets
import shutil
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from fastapi.responses import Response, StreamingResponse

ROOT = Path(__file__).resolve().parents[2]
FOUNDATION = ROOT / "foundation"
GROK_PUBLIC = Path.home() / "film" / "grok-public-folder"
MEDIA_DL = ROOT / "media" / "blank" / "downloads"

YTDLP_FORMAT = "bv*+ba/b"
PLAY_TTL_SEC = 45 * 60
RESOLVE_TIMEOUT = 120

_play_cache: dict[str, dict[str, Any]] = {}


def _which(name: str) -> str | None:
    return shutil.which(name)


def _site_hint(url: str) -> str:
    try:
        host = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return "generic"
    if "tiktok" in host:
        return "tiktok"
    if "youtube" in host or "youtu.be" in host:
        return "youtube"
    if "twitch" in host:
        return "twitch"
    if "instagram" in host:
        return "instagram"
    if "x.com" in host or "twitter.com" in host:
        return "x"
    return "generic"


def _ytdlp_base_args(url: str) -> list[str]:
    args = ["--no-warnings", "--no-playlist"]
    site = _site_hint(url)
    if site == "youtube":
        client = os.environ.get("YTDLP_PLAYER_CLIENT", "android,tv_embedded,ios,mweb")
        if client:
            args.extend(["--extractor-args", f"youtube:player_client={client}"])
    return args


def _run_ytdlp(args: list[str], *, timeout: int = RESOLVE_TIMEOUT) -> subprocess.CompletedProcess[str]:
    ytdlp = _which("yt-dlp")
    if not ytdlp:
        raise RuntimeError("yt-dlp not on PATH")
    return subprocess.run(
        [ytdlp, *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def normalize_url(url: str) -> str:
    url = url.strip()
    if not url:
        return url
    if not re.match(r"^https?://", url, re.I):
        raise ValueError("URL must start with http:// or https://")
    return url


def resolve_stream_url(url: str, fmt: str = YTDLP_FORMAT) -> str:
    url = normalize_url(url)
    proc = _run_ytdlp([*_ytdlp_base_args(url), "-f", fmt, "-g", url])
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-4:]
        raise RuntimeError(" ".join(tail) or f"yt-dlp exit {proc.returncode}")
    lines = [
        ln.strip()
        for ln in proc.stdout.splitlines()
        if ln.strip().startswith(("http://", "https://"))
    ]
    if not lines:
        raise RuntimeError("yt-dlp returned no stream URL")
    return lines[0]


def _is_m3u8(url: str, content_type: str = "", body_head: str = "") -> bool:
    if re.search(r"\.m3u8(\?|$)", url, re.I):
        return True
    if content_type and re.search(r"mpegurl|m3u8", content_type, re.I):
        return True
    return body_head.lstrip().startswith("#EXTM3U")


def _prune_play_cache() -> None:
    now = time.time()
    dead = [pid for pid, row in _play_cache.items() if now - row["created"] > PLAY_TTL_SEC]
    for pid in dead:
        _play_cache.pop(pid, None)


def _upstream_headers(page_url: str) -> dict[str, str]:
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
        "Accept": "*/*",
    }
    if page_url:
        try:
            parsed = urllib.parse.urlparse(page_url)
            headers["Referer"] = page_url
            headers["Origin"] = f"{parsed.scheme}://{parsed.netloc}"
        except Exception:
            pass
    return headers


def _fetch_title(url: str) -> str | None:
    try:
        proc = _run_ytdlp([*_ytdlp_base_args(url), "--print", "%(title)s", url], timeout=45)
        if proc.returncode != 0:
            return None
        for line in proc.stdout.splitlines():
            t = line.strip()
            if t:
                return t
    except Exception:
        return None
    return None


def register_play_session(url: str, fmt: str = YTDLP_FORMAT) -> dict[str, Any]:
    url = normalize_url(url)
    stream_url = resolve_stream_url(url, fmt)
    play_id = secrets.token_hex(12)
    _play_cache[play_id] = {
        "stream_url": stream_url,
        "page_url": url,
        "allowed": {stream_url},
        "created": time.time(),
        "title": _fetch_title(url),
    }
    _prune_play_cache()
    kind = "hls" if _is_m3u8(stream_url) else "direct"
    title = _play_cache[play_id]["title"]
    return {
        "playId": play_id,
        "streamUrl": stream_url,
        "playPath": f"/api/video/play/{play_id}",
        "streamKind": kind,
        "title": title,
    }


def get_play_row(play_id: str) -> dict[str, Any] | None:
    _prune_play_cache()
    return _play_cache.get(play_id)


def _rewrite_m3u8(body: str, base_url: str, allowed: set[str]) -> str:
    out: list[str] = []
    for line in body.splitlines():
        t = line.strip()
        if not t or t.startswith("#"):
            out.append(line)
            continue
        try:
            abs_url = urllib.parse.urljoin(base_url, t)
        except Exception:
            out.append(line)
            continue
        allowed.add(abs_url)
        out.append(f"/api/video/proxy?u={urllib.parse.quote(abs_url, safe='')}")
    return "\n".join(out)


def _fetch_upstream(url: str, headers: dict[str, str], *, method: str = "GET") -> tuple[int, dict[str, str], bytes]:
    req = urllib.request.Request(url, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.status
            hdrs = dict(resp.headers)
            data = resp.read()
            loc = hdrs.get("Location") or hdrs.get("location")
            if status in (301, 302, 303, 307, 308) and loc:
                next_url = urllib.parse.urljoin(url, loc)
                return _fetch_upstream(next_url, headers, method=method)
            return status, hdrs, data
    except urllib.error.HTTPError as exc:
        body = exc.read() if exc.fp else b""
        return exc.code, dict(exc.headers), body


def proxy_play_stream(play_id: str, *, head: bool = False) -> Response:
    row = get_play_row(play_id)
    if not row:
        return Response("play session expired — resolve again\n", status_code=410, media_type="text/plain")
    headers = _upstream_headers(row["page_url"])
    status, up_hdrs, body = _fetch_upstream(row["stream_url"], headers, method="HEAD" if head else "GET")
    if status >= 400:
        return Response(f"upstream {status}\n", status_code=status, media_type="text/plain")
    ct = up_hdrs.get("Content-Type") or up_hdrs.get("content-type") or ""
    head_sample = body[:32].decode("utf-8", errors="replace")
    if _is_m3u8(row["stream_url"], ct, head_sample):
        text = _rewrite_m3u8(body.decode("utf-8", errors="replace"), row["stream_url"], row["allowed"])
        payload = text.encode("utf-8")
        return Response(
            content=None if head else payload,
            status_code=200,
            media_type="application/vnd.apple.mpegurl",
            headers={
                "Cache-Control": "no-store",
                "Access-Control-Allow-Origin": "*",
                "Content-Length": str(len(payload)),
            },
        )
    return Response(
        content=None if head else body,
        status_code=status,
        media_type=ct or "application/octet-stream",
        headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
    )


def proxy_segment(target: str) -> Response:
    if not target.startswith(("http://", "https://")):
        return Response("bad proxy url\n", status_code=400, media_type="text/plain")
    row = None
    for cached in _play_cache.values():
        if target in cached["allowed"]:
            row = cached
            break
    if not row:
        return Response("url not in active play session\n", status_code=403, media_type="text/plain")
    headers = _upstream_headers(row["page_url"])

    def stream():
        req = urllib.request.Request(target, headers=headers)
        with urllib.request.urlopen(req, timeout=60) as resp:
            while True:
                chunk = resp.read(65536)
                if not chunk:
                    break
                yield chunk

    return StreamingResponse(
        stream(),
        media_type="application/octet-stream",
        headers={"Cache-Control": "no-store", "Access-Control-Allow-Origin": "*"},
    )


def commands_for(url: str) -> dict[str, str]:
    ytdlp = _which("yt-dlp") or "yt-dlp"
    ffplay = _which("ffplay") or "ffplay"
    ffmpeg = _which("ffmpeg") or "ffmpeg"
    dl = str(MEDIA_DL)
    q = repr(url)
    return {
        "resolve": f'{ytdlp} -g -f "{YTDLP_FORMAT}" --no-warnings --no-playlist {q}',
        "play": f'{ffplay} -autoexit -window_title "qbpm" "$({ytdlp} -g -f "{YTDLP_FORMAT}" --no-warnings --no-playlist {q} | head -1)"',
        "download": f'{ytdlp} -f "{YTDLP_FORMAT}" --merge-output-format mkv -o {dl!r}/%(title)s.%(ext)s {q}',
        "snapshot": f'{ffmpeg} -ss 00:00:05 -i "$({ytdlp} -g --no-warnings --no-playlist {q} | head -1)" -frames:v 1 {dl!r}/snap.jpg',
    }


def spawn_ffplay(url: str) -> dict[str, Any]:
    url = normalize_url(url)
    ffplay = _which("ffplay")
    if not ffplay:
        return {"ok": False, "error": "ffplay not on PATH", "url": url}
    stream = resolve_stream_url(url)
    subprocess.Popen(
        [ffplay, "-autoexit", "-window_title", "qbpm", stream],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {"ok": True, "url": url, "streamUrl": stream, "spawned": "ffplay"}


def resolve_url(url: str, *, create_play: bool = True) -> dict[str, Any]:
    """Resolve watch URL via yt-dlp — metadata + proxied play session."""
    try:
        url = normalize_url(url)
    except ValueError as exc:
        return {"ok": False, "error": str(exc), "url": url}

    ytdlp = _which("yt-dlp")
    if not ytdlp:
        return {"ok": False, "error": "yt-dlp not on PATH", "url": url}

    proc = _run_ytdlp([*_ytdlp_base_args(url), "-J", url])
    if proc.returncode != 0:
        tail = (proc.stderr or proc.stdout or "").strip().splitlines()[-6:]
        return {"ok": False, "error": " ".join(tail) or "yt-dlp failed", "url": url}

    try:
        meta = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return {"ok": False, "error": "invalid yt-dlp JSON", "url": url}

    site = meta.get("extractor_key") or meta.get("extractor") or _site_hint(url)
    out: dict[str, Any] = {
        "ok": True,
        "url": url,
        "title": meta.get("title") or meta.get("fulltitle"),
        "id": meta.get("id"),
        "duration": meta.get("duration"),
        "width": meta.get("width"),
        "height": meta.get("height"),
        "thumbnail": meta.get("thumbnail"),
        "uploader": meta.get("uploader") or meta.get("channel"),
        "extractor": site,
        "webpage_url": meta.get("webpage_url") or url,
        "commands": commands_for(url),
    }

    try:
        stream_url = resolve_stream_url(url)
        out["streamUrl"] = stream_url
        out["streamKind"] = "hls" if _is_m3u8(stream_url) else "direct"
    except Exception as exc:
        out["streamResolveError"] = str(exc)

    if create_play:
        try:
            session = register_play_session(url)
            out.update(session)
        except Exception as exc:
            out["playError"] = str(exc)

    return out


def list_tools() -> dict[str, Any]:
    return {
        "ok": True,
        "tools": {
            "yt-dlp": _which("yt-dlp"),
            "ffmpeg": _which("ffmpeg"),
            "ffplay": _which("ffplay"),
            "ffprobe": _which("ffprobe"),
        },
        "format": YTDLP_FORMAT,
        "grok_public_folder": str(GROK_PUBLIC) if GROK_PUBLIC.exists() else None,
        "foundation": str(FOUNDATION),
    }