/** Viewport edge dock — collapsible panels, canvas never blocked */

import { moveLayer } from "./gpu-loop.js";

const RAIL_W = 42;
const EDGE = 8;
const TOP = 52;
const STORAGE = "qbpm-dock-v1";

const DEFAULT_OPEN = { video: false, chat: false, music: false, proc: false };

export function createFloatDock() {
  let open = { ...DEFAULT_OPEN };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE) || "{}");
      open = { ...DEFAULT_OPEN, ...s };
    } catch (_) {
      open = { ...DEFAULT_OPEN };
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(open));
    } catch (_) {}
  }

  load();

  function ensureRail(wrap) {
    if (!wrap || document.getElementById("float-dock-rail")) return;
    const rail = document.createElement("nav");
    rail.id = "float-dock-rail";
    rail.className = "float-dock-rail";
    rail.setAttribute("aria-label", "Workspace dock");
    rail.innerHTML = `
      <button type="button" data-dock="video" title="Video feed">📹</button>
      <button type="button" data-dock="chat" title="Chat">💬</button>
      <button type="button" data-dock="music" title="Music lab">♪</button>
      <button type="button" data-dock="proc" title="Processing · bloch · EQ · bus">∿</button>
      <button type="button" data-dock="focus" class="dock-focus" title="Collapse all · canvas focus">◎</button>
    `;
    wrap.appendChild(rail);
    rail.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-dock]");
      if (!btn) return;
      const key = btn.dataset.dock;
      if (key === "focus") {
        open = { ...DEFAULT_OPEN };
        save();
        syncRail();
        layoutPanels();
        return;
      }
      open[key] = !open[key];
      save();
      syncRail();
      layoutPanels();
    });
    syncRail();
  }

  function syncRail() {
    document.querySelectorAll("#float-dock-rail [data-dock]").forEach((btn) => {
      const k = btn.dataset.dock;
      if (k === "focus") return;
      btn.classList.toggle("active", !!open[k]);
    });
  }

  function hidePanel(el) {
    if (!el) return;
    el.classList.remove("dock-open");
    el.classList.add("dock-collapsed");
    el.setAttribute("aria-hidden", "true");
    moveLayer(el, -10000, -10000);
  }

  function showPanel(el, x, y) {
    if (!el) return;
    el.classList.add("dock-open");
    el.classList.remove("dock-collapsed");
    el.removeAttribute("aria-hidden");
    moveLayer(el, x, y);
  }

  function layoutPanels() {
    const wrap = document.getElementById("canvas-wrap");
    if (!wrap) return;
    const ww = wrap.clientWidth;
    const wh = wrap.clientHeight;
    const video = document.getElementById("float-panel-video");
    const chat = document.getElementById("float-panel-tr");
    const music = document.getElementById("float-panel-bl");
    const proc = document.getElementById("float-panel-br");

    if (!open.video) hidePanel(video);
    else showPanel(video, RAIL_W + EDGE, TOP);

    if (!open.chat) hidePanel(chat);
    else showPanel(chat, ww - (chat?.offsetWidth || 220) - EDGE, TOP);

    if (!open.music) hidePanel(music);
    else {
      const mh = Math.min(music?.offsetHeight || 280, Math.floor(wh * 0.42));
      showPanel(music, RAIL_W + EDGE, wh - mh - EDGE - 36);
    }

    if (!open.proc) hidePanel(proc);
    else {
      const ph = Math.min(proc?.offsetHeight || 420, Math.floor(wh * 0.58));
      showPanel(proc, ww - (proc?.offsetWidth || 340) - EDGE, wh - ph - EDGE);
    }

    syncRail();
  }

  function openPanel(key) {
    if (key in open) {
      open[key] = true;
      save();
      syncRail();
      layoutPanels();
    }
  }

  function collapseAll() {
    open = { ...DEFAULT_OPEN };
    save();
    syncRail();
    layoutPanels();
  }

  return { ensureRail, layoutPanels, openPanel, collapseAll, getOpen: () => ({ ...open }) };
}