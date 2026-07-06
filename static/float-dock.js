/** Viewport edge dock — collapsible panels, canvas never blocked */

import { moveLayer } from "./gpu-loop.js";

const RAIL_W = 46;
const EDGE = 8;
const TOP = 52;
const BOTTOM_PAD = 8;
const STORAGE = "qbpm-dock-v1";

const DEFAULT_OPEN = {
  video: false,
  chat: false,
  music: false,
  grand: false,
  mpc: false,
  beat: false,
  wave: false,
  strudel: false,
  proc: false,
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function fitPanel(el, x, y, ww, wh, opts = {}) {
  if (!el) return { x, y };
  const minTop = opts.minTop ?? TOP;
  const minW = opts.minW ?? 200;
  const maxW = Math.min(el.offsetWidth || opts.fallbackW || 340, ww - RAIL_W - EDGE * 2);
  const availH = wh - minTop - BOTTOM_PAD;
  const wantH = opts.maxH ?? availH;
  const maxH = clamp(Math.floor(wantH), 120, availH);

  el.style.maxWidth = `${Math.max(minW, maxW)}px`;
  el.style.maxHeight = `${maxH}px`;

  const w = el.offsetWidth || maxW;
  const h = Math.min(el.scrollHeight, maxH);
  const cx = clamp(x, RAIL_W + EDGE, Math.max(RAIL_W + EDGE, ww - w - EDGE));
  const cy = clamp(y, minTop, Math.max(minTop, wh - h - BOTTOM_PAD));

  return { x: cx, y: cy, maxH };
}

export function createFloatDock() {
  let open = { ...DEFAULT_OPEN };
  let resizeObs = null;

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

  function bindResize(wrap) {
    if (!wrap || resizeObs) return;
    resizeObs = new ResizeObserver(() => layoutPanels());
    resizeObs.observe(wrap);
    window.addEventListener("resize", layoutPanels);
  }

  function ensureRail(wrap) {
    if (!wrap || document.getElementById("float-dock-rail")) return;
    bindResize(wrap);
    const rail = document.createElement("nav");
    rail.id = "float-dock-rail";
    rail.className = "float-dock-rail";
    rail.setAttribute("aria-label", "Workspace dock");
    rail.innerHTML = `
      <button type="button" data-dock="video" title="Video · transport · ingest">📹</button>
      <button type="button" data-dock="chat" title="Chat">💬</button>
      <button type="button" data-dock="music" title="Music lab · overview">♪</button>
      <button type="button" data-dock="grand" title="Grand piano">🎹</button>
      <button type="button" data-dock="mpc" title="MPC pads">▣</button>
      <button type="button" data-dock="beat" title="Beat MPC · step map">▦</button>
      <button type="button" data-dock="wave" title="Waveform edit">⌇</button>
      <button type="button" data-dock="strudel" title="Strudel live code · Fail-safe">()</button>
      <button type="button" data-dock="proc" title="Processing · TD · bloch · EQ">∿</button>
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
    const availH = wh - TOP - BOTTOM_PAD;

    const video = document.getElementById("float-panel-video");
    const chat = document.getElementById("float-panel-tr");
    const music = document.getElementById("float-panel-bl");
    const grand = document.getElementById("float-panel-grand");
    const mpc = document.getElementById("float-panel-mpc");
    const beat = document.getElementById("float-panel-beat");
    const wave = document.getElementById("float-panel-wave");
    const strudel = document.getElementById("float-panel-strudel");
    const proc = document.getElementById("float-panel-br");

    if (!open.video) hidePanel(video);
    else {
      const p = fitPanel(video, RAIL_W + EDGE, TOP + 2, ww, wh, { maxH: availH * 0.72 });
      showPanel(video, p.x, p.y);
    }

    if (!open.chat) hidePanel(chat);
    else {
      const cw = chat?.offsetWidth || 340;
      const p = fitPanel(chat, ww - cw - EDGE, TOP, ww, wh, { maxH: availH * 0.75, fallbackW: 340 });
      showPanel(chat, p.x, p.y);
    }

    if (!open.music) hidePanel(music);
    else {
      const mh = Math.min(380, Math.floor(availH * 0.48));
      const p = fitPanel(music, RAIL_W + EDGE, wh - mh - BOTTOM_PAD - 28, ww, wh, { maxH: mh });
      showPanel(music, p.x, p.y);
    }

    const midX = Math.floor(ww * 0.5);
    const stackY = TOP + EDGE;

    if (!open.grand) hidePanel(grand);
    else {
      const gw = grand?.offsetWidth || 420;
      const p = fitPanel(grand, Math.max(RAIL_W + EDGE, midX - gw - EDGE), stackY, ww, wh, {
        maxH: availH * 0.55,
      });
      showPanel(grand, p.x, p.y);
    }

    if (!open.mpc) hidePanel(mpc);
    else {
      const mw = mpc?.offsetWidth || 300;
      const p = fitPanel(mpc, Math.max(RAIL_W + EDGE, midX - Math.floor(mw / 2)), stackY + 12, ww, wh, {
        maxH: availH * 0.5,
      });
      showPanel(mpc, p.x, p.y);
    }

    if (!open.beat) hidePanel(beat);
    else {
      const bw = beat?.offsetWidth || 380;
      const by = Math.min(Math.floor(wh * 0.28), wh - 200);
      const p = fitPanel(beat, Math.max(RAIL_W + EDGE, midX - Math.floor(bw / 2)), by, ww, wh, {
        maxH: availH * 0.52,
      });
      showPanel(beat, p.x, p.y);
    }

    if (!open.wave) hidePanel(wave);
    else {
      const wvw = wave?.offsetWidth || 360;
      const wy = Math.min(Math.floor(wh * 0.48), wh - 180);
      const p = fitPanel(wave, Math.max(RAIL_W + EDGE, midX - Math.floor(wvw / 2)), wy, ww, wh, {
        maxH: availH * 0.42,
      });
      showPanel(wave, p.x, p.y);
    }

    if (!open.strudel) hidePanel(strudel);
    else {
      const sw = strudel?.offsetWidth || 420;
      const p = fitPanel(strudel, Math.max(RAIL_W + EDGE, ww - sw - EDGE), TOP + 56, ww, wh, {
        maxH: availH * 0.88,
      });
      showPanel(strudel, p.x, p.y);
    }

    if (!open.proc) hidePanel(proc);
    else {
      const pw = proc?.offsetWidth || 340;
      const procH = Math.floor(availH * 0.92);
      const p = fitPanel(proc, Math.max(RAIL_W + EDGE, ww - pw - EDGE), TOP + EDGE, ww, wh, { maxH: procH });
      const py = clamp(wh - procH - BOTTOM_PAD, TOP + EDGE, p.y);
      showPanel(proc, p.x, py);
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