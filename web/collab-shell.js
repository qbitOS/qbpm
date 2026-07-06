/** Collaborative shell — floating user toolbar, window chat, frame video tiles, prompt bridge */

export function createCollabShell(opts) {
  const {
    getCollab,
    getPanScale,
    getFrames,
    getActiveWindowId,
    onHopViewport,
    onPromptSearch,
    onSyncPush,
  } = opts;

  const chatLog = [];
  const videoStreams = new Map();
  let localVideo = null;

  const els = ensureDom();

  function ensureDom() {
    const wrap = document.getElementById("canvas-wrap");
    if (!wrap) return {};

    let toolbar = document.getElementById("user-window-toolbar");
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = "user-window-toolbar";
      toolbar.innerHTML = `
        <div class="uwt-handle">
          <span class="uwt-dot" id="uwt-sync-dot" title="sync">●</span>
          <input id="uwt-handle" type="text" maxlength="24" placeholder="handle" aria-label="User handle" />
        </div>
        <div class="uwt-peers" id="uwt-peers"></div>
        <div class="uwt-actions">
          <button type="button" id="uwt-sync" title="Push sync">↻</button>
          <button type="button" id="uwt-video" title="Toggle video">📷</button>
        </div>
      `;
      wrap.appendChild(toolbar);
    }

    let chat = document.getElementById("window-chat-strip");
    if (!chat) {
      chat = document.createElement("div");
      chat.id = "window-chat-strip";
      chat.innerHTML = `
        <div class="wcs-messages" id="wcs-messages"></div>
        <input id="wcs-input" type="text" placeholder="chat…" enterkeyhint="send" autocomplete="off" />
        <button type="button" id="wcs-send">↵</button>
      `;
      wrap.appendChild(chat);
    }

    let overlays = document.getElementById("canvas-overlays");
    if (!overlays) {
      overlays = document.createElement("div");
      overlays.id = "canvas-overlays";
      wrap.appendChild(overlays);
    }

    return { toolbar, chat, overlays, handle: toolbar.querySelector("#uwt-handle"), peers: toolbar.querySelector("#uwt-peers"), syncDot: toolbar.querySelector("#uwt-sync-dot"), messages: chat.querySelector("#wcs-messages"), chatInput: chat.querySelector("#wcs-input") };
  }

  function loadHandle() {
    const saved = localStorage.getItem("qbpm-collab-name") || "";
    if (els.handle) els.handle.value = saved;
    const c = getCollab?.();
    if (c && saved) c.setName(saved);
  }

  function bindEvents() {
    els.handle?.addEventListener("change", () => {
      const name = els.handle.value.trim() || "guest";
      localStorage.setItem("qbpm-collab-name", name);
      getCollab?.()?.setName(name);
      getCollab?.()?.sendJoin?.();
    });

    document.getElementById("uwt-sync")?.addEventListener("click", () => {
      onSyncPush?.();
      flashSync("pushed");
    });

    document.getElementById("uwt-video")?.addEventListener("click", () => toggleLocalVideo());

    const sendChat = () => {
      const text = els.chatInput?.value?.trim();
      if (!text) return;
      getCollab?.()?.sendChat(text);
      els.chatInput.value = "";
    };
    document.getElementById("wcs-send")?.addEventListener("click", sendChat);
    els.chatInput?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); sendChat(); }
    });

    const promptIn = document.getElementById("prompt-search-in");
    const promptGo = document.getElementById("prompt-search-go");
    const runPrompt = () => {
      const q = promptIn?.value?.trim();
      if (!q) return;
      onPromptSearch?.(q);
      appendPromptOutput(`> ${q}`);
    };
    promptGo?.addEventListener("click", runPrompt);
    promptIn?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); runPrompt(); }
    });
  }

  function flashSync(state) {
    if (!els.syncDot) return;
    els.syncDot.classList.remove("sync-ok", "sync-warn", "sync-push");
    if (state === "ok") els.syncDot.classList.add("sync-ok");
    else if (state === "warn") els.syncDot.classList.add("sync-warn");
    else els.syncDot.classList.add("sync-push");
  }

  function renderPeers(peerList) {
    if (!els.peers) return;
    els.peers.innerHTML = "";
    for (const p of peerList) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "uwt-peer";
      btn.title = `Hop to ${p.name || p.clientId}`;
      btn.style.borderColor = p.color || "#58a6ff";
      btn.textContent = (p.name || p.clientId).slice(0, 8);
      btn.addEventListener("click", () => {
        if (p.viewport?.pan) onHopViewport?.(p.viewport);
        getCollab?.()?.requestHop?.(p.clientId);
      });
      els.peers.appendChild(btn);
    }
  }

  function appendChat(msg) {
    chatLog.push(msg);
    if (chatLog.length > 80) chatLog.shift();
    if (!els.messages) return;
    const line = document.createElement("div");
    line.className = "wcs-line";
    const who = msg.fromName || msg.from || "sys";
    line.innerHTML = `<span class="wcs-who" style="color:${msg.color || '#8b949e'}">${who}</span> <span class="wcs-text">${escapeHtml(msg.text)}</span>`;
    els.messages.appendChild(line);
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function appendPromptOutput(text) {
    const out = document.getElementById("prompt-search-out");
    if (!out) return;
    const line = document.createElement("div");
    line.className = "prompt-line";
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  async function toggleLocalVideo() {
    if (localVideo) {
      localVideo.getTracks().forEach((t) => t.stop());
      localVideo = null;
      getCollab?.()?.sendVideo({ active: false });
      return;
    }
    try {
      localVideo = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      getCollab?.()?.sendVideo({ active: true, roomId: getActiveWindowId?.() || "main" });
      attachLocalVideoToFrame(localVideo);
    } catch (err) {
      appendPromptOutput(`video error: ${err.message}`);
    }
  }

  function attachLocalVideoToFrame(stream) {
    const frameId = getFrames?.()?.find((f) => f.id)?.id || "frame-main";
    let tile = document.querySelector(`[data-video-tile="${frameId}-local"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "frame-video-tile local";
      tile.dataset.videoTile = `${frameId}-local`;
      const vid = document.createElement("video");
      vid.autoplay = true;
      vid.muted = true;
      vid.playsInline = true;
      tile.appendChild(vid);
      els.overlays?.appendChild(tile);
    }
    const vid = tile.querySelector("video");
    if (vid) vid.srcObject = stream;
    positionOverlays();
  }

  function onRemoteVideo(msg) {
    if (!msg.active) {
      const tile = document.querySelector(`[data-video-tile="${msg.clientId}"]`);
      tile?.remove();
      videoStreams.delete(msg.clientId);
      return;
    }
    videoStreams.set(msg.clientId, msg);
    let tile = document.querySelector(`[data-video-tile="${msg.clientId}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "frame-video-tile remote";
      tile.dataset.videoTile = msg.clientId;
      tile.innerHTML = `<span class="fvt-label">${msg.name || msg.clientId}</span><div class="fvt-placeholder">📹 ${msg.name || "peer"}</div>`;
      els.overlays?.appendChild(tile);
    }
    positionOverlays();
  }

  function worldToScreen(wx, wy, pan, scale) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }

  function positionOverlays() {
    const { pan, scale } = getPanScale?.() || { pan: { x: 0, y: 0 }, scale: 1 };
    const frameList = getFrames?.() || [];
    const mainFrame = frameList.find((f) => f.id === "frame-main") || frameList[0];
    if (!mainFrame || !els.overlays) return;
    const [fx, fy, fw, fh] = mainFrame.rect;
    const tiles = els.overlays.querySelectorAll(".frame-video-tile");
    tiles.forEach((tile, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const tw = Math.min(160, fw * scale * 0.18);
      const th = tw * 0.75;
      const wx = fx + fw - tw / scale - 12 / scale - col * (tw / scale + 8 / scale);
      const wy = fy + 28 / scale + row * (th / scale + 8 / scale);
      const scr = worldToScreen(wx, wy, pan, scale);
      tile.style.left = `${scr.x}px`;
      tile.style.top = `${scr.y}px`;
      tile.style.width = `${tw}px`;
      tile.style.height = `${th}px`;
    });
  }

  loadHandle();
  bindEvents();

  return {
    renderPeers,
    appendChat,
    appendPromptOutput,
    onRemoteVideo,
    positionOverlays,
    flashSync,
  };
}