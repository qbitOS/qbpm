/** Floating workspace — piano, oscillator, blank-style video, frame-anchored chat */

import { moveLayer } from "./gpu-loop.js";

const DOCK_GAP = 8;
const DOCK_MARGIN = 10;

const PIANO_KEYS = [
  { n: "C4", f: 261.63, w: 0, black: false },
  { n: "C#4", f: 277.18, w: 14, black: true },
  { n: "D4", f: 293.66, w: 20, black: false },
  { n: "D#4", f: 311.13, w: 34, black: true },
  { n: "E4", f: 329.63, w: 40, black: false },
  { n: "F4", f: 349.23, w: 60, black: false },
  { n: "F#4", f: 369.99, w: 74, black: true },
  { n: "G4", f: 392.0, w: 80, black: false },
  { n: "G#4", f: 415.3, w: 94, black: true },
  { n: "A4", f: 440.0, w: 100, black: false },
  { n: "A#4", f: 466.16, w: 114, black: true },
  { n: "B4", f: 493.88, w: 120, black: false },
  { n: "C5", f: 523.25, w: 140, black: false },
];

export function createFloatWorkspace(opts = {}) {
  const {
    onChatSend,
    onPromptIngest,
    onNotePlay,
    getLocalHandle = () => "guest",
    getPanScale,
    getFrames,
  } = opts;

  let audioCtx = null;
  let oscNode = null;
  let gainNode = null;
  let oscOn = false;
  let localStream = null;

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return stub();

  ensureDom(wrap);
  bindEvents();

  function stub() {
    return { setPeerChats() {}, positionFramePanels() {}, getLeftDockLayout() {}, destroy() {} };
  }

  function getMainFrame() {
    const frameList = getFrames?.() || [];
    return frameList.find((f) => f.id === "frame-main") || frameList[0];
  }

  function worldToScreen(wx, wy, pan, scale) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }

  function getLeftDockLayout() {
    const { pan, scale } = getPanScale?.() || { pan: { x: 0, y: 0 }, scale: 1 };
    const main = getMainFrame();
    if (!main) return null;
    const [fx, fy, , fh] = main.rect;
    const scr = worldToScreen(fx, fy, pan, scale);
    const videoEl = document.getElementById("float-panel-video");
    const chatEl = document.getElementById("float-panel-tr");
    const videoW = videoEl?.offsetWidth || 200;
    const chatW = chatEl?.offsetWidth || 220;
    const colW = videoW + DOCK_GAP + chatW;
    const colX = Math.round(scr.x - colW - DOCK_MARGIN);
    const colY = Math.max(48, Math.round(scr.y));
    const videoH = videoEl?.offsetHeight || 180;
    const chatH = chatEl?.offsetHeight || 140;
    const rowH = Math.max(videoH, chatH);
    const bottomY = pan.y + (fy + fh) * scale;
    return { colX, colY, colW, rowH, rowBottom: colY + rowH, mainScr: scr, bottomY };
  }

  function positionFramePanels() {
    const layout = getLeftDockLayout();
    if (!layout) return;
    const videoEl = document.getElementById("float-panel-video");
    const chatEl = document.getElementById("float-panel-tr");
    const videoW = videoEl?.offsetWidth || 200;
    moveLayer(videoEl, layout.colX, layout.colY);
    moveLayer(chatEl, layout.colX + videoW + DOCK_GAP, layout.colY);

    const bl = document.getElementById("float-panel-bl");
    const br = document.getElementById("float-panel-br");
    const blH = bl?.offsetHeight || 120;
    const brW = br?.offsetWidth || 220;
    const brH = br?.offsetHeight || 120;
    if (bl) moveLayer(bl, layout.colX, layout.bottomY - blH - DOCK_MARGIN);
    if (br) moveLayer(br, layout.mainScr.x - brW - DOCK_MARGIN, layout.bottomY - brH - DOCK_MARGIN);
  }

  function ensureDom(parent) {
    if (document.getElementById("float-workspace")) return;
    const root = document.createElement("div");
    root.id = "float-workspace";
    root.innerHTML = `
      <aside id="float-panel-tr" class="float-panel float-tr" aria-label="Chat">
        <div class="float-hd">chat</div>
        <div id="float-chat-log" class="float-chat-log"></div>
        <div class="float-chat-row">
          <input id="float-chat-in" type="text" placeholder="quick chat…" autocomplete="off" enterkeyhint="send" />
          <button type="button" id="float-chat-send">↵</button>
        </div>
      </aside>
      <aside id="float-panel-bl" class="float-panel float-bl" aria-label="Notation and piano">
        <div class="float-hd">notation · piano</div>
        <canvas id="float-notation" width="220" height="40"></canvas>
        <div id="float-notation-meta" class="float-meta">—</div>
        <div id="float-piano" class="float-piano" aria-label="Mini piano"></div>
      </aside>
      <aside id="float-panel-br" class="float-panel float-br" aria-label="Processing and oscillator">
        <div class="float-hd">processing · osc</div>
        <pre id="float-processing" class="float-processing">idle</pre>
        <div class="float-osc-row">
          <button type="button" id="float-osc-toggle" title="Oscillator">∿</button>
          <input id="float-osc-freq" type="range" min="110" max="880" value="440" />
          <span id="float-osc-hz" class="float-meta">440 Hz</span>
        </div>
      </aside>
      <aside id="float-panel-video" class="float-panel float-video" aria-label="Video feed">
        <div class="float-hd">video · blank</div>
        <div class="float-video-box">
          <video id="float-video-el" muted playsinline autoplay></video>
          <span id="float-video-ph" class="float-video-ph">📹</span>
        </div>
        <input id="float-video-url" type="url" placeholder="paste URL · blank ingest" autocomplete="off" />
        <div class="float-video-btns">
          <button type="button" id="float-video-cam" title="Camera">📷</button>
          <button type="button" id="float-video-ingest" title="Ingest URL">▶</button>
          <button type="button" id="float-video-file" title="Open file">📁</button>
        </div>
      </aside>
      <div id="float-peer-chats" class="float-peer-chats"></div>
    `;
    parent.appendChild(root);
    buildPiano();
  }

  function buildPiano() {
    const el = document.getElementById("float-piano");
    if (!el) return;
    el.innerHTML = `<div class="fp-white"></div><div class="fp-black"></div>`;
    const white = el.querySelector(".fp-white");
    const black = el.querySelector(".fp-black");
    PIANO_KEYS.filter((k) => !k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fp-key fp-white-key";
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      white.appendChild(b);
    });
    PIANO_KEYS.filter((k) => k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "fp-key fp-black-key";
      b.style.left = `${k.w}px`;
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      black.appendChild(b);
    });
  }

  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(freq, ms = 180) {
    const ctx = ensureAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = 0.08;
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
    onNotePlay?.({ note: freq, hz: freq });
  }

  function bindEvents() {
    document.getElementById("float-piano")?.addEventListener("pointerdown", (ev) => {
      const key = ev.target.closest(".fp-key");
      if (!key) return;
      ev.preventDefault();
      key.classList.add("active");
      playTone(parseFloat(key.dataset.freq));
    });
    document.getElementById("float-piano")?.addEventListener("pointerup", (ev) => {
      ev.target.closest(".fp-key")?.classList.remove("active");
    });

    document.getElementById("float-osc-toggle")?.addEventListener("click", () => {
      const ctx = ensureAudio();
      if (oscOn) {
        oscNode?.stop();
        oscNode = null;
        oscOn = false;
        document.getElementById("float-osc-toggle")?.classList.remove("active");
        return;
      }
      oscNode = ctx.createOscillator();
      gainNode = ctx.createGain();
      oscNode.type = "sine";
      oscNode.frequency.value = parseFloat(document.getElementById("float-osc-freq")?.value || "440");
      gainNode.gain.value = 0.06;
      oscNode.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscNode.start();
      oscOn = true;
      document.getElementById("float-osc-toggle")?.classList.add("active");
    });

    document.getElementById("float-osc-freq")?.addEventListener("input", (ev) => {
      const hz = ev.target.value;
      document.getElementById("float-osc-hz").textContent = `${hz} Hz`;
      if (oscNode) oscNode.frequency.value = parseFloat(hz);
    });

    const sendChat = () => {
      const text = document.getElementById("float-chat-in")?.value?.trim();
      if (!text) return;
      onChatSend?.(text);
      document.getElementById("float-chat-in").value = "";
    };
    document.getElementById("float-chat-send")?.addEventListener("click", sendChat);
    document.getElementById("float-chat-in")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); sendChat(); }
    });

    document.getElementById("float-video-cam")?.addEventListener("click", async () => {
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
        localStream = null;
        const v = document.getElementById("float-video-el");
        if (v) v.srcObject = null;
        document.getElementById("float-video-ph").style.display = "flex";
        return;
      }
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const v = document.getElementById("float-video-el");
        if (v) {
          v.srcObject = localStream;
          v.style.display = "block";
        }
        document.getElementById("float-video-ph").style.display = "none";
      } catch (err) {
        appendChatLine({ fromName: "sys", text: `camera: ${err.message}`, color: "#f85149" });
      }
    });

    document.getElementById("float-video-ingest")?.addEventListener("click", () => {
      const url = document.getElementById("float-video-url")?.value?.trim();
      if (url) onPromptIngest?.(url);
    });

    document.getElementById("float-video-file")?.addEventListener("click", () => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = "video/*,image/*";
      inp.onchange = () => {
        const f = inp.files?.[0];
        if (!f) return;
        const v = document.getElementById("float-video-el");
        if (v) {
          v.srcObject = null;
          v.src = URL.createObjectURL(f);
          v.style.display = "block";
          document.getElementById("float-video-ph").style.display = "none";
        }
      };
      inp.click();
    });
  }

  function appendChatLine(msg) {
    const log = document.getElementById("float-chat-log");
    if (!log) return;
    const who = msg.fromName || msg.from || "sys";
    const line = document.createElement("div");
    line.className = "float-chat-line";
    line.innerHTML = `<span class="float-chat-who" style="color:${msg.color || "#8b949e"}">${escapeHtml(who)}</span> ${escapeHtml(msg.text)}`;
    log.appendChild(line);
    while (log.children.length > 24) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  function setProcessing(text) {
    const el = document.getElementById("float-processing");
    if (el && el.textContent !== text) el.textContent = text;
  }

  function drawNotation(live) {
    const c = document.getElementById("float-notation");
    const meta = document.getElementById("float-notation-meta");
    if (!c) return;
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);
    const musica = live?.musica || live?.flow || "";
    const bpm = live?.bpm || live?.cpm || "—";
    if (meta) meta.textContent = musica ? `${musica.slice(0, 28)} · ${bpm} bpm` : `${bpm} bpm`;
    const notes = parseNotes(musica);
    notes.forEach((n, i) => {
      const x = 8 + i * 14;
      const row = h - 8 - (n.midi % 12) * 2.2;
      ctx.fillStyle = `hsl(${(n.midi * 30) % 360},70%,55%)`;
      ctx.fillRect(x, Math.max(4, row), 10, 4);
    });
  }

  function parseNotes(m) {
    if (!m) return [];
    const out = [];
    const re = /([A-Ga-g])([#b]?)(\d)?/g;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    let match;
    while ((match = re.exec(m)) && out.length < 14) {
      let semi = base[match[1].toUpperCase()] ?? 0;
      if (match[2] === "#") semi++;
      if (match[2] === "b") semi--;
      const oct = parseInt(match[3] || "4", 10);
      out.push({ midi: (oct + 1) * 12 + semi });
    }
    return out;
  }

  function setPeerChats() {
    const layer = document.getElementById("float-peer-chats");
    if (layer) layer.innerHTML = "";
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function getVideoElement() {
    return document.getElementById("float-video-el");
  }

  function destroy() {
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (oscNode) try { oscNode.stop(); } catch (_) {}
    if (audioCtx) audioCtx.close();
  }

  return {
    appendChatLine,
    setProcessing,
    drawNotation,
    setPeerChats,
    positionFramePanels,
    getLeftDockLayout,
    getVideoElement,
    destroy,
  };
}