/** Top floating video pin bar — moderator / musician 32×32 feeds */

import { PIN_SLOTS } from "./video-wall.js";

function drawPlaceholder(ctx, size, role, color) {
  if (!ctx) return;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color || "#484f58";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  ctx.fillStyle = color || "#6e7681";
  ctx.font = `${Math.floor(size * 0.3)}px Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(role === "moderator" ? "M" : "♪", size / 2, size / 2);
}

export function createVideoFloatBar(opts = {}) {
  const {
    getVideoWall = () => null,
    onPinClick,
    onOpenVideo = () => {},
  } = opts;

  let host = null;
  let bar = null;
  let raf = 0;
  let drag = null;

  function mount(el) {
    host = el || document.getElementById("video-float-bar");
    if (!host || host.querySelector(".vfb-inner")) return;
    host.innerHTML = `
      <div class="vfb-inner" role="toolbar" aria-label="Moderator and musician video pins">
        <button type="button" class="vfb-drag" title="Drag along top" aria-label="Drag video pin bar">⠿</button>
        <div class="vfb-pins" id="vfb-pins"></div>
        <span class="vfb-hint">mod · mus</span>
      </div>`;
    bar = host.querySelector(".vfb-inner");
    buildPins();
    bindDrag();
    loop();
  }

  function buildPins() {
    const pins = host?.querySelector("#vfb-pins");
    if (!pins) return;
    pins.innerHTML = PIN_SLOTS.map(
      (s) => `
      <button type="button" class="vfb-pin offline" data-role="${s.role}" data-pin-id="${s.id}" title="${s.role} · awaiting feed" style="--pin-color:${s.color}">
        <canvas class="vfb-pin-canvas" width="32" height="32"></canvas>
        <span class="vfb-pin-lbl">${s.label}</span>
      </button>`,
    ).join("");
    pins.querySelectorAll(".vfb-pin").forEach((btn) => {
      btn.addEventListener("click", () => {
        const role = btn.dataset.role;
        const entry = getVideoWall()?.getPinnedEntries?.()?.find((e) => e.role === role);
        onPinClick?.(entry || { role, active: false });
        if (entry?.active) onOpenVideo();
      });
    });
  }

  function bindDrag() {
    const handle = bar?.querySelector(".vfb-drag");
    if (!handle || !bar) return;
    const onDown = (ev) => {
      drag = {
        x: ev.clientX,
        start: parseFloat(bar.style.left || "0") || bar.offsetLeft,
      };
      bar.classList.add("dragging");
      ev.preventDefault();
    };
    const onMove = (ev) => {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const max = Math.max(0, (host?.clientWidth || window.innerWidth) - bar.offsetWidth - 8);
      const left = Math.max(4, Math.min(max, drag.start + dx));
      bar.style.left = `${left}px`;
    };
    const onUp = () => {
      drag = null;
      bar?.classList.remove("dragging");
    };
    handle.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function renderPins() {
    const wall = getVideoWall();
    const entries = wall?.getPinnedEntries?.() || [];
    const pinHost = host?.querySelector("#vfb-pins");
    if (!pinHost) return;

    for (const entry of entries) {
      const btn = pinHost.querySelector(`[data-role="${entry.role}"]`);
      if (!btn) continue;
      btn.classList.toggle("offline", !entry.active);
      btn.classList.toggle("live", !!entry.active);
      btn.title = entry.active
        ? `${entry.role} · ${entry.name} · ${entry.width}×${entry.height}`
        : `${entry.role} · placeholder · click to open video`;
      btn.style.borderColor = entry.color;

      const canvas = btn.querySelector("canvas");
      const ctx = canvas?.getContext("2d");
      if (!ctx) continue;

      let streamVid = null;
      if (entry.active && entry.stream) {
        let hidden = btn._hiddenVid;
        if (!hidden) {
          hidden = document.createElement("video");
          hidden.muted = true;
          hidden.playsInline = true;
          hidden.autoplay = true;
          hidden.style.cssText = "position:fixed;left:-9999px;width:32px;height:32px";
          document.body.appendChild(hidden);
          btn._hiddenVid = hidden;
        }
        if (hidden.srcObject !== entry.stream) hidden.srcObject = entry.stream;
        streamVid = hidden;
      }

      if (streamVid?.videoWidth) {
        const vw = streamVid.videoWidth;
        const vh = streamVid.videoHeight;
        const side = Math.min(vw, vh);
        ctx.drawImage(streamVid, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 32, 32);
      } else {
        const slot = PIN_SLOTS.find((s) => s.role === entry.role);
        drawPlaceholder(ctx, 32, entry.role, slot?.color);
      }
    }
  }

  function loop() {
    renderPins();
    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    host?.querySelectorAll(".vfb-pin").forEach((btn) => btn._hiddenVid?.remove());
    if (host) host.innerHTML = "";
  }

  return { mount, renderPins, destroy };
}