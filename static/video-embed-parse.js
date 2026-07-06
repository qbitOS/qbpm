/** Embed URL parser — ported from grok-cli grokipediaVideoEmbed.ts */

function tryUrl(raw) {
  let u = String(raw || "").trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

export function parseVideoEmbedLine(raw) {
  const parsed = tryUrl(raw);
  if (!parsed) return null;
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();

  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    const v = parsed.searchParams.get("v");
    if (v) return { kind: "iframe", src: `https://www.youtube.com/embed/${encodeURIComponent(v)}` };
    const embed = parsed.pathname.match(/^\/embed\/([^/?]+)/);
    if (embed) return { kind: "iframe", src: `https://www.youtube.com/embed/${encodeURIComponent(embed[1])}` };
    const shorts = parsed.pathname.match(/^\/shorts\/([^/?]+)/);
    if (shorts) return { kind: "iframe", src: `https://www.youtube.com/embed/${encodeURIComponent(shorts[1])}` };
  }

  if (host === "youtu.be") {
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    if (id) return { kind: "iframe", src: `https://www.youtube.com/embed/${encodeURIComponent(id)}` };
  }

  if (host === "vimeo.com") {
    const id = parsed.pathname.match(/^\/(\d+)/);
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id[1]}` };
  }

  if (host === "player.vimeo.com") {
    const id = parsed.pathname.match(/\/video\/(\d+)/);
    if (id) return { kind: "iframe", src: `https://player.vimeo.com/video/${id[1]}` };
  }

  const xStatus = xStatusIdFromUrl(parsed);
  if (xStatus) return { kind: "iframe", src: tweetEmbedSrc(xStatus, "dark") };

  if (/\.(mp4|webm|ogg|ogv)(\?.*)?$/i.test(parsed.pathname)) {
    return { kind: "video", src: parsed.href };
  }

  return null;
}

function xStatusIdFromUrl(parsed) {
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (!["x.com", "twitter.com", "mobile.twitter.com"].includes(host)) return null;
  const m = parsed.pathname.match(/^\/[^/]+\/status\/(\d+)/) || parsed.pathname.match(/^\/i\/status\/(\d+)/);
  return m ? m[1] : null;
}

export function splitVideoPaste(text) {
  let t = String(text || "").trim();
  while (t.length >= 2 && t.startsWith("{") && t.endsWith("}")) t = t.slice(1, -1).trim();
  return t.split(/[\r\n\s,;{}<>]+/).map((s) => s.trim()).filter(Boolean);
}

export function youtubeIdFromEmbed(src) {
  const m = String(src || "").match(/youtube\.com\/embed\/([^/?&]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function tweetEmbedSrc(statusId, theme = "dark") {
  return `https://platform.twitter.com/embed/Tweet.html?${new URLSearchParams({ id: statusId, theme }).toString()}`;
}

export function xTweetIdFromEmbed(src) {
  try {
    const u = new URL(src);
    if (!/platform\.twitter\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
    if (!/^\/embed\/Tweet\.html$/i.test(u.pathname)) return null;
    const id = u.searchParams.get("id");
    return id && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function liveVideoDedupeKey(src) {
  const y = youtubeIdFromEmbed(src);
  if (y) return `yt:${y}`;
  const x = xTweetIdFromEmbed(src);
  if (x) return `x:${x}`;
  return src;
}

export function appendUniqueLiveVideos(prev, candidates) {
  const seen = new Set((prev || []).map((x) => liveVideoDedupeKey(x.src)));
  const trulyNew = [];
  for (const item of candidates || []) {
    const k = liveVideoDedupeKey(item.src);
    if (seen.has(k)) continue;
    seen.add(k);
    trulyNew.push(item);
  }
  const merged = [...(prev || []), ...trulyNew];
  const focusLastId = trulyNew.length ? trulyNew[trulyNew.length - 1].id : undefined;
  return { merged, focusLastId };
}

export function parsePasteToItems(text) {
  const items = [];
  for (const line of splitVideoPaste(text)) {
    const parsed = parseVideoEmbedLine(line);
    if (!parsed) continue;
    items.push({
      id: `lv-${liveVideoDedupeKey(parsed.src).replace(/[^a-z0-9:+_-]/gi, "").slice(0, 48)}`,
      kind: parsed.kind,
      src: parsed.src,
      label: line.slice(0, 32),
    });
  }
  return items;
}