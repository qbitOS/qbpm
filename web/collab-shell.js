/** Collaborative shell — frame-anchored user badge, dock chat, frame video tiles */

export function createCollabShell(opts) {
  const {
    getCollab,
    getPanScale,
    getFrames,
    getActiveWindowId,
    getLocalHandle = () => "guest",
    getLocalColor = () => "#58a6ff",
    getLocalClientId = () => "local",
    onHopViewport,
    onPromptSearch,
    onSyncPush,
  } = opts;

  const videoStreams = new Map();
  let localVideo = null;

  const els = ensureDom();

  function ensureDom() {
    const wrap = document.getElementById("canvas-wrap");
    if (!wrap) return {};

    let badge = document.getElementById("user-frame-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "user-frame-badge";
      badge.innerHTML = `
        <div class="ufb-id" title="Your session id">
          <span class="ufb-dot" id="uwt-sync-dot">●</span>
          <input id="uwt-handle" type="text" maxlength="24" placeholder="handle" aria-label="User handle" />
          <span class="ufb-cid" id="ufb-client-id"></span>
        </div>
        <div class="uwt-peers" id="uwt-peers"></div>
        <div class="uwt-actions">
          <button type="button" id="uwt-sync" title="Push sync">↻</button>
          <button type="button" id="uwt-video" title="Toggle video">📷</button>
        </div>
      `;
      wrap.appendChild(badge);
    }

    let overlays = document.getElementById("canvas-overlays");
    if (!overlays) {
      overlays = document.createElement("div");
      overlays.id = "canvas-overlays";
      wrap.appendChild(overlays);
    }

    return {
      badge,
      overlays,
      handle: badge.querySelector("#uwt-handle"),
      peers: badge.querySelector("#uwt-peers"),
      syncDot: badge.querySelector("#uwt-sync-dot"),
      clientIdEl: badge.querySelector("#ufb-client-id"),
    };
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

  function appendChat(_msg) {
    /* chat routed via float-workspace */
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

  function positionUserBadge() {
    const badge = els.badge;
    if (!badge) return;
    const { pan, scale } = getPanScale?.() || { pan: { x: 0, y: 0 }, scale: 1 };
    const frameList = getFrames?.() || [];
    const mainFrame = frameList.find((f) => f.id === "frame-main") || frameList[0];
    const cid = getLocalClientId?.() || "local";
    if (els.clientIdEl && els.clientIdEl.textContent !== cid.slice(-6)) {
      els.clientIdEl.textContent = cid.slice(-6);
      els.clientIdEl.style.color = getLocalColor?.() || "#58a6ff";
    }
    if (!mainFrame) {
      if (badge._lx !== 10) {
        badge._lx = 10;
        badge._ly = 48;
        badge.style.transform = "translate3d(10px,48px,0)";
      }
      return;
    }
    const [fx, fy] = mainFrame.rect;
    const scr = worldToScreen(fx, fy, pan, scale);
    const bw = badge._bw || 180;
    const lx = Math.max(8, Math.round(scr.x - bw - 6));
    const ly = Math.max(48, Math.round(scr.y - 4));
    if (badge._lx !== lx || badge._ly !== ly) {
      badge._lx = lx;
      badge._ly = ly;
      badge.style.transform = `translate3d(${lx}px,${ly}px,0)`;
    }
  }

  function positionOverlays() {
    positionUserBadge();
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
    positionUserBadge,
    flashSync,
  };
}