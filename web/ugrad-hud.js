/** go-ugrad HUD — GPU canvas crosshairs + throttled peer targets (no cursor DOM chase) */

import { createGpuLoop, moveLayer } from "./gpu-loop.js";
import { VFX } from "./vfx-palette.js";

export function createUgradHud(opts = {}) {
  const {
    getPanScale = () => ({ pan: { x: 0, y: 0 }, scale: 1 }),
    getLocalHandle = () => "guest",
    getLocalColor = () => VFX.compStrokeActive,
    getPeers = () => [],
    getFloatWorkspace = () => null,
  } = opts;

  let mouse = { sx: -1, sy: -1, wx: 0, wy: 0, active: false };
  let hudCanvas = null;
  let hudCtx = null;
  const peerCards = new Map();
  const loop = createGpuLoop();

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return stubHud();

  ensureDom(wrap);
  resizeHud();
  window.addEventListener("resize", () => {
    resizeHud();
    loop.mark("hud");
  });

  loop.register("hud", () => drawHud());
  loop.register("peers", () => positionPeerCards(), { dom: true, domMs: 80 });

  function ensureDom(parent) {
    if (!document.getElementById("ugrad-hud-shell")) {
      const shell = document.createElement("div");
      shell.id = "ugrad-hud-shell";
      shell.innerHTML = `
        <canvas id="ugrad-hud-canvas" aria-hidden="true"></canvas>
        <div class="ugrad-fui-brackets" aria-hidden="true">
          <span class="ugrad-plus ugrad-plus--tl">+</span>
          <span class="ugrad-plus ugrad-plus--tr">+</span>
          <span class="ugrad-plus ugrad-plus--bl">+</span>
          <span class="ugrad-plus ugrad-plus--br">+</span>
          <span class="ugrad-corner ugrad-corner--tl"></span>
          <span class="ugrad-corner ugrad-corner--tr"></span>
          <span class="ugrad-corner ugrad-corner--bl"></span>
          <span class="ugrad-corner ugrad-corner--br"></span>
        </div>
        <div id="ugrad-target-layer" class="ugrad-target-layer"></div>
      `;
      parent.appendChild(shell);
    }
    hudCanvas = document.getElementById("ugrad-hud-canvas");
    hudCtx = hudCanvas?.getContext("2d", { alpha: true, desynchronized: true });
  }

  function stubHud() {
    return { setMouse() {}, notifyChat() {}, refresh() {}, destroy() {} };
  }

  function resizeHud() {
    if (!hudCanvas || !wrap) return;
    const r = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    hudCanvas.width = Math.max(1, Math.floor(r.width * dpr));
    hudCanvas.height = Math.max(1, Math.floor(r.height * dpr));
    hudCanvas.style.width = `${r.width}px`;
    hudCanvas.style.height = `${r.height}px`;
    hudCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function worldToScreen(wx, wy, pan, scale) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }

  function setMouse(sx, sy, wx, wy) {
    mouse = { sx, sy, wx, wy, active: sx >= 0 };
    loop.mark("hud", "peers");
  }

  function drawHud() {
    if (!hudCtx || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    hudCtx.clearRect(0, 0, w, h);
    const { pan, scale } = getPanScale();

    if (mouse.active) {
      const ch = VFX.crosshair;
      const chFade = VFX.crosshairFade;
      hudCtx.strokeStyle = chFade;
      hudCtx.lineWidth = 1;
      hudCtx.beginPath();
      hudCtx.moveTo(0, mouse.sy);
      hudCtx.lineTo(w, mouse.sy);
      hudCtx.moveTo(mouse.sx, 0);
      hudCtx.lineTo(mouse.sx, h);
      hudCtx.stroke();

      hudCtx.strokeStyle = ch;
      hudCtx.setLineDash([6, 4]);
      hudCtx.beginPath();
      hudCtx.moveTo(0, mouse.sy);
      hudCtx.lineTo(w, mouse.sy);
      hudCtx.moveTo(mouse.sx, 0);
      hudCtx.lineTo(mouse.sx, h);
      hudCtx.stroke();
      hudCtx.setLineDash([]);

      const col = getLocalColor();
      hudCtx.strokeStyle = col;
      hudCtx.lineWidth = 1.5;
      hudCtx.beginPath();
      hudCtx.arc(mouse.sx, mouse.sy, 5, 0, Math.PI * 2);
      hudCtx.stroke();
      hudCtx.fillStyle = `${col}44`;
      hudCtx.fill();

      hudCtx.fillStyle = col;
      hudCtx.font = "600 10px Menlo, monospace";
      hudCtx.fillText(getLocalHandle().slice(0, 16), mouse.sx + 10, mouse.sy - 8);
      hudCtx.fillStyle = "#6e7681";
      hudCtx.font = "9px Menlo, monospace";
      hudCtx.fillText(`${Math.round(mouse.wx)},${Math.round(mouse.wy)}`, mouse.sx + 10, mouse.sy + 4);
    }

    const peers = getPeers();
    const localScr = mouse.active ? { x: mouse.sx, y: mouse.sy } : null;
    if (localScr) {
      for (const p of peers) {
        if (p.x == null || p.y == null) continue;
        const tgt = worldToScreen(p.x, p.y, pan, scale);
        if (tgt.x < -40 || tgt.y < -40 || tgt.x > w + 40 || tgt.y > h + 40) continue;
        hudCtx.strokeStyle = `${p.color || VFX.accent}55`;
        hudCtx.lineWidth = 1;
        hudCtx.setLineDash([4, 6]);
        hudCtx.beginPath();
        hudCtx.moveTo(localScr.x, localScr.y);
        hudCtx.lineTo(tgt.x, tgt.y);
        hudCtx.stroke();
        hudCtx.setLineDash([]);
        hudCtx.fillStyle = p.color || VFX.accent;
        hudCtx.beginPath();
        hudCtx.arc(tgt.x, tgt.y, 4, 0, Math.PI * 2);
        hudCtx.fill();
      }
    }
  }

  function positionPeerCards() {
    const layer = document.getElementById("ugrad-target-layer");
    if (!layer || !wrap) return;
    const { pan, scale } = getPanScale();
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const peers = getPeers();
    const existing = new Set();

    for (const p of peers) {
      if (p.x == null || p.y == null) continue;
      const tgt = worldToScreen(p.x, p.y, pan, scale);
      if (tgt.x < -140 || tgt.y < -60 || tgt.x > w + 20 || tgt.y > h + 20) continue;

      const id = p.clientId || p.name;
      existing.add(id);
      let card = peerCards.get(id);
      if (!card) {
        card = document.createElement("div");
        card.className = "ugrad-target-card";
        card.dataset.targetId = id;
        card.innerHTML = `
          <div class="ugrad-target-video"><video muted playsinline autoplay></video><span class="ugrad-target-ph">📹</span></div>
          <div class="ugrad-target-info"><span class="ugrad-target-name"></span><span class="ugrad-target-coord"></span></div>
        `;
        layer.appendChild(card);
        peerCards.set(id, card);
      }

      const vidW = 56;
      const cardH = 36;
      moveLayer(card, tgt.x - vidW - 8, tgt.y - cardH / 2);

      const name = p.name || id;
      const coord = `${Math.round(p.x)},${Math.round(p.y)}`;
      if (card._name !== name) {
        card._name = name;
        card.querySelector(".ugrad-target-name").textContent = name;
      }
      if (card._coord !== coord) {
        card._coord = coord;
        card.querySelector(".ugrad-target-coord").textContent = coord;
      }
      if (card._border !== p.color) {
        card._border = p.color;
        card.style.borderColor = p.color || VFX.compStroke;
      }

      const extVid = document.querySelector(`[data-video-tile="${id}"] video`);
      const localVid = card.querySelector("video");
      const ph = card.querySelector(".ugrad-target-ph");
      if (extVid?.srcObject && localVid) {
        if (localVid.srcObject !== extVid.srcObject) localVid.srcObject = extVid.srcObject;
        localVid.style.display = "block";
        if (ph) ph.style.display = "none";
      } else {
        if (localVid) localVid.style.display = "none";
        if (ph) ph.style.display = "flex";
      }
    }

    for (const [id, card] of peerCards) {
      if (!existing.has(id)) {
        card.remove();
        peerCards.delete(id);
      }
    }

    getFloatWorkspace?.()?.setPeerChats?.();
  }

  function notifyChat(msg) {
    getFloatWorkspace?.()?.appendChatLine?.(msg);
  }

  function refresh() {
    loop.mark("hud", "peers");
  }

  function destroy() {
    loop.destroy();
    peerCards.forEach((c) => c.remove());
    peerCards.clear();
  }

  return { setMouse, notifyChat, refresh, destroy };
}