/**
 * Studio session presets — drum kit miking (Mixwave / Underoath Gillespie style)
 * Nuke-style node comp + Theatre lanes via meta.studio.sections
 */

import { nodeDef } from "./node-registry.js";

const UNDER_OATH_MICS = [
  { id: "kick-in", mic: "kick-in", label: "Kick In", pos: [120, 120], pan: -0.1 },
  { id: "kick-out", mic: "kick-out", label: "Kick Out", pos: [120, 220], pan: -0.05 },
  { id: "snare-top", mic: "snare-top", label: "Snare Top", pos: [280, 100], pan: 0 },
  { id: "snare-bottom", mic: "snare-bottom", label: "Snare Btm", pos: [280, 200], pan: 0 },
  { id: "hihat", mic: "hihat", label: "Hi-Hat", pos: [420, 90], pan: 0.35 },
  { id: "tom-rack", mic: "tom-rack", label: "Rack Tom", pos: [420, 180], pan: 0.15 },
  { id: "tom-floor", mic: "tom-floor", label: "Floor Tom", pos: [420, 270], pan: 0.2 },
  { id: "oh-l", mic: "oh-l", label: "OH L", pos: [560, 80], pan: -0.7 },
  { id: "oh-r", mic: "oh-r", label: "OH R", pos: [560, 160], pan: 0.7 },
  { id: "room-l", mic: "room-l", label: "Room L", pos: [700, 100], pan: -0.9 },
  { id: "room-r", mic: "room-r", label: "Room R", pos: [700, 200], pan: 0.9 },
  { id: "ride", mic: "ride", label: "Ride", pos: [840, 90], pan: 0.5 },
  { id: "crash", mic: "crash", label: "Crash", pos: [840, 190], pan: -0.4 },
];

export const STUDIO_PRESETS = {
  "underoath-gillespie": {
    label: "Underoath · Gillespie drum session",
    bpm: 148,
    sections: [
      { id: "percussion", label: "Drum mics · session", color: "#f85149", lane: 0 },
      { id: "video", label: "Video transport", color: "#79c0ff", lane: 1 },
      { id: "music", label: "Music tools", color: "#bc8cff", lane: 2 },
    ],
  },
};

function micNode(spec, owner) {
  return {
    id: spec.id,
    type: "audio.mic",
    pos: spec.pos,
    owner,
    section: "percussion",
    params: { in: 1, out: 1, gain: 0, pan: spec.pan },
    data: { mic: spec.mic, label: spec.label, gain: 0, pan: spec.pan },
  };
}

function edge(from, to, port = "audio", fromPort = "main", toPort = "main") {
  return { from, to, port, fromPort, toPort };
}

export function buildUnderoathDrumSession(owner = "local") {
  const preset = STUDIO_PRESETS["underoath-gillespie"];
  const nodes = [];
  const edges = [];

  nodes.push({
    id: "studio-hub",
    type: "studio.session",
    pos: [980, 320],
    owner,
    section: "percussion",
    params: { in: 1, out: 1 },
    data: { preset: "underoath-gillespie", bpm: preset.bpm, artist: "Aaron Gillespie / Underoath" },
  });

  for (const m of UNDER_OATH_MICS) {
    nodes.push(micNode(m, owner));
    edges.push(edge(m.id, "studio-hub", "audio", "+", "in"));
  }

  const videoY = 480;
  const videoNodes = [
    { id: "vid-ingest", type: "live.ingest", label: "Transport Ingest", x: 120 },
    { id: "vid-rail", type: "live.rail", label: "Live Rail", x: 320 },
    { id: "vid-vwall", type: "live.vwall", label: "VWall", x: 520 },
    { id: "vid-queue", type: "live.queue", label: "Video Queue", x: 720 },
    { id: "vid-transport", type: "live.transport", label: "Play Controls", x: 920 },
  ];
  for (const v of videoNodes) {
    nodes.push({
      id: v.id,
      type: v.type,
      pos: [v.x, videoY],
      owner,
      section: "video",
      params: { in: 1, out: 1 },
      data: { label: v.label, urls: [], features: [v.type.split(".")[1]] },
    });
  }
  edges.push(
    edge("vid-ingest", "vid-rail", "video"),
    edge("vid-rail", "vid-vwall", "video"),
    edge("vid-vwall", "vid-queue", "video"),
    edge("vid-queue", "vid-transport", "video"),
    edge("vid-transport", "studio-hub", "video", "out", "in"),
  );

  const musicY = 640;
  const musicNodes = [
    { id: "mus-clock", type: "music.clock", x: 120 },
    { id: "mus-piano", type: "music.piano", x: 300 },
    { id: "mus-beatpad", type: "music.beatpad", x: 480 },
    { id: "mus-loop", type: "music.loop", x: 660 },
    { id: "mus-notation", type: "music.notation", x: 840 },
    { id: "mus-eq", type: "music.eq", x: 1020 },
    { id: "mus-code", type: "music.code", x: 1200 },
    { id: "mus-wave", type: "music.waveform", x: 1380 },
  ];
  for (const m of musicNodes) {
    nodes.push({
      id: m.id,
      type: m.type,
      pos: [m.x, musicY],
      owner,
      section: "music",
      params: { in: 1, out: 1 },
      data: m.type === "music.code" ? { lang: "strudel", code: 's("bd*4, [~ sd]*2")' } : {},
    });
  }
  edges.push(
    edge("mus-clock", "mus-piano", "midi"),
    edge("mus-clock", "mus-beatpad", "clock"),
    edge("mus-beatpad", "mus-loop", "midi"),
    edge("mus-piano", "mus-notation", "midi"),
    edge("mus-loop", "mus-eq", "audio"),
    edge("mus-eq", "mus-wave", "audio"),
    edge("mus-code", "mus-beatpad", "midi"),
    edge("mus-wave", "studio-hub", "audio"),
    edge("studio-hub", "mus-code", "data", "out", "in"),
  );

  nodes.push({
    id: "session-out",
    type: "core.output",
    pos: [1180, 320],
    owner,
    section: "percussion",
    params: { in: 1, out: 0 },
  });
  edges.push(edge("studio-hub", "session-out", "audio"));

  return {
    version: 1,
    meta: {
      name: "studio-underoath-gillespie",
      cpm: preset.bpm,
      studio: {
        preset: "underoath-gillespie",
        sections: preset.sections,
        lanes: preset.sections.map((s) => ({ id: s.id, label: s.label, color: s.color })),
        theatre: { extended: true, laneHeight: 180 },
      },
    },
    nodes,
    edges,
  };
}

export function applyStudioPreset(graph, presetId = "underoath-gillespie", owner) {
  if (presetId !== "underoath-gillespie") return graph;
  const built = buildUnderoathDrumSession(owner);
  return {
    ...graph,
    meta: { ...graph.meta, ...built.meta },
    nodes: [...graph.nodes, ...built.nodes],
    edges: [...graph.edges, ...built.edges],
  };
}

export function listStudioPresets() {
  return Object.entries(STUDIO_PRESETS).map(([id, p]) => ({ id, label: p.label }));
}

/** Theatre-style extended lanes behind node sections */
export function drawStudioLanes(ctx, graph, scale = 1) {
  const studio = graph?.meta?.studio;
  if (!studio?.sections?.length) return;
  const laneH = studio.theatre?.laneHeight || 160;
  const bySection = new Map();
  for (const n of graph.nodes || []) {
    const sid = n.section || nodeDef(n.type).section;
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid).push(n);
  }
  let laneY = -40;
  for (const sec of studio.sections) {
    const members = bySection.get(sec.id) || [];
    if (!members.length) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const n of members) {
      const [x, y] = n.pos || [0, 0];
      const d = nodeDef(n.type);
      minX = Math.min(minX, x - 40);
      maxX = Math.max(maxX, x + (d.w || 168) + 40);
      laneY = Math.max(laneY, y + (d.h || 64) + 24);
    }
    const y0 = members[0]?.pos?.[1] - 36 || 0;
    const x0 = minX;
    const w = maxX - minX;
    const h = laneH;
    ctx.save();
    ctx.fillStyle = `${sec.color || "#58a6ff"}12`;
    ctx.strokeStyle = `${sec.color || "#58a6ff"}44`;
    ctx.lineWidth = 1 / scale;
    ctx.setLineDash([8 / scale, 6 / scale]);
    ctx.fillRect(x0, y0 - 8, w, h);
    ctx.strokeRect(x0, y0 - 8, w, h);
    ctx.setLineDash([]);
    ctx.fillStyle = sec.color || "#8b949e";
    ctx.font = `bold ${10 / scale}px Menlo, monospace`;
    ctx.fillText(sec.label || sec.id, x0 + 8, y0 + 4);
    ctx.restore();
  }
}