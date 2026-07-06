/** Viewport edge dock — collapsible panels, canvas center kept clear */

import { moveLayer } from "./gpu-loop.js";

const RAIL_W = 46;
const EDGE = 8;
const TOP = 52;
const BOTTOM_PAD = 8;
const GAP = 8;
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

const RIGHT_KEYS = ["chat", "strudel", "proc"];
const LEFT_KEYS = ["video", "grand", "mpc", "beat", "wave", "music"];

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function fitPanel(el, x, y, ww, wh, opts = {}) {
  if (!el) return { x, y, w: 0, h: 0 };
  const minTop = opts.minTop ?? TOP;
  const minW = opts.minW ?? 180;
  const maxW = opts.maxW ?? Math.min(el.offsetWidth || opts.fallbackW || 320, Math.floor(ww * 0.32));
  const availH = wh - minTop - BOTTOM_PAD;
  const wantH = opts.maxH ?? availH;
  const maxH = clamp(Math.floor(wantH), 100, availH);

  el.style.width = opts.width ? `${opts.width}px` : "";
  el.style.maxWidth = `${Math.max(minW, maxW)}px`;
  el.style.maxHeight = `${maxH}px`;

  const w = el.offsetWidth || maxW;
  const h = Math.min(el.scrollHeight || maxH, maxH);
  const cx = clamp(x, RAIL_W + EDGE, Math.max(RAIL_W + EDGE, ww - w - EDGE));
  const cy = clamp(y, minTop, Math.max(minTop, wh - h - BOTTOM_PAD));

  return { x: cx, y: cy, w, h, maxH };
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
      <button type="button" data-dock="collapse-right" class="dock-collapse-right" title="Collapse right column">▸</button>
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
      if (key === "collapse-right") {
        collapseRightColumn();
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
    const rightAny = RIGHT_KEYS.some((k) => open[k]);
    document.querySelectorAll("#float-dock-rail [data-dock]").forEach((btn) => {
      const k = btn.dataset.dock;
      if (k === "focus" || k === "collapse-right") return;
      btn.classList.toggle("active", !!open[k]);
    });
    document.querySelectorAll('[data-dock="collapse-right"]').forEach((btn) => {
      btn.classList.toggle("active", rightAny);
      btn.title = rightAny ? "Collapse right column" : "Right column collapsed";
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

  /** Stack open panels top→bottom in a column; returns bottom Y. */
  function stackColumn(entries, x, y0, maxBottom, ww, wh) {
    let y = y0;
    for (const entry of entries) {
      const el = entry.el;
      if (!entry.isOpen) {
        hidePanel(el);
        continue;
      }
      const remaining = maxBottom - y;
      if (remaining < 100) {
        hidePanel(el);
        continue;
      }
      const p = fitPanel(el, x, y, ww, wh, {
        ...entry.fit,
        maxH: Math.min(entry.fit?.maxH ?? remaining, remaining),
        maxW: entry.fit?.maxW,
      });
      showPanel(el, p.x, y);
      const measured = Math.min(el.offsetHeight || p.h || 120, remaining);
      y += measured + GAP;
    }
    return y;
  }

  function layoutPanels() {
    const wrap = document.getElementById("canvas-wrap");
    if (!wrap) return;
    const ww = wrap.clientWidth;
    const wh = wrap.clientHeight;
    const availH = wh - TOP - BOTTOM_PAD;
    const leftColW = Math.min(300, Math.floor(ww * 0.28));
    const rightColW = Math.min(340, Math.floor(ww * 0.3));
    const leftX = RAIL_W + EDGE;
    const rightX = Math.max(leftX + leftColW + GAP, ww - rightColW - EDGE);

    const video = document.getElementById("float-panel-video");
    const chat = document.getElementById("float-panel-tr");
    const music = document.getElementById("float-panel-bl");
    const grand = document.getElementById("float-panel-grand");
    const mpc = document.getElementById("float-panel-mpc");
    const beat = document.getElementById("float-panel-beat");
    const wave = document.getElementById("float-panel-wave");
    const strudel = document.getElementById("float-panel-strudel");
    const proc = document.getElementById("float-panel-br");

    const musicH = open.music ? Math.min(400, Math.floor(availH * 0.42)) : 0;
    const musicY = wh - musicH - BOTTOM_PAD;
    const leftStackBottom = open.music ? musicY - GAP : wh - BOTTOM_PAD;
    const rightStackBottom = wh - BOTTOM_PAD;

    stackColumn(
      [
        {
          el: video,
          isOpen: open.video,
          fit: { maxH: Math.min(280, Math.floor(availH * 0.38)), maxW: leftColW, fallbackW: leftColW },
        },
        {
          el: grand,
          isOpen: open.grand,
          fit: { maxH: Math.min(260, Math.floor(availH * 0.34)), maxW: leftColW, fallbackW: leftColW },
        },
        {
          el: mpc,
          isOpen: open.mpc,
          fit: { maxH: Math.min(220, Math.floor(availH * 0.28)), maxW: leftColW, fallbackW: leftColW },
        },
        {
          el: beat,
          isOpen: open.beat,
          fit: { maxH: Math.min(240, Math.floor(availH * 0.3)), maxW: leftColW, fallbackW: leftColW },
        },
        {
          el: wave,
          isOpen: open.wave,
          fit: { maxH: Math.min(220, Math.floor(availH * 0.28)), maxW: leftColW, fallbackW: leftColW },
        },
      ],
      leftX,
      TOP + EDGE,
      leftStackBottom,
      ww,
      wh,
    );

    if (!open.music) hidePanel(music);
    else {
      const p = fitPanel(music, leftX, musicY, ww, wh, {
        maxH: musicH,
        maxW: leftColW,
        fallbackW: leftColW,
      });
      showPanel(music, p.x, musicY);
    }

    stackColumn(
      [
        {
          el: chat,
          isOpen: open.chat,
          fit: { maxH: Math.min(300, Math.floor(availH * 0.4)), maxW: rightColW, fallbackW: rightColW },
        },
        {
          el: strudel,
          isOpen: open.strudel,
          fit: { maxH: Math.min(360, Math.floor(availH * 0.55)), maxW: rightColW, fallbackW: rightColW },
        },
        {
          el: proc,
          isOpen: open.proc,
          fit: { maxH: Math.min(320, Math.floor(availH * 0.45)), maxW: rightColW, fallbackW: rightColW },
        },
      ],
      rightX,
      TOP + EDGE,
      rightStackBottom,
      ww,
      wh,
    );

    syncRail();
    const leftAny = LEFT_KEYS.some((k) => open[k]);
    const rightAny = RIGHT_KEYS.some((k) => open[k]);
    wrap.dataset.dockLeft = leftAny ? String(leftX + leftColW) : String(RAIL_W + EDGE);
    wrap.dataset.dockRight = rightAny ? String(rightX) : String(ww);
    wrap.dataset.dockRightOpen = rightAny ? "1" : "0";
  }

  function collapseRightColumn() {
    RIGHT_KEYS.forEach((k) => { open[k] = false; });
    save();
    syncRail();
    layoutPanels();
    window.dispatchEvent(new Event("resize"));
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

  return {
    ensureRail,
    layoutPanels,
    openPanel,
    collapseAll,
    collapseRightColumn,
    getOpen: () => ({ ...open }),
  };
}