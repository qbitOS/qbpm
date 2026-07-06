/** Notation charting — solfège, Gregorian, classical, modern, transposing, structure maps */

export const NOTATION_SYSTEMS = [
  { id: "solfege", label: "Solfège" },
  { id: "gregorian", label: "Gregorian" },
  { id: "classical", label: "Classical" },
  { id: "modern", label: "Modern" },
  { id: "transposing", label: "Transposing" },
];

export const KEYS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const GREGORIAN_MODES = [
  { id: "ionian", label: "Ionian · Mode I", degree: 0, finalis: "C" },
  { id: "dorian", label: "Dorian · Mode II", degree: 1, finalis: "D" },
  { id: "phrygian", label: "Phrygian · Mode III", degree: 2, finalis: "E" },
  { id: "lydian", label: "Lydian · Mode IV", degree: 3, finalis: "F" },
  { id: "mixolydian", label: "Mixolydian · Mode V", degree: 4, finalis: "G" },
  { id: "aeolian", label: "Aeolian · Mode VI", degree: 5, finalis: "A" },
  { id: "locrian", label: "Locrian · Mode VII", degree: 6, finalis: "B" },
];

export const TRANSPOSING_INSTRUMENTS = [
  { id: "concert", label: "Concert pitch", semitones: 0 },
  { id: "bb-trumpet", label: "B♭ Trumpet / Clarinet", semitones: -2 },
  { id: "eb-alto-sax", label: "E♭ Alto Sax", semitones: -9 },
  { id: "bb-tenor-sax", label: "B♭ Tenor Sax", semitones: -14 },
  { id: "f-horn", label: "F Horn", semitones: 7 },
  { id: "eb-baritone", label: "E♭ Baritone Sax", semitones: -21 },
  { id: "g-guitar", label: "Guitar (8vb treble)", semitones: 12 },
];

export const STRUCTURE_TEMPLATES = {
  pop: {
    id: "pop",
    label: "Modern pop",
    sections: [
      { id: "intro", label: "intro", bars: 4 },
      { id: "verse", label: "verse", bars: 8 },
      { id: "pre", label: "pre-chorus", bars: 4 },
      { id: "chorus", label: "chorus", bars: 8 },
      { id: "bridge", label: "bridge", bars: 8 },
      { id: "outro", label: "outro", bars: 4 },
    ],
  },
  classical: {
    id: "classical",
    label: "Classical sonata",
    sections: [
      { id: "expo-th", label: "expo · theme A", bars: 16 },
      { id: "expo-th2", label: "expo · theme B", bars: 16 },
      { id: "dev", label: "development", bars: 24 },
      { id: "recap", label: "recapitulation", bars: 32 },
      { id: "coda", label: "coda", bars: 8 },
    ],
  },
  gregorian: {
    id: "gregorian",
    label: "Gregorian office",
    sections: [
      { id: "inton", label: "intonation", bars: 2 },
      { id: "ant", label: "antiphon", bars: 4 },
      { id: "psalm", label: "psalm tone", bars: 16 },
      { id: "allel", label: "alleluia", bars: 4 },
      { id: "comm", label: "communio", bars: 8 },
    ],
  },
  through: {
    id: "through",
    label: "Through-composed",
    sections: [
      { id: "a1", label: "section A", bars: 12 },
      { id: "b1", label: "section B", bars: 12 },
      { id: "c1", label: "section C", bars: 12 },
      { id: "a2", label: "section A′", bars: 12 },
    ],
  },
};

export const CHART_PRESETS = {
  "solfege-movable": {
    id: "solfege-movable",
    label: "solfège movable",
    patch: {
      notation: { system: "solfege", solfege: { mode: "movable", variant: "major" }, key: "C", mode: "ionian" },
      structureChart: { template: "pop" },
    },
  },
  "gregorian-dorian": {
    id: "gregorian-dorian",
    label: "gregorian dorian",
    patch: {
      notation: { system: "gregorian", key: "D", mode: "dorian" },
      timeSig: [4, 4],
      structureChart: { template: "gregorian" },
    },
  },
  "classical-sonata": {
    id: "classical-sonata",
    label: "classical chart",
    patch: {
      notation: { system: "classical", key: "G", mode: "ionian" },
      structureChart: { template: "classical" },
    },
  },
  "bb-trumpet-chart": {
    id: "bb-trumpet-chart",
    label: "B♭ transposing",
    patch: {
      notation: { system: "transposing", key: "Bb", transposing: { instrument: "bb-trumpet" } },
      structureChart: { template: "pop" },
    },
  },
};

const KEY_PC = { C: 0, Db: 1, D: 2, Eb: 3, E: 4, F: 5, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const PC_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const MAJOR_SYLL = ["do", "di", "re", "ri", "mi", "fa", "fi", "sol", "si", "la", "li", "ti"];
const MINOR_SYLL = ["la", "li", "ti", "do", "di", "re", "ri", "mi", "fa", "fi", "sol", "si"];
const MODE_INTERVALS = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

const SECTION_COLORS = {
  intro: "#484f58",
  verse: "#388bfd",
  "pre-chorus": "#a371f7",
  chorus: "#3fb950",
  bridge: "#d29922",
  outro: "#6e7681",
  antiphon: "#58a6ff",
  "psalm tone": "#79c0ff",
  alleluia: "#f0883e",
  communio: "#3fb950",
  intonation: "#6e7681",
  development: "#d29922",
  recapitulation: "#3fb950",
  coda: "#8b949e",
  default: "#30363d",
};

export function keyToPc(key = "C") {
  return KEY_PC[key] ?? 0;
}

export function pcToKey(pc) {
  return PC_NAMES[((pc % 12) + 12) % 12];
}

export function parseNoteName(name) {
  const m = String(name || "C4").match(/^([A-Ga-g])([#b]?)(\d)?$/);
  if (!m) return { pc: 0, oct: 4 };
  let pc = KEY_PC[m[1].toUpperCase()] ?? 0;
  if (m[2] === "#") pc = (pc + 1) % 12;
  if (m[2] === "b") pc = (pc + 11) % 12;
  return { pc, oct: Number(m[3] || 4) };
}

export function noteNameFromPc(pc, oct = 4) {
  return `${pcToKey(pc)}${oct}`;
}

export function getInstrument(id) {
  return TRANSPOSING_INSTRUMENTS.find((i) => i.id === id) || TRANSPOSING_INSTRUMENTS[0];
}

/** Concert MIDI → written pitch for transposing instrument. */
export function concertToWrittenMidi(midi, instrumentId = "concert") {
  const inst = getInstrument(instrumentId);
  return midi - (inst.semitones || 0);
}

export function writtenToConcertMidi(midi, instrumentId = "concert") {
  const inst = getInstrument(instrumentId);
  return midi + (inst.semitones || 0);
}

export function transposeNoteName(name, semitones) {
  const { pc, oct } = parseNoteName(name);
  const midi = (oct + 1) * 12 + pc + semitones;
  const newPc = ((midi % 12) + 12) % 12;
  const newOct = Math.floor(midi / 12) - 1;
  return noteNameFromPc(newPc, newOct);
}

export function midiToSolfege(midi, opts = {}) {
  const { key = "C", solfege = { mode: "movable", variant: "major" } } = opts;
  const pc = ((midi % 12) + 12) % 12;
  const tonic = keyToPc(key);
  const syll = solfege.variant === "minor" ? MINOR_SYLL : MAJOR_SYLL;
  if (solfege.mode === "fixed") return syll[pc];
  const deg = ((pc - tonic) % 12 + 12) % 12;
  return syll[deg];
}

export function midiToRoman(midi, opts = {}) {
  const { key = "C", mode = "ionian" } = opts;
  const intervals = MODE_INTERVALS[mode] || MODE_INTERVALS.ionian;
  const pc = ((midi % 12) + 12) % 12;
  const tonic = keyToPc(key);
  const rel = ((pc - tonic) % 12 + 12) % 12;
  const deg = intervals.indexOf(rel);
  if (deg < 0) return "°";
  const nums = ["I", "II", "III", "IV", "V", "VI", "VII"];
  return nums[deg] || "I";
}

export function midiToNashville(midi, opts = {}) {
  const { key = "C" } = opts;
  const pc = ((midi % 12) + 12) % 12;
  const tonic = keyToPc(key);
  const deg = ((pc - tonic) % 12 + 12) % 12;
  const map = { 0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7" };
  return map[deg] || `#${deg}`;
}

export function notationLabelForNote(noteName, theory = {}) {
  const n = theory.notation || {};
  const { pc, oct } = parseNoteName(noteName);
  const midi = (oct + 1) * 12 + pc;
  const sys = n.system || "modern";

  if (sys === "solfege") {
    return midiToSolfege(midi, { key: n.key, solfege: n.solfege });
  }
  if (sys === "gregorian") {
    const mode = GREGORIAN_MODES.find((m) => m.id === (n.mode || "dorian")) || GREGORIAN_MODES[1];
    return `${midiToSolfege(midi, { key: mode.finalis, solfege: { mode: "movable", variant: "major" } })} · ${mode.label.split("·")[0].trim()}`;
  }
  if (sys === "classical") {
    return `${midiToRoman(midi, { key: n.key, mode: n.mode })} · ${noteName}`;
  }
  if (sys === "transposing") {
    const inst = getInstrument(n.transposing?.instrument);
    const written = concertToWrittenMidi(midi, inst.id);
    const wPc = ((written % 12) + 12) % 12;
    const wOct = Math.floor(written / 12) - 1;
    return `${noteNameFromPc(wPc, wOct)} (${inst.label})`;
  }
  return `${midiToNashville(midi, { key: n.key })} · ${noteName}`;
}

export function chartSummary(theory = {}) {
  const n = theory.notation || {};
  const sys = NOTATION_SYSTEMS.find((s) => s.id === n.system)?.label || "Modern";
  const key = n.key || "C";
  const mode = GREGORIAN_MODES.find((m) => m.id === n.mode)?.label?.split("·")[0]?.trim() || "";
  const inst = n.system === "transposing" ? getInstrument(n.transposing?.instrument).label : "";
  const tmpl = STRUCTURE_TEMPLATES[theory.structureChart?.template]?.label || "";
  return [sys, key, mode, inst, tmpl].filter(Boolean).join(" · ");
}

export function applyStructureTemplate(templateId) {
  const tmpl = STRUCTURE_TEMPLATES[templateId] || STRUCTURE_TEMPLATES.pop;
  let bar = 0;
  const sections = tmpl.sections.map((s) => {
    const seg = { ...s, startBar: bar };
    bar += s.bars;
    return seg;
  });
  return { template: tmpl.id, sections, totalBars: bar };
}

export function activeStructureSection(theory, barIndex) {
  const chart = theory.structureChart;
  if (!chart?.sections?.length) return null;
  const bi = Math.max(0, Math.floor(barIndex));
  for (let i = chart.sections.length - 1; i >= 0; i--) {
    const s = chart.sections[i];
    if (bi >= (s.startBar ?? 0)) return s;
  }
  return chart.sections[0];
}

export function structureBarIndex(transport, theory) {
  const cycleBeats = transport?.cycleBeats || 4;
  const cyclePhase = transport?.cyclePhase ?? 0;
  const chart = theory.structureChart;
  const total = chart?.totalBars || chart?.sections?.reduce((a, s) => a + (s.bars || 0), 0) || 32;
  return cyclePhase * total;
}

export function drawStructureChart(canvas, theory, transport) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 240;
  const h = canvas.clientHeight || 28;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(0, 0, w, h);

  const chart = theory.structureChart;
  if (!chart?.sections?.length) {
    ctx.fillStyle = "#484f58";
    ctx.font = "9px Menlo, monospace";
    ctx.fillText("structure chart · pick template", 6, h / 2 + 3);
    return;
  }

  const totalBars = chart.totalBars || chart.sections.reduce((a, s) => a + (s.bars || 4), 0);
  let x = 0;
  const pad = 1;
  chart.sections.forEach((sec) => {
    const frac = (sec.bars || 4) / totalBars;
    const sw = Math.max(2, frac * (w - 2));
    const col = SECTION_COLORS[sec.label] || SECTION_COLORS[sec.id] || SECTION_COLORS.default;
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x + pad, 4, sw - pad * 2, h - 8);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e6edf3";
    ctx.font = "7px Menlo, monospace";
    const lbl = (sec.label || sec.id || "").slice(0, 10);
    if (sw > 22) ctx.fillText(lbl, x + 3, h - 6);
    x += sw;
  });

  const barIdx = structureBarIndex(transport, theory);
  const px = (barIdx / totalBars) * w;
  ctx.fillStyle = "#f0883e";
  ctx.fillRect(px, 2, 2, h - 4);

  const active = activeStructureSection(theory, barIdx);
  ctx.fillStyle = "#8b949e";
  ctx.font = "8px Menlo, monospace";
  ctx.textAlign = "right";
  ctx.fillText(active ? `${active.label} · bar ${Math.floor(barIdx) + 1}` : `bar ${Math.floor(barIdx) + 1}`, w - 4, 10);
  ctx.textAlign = "left";
}

export function drawModeChart(canvas, theory) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 240;
  const h = canvas.clientHeight || 22;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const n = theory.notation || {};
  const mode = n.mode || "ionian";
  const key = n.key || "C";
  const intervals = MODE_INTERVALS[mode] || MODE_INTERVALS.ionian;
  const tonic = keyToPc(key);
  const cell = w / intervals.length;

  intervals.forEach((iv, i) => {
    const pc = (tonic + iv) % 12;
    const x = i * cell;
    ctx.fillStyle = i === 0 ? "#3fb950" : "#21262d";
    ctx.fillRect(x + 1, 3, cell - 2, h - 6);
    ctx.fillStyle = "#c9d1d9";
    ctx.font = "8px Menlo, monospace";
    ctx.textAlign = "center";
    const sys = n.system;
    let lbl = pcToKey(pc);
    if (sys === "solfege" || sys === "gregorian") {
      lbl = midiToSolfege(60 + pc, { key, solfege: { mode: "movable", variant: "major" } });
    } else if (sys === "classical") {
      lbl = ["I", "II", "III", "IV", "V", "VI", "VII"][i] || lbl;
    } else if (sys === "modern") {
      lbl = midiToNashville(60 + pc, { key });
    }
    ctx.fillText(lbl, x + cell / 2, h - 6);
  });
  ctx.textAlign = "left";
}

export function renderSolfegeRow(el, notes, theory) {
  if (!el) return;
  if (!notes?.length) {
    el.innerHTML = '<span class="ml-chart-ph">chart row · play notes</span>';
    return;
  }
  el.innerHTML = notes
    .map((n) => {
      const lbl = notationLabelForNote(n.note, theory);
      return `<span class="ml-chart-cell" title="${n.note}">${lbl}</span>`;
    })
    .join("");
}

export function mergeNotationPatch(theory, patch) {
  const out = structuredClone(theory || {});
  if (!patch) return out;
  if (patch.notation) {
    out.notation = { ...(out.notation || {}), ...patch.notation };
    if (patch.notation.solfege) out.notation.solfege = { ...out.notation?.solfege, ...patch.notation.solfege };
    if (patch.notation.transposing) out.notation.transposing = { ...out.notation?.transposing, ...patch.notation.transposing };
  }
  if (patch.structureChart) {
    if (patch.structureChart.template && !patch.structureChart.sections) {
      out.structureChart = applyStructureTemplate(patch.structureChart.template);
    } else {
      out.structureChart = { ...(out.structureChart || {}), ...patch.structureChart };
    }
  }
  return out;
}