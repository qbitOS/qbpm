/** blank-style watch URL ingest — yt-dlp resolve + proxied play for video feed */

import { pages } from "./pages.js";

const WATCH_RE = /^https?:\/\//i;

export function isWatchUrl(text) {
  return WATCH_RE.test(String(text || "").trim());
}

export function apiUrl(path) {
  const P = pages();
  const p = String(path || "").replace(/^\//, "");
  const base = P.api?.(p);
  if (base) return base;
  if (P.staticShell) return null;
  return `/${p}`;
}

export function backendRequiredMessage() {
  return (
    "Video ingest needs the qbpm backend (yt-dlp). " +
    "Run `uv run qbpm` locally — GitHub Pages is static-only. " +
    "Optional: localStorage qbpm-api-base = your server URL."
  );
}

export async function resolveWatchUrl(url) {
  const watch = String(url || "").trim();
  if (!isWatchUrl(watch)) throw new Error("paste a http(s) watch URL");
  const endpoint = apiUrl("api/video/resolve");
  if (!endpoint) throw new Error(backendRequiredMessage());

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: watch }),
  });
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`resolve failed (${res.status}) — not JSON`);
  }
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `resolve failed (${res.status})`);
  }
  return data;
}

export function playUrlForResolved(data) {
  if (!data) return null;
  if (data.playPath) {
    const u = apiUrl(data.playPath.replace(/^\//, ""));
    return u || data.playPath;
  }
  return data.streamUrl || null;
}

export async function spawnFfplay(url) {
  const endpoint = apiUrl("api/video/ffplay");
  if (!endpoint) throw new Error(backendRequiredMessage());
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: String(url || "").trim() }),
  });
  const data = await res.json();
  if (!res.ok || !data?.ok) throw new Error(data?.error || `ffplay failed (${res.status})`);
  return data;
}

export function formatResolveSummary(data) {
  if (!data?.ok) return data?.error || "resolve failed";
  const parts = [
    data.extractor || "site",
    data.title?.slice(0, 48) || data.id || "untitled",
    data.width && data.height ? `${data.width}×${data.height}` : null,
    data.duration ? `${data.duration}s` : null,
    data.streamKind || null,
    data.playPath ? "proxy ready" : null,
  ].filter(Boolean);
  return parts.join(" · ");
}