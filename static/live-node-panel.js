/** Inline live video node editor — Nuke/Griptape-style panel on canvas */

import { createVideoFeed } from "./video-feed.js";

const LIVE_PANEL_W = 340;
const LIVE_PANEL_H = 280;

export function createLiveNodePanel(opts = {}) {
  const {
    getPanScale = () => ({ pan: { x: 0, y: 0 }, scale: 1 }),
    getSelectedId = () => null,
    getGraph = () => ({ nodes: [] }),
    getCanvasWrap = () => document.getElementById("canvas-wrap"),
    getVideoWall = () => null,
    onIngestUrl,
    onStatus,
  } = opts;

  const feeds = new Map();
  let host = null;

  function ensureHost() {
    if (host) return host;
    const wrap = getCanvasWrap();
    if (!wrap) return null;
    host = document.createElement("div");
    host.id = "live-node-overlays";
    host.className = "live-node-overlays";
    wrap.appendChild(host);
    return host;
  }

  function nodeById(id) {
    return getGraph().nodes?.find((n) => n.id === id) || null;
  }

  function worldRect(n) {
    const [x, y] = n.pos || [0, 0];
    return { x, y, w: LIVE_PANEL_W, h: LIVE_PANEL_H };
  }

  function positionPanel(n, panel) {
    const { pan, scale } = getPanScale();
    const r = worldRect(n);
    panel.style.left = `${pan.x + r.x * scale}px`;
    panel.style.top = `${pan.y + r.y * scale}px`;
    panel.style.width = `${r.w * scale}px`;
    panel.style.height = `${r.h * scale}px`;
    panel.style.fontSize = `${Math.max(8, 10 * scale)}px`;
  }

  function ensureFeed(n) {
    let panel = document.getElementById(`live-panel-${n.id}`);
    if (!panel) {
      const layer = ensureHost();
      if (!layer) return null;
      panel = document.createElement("div");
      panel.id = `live-panel-${n.id}`;
      panel.className = `live-node-panel live-node-${n.type.split(".")[1] || "rail"}`;
      panel.innerHTML = `
        <div class="lnp-hd">
          <span class="lnp-id">${n.id}</span>
          <span class="lnp-type">${n.type}</span>
        </div>
        <div class="lnp-body"></div>`;
      layer.appendChild(panel);
      const body = panel.querySelector(".lnp-body");
      const feed = createVideoFeed({
        videoWall: getVideoWall?.(),
        compact: true,
        onIngestUrl,
        onStatus,
      });
      feed.mount(body);
      feeds.set(n.id, { feed, panel });
      applyNodeData(n, feed);
    }
    return feeds.get(n.id);
  }

  function applyNodeData(n, feed) {
    const urls = n.data?.urls;
    if (Array.isArray(urls) && urls.length) feed.loadLiveVideos?.(urls);
    const url = n.data?.url || n.data?.ingestUrl;
    if (url && typeof url === "string") feed.loadUrl?.(url);
    feed.setStatus?.(`${n.type} · ${(urls?.length || 0)} src`);
  }

  function sync() {
    const sel = getSelectedId();
    const layer = ensureHost();
    if (!layer) return;

    feeds.forEach((entry, nid) => {
      if (nid !== sel) {
        entry.feed.destroy?.();
        entry.panel.remove();
        feeds.delete(nid);
      }
    });

    const n = nodeById(sel);
    if (!n?.type?.startsWith("live.")) return;

    const entry = ensureFeed(n);
    if (!entry) return;
    applyNodeData(n, entry.feed);
    positionPanel(n, entry.panel);
    entry.panel.classList.add("open");
  }

  function getFeedForNode(id) {
    return feeds.get(id)?.feed || null;
  }

  function destroy() {
    feeds.forEach((entry) => {
      entry.feed.destroy?.();
      entry.panel.remove();
    });
    feeds.clear();
    host?.remove();
    host = null;
  }

  return {
    sync,
    destroy,
    getFeedForNode,
    livePanelSize: () => ({ w: LIVE_PANEL_W, h: LIVE_PANEL_H }),
  };
}

export { LIVE_PANEL_W, LIVE_PANEL_H };