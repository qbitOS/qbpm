/**
 * Multi-video rail — grok-cli single-focus pattern: one active iframe/video, tab rail, Document PiP.
 */

import {
  appendUniqueLiveVideos,
  liveVideoDedupeKey,
  parsePasteToItems,
  xTweetIdFromEmbed,
} from "./video-embed-parse.js";
import { getTabRuntime } from "./tab-runtime.js";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createLiveVideoRail(opts = {}) {
  const {
    onStatus,
    onActiveChange,
    getStageVideo = () => null,
    loadDirectVideo = () => {},
  } = opts;

  let host = null;
  let items = [];
  let activeId = null;
  let docPipActive = false;
  let pipWindow = null;

  function mount(el) {
    host = el;
    if (!host || host.querySelector(".lvr-root")) return;
    host.innerHTML = `
      <div class="lvr-root" aria-label="Live video rail">
        <div class="lvr-hd">
          <span>live rail · grok-cli</span>
          <button type="button" class="lvr-btn lvr-clear" title="Clear all">clear</button>
        </div>
        <div class="lvr-paste-row">
          <textarea class="lvr-paste" rows="2" placeholder="paste URLs · YouTube · Vimeo · X · mp4…" spellcheck="false"></textarea>
          <button type="button" class="lvr-btn lvr-add">add</button>
        </div>
        <div class="lvr-tabs" role="tablist" aria-label="Video sources"></div>
        <div class="lvr-player" aria-live="polite">
          <div class="lvr-empty">add URLs above · one source plays at a time (RAM-safe)</div>
        </div>
        <div class="lvr-tools">
          <button type="button" class="lvr-btn lvr-pip" title="Document picture-in-picture">⊡ pip</button>
          <button type="button" class="lvr-btn lvr-to-stage" title="Send mp4 to stage video">→ stage</button>
        </div>
      </div>`;
    bind();
    getTabRuntime().registerVisualLoop("live-video-rail", {
      start: () => {},
      stop: () => closeDocumentPip(),
    });
    render();
  }

  function bind() {
    host?.querySelector(".lvr-add")?.addEventListener("click", addFromPaste);
    host?.querySelector(".lvr-paste")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) { ev.preventDefault(); addFromPaste(); }
    });
    host?.querySelector(".lvr-clear")?.addEventListener("click", clearAll);
    host?.querySelector(".lvr-pip")?.addEventListener("click", () => void openDocumentPip());
    host?.querySelector(".lvr-to-stage")?.addEventListener("click", sendActiveToStage);
  }

  function addFromPaste() {
    const text = host?.querySelector(".lvr-paste")?.value || "";
    const next = parsePasteToItems(text);
    if (!next.length) {
      onStatus?.("no supported URLs in paste");
      return;
    }
    const { merged, focusLastId } = appendUniqueLiveVideos(items, next);
    items = merged;
    if (focusLastId) activeId = focusLastId;
    else if (!activeId && items[0]) activeId = items[0].id;
    host.querySelector(".lvr-paste").value = "";
    render();
    onStatus?.(`live rail · ${items.length} source${items.length === 1 ? "" : "s"}`);
  }

  function clearAll() {
    closeDocumentPip();
    items = [];
    activeId = null;
    render();
    onStatus?.("live rail cleared");
  }

  function removeItem(id) {
    items = items.filter((x) => x.id !== id);
    if (activeId === id) activeId = items[0]?.id || null;
    if (!items.length) closeDocumentPip();
    render();
  }

  function setActive(id) {
    activeId = id;
    closeDocumentPip();
    render();
    onActiveChange?.(getActive());
  }

  function getActive() {
    return items.find((x) => x.id === activeId) || null;
  }

  function tabLabel(item, idx) {
    const k = liveVideoDedupeKey(item.src);
    if (k.startsWith("yt:")) return `yt ${k.slice(3, 8)}`;
    if (k.startsWith("x:")) return `x ${k.slice(2, 8)}`;
    return item.label || `src ${idx + 1}`;
  }

  function resolvedIframeSrc(item) {
    if (!item || item.kind !== "iframe") return "";
    const xId = xTweetIdFromEmbed(item.src);
    if (xId) return item.src.replace(/theme=(light|dark)/, "theme=dark");
    return item.src;
  }

  function render() {
    const tabs = host?.querySelector(".lvr-tabs");
    const player = host?.querySelector(".lvr-player");
    if (!tabs || !player) return;

    tabs.innerHTML = items.map((item, i) => `
      <button type="button" class="lvr-tab${item.id === activeId ? " active" : ""}" role="tab"
        data-id="${escapeHtml(item.id)}" aria-selected="${item.id === activeId}">
        <span>${escapeHtml(tabLabel(item, i))}</span>
        <span class="lvr-tab-x" data-rm="${escapeHtml(item.id)}" title="Remove">×</span>
      </button>`).join("");

    tabs.querySelectorAll(".lvr-tab").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        if (ev.target?.classList?.contains("lvr-tab-x")) return;
        setActive(btn.dataset.id);
      });
    });
    tabs.querySelectorAll(".lvr-tab-x").forEach((x) => {
      x.addEventListener("click", (ev) => {
        ev.stopPropagation();
        removeItem(x.dataset.rm);
      });
    });

    const active = getActive();
    if (!active) {
      player.innerHTML = '<div class="lvr-empty">add URLs above · one source plays at a time (RAM-safe)</div>';
      return;
    }

    if (active.kind === "iframe") {
      const src = docPipActive ? "about:blank" : resolvedIframeSrc(active);
      player.innerHTML = `<iframe class="lvr-iframe" title="${escapeHtml(tabLabel(active, 0))}"
        src="${escapeHtml(src)}" allow="autoplay; encrypted-media; picture-in-picture" loading="lazy"></iframe>`;
    } else {
      player.innerHTML = `<video class="lvr-vid" playsinline controls muted data-qbpm-keep-alive="1"></video>`;
      const vid = player.querySelector("video");
      if (vid) {
        vid.src = active.src;
        vid.play().catch(() => {});
      }
    }
    onActiveChange?.(active);
  }

  async function openDocumentPip() {
    const active = getActive();
    if (!active || active.kind !== "iframe") {
      onStatus?.("Document PiP needs an iframe source (YouTube/Vimeo/X)");
      return;
    }
    const dpip = window.documentPictureInPicture;
    if (!dpip?.requestWindow) {
      onStatus?.("Document PiP unavailable — use stage PiP");
      return;
    }
    try {
      if (docPipActive) { closeDocumentPip(); return; }
      pipWindow = await dpip.requestWindow({ width: 480, height: 270 });
      docPipActive = true;
      const iframe = document.createElement("iframe");
      iframe.src = resolvedIframeSrc(active);
      iframe.style.cssText = "width:100%;height:100%;border:0";
      iframe.allow = "autoplay; encrypted-media; picture-in-picture";
      pipWindow.document.body.style.margin = "0";
      pipWindow.document.body.appendChild(iframe);
      pipWindow.addEventListener("pagehide", () => {
        docPipActive = false;
        pipWindow = null;
        render();
      });
      render();
      onStatus?.("Document PiP active · main iframe blanked");
    } catch (err) {
      onStatus?.(`pip: ${err.message}`);
    }
  }

  function closeDocumentPip() {
    try { pipWindow?.close(); } catch (_) { /* ignore */ }
    pipWindow = null;
    docPipActive = false;
    render();
  }

  function sendActiveToStage() {
    const active = getActive();
    if (!active) return;
    if (active.kind === "video") {
      loadDirectVideo(active.src);
      onStatus?.("mp4 sent to stage");
      return;
    }
    onStatus?.("iframe sources play in rail — use yt-dlp ingest for stage");
  }

  function loadVideos(urlsOrItems) {
    let next = [];
    if (typeof urlsOrItems === "string") next = parsePasteToItems(urlsOrItems);
    else if (Array.isArray(urlsOrItems)) {
      next = urlsOrItems.map((x, i) => ({
        id: x.id || `lv-${i}`,
        kind: x.kind || "iframe",
        src: x.src,
        label: x.label || x.src?.slice(0, 24),
      }));
    }
    const { merged, focusLastId } = appendUniqueLiveVideos(items, next);
    items = merged;
    if (focusLastId) activeId = focusLastId;
    render();
    return items;
  }

  function destroy() {
    getTabRuntime().unregisterVisualLoop("live-video-rail");
    closeDocumentPip();
    items = [];
    activeId = null;
    if (host) host.innerHTML = "";
  }

  return {
    mount,
    loadVideos,
    clearAll,
    getItems: () => items.slice(),
    getActive,
    destroy,
  };
}