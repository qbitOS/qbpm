/** Nuke-style node arrange — DAG columns, grid snap, section rows */

import { nodeSize } from "./node-registry.js";

export const LAYOUT_GRID = 24;

export function snapPos(pos, grid = LAYOUT_GRID) {
  const g = Math.max(8, grid);
  return [Math.round(pos[0] / g) * g, Math.round(pos[1] / g) * g];
}

function nodeIdsInGraph(nodes) {
  return new Set((nodes || []).map((n) => n.id));
}

/** Topological layers left → right (Nuke DAG flow) */
export function layoutNodesDag(nodes, edges, opts = {}) {
  const gapX = opts.gapX ?? 220;
  const gapY = opts.gapY ?? 96;
  const grid = opts.grid ?? LAYOUT_GRID;
  const origin = opts.origin || [80, 120];
  const ids = nodeIdsInGraph(nodes);
  const out = new Map();
  const inn = new Map();
  for (const id of ids) {
    out.set(id, []);
    inn.set(id, []);
  }
  for (const e of edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    out.get(e.from).push(e.to);
    inn.get(e.to).push(e.from);
  }
  const layer = new Map();
  const roots = [...ids].filter((id) => inn.get(id).length === 0);
  const start = roots.length ? roots : [...ids];
  const queue = start.map((id) => ({ id, l: 0 }));
  const seen = new Set();
  while (queue.length) {
    const { id, l } = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    layer.set(id, Math.max(layer.get(id) ?? 0, l));
    for (const to of out.get(id) || []) {
      queue.push({ id: to, l: l + 1 });
    }
  }
  for (const id of ids) if (!layer.has(id)) layer.set(id, 0);

  const byLayer = new Map();
  for (const [id, l] of layer) {
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(id);
  }
  const positions = new Map();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  for (const [l, list] of [...byLayer.entries()].sort((a, b) => a[0] - b[0])) {
    list.sort((a, b) => {
      const na = nodeById.get(a);
      const nb = nodeById.get(b);
      return (na?.pos?.[1] ?? 0) - (nb?.pos?.[1] ?? 0);
    });
    list.forEach((id, i) => {
      const n = nodeById.get(id);
      const sz = nodeSize(n);
      const x = origin[0] + l * gapX;
      const y = origin[1] + i * gapY;
      positions.set(id, snapPos([x, y], grid));
    });
  }
  return positions;
}

/** Connected component containing nodeId */
export function componentNodeIds(nodeId, nodes, edges) {
  const ids = nodeIdsInGraph(nodes);
  const adj = new Map();
  for (const id of ids) adj.set(id, new Set());
  for (const e of edges || []) {
    if (!ids.has(e.from) || !ids.has(e.to)) continue;
    adj.get(e.from).add(e.to);
    adj.get(e.to).add(e.from);
  }
  const out = new Set();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop();
    if (out.has(id) || !ids.has(id)) continue;
    out.add(id);
    for (const nb of adj.get(id) || []) stack.push(nb);
  }
  return out;
}

export function layoutComponent(nodeId, nodes, edges, opts = {}) {
  const comp = componentNodeIds(nodeId, nodes, edges);
  const subNodes = nodes.filter((n) => comp.has(n.id));
  const subEdges = edges.filter((e) => comp.has(e.from) && comp.has(e.to));
  const anchor = nodes.find((n) => n.id === nodeId);
  const origin = opts.origin || anchor?.pos || [80, 120];
  return layoutNodesDag(subNodes, subEdges, { ...opts, origin });
}

export function layoutBySection(nodes, opts = {}) {
  const gapX = opts.gapX ?? 200;
  const gapY = opts.rowGap ?? 140;
  const grid = opts.grid ?? LAYOUT_GRID;
  const origin = opts.origin || [80, 80];
  const sections = new Map();
  for (const n of nodes) {
    const sec = n.section || "graph";
    if (!sections.has(sec)) sections.set(sec, []);
    sections.get(sec).push(n);
  }
  const positions = new Map();
  let row = 0;
  for (const [, list] of sections) {
    list.forEach((n, i) => {
      positions.set(n.id, snapPos([origin[0] + i * gapX, origin[1] + row * gapY], grid));
    });
    row += 1;
  }
  return positions;
}

export function applyLayoutPositions(nodes, positions) {
  for (const n of nodes) {
    const p = positions.get(n.id);
    if (p) n.pos = [...p];
  }
}

export function ensureNodeLayoutMeta(meta) {
  if (!meta || typeof meta !== "object") return { wireStyle: "nuke", grid: LAYOUT_GRID };
  if (!meta.nodeLayout) meta.nodeLayout = { wireStyle: "nuke", grid: LAYOUT_GRID };
  return meta.nodeLayout;
}