/** VFX comp window drawing — Natron/Nuke/OTOY grey viewer, no layer blue wash */

import { VFX, compFillForDevice, laneColor, framePipelinePorts } from "./vfx-palette.js";

export function drawCompGrid(ctx, pan, scale, wrapW, wrapH, step = 40) {
  const x0 = Math.floor((-pan.x / scale) / step) * step;
  const y0 = Math.floor((-pan.y / scale) / step) * step;
  const x1 = x0 + wrapW / scale + step * 2;
  const y1 = y0 + wrapH / scale + step * 2;

  ctx.strokeStyle = VFX.grid;
  ctx.lineWidth = 1;
  for (let x = x0; x < x1; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
  for (let y = y0; y < y1; y += step) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }

  ctx.strokeStyle = VFX.gridMajor;
  const major = step * 5;
  const mx0 = Math.floor(x0 / major) * major;
  const my0 = Math.floor(y0 / major) * major;
  for (let x = mx0; x < x1; x += major) {
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y1);
    ctx.stroke();
  }
  for (let y = my0; y < y1; y += major) {
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
  }
}

export function drawCompWindow(ctx, frame, rect, active, scale, linking) {
  const { x, y, w, h } = rect;
  const headerH = 22 / scale;

  const fill = active
    ? VFX.compFillActive
    : normalizeFill(frame) || compFillForDevice(frame.device);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = VFX.compHeader;
  ctx.fillRect(x, y, w, headerH);

  ctx.strokeStyle = active ? VFX.compStrokeActive : VFX.compStroke;
  ctx.lineWidth = (active ? 1.5 : 1) / scale;
  ctx.setLineDash(active ? [] : [10 / scale, 7 / scale]);
  ctx.strokeRect(x + 0.5 / scale, y + 0.5 / scale, w - 1 / scale, h - 1 / scale);
  ctx.setLineDash([]);

  if (active) {
    const inset = 3 / scale;
    ctx.strokeStyle = "rgba(156,163,175,0.35)";
    ctx.lineWidth = 1 / scale;
    ctx.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
  }

  ctx.fillStyle = active ? VFX.text : VFX.textDim;
  ctx.font = `${10 / scale}px Menlo, ui-monospace, monospace`;
  const title = frame.label || frame.id;
  ctx.fillText(title, x + 8 / scale, y + 14 / scale);

  if (frame.device || frame.owner || frame.cluster) {
    ctx.fillStyle = VFX.textDim;
    ctx.font = `${7.5 / scale}px Menlo, monospace`;
    const sub = [frame.device, frame.cluster, frame.owner].filter(Boolean).join(" · ");
    ctx.fillText(sub, x + 8 / scale, y + h - 8 / scale);
  }

  const laneTag = frame.lane || "comp";
  ctx.fillStyle = VFX.textDim;
  ctx.font = `${7 / scale}px Menlo, monospace`;
  ctx.fillText(laneTag, x + w - 36 / scale, y + 14 / scale);

  drawPipelinePorts(ctx, rect, active, scale, linking, frame.id);
}

function normalizeFill(frame) {
  const c = frame.color;
  if (!c) return null;
  const low = String(c).toLowerCase();
  if (low.includes("58a6ff") || low.includes("79c0ff") || low.includes("bc8cff") || low.includes("3fb95022")) {
    return compFillForDevice(frame.device);
  }
  if (low.length === 9 && low.startsWith("#")) {
    return compFillForDevice(frame.device);
  }
  return null;
}

export function drawPipelinePorts(ctx, rect, active, scale, linking, frameId) {
  for (const p of framePipelinePorts(rect)) {
    const hover =
      linking?.kind === "frame" &&
      linking.fromId === frameId &&
      linking.fromPort === p.id;
    const col = hover ? VFX.compStrokeActive : laneColor(p.lane);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = active ? "#c9d1d9" : "#30363d";
    ctx.lineWidth = 1 / scale;
    ctx.stroke();
    ctx.fillStyle = VFX.textDim;
    ctx.font = `${6.5 / scale}px Menlo, monospace`;
    const lx = p.side === "in" ? p.x + 10 / scale : p.x - 30 / scale;
    ctx.fillText(p.label, lx, p.y - 8 / scale);
  }
}

export function drawBusEdge(ctx, edge, frames, framePortPositions, scale) {
  const a = frames.find((f) => f.id === edge.from);
  const b = frames.find((f) => f.id === edge.to);
  if (!a || !b) return;
  const portsA = framePortPositions(a);
  const portsB = framePortPositions(b);
  const ap = portsA.find((p) => p.id === (edge.fromPort || "out-v"));
  const bp = portsB.find((p) => p.id === (edge.toPort || "in"));
  if (!ap || !bp) return;

  const lane = edge.lane || edge.bus || "video";
  const col = laneColor(lane === "collab" || lane === "bus" ? "collab" : lane);
  ctx.strokeStyle = `${col}99`;
  ctx.lineWidth = 1.5 / scale;
  ctx.setLineDash(lane === "midi" ? [3 / scale, 4 / scale] : lane === "audio" ? [6 / scale, 3 / scale] : []);
  ctx.beginPath();
  ctx.moveTo(ap.x, ap.y);
  ctx.lineTo(bp.x, bp.y);
  ctx.stroke();
  ctx.setLineDash([]);
  const tag = edge.bus || edge.lane || lane;
  if (tag) {
    ctx.fillStyle = VFX.textDim;
    ctx.font = `${7 / scale}px Menlo, monospace`;
    ctx.fillText(tag, (ap.x + bp.x) / 2 + 4 / scale, (ap.y + bp.y) / 2 - 4 / scale);
  }
}