/** Node bottom cycle bar — BPM · beat · step map (deploy-style progress line) */

const STEP_COUNT = 16;
const BAR_H = 3;
const BAR_PAD = 6;

export function resolveTransport(opts = {}) {
  const {
    graph = {},
    liveState = null,
    musicTransport = null,
  } = opts;

  const clock = (graph.nodes || []).find((n) => n.type === "core.clock" || n.type === "music.clock");
  const p = clock?.params || {};
  const bpm = Number(
    musicTransport?.bpm ||
      liveState?.bpm ||
      liveState?.cpm ||
      p.bpm ||
      p.cpm ||
      graph.meta?.cpm ||
      120,
  );
  const cpm = Number(p.cpm ?? liveState?.cpm ?? graph.meta?.cpm ?? bpm);
  const seqOn = !!musicTransport?.seqOn;
  const seqStep = Number(musicTransport?.seqStep ?? 0) % STEP_COUNT;

  const beatMs = 60000 / Math.max(20, bpm);
  const now = performance.now();
  const beatPhase = (now % beatMs) / beatMs;
  const cycleBeats = 4;
  const cyclePhase = ((now / beatMs) % cycleBeats) / cycleBeats;
  const stepPhase = seqOn ? (seqStep + beatPhase) / STEP_COUNT : beatPhase;

  return { bpm, cpm, beatMs, beatPhase, cyclePhase, stepPhase, seqOn, seqStep, now };
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

export function drawNodeCycleBar(ctx, r, n, transport, scale = 1) {
  if (!ctx || !r || !transport) return;
  const mode = nodeCycleMode(n);
  const x = r.x + BAR_PAD;
  const y = r.y + r.h - BAR_H - 2;
  const w = Math.max(8, r.w - BAR_PAD * 2);
  const s = Math.max(1, scale);

  ctx.save();

  // Track
  ctx.fillStyle = "#0d1117";
  ctx.fillRect(x, y, w, BAR_H);
  ctx.strokeStyle = "#30363d";
  ctx.lineWidth = 1 / s;
  ctx.strokeRect(x + 0.5 / s, y + 0.5 / s, w - 1 / s, BAR_H - 1 / s);

  if (mode === "steps") {
    const pattern = stepPattern(n);
    const steps = pattern?.length || STEP_COUNT;
    const cell = w / steps;
    for (let i = 0; i < steps; i++) {
      const cx = x + i * cell;
      const on = pattern ? !!pattern[i] : false;
      const playhead = transport.seqOn && i === transport.seqStep;
      if (on) {
        ctx.fillStyle = playhead ? "#f0883e" : "#388bfd";
        ctx.fillRect(cx + 0.5 / s, y + 0.5 / s, Math.max(1, cell - 1 / s), BAR_H - 1 / s);
      } else if (playhead) {
        ctx.fillStyle = "#f0883e";
        ctx.fillRect(cx + 0.5 / s, y + 0.5 / s, Math.max(1, cell - 1 / s), BAR_H - 1 / s);
      }
    }
    const fillW = transport.seqOn
      ? ((transport.seqStep + transport.beatPhase) / steps) * w
      : transport.beatPhase * w;
    ctx.fillStyle = "rgba(88, 166, 255, 0.35)";
    ctx.fillRect(x, y, Math.min(w, fillW), BAR_H);
  } else if (mode === "cycle") {
    const beats = 4;
    for (let i = 1; i < beats; i++) {
      const tx = x + (w * i) / beats;
      ctx.strokeStyle = "#21262d";
      ctx.beginPath();
      ctx.moveTo(tx, y);
      ctx.lineTo(tx, y + BAR_H);
      ctx.stroke();
    }
    const fillW = transport.cyclePhase * w;
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, "#3fb950");
    grad.addColorStop(1, "#58a6ff");
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, Math.max(1, fillW), BAR_H);
  } else {
    const fillW = transport.beatPhase * w;
    ctx.fillStyle = transport.seqOn ? "#f0883e" : "#58a6ff";
    ctx.globalAlpha = transport.seqOn ? 0.95 : 0.55;
    ctx.fillRect(x, y, Math.max(1, fillW), BAR_H);
    ctx.globalAlpha = 1;
  }

  // Deploy-style leading edge
  const edge = mode === "cycle" ? transport.cyclePhase : mode === "steps" && transport.seqOn
    ? (transport.seqStep + transport.beatPhase) / (stepPattern(n)?.length || STEP_COUNT)
    : transport.beatPhase;
  const ex = x + Math.min(w - 1, edge * w);
  ctx.fillStyle = "#e6edf3";
  ctx.fillRect(ex, y - 0.5 / s, 2 / s, BAR_H + 1 / s);

  ctx.restore();
}

export function cycleBarLabel(n, transport) {
  const mode = nodeCycleMode(n);
  if (mode === "cycle") return `${Math.round(transport.cpm || transport.bpm)} cpm`;
  if (mode === "steps" && transport.seqOn) return `step ${transport.seqStep + 1}/${STEP_COUNT}`;
  return `${Math.round(transport.bpm)} bpm`;
}