/** vwall — multi-stream group room (X-style) with capacity / lag hints */

const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
const ROOM_CAPACITY_MAX = 16;

export const PIN_SLOTS = [
  { id: "pin:moderator", role: "moderator", label: "mod", color: "#d29922" },
  { id: "pin:musician", role: "musician", label: "mus", color: "#3fb950" },
];

function drawPinPlaceholder(ctx, size, role, color) {
  if (!ctx) return;
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = color || "#484f58";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
  ctx.fillStyle = color || "#484f58";
  ctx.font = `${Math.floor(size * 0.28)}px Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyph = role === "moderator" ? "M" : role === "musician" ? "♪" : "📹";
  ctx.fillText(glyph, size / 2, size / 2);
}

export function capacityWeight(w, h) {
  const mp = ((w || 640) * (h || 360)) / 1e6;
  if (mp <= 0.08) return 0.25;
  if (mp <= 0.31) return 0.5;
  if (mp <= 0.92) return 1;
  if (mp <= 2.1) return 1.75;
  return Math.min(4, 2 + mp * 0.5);
}

export function lagLabel(total) {
  const ratio = total / ROOM_CAPACITY_MAX;
  if (ratio < 0.45) return { level: "ok", text: "smooth" };
  if (ratio < 0.8) return { level: "warn", text: "watch load" };
  return { level: "lag", text: "lag likely" };
}

function thumbCanvas(video, size = 32) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx || !video?.videoWidth) return c;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const side = Math.min(vw, vh);
  const sx = (vw - side) / 2;
  const sy = (vh - side) / 2;
  ctx.drawImage(video, sx, sy, side, side, 0, 0, size, size);
  return c;
}

export function createVideoWall(opts = {}) {
  const {
    getCollab = () => null,
    getPeers = () => [],
    getLocalClientId = () => "local",
    getLocalHandle = () => "guest",
    getLocalColor = () => "#58a6ff",
    getRoomId = () => "main",
    onStatus,
    onCapacityChange,
  } = opts;

  const tiles = new Map();
  const pcs = new Map();
  const pendingIce = new Map();
  const pinBindings = new Map(PIN_SLOTS.map((s) => [s.role, s.id]));
  let localStream = null;
  let hostEl = null;
  let thumbStrip = null;
  let thumbRaf = 0;
  let localMeta = { width: 0, height: 0, capacity: 0 };

  PIN_SLOTS.forEach((slot) => {
    ensureTile(slot.id, {
      name: slot.label,
      color: slot.color,
      active: false,
      pinned: true,
      role: slot.role,
      local: false,
    });
  });

  function ensureTile(id, info = {}) {
    if (!tiles.has(id)) {
      tiles.set(id, {
        id,
        name: info.name || id,
        color: info.color || "#58a6ff",
        active: false,
        stream: null,
        width: 0,
        height: 0,
        capacity: 0,
        local: !!info.local,
        roomId: info.roomId || "main",
      });
    }
    const t = tiles.get(id);
    Object.assign(t, info);
    return t;
  }

  function totalCapacity() {
    let sum = 0;
    for (const t of tiles.values()) {
      if (t.active) sum += t.capacity || 0;
    }
    return sum;
  }

  function capacityReport() {
    const total = totalCapacity();
    const lag = lagLabel(total);
    const users = [];
    for (const t of tiles.values()) {
      if (!t.active) continue;
      users.push({
        id: t.id,
        name: t.name,
        width: t.width,
        height: t.height,
        capacity: t.capacity,
        local: t.local,
        color: t.color,
      });
    }
    users.sort((a, b) => b.capacity - a.capacity);
    return { total, max: ROOM_CAPACITY_MAX, lag, users };
  }

  function notifyCapacity() {
    const report = capacityReport();
    onCapacityChange?.(report);
    renderWall();
    renderThumbStrip();
    return report;
  }

  function sendVideoPayload(payload) {
    getCollab()?.sendVideo?.(payload);
  }

  function sendSignal(payload) {
    getCollab()?.sendVideoSignal?.(payload);
  }

  function readStreamMeta(stream) {
    const track = stream?.getVideoTracks?.()?.[0];
    const settings = track?.getSettings?.() || {};
    const w = settings.width || 640;
    const h = settings.height || 360;
    return { width: w, height: h, capacity: capacityWeight(w, h) };
  }

  async function toggleLocal() {
    if (localStream) {
      stopLocal();
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      startLocal(stream);
      return true;
    } catch (err) {
      onStatus?.(`camera: ${err.message}`);
      return false;
    }
  }

  function startLocal(stream) {
    localStream = stream;
    const id = getLocalClientId();
    const meta = readStreamMeta(stream);
    localMeta = meta;
    const tile = ensureTile(id, {
      name: getLocalHandle(),
      color: getLocalColor(),
      local: true,
      active: true,
      stream,
      roomId: getRoomId(),
      ...meta,
    });
    tile.active = true;
    tile.stream = stream;
    sendVideoPayload({
      active: true,
      roomId: getRoomId(),
      width: meta.width,
      height: meta.height,
      capacity: meta.capacity,
    });
    for (const p of getPeers()) {
      if (p.clientId && p.clientId !== id) connectToPeer(p.clientId, true);
    }
    notifyCapacity();
    onStatus?.(`live · ${meta.width}×${meta.height} · cap ${meta.capacity.toFixed(1)}`);
  }

  function stopLocal() {
    const id = getLocalClientId();
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    for (const pid of [...pcs.keys()]) closePeer(pid);
    const tile = tiles.get(id);
    if (tile) {
      tile.active = false;
      tile.stream = null;
    }
    sendVideoPayload({ active: false, roomId: getRoomId() });
    notifyCapacity();
    onStatus?.("camera off");
  }

  function closePeer(peerId) {
    const pc = pcs.get(peerId);
    if (pc) {
      pc.close();
      pcs.delete(peerId);
    }
    pendingIce.delete(peerId);
  }

  async function connectToPeer(peerId, polite = false) {
    if (!localStream || peerId === getLocalClientId() || pcs.has(peerId)) return;
    const pc = new RTCPeerConnection({ iceServers: STUN });
    pcs.set(peerId, pc);
    localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
    pc.ontrack = (ev) => {
      const stream = ev.streams[0];
      const meta = readStreamMeta(stream);
      const tile = tiles.get(peerId);
      if (tile) {
        tile.stream = stream;
        tile.width = meta.width;
        tile.height = meta.height;
        tile.capacity = meta.capacity;
      }
      notifyCapacity();
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        sendSignal({ to: peerId, signalType: "ice", candidate: ev.candidate });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        closePeer(peerId);
      }
    };
    if (polite) return;
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal({ to: peerId, signalType: "offer", sdp: offer });
    } catch (err) {
      closePeer(peerId);
      onStatus?.(`webrtc offer: ${err.message}`);
    }
  }

  async function handleSignal(msg) {
    const from = msg.from || msg.clientId;
    if (!from || from === getLocalClientId()) return;
    const type = msg.signalType || msg.type;
    let pc = pcs.get(from);

    if (type === "offer") {
      if (!pc) {
        pc = new RTCPeerConnection({ iceServers: STUN });
        pcs.set(from, pc);
        if (localStream) {
          localStream.getTracks().forEach((tr) => pc.addTrack(tr, localStream));
        }
        pc.ontrack = (ev) => {
          const stream = ev.streams[0];
          const meta = readStreamMeta(stream);
          const tile = tiles.get(from);
          if (tile) {
            tile.stream = stream;
            Object.assign(tile, meta);
          }
          notifyCapacity();
        };
        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            sendSignal({ to: from, signalType: "ice", candidate: ev.candidate });
          }
        };
      }
      try {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal({ to: from, signalType: "answer", sdp: answer });
        const queued = pendingIce.get(from) || [];
        for (const c of queued) await pc.addIceCandidate(c);
        pendingIce.delete(from);
      } catch (err) {
        onStatus?.(`webrtc answer: ${err.message}`);
      }
      return;
    }

    if (!pc) return;

    if (type === "answer") {
      try {
        await pc.setRemoteDescription(msg.sdp);
        const queued = pendingIce.get(from) || [];
        for (const c of queued) await pc.addIceCandidate(c);
        pendingIce.delete(from);
      } catch (err) {
        onStatus?.(`webrtc remote: ${err.message}`);
      }
    } else if (type === "ice" && msg.candidate) {
      try {
        if (pc.remoteDescription) await pc.addIceCandidate(msg.candidate);
        else {
          const q = pendingIce.get(from) || [];
          q.push(msg.candidate);
          pendingIce.set(from, q);
        }
      } catch (_) {}
    }
  }

  function onRemoteVideo(msg) {
    const id = msg.clientId;
    if (!msg.active) {
      closePeer(id);
      const tile = tiles.get(id);
      if (tile) {
        tile.active = false;
        tile.stream = null;
      }
      notifyCapacity();
      return;
    }
    ensureTile(id, {
      name: msg.name || id,
      color: msg.color || "#58a6ff",
      active: true,
      roomId: msg.roomId || "main",
      width: msg.width || 640,
      height: msg.height || 360,
      capacity: msg.capacity || capacityWeight(msg.width, msg.height),
      local: false,
    });
    if (localStream) connectToPeer(id, getLocalClientId() > id);
    notifyCapacity();
  }

  function onPresence(peers) {
    const live = new Set(peers.map((p) => p.clientId));
    for (const [id, tile] of tiles) {
      if (!tile.local && tile.active && !live.has(id)) {
        closePeer(id);
        tile.active = false;
        tile.stream = null;
      }
    }
    autoAssignPins(peers);
    notifyCapacity();
  }

  function mountWall(el) {
    hostEl = el;
    if (!hostEl) return;
    hostEl.innerHTML = `
      <div class="vw-cap-bar">
        <span class="vw-cap-lbl">vwall</span>
        <div class="vw-cap-track"><div class="vw-cap-fill" id="vw-cap-fill"></div></div>
        <span class="vw-cap-total" id="vw-cap-total">0 / ${ROOM_CAPACITY_MAX}</span>
        <span class="vw-cap-risk" id="vw-cap-risk">smooth</span>
      </div>
      <div class="vw-user-chips" id="vw-user-chips"></div>
      <div class="vw-grid" id="vw-grid" aria-label="Group video wall"></div>
    `;
    renderWall();
  }

  function mountThumbStrip(el) {
    thumbStrip = el;
    renderThumbStrip();
    const loop = () => {
      if (thumbStrip) renderThumbStrip(true);
      thumbRaf = requestAnimationFrame(loop);
    };
    thumbRaf = requestAnimationFrame(loop);
  }

  function renderWall() {
    if (!hostEl) return;
    const report = capacityReport();
    const fill = hostEl.querySelector("#vw-cap-fill");
    const totalEl = hostEl.querySelector("#vw-cap-total");
    const riskEl = hostEl.querySelector("#vw-cap-risk");
    const chips = hostEl.querySelector("#vw-user-chips");
    const grid = hostEl.querySelector("#vw-grid");
    if (!grid) return;

    const pct = Math.min(100, (report.total / report.max) * 100);
    if (fill) {
      fill.style.width = `${pct}%`;
      fill.dataset.level = report.lag.level;
    }
    if (totalEl) totalEl.textContent = `${report.total.toFixed(1)} / ${report.max}`;
    if (riskEl) {
      riskEl.textContent = report.lag.text;
      riskEl.dataset.level = report.lag.level;
    }

    if (chips) {
      chips.innerHTML = report.users
        .map(
          (u) =>
            `<span class="vw-chip" data-level="${report.lag.level}" style="border-color:${u.color}">` +
            `<span class="vw-chip-name">${escapeHtml(u.name.slice(0, 10))}</span>` +
            `<span class="vw-chip-res">${u.width}×${u.height}</span>` +
            `<span class="vw-chip-cap" title="Capacity weight">⚡${u.capacity.toFixed(1)}</span>` +
            `</span>`,
        )
        .join("");
    }

    const activeIds = new Set(report.users.map((u) => u.id));
    grid.querySelectorAll(".vw-tile").forEach((el) => {
      if (!activeIds.has(el.dataset.tileId)) el.remove();
    });

    for (const u of report.users) {
      let tileEl = grid.querySelector(`[data-tile-id="${u.id}"]`);
      const t = tiles.get(u.id);
      if (!tileEl) {
        tileEl = document.createElement("div");
        tileEl.className = `vw-tile${u.local ? " local" : ""}`;
        tileEl.dataset.tileId = u.id;
        tileEl.dataset.videoTile = u.id;
        tileEl.innerHTML = `
          <video class="vw-tile-vid" muted playsinline autoplay></video>
          <div class="vw-tile-ph">📹</div>
          <div class="vw-tile-meta">
            <span class="vw-tile-name"></span>
            <span class="vw-tile-res"></span>
            <span class="vw-tile-cap"></span>
          </div>`;
        grid.appendChild(tileEl);
      }
      const vid = tileEl.querySelector("video");
      const ph = tileEl.querySelector(".vw-tile-ph");
      if (t?.stream && vid) {
        if (vid.srcObject !== t.stream) vid.srcObject = t.stream;
        vid.style.display = "block";
        if (ph) ph.style.display = "none";
      } else {
        if (vid) vid.style.display = "none";
        if (ph) ph.style.display = "flex";
      }
      tileEl.querySelector(".vw-tile-name").textContent = u.name;
      tileEl.querySelector(".vw-tile-res").textContent = `${u.width}×${u.height}`;
      tileEl.querySelector(".vw-tile-cap").textContent = `⚡${u.capacity.toFixed(1)}`;
      tileEl.style.borderColor = u.color;
    }
  }

  function getPinnedEntries() {
    const entries = [];
    for (const slot of PIN_SLOTS) {
      const tileId = pinBindings.get(slot.role) || slot.id;
      const bound = tiles.get(tileId);
      const live = bound?.active && bound?.stream ? bound : null;
      entries.push({
        id: slot.id,
        pinId: slot.id,
        boundId: live?.id || tileId,
        role: slot.role,
        label: slot.label,
        color: live?.color || slot.color,
        name: live?.name || slot.label,
        active: !!live,
        pinned: true,
        width: live?.width || 0,
        height: live?.height || 0,
        capacity: live?.capacity || 0,
        stream: live?.stream || null,
      });
    }
    return entries;
  }

  function assignPinRole(role, clientId) {
    const slot = PIN_SLOTS.find((s) => s.role === role);
    if (!slot || !clientId) return;
    const peer = tiles.get(clientId);
    if (peer) {
      pinBindings.set(role, clientId);
      peer.role = role;
      peer.pinned = true;
    } else {
      pinBindings.set(role, slot.id);
    }
    renderThumbStrip();
    return pinBindings.get(role);
  }

  function bindPinClick(item, entry) {
    if (item.dataset.pinBound) return;
    item.dataset.pinBound = "1";
    item.addEventListener("click", () => {
      onStatus?.(`pin · ${entry.role} · ${entry.active ? entry.name : "awaiting feed"}`);
      if (entry.active && hostEl) {
        floatDockOpen?.();
        const tileEl = hostEl.querySelector(`[data-tile-id="${entry.boundId}"]`);
        tileEl?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  let floatDockOpen = null;

  function renderThumbStrip(drawOnly = false) {
    if (!thumbStrip) return;
    const report = capacityReport();
    const pins = getPinnedEntries();
    const liveUsers = report.users.filter((u) => !tiles.get(u.id)?.pinned);
    const allEntries = [...pins, ...liveUsers];

    if (!drawOnly) {
      thumbStrip.innerHTML = "";
      if (!allEntries.length) {
        thumbStrip.innerHTML = '<span class="viz-thumb-empty">pin mod · mus · live</span>';
      }
    }

    for (const u of allEntries) {
      const thumbId = u.pinId || u.id;
      const boundId = u.boundId || u.id;
      let item = thumbStrip.querySelector(`[data-thumb-id="${thumbId}"]`);
      const t = tiles.get(boundId);
      if (!item && !drawOnly) {
        item = document.createElement("div");
        item.className = `viz-thumb${u.pinned ? " viz-thumb-pinned" : ""}${u.active ? "" : " offline"}`;
        item.dataset.thumbId = thumbId;
        item.dataset.role = u.role || "";
        const capTxt = u.active ? `⚡${(u.capacity || 0).toFixed(1)}` : "—";
        item.title = u.pinned
          ? `${u.role} · ${u.active ? u.name : "placeholder"} · click pin`
          : `${u.name} · ${u.width}×${u.height} · cap ${(u.capacity || 0).toFixed(1)}`;
        item.innerHTML = `
          <canvas class="viz-thumb-canvas" width="32" height="32"></canvas>
          <span class="viz-thumb-cap">${capTxt}</span>
          <span class="viz-thumb-name">${escapeHtml((u.pinned ? u.role : u.name).slice(0, 6))}</span>`;
        item.style.borderColor = u.color;
        thumbStrip.appendChild(item);
        if (u.pinned) bindPinClick(item, u);
      }
      if (!item) continue;
      item.classList.toggle("offline", !!u.pinned && !u.active);
      item.classList.toggle("live", !!u.active);
      const canvas = item.querySelector("canvas");
      const vid = hostEl?.querySelector(`[data-tile-id="${boundId}"] video`);
      const streamVid = (t?.stream || u.stream)
        ? (() => {
            let hidden = item._hiddenVid;
            if (!hidden) {
              hidden = document.createElement("video");
              hidden.muted = true;
              hidden.playsInline = true;
              hidden.autoplay = true;
              hidden.width = 32;
              hidden.height = 32;
              hidden.style.cssText = "position:fixed;left:-9999px;width:32px;height:32px";
              document.body.appendChild(hidden);
              item._hiddenVid = hidden;
            }
            if (hidden.srcObject !== t.stream) hidden.srcObject = t.stream;
            return hidden;
          })()
        : vid;
      const ctx = canvas?.getContext("2d");
      if (canvas && streamVid?.videoWidth && ctx) {
        const vw = streamVid.videoWidth;
        const vh = streamVid.videoHeight;
        const side = Math.min(vw, vh);
        ctx.drawImage(streamVid, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, 32, 32);
      } else if (canvas && ctx && u.pinned && !u.active) {
        drawPinPlaceholder(ctx, 32, u.role, u.color);
      }
      const cap = item.querySelector(".viz-thumb-cap");
      if (cap) cap.textContent = u.active ? `⚡${(u.capacity || 0).toFixed(1)}` : "—";
      const nameEl = item.querySelector(".viz-thumb-name");
      if (nameEl) nameEl.textContent = (u.pinned ? u.role : u.name).slice(0, 6);
    }
  }

  function autoAssignPins(peers = []) {
    const mods = peers.filter((p) => /mod|host|teacher|grandma/i.test(p.name || ""));
    const mus = peers.filter((p) => /mus|player|kid|piano|dj/i.test(p.name || ""));
    if (mods[0]?.clientId) assignPinRole("moderator", mods[0].clientId);
    if (mus[0]?.clientId) assignPinRole("musician", mus[0].clientId);
    else if (peers[0]?.clientId && !pinBindings.get("musician")?.startsWith?.("pin:")) {
      /* keep */
    } else if (peers[0]?.clientId) assignPinRole("musician", peers[0].clientId);
  }

  function getStreamForPeer(peerId) {
    return tiles.get(peerId)?.stream || null;
  }

  function getLocalStream() {
    return localStream;
  }

  function isLocalLive() {
    return !!localStream;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function destroy() {
    cancelAnimationFrame(thumbRaf);
    stopLocal();
    for (const item of thumbStrip?.querySelectorAll(".viz-thumb") || []) {
      item._hiddenVid?.remove();
    }
    tiles.clear();
    pcs.clear();
    pendingIce.clear();
  }

  return {
    mountWall,
    mountThumbStrip,
    toggleLocal,
    startLocal,
    stopLocal,
    onRemoteVideo,
    onPresence,
    handleSignal,
    getStreamForPeer,
    getLocalStream,
    isLocalLive,
    capacityReport,
    getTiles: () => [...tiles.values()],
    renderWall,
    renderThumbStrip,
    getPinnedEntries,
    assignPinRole,
    setFloatDockOpen: (fn) => { floatDockOpen = fn; },
    PIN_SLOTS,
    destroy,
  };
}