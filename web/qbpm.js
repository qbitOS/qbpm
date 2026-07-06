import { createCanvasCollab } from "./canvas-collab.js";
import { createCollabShell } from "./collab-shell.js";
import { createLiveMusicBridge } from "./live-music-bridge.js";
import { initKbatchPanel, registerQbpmTools, switchKbatchTab } from "./kbatch-panel.js";
import { initToolsPanel } from "./tools-panel.js";
import { createUgradHud } from "./ugrad-hud.js";
import { createFloatWorkspace } from "./float-workspace.js";
import { createLiveJamBridge } from "./live-jam-bridge.js";
import { DEVICE_PRESETS, presetById, presetColor, nextDeviceFrameRect } from "./device-presets.js";
import { framePipelinePorts, VFX, compFillForDevice } from "./vfx-palette.js";
import { drawCompGrid, drawCompWindow, drawBusEdge } from "./vfx-compositor.js";
import { pages } from "./pages.js";
import { formatResolveSummary, isWatchUrl } from "./video-ingest.js";
import { isStrudelUrl } from "./strudel-pane.js";
import { createQubeManager } from "./qube-manager.js";
import { getLocalQubeClientId } from "./qube-store.js";
import { mountInspectorCommandHelp } from "./terminal-commands.js";
import { resolveTransport, drawNodeCycleBar } from "./node-cycle.js";

const GRAPH_NAME = "default";
const NODE_W = 168;
const NODE_H = 64;
const PORT_R = 7;
const FRAME_PORT_R = 8;
const NODE_BTN_GAP = 3;
const NODE_BTN_PAD = 8;
const NODE_CTRL = ["+", "-", "0"];

function nodeBtnSize() {
  return window.matchMedia("(pointer: coarse)").matches ? 44 : 26;
}

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const vizCanvas = document.getElementById("viz-canvas");
const vizCtx = vizCanvas.getContext("2d");
const vizLog = document.getElementById("viz-log");
const workspace = document.getElementById("workspace");

let graph = { version: 1, meta: {}, nodes: [], edges: [] };
let selectedId = null;
let selectedFrameId = null;
let pan = { x: 80, y: 80 };
let scale = 1;
let dragging = null;
let panning = false;
let panStart = null;
let linking = null;
let spaceDown = false;
let touchPanMode = false;
let pinchStart = null;
let lastRun = null;
let alignPrefer = "node";
let vizPhase = 0;
let hoverControl = null;
let activeFrameId = null;
let activeWindowId = null;
let collab = null;
let collabPeers = [];
let viewportBroadcastTimer = null;
let liveBridge = null;
let liveState = null;
let collabShell = null;
let ugradHud = null;
let floatWorkspace = null;
let qubeManager = null;
let jamBridge = null;
let lastProcessingText = "";

function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  const sx = ev.clientX - r.left;
  const sy = ev.clientY - r.top;
  return { sx, sy, wx: (sx - pan.x) / scale, wy: (sy - pan.y) / scale };
}

function resize() {
  const wrap = document.getElementById("canvas-wrap");
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`;
  canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  floatWorkspace?.positionFramePanels?.();
  draw();
  resizeViz();
}
function resizeViz() {
  const rect = vizCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  vizCanvas.width = Math.max(1, Math.floor(rect.width * dpr));
  vizCanvas.height = Math.max(1, Math.floor(rect.height * dpr));
  drawViz();
}
new ResizeObserver(resize).observe(document.getElementById("canvas-wrap"));
new ResizeObserver(resizeViz).observe(vizCanvas);
window.addEventListener("resize", resize);

function nodeRect(n) {
  const [x, y] = n.pos;
  return { x, y, w: NODE_W, h: NODE_H };
}

function ensureParams(n) {
  if (!n.params || typeof n.params !== "object") n.params = {};
  return n.params;
}

function ensureCanvasMeta() {
  if (!graph.meta || typeof graph.meta !== "object") graph.meta = {};
  if (!Array.isArray(graph.meta.frames)) {
    graph.meta.frames = [
      {
        id: "frame-main",
        label: "Main",
        rect: [-400, -300, 2400, 1800],
        color: compFillForDevice("desktop"),
        device: "desktop",
        cluster: "local",
        lane: "comp",
      },
    ];
  }
  if (!Array.isArray(graph.meta.frameEdges)) graph.meta.frameEdges = [];
  if (!graph.meta.pipeline) {
    graph.meta.pipeline = { lanes: ["prompt", "video", "audio", "midi"], daw: true, engine: "qbpm-vfx" };
  }
  if (!Array.isArray(graph.meta.viewports)) {
    graph.meta.viewports = [
      { id: "vp-main", label: "Primary", frameId: "frame-main", pan: [80, 80], scale: 1 },
    ];
  }
  if (!activeFrameId) activeFrameId = graph.meta.frames[0]?.id || null;
  if (!activeWindowId) activeWindowId = graph.meta.viewports[0]?.id || null;
  normalizeFramePalette();
  return graph.meta;
}

function frames() {
  return ensureCanvasMeta().frames;
}

function viewports() {
  return ensureCanvasMeta().viewports;
}

function frameEdges() {
  return ensureCanvasMeta().frameEdges;
}

function frameRect(f) {
  const [x, y, w, h] = f.rect;
  return { x, y, w, h };
}

function frameAt(wx, wy) {
  for (let i = frames().length - 1; i >= 0; i--) {
    const r = frameRect(frames()[i]);
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return frames()[i];
  }
  return null;
}

function broadcastCanvasLayout() {
  collab?.broadcastFrames(frames(), viewports(), frameEdges());
  qubeManager?.scheduleFlush?.("frames");
}

function buildQubeSnapshot() {
  const owner = collab?.clientId || qubeManager?.clientId || getLocalQubeClientId();
  return {
    owner,
    ownerName: localStorage.getItem("qbpm-collab-name") || "guest",
    session: {
      pan: { x: pan.x, y: pan.y },
      scale,
      activeFrameId,
      activeWindowId,
      selectedId,
      liveState: liveState ? { ...liveState } : null,
      rightTab: localStorage.getItem(RIGHT_TAB_KEY),
    },
    frames: frames().map((f) => {
      const c = structuredClone(f);
      return qubeManager?.tagFrame?.(c) || c;
    }),
    viewports: viewports().map((v) => structuredClone(v)),
    nodes: graph.nodes.map((n) => structuredClone(n)),
    workspace: floatWorkspace?.exportState?.() || {},
  };
}

function applyQubePatch(patch) {
  if (!patch) return;
  const meta = ensureCanvasMeta();

  for (const f of patch.frames || []) {
    const tagged = qubeManager?.tagFrame?.(f) || f;
    const i = meta.frames.findIndex((x) => x.id === f.id);
    if (i >= 0) meta.frames[i] = { ...meta.frames[i], ...tagged };
    else meta.frames.push(tagged);
  }

  for (const vp of patch.viewports || []) {
    const i = meta.viewports.findIndex((x) => x.id === vp.id);
    if (i >= 0) meta.viewports[i] = { ...meta.viewports[i], ...vp };
    else meta.viewports.push(vp);
  }

  for (const n of patch.nodes || []) {
    const i = graph.nodes.findIndex((x) => x.id === n.id);
    if (i >= 0) graph.nodes[i] = { ...graph.nodes[i], ...n };
    else graph.nodes.push(n);
  }

  if (patch.session) {
    const s = patch.session;
    if (s.pan) { pan.x = s.pan.x; pan.y = s.pan.y; }
    if (s.scale) scale = s.scale;
    if (s.activeFrameId) activeFrameId = s.activeFrameId;
    if (s.activeWindowId) activeWindowId = s.activeWindowId;
    if (s.liveState) liveState = s.liveState;
    if (s.rightTab) setRightPanelTab(s.rightTab);
    if (s.selectedId) selectNode(s.selectedId);
  }

  if (patch.workspace) floatWorkspace?.importState?.(patch.workspace);

  normalizeFramePalette();
  draw();
  collabShell?.positionOverlays?.();
  vizLog.textContent = "qube compartments restored";
}

function initQubeManager() {
  qubeManager = createQubeManager({
    graphName: GRAPH_NAME,
    getSnapshot: buildQubeSnapshot,
    applySnapshot: applyQubePatch,
  });

  window.addEventListener("beforeunload", () => {
    qubeManager?.flush?.("all");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") qubeManager?.flush?.("all");
  });
  setInterval(() => qubeManager?.scheduleFlush?.("workspace"), 20000);
  window.qbpm = window.qbpm || {};
  window.qbpm.qubes = () => qubeManager;
}

function ensureUserFrame(clientId, name, color) {
  if (!clientId) return null;
  const id = `frame-user-${clientId}`;
  const existing = frames().find((f) => f.id === id);
  if (existing) {
    if (name) {
      existing.label = name;
      existing.owner = name;
    }
    if (color) existing.userColor = color;
    return id;
  }
  const preset = presetById("desktop");
  const main = frames().find((f) => f.id === "frame-main");
  const n = frames().filter((f) => f.cluster === "user").length;
  const origin = {
    x: (main?.rect[0] ?? 0) + 320 + n * 140,
    y: (main?.rect[1] ?? 0) + (main?.rect[3] ?? 1200) + 80,
  };
  const rect = nextDeviceFrameRect(preset, frames(), origin);
  const frame = {
    id,
    label: name || clientId,
    rect,
    color: compFillForDevice("desktop"),
    device: "desktop",
    cluster: "user",
    owner: name || clientId,
    clientId,
    lane: "collab",
  };
  frames().push(qubeManager?.tagFrame?.(frame) || frame);
  broadcastCanvasLayout();
  return id;
}

function buildProcessingText() {
  const lines = [];
  if (liveState?.flow) lines.push(`flow: ${liveState.flow}`);
  if (liveState?.text) lines.push(`text: ${String(liveState.text).slice(0, 40)}`);
  if (liveState?.bpm || liveState?.cpm) lines.push(`bpm: ${liveState.bpm || liveState.cpm}`);
  if (lastRun?.ok != null) lines.push(`run: ${lastRun.ok ? "ok" : "err"} · ${(lastRun.order || []).join("→")}`);
  if (lastRun?.trace?.length) lines.push(`trace: ${lastRun.trace.length} steps`);
  const meta = graph.meta || {};
  if (meta.frames?.length) lines.push(`frames: ${meta.frames.length}`);
  if (collabPeers.length) lines.push(`peers: ${collabPeers.length}`);
  return lines.length ? lines.join("\n") : "idle · awaiting ingest";
}

function syncFloatPanels() {
  const proc = buildProcessingText();
  if (proc !== lastProcessingText) {
    lastProcessingText = proc;
    floatWorkspace?.setProcessing(proc);
  }
  floatWorkspace?.drawNotation(liveState);
}

function updateCanvasResolutionLabel() {
  const el = document.getElementById("canvas-resolution");
  if (!el) return;
  const wrap = document.getElementById("canvas-wrap");
  const dpr = window.devicePixelRatio || 1;
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  const wx0 = -pan.x / scale;
  const wy0 = -pan.y / scale;
  const wx1 = wx0 + cw / scale;
  const wy1 = wy0 + ch / scale;
  const frame = frames().find((f) => f.id === activeFrameId);
  const peers = collabPeers.length ? ` · ${collabPeers.length + 1} users` : "";
  el.textContent = `${Math.round(cw)}×${Math.round(ch)}@${dpr.toFixed(1)}x · world ${Math.round(wx0)},${Math.round(wy0)}→${Math.round(wx1)},${Math.round(wy1)} · ${frame?.label || "canvas"}${peers}`;
}

function framePortPositions(f) {
  return framePipelinePorts(frameRect(f));
}

function normalizeFramePalette() {
  const meta = graph.meta;
  if (!meta) return;
  const frs = meta.frames;
  if (Array.isArray(frs)) {
    for (const f of frs) {
      const c = String(f.color || "").toLowerCase();
      if (!f.color || c.includes("58a6ff") || c.includes("79c0ff") || c.includes("3fb95022")) {
        f.color = compFillForDevice(f.device);
      }
      if (!f.lane) f.lane = f.cluster === "user" ? "collab" : "comp";
    }
  }
  const edges = meta.frameEdges;
  if (Array.isArray(edges)) {
    for (const e of edges) {
      if (e.fromPort === "out-top") e.fromPort = "out-v";
      if (e.fromPort === "out-bottom") e.fromPort = "out-a";
      if (!e.lane && e.bus) e.lane = e.bus === "collab" ? "collab" : e.bus;
    }
  }
}

function framePortAt(wx, wy) {
  for (let i = frames().length - 1; i >= 0; i--) {
    const f = frames()[i];
    for (const p of framePortPositions(f)) {
      const dx = wx - p.x;
      const dy = wy - p.y;
      if (dx * dx + dy * dy <= (FRAME_PORT_R * 2.4) ** 2) {
        return { frame: f, port: p.id, side: p.side, lane: p.lane, x: p.x, y: p.y };
      }
    }
  }
  return null;
}

function drawFrames() {
  for (const e of frameEdges()) {
    drawBusEdge(ctx, e, frames(), framePortPositions, scale);
  }
  for (const f of frames()) {
    drawCompWindow(ctx, f, frameRect(f), f.id === activeFrameId || f.id === selectedFrameId, scale, linking);
  }
  for (const vp of viewports()) {
    if (vp.id === activeWindowId) continue;
    const fr = frames().find((f) => f.id === vp.frameId);
    if (!fr) continue;
    const frRect = frameRect(fr);
    const [vpx, vpy] = vp.pan || [80, 80];
    const vs = vp.scale || 1;
    const wrap = document.getElementById("canvas-wrap");
    const vw = wrap.clientWidth / vs;
    const vh = wrap.clientHeight / vs;
    const vx = -vpx / vs;
    const vy = -vpy / vs;
    if (vx + vw < frRect.x || vy + vh < frRect.y || vx > frRect.x + frRect.w || vy > frRect.y + frRect.h) continue;
    ctx.strokeStyle = "rgba(139,148,158,0.55)";
    ctx.lineWidth = 1.5 / scale;
    ctx.setLineDash([4 / scale, 4 / scale]);
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.setLineDash([]);
    ctx.fillStyle = VFX.textDim;
    ctx.font = `${9 / scale}px Menlo, monospace`;
    ctx.fillText(vp.label || vp.id, vx + 4 / scale, vy + 12 / scale);
  }
}

function addCanvasFrame() {
  const b = graphBounds();
  const id = `frame-${frames().length + 1}`;
  frames().push({
    id,
    label: `Frame ${frames().length + 1}`,
    rect: [b.x - 200, b.y - 200, b.w + 400, b.h + 400],
    color: compFillForDevice("cluster"),
    lane: "comp",
  });
  activeFrameId = id;
  broadcastCanvasLayout();
  draw();
}

function addDeviceFrame(presetId) {
  const preset = presetById(presetId);
  const main = frames().find((f) => f.id === "frame-main");
  const origin = main
    ? { x: main.rect[0] + main.rect[2] + 100, y: main.rect[1] }
    : { x: 200, y: 120 };
  const rect = nextDeviceFrameRect(preset, frames(), origin);
  const owner = localStorage.getItem("qbpm-collab-name") || collab?.clientId || "guest";
  const n = frames().filter((f) => f.device === preset.id).length + 1;
  const id = `frame-${preset.id}-${n}`;
  frames().push({
    id,
    label: `${preset.icon} ${preset.label}`,
    rect,
    color: presetColor(preset.id),
    device: preset.id,
    cluster: preset.cluster,
    owner,
    lane: preset.cluster === "compute" ? "render" : "comp",
  });
  activeFrameId = id;
  broadcastCanvasLayout();
  draw();
  collabShell?.positionOverlays?.();
  vizLog.textContent = `frame ${id} · ${preset.w}×${preset.h} · ${preset.cluster} · vfx`;
}

function addViewportWindow() {
  const id = `vp-${viewports().length + 1}`;
  viewports().push({
    id,
    label: `View ${viewports().length + 1}`,
    frameId: activeFrameId || frames()[0]?.id,
    pan: [pan.x, pan.y],
    scale,
  });
  activeWindowId = id;
  broadcastCanvasLayout();
  draw();
}

function scheduleViewportBroadcast() {
  if (!collab) return;
  clearTimeout(viewportBroadcastTimer);
  viewportBroadcastTimer = setTimeout(() => {
    collab.sendViewport([pan.x, pan.y], scale, activeFrameId, activeWindowId);
    const vp = viewports().find((v) => v.id === activeWindowId);
    if (vp) {
      vp.pan = [pan.x, pan.y];
      vp.scale = scale;
    }
    qubeManager?.scheduleFlush?.("session");
  }, 120);
}

function hopToViewport(vp) {
  if (!vp?.pan) return;
  const px = Array.isArray(vp.pan) ? vp.pan[0] : vp.pan.x;
  const py = Array.isArray(vp.pan) ? vp.pan[1] : vp.pan.y;
  if (px == null || py == null) return;
  pan.x = px;
  pan.y = py;
  if (vp.scale) scale = vp.scale;
  if (vp.frameId) activeFrameId = vp.frameId;
  if (vp.windowId) activeWindowId = vp.windowId;
  scheduleViewportBroadcast();
  draw();
  collabShell?.positionOverlays?.();
}

function hopToFrame(frame) {
  if (!frame?.rect) return;
  const [fx, fy, fw, fh] = frame.rect;
  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  scale = Math.min(cw / Math.max(fw, 120), ch / Math.max(fh, 80)) * 0.82;
  pan.x = cw / 2 - (fx + fw / 2) * scale;
  pan.y = ch / 2 - (fy + fh / 2) * scale;
  activeFrameId = frame.id;
  selectedFrameId = frame.id;
  selectFrame(frame);
  scheduleViewportBroadcast();
  draw();
  collabShell?.positionOverlays?.();
}

function refreshCanvasTargets() {
  floatWorkspace?.refreshSendTargets?.();
}

function setInspectorTab(tab) {
  document.querySelectorAll(".insp-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.insp === tab);
  });
  document.getElementById("insp-node-panel")?.classList.toggle("active", tab === "node");
  document.getElementById("insp-user-panel")?.classList.toggle("active", tab === "user");
}

function selectFrame(frame) {
  if (!frame) {
    selectedFrameId = null;
    document.getElementById("insp-frame-id").value = "";
    document.getElementById("insp-user-name").value = "";
    document.getElementById("insp-user-cid").value = "";
    draw();
    return;
  }
  selectedFrameId = frame.id;
  selectedId = null;
  activeFrameId = frame.id;
  document.getElementById("insp-frame-id").value = frame.id;
  document.getElementById("insp-user-name").value = frame.owner || frame.label || "—";
  document.getElementById("insp-user-cid").value = frame.clientId || "—";
  document.getElementById("insp-id").value = "";
  setInspectorTab(frame.cluster === "user" ? "user" : "node");
  setRightPanelTab("inspector");
  draw();
}

async function ingestWatchUrl(url, opts = {}) {
  const q = String(url || "").trim();
  if (!isWatchUrl(q)) return null;
  try {
    const data = await floatWorkspace?.ingestWatchUrl?.(q, opts);
    if (opts.verbose && data) collabShell?.appendPromptOutput(JSON.stringify(data, null, 2));
    return data;
  } catch (err) {
    collabShell?.appendPromptOutput(`ingest error: ${err.message || err}`);
    return null;
  }
}

async function runPromptSearch(q) {
  collabShell?.appendPromptOutput(`> ${q}`);
  const low = q.toLowerCase();
  if (isWatchUrl(q)) {
    await ingestWatchUrl(q, { verbose: true });
    return;
  }
  if (isStrudelUrl(q) || low === "strudel" || low === "failsafe" || low === "fail-safe") {
    const target =
      low === "failsafe" || low === "fail-safe"
        ? "https://github.com/algorave-dave/Fail-safe"
        : low === "strudel"
          ? "https://strudel.cc/"
          : q;
    try {
      if (low === "failsafe" || low === "fail-safe") {
        await floatWorkspace?.getStrudelPane?.()?.loadAndPlay?.("https://github.com/algorave-dave/Fail-safe");
      } else {
        await floatWorkspace?.loadStrudelFrom?.(target);
        await floatWorkspace?.playStrudelCode?.();
      }
      collabShell?.appendPromptOutput(`strudel · ${target.slice(0, 72)}`);
    } catch (err) {
      collabShell?.appendPromptOutput(`strudel error: ${err.message || err}`);
    }
    return;
  }
  if (low.startsWith("imagine ") || low.startsWith("slug ")) {
    const slug = q.split(/\s+/).slice(1).join(" ") || q;
    try {
      const res = await fetch(`/api/imagine/slug/${encodeURIComponent(slug)}`);
      const data = await res.json();
      collabShell?.appendPromptOutput(data.prompt || JSON.stringify(data));
    } catch (err) {
      collabShell?.appendPromptOutput(`imagine error: ${err}`);
    }
    return;
  }
  window.qbpmLive?.ingest?.({ text: q, flow: q.slice(0, 32) }, "prompt-search");
  setRightPanelTab("kbatch");
  initKbatchPanel();
  switchKbatchTab("analyzer");
  const frame = document.getElementById("kbatch-frame");
  if (frame?.contentWindow) {
    frame.contentWindow.postMessage({ type: "qbpm-prompt-search", query: q }, "*");
  }
  if (window.grokTools?.inject) {
    window.grokTools.inject(`${q}\n`);
  }
}

function initCollab() {
  collab = createCanvasCollab({
    graphName: GRAPH_NAME,
    onGraphFull: (g) => {
      graph = g;
      ensureCanvasMeta();
      collabShell?.flashSync("ok");
      draw();
    },
    onGraphPatch: (patch) => {
      if (patch.nodes) graph.nodes = patch.nodes;
      if (patch.edges) graph.edges = patch.edges;
      if (patch.meta) graph.meta = { ...graph.meta, ...patch.meta };
      collabShell?.flashSync("ok");
      refreshCanvasTargets();
      draw();
    },
    onFrameUpdate: (f, v, edges) => {
      if (f) graph.meta.frames = f;
      if (v) graph.meta.viewports = v;
      if (edges) graph.meta.frameEdges = edges;
      draw();
      collabShell?.positionOverlays?.();
    },
    onPresence: (clients) => {
      collabPeers = clients;
      for (const p of clients) {
        ensureUserFrame(p.clientId, p.name, p.color);
      }
      floatWorkspace?.refreshChatRoute?.();
      refreshCanvasTargets();
      const el = document.getElementById("collab-status");
      if (el) el.textContent = clients.length ? `● ${clients.length + 1} live` : "● solo";
      collabShell?.renderPeers(clients);
      floatWorkspace?.onVideoPresence?.(clients);
      ugradHud?.refresh();
      if (selectedFrameId) {
        const f = frames().find((x) => x.id === selectedFrameId);
        if (f) selectFrame(f);
      }
      draw();
    },
    onChat: (msg) => {
      ugradHud?.notifyChat(msg);
    },
    onHop: (msg) => {
      if (msg.viewport) hopToViewport(msg.viewport);
      collabShell?.appendPromptOutput(`hop ← ${msg.fromName || msg.from}`);
    },
    onVideo: (msg) => {
      floatWorkspace?.onRemoteVideo?.(msg);
      collabShell?.onRemoteVideo(msg);
    },
    onVideoSignal: (msg) => floatWorkspace?.onVideoSignal?.(msg),
    onJam: (msg) => {
      const p = msg.pattern || {};
      if (p.musica) liveState = { ...liveState, musica: p.musica, bpm: p.bpm };
      floatWorkspace?.setProcessing?.(`jam ← ${msg.fromName || msg.from}: ${p.musica?.slice(0, 32) || "pattern"}`);
      syncFloatPanels();
      draw();
    },
    onDrawOverlay: () => draw(),
  });

  jamBridge = createLiveJamBridge({
    getCollab: () => collab,
    ingest: (p, src) => window.qbpmLive?.ingest?.(p, src),
    onPattern: (p) => {
      liveState = { ...liveState, musica: p.musica, bpm: p.bpm, flare: p.flare };
      syncFloatPanels();
    },
  });

  floatWorkspace = createFloatWorkspace({
    getCollab: () => collab,
    getLocalClientId: () => collab?.clientId || "local",
    getLocalColor: () => localStorage.getItem("qbpm-collab-color") || "#58a6ff",
    getActiveWindowId: () => activeWindowId || "main",
    onChatSend: (msg) => {
      if (collab) {
        collab.sendChat(msg.text, { to: msg.to, toName: msg.toName });
        return;
      }
      floatWorkspace?.appendChatLine?.({
        ...msg,
        color: localStorage.getItem("qbpm-collab-color") || "#58a6ff",
        local: true,
      });
    },
    getPeers: () => collabPeers,
    onPromptIngest: (url, data) => {
      if (data) collabShell?.appendPromptOutput(`♪ ingest · ${formatResolveSummary(data)}`);
      else if (isWatchUrl(url)) ingestWatchUrl(url);
      else runPromptSearch(url);
    },
    onIngestStatus: (t) => collabShell?.appendPromptOutput(t),
    onNotePlay: (n) => window.qbpmLive?.ingest?.({ musica: n.note ?? n.hz, bpm: liveState?.bpm }, "piano"),
    getPanScale: () => ({ pan, scale }),
    getFrames: () => frames(),
    getBpm: () => liveState?.bpm || liveState?.cpm || 120,
    getSendTargets: () => ({
      nodes: graph.nodes.map((n) => ({
        id: n.id,
        label: n.label || n.type || n.id,
      })),
      peers: collabPeers.map((p) => ({
        clientId: p.clientId,
        name: p.name || p.clientId,
      })),
      users: frames()
        .filter((f) => f.cluster === "user" && f.clientId)
        .map((f) => ({
          clientId: f.clientId,
          name: f.owner || f.label || f.clientId,
          frameId: f.id,
        })),
    }),
    onMusicSend: ({ targetType, target, payload }) => {
      window.qbpmLive?.ingest?.(payload, `music-lab:${targetType}:${target}`);
      if (targetType === "daw") {
        floatWorkspace?.getDawLink?.()?.sendToDaw?.(target, payload);
        collabShell?.appendPromptOutput?.(`♪ → daw:${target} · ${payload.musica?.slice(0, 32) || "pattern"}`);
      } else if (targetType === "node" && target !== "all") {
        const n = graph.nodes.find((x) => x.id === target);
        if (n) {
          n.data = { ...(n.data || {}), musica: payload.musica, pattern: payload.pattern, bpm: payload.bpm };
          collab?.broadcastPatch({ nodes: graph.nodes });
          selectNode(n.id);
        }
      } else if (targetType === "peer") {
        collab?.sendJam?.(payload);
        collab?.sendChat?.(`♪ → ${target}: ${payload.musica || "pattern"}`);
      } else if (targetType === "broadcast") {
        collab?.broadcastGraph?.(graph);
      }
      floatWorkspace?.setProcessing?.(`sent ♪ ${payload.musica?.slice(0, 24) || "pattern"} → ${target}`);
    },
    onOpenGrandPiano: (payload) => {
      floatWorkspace?.openDockPanel?.("grand");
      window.qbpmTools?.openTool?.("piano");
      collabShell?.appendPromptOutput?.(`grand piano ← ${payload?.musica?.slice(0, 40) || "pattern"}`);
    },
    onJamEval: (src, bpm) => {
      const p = jamBridge?.evalAndPlay?.(src, bpm);
      const fullStrudel = /stack\s*\(|setcps\s*\(|samples\s*\(|\bs\s*\(|^\s*d\d+\s*\$/im.test(src);
      if (fullStrudel) {
        floatWorkspace?.setProcessing?.(`strudel · ${src.slice(0, 40)}`);
        return;
      }
      floatWorkspace?.openDockPanel?.("music");
      floatWorkspace?.setProcessing?.(`() ${p?.musica?.slice(0, 36) || src.slice(0, 36)}`);
    },
    onWorkspaceChange: () => qubeManager?.scheduleFlush?.("workspace"),
  });

  ugradHud = createUgradHud({
    getPanScale: () => ({ pan, scale }),
    getLocalHandle: () => localStorage.getItem("qbpm-collab-name") || "guest",
    getLocalColor: () => localStorage.getItem("qbpm-collab-color") || "#58a6ff",
    getPeers: () => collabPeers,
    getFloatWorkspace: () => floatWorkspace,
  });

  collabShell = createCollabShell({
    getCollab: () => collab,
    getPanScale: () => ({ pan, scale }),
    getFrames: () => frames(),
    getActiveWindowId: () => activeWindowId,
    getLocalHandle: () => localStorage.getItem("qbpm-collab-name") || "guest",
    getLocalClientId: () => collab?.clientId || "local",
    getLocalColor: () => localStorage.getItem("qbpm-collab-color") || "#58a6ff",
    getFloatWorkspace: () => floatWorkspace,
    getVideoWall: () => floatWorkspace?.getVideoWall?.(),
    onHopViewport: hopToViewport,
    onHopFrame: hopToFrame,
    getPeers: () => collabPeers,
    onPromptSearch: runPromptSearch,
    onSyncPush: () => {
      qubeManager?.flush?.("all").then(() => {
        saveGraph().catch(() => {});
        collab?.broadcastGraph(graph);
        broadcastCanvasLayout();
      });
    },
  });

  setTimeout(() => {
    const cid = collab?.clientId;
    const name = localStorage.getItem("qbpm-collab-name") || "guest";
    const color = localStorage.getItem("qbpm-collab-color") || "#58a6ff";
    ensureUserFrame(cid, name, color);
    draw();
  }, 400);
}

function nodeControlButtons(n) {
  const r = nodeRect(n);
  const btn = nodeBtnSize();
  const stackH = NODE_CTRL.length * btn + (NODE_CTRL.length - 1) * NODE_BTN_GAP;
  const y0 = r.y + (r.h - stackH) / 2;
  const buttons = [];
  for (const side of ["left", "right"]) {
    const x = side === "left" ? r.x - NODE_BTN_PAD - btn : r.x + r.w + NODE_BTN_PAD;
    NODE_CTRL.forEach((label, i) => {
      buttons.push({
        node: n,
        side,
        action: label,
        label,
        x,
        y: y0 + i * (btn + NODE_BTN_GAP),
        w: btn,
        h: btn,
      });
    });
  }
  return buttons;
}

function controlAt(wx, wy) {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    for (const b of nodeControlButtons(graph.nodes[i])) {
      if (wx >= b.x && wx <= b.x + b.w && wy >= b.y && wy <= b.y + b.h) return b;
    }
  }
  return null;
}

function nodeParamKey(n, side) {
  if (n.type === "core.clock" || n.type === "music.clock") return side === "left" ? "cpm" : "bpm";
  if (n.type === "repel.play") return side === "left" ? "room" : "stream";
  return side === "left" ? "in" : "out";
}

function nodeParamDefault(n, key) {
  if (key === "cpm" || key === "bpm") return 120;
  if (key === "room") return "live";
  if (key === "stream") return "/tmp/piano-live.m3u8";
  return 1;
}

function nodeParamStep(n, key, action) {
  if (key === "cpm" || key === "bpm") return action === "+" ? 10 : action === "-" ? -10 : 0;
  if (key === "room" || key === "stream") return 0;
  return action === "+" ? 0.25 : action === "-" ? -0.25 : 0;
}

function applyNodeControl(ctrl) {
  const n = ctrl.node;
  const p = ensureParams(n);
  const key = nodeParamKey(n, ctrl.side);
  const def = nodeParamDefault(n, key);
  if (ctrl.action === "0") {
    p[key] = def;
  } else {
    const cur = Number(p[key] ?? def);
    p[key] = Math.round((cur + nodeParamStep(n, key, ctrl.action)) * 1000) / 1000;
    if (key !== "cpm") p[key] = Math.max(0, p[key]);
    else p[key] = Math.max(1, p[key]);
  }
  if ((n.type === "core.clock" || n.type === "music.clock") && key === "cpm") graph.meta.cpm = p.cpm;
  selectNode(n.id);
  vizLog.textContent = `${n.id} ${ctrl.side} ${ctrl.action} → ${key}=${p[key]}`;
  draw();
}

function nodeAt(wx, wy) {
  if (controlAt(wx, wy)) return null;
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const r = nodeRect(graph.nodes[i]);
    if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return graph.nodes[i];
  }
  return null;
}

function portAt(wx, wy) {
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const n = graph.nodes[i];
    const r = nodeRect(n);
    const out = { x: r.x + r.w, y: r.y + r.h / 2, side: "out", node: n };
    const inn = { x: r.x, y: r.y + r.h / 2, side: "in", node: n };
    for (const p of [out, inn]) {
      const dx = wx - p.x;
      const dy = wy - p.y;
      if (dx * dx + dy * dy <= (PORT_R * 2.2) ** 2) return p;
    }
  }
  return null;
}

function graphBounds() {
  if (!graph.nodes.length) return { x: 0, y: 0, w: 400, h: 300 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const btn = nodeBtnSize();
  for (const n of graph.nodes) {
    const r = nodeRect(n);
    minX = Math.min(minX, r.x - NODE_BTN_PAD - btn);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w + NODE_BTN_PAD + btn);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function focusWorldRect(wx, wy, ww, wh, padding = 48) {
  const wrap = document.getElementById("canvas-wrap");
  const cw = wrap.clientWidth;
  const ch = wrap.clientHeight;
  const sx = ww + padding * 2;
  const sy = wh + padding * 2;
  scale = Math.min(2.2, Math.max(0.25, Math.min(cw / sx, ch / sy)));
  pan.x = cw / 2 - (wx + ww / 2) * scale;
  pan.y = ch / 2 - (wy + wh / 2) * scale;
  draw();
}

function alignView(prefer) {
  if (prefer === "node" && selectedId) {
    const n = graph.nodes.find((x) => x.id === selectedId);
    if (n) {
      const r = nodeRect(n);
      focusWorldRect(r.x, r.y, r.w, r.h, 80);
      vizLog.textContent = `aligned → node ${selectedId}`;
      return;
    }
  }
  const b = graphBounds();
  focusWorldRect(b.x, b.y, b.w, b.h, 100);
  vizLog.textContent = "aligned → graph center";
}

function toggleAlignOnRightClick() {
  if (alignPrefer === "node" && selectedId) {
    alignView("node");
    alignPrefer = "graph";
    return;
  }
  alignView("graph");
  alignPrefer = "node";
}

function drawGrid() {
  const wrap = document.getElementById("canvas-wrap");
  drawCompGrid(ctx, pan, scale, wrap.clientWidth, wrap.clientHeight);
}

function draw() {
  const wrap = document.getElementById("canvas-wrap");
  ctx.clearRect(0, 0, wrap.clientWidth, wrap.clientHeight);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(scale, scale);
  drawGrid();
  drawFrames();

  for (const e of graph.edges) {
    const a = graph.nodes.find((n) => n.id === e.from);
    const b = graph.nodes.find((n) => n.id === e.to);
    if (!a || !b) continue;
    const ar = nodeRect(a);
    const br = nodeRect(b);
    ctx.strokeStyle = "#484f58";
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.moveTo(ar.x + ar.w, ar.y + ar.h / 2);
    ctx.lineTo(br.x, br.y + br.h / 2);
    ctx.stroke();
  }

  if (linking) {
    ctx.strokeStyle = "#58a6ff";
    ctx.setLineDash([6 / scale, 4 / scale]);
    ctx.beginPath();
    if (linking.kind === "frame") {
      const fr = frames().find((f) => f.id === linking.fromId);
      const fp = fr && framePortPositions(fr).find((p) => p.id === linking.fromPort);
      if (fp) {
        ctx.moveTo(fp.x, fp.y);
        ctx.lineTo(linking.wx, linking.wy);
      }
    } else {
      const src = graph.nodes.find((n) => n.id === linking.fromId);
      if (src && linking.sx != null) {
        const ar = nodeRect(src);
        ctx.moveTo(ar.x + ar.w, ar.y + ar.h / 2);
        ctx.lineTo(linking.wx, linking.wy);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const transport = resolveTransport({
    graph,
    liveState,
    musicTransport: floatWorkspace?.getMusicTransport?.(),
  });

  for (const n of graph.nodes) {
    const r = nodeRect(n);
    const active = n.id === selectedId;
    const p = ensureParams(n);

    for (const b of nodeControlButtons(n)) {
      const hover =
        hoverControl &&
        hoverControl.node.id === b.node.id &&
        hoverControl.side === b.side &&
        hoverControl.action === b.action;
      ctx.fillStyle = hover ? "#30363d" : "#161b22";
      ctx.strokeStyle = b.action === "0" ? "#6e7681" : b.action === "+" ? "#3fb950" : "#f85149";
      ctx.lineWidth = (hover ? 2 : 1.5) / scale;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = "#c9d1d9";
      ctx.font = `bold ${Math.max(11, b.w * 0.42) / scale}px Menlo, monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    ctx.fillStyle = active ? "#2d333b" : "#21262d";
    ctx.strokeStyle = active ? VFX.compStrokeActive : "#30363d";
    ctx.lineWidth = active ? 2 : 1.5;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeRect(r.x, r.y, r.w, r.h);

    ctx.fillStyle = "#3fb950";
    ctx.beginPath();
    ctx.arc(r.x, r.y + r.h / 2, PORT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d29922";
    ctx.beginPath();
    ctx.arc(r.x + r.w, r.y + r.h / 2, PORT_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c9d1d9";
    ctx.font = `${11 / scale}px Menlo, monospace`;
    ctx.fillText(n.id, r.x + 10, r.y + 20);
    ctx.fillStyle = "#8b949e";
    ctx.font = `${9 / scale}px Menlo, monospace`;
    ctx.fillText(n.type, r.x + 10, r.y + 36);
    const lk = nodeParamKey(n, "left");
    const rk = nodeParamKey(n, "right");
    ctx.fillStyle = "#6e7681";
    ctx.font = `${8 / scale}px Menlo, monospace`;
    ctx.fillText(`L ${lk}=${p[lk] ?? nodeParamDefault(n, lk)}`, r.x + 8, r.y + 50);
    ctx.fillText(`R ${rk}=${p[rk] ?? nodeParamDefault(n, rk)}`, r.x + 8, r.y + 60);
    drawNodeCycleBar(ctx, r, n, transport, scale);
  }
  if (collab) collab.drawPeers(ctx, pan, scale);
  ctx.restore();
  updateCanvasResolutionLabel();
  collabShell?.positionOverlays?.();
  drawViz();
}

function drawViz() {
  const w = vizCanvas.width;
  const h = vizCanvas.height;
  const dpr = window.devicePixelRatio || 1;
  vizCtx.setTransform(1, 0, 0, 1, 0, 0);
  vizCtx.clearRect(0, 0, w, h);
  vizCtx.fillStyle = "#161b22";
  vizCtx.fillRect(0, 0, w, h);

  const pad = 12 * dpr;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  if (graph.nodes.length) {
    const b = graphBounds();
    for (const n of graph.nodes) {
      const r = nodeRect(n);
      const nx = pad + ((r.x - b.x) / Math.max(b.w, 1)) * innerW;
      const ny = pad + ((r.y - b.y) / Math.max(b.h, 1)) * innerH;
      vizCtx.fillStyle = n.id === selectedId ? "#58a6ff" : "#484f58";
      vizCtx.beginPath();
      vizCtx.arc(nx, ny, 5 * dpr, 0, Math.PI * 2);
      vizCtx.fill();
    }
    for (const e of graph.edges) {
      const a = graph.nodes.find((n) => n.id === e.from);
      const bnode = graph.nodes.find((n) => n.id === e.to);
      if (!a || !bnode) continue;
      const ar = nodeRect(a);
      const br = nodeRect(bnode);
      const ax = pad + ((ar.x + ar.w / 2 - b.x) / Math.max(b.w, 1)) * innerW;
      const ay = pad + ((ar.y + ar.h / 2 - b.y) / Math.max(b.h, 1)) * innerH;
      const bx = pad + ((br.x + br.w / 2 - b.x) / Math.max(b.w, 1)) * innerW;
      const by = pad + ((br.y + br.h / 2 - b.y) / Math.max(b.h, 1)) * innerH;
      vizCtx.strokeStyle = "#30363d";
      vizCtx.lineWidth = 1 * dpr;
      vizCtx.beginPath();
      vizCtx.moveTo(ax, ay);
      vizCtx.lineTo(bx, by);
      vizCtx.stroke();
    }
  }

  vizPhase += 0.08;
  const cpm = liveState?.cpm || liveState?.bpm || graph.meta?.cpm || 120;
  const freq = cpm / 60;
  vizCtx.strokeStyle = "#3fb950";
  vizCtx.lineWidth = 1.5 * dpr;
  vizCtx.beginPath();
  for (let x = 0; x <= innerW; x += 2 * dpr) {
    const t = x / innerW;
    const y = pad + innerH * 0.5 + Math.sin(t * Math.PI * 4 + vizPhase) * innerH * 0.22 * (lastRun?.ok ? 1 : 0.35);
    if (x === 0) vizCtx.moveTo(pad + x, y);
    else vizCtx.lineTo(pad + x, y);
  }
  vizCtx.stroke();

  if (lastRun?.trace) {
    const n = lastRun.trace.length;
    const barW = innerW / Math.max(n, 1);
    lastRun.trace.forEach((t, i) => {
      vizCtx.fillStyle = t.ok ? "#238636" : "#da3633";
      const bh = (t.ok ? 0.6 : 0.35) * innerH * 0.25;
      vizCtx.fillRect(pad + i * barW + 1, h - pad - bh, Math.max(2, barW - 2), bh);
    });
  }

  const vw = floatWorkspace?.getVideoWall?.();
  const vwReport = vw?.capacityReport?.();
  const pins = vw?.getPinnedEntries?.() || [];
  if (vwReport?.users?.length || pins.length) {
    vizCtx.fillStyle = "#6e7681";
    vizCtx.font = `${9 * dpr}px Menlo, monospace`;
    const pinTxt = pins.map((p) => `${p.role.slice(0, 3)}${p.active ? "●" : "○"}`).join(" ");
    vizCtx.fillText(
      `vwall ${vwReport?.users?.length || 0} live · ${(vwReport?.total || 0).toFixed(1)}/${vwReport?.max || 16} · ${vwReport?.lag?.text || "—"} · ${pinTxt}`,
      pad,
      pad + 10 * dpr,
    );
  }

  const thumbX = pad;
  let thumbY = h - pad - 36 * dpr;
  pins.forEach((p) => {
    const sz = 32 * dpr;
    vizCtx.fillStyle = p.active ? "#161b22" : "#0d1117";
    vizCtx.fillRect(thumbX, thumbY, sz, sz);
    vizCtx.strokeStyle = p.color || "#484f58";
    vizCtx.lineWidth = 1 * dpr;
    vizCtx.strokeRect(thumbX + 0.5 * dpr, thumbY + 0.5 * dpr, sz - dpr, sz - dpr);
    vizCtx.fillStyle = p.color || "#6e7681";
    vizCtx.font = `${10 * dpr}px Menlo, monospace`;
    vizCtx.textAlign = "center";
    vizCtx.fillText(p.role === "moderator" ? "M" : "♪", thumbX + sz / 2, thumbY + sz / 2 + 3 * dpr);
    vizCtx.textAlign = "left";
    vizCtx.font = `${7 * dpr}px Menlo, monospace`;
    vizCtx.fillText(p.role.slice(0, 3), thumbX, thumbY + sz + 8 * dpr);
    thumbY -= sz + 14 * dpr;
  });
}

function vizAnimLoop() {
  if (document.visibilityState === "visible") {
    drawViz();
    draw();
  }
  requestAnimationFrame(vizAnimLoop);
}

async function loadGraph(opts = {}) {
  const P = pages();
  const api = P.api(`api/graph/${GRAPH_NAME}`);
  if (api) {
    const res = await fetch(
      `${api}${opts.bust ? `?t=${Date.now()}` : ""}`,
      opts.hard ? { cache: "no-store" } : undefined,
    );
    if (res.ok) {
      graph = await res.json();
    } else if (!P.staticShell) {
      throw new Error(await res.text());
    }
  }
  if (!graph?.nodes) {
    const local = localStorage.getItem(`qbpm-graph-${GRAPH_NAME}`);
    if (local) {
      try { graph = JSON.parse(local); } catch (_) {}
    }
  }
  if (!graph?.nodes) {
    const res = await fetch(P.graphJson(GRAPH_NAME), opts.hard ? { cache: "no-store" } : undefined);
    if (!res.ok) throw new Error(`graph ${GRAPH_NAME}: ${res.status}`);
    graph = await res.json();
  }
  ensureCanvasMeta();
  normalizeFramePalette();
  for (const n of graph.nodes) {
    if (!Array.isArray(n.pos)) n.pos = [80, 80];
    n.pos = [Number(n.pos[0]), Number(n.pos[1])];
  }
  if (qubeManager) {
    await qubeManager.restore();
  } else if (graph.nodes[0]) {
    selectNode(graph.nodes[0].id);
  }
  refreshCanvasTargets();
  alignView("graph");
  qubeManager?.scheduleFlush?.("all");
}

async function hardRefreshCanvas() {
  dragging = null;
  linking = null;
  panning = false;
  panStart = null;
  hoverControl = null;
  pinchStart = null;
  selectedId = null;
  pan = { x: 80, y: 80 };
  scale = 1;
  document.getElementById("insp-id").value = "";
  document.getElementById("insp-type").value = "core.clock";
  document.getElementById("insp-code").value = "";
  vizLog.textContent = "refreshing…";
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    await loadGraph({ hard: true, bust: true });
    resize();
    vizLog.textContent = "canvas hard-refreshed";
  } catch (err) {
    vizLog.textContent = `refresh error: ${err}`;
  }
}

async function saveGraph() {
  await qubeManager?.flush?.("all");
  const api = pages().api(`api/graph/${GRAPH_NAME}`);
  if (!api) {
    localStorage.setItem(`qbpm-graph-${GRAPH_NAME}`, JSON.stringify(graph));
    vizLog.textContent = "saved locally · qube compartments";
    return;
  }
  const res = await fetch(api, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });
  const data = await res.json();
  vizLog.textContent = `saved ${data.path}`;
  collab?.broadcastGraph(graph);
}

async function runGraph() {
  const res = await fetch(`/api/graph/${GRAPH_NAME}/run`, { method: "POST" });
  lastRun = await res.json();
  vizLog.textContent = JSON.stringify(lastRun, null, 2);
  syncFloatPanels();
  drawViz();
}

async function agentPropose() {
  const res = await fetch("/api/agent/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, intent: "expand" }),
  });
  const data = await res.json();
  if (data.ok && data.diff?.op === "add") {
    graph.nodes.push(data.diff.node);
    if (data.diff.edge) graph.edges.push(data.diff.edge);
    selectNode(data.diff.node.id);
    alignView("node");
  }
  vizLog.textContent = JSON.stringify(data, null, 2);
}

function selectNode(id) {
  selectedId = id;
  selectedFrameId = null;
  const n = graph.nodes.find((x) => x.id === id);
  if (!n) {
    document.getElementById("insp-id").value = "";
    draw();
    return;
  }
  document.getElementById("insp-id").value = n.id;
  document.getElementById("insp-type").value = n.type;
  document.getElementById("insp-code").value = n.code || "";
  setInspectorTab("node");
  setRightPanelTab("inspector");
  refreshCanvasTargets();
  draw();
  qubeManager?.scheduleFlush?.("nodes");
}

function syncInspector() {
  const n = graph.nodes.find((x) => x.id === selectedId);
  if (!n) return;
  n.type = document.getElementById("insp-type").value;
  n.code = document.getElementById("insp-code").value;
  collab?.broadcastPatch?.({ nodes: graph.nodes });
  draw();
  qubeManager?.scheduleFlush?.("nodes");
}

function addNode() {
  const id = `node-${graph.nodes.length + 1}`;
  const b = graphBounds();
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  graph.nodes.push({
    id,
    type: "python.exec",
    pos: [cx, cy + graph.nodes.length * 24],
    code: 'result = {"hello": "qbpm"}',
  });
  selectNode(id);
  refreshCanvasTargets();
}

function setPanMode(on) {
  canvas.classList.toggle("pan-mode", on || touchPanMode);
}

const RIGHT_TAB_KEY = "qbpm-right-tab";

function setRightPanelTab(tab) {
  const panel = tab === "inspector" ? "inspector" : tab;
  document.querySelectorAll("#right-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll("#right-panel-body .panel-block").forEach((blk) => {
    blk.classList.toggle("active", blk.dataset.panel === panel);
  });
  if (tab === "kbatch") initKbatchPanel();
  if (tab === "tools") initToolsPanel().catch(() => {});
  workspace.classList.toggle("right-kbatch", tab === "kbatch");
  workspace.classList.toggle("right-tools", tab === "tools");
  try { localStorage.setItem(RIGHT_TAB_KEY, tab); } catch (_) {}
  qubeManager?.scheduleFlush?.("session");
  setTimeout(resize, 30);
}

function setMobilePanel(name) {
  workspace.classList.remove("panel-viz", "panel-inspector", "panel-terminal", "panel-kbatch", "panel-tools");
  if (name && name !== "canvas") workspace.classList.add(`panel-${name}`);
  document.querySelectorAll("#mobile-tabs button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.panel === name);
  });
  if (name && name !== "canvas") {
    setRightPanelTab(name === "terminal" ? "terminal" : name);
  }
  setTimeout(resize, 30);
}

function exportGraphState() {
  window.qbpm = window.qbpm || {};
  window.qbpm.getGraph = () => structuredClone(graph);
  window.qbpm.setGraph = (g) => {
    graph = g;
    draw();
  };
  window.qbpm.reloadGraph = () => loadGraph();
  window.qbpm.hardRefresh = () => hardRefreshCanvas();
  window.qbpm.setMobilePanel = setMobilePanel;
  window.qbpm.setRightPanelTab = setRightPanelTab;
  window.qbpm.getFrames = () => structuredClone(frames());
  window.qbpm.getViewports = () => structuredClone(viewports());
  window.qbpm.onTerminalCommand = async (line) => {
    const low = line.trim().toLowerCase();
    if (low === "run") await runGraph();
    else if (low === "save") await saveGraph();
    else if (low === "graph" || low === "agent") await loadGraph();
    else if (low.startsWith("align ")) {
      if (low.includes("node")) alignView("node");
      else alignView("graph");
    }
  };
}
function initLiveMusic() {
  const statusEl = document.getElementById("kbatch-status");
  liveBridge = createLiveMusicBridge({
    onState: (state) => {
      liveState = state;
      if (statusEl && state) {
        const bpm = state.bpm || state.cpm || 0;
        const flow = (state.flow || "").slice(0, 24);
        statusEl.textContent = flow ? `● ${flow} · ${bpm} bpm` : `● live · ${bpm || "—"} bpm`;
        statusEl.classList.add("active");
      }
      syncFloatPanels();
    },
    onEvent: (ev) => {
      if (ev.type === "close" && statusEl) {
        statusEl.textContent = "● reconnecting…";
        statusEl.classList.remove("active");
      }
    },
  });
  window.qbpmLive = {
    ingest: (payload, source) => liveBridge?.ingest(payload, source),
    get state() {
      return liveState;
    },
  };
}

function initDevicePicker() {
  const picker = document.getElementById("device-picker");
  const btn = document.getElementById("btn-add-device");
  if (!picker || !btn) return;
  picker.innerHTML = DEVICE_PRESETS.map(
    (p) => `<button type="button" data-preset="${p.id}"><span class="dp-icon">${p.icon}</span><span>${p.label}</span><span class="dp-meta">${p.w}×${p.h}</span></button>`
  ).join("");
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    picker.classList.toggle("open");
    btn.classList.toggle("active");
  });
  picker.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      addDeviceFrame(b.dataset.preset);
      picker.classList.remove("open");
      btn.classList.remove("active");
    });
  });
  document.addEventListener("click", () => {
    picker.classList.remove("open");
    btn.classList.remove("active");
  });
}

exportGraphState();
initLiveMusic();
registerQbpmTools();
initDevicePicker();

document.getElementById("insp-type").addEventListener("change", syncInspector);
document.getElementById("insp-code").addEventListener("input", syncInspector);
document.querySelectorAll(".insp-tab").forEach((btn) => {
  btn.addEventListener("click", () => setInspectorTab(btn.dataset.insp));
});
document.getElementById("insp-run-node")?.addEventListener("click", () => runGraph());
document.getElementById("insp-align-node")?.addEventListener("click", () => alignView("node"));
document.getElementById("insp-hop-user")?.addEventListener("click", () => {
  const f = frames().find((x) => x.id === selectedFrameId);
  if (f) hopToFrame(f);
  else if (selectedFrameId) {
    const peer = collabPeers.find((p) => `frame-user-${p.clientId}` === selectedFrameId);
    if (peer?.viewport?.pan) hopToViewport(peer.viewport);
    else collab?.requestHop?.(peer?.clientId);
  }
});
document.getElementById("insp-send-user")?.addEventListener("click", () => {
  const f = frames().find((x) => x.id === selectedFrameId);
  const cid = f?.clientId;
  if (!cid) return;
  const sel = document.getElementById("ml-send-target");
  if (sel) {
    const val = `peer:${cid}`;
    if ([...sel.options].some((o) => o.value === val)) sel.value = val;
  }
  floatWorkspace?.openDockPanel?.("music");
});
mountInspectorCommandHelp();
document.getElementById("btn-refresh").addEventListener("click", () => {
  hardRefreshCanvas().catch((err) => {
    vizLog.textContent = `refresh error: ${err}`;
  });
});
document.getElementById("btn-add-frame")?.addEventListener("click", addCanvasFrame);
document.getElementById("btn-add-viewport")?.addEventListener("click", addViewportWindow);
document.querySelectorAll("#right-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => setRightPanelTab(btn.dataset.tab));
});
document.getElementById("btn-add").addEventListener("click", addNode);
document.getElementById("btn-center").addEventListener("click", () => alignView(selectedId ? "node" : "graph"));
document.getElementById("btn-save").addEventListener("click", saveGraph);
document.getElementById("btn-run").addEventListener("click", runGraph);
document.getElementById("btn-agent").addEventListener("click", agentPropose);

const btnPan = document.getElementById("btn-pan-mode");
if (btnPan) {
  btnPan.addEventListener("click", () => {
    touchPanMode = !touchPanMode;
    btnPan.setAttribute("aria-pressed", String(touchPanMode));
    setPanMode(touchPanMode || spaceDown);
  });
}

document.querySelectorAll("#mobile-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => setMobilePanel(btn.dataset.panel));
});

let vizExpandStep = 0;
document.getElementById("btn-viz-expand").addEventListener("click", () => {
  vizExpandStep = (vizExpandStep + 1) % 3;
  workspace.classList.remove("viz-expanded", "viz-full");
  if (vizExpandStep === 1) workspace.classList.add("viz-expanded");
  if (vizExpandStep === 2) workspace.classList.add("viz-full");
  setTimeout(resize, 50);
});

window.addEventListener("keydown", (ev) => {
  if (ev.code === "Space" && !ev.repeat && ev.target.tagName !== "TEXTAREA" && ev.target.tagName !== "INPUT") {
    ev.preventDefault();
    spaceDown = true;
    setPanMode(true);
  }
});
window.addEventListener("keyup", (ev) => {
  if (ev.code === "Space") {
    spaceDown = false;
    setPanMode(touchPanMode);
    canvas.classList.remove("grabbing");
  }
});

function onPointerDown(ev) {
  if (ev.button === 2) return;
  const { sx, sy, wx, wy } = canvasPoint(ev);
  const ctrl = controlAt(wx, wy);
  if (ctrl && !spaceDown && !touchPanMode) {
    applyNodeControl(ctrl);
    ev.preventDefault();
    return;
  }
  canvas.setPointerCapture(ev.pointerId);
  const fport = ev.shiftKey ? framePortAt(wx, wy) : null;
  const port = ev.shiftKey && !fport ? portAt(wx, wy) : null;

  if (spaceDown || touchPanMode || ev.button === 1) {
    panning = true;
    panStart = { x: ev.clientX, y: ev.clientY, pan: { ...pan } };
    canvas.classList.add("grabbing");
    return;
  }

  if (fport && fport.side === "out") {
    linking = { kind: "frame", fromId: fport.frame.id, fromPort: fport.port, wx, wy, sx, sy };
    activeFrameId = fport.frame.id;
    draw();
    return;
  }

  if (port && port.side === "out") {
    linking = { kind: "node", fromId: port.node.id, wx, wy, sx, sy };
    selectNode(port.node.id);
    return;
  }

  const hit = nodeAt(wx, wy);
  if (hit) {
    dragging = { id: hit.id, offX: wx - hit.pos[0], offY: wy - hit.pos[1] };
    selectNode(hit.id);
    canvas.classList.add("drag-node");
    return;
  }

  const fhit = frameAt(wx, wy);
  if (fhit) {
    selectFrame(fhit);
  } else {
    selectedId = null;
    selectedFrameId = null;
    document.getElementById("insp-id").value = "";
    draw();
  }
  panning = true;
  panStart = { x: ev.clientX, y: ev.clientY, pan: { ...pan } };
  canvas.classList.add("grabbing");
}

function onPointerMove(ev) {
  const { sx, sy, wx, wy } = canvasPoint(ev);
  if (!panning && !dragging && !linking && !spaceDown && !touchPanMode) {
    const ctrl = controlAt(wx, wy);
    if (ctrl !== hoverControl) {
      hoverControl = ctrl;
      draw();
    }
  }
  if (panning && panStart) {
    pan.x = panStart.pan.x + (ev.clientX - panStart.x);
    pan.y = panStart.pan.y + (ev.clientY - panStart.y);
    scheduleViewportBroadcast();
    draw();
    return;
  }
  collab?.sendCursor(wx, wy);
  ugradHud?.setMouse(sx, sy, wx, wy);
  if (linking) {
    linking.wx = wx;
    linking.wy = wy;
    draw();
    return;
  }
  if (dragging) {
    const n = graph.nodes.find((x) => x.id === dragging.id);
    if (n) {
      n.pos = [wx - dragging.offX, wy - dragging.offY];
      draw();
    }
  }
}

function onPointerUp(ev) {
  const { wx, wy } = canvasPoint(ev);
  const wasDragging = dragging;
  if (linking) {
    if (linking.kind === "frame") {
      const tgt = framePortAt(wx, wy);
      if (tgt && tgt.side === "in" && tgt.frame.id !== linking.fromId) {
        const exists = frameEdges().some(
          (e) => e.from === linking.fromId && e.fromPort === linking.fromPort && e.to === tgt.frame.id
        );
        if (!exists) {
          const srcPorts = framePortPositions(frames().find((f) => f.id === linking.fromId));
          const srcP = srcPorts?.find((p) => p.id === linking.fromPort);
          const lane = srcP?.lane || tgt.lane || "video";
          frameEdges().push({
            from: linking.fromId,
            fromPort: linking.fromPort,
            to: tgt.frame.id,
            toPort: tgt.port,
            lane,
            bus: ev.altKey ? "collab" : lane,
          });
          broadcastCanvasLayout();
        }
      }
    } else {
      const port = portAt(wx, wy);
      if (port && port.side === "in" && port.node.id !== linking.fromId) {
        const exists = graph.edges.some((e) => e.from === linking.fromId && e.to === port.node.id);
        if (!exists) graph.edges.push({ from: linking.fromId, to: port.node.id, port: "data" });
      }
    }
    linking = null;
    draw();
  }
  if (wasDragging) collab?.broadcastPatch({ nodes: graph.nodes });
  dragging = null;
  panning = false;
  panStart = null;
  hoverControl = null;
  canvas.classList.remove("grabbing", "drag-node");
  try { canvas.releasePointerCapture(ev.pointerId); } catch (_) {}
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
canvas.addEventListener("pointerleave", () => {
  if (hoverControl) {
    hoverControl = null;
    draw();
  }
  ugradHud?.setMouse(-1, -1, 0, 0);
});

canvas.addEventListener("contextmenu", (ev) => {
  ev.preventDefault();
  const { wx, wy } = canvasPoint(ev);
  const hit = nodeAt(wx, wy);
  if (hit) selectNode(hit.id);
  toggleAlignOnRightClick();
});

canvas.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const { sx, sy, wx, wy } = canvasPoint(ev);
  const delta = ev.deltaY > 0 ? 0.9 : 1.1;
  const newScale = Math.min(2.5, Math.max(0.2, scale * delta));
  pan.x = sx - wx * newScale;
  pan.y = sy - wy * newScale;
  scale = newScale;
  scheduleViewportBroadcast();
  draw();
}, { passive: false });

canvas.addEventListener("dblclick", (ev) => {
  const { wx, wy } = canvasPoint(ev);
  if (!nodeAt(wx, wy)) addNode();
});

canvas.addEventListener(
  "touchstart",
  (ev) => {
    if (ev.touches.length === 2) {
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      pinchStart = {
        dist: Math.hypot(dx, dy),
        scale,
        pan: { ...pan },
        midX: (ev.touches[0].clientX + ev.touches[1].clientX) / 2,
        midY: (ev.touches[0].clientY + ev.touches[1].clientY) / 2,
      };
      dragging = null;
      linking = null;
    }
  },
  { passive: true }
);

canvas.addEventListener(
  "touchmove",
  (ev) => {
    if (ev.touches.length === 2 && pinchStart) {
      ev.preventDefault();
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStart.dist;
      const newScale = Math.min(2.5, Math.max(0.2, pinchStart.scale * ratio));
      const r = canvas.getBoundingClientRect();
      const sx = pinchStart.midX - r.left;
      const sy = pinchStart.midY - r.top;
      const wx = (sx - pinchStart.pan.x) / pinchStart.scale;
      const wy = (sy - pinchStart.pan.y) / pinchStart.scale;
      scale = newScale;
      pan.x = sx - wx * newScale;
      pan.y = sy - wy * newScale;
      draw();
    }
  },
  { passive: false }
);

canvas.addEventListener("touchend", () => {
  if (pinchStart) pinchStart = null;
});

document.getElementById("prompt-video-ingest")?.addEventListener("click", () => {
  const q = document.getElementById("prompt-search-in")?.value?.trim();
  if (q) runPromptSearch(q);
  else collabShell?.appendPromptOutput("paste a video URL in the prompt bar");
});
document.getElementById("prompt-imagine")?.addEventListener("click", async () => {
  try {
    const res = await fetch("/api/imagine/slugs");
    const data = await res.json();
    collabShell?.appendPromptOutput(`slugs (${data.slugs?.length || 0}): ${(data.slugs || []).slice(0, 12).join(", ")}…`);
  } catch (err) {
    collabShell?.appendPromptOutput(`imagine: ${err}`);
  }
});

if (pages().staticShell) {
  const cs = document.getElementById("collab-status");
  if (cs) cs.textContent = "● static shell";
  const hint = document.getElementById("canvas-hint");
  if (hint) {
    const v = pages().variant || "pages";
    const api = pages().apiBase?.() || pages().defaultApiBase || "api.qbitos.ai";
    hint.textContent = `${v} · local graph · API bridge: ${api || "same-origin"} · qbpm.qbitos.ai · forge/Qbpm`;
  }
}

initQubeManager();
initCollab();
resize();
requestAnimationFrame(vizAnimLoop);
loadGraph().catch((err) => {
  vizLog.textContent = `load error: ${err}`;
});
try {
  let savedTab = localStorage.getItem(RIGHT_TAB_KEY);
  if (savedTab === "piano") savedTab = "tools";
  if (savedTab === "pattern-flow") savedTab = "kbatch";
  if (savedTab) setRightPanelTab(savedTab);
} catch (_) {}