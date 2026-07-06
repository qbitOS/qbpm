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
import { getTabRuntime } from "./tab-runtime.js";
import { createVizUserRail } from "./viz-user-rail.js";
import { createVizViewsRail } from "./viz-views-rail.js";
import { createVizGroupsRail } from "./viz-groups-rail.js";
import {
  arrangeOrchestraLayout,
  assignToGroup,
  ensureCanvasGroups,
  isSessionModerator,
  mergeCanvasGroups,
  setMemberPrefs,
  toggleMemberList,
} from "./canvas-groups.js";
import { fetchApiJson, isBridgeOnline, resolveApiUrl } from "./api-bridge.js";
import { createLiveNodePanel, LIVE_PANEL_W, LIVE_PANEL_H } from "./live-node-panel.js";
import {
  nodeSize,
  hasWaveform,
  portsCompatible,
  portTypeForNode,
  defaultNodeData,
  defaultNodeCode,
  PORT_TYPES,
} from "./node-registry.js";
import { drawNodeWaveform } from "./node-waveform.js";
import { applyStudioPreset, drawStudioLanes } from "./studio-presets.js";

const GRAPH_NAME = "default";
const NODE_W = 168;
const NODE_H = 64;
const LIVE_NODE_W = 200;
const LIVE_NODE_H = 72;
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
let controlDrag = null;
const CONTROL_DRAG_THRESH = 6;
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
let vizUserRail = null;
let vizViewsRail = null;
let vizGroupsRail = null;
let liveNodePanel = null;
const SOLO_GRAPH_KEY = "qbpm-solo-graph";
let soloGraph = localStorage.getItem(SOLO_GRAPH_KEY) !== "0";

function localOwnerId() {
  return collab?.clientId || qubeManager?.clientId || getLocalQubeClientId();
}

function tagNodeOwner(n) {
  if (!n.owner) n.owner = localOwnerId();
  return n;
}

function nodesForUser(clientId) {
  return graph.nodes.filter((n) => (n.owner || localOwnerId()) === clientId);
}

function canvasPoint(ev) {
  const r = canvas.getBoundingClientRect();
  const sx = ev.clientX - r.left;
  const sy = ev.clientY - r.top;
  return { sx, sy, wx: (sx - pan.x) / scale, wy: (sy - pan.y) / scale };
}

function canvasCssSize() {
  const dpr = window.devicePixelRatio || 1;
  return {
    w: Math.max(1, canvas.width / dpr),
    h: Math.max(1, canvas.height / dpr),
    dpr,
  };
}

function syncFooterInsets() {
  const footer = document.getElementById("app-footer");
  if (!footer || window.matchMedia("(max-width: 900px)").matches === false) {
    document.documentElement.style.removeProperty("--mobile-footer-h");
    return;
  }
  const h = Math.ceil(footer.getBoundingClientRect().height);
  document.documentElement.style.setProperty("--mobile-footer-h", `${h}px`);
}

function resize() {
  syncFooterInsets();
  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cw = Math.max(1, Math.floor(rect.width));
  const ch = Math.max(1, Math.floor(rect.height));
  canvas.width = Math.max(1, Math.floor(cw * dpr));
  canvas.height = Math.max(1, Math.floor(ch * dpr));
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  floatWorkspace?.positionFramePanels?.();
  liveNodePanel?.sync?.();
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
const appFooter = document.getElementById("app-footer");
if (appFooter) new ResizeObserver(syncFooterInsets).observe(appFooter);
window.addEventListener("resize", resize);
syncFooterInsets();

function nodeRect(n) {
  const [x, y] = n.pos;
  if (n.type?.startsWith("live.") && n.id === selectedId) {
    return { x, y, w: LIVE_PANEL_W, h: LIVE_PANEL_H };
  }
  const sz = nodeSize(n);
  return { x, y, w: sz.w, h: sz.h };
}

function linkPointFor(n, side, portId = "main") {
  const r = nodeRect(n);
  if (portId === "main") {
    return { x: side === "in" ? r.x : r.x + r.w, y: r.y + r.h / 2, side, port: portId };
  }
  const btn = nodeBtnSize();
  const stackH = NODE_CTRL.length * btn + (NODE_CTRL.length - 1) * NODE_BTN_GAP;
  const y0 = r.y + (r.h - stackH) / 2;
  const i = NODE_CTRL.indexOf(portId);
  if (i < 0) return { x: side === "in" ? r.x : r.x + r.w, y: r.y + r.h / 2, side, port: portId };
  const x = side === "left" ? r.x - NODE_BTN_PAD - btn / 2 : r.x + r.w + NODE_BTN_PAD + btn / 2;
  const y = y0 + i * (btn + NODE_BTN_GAP) + btn / 2;
  return { x, y, side: side === "left" ? "in" : "out", port: portId };
}

function ensureParams(n) {
  if (!n.params || typeof n.params !== "object") n.params = {};
  return n.params;
}

let ensuringCanvasMeta = false;

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
  if (!graph.meta.theory || typeof graph.meta.theory !== "object") {
    graph.meta.theory = {
      bpm: 120,
      locked: { bpm: false, swing: false, signature: false, structure: false },
      timeSig: [4, 4],
      swing: 0,
      microtonal: { cents: 0, edo: 12 },
      negativeHarmony: { enabled: false, axis: "C" },
      polyrhythm: { enabled: false, ratio: [3, 4] },
      structure: { section: "verse", marker: "" },
      notation: {
        system: "modern",
        key: "C",
        mode: "ionian",
        solfege: { mode: "movable", variant: "major" },
        transposing: { instrument: "concert" },
      },
      structureChart: {
        template: "pop",
        sections: [
          { id: "intro", label: "intro", bars: 4, startBar: 0 },
          { id: "verse", label: "verse", bars: 8, startBar: 4 },
          { id: "pre", label: "pre-chorus", bars: 4, startBar: 12 },
          { id: "chorus", label: "chorus", bars: 8, startBar: 16 },
          { id: "bridge", label: "bridge", bars: 8, startBar: 24 },
          { id: "outro", label: "outro", bars: 4, startBar: 32 },
        ],
        totalBars: 36,
      },
    };
  }
  ensureCanvasGroups(graph.meta);
  if (ensuringCanvasMeta) return graph.meta;
  ensuringCanvasMeta = true;
  try {
    if (!activeFrameId) activeFrameId = graph.meta.frames[0]?.id || null;
    if (!activeWindowId) activeWindowId = graph.meta.viewports[0]?.id || null;
    normalizeFramePalette();
  } finally {
    ensuringCanvasMeta = false;
  }
  return graph.meta;
}

function canvasGroups() {
  return ensureCanvasGroups(ensureCanvasMeta());
}

function isLocalModerator() {
  const cid = collab?.clientId || localOwnerId();
  return isSessionModerator(cid, canvasGroups(), collabPeers, {
    getVideoWall: () => floatWorkspace?.getVideoWall?.(),
    localOnly: collabPeers.length === 0,
  });
}

function broadcastCanvasGroups() {
  if (!soloGraph) collab?.broadcastPatch?.({ meta: { canvasGroups: canvasGroups() } });
  vizGroupsRail?.render?.();
  vizViewsRail?.render?.();
  qubeManager?.scheduleFlush?.("session");
}

function onToggleCanvasGroup(kind, id) {
  const cid = collab?.clientId || localOwnerId();
  const g = canvasGroups();
  if (kind === "claim-host") {
    g.session.hostId = cid;
    g.session.conductorId = cid;
    broadcastCanvasGroups();
    vizLog.textContent = "★ session host claimed · orchestra arrange enabled";
    return;
  }
  toggleMemberList(g, cid, kind, id);
  broadcastCanvasGroups();
  vizLog.textContent = `group · ${kind} · ${id}`;
}

function applyOrchestraArrange() {
  if (!isLocalModerator()) {
    vizLog.textContent = "🎼 arrange · moderator/host only (★ host or vwall mod pin)";
    return;
  }
  const result = arrangeOrchestraLayout({
    frames: frames(),
    viewports: viewports(),
    nodes: graph.nodes,
    groups: canvasGroups(),
    peers: collabPeers,
    getOwnerId: (n) => n.owner || localOwnerId(),
  });
  graph.meta.frames = result.frames;
  graph.meta.viewports = result.viewports;
  graph.nodes = result.nodes;
  graph.meta.canvasGroups = result.groups;
  if (!soloGraph) {
    collab?.broadcastPatch?.({ nodes: graph.nodes, meta: { canvasGroups: result.groups } });
  }
  broadcastCanvasLayout();
  vizGroupsRail?.render?.();
  vizViewsRail?.render?.();
  draw();
  vizLog.textContent = "🎼 orchestra layout · sections · frames · nodes · views";
}

function addCanvasChannel() {
  if (!isLocalModerator()) return;
  const label = prompt("Channel name (e.g. violins-1, beat-lab):");
  if (!label?.trim()) return;
  const g = canvasGroups();
  const id = `ch-${Date.now().toString(36)}`;
  g.channels.push({ id, label: label.trim(), color: "#6e7681", members: [] });
  broadcastCanvasGroups();
}

function assignFrameToTeam(frameId, teamId) {
  if (!isLocalModerator()) return;
  const g = canvasGroups();
  const team = g.teams.find((t) => t.id === teamId);
  assignToGroup(g, "frames", frameId, { teamId, section: teamId, genre: team?.genre });
  const fr = frames().find((f) => f.id === frameId);
  if (fr) {
    fr.orchestraSection = teamId;
    broadcastCanvasLayout();
  }
  broadcastCanvasGroups();
  vizLog.textContent = `assigned ${frameId} → ${team?.label || teamId}`;
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

  const owner = localOwnerId();
  for (const n of patch.nodes || []) {
    if ((n.owner || owner) !== owner) continue;
    const i = graph.nodes.findIndex((x) => x.id === n.id);
    if (i >= 0) graph.nodes[i] = { ...graph.nodes[i], ...n };
    else graph.nodes.push(tagNodeOwner({ ...n }));
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
  vizViewsRail?.render?.();
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
  vizViewsRail?.render?.();
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
  vizViewsRail?.render?.();
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
  vizViewsRail?.render?.();
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
  vizViewsRail?.render?.();
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
  vizViewsRail?.render?.();
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
    onGraphFull: (g, rev, from) => {
      if (soloGraph && from && from !== collab?.clientId) return;
      graph = g;
      ensureCanvasMeta();
      ensureCanvasGroups(graph.meta);
      graph.nodes.forEach(tagNodeOwner);
      collabShell?.flashSync("ok");
      vizUserRail?.render?.();
      vizViewsRail?.render?.();
      vizGroupsRail?.render?.();
      draw();
    },
    onGraphPatch: (patch, rev, from) => {
      if (soloGraph && from && from !== collab?.clientId) return;
      if (patch.nodes) {
        for (const rn of patch.nodes) {
          const i = graph.nodes.findIndex((x) => x.id === rn.id);
          if (i >= 0) graph.nodes[i] = { ...graph.nodes[i], ...rn };
          else if (!soloGraph || rn.owner === from) graph.nodes.push(tagNodeOwner({ ...rn }));
        }
      }
      if (patch.edges) graph.edges = patch.edges;
      if (patch.meta) {
        const cg = patch.meta.canvasGroups;
        const rest = { ...patch.meta };
        delete rest.canvasGroups;
        graph.meta = { ...graph.meta, ...rest };
        if (cg) graph.meta.canvasGroups = mergeCanvasGroups(graph.meta.canvasGroups, cg);
        ensureCanvasGroups(graph.meta);
      }
      collabShell?.flashSync("ok");
      refreshCanvasTargets();
      vizUserRail?.render?.();
      vizViewsRail?.render?.();
      vizGroupsRail?.render?.();
      draw();
    },
    onFrameUpdate: (f, v, edges) => {
      if (f) graph.meta.frames = f;
      if (v) graph.meta.viewports = v;
      if (edges) graph.meta.frameEdges = edges;
      vizViewsRail?.render?.();
      vizGroupsRail?.render?.();
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
      if (el) {
        el.textContent = clients.length
          ? `● ${clients.length + 1}${soloGraph ? " · local" : ""}`
          : soloGraph ? "● solo · local" : "● solo";
        el.title = soloGraph
          ? "Solo graph · click to enable live sync"
          : "Live sync on · click for solo/local graph";
      }
      vizUserRail?.render?.();
      vizViewsRail?.render?.();
      vizGroupsRail?.render?.();
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

  vizGroupsRail = createVizGroupsRail({
    getGroups: canvasGroups,
    getLocalClient: () => ({
      clientId: collab?.clientId || localOwnerId(),
      name: localStorage.getItem("qbpm-collab-name") || "you",
    }),
    getPeers: () => collabPeers,
    isModerator: isLocalModerator,
    getFrames: frames,
    onToggleGroup: onToggleCanvasGroup,
    onOrchestraArrange: applyOrchestraArrange,
    onAddChannel: addCanvasChannel,
    onAssignFrame: assignFrameToTeam,
  });
  vizGroupsRail.mount();
  const initCid = collab?.clientId || localOwnerId();
  const initG = canvasGroups();
  if (!initG.memberPrefs[initCid]) {
    setMemberPrefs(initG, initCid, { teams: ["rhythm"], channels: [], genres: ["collab"] });
  }

  vizViewsRail = createVizViewsRail({
    getFrames: frames,
    getViewports: viewports,
    getPeers: () => collabPeers,
    getGroups: canvasGroups,
    getActiveFrameId: () => activeFrameId,
    getActiveWindowId: () => activeWindowId,
    getGraphName: () => GRAPH_NAME,
    onHopFrame: hopToFrame,
    onHopViewport: hopToViewport,
    onSelectFrame: selectFrame,
    onAddFrame: addCanvasFrame,
    onAddViewport: addViewportWindow,
  });
  vizViewsRail.mount();

  vizUserRail = createVizUserRail({
    getPeers: () => collabPeers,
    getGraphName: () => GRAPH_NAME,
    getCollab: () => collab,
    getLocalClient: () => ({
      clientId: collab?.clientId || localOwnerId(),
      name: localStorage.getItem("qbpm-collab-name") || "you",
      color: localStorage.getItem("qbpm-collab-color") || "#58a6ff",
    }),
    getNodesForUser: nodesForUser,
    onInviteUser: (url, meta) => {
      vizLog.textContent = meta?.copied
        ? `invite copied · ${collabPeers.length + 1} in session`
        : `invite link · share + user · ${url.slice(0, 64)}…`;
    },
    onSelectNode: selectNode,
    onMixOut: mixUserNodesOut,
    onMultichannelSend: sendMultichannelToWorkArea,
    onAiLink: aiLinkUserProject,
    onSaveCompTree: saveUserCompTree,
    onClearUserNodes: (uid) => { if (uid === localOwnerId()) clearLocalNodes(); },
  });
  vizUserRail.mount();

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
    getBpm: () => {
      const t = graph.meta?.theory;
      if (t?.locked?.bpm && t.bpm) return t.bpm;
      return liveState?.bpm || liveState?.cpm || t?.bpm || 120;
    },
    getTheory: () => graph.meta?.theory || null,
    onTheoryChange: (theory) => {
      if (!theory) return;
      graph.meta.theory = { ...graph.meta.theory, ...theory };
      if (theory.bpm) {
        liveState = { ...liveState, bpm: theory.bpm, cpm: theory.bpm };
      }
      draw();
      floatWorkspace?.drawNotation?.(liveState);
    },
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

  liveNodePanel = createLiveNodePanel({
    getPanScale: () => ({ pan, scale }),
    getSelectedId: () => selectedId,
    getGraph: () => graph,
    getCanvasWrap: () => document.getElementById("canvas-wrap"),
    getVideoWall: () => floatWorkspace?.getVideoWall?.(),
    onIngestUrl: (url) => floatWorkspace?.ingestWatchUrl?.(url),
    onStatus: (t) => collabShell?.appendPromptOutput?.(t),
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
  const hitR = (PORT_R * 2.4) ** 2;
  for (let i = graph.nodes.length - 1; i >= 0; i--) {
    const n = graph.nodes[i];
    const ports = [
      { ...linkPointFor(n, "in", "main"), node: n, portType: portTypeForNode(n, "in") },
      { ...linkPointFor(n, "out", "main"), node: n, portType: portTypeForNode(n, "out") },
    ];
    for (const side of ["left", "right"]) {
      for (const action of NODE_CTRL) {
        const pt = linkPointFor(n, side, action);
        ports.push({
          ...pt,
          node: n,
          portType: "control",
          control: action,
        });
      }
    }
    for (const p of ports) {
      const dx = wx - p.x;
      const dy = wy - p.y;
      if (dx * dx + dy * dy <= hitR) return p;
    }
  }
  return null;
}

function edgeEndpoints(e) {
  const a = graph.nodes.find((n) => n.id === e.from);
  const b = graph.nodes.find((n) => n.id === e.to);
  if (!a || !b) return null;
  const fromPort = e.fromPort || "main";
  const toPort = e.toPort || "main";
  const fromSide = NODE_CTRL.includes(fromPort) ? "right" : "out";
  const toSide = NODE_CTRL.includes(toPort) ? "left" : "in";
  const ap = linkPointFor(a, fromSide, fromPort);
  const bp = linkPointFor(b, toSide, toPort);
  return { ax: ap.x, ay: ap.y, bx: bp.x, by: bp.y, edge: e };
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
  const { w: cw, h: ch } = canvasCssSize();
  const wrap = document.getElementById("canvas-wrap");
  const dockLeft = Number(wrap?.dataset?.dockLeft) || 0;
  const dockRight = Number(wrap?.dataset?.dockRight) || cw;
  const safeW = Math.max(120, dockRight - dockLeft);
  const safeCx = dockLeft + safeW / 2;
  const sx = ww + padding * 2;
  const sy = wh + padding * 2;
  scale = Math.min(2.2, Math.max(0.25, Math.min(safeW / sx, ch / sy)));
  pan.x = safeCx - (wx + ww / 2) * scale;
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
  const { w, h } = canvasCssSize();
  drawCompGrid(ctx, pan, scale, w, h);
}

function draw() {
  const { w, h, dpr } = canvasCssSize();
  if (w < 2 || h < 2) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  ctx.scale(scale, scale);
  drawGrid();
  drawFrames();
  drawStudioLanes(ctx, graph, scale);

  for (const e of graph.edges) {
    const ep = edgeEndpoints(e);
    if (!ep) continue;
    const pt = PORT_TYPES[e.port] || PORT_TYPES.data;
    ctx.strokeStyle = pt.color || "#484f58";
    ctx.lineWidth = (e.port === "control" ? 1.5 : 2) / scale;
    const mx = (ep.ax + ep.bx) / 2;
    ctx.beginPath();
    ctx.moveTo(ep.ax, ep.ay);
    ctx.bezierCurveTo(mx, ep.ay, mx, ep.by, ep.bx, ep.by);
    ctx.stroke();
    if (e.fromPort && e.fromPort !== "main") {
      ctx.fillStyle = pt.color || "#6e7681";
      ctx.font = `${8 / scale}px Menlo, monospace`;
      ctx.fillText(e.fromPort, ep.ax + 4 / scale, ep.ay - 4 / scale);
    }
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
      if (src) {
        const pt = linkPointFor(src, linking.fromSide || "out", linking.fromPort || "main");
        ctx.moveTo(pt.x, pt.y);
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

    const inT = portTypeForNode(n, "in");
    const outT = portTypeForNode(n, "out");
    ctx.fillStyle = PORT_TYPES[inT]?.color || "#3fb950";
    ctx.beginPath();
    ctx.arc(r.x, r.y + r.h / 2, PORT_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PORT_TYPES[outT]?.color || "#d29922";
    ctx.beginPath();
    ctx.arc(r.x + r.w, r.y + r.h / 2, PORT_R, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#c9d1d9";
    ctx.font = `${11 / scale}px Menlo, monospace`;
    ctx.fillText(n.id, r.x + 10, r.y + 20);
    ctx.fillStyle = "#8b949e";
    ctx.font = `${9 / scale}px Menlo, monospace`;
    ctx.fillText(n.type, r.x + 10, r.y + 36);
    if (n.type?.startsWith("live.")) {
      const feat = n.data?.label || n.data?.feature || n.type.split(".")[1] || "rail";
      if (n.id === selectedId) {
        ctx.fillStyle = "rgba(33, 38, 45, 0.35)";
        ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        ctx.fillStyle = "#6e7681";
        ctx.font = `${8 / scale}px Menlo, monospace`;
        ctx.fillText(`${feat} · dbl-click editor`, r.x + 8, r.y + 14);
      } else {
        const urls = n.data?.urls?.length || 0;
        ctx.fillStyle = "#d29922";
        ctx.font = `${7 / scale}px Menlo, monospace`;
        ctx.fillText(`${feat} · ${urls} src`, r.x + 10, r.y + 48);
      }
    }
    if (n.section) {
      ctx.fillStyle = "#484f58";
      ctx.font = `${7 / scale}px Menlo, monospace`;
      ctx.fillText(n.section, r.x + r.w - 52, r.y + 12);
    }
    if (hasWaveform(n) && !(n.type?.startsWith("live.") && n.id === selectedId)) {
      drawNodeWaveform(ctx, r, n, scale);
    }
    if (!(n.type?.startsWith("live.") && n.id === selectedId)) {
      const lk = nodeParamKey(n, "left");
      const rk = nodeParamKey(n, "right");
      const yParam = hasWaveform(n) ? r.y + r.h - 14 : r.y + 50;
      ctx.fillStyle = "#6e7681";
      ctx.font = `${8 / scale}px Menlo, monospace`;
      ctx.fillText(`L ${lk}=${p[lk] ?? nodeParamDefault(n, lk)}`, r.x + 8, yParam);
      ctx.fillText(`R ${rk}=${p[rk] ?? nodeParamDefault(n, rk)}`, r.x + 8, yParam + 10);
      drawNodeCycleBar(ctx, r, n, transport, scale);
    }
  }
  if (collab) collab.drawPeers(ctx, pan, scale);
  ctx.restore();
  updateCanvasResolutionLabel();
  collabShell?.positionOverlays?.();
  liveNodePanel?.sync?.();
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

function canvasNeedsAnimRedraw() {
  return !!(graph.nodes && graph.nodes.length);
}

function vizAnimLoop() {
  if (getTabRuntime().isVisible()) {
    drawViz();
    if (canvasNeedsAnimRedraw()) draw();
  }
  requestAnimationFrame(vizAnimLoop);
}

async function loadGraph(opts = {}) {
  const P = pages();
  const api = isBridgeOnline() ? P.api(`api/graph/${GRAPH_NAME}`) : null;
  if (api) {
    const data = await fetchApiJson(
      `${api}${opts.bust ? `?t=${Date.now()}` : ""}`,
      opts.hard ? { cache: "no-store" } : undefined,
    );
    if (data.ok !== false && data.nodes) {
      graph = data;
    } else if (!P.staticShell && data.error) {
      throw new Error(data.error);
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
    tagNodeOwner(n);
  }
  vizUserRail?.render?.();
  if (qubeManager) {
    await qubeManager.restore();
  } else if (graph.nodes[0]) {
    selectNode(graph.nodes[0].id);
  }
  refreshCanvasTargets();
  floatWorkspace?.positionFramePanels?.();
  resize();
  alignView("graph");
  qubeManager?.scheduleFlush?.("all");
}

async function hardRefreshCanvas() {
  vizLog.textContent = "refreshing…";
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      await reg?.update();
    }
    location.reload();
  } catch (err) {
    vizLog.textContent = `refresh error: ${err}`;
  }
}

async function saveGraph() {
  await qubeManager?.flush?.("all");
  const api = resolveApiUrl(`api/graph/${GRAPH_NAME}`);
  if (!api) {
    localStorage.setItem(`qbpm-graph-${GRAPH_NAME}`, JSON.stringify(graph));
    vizLog.textContent = "saved locally · qube compartments";
    return;
  }
  const data = await fetchApiJson(api, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(graph),
  });
  if (data.ok === false) {
    localStorage.setItem(`qbpm-graph-${GRAPH_NAME}`, JSON.stringify(graph));
    vizLog.textContent = "saved locally · API offline";
    return;
  }
  vizLog.textContent = `saved ${data.path || "remote"}`;
  collab?.broadcastGraph(graph);
}

async function runGraph() {
  const url = resolveApiUrl(`api/graph/${GRAPH_NAME}/run`);
  if (!url) {
    vizLog.textContent = "run · local shell (needs API host for execution)";
    syncFloatPanels();
    drawViz();
    return;
  }
  const data = await fetchApiJson(url, { method: "POST" });
  if (data.ok === false) {
    vizLog.textContent = `run · offline (${data.error || "no API"})`;
    return;
  }
  lastRun = data;
  vizLog.textContent = JSON.stringify(lastRun, null, 2);
  syncFloatPanels();
  drawViz();
}

async function agentPropose() {
  const url = resolveApiUrl("api/agent/propose");
  if (!url) {
    vizLog.textContent = "agent · local shell (needs API host)";
    return;
  }
  const data = await fetchApiJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ graph, intent: "expand" }),
  });
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
  const code = n.type?.startsWith("live.")
    ? JSON.stringify(n.data || { urls: [] }, null, 2)
    : (n.code || "");
  document.getElementById("insp-code").value = code;
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
  const raw = document.getElementById("insp-code").value;
  if (n.type?.startsWith("live.")) {
    try {
      n.data = JSON.parse(raw);
    } catch (_) {
      n.data = { urls: [], raw };
    }
  } else {
    n.code = raw;
  }
  tagNodeOwner(n);
  if (!soloGraph) collab?.broadcastPatch?.({ nodes: graph.nodes });
  const entry = liveNodePanel?.getFeedForNode?.(n.id);
  if (entry && n.type?.startsWith("live.")) {
    const urls = n.data?.urls;
    if (Array.isArray(urls) && urls.length) entry.loadLiveVideos?.(urls);
    const url = n.data?.url || n.data?.ingestUrl;
    if (url) entry.loadUrl?.(url);
  }
  liveNodePanel?.sync?.();
  draw();
  qubeManager?.scheduleFlush?.("nodes");
  vizUserRail?.render?.();
}

function deleteSelectedNode() {
  if (!selectedId) return;
  const id = selectedId;
  graph.nodes = graph.nodes.filter((n) => n.id !== id);
  graph.edges = graph.edges.filter((e) => e.from !== id && e.to !== id);
  selectedId = null;
  document.getElementById("insp-id").value = "";
  if (!soloGraph) collab?.broadcastPatch?.({ nodes: graph.nodes, edges: graph.edges });
  qubeManager?.scheduleFlush?.("nodes");
  vizUserRail?.render?.();
  refreshCanvasTargets();
  draw();
}

function clearLocalNodes() {
  const owner = localOwnerId();
  const remove = new Set(
    graph.nodes.filter((n) => (n.owner || owner) === owner).map((n) => n.id),
  );
  graph.nodes = graph.nodes.filter((n) => !remove.has(n.id));
  graph.edges = graph.edges.filter((e) => !remove.has(e.from) && !remove.has(e.to));
  selectedId = null;
  document.getElementById("insp-id").value = "";
  if (!soloGraph) collab?.broadcastPatch?.({ nodes: graph.nodes, edges: graph.edges });
  qubeManager?.scheduleFlush?.("nodes");
  vizUserRail?.render?.();
  refreshCanvasTargets();
  draw();
  vizLog.textContent = `cleared ${remove.size} local node(s)`;
}

function addNode(type = "python.exec") {
  const id = `node-${graph.nodes.length + 1}`;
  const b = graphBounds();
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const def = defaultNodeData(type);
  graph.nodes.push(tagNodeOwner({
    id,
    type,
    pos: [cx, cy + graph.nodes.length * 24],
    code: defaultNodeCode(type),
    data: def,
    section: type.startsWith("live.") ? "video" : type.startsWith("music.") ? "music" : type.startsWith("audio.") ? "percussion" : undefined,
    params: { in: 1, out: 1 },
  }));
  selectNode(id);
  refreshCanvasTargets();
  draw();
}

function loadStudioPreset(presetId = "underoath-gillespie") {
  graph = applyStudioPreset(graph, presetId, localOwnerId());
  ensureCanvasMeta();
  graph.nodes.forEach(tagNodeOwner);
  if (graph.nodes[0]) selectNode(graph.nodes[0].id);
  alignView("graph");
  if (!soloGraph) collab?.broadcastPatch?.({ nodes: graph.nodes, edges: graph.edges, meta: graph.meta });
  vizLog.textContent = `studio preset · ${presetId} · ${graph.nodes.length} nodes`;
  draw();
}

function addLiveRailNode() {
  addNode("live.rail");
}

function saveUserCompTree(userId) {
  const nodes = nodesForUser(userId);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => ids.has(e.from) && ids.has(e.to));
  const tree = { version: 1, owner: userId, nodes, edges, meta: graph.meta, ts: Date.now() };
  const blob = new Blob([JSON.stringify(tree, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qbpm-comp-${userId.slice(0, 8)}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  vizLog.textContent = `saved comp tree · ${nodes.length} nodes`;
}

function mixUserNodesOut(userId) {
  const nodes = nodesForUser(userId);
  const payload = {
    musica: nodes.map((n) => n.id).join(" "),
    bpm: liveState?.bpm || graph.meta?.cpm || 120,
    mix: "raw",
    nodes: nodes.map((n) => ({ id: n.id, type: n.type })),
  };
  window.qbpmLive?.ingest?.(payload, `mix:${userId}`);
  vizLog.textContent = `mix out · ${nodes.length} nodes → raw`;
}

function sendMultichannelToWorkArea(userId) {
  const frameId = ensureUserFrame(userId, `work-${userId.slice(-4)}`, "#58a6ff");
  const frame = frames().find((f) => f.id === frameId);
  const nodes = nodesForUser(userId);
  if (!soloGraph) {
    collab?.broadcastPatch?.({
      meta: {
        ...graph.meta,
        multichannel: { to: userId, frameId, channels: nodes.length, ts: Date.now() },
      },
    });
  }
  vizLog.textContent = `multichannel → ${frame?.label || userId} · ${nodes.length} ch`;
}

function aiLinkUserProject(userId) {
  const nodes = nodesForUser(userId);
  const summary = nodes.map((n) => `${n.id}:${n.type}`).join(", ");
  collabShell?.appendPromptOutput?.(`ai link · ${userId} · ${summary || "empty"}`);
  if (!soloGraph) {
    collab?.broadcastPatch?.({
      nodes: graph.nodes,
      edges: graph.edges,
      meta: { ...graph.meta, sharedProject: { owner: userId, ts: Date.now() } },
    });
  }
  agentPropose().catch(() => {});
}

function setPanMode(on) {
  canvas.classList.toggle("pan-mode", on || touchPanMode);
}

const RIGHT_TAB_KEY = "qbpm-right-tab";
const RIGHT_COLLAPSED_KEY = "qbpm-right-collapsed";

function setRightPanelCollapsed(collapsed) {
  const on = !!collapsed;
  workspace.classList.toggle("right-collapsed", on);
  const btn = document.getElementById("btn-right-collapse");
  if (btn) {
    btn.setAttribute("aria-pressed", String(on));
    btn.title = on ? "Right column collapsed" : "Collapse right column";
    btn.textContent = on ? "◂" : "▸";
  }
  try {
    localStorage.setItem(RIGHT_COLLAPSED_KEY, on ? "1" : "0");
  } catch (_) {}
  setTimeout(resize, 30);
  if (on) floatWorkspace?.collapseRightColumn?.();
}

function toggleRightPanelCollapsed() {
  setRightPanelCollapsed(!workspace.classList.contains("right-collapsed"));
}

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
  syncFooterInsets();
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
  window.qbpm.loadStudioPreset = loadStudioPreset;
  window.qbpm.addNode = addNode;
  window.qbpm.setRightPanelTab = setRightPanelTab;
  window.qbpm.getFrames = () => structuredClone(frames());
  window.qbpm.getViewports = () => structuredClone(viewports());
  window.qbpm.getTabRuntime = () => getTabRuntime();
  window.qbpm.loadLiveVideos = (urls) => {
    floatWorkspace?.openDockPanel?.("video");
    floatWorkspace?.getVideoFeed?.()?.loadLiveVideos?.(urls);
  };
  window.qbpm.clearLiveVideos = () => floatWorkspace?.getVideoFeed?.()?.getLiveRail?.()?.clearAll?.();
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
      if (!statusEl) return;
      if (ev.type === "local") {
        statusEl.textContent = "● local · offline bridge";
        statusEl.classList.remove("active");
      } else if (ev.type === "close") {
        statusEl.textContent = pages().bridgeOnline === false ? "● local · offline bridge" : "● reconnecting…";
        statusEl.classList.remove("active");
      } else if (ev.type === "open") {
        statusEl.classList.add("active");
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
document.querySelectorAll("#right-tabs button[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => setRightPanelTab(btn.dataset.tab));
});
document.getElementById("btn-add").addEventListener("click", () => addNode());
document.getElementById("btn-add-live-rail")?.addEventListener("click", addLiveRailNode);
document.getElementById("btn-studio-preset")?.addEventListener("click", () => loadStudioPreset("underoath-gillespie"));
document.getElementById("btn-del-node")?.addEventListener("click", deleteSelectedNode);
document.getElementById("insp-del-node")?.addEventListener("click", deleteSelectedNode);
document.getElementById("insp-clear-nodes")?.addEventListener("click", clearLocalNodes);
document.getElementById("collab-status")?.addEventListener("click", () => {
  soloGraph = !soloGraph;
  localStorage.setItem(SOLO_GRAPH_KEY, soloGraph ? "1" : "0");
  const el = document.getElementById("collab-status");
  if (el) {
    el.textContent = soloGraph ? "● solo · local" : `● ${collabPeers.length + 1} sync`;
    el.title = soloGraph ? "Solo graph · click to enable live sync" : "Live sync on · click for solo/local";
  }
  vizLog.textContent = soloGraph ? "solo graph · local nodes only" : "live sync · sharing graph patches";
});
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

document.getElementById("btn-right-collapse")?.addEventListener("click", toggleRightPanelCollapsed);
document.getElementById("btn-right-expand")?.addEventListener("click", () => setRightPanelCollapsed(false));

try {
  if (localStorage.getItem(RIGHT_COLLAPSED_KEY) === "1") {
    setRightPanelCollapsed(true);
  }
} catch (_) {}

let vizExpandStep = 0;
document.getElementById("btn-viz-expand").addEventListener("click", () => {
  vizExpandStep = (vizExpandStep + 1) % 3;
  workspace.classList.remove("viz-expanded", "viz-full");
  if (vizExpandStep === 1) workspace.classList.add("viz-expanded");
  if (vizExpandStep === 2) workspace.classList.add("viz-full");
  setTimeout(resize, 50);
});

window.addEventListener("keydown", (ev) => {
  if ((ev.code === "Delete" || ev.code === "Backspace") && selectedId
      && ev.target.tagName !== "TEXTAREA" && ev.target.tagName !== "INPUT" && !ev.target.isContentEditable) {
    ev.preventDefault();
    deleteSelectedNode();
    return;
  }
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
    controlDrag = { ctrl, sx, sy, wx, wy, moved: false };
    ev.preventDefault();
    canvas.setPointerCapture(ev.pointerId);
    return;
  }
  canvas.setPointerCapture(ev.pointerId);
  const fport = ev.shiftKey ? framePortAt(wx, wy) : null;
  const port = !fport ? portAt(wx, wy) : null;

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

  if (port && (port.side === "out" || port.control)) {
    linking = {
      kind: "node",
      fromId: port.node.id,
      fromPort: port.port || port.control || "main",
      fromSide: port.side || "out",
      portType: port.portType || "data",
      wx,
      wy,
      sx,
      sy,
    };
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
  if (controlDrag && !controlDrag.moved) {
    const dx = sx - controlDrag.sx;
    const dy = sy - controlDrag.sy;
    if (Math.hypot(dx, dy) >= CONTROL_DRAG_THRESH) {
      controlDrag.moved = true;
      const c = controlDrag.ctrl;
      if (c.side === "left") {
        controlDrag = null;
        return;
      }
      linking = {
        kind: "node",
        fromId: c.node.id,
        fromPort: c.action,
        fromSide: "out",
        portType: "control",
        wx,
        wy,
        sx,
        sy,
      };
      selectNode(c.node.id);
    }
  }
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
      const tgt = port && (port.side === "in" || port.control) ? port : null;
      if (tgt && tgt.node.id !== linking.fromId) {
        const outType = linking.portType || portTypeForNode(graph.nodes.find((n) => n.id === linking.fromId), "out", linking.fromPort);
        const inType = tgt.portType || portTypeForNode(tgt.node, "in", tgt.port);
        if (portsCompatible(outType, inType)) {
          const toPort = tgt.port || tgt.control || "main";
          const exists = graph.edges.some(
            (e) => e.from === linking.fromId && e.to === tgt.node.id && e.fromPort === linking.fromPort && e.toPort === toPort,
          );
          if (!exists) {
            graph.edges.push({
              from: linking.fromId,
              to: tgt.node.id,
              port: outType === "control" ? "control" : outType || "data",
              fromPort: linking.fromPort || "main",
              toPort,
            });
            if (!soloGraph) collab?.broadcastPatch?.({ edges: graph.edges });
          }
        }
      }
    }
    linking = null;
    draw();
  }
  if (controlDrag && !controlDrag.moved) {
    applyNodeControl(controlDrag.ctrl);
  }
  controlDrag = null;
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
  const hit = nodeAt(wx, wy);
  if (hit?.type?.startsWith("live.")) {
    selectNode(hit.id);
    liveNodePanel?.sync?.();
    const urls = hit.data?.urls || [];
    if (urls.length) {
      liveNodePanel?.getFeedForNode?.(hit.id)?.loadLiveVideos?.(urls);
    }
    return;
  }
  if (!hit) addNode();
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

function refreshStaticShellChrome() {
  if (!pages().staticShell) return;
  const cs = document.getElementById("collab-status");
  const offline = pages().bridgeOnline === false;
  if (cs) cs.textContent = offline ? "● solo · local" : "● static shell";
  const hint = document.getElementById("canvas-hint");
  if (hint) {
    const v = pages().variant || "pages";
    if (offline) {
      hint.textContent = `${v} · local-only · graph saved in browser · API bridge offline`;
    } else {
      const api = pages().apiBase?.() || pages().defaultApiBase || "api";
      hint.textContent = `${v} · local graph · API bridge: ${api}`;
    }
  }
}
refreshStaticShellChrome();
window.addEventListener("qbpm-bridge-status", refreshStaticShellChrome);

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