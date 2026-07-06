/** Music theory — time sig, swing, microtonal, negative harmony, polyrhythm, structure */

export const DEFAULT_THEORY = {
  bpm: 120,
  locked: { bpm: false, swing: false, signature: false, structure: false },
  timeSig: [4, 4],
  swing: 0,
  microtonal: { cents: 0, edo: 12 },
  negativeHarmony: { enabled: false, axis: "C" },
  polyrhythm: { enabled: false, ratio: [3, 4] },
  structure: { section: "verse", marker: "" },
  preset: null,
};

export const TIME_SIGNATURES = [
  [4, 4], [3, 4], [2, 4], [6, 8], [7, 8], [5, 4], [9, 8], [12, 8],
];

export const EDO_OPTIONS = [12, 24, 31, 53];

export const STRUCTURE_SECTIONS = ["verse", "chorus", "bridge", "breakdown", "intro", "outro"];

/** Jacob Collier–inspired arrangement presets */
export const THEORY_PRESETS = {
  "collier-microtonal": {
    id: "collier-microtonal",
    label: "microtonal soul",
    theory: {
      timeSig: [7, 8],
      swing: 0.12,
      microtonal: { cents: 14, edo: 31 },
      negativeHarmony: { enabled: false, axis: "C" },
      polyrhythm: { enabled: true, ratio: [3, 4] },
      structure: { section: "verse", marker: "micro-color" },
    },
  },
  "collier-negative": {
    id: "collier-negative",
    label: "negative harmony",
    theory: {
      timeSig: [4, 4],
      swing: 0.08,
      microtonal: { cents: 0, edo: 12 },
      negativeHarmony: { enabled: true, axis: "C" },
      polyrhythm: { enabled: false, ratio: [3, 4] },
      structure: { section: "chorus", marker: "flip" },
    },
  },
  "collier-polyrhythm": {
    id: "collier-polyrhythm",
    label: "polyrhythm layers",
    theory: {
      timeSig: [5, 4],
      swing: 0.18,
      microtonal: { cents: -8, edo: 24 },
      negativeHarmony: { enabled: false, axis: "G" },
      polyrhythm: { enabled: true, ratio: [5, 7] },
      structure: { section: "bridge", marker: "overlap" },
    },
  },
  "collier-choir": {
    id: "collier-choir",
    label: "choir stack",
    theory: {
      timeSig: [6, 8],
      swing: 0.22,
      microtonal: { cents: 6, edo: 53 },
      negativeHarmony: { enabled: true, axis: "F" },
      polyrhythm: { enabled: true, ratio: [4, 3] },
      structure: { section: "chorus", marker: "vocal mass" },
    },
  },
};

const AXIS_MIDI = { C: 60, D: 62, E: 64, F: 65, G: 67, A: 69, B: 71 };

export function mergeTheory(base, patch) {
  const out = structuredClone(base || DEFAULT_THEORY);
  if (!patch) return out;
  if (patch.bpm != null) out.bpm = Number(patch.bpm);
  if (patch.locked) out.locked = { ...out.locked, ...patch.locked };
  if (patch.timeSig) out.timeSig = [...patch.timeSig];
  if (patch.swing != null) out.swing = clamp(patch.swing, 0, 1);
  if (patch.microtonal) out.microtonal = { ...out.microtonal, ...patch.microtonal };
  if (patch.negativeHarmony) out.negativeHarmony = { ...out.negativeHarmony, ...patch.negativeHarmony };
  if (patch.polyrhythm) out.polyrhythm = { ...out.polyrhythm, ...patch.polyrhythm };
  if (patch.structure) out.structure = { ...out.structure, ...patch.structure };
  if (patch.preset != null) out.preset = patch.preset;
  return out;
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function cycleBeatsFromSig(timeSig = [4, 4]) {
  const num = Number(timeSig[0]) || 4;
  const den = Number(timeSig[1]) || 4;
  if (den === 8 && num % 3 === 0 && num >= 6) return num / 3;
  return num;
}

export function timeSigLabel(timeSig = [4, 4]) {
  return `${timeSig[0]}/${timeSig[1]}`;
}

/** Swing-aware phase within a single beat (0–1). */
export function swungBeatPhase(linearPhase, swing) {
  const p = clamp(linearPhase, 0, 1);
  if (!swing || swing <= 0) return p;
  const amt = swing * 0.33;
  if (p < 0.5) return (p / 0.5) * (0.5 + amt);
  return 0.5 + amt + ((p - 0.5) / 0.5) * (0.5 - amt);
}

/** Bar phase 0–1 across full cycle (time signature). */
export function barPhase(now, beatMs, cycleBeats, swing = 0) {
  const totalMs = beatMs * Math.max(1, cycleBeats);
  const t = (now % totalMs) / totalMs;
  const beatIdx = Math.floor(t * cycleBeats);
  const within = (t * cycleBeats) % 1;
  const swung = swungBeatPhase(within, swing);
  return (beatIdx + swung) / cycleBeats;
}

export function stepDelayMs(stepIdx, bpm, swing = 0, stepsPerBar = 16, cycleBeats = 4) {
  const beatMs = 60000 / Math.max(20, bpm);
  const stepsPerBeat = stepsPerBar / Math.max(1, cycleBeats);
  const base = beatMs / stepsPerBeat;
  if (!swing || swing <= 0) return base;
  const inPair = stepIdx % 2;
  const long = base * (1 + swing * 0.5);
  const short = base * (1 - swing * 0.5);
  return inPair === 0 ? long : short;
}

export function microtonalFreq(baseHz, cents = 0, edo = 12) {
  if (!baseHz || baseHz < 20) return baseHz;
  let hz = baseHz * 2 ** (cents / 1200);
  if (edo && edo !== 12) {
    const midi = 69 + 12 * Math.log2(hz / 440);
    const step = 12 / edo;
    const q = Math.round(midi / step) * step;
    hz = 440 * 2 ** ((q - 69) / 12);
  }
  return hz;
}

export function quantizeMidiEdo(midi, edo = 12) {
  if (midi == null) return null;
  const step = 12 / (edo || 12);
  const q = Math.round(midi / step) * step;
  return clamp(Math.round(q), 21, 108);
}

export function negativeHarmonyMidi(midi, axis = "C") {
  if (midi == null) return null;
  const axisMidi = AXIS_MIDI[axis] ?? 60;
  const reflected = axisMidi - (midi - axisMidi);
  return clamp(Math.round(reflected), 21, 108);
}

export function polyrhythmPhase(now, beatMs, ratio = [3, 4]) {
  const a = Math.max(1, Number(ratio[0]) || 3);
  const b = Math.max(1, Number(ratio[1]) || 4);
  const cycleMs = beatMs * a * b;
  const t = (now % cycleMs) / cycleMs;
  return {
    primary: (t * a) % 1,
    secondary: (t * b) % 1,
    ratio: [a, b],
  };
}

export function resolveTheory(opts = {}) {
  const {
    graph = {},
    liveState = null,
    musicTransport = null,
    clockParams = null,
  } = opts;

  const clock = (graph.nodes || []).find((n) => n.type === "core.clock" || n.type === "music.clock");
  const cp = clockParams || clock?.params || {};
  const meta = graph.meta?.theory || {};
  const transport = musicTransport?.theory || {};

  let theory = mergeTheory(DEFAULT_THEORY, meta);
  theory = mergeTheory(theory, transport);

  if (cp.swing != null) theory.swing = clamp(Number(cp.swing), 0, 1);
  if (cp.timeSig) theory.timeSig = Array.isArray(cp.timeSig) ? [...cp.timeSig] : theory.timeSig;
  if (cp.signature) {
    const parts = String(cp.signature).split("/").map(Number);
    if (parts.length === 2 && parts.every((n) => n > 0)) theory.timeSig = parts;
  }
  if (cp.structure) theory.structure = { ...theory.structure, section: String(cp.structure) };
  if (cp.microCents != null) theory.microtonal.cents = Number(cp.microCents);
  if (cp.edo != null) theory.microtonal.edo = Number(cp.edo);
  if (cp.negHarmony != null) theory.negativeHarmony.enabled = !!cp.negHarmony;
  if (cp.negAxis) theory.negativeHarmony.axis = String(cp.negAxis);
  if (cp.poly != null) theory.polyrhythm.enabled = !!cp.poly;
  if (cp.polyRatio) {
    const parts = String(cp.polyRatio).split(":").map(Number);
    if (parts.length === 2) theory.polyrhythm.ratio = parts;
  }

  const bpm = Number(
    musicTransport?.bpm ||
      liveState?.bpm ||
      liveState?.cpm ||
      cp.bpm ||
      cp.cpm ||
      graph.meta?.cpm ||
      theory.bpm ||
      120,
  );
  if (!theory.locked.bpm) theory.bpm = bpm;

  return theory;
}

export function resolveTransportTheory(opts = {}) {
  const theory = resolveTheory(opts);
  const {
    graph = {},
    liveState = null,
    musicTransport = null,
  } = opts;

  const clock = (graph.nodes || []).find((n) => n.type === "core.clock" || n.type === "music.clock");
  const p = clock?.params || {};
  const bpm = theory.locked.bpm
    ? theory.bpm
    : Number(
        musicTransport?.bpm ||
          liveState?.bpm ||
          liveState?.cpm ||
          p.bpm ||
          p.cpm ||
          graph.meta?.cpm ||
          theory.bpm ||
          120,
      );
  const cpm = Number(p.cpm ?? liveState?.cpm ?? graph.meta?.cpm ?? bpm);
  const seqOn = !!musicTransport?.seqOn;
  const seqStep = Number(musicTransport?.seqStep ?? 0) % 16;

  const beatMs = 60000 / Math.max(20, bpm);
  const now = performance.now();
  const cycleBeats = cycleBeatsFromSig(theory.timeSig);
  const linearBeat = (now % beatMs) / beatMs;
  const beatPhase = swungBeatPhase(linearBeat, theory.swing);
  const cyclePhase = barPhase(now, beatMs, cycleBeats, theory.swing);
  const stepPhase = seqOn ? (seqStep + beatPhase) / 16 : beatPhase;
  const poly = theory.polyrhythm.enabled
    ? polyrhythmPhase(now, beatMs, theory.polyrhythm.ratio)
    : null;

  return {
    bpm,
    cpm,
    beatMs,
    beatPhase,
    cyclePhase,
    cycleBeats,
    stepPhase,
    seqOn,
    seqStep,
    now,
    theory,
    timeSig: theory.timeSig,
    swing: theory.swing,
    poly,
  };
}

export function theorySummary(theory) {
  const t = theory || DEFAULT_THEORY;
  const sig = timeSigLabel(t.timeSig);
  const swing = Math.round((t.swing || 0) * 100);
  const micro = t.microtonal?.cents ? `${t.microtonal.cents > 0 ? "+" : ""}${t.microtonal.cents}¢` : "";
  const edo = t.microtonal?.edo !== 12 ? `${t.microtonal.edo}-TET` : "";
  const neg = t.negativeHarmony?.enabled ? "neg" : "";
  const poly = t.polyrhythm?.enabled ? `${t.polyrhythm.ratio.join(":")}` : "";
  const sec = t.structure?.section || "";
  return [sig, swing ? `sw ${swing}%` : "", micro, edo, neg, poly, sec].filter(Boolean).join(" · ");
}