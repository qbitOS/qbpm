/** Nuke-style node wires — elbows, fork buses, link preview */

const STEM_PAD = 28;

export function elbowPoints(ax, ay, bx, by, scale = 1) {
  const p = STEM_PAD / Math.max(0.2, scale);
  const minMid = ax + p;
  const maxMid = bx - p;
  let midX;
  if (maxMid > minMid) midX = minMid + (maxMid - minMid) * 0.42;
  else midX = ax + p + Math.abs(bx - ax) * 0.25;
  return [
    [ax, ay],
    [midX, ay],
    [midX, by],
    [bx, by],
  ];
}

function strokePolyline(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
}

export function drawElbowWire(ctx, ep, scale, style = {}) {
  if (!ctx || !ep) return;
  const pts = elbowPoints(ep.ax, ep.ay, ep.bx, ep.by, scale);
  strokePolyline(ctx, pts);
  if (style.label && ep.edge?.fromPort && ep.edge.fromPort !== "main") {
    ctx.fillStyle = style.labelColor || "#6e7681";
    ctx.font = `${8 / scale}px Menlo, monospace`;
    ctx.fillText(ep.edge.fromPort, ep.ax + 4 / scale, ep.ay - 4 / scale);
  }
}

/** One output → many inputs: shared stem + vertical bus + horizontal branches */
export function drawForkWireGroup(ctx, endpoints, scale, style = {}) {
  if (!endpoints.length) return;
  if (endpoints.length === 1) {
    drawElbowWire(ctx, endpoints[0], scale, style);
    return;
  }
  const p = STEM_PAD / Math.max(0.2, scale);
  const ax = endpoints[0].ax;
  const ay = endpoints[0].ay;
  const busX = ax + p;
  const ys = endpoints.map((e) => e.by).sort((a, b) => a - b);

  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(busX, ay);
  ctx.moveTo(busX, ys[0]);
  ctx.lineTo(busX, ys[ys.length - 1]);
  for (const ep of endpoints) {
    ctx.moveTo(busX, ep.by);
    ctx.lineTo(ep.bx, ep.by);
  }
  ctx.stroke();

  if (style.showForkDot) {
    ctx.fillStyle = style.forkColor || "#8b949e";
    ctx.beginPath();
    ctx.arc(busX, ay, 3 / scale, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function groupEdgesForForks(edges, resolveEndpoints) {
  const groups = new Map();
  for (const e of edges) {
    const ep = resolveEndpoints(e);
    if (!ep) continue;
    const key = `${e.from}\0${e.fromPort || "main"}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ ...ep, edge: e });
  }
  return [...groups.values()];
}

export function drawAllNodeWires(ctx, edges, resolveEndpoints, scale, style = {}) {
  const groups = groupEdgesForForks(edges, resolveEndpoints);
  for (const endpoints of groups) {
    const color = style.colorFor?.(endpoints[0]?.edge) || style.strokeStyle || "#484f58";
    ctx.strokeStyle = color;
    ctx.lineWidth = (endpoints[0]?.edge?.port === "control" ? 1.5 : 2) / scale;
    drawForkWireGroup(ctx, endpoints, scale, {
      ...style,
      labelColor: color,
      showForkDot: endpoints.length > 1,
    });
    const fp = endpoints[0]?.edge?.fromPort;
    if (fp && fp !== "main" && endpoints.length === 1) {
      ctx.fillStyle = color;
      ctx.font = `${8 / scale}px Menlo, monospace`;
      ctx.fillText(fp, endpoints[0].ax + 4 / scale, endpoints[0].ay - 4 / scale);
    }
  }
}

export function drawLinkPreviewWire(ctx, ax, ay, wx, wy, scale) {
  const pts = elbowPoints(ax, ay, wx, wy, scale);
  strokePolyline(ctx, pts);
}