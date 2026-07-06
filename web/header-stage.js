/**
 * Header stage band — overview-style hex BPM snake, vwall multi-feed 32×32 pins, room chat.
 * Sits above #header-waveform (spectrum row).
 */

import { HexBridge, parseRoomFromUrl, generateRoomId } from "./piano/hex-bridge.js";

const SNAKE_LEN = 7;
const HEX_R = 5;

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function drawHexCell(ctx, cx, cy, r, fill, stroke) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawHexSnake(ctx, w, h, bpm, beatPhase, spectrum) {
  const step = HEX_R * 1.65;
  const cols = Math.max(8, Math.floor((w - 56) / step));
  const cy = h / 2;
  const head = beatPhase * cols;

  for (let i = 0; i < cols; i++) {
    const cx = 8 + i * step + HEX_R;
    const tail = head - i;
    let glow = 0;
    if (tail >= 0 && tail < SNAKE_LEN) glow = 1 - tail / SNAKE_LEN;
    else if (tail >= SNAKE_LEN && tail < SNAKE_LEN + 2) glow = 0.12;

    const spec = spectrum?.[i % (spectrum?.length || 1)] || 0;
    const base = 18 + spec * 40;
    const fill = glow > 0
      ? `rgba(${Math.floor(63 + glow * 120)}, ${Math.floor(185 - glow * 40)}, ${Math.floor(80 + glow * 80)}, ${0.35 + glow * 0.55})`
      : `rgba(${base}, ${base + 8}, ${base + 14}, 0.35)`;
    const stroke = glow > 0.5 ? "#3fb950" : "#30363d";
    drawHexCell(ctx, cx, cy, HEX_R, fill, stroke);
  }

  ctx.fillStyle = "#8b949e";
  ctx.font = "9px Menlo, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(bpm)} bpm`, w - 6, cy);
  ctx.textAlign = "left";
}

export function createHeaderStage(opts = {}) {
  const {
    getBpm = () => 120,
    getAnalyser = () => null,
    getVideoWall = () => null,
    getLocalHandle = () => "guest",
    getPeers = () => [],
    onChatSend,
    onOpenVideo = () => {},
    onVwallLive = () => {},
    getRoomId = () => "main",
  } = opts;

  let host = null;
  let snakeCanvas = null;
  let hexPreview = null;
  let feedHost = null;
  let raf = 0;
  let stopped = false;
  let hexBridge = null;
  let roomId = parseRoomFromUrl() || generateRoomId();
  const chatLines = [];

  function mount(el) {
    host = el || document.getElementById("header-stage");
    if (!host || host.querySelector(".hs-inner")) return;

    host.innerHTML = `
      <div class="hs-inner" role="region" aria-label="Stage · BPM · feeds · chat">
        <div class="hs-snake-wrap" title="Hex BPM snake · left → right">
          <canvas class="hs-snake-canvas" aria-hidden="true"></canvas>
        </div>
        <div class="hs-feeds">
          <div class="hs-feeds-hd">
            <button type="button" class="hs-vwall-btn" title="Join vwall group stream">📡</button>
            <span class="hs-vwall-cap" id="hs-vwall-cap">vwall · —</span>
          </div>
          <div class="hs-feeds-row">
            <div class="hs-feed-strip" id="hs-feed-strip" aria-label="Live feed pins"></div>
            <canvas class="hs-hex-preview" id="hs-hex-preview" width="32" height="32" title="overview hexcast receive"></canvas>
          </div>
        </div>
        <div class="hs-chat" aria-label="Stage room chat">
          <div class="hs-chat-hd">
            <span>stage chat</span>
            <select id="hs-chat-to" class="hs-chat-to" title="Recipient"></select>
          </div>
          <div id="hs-chat-log" class="hs-chat-log" aria-live="polite"></div>
          <div class="hs-chat-compose">
            <input id="hs-chat-in" type="text" placeholder="room message…" autocomplete="off" spellcheck="true" />
            <button type="button" id="hs-chat-send" title="Send">↵</button>
          </div>
        </div>
      </div>`;

    snakeCanvas = host.querySelector(".hs-snake-canvas");
    hexPreview = host.querySelector("#hs-hex-preview");
    feedHost = host.querySelector("#hs-feed-strip");

    const wall = getVideoWall();
    wall?.registerFeedStrip?.(feedHost);
    wall?.setHeaderOpenVideo?.(onOpenVideo);

    bindEvents();
    refreshChatRoute();
    startHexReceive();
    resize();
    window.addEventListener("resize", resize);
    loop();
  }

  function bindEvents() {
    host?.querySelector(".hs-vwall-btn")?.addEventListener("click", async () => {
      const wall = getVideoWall();
      const btn = host.querySelector(".hs-vwall-btn");
      try {
        await wall?.toggleLocal?.();
        btn?.classList.toggle("live", !!wall?.isLocalLive?.());
        onVwallLive?.();
        onOpenVideo();
      } catch (err) {
        onOpenVideo();
      }
    });

    const send = () => {
      const text = host?.querySelector("#hs-chat-in")?.value?.trim();
      if (!text) return;
      const toEl = host.querySelector("#hs-chat-to");
      const to = toEl?.value || "all";
      const toName = to === "all" ? "all" : toEl?.selectedOptions?.[0]?.textContent?.trim() || to;
      onChatSend?.({ text, to, toName, fromName: getLocalHandle() || "guest" });
      host.querySelector("#hs-chat-in").value = "";
    };
    host?.querySelector("#hs-chat-send")?.addEventListener("click", send);
    host?.querySelector("#hs-chat-in")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); send(); }
    });
  }

  function refreshChatRoute() {
    const toEl = host?.querySelector("#hs-chat-to");
    if (!toEl) return;
    const peers = getPeers() || [];
    const prev = toEl.value || "all";
    toEl.innerHTML = `<option value="all">all</option>${peers
      .map((p) => {
        const id = p.clientId || p.id;
        const name = p.name || id;
        return `<option value="${id}">${escapeHtml(name)}</option>`;
      })
      .join("")}`;
    if ([...toEl.options].some((o) => o.value === prev)) toEl.value = prev;
  }

  function appendChatLine(msg) {
    const log = host?.querySelector("#hs-chat-log");
    if (!log) return;
    const from = msg.fromName || msg.from || "sys";
    const to = msg.toName || msg.to || "all";
    const line = document.createElement("div");
    line.className = `hs-chat-line${msg.local ? " local" : ""}`;
    line.innerHTML = `<span class="hs-chat-from" style="color:${msg.color || "#8b949e"}">${escapeHtml(from)}</span>` +
      `<span class="hs-chat-arrow">→</span>` +
      `<span class="hs-chat-to">${escapeHtml(to)}</span>` +
      `<span class="hs-chat-text">${escapeHtml(msg.text)}</span>`;
    log.appendChild(line);
    chatLines.push({ from, to, text: msg.text, color: msg.color });
    while (chatLines.length > 32) chatLines.shift();
    while (log.children.length > 12) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  function spectrumBins(analyser, n = 32) {
    if (!analyser) return null;
    const buf = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(buf);
    const out = new Float32Array(n);
    const chunk = Math.max(1, Math.floor(buf.length / n));
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < chunk; j++) sum += buf[i * chunk + j] || 0;
      out[i] = (sum / chunk) / 255;
    }
    return out;
  }

  function resize() {
    if (!snakeCanvas || !host) return;
    const wrap = host.querySelector(".hs-snake-wrap");
    const w = wrap?.clientWidth || 200;
    const h = wrap?.clientHeight || 40;
    const dpr = window.devicePixelRatio || 1;
    snakeCanvas.width = Math.floor(w * dpr);
    snakeCanvas.height = Math.floor(h * dpr);
    snakeCanvas.style.width = `${w}px`;
    snakeCanvas.style.height = `${h}px`;
  }

  function updateVwallCap() {
    const el = host?.querySelector("#hs-vwall-cap");
    const wall = getVideoWall();
    const r = wall?.capacityReport?.();
    if (!el || !r) return;
    el.textContent = `vwall · ${r.users?.length || 0} · ${r.total.toFixed(1)}/${r.max} · ${r.lag?.text || "—"}`;
    el.dataset.level = r.lag?.level || "ok";
  }

  function loop() {
    if (stopped) return;
    const ctx = snakeCanvas?.getContext("2d");
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = snakeCanvas.width / dpr;
      const h = snakeCanvas.height / dpr;
      ctx.clearRect(0, 0, w, h);
      const bpm = Math.max(20, getBpm() || 120);
      const beatMs = 60000 / bpm;
      const beatPhase = (performance.now() % beatMs) / beatMs;
      const spec = spectrumBins(getAnalyser?.());
      drawHexSnake(ctx, w, h, bpm, beatPhase, spec);
    }
    updateVwallCap();
    raf = requestAnimationFrame(loop);
  }

  function startHexReceive() {
    hexBridge = new HexBridge();
    hexBridge.setRoom(roomId || getRoomId?.() || "main");
    hexBridge.onHexFrame = (msg) => {
      if (hexPreview) hexBridge.drawHexFrame(hexPreview, msg.hex, msg.res, msg.mode);
      hexPreview?.classList.add("live");
    };
    hexBridge.startReceive();
  }

  function destroy() {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    hexBridge?.stopReceive();
    getVideoWall()?.unregisterFeedStrip?.(feedHost);
    if (host) host.innerHTML = "";
  }

  return {
    mount,
    appendChatLine,
    refreshChatRoute,
    getChatHistory: () => chatLines.slice(),
    destroy,
  };
}