/** Multi-user infinite canvas — presence, graph sync, chat, hop, video */
const COLORS = ["#9ca3af", "#8b949e", "#7d8590", "#b1bac4", "#6e7681", "#a8b0bc"];

export function createCanvasCollab(opts) {
  const {
    graphName = "default",
    onGraphPatch,
    onGraphFull,
    onFrameUpdate,
    onPresence,
    onChat,
    onHop,
    onVideo,
    onJam,
    onDrawOverlay,
  } = opts;

  let ws = null;
  let clientId = `user-${Math.random().toString(16).slice(2, 8)}`;
  let name = localStorage.getItem("qbpm-collab-name") || `user-${clientId.slice(-4)}`;
  let color = localStorage.getItem("qbpm-collab-color") || COLORS[Math.floor(Math.random() * COLORS.length)];
  const peers = new Map();
  let reconnectTimer = null;
  let lastRev = 0;

  function connect() {
    if (typeof window !== "undefined" && window.QBPM_PAGES?.staticShell) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/api/graph/ws?graph=${encodeURIComponent(graphName)}`);
    ws.onopen = () => sendJoin();
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "state") {
        clientId = msg.clientId || clientId;
        lastRev = msg.rev || 0;
        (msg.clients || []).forEach(ingestPeer);
        onPresence?.(Array.from(peers.values()));
        (msg.chat || []).forEach((m) => onChat?.(m));
        if (msg.graph && onGraphFull) onGraphFull(msg.graph, msg.rev);
        return;
      }
      if (msg.type === "presence") {
        peers.clear();
        (msg.clients || []).forEach(ingestPeer);
        onPresence?.(Array.from(peers.values()));
        return;
      }
      if (msg.type === "chat") {
        onChat?.(msg);
        return;
      }
      if (msg.type === "jam") {
        onJam?.(msg);
        return;
      }
      if (msg.type === "hop" && msg.clientId !== clientId) {
        onHop?.(msg);
        return;
      }
      if (msg.type === "video") {
        onVideo?.(msg);
        return;
      }
      if (msg.type === "cursor" && msg.clientId !== clientId) {
        const p = peers.get(msg.clientId) || { clientId: msg.clientId };
        p.x = msg.x; p.y = msg.y; p.name = msg.name; p.color = msg.color;
        peers.set(msg.clientId, p);
        onDrawOverlay?.();
        return;
      }
      if (msg.type === "viewport" && msg.clientId !== clientId) {
        const p = peers.get(msg.clientId) || { clientId: msg.clientId };
        p.viewport = { pan: msg.pan, scale: msg.scale, frameId: msg.frameId, windowId: msg.windowId };
        peers.set(msg.clientId, p);
        onDrawOverlay?.();
        return;
      }
      if (msg.type === "graph.patch" && msg.rev > lastRev) {
        lastRev = msg.rev;
        onGraphPatch?.(msg.patch, msg.rev, msg.from);
        return;
      }
      if (msg.type === "graph.full" && msg.rev > lastRev) {
        lastRev = msg.rev;
        onGraphFull?.(msg.graph, msg.rev, msg.from);
        return;
      }
      if (msg.type === "frame.update" && msg.rev > lastRev) {
        lastRev = msg.rev;
        onFrameUpdate?.(msg.frames, msg.viewports, msg.frameEdges, msg.rev, msg.from);
      }
    };
    ws.onclose = () => {
      reconnectTimer = setTimeout(connect, 2500);
    };
  }

  function ingestPeer(c) {
    if (c.clientId === clientId) return;
    peers.set(c.clientId, { ...c, x: c.cursor?.[0], y: c.cursor?.[1] });
  }

  function sendJoin() {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "join", clientId, name, color }));
  }

  function sendCursor(wx, wy) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "cursor", x: wx, y: wy }));
  }

  function sendViewport(pan, scale, frameId, windowId) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "viewport", pan, scale, frameId, windowId }));
  }

  function sendChat(text) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "chat", text, name, color }));
  }

  function sendJam(pattern) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "jam", pattern, name, color }));
  }

  function requestHop(targetId) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "hop.request", targetId }));
  }

  function sendVideo(payload) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "video", ...payload, name }));
  }

  function broadcastGraph(graph) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "graph.full", graph }));
  }

  function broadcastPatch(patch) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "graph.patch", patch }));
  }

  function broadcastFrames(frames, viewports, frameEdges) {
    if (!ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({ type: "frame.update", frames, viewports, frameEdges: frameEdges || [] }));
  }

  function drawPeers(ctx, pan, scale) {
    for (const p of peers.values()) {
      if (p.x == null) continue;
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(scale, scale);
      ctx.fillStyle = p.color || "#58a6ff";
      ctx.strokeStyle = "#0d1117";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6 / scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = p.color || "#58a6ff";
      ctx.font = `${10 / scale}px Menlo, monospace`;
      ctx.fillText(p.name || p.clientId, p.x + 8 / scale, p.y - 8 / scale);
      if (p.viewport?.pan) {
        ctx.strokeStyle = `${p.color || "#58a6ff"}44`;
        ctx.lineWidth = 1 / scale;
        ctx.setLineDash([4 / scale, 4 / scale]);
        const [px, py] = p.viewport.pan;
        const ps = p.viewport.scale || 1;
        const wrap = document.getElementById("canvas-wrap");
        if (wrap) {
          const ww = wrap.clientWidth / ps;
          const wh = wrap.clientHeight / ps;
          const vx = -px / ps;
          const vy = -py / ps;
          ctx.strokeRect(vx, vy, ww, wh);
        }
        ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  connect();

  return {
    get clientId() { return clientId; },
    get peers() { return peers; },
    sendJoin,
    sendCursor,
    sendViewport,
    sendChat,
    sendJam,
    requestHop,
    sendVideo,
    broadcastGraph,
    broadcastPatch,
    broadcastFrames,
    drawPeers,
    setName(n) { name = n; localStorage.setItem("qbpm-collab-name", n); },
    setColor(c) { color = c; localStorage.setItem("qbpm-collab-color", c); },
  };
}