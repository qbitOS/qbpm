/** go-ugrad-style HUD — crosshairs, target lines, corner panels (qbitos.ai) */

export function createUgradHud(opts = {}) {
  const {
    getPanScale = () => ({ pan: { x: 0, y: 0 }, scale: 1 }),
    getLocalHandle = () => "guest",
    getLocalClientId = () => "local",
    getLocalColor = () => "#58a6ff",
    getPeers = () => [],
    getLiveState = () => null,
    getLastRun = () => null,
    getGraphMeta = () => ({}),
  } = opts;

  let mouse = { sx: -1, sy: -1, wx: 0, wy: 0, active: false };
  let hudCanvas = null;
  let hudCtx = null;
  let rafId = null;

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return stubHud();

  ensureDom(wrap);
  resizeHud();
  window.addEventListener("resize", resizeHud);

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
        <aside id="ugrad-hud-tr" class="ugrad-hud-panel ugrad-hud-tr" aria-label="Chat notifications">
          <div class="ugrad-hud-hd">chat</div>
          <div id="ugrad-chat-toasts" class="ugrad-chat-toasts"></div>
        </aside>
        <aside id="ugrad-hud-bl" class="ugrad-hud-panel ugrad-hud-bl" aria-label="Music notation">
          <div class="ugrad-hud-hd">notation</div>
          <canvas id="ugrad-notation-mini" width="200" height="48"></canvas>
          <div id="ugrad-notation-meta" class="ugrad-hud-meta">—</div>
        </aside>
        <aside id="ugrad-hud-br" class="ugrad-hud-panel ugrad-hud-br" aria-label="Processing">
          <div class="ugrad-hud-hd">processing</div>
          <pre id="ugrad-processing-out" class="ugrad-processing-out">idle</pre>
        </aside>
      `;
      parent.appendChild(shell);
    }
    hudCanvas = document.getElementById("ugrad-hud-canvas");
    hudCtx = hudCanvas?.getContext("2d");
    loop();
  }

  function stubHud() {
    return { setMouse() {}, notifyChat() {}, refresh() {}, destroy() {} };
  }

  function resizeHud() {
    if (!hudCanvas || !wrap) return;
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    hudCanvas.width = Math.max(1, Math.floor(r.width * dpr));
    hudCanvas.height = Math.max(1, Math.floor(r.height * dpr));
    hudCanvas.style.width = `${r.width}px`;
    hudCanvas.style.height = `${r.height}px`;
    hudCtx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHud();
    positionTargets();
  }

  function worldToScreen(wx, wy, pan, scale) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }

  function setMouse(sx, sy, wx, wy) {
    mouse = { sx, sy, wx, wy, active: sx >= 0 };
    drawHud();
    positionTargets();
  }

  function drawHud() {
    if (!hudCtx || !wrap) return;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    hudCtx.clearRect(0, 0, w, h);
    const { pan, scale } = getPanScale();

    if (mouse.active) {
      const ch = "rgba(130,190,255,0.72)";
      const chFade = "rgba(250,250,252,0.18)";
      hudCtx.strokeStyle = chFade;
      hudCtx.lineWidth = 1;
      hudCtx.setLineDash([]);
      hudCtx.beginPath();
      hudCtx.moveTo(0, mouse.sy);
      hudCtx.lineTo(w, mouse.sy);
      hudCtx.stroke();
      hudCtx.beginPath();
      hudCtx.moveTo(mouse.sx, 0);
      hudCtx.lineTo(mouse.sx, h);
      hudCtx.stroke();

      hudCtx.strokeStyle = ch;
      hudCtx.lineWidth = 1;
      hudCtx.setLineDash([6, 4]);
      hudCtx.beginPath();
      hudCtx.moveTo(0, mouse.sy);
      hudCtx.lineTo(w, mouse.sy);
      hudCtx.stroke();
      hudCtx.beginPath();
      hudCtx.moveTo(mouse.sx, 0);
      hudCtx.lineTo(mouse.sx, h);
      hudCtx.stroke();
      hudCtx.setLineDash([]);

      hudCtx.strokeStyle = getLocalColor();
      hudCtx.lineWidth = 1.5;
      hudCtx.beginPath();
      hudCtx.arc(mouse.sx, mouse.sy, 5, 0, Math.PI * 2);
      hudCtx.stroke();
      hudCtx.fillStyle = `${getLocalColor()}44`;
      hudCtx.fill();
    }

    const peers = getPeers();
    const localScr = mouse.active ? { x: mouse.sx, y: mouse.sy } : { x: w / 2, y: h / 2 };
    for (const p of peers) {
      if (p.x == null || p.y == null) continue;
      const tgt = worldToScreen(p.x, p.y, pan, scale);
      if (tgt.x < -40 || tgt.y < -40 || tgt.x > w + 40 || tgt.y > h + 40) continue;

      hudCtx.strokeStyle = `${p.color || "#58a6ff"}88`;
      hudCtx.lineWidth = 1;
      hudCtx.setLineDash([4, 6]);
      hudCtx.beginPath();
      hudCtx.moveTo(localScr.x, localScr.y);
      hudCtx.lineTo(tgt.x, tgt.y);
      hudCtx.stroke();
      hudCtx.setLineDash([]);

      hudCtx.fillStyle = p.color || "#58a6ff";
      hudCtx.beginPath();
      hudCtx.arc(tgt.x, tgt.y, 4, 0, Math.PI * 2);
      hudCtx.fill();
    }

    if (mouse.active) positionLocalTarget();
    drawNotationMini();
    refreshProcessing();
  }

  function positionLocalTarget() {
    const layer = document.getElementById("ugrad-target-layer");
    if (!layer || !wrap) return;
    const id = getLocalClientId();
    let card = layer.querySelector(`[data-target-id="${id}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "ugrad-target-card ugrad-target-card--local";
      card.dataset.targetId = id;
      card.innerHTML = `
        <div class="ugrad-target-video"><video muted playsinline autoplay></video><span class="ugrad-target-ph">📹</span></div>
        <div class="ugrad-target-info"><span class="ugrad-target-name"></span><span class="ugrad-target-coord"></span></div>
      `;
      layer.appendChild(card);
    }
    const vidW = 56;
    const cardH = 36;
    card.style.left = `${mouse.sx - vidW - 8}px`;
    card.style.top = `${mouse.sy - cardH / 2}px`;
    card.style.borderColor = getLocalColor();
    card.querySelector(".ugrad-target-name").textContent = getLocalHandle();
    card.querySelector(".ugrad-target-coord").textContent = `${Math.round(mouse.wx)},${Math.round(mouse.wy)}`;
    const localTile = document.querySelector(`[data-video-tile$="-local"] video`);
    const localVid = card.querySelector("video");
    const ph = card.querySelector(".ugrad-target-ph");
    if (localTile?.srcObject && localVid) {
      if (localVid.srcObject !== localTile.srcObject) localVid.srcObject = localTile.srcObject;
      localVid.style.display = "block";
      if (ph) ph.style.display = "none";
    } else {
      if (localVid) localVid.style.display = "none";
      if (ph) ph.style.display = "flex";
    }
  }

  function positionTargets() {
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
      if (tgt.x < -120 || tgt.y < -60 || tgt.x > w + 20 || tgt.y > h + 20) continue;

      const id = p.clientId || p.name;
      existing.add(id);
      let card = layer.querySelector(`[data-target-id="${id}"]`);
      if (!card) {
        card = document.createElement("div");
        card.className = "ugrad-target-card";
        card.dataset.targetId = id;
        card.innerHTML = `
          <div class="ugrad-target-video"><video muted playsinline autoplay></video><span class="ugrad-target-ph">📹</span></div>
          <div class="ugrad-target-info"><span class="ugrad-target-name"></span><span class="ugrad-target-coord"></span></div>
        `;
        layer.appendChild(card);
      }
      const vidW = 56;
      const cardH = 36;
      card.style.left = `${tgt.x - vidW - 8}px`;
      card.style.top = `${tgt.y - cardH / 2}px`;
      card.style.borderColor = p.color || "#58a6ff";
      card.querySelector(".ugrad-target-name").textContent = p.name || id;
      card.querySelector(".ugrad-target-coord").textContent = `${Math.round(p.x)},${Math.round(p.y)}`;
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

    const localId = getLocalClientId();
    layer.querySelectorAll(".ugrad-target-card:not(.ugrad-target-card--local)").forEach((el) => {
      if (!existing.has(el.dataset.targetId)) el.remove();
    });
    if (!mouse.active) {
      layer.querySelector(`[data-target-id="${localId}"]`)?.remove();
    }
  }

  function notifyChat(msg) {
    const box = document.getElementById("ugrad-chat-toasts");
    if (!box) return;
    const who = msg.fromName || msg.from || "sys";
    const toast = document.createElement("div");
    toast.className = "ugrad-chat-toast";
    toast.style.borderLeftColor = msg.color || "#8b949e";
    toast.innerHTML = `<span class="ugrad-toast-who" style="color:${msg.color || '#8b949e'}">${escapeHtml(who)}</span><span class="ugrad-toast-text">${escapeHtml(msg.text)}</span>`;
    box.prepend(toast);
    while (box.children.length > 8) box.lastChild?.remove();
    setTimeout(() => toast.classList.add("fade"), 8000);
    setTimeout(() => toast.remove(), 12000);
  }

  function drawNotationMini() {
    const c = document.getElementById("ugrad-notation-mini");
    const meta = document.getElementById("ugrad-notation-meta");
    if (!c) return;
    const ctx = c.getContext("2d");
    const live = getLiveState();
    const w = c.width;
    const h = c.height;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    const musica = live?.musica || live?.flow || "";
    const bpm = live?.bpm || live?.cpm || graphMetaCpm();
    if (meta) meta.textContent = musica ? `${musica.slice(0, 24)} · ${bpm || "—"} bpm` : `${bpm || "—"} bpm · idle`;

    const notes = parseMusicaNotes(musica);
    const pxBeat = 14;
    notes.forEach((n, i) => {
      const x = 8 + i * pxBeat;
      const row = 40 - (n.midi % 12) * 2.5;
      ctx.fillStyle = noteColor(n.midi);
      ctx.fillRect(x, Math.max(4, Math.min(h - 8, row)), 10, 4);
    });

    if (mouse.active && notes.length) {
      const beat = (Date.now() / 600) % (notes.length * pxBeat);
      ctx.strokeStyle = "#f85149";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8 + beat, 0);
      ctx.lineTo(8 + beat, h);
      ctx.stroke();
    }
  }

  function graphMetaCpm() {
    const m = getGraphMeta();
    return m?.cpm;
  }

  function parseMusicaNotes(musica) {
    if (!musica) return [];
    const out = [];
    const re = /([A-Ga-g])([#b]?)(\d)?/g;
    let m;
    let beat = 0;
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    while ((m = re.exec(musica)) && out.length < 12) {
      const letter = m[1].toUpperCase();
      let semi = base[letter] ?? 0;
      if (m[2] === "#") semi++;
      if (m[2] === "b") semi--;
      const oct = parseInt(m[3] || "4", 10);
      out.push({ midi: (oct + 1) * 12 + semi, beat: beat++ });
    }
    return out;
  }

  function noteColor(midi) {
    const hues = [0, 30, 60, 120, 180, 210, 270, 300, 330];
    return `hsl(${hues[midi % 12]}, 70%, 55%)`;
  }

  function refreshProcessing() {
    const out = document.getElementById("ugrad-processing-out");
    if (!out) return;
    const live = getLiveState();
    const run = getLastRun();
    const lines = [];
    if (live?.flow) lines.push(`flow: ${live.flow}`);
    if (live?.text) lines.push(`text: ${String(live.text).slice(0, 40)}`);
    if (live?.bpm || live?.cpm) lines.push(`bpm: ${live.bpm || live.cpm}`);
    if (run?.ok != null) lines.push(`run: ${run.ok ? "ok" : "err"} · ${(run.order || []).join("→")}`);
    if (run?.trace?.length) lines.push(`trace: ${run.trace.length} steps`);
    const meta = getGraphMeta();
    if (meta?.frames?.length) lines.push(`frames: ${meta.frames.length}`);
    if (getPeers().length) lines.push(`peers: ${getPeers().length}`);
    out.textContent = lines.length ? lines.join("\n") : "idle · awaiting ingest";
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function loop() {
    drawHud();
    positionTargets();
    rafId = requestAnimationFrame(loop);
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
  }

  return {
    setMouse,
    notifyChat,
    refresh: () => { drawHud(); positionTargets(); },
    destroy,
  };
}