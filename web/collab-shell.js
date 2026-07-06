/** Collaborative shell — frame-anchored user dock, frame video tiles */

export function createCollabShell(opts) {
  const {
    getCollab,
    getPanScale,
    getFrames,
    getActiveWindowId,
    getLocalHandle = () => "guest",
    getLocalColor = () => "#58a6ff",
    getLocalClientId = () => "local",
    getFloatWorkspace,
    getVideoWall,
    onHopViewport,
    onHopFrame,
    onPromptSearch,
    onSyncPush,
  } = opts;

  let lastPeerList = [];

  const els = ensureDom();

  function ensureDom() {
    const host = document.getElementById("header-dock") || document.getElementById("canvas-wrap");
    if (!host) return {};

    let badge = document.getElementById("user-frame-badge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "user-frame-badge";
      badge.className = "header-dock-badge";
      badge.innerHTML = `
        <div class="ufb-id" title="Your session id">
          <span class="ufb-dot" id="uwt-sync-dot">●</span>
          <input id="uwt-handle" type="text" maxlength="24" placeholder="handle" aria-label="User handle" />
          <span class="ufb-cid" id="ufb-client-id"></span>
        </div>
        <div class="ufb-search-row">
          <input id="user-search" type="search" placeholder="find user · hop…" autocomplete="off" spellcheck="false" aria-label="Find user" />
          <button type="button" id="user-search-go" title="Hop to user">◎</button>
        </div>
        <div class="uwt-peers" id="uwt-peers"></div>
        <div class="uwt-actions">
          <button type="button" id="uwt-sync" title="Push sync">↻</button>
          <button type="button" id="uwt-video" title="Toggle video">📷</button>
        </div>
      `;
      host.appendChild(badge);
    }

    const wrap = document.getElementById("canvas-wrap");
    let overlays = document.getElementById("canvas-overlays");
    if (!overlays && wrap) {
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

    const userSearch = document.getElementById("user-search");
    const userSearchGo = document.getElementById("user-search-go");
    const runUserSearch = () => {
      const q = userSearch?.value?.trim().toLowerCase();
      if (!q) return;
      const match = lastPeerList.find(
        (p) =>
          (p.name || "").toLowerCase().includes(q) ||
          (p.clientId || "").toLowerCase().includes(q),
      );
      if (match) {
        if (match.viewport?.pan) onHopViewport?.(match.viewport);
        else {
          const frame = getFrames?.()?.find((f) => f.clientId === match.clientId);
          if (frame) onHopFrame?.(frame);
        }
        getCollab?.()?.requestHop?.(match.clientId);
      }
    };
    userSearchGo?.addEventListener("click", runUserSearch);
    userSearch?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); runUserSearch(); }
    });
    userSearch?.addEventListener("input", () => filterPeers(userSearch.value));

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

  function filterPeers(query) {
    const needle = query.trim().toLowerCase();
    els.peers?.querySelectorAll(".uwt-peer").forEach((btn) => {
      const text = btn.textContent.toLowerCase();
      const title = (btn.title || "").toLowerCase();
      btn.style.display = !needle || text.includes(needle) || title.includes(needle) ? "" : "none";
    });
  }

  function renderPeers(peerList) {
    lastPeerList = peerList;
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
        else {
          const frame = getFrames?.()?.find((f) => f.clientId === p.clientId);
          if (frame) onHopFrame?.(frame);
        }
        getCollab?.()?.requestHop?.(p.clientId);
      });
      els.peers.appendChild(btn);
    }
    const q = document.getElementById("user-search")?.value;
    if (q) filterPeers(q);
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
    const vw = getVideoWall?.();
    if (!vw) {
      appendPromptOutput("video wall not ready");
      return;
    }
    try {
      const on = await vw.toggleLocal();
      getFloatWorkspace?.()?.openDockPanel?.("video");
      if (on) attachLocalVideoToFrame(vw.getLocalStream());
      else detachFrameTiles();
      const report = vw.capacityReport?.();
      if (report) {
        appendPromptOutput(`vwall ${report.lag.text} · ${report.total.toFixed(1)}/${report.max} cap`);
      }
    } catch (err) {
      appendPromptOutput(`video error: ${err.message}`);
    }
  }

  function attachLocalVideoToFrame(stream) {
    if (!stream) return;
    const frameId = getFrames?.()?.find((f) => f.id)?.id || "frame-main";
    const localId = getLocalClientId?.() || "local";
    let tile = document.querySelector(`[data-video-tile="${localId}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "frame-video-tile local";
      tile.dataset.videoTile = localId;
      const vid = document.createElement("video");
      vid.autoplay = true;
      vid.muted = true;
      vid.playsInline = true;
      tile.appendChild(vid);
      const lbl = document.createElement("span");
      lbl.className = "fvt-label";
      lbl.textContent = getLocalHandle?.() || "you";
      tile.appendChild(lbl);
      els.overlays?.appendChild(tile);
    }
    const vid = tile.querySelector("video");
    if (vid) vid.srcObject = stream;
    positionOverlays();
  }

  function detachFrameTiles() {
    const localId = getLocalClientId?.() || "local";
    document.querySelector(`[data-video-tile="${localId}"]`)?.remove();
    positionOverlays();
  }

  function onRemoteVideo(msg) {
    getVideoWall?.()?.onRemoteVideo?.(msg);
    if (!msg.active) {
      document.querySelector(`[data-video-tile="${msg.clientId}"]`)?.remove();
      positionOverlays();
      return;
    }
    let tile = document.querySelector(`[data-video-tile="${msg.clientId}"]`);
    if (!tile) {
      tile = document.createElement("div");
      tile.className = "frame-video-tile remote";
      tile.dataset.videoTile = msg.clientId;
      tile.innerHTML = `
        <video muted playsinline autoplay></video>
        <span class="fvt-label">${escapeHtml(msg.name || msg.clientId)}</span>
        <div class="fvt-placeholder">📹 ${escapeHtml(msg.name || "peer")}</div>
        <span class="fvt-cap">⚡${Number(msg.capacity || 1).toFixed(1)} · ${msg.width || "?"}×${msg.height || "?"}</span>`;
      els.overlays?.appendChild(tile);
    }
    const vw = getVideoWall?.();
    const stream = vw?.getStreamForPeer?.(msg.clientId);
    const vid = tile.querySelector("video");
    const ph = tile.querySelector(".fvt-placeholder");
    if (stream && vid) {
      vid.srcObject = stream;
      vid.style.display = "block";
      if (ph) ph.style.display = "none";
    }
    const cap = tile.querySelector(".fvt-cap");
    if (cap) cap.textContent = `⚡${Number(msg.capacity || 1).toFixed(1)} · ${msg.width || "?"}×${msg.height || "?"}`;
    positionOverlays();
  }

  function worldToScreen(wx, wy, pan, scale) {
    return { x: pan.x + wx * scale, y: pan.y + wy * scale };
  }

  function positionUserBadge() {
    const cid = getLocalClientId?.() || "local";
    if (els.clientIdEl && els.clientIdEl.textContent !== cid.slice(-6)) {
      els.clientIdEl.textContent = cid.slice(-6);
      els.clientIdEl.style.color = getLocalColor?.() || "#58a6ff";
    }
  }

  function positionOverlays() {
    getFloatWorkspace?.()?.positionFramePanels?.();
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
      const vid = tile.querySelector("video");
      const peerId = tile.dataset.videoTile;
      const stream = getVideoWall?.()?.getStreamForPeer?.(peerId);
      if (stream && vid && vid.srcObject !== stream) vid.srcObject = stream;
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