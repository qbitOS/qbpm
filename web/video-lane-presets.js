/** Video lane — standalone nodes + Nuke-style ingest→rail→vwall→queue→transport chain */

import { defaultNodeData } from "./node-registry.js";

export const VIDEO_LANE_STAGES = [
  { type: "live.ingest", slug: "ingest", label: "Transport Ingest", icon: "⬇", desc: "ingest · URL · yt-dlp" },
  { type: "live.rail", slug: "rail", label: "Live Rail", icon: "📹", desc: "multi-source rail" },
  { type: "live.vwall", slug: "vwall", label: "VWall", icon: "⊞", desc: "grid · pins · mod" },
  { type: "live.queue", slug: "queue", label: "Video Queue", icon: "☰", desc: "playlist · cues" },
  { type: "live.transport", slug: "transport", label: "Play Controls", icon: "▶", desc: "play · loop · scrub" },
];

export const VIDEO_LANE_SINGLE = [
  ...VIDEO_LANE_STAGES,
  { type: "live.video", slug: "video", label: "Video Node", icon: "🎬", desc: "single stream" },
];

function makeVideoNode(type, id, pos, owner, label) {
  const slug = type.split(".")[1];
  const data = { ...(defaultNodeData(type) || {}), label: label || slug, feature: slug };
  return {
    id,
    type,
    pos,
    owner,
    section: "video",
    params: { in: 1, out: 1 },
    code: JSON.stringify(data, null, 2),
    data,
  };
}

function chainEdge(from, to) {
  return { from, to, port: "video", fromPort: "main", toPort: "main" };
}

/** Append full Nuke-style video lane at origin [x,y] */
export function appendVideoLaneChain(graph, opts = {}) {
  const owner = opts.owner || "local";
  const [ox, oy] = opts.origin || [200, 200];
  const gap = opts.gap ?? 200;
  const prefix = opts.prefix || `vid-${Date.now().toString(36)}`;
  const nodes = [];
  const edges = [];
  let prevId = null;

  VIDEO_LANE_STAGES.forEach((stage, i) => {
    const id = `${prefix}-${stage.slug}`;
    nodes.push(makeVideoNode(stage.type, id, [ox + i * gap, oy], owner, stage.label));
    if (prevId) edges.push(chainEdge(prevId, id));
    prevId = id;
  });

  return {
    nodes,
    edges,
    firstId: nodes[0]?.id,
    lastId: nodes[nodes.length - 1]?.id,
  };
}

/** Append one standalone video lane node */
export function appendVideoLaneNode(graph, type, opts = {}) {
  const owner = opts.owner || "local";
  const stage = VIDEO_LANE_SINGLE.find((s) => s.type === type) || { type, label: type, slug: "vid" };
  const b = opts.bounds;
  const cx = b ? b.x + b.w / 2 : 200;
  const cy = b ? b.y + b.h / 2 + (graph.nodes?.length || 0) * 24 : 200;
  const [ox, oy] = opts.origin || [cx, cy];
  const id = opts.id || `${stage.slug}-${Date.now().toString(36).slice(-6)}`;
  const node = makeVideoNode(type, id, [ox, oy], owner, stage.label);
  return { node, id };
}

export function videoLanePickerItems() {
  return [
    { id: "chain", kind: "chain", label: "Full video lane", icon: "⛓", desc: "ingest → rail → vwall → queue → transport" },
    ...VIDEO_LANE_SINGLE.map((s) => ({
      id: s.type,
      kind: "single",
      type: s.type,
      label: s.label,
      icon: s.icon,
      desc: s.desc,
    })),
  ];
}