/** Node bottom cycle bar — BPM · beat · step map (deploy-style progress line) */

import { resolveTransportTheory, timeSigLabel } from "./music-theory.js";

const STEP_COUNT = 16;
const BAR_H_PX = 3;
const BAR_PAD_PX = 6;

export function resolveTransport(opts = {}) {
  return resolveTransportTheory(opts);
}

export function nodeCycleMode(n) {
  const t = n?.type || "";
  if (t === "core.clock" || t === "music.clock") return "cycle";
  if (t === "music.score") return "steps";
  if (t.startsWith("music.")) return "beat";
  if (t === "tool.kbatch") return "beat";
  if (n?.data?.pattern?.pads) return "steps";
  return "beat";
}

function stepPattern(n) {
  const pads = n?.data?.pattern?.pads;
  if (!pads) return null;
  const first = Object.values(pads).find((arr) => Array.isArray(arr) && arr.length);
  return first || null;
}

/** Convert screen pixels to world units under current canvas scale. */
function px(n, scale) {
  const s = Math.max(0.05, scale || 1);
  return n / s;
}

export function drawNodeCycleBar(ctx, r, n, transport, scale = 1) {
  if (!ctx || !r || !transport) return;
  const mode = nodeCycleMode(n);
  const barH = px(BAR_H_PX, scale);
  const barPad = px(BAR_PAD_PX, scale);
  const hair = px(0.5, scale);
  const x = r.x + barPad;
  const y = r.y + r.h - barH - px(2, scale);
  const w = Math.max(px(8, scale), r.w - barPad * 2);

  ctx.save();
  ctx.lineWidth = px(1, scale);

  ctx.fillStyle = "#0d1117";
  ctx.fillRect(x, y, w, barH);
  ctx.strokeStyle = "#30363d";
  ctx.strokeRect(x + hair, y + hair, Math.max(0, w - px(1, scale)), Math.max(0, barH - px(1, scale)));

  if (mode === "steps") {
    const pattern = stepPattern(n);
    const steps = pattern?.length || STEP_COUNT;
    const cell = w / steps;
    const gap = px(0.5, scale);
    for (let i = 0; i < steps; i++) {
      const cx = x + i * cell;
      const on = pattern ? !!pattern[i] : false;
      const playhead = transport.seqOn && i === transport.seqStep;
      if (on) {
        ctx.fillStyle = playhead ? "#f0883e" : "#388bfd";
        ctx.fillRect(cx + gap, y + gap, Math.max(px(1, scale), cell - px(1, scale)), barH - px(1, scale));
      } else if (playhead) {
        ctx.fillStyle = "#f0883e";
        ctx.fillRect(cx + gap, y + gap, Math.max(px(1, scale), cell - px(1, scale)), barH - px(1, scale));
      }
    }
    const fillW = transport.seqOn
      ? ((transport.seqStep + transport.beatPhase) / steps) * w
      : transport.beatPhase * w;
    ctx.fillStyle = "rgba(88, 166, 255, 0.35)";
    ctx.fillRect(x, y, Math.min(w, fillW), barH);
  } else if (mode === "cycle") {
    const beats = transport.cycleBeats || 4;
    for (let i = 1; i < beats; i++) {
      const tx = x + (w * i) / beats;
      ctx.strokeStyle = "#21262d";
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + barH);
      ctx.stroke();
    }
    const fillW = transport.cyclePhase * w;
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, "#3fb950");
    grad.addColorStop(1, "#58a6ff");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, Math.max(px(1, scale), fillW), barH);

    if (transport.poly) {
      const polyW = transport.poly.primary * w;
      ctx.fillStyle = "rgba(240, 136, 62, 0.45)";
      ctx.fillRect(x, y, Math.max(px(1, scale), polyW), barH * 0.45);
    }
  } else {
    const fillW = transport.beatPhase * w;
    ctx.fillStyle = transport.seqOn ? "#f0883e" : "#58a6ff";
    ctx.globalAlpha = transport.seqOn ? 0.95 : 0.55;
    ctx.fillRect(x, y, Math.max(px(1, scale), fillW), barH);
    ctx.globalAlpha = 1;
  }

  const edge = mode === "cycle"
    ? transport.cyclePhase
    : mode === "steps" && transport.seqOn
      ? (transport.seqStep + transport.beatPhase) / (stepPattern(n)?.length || STEP_COUNT)
      : transport.beatPhase;
  const ex = x + Math.min(w - px(1, scale), edge * w);
  ctx.fillStyle = "#e6edf3";
  ctx.fillRect(ex, y - hair, px(2, scale), barH + px(1, scale));

  ctx.restore();
}

export function cycleBarLabel(n, transport) {
  const mode = nodeCycleMode(n);
  const sig = timeSigLabel(transport.timeSig || transport.theory?.timeSig);
  if (mode === "cycle") {
    const swing = transport.swing ? ` · ${Math.round(transport.swing * 100)}%` : "";
    return `${sig} · ${Math.round(transport.cpm || transport.bpm)} cpm${swing}`;
  }
  if (mode === "steps" && transport.seqOn) return `step ${transport.seqStep + 1}/${STEP_COUNT}`;
  return `${sig} · ${Math.round(transport.bpm)} bpm`;
}