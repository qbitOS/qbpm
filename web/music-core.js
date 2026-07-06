/** Shared music engine — audio bus, MPC/beat state, waveform helpers */

import { getTabRuntime } from "./tab-runtime.js";
import {
  DEFAULT_THEORY,
  mergeTheory,
  cycleBeatsFromSig,
  stepDelayMs,
  microtonalFreq,
  quantizeMidiEdo,
  negativeHarmonyMidi,
} from "./music-theory.js";

export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const STEP_COUNT = 16;

export const MPC_PADS = [
  { id: 0, label: "Kick", kind: "kick" },
  { id: 1, label: "Snare", kind: "snare" },
  { id: 2, label: "Clap", kind: "clap" },
  { id: 3, label: "Hat", kind: "hat" },
  { id: 4, label: "Tom", kind: "tom" },
  { id: 5, label: "Rim", kind: "rim" },
  { id: 6, label: "Sub", kind: "sub" },
  { id: 7, label: "Perc", kind: "perc" },
  { id: 8, label: "Pad1", kind: "pad", midi: 60 },
  { id: 9, label: "Pad2", kind: "pad", midi: 63 },
  { id: 10, label: "Pad3", kind: "pad", midi: 67 },
  { id: 11, label: "Pad4", kind: "pad", midi: 72 },
  { id: 12, label: "Bass", kind: "pad", midi: 48 },
  { id: 13, label: "Lead", kind: "pad", midi: 76 },
  { id: 14, label: "Chd", kind: "pad", midi: 64 },
  { id: 15, label: "Fx", kind: "noise" },
];

export function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

export function midiToName(m) {
  const oct = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[m % 12]}${oct}`;
}

const GRAND_MIDI_LO = 48;
const GRAND_MIDI_HI = 83;

function buildGrandKeys() {
  const keys = [];
  let whitePos = 0;
  for (let m = GRAND_MIDI_LO; m <= GRAND_MIDI_HI; m++) {
    const name = midiToName(m);
    const black = name.includes("#");
    if (!black) {
      keys.push({ n: name, midi: m, f: midiToFreq(m), wi: whitePos, black: false });
      whitePos++;
    } else {
      keys.push({ n: name, midi: m, f: midiToFreq(m), wi: null, black: true });
    }
  }
  const whiteCount = whitePos;
  keys.filter((k) => k.black).forEach((k) => {
    let prev = k.midi - 1;
    while (prev >= GRAND_MIDI_LO && midiToName(prev).includes("#")) prev--;
    const white = keys.find((x) => x.midi === prev && !x.black);
    if (white) k.wi = white.wi;
  });
  keys.forEach((k) => {
    k.whiteCount = whiteCount;
    if (k.black && k.wi != null) k.w = (k.wi + 0.68) / whiteCount;
  });
  return keys;
}

export const GRAND_KEYS = buildGrandKeys();
export const PIANO_KEYS = GRAND_KEYS;

export function emptySteps() {
  return Array.from({ length: STEP_COUNT }, () => false);
}

export function createWaveEnvelope(size = 128) {
  return Array.from({ length: size }, () => 0.5);
}

export function drawSpectrum(canvas, analyser, opts = {}) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const fallback = new Uint8Array(128);
  let freqBuf = null;
  let data = fallback;
  if (analyser) {
    if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
      freqBuf = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(freqBuf);
    data = freqBuf;
  }
  if (!opts.transparent) {
    ctx.fillStyle = opts.bg || "#0a0d12";
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  const barCount = Math.min(data.length, Math.max(16, Math.floor(w / (opts.barW || 4))));
  const step = w / barCount;
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = opts.color || "#7d8590";
  for (let i = 0; i < barCount; i++) {
    const norm = analyser ? data[i] / 255 : 0.04;
    const bh = Math.max(1, norm * h * (opts.height || 0.92));
    ctx.fillRect(Math.floor(i * step), h - bh, Math.max(1, Math.ceil(step) - 1), bh);
  }
  ctx.globalAlpha = 1;
}

export function drawEditableWave(canvas, envelope, opts = {}) {
  if (!canvas || !envelope?.length) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const n = envelope.length;
  ctx.fillStyle = opts.bg || "#0a0d12";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = opts.grid || "#21262d";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const y = (h * i) / 4;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.strokeStyle = opts.color || "#58a6ff";
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w;
    const y = h - envelope[i] * h * 0.9 - h * 0.05;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.fillStyle = opts.fill || "rgba(88, 166, 255, 0.12)";
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fill();
}

/** YIN-style pitch detect on time-domain buffer (Hz) */
export function detectPitchHz(buf, sampleRate) {
  if (!buf?.length || sampleRate < 8000) return null;
  let rms = 0;
  for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / buf.length);
  if (rms < 0.008) return null;

  const minLag = Math.floor(sampleRate / 1200);
  const maxLag = Math.floor(sampleRate / 55);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < buf.length - lag; i++) corr += buf[i] * buf[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || bestCorr < 0.9) return null;
  return sampleRate / bestLag;
}

export function hzToMidi(hz) {
  if (!hz || hz < 20) return null;
  return Math.round(69 + 12 * Math.log2(hz / 440));
}

export function quantizeMidi(midi) {
  if (midi == null) return null;
  return Math.max(21, Math.min(108, midi));
}

export function createMusicCore(opts = {}) {
  const {
    onNotePlay,
    onSend,
    onJamEval,
    onDawSend,
    getSendTargets = () => ({ nodes: [], peers: [], daws: [] }),
    getBpm = () => 120,
    getTheory = () => null,
    onTheoryChange,
    onStateChange,
  } = opts;

  let theory = mergeTheory(DEFAULT_THEORY, getTheory?.());

  let audioCtx = null;
  let analyser = null;
  let masterGain = null;
  let scratchPan = null;
  let scratchDelay = null;
  let scratchEchoSend = null;
  let scratchEchoFb = null;
  let scratchLfo = null;
  let scratchLfoDepth = null;
  let scratchFx = {
    pan: 0,
    lfo: 0,
    lfoRate: 2,
    env: 0.5,
    warp: 1,
    echo: 0,
    delay: 0,
  };
  let autotuneOn = localStorage.getItem("qbpm-autotune") === "1";
  let lastDetectedMidi = null;
  let waveformCapture = null;
  let seqTimer = null;
  let seqStep = 0;
  let seqOn = false;
  let selectedPad = 0;
  let selectedNote = "C4";
  let padSteps = Object.fromEntries(MPC_PADS.map((p) => [p.id, emptySteps()]));
  let noteSteps = Object.fromEntries(PIANO_KEYS.map((k) => [k.n, emptySteps()]));
  let waveEnvelope = createWaveEnvelope(128);
  const listeners = new Set();

  function notify() {
    onStateChange?.();
    listeners.forEach((fn) => fn());
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.62;
      masterGain.gain.value = 0.12;
      ensureScratchBus();
      getTabRuntime().registerAudioContext(audioCtx);
    }
    getTabRuntime().resumeAllAudioContexts();
    return audioCtx;
  }

  function ensureScratchBus() {
    if (scratchPan || !audioCtx || !masterGain || !analyser) return;
    scratchPan = audioCtx.createStereoPanner();
    scratchDelay = audioCtx.createDelay(1.5);
    scratchDelay.delayTime.value = 0;
    scratchEchoFb = audioCtx.createGain();
    scratchEchoFb.gain.value = 0;
    const echoDelay = audioCtx.createDelay(1.2);
    echoDelay.delayTime.value = 0.22;
    scratchLfo = audioCtx.createOscillator();
    scratchLfo.type = "sine";
    scratchLfo.frequency.value = scratchFx.lfoRate;
    scratchLfoDepth = audioCtx.createGain();
    scratchLfoDepth.gain.value = 0;
    scratchLfo.connect(scratchLfoDepth);
    scratchLfoDepth.connect(scratchPan.pan);
    scratchLfo.start();
    masterGain.disconnect();
    masterGain.connect(scratchPan);
    scratchPan.connect(scratchDelay);
    scratchDelay.connect(analyser);
    scratchDelay.connect(echoDelay);
    echoDelay.connect(scratchEchoFb);
    scratchEchoFb.connect(scratchPan);
    analyser.connect(audioCtx.destination);
    applyScratchFx();
  }

  function applyScratchFx() {
    if (!scratchPan) return;
    scratchPan.pan.value = scratchFx.pan;
    scratchDelay.delayTime.value = scratchFx.delay * 0.45;
    scratchEchoFb.gain.value = scratchFx.echo * 0.42;
    scratchLfoDepth.gain.value = scratchFx.lfo * 0.4;
    if (scratchLfo) scratchLfo.frequency.value = Math.max(0.1, scratchFx.lfoRate);
    const envGain = 0.35 + scratchFx.env * 0.65;
    if (masterGain) masterGain.gain.value = 0.12 * envGain * (scratchFx.warp > 1 ? 1.05 : 1);
  }

  function setScratchFx(patch) {
    scratchFx = { ...scratchFx, ...patch };
    ensureAudio();
    applyScratchFx();
    notify();
  }

  function getScratchFx() {
    return { ...scratchFx };
  }

  function getTimeDomainWave(n = 256) {
    if (!analyser) return null;
    const buf = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(buf);
    const out = new Float32Array(n);
    const step = buf.length / n;
    for (let i = 0; i < n; i++) {
      const v = buf[Math.floor(i * step)] / 128 - 1;
      out[i] = v;
    }
    return out;
  }

  function envGainAt(stepIdx) {
    const n = waveEnvelope.length;
    const pos = (stepIdx / STEP_COUNT) * (n - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = waveEnvelope[i] ?? 0.5;
    const b = waveEnvelope[Math.min(i + 1, n - 1)] ?? a;
    return 0.15 + (a + (b - a) * f) * 0.85;
  }

  function playPad(pad) {
    const ctx = ensureAudio();
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(masterGain);
    const env = envGainAt(seqOn ? seqStep : 0);
    if (pad.kind === "kick" || pad.kind === "sub") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(pad.kind === "kick" ? 90 : 55, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9 * env, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.22);
    } else if (pad.kind === "snare" || pad.kind === "clap" || pad.kind === "noise") {
      const len = Math.floor(ctx.sampleRate * 0.08);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      g.gain.setValueAtTime(0.5 * env, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(g);
      src.start(t);
    } else if (pad.kind === "hat" || pad.kind === "rim") {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = pad.kind === "hat" ? 8000 : 1200;
      g.gain.setValueAtTime(0.15 * env, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
      o.connect(g);
      o.start(t);
      o.stop(t + 0.05);
    } else {
      const midi = pad.midi ?? 60;
      playTone(midiToFreq(midi), 140);
      return;
    }
    onNotePlay?.({ pad: pad.label, kind: pad.kind });
  }

  function refreshTheory() {
    const next = mergeTheory(theory, getTheory?.());
    if (next.locked?.bpm) next.bpm = theory.bpm;
    theory = next;
    return theory;
  }

  function getTheoryState() {
    return mergeTheory(DEFAULT_THEORY, theory);
  }

  function setTheoryState(patch) {
    theory = mergeTheory(theory, patch);
    if (patch?.bpm != null && theory.locked?.bpm) theory.bpm = Number(patch.bpm);
    onTheoryChange?.(getTheoryState());
    notify();
    return theory;
  }

  function applyAutotune(freq) {
    const t = refreshTheory();
    let midi = hzToMidi(freq);
    if (t.negativeHarmony?.enabled && midi != null) {
      midi = negativeHarmonyMidi(midi, t.negativeHarmony.axis);
    }
    if (!autotuneOn) {
      return microtonalFreq(freq, t.microtonal?.cents || 0, t.microtonal?.edo || 12);
    }
    const q = quantizeMidiEdo(midi, t.microtonal?.edo || 12);
    const base = q != null ? midiToFreq(q) : freq;
    return microtonalFreq(base, t.microtonal?.cents || 0, t.microtonal?.edo || 12);
  }

  function playTone(freq, ms = 180) {
    const ctx = ensureAudio();
    const tuned = applyAutotune(freq);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = tuned;
    const env = envGainAt(seqOn ? seqStep : 0);
    g.gain.value = 0.35 * env;
    o.connect(g);
    g.connect(masterGain);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
    const midi = hzToMidi(tuned);
    onNotePlay?.({ hz: tuned, note: midi != null ? midiToName(midi) : tuned });
  }

  function toggleAutotune(on) {
    autotuneOn = on == null ? !autotuneOn : !!on;
    localStorage.setItem("qbpm-autotune", autotuneOn ? "1" : "0");
    notify();
    return autotuneOn;
  }

  function getAutotune() {
    return autotuneOn;
  }

  function captureWaveform(samples = 512) {
    ensureAudio();
    if (!analyser) return null;
    const n = Math.min(samples, analyser.fftSize);
    const buf = new Float32Array(n);
    analyser.getFloatTimeDomainData(buf);
    const peaks = [];
    const step = Math.max(1, Math.floor(n / 128));
    for (let i = 0; i < n; i += step) peaks.push(buf[i]);
    waveformCapture = {
      ts: performance.now(),
      sampleRate: audioCtx.sampleRate,
      peaks,
      bpm: getBpm() || 120,
      envelope: [...waveEnvelope],
    };
    notify();
    return waveformCapture;
  }

  function exportWaveformBlob() {
    const cap = captureWaveform();
    if (!cap) return null;
    const json = JSON.stringify(cap);
    return new Blob([json], { type: "application/json" });
  }

  function downloadWaveformCapture() {
    const cap = captureWaveform();
    if (!cap) return null;
    const blob = new Blob([JSON.stringify(cap)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qbpm-wave-${Math.floor(cap.ts)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    return cap;
  }

  function audioToMidi() {
    ensureAudio();
    if (!analyser || !audioCtx) return null;
    const buf = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buf);
    const hz = detectPitchHz(buf, audioCtx.sampleRate);
    const midi = quantizeMidi(hzToMidi(hz));
    if (midi == null) return null;
    lastDetectedMidi = midi;
    const note = midiToName(midi);
    const steps = noteSteps[note] || emptySteps();
    if (seqOn) steps[seqStep] = true;
    else steps[0] = true;
    noteSteps[note] = steps;
    playTone(midiToFreq(midi), 140);
    notify();
    return { note, midi, hz };
  }

  function getLastDetectedMidi() {
    return lastDetectedMidi;
  }

  function getWaveformCapture() {
    return waveformCapture;
  }

  function currentSteps() {
    return padSteps[selectedPad] || emptySteps();
  }

  function toggleStep(i, padId = selectedPad) {
    const steps = padSteps[padId] || emptySteps();
    steps[i] = !steps[i];
    padSteps[padId] = steps;
    notify();
  }

  function toggleNoteStep(note, i) {
    const steps = noteSteps[note] || emptySteps();
    steps[i] = !steps[i];
    noteSteps[note] = steps;
    notify();
  }

  function triggerStep(i) {
    MPC_PADS.forEach((pad) => {
      if (padSteps[pad.id]?.[i]) playPad(pad);
    });
    for (const [note, arr] of Object.entries(noteSteps)) {
      if (!arr[i]) continue;
      const k = PIANO_KEYS.find((x) => x.n === note);
      if (k) playTone(k.f, 120);
    }
  }

  function scheduleSeqStep() {
    if (!seqOn) return;
    const t = refreshTheory();
    const bpm = t.locked?.bpm ? t.bpm : getBpm() || t.bpm || 120;
    const cycleBeats = cycleBeatsFromSig(t.timeSig);
    const delay = stepDelayMs(seqStep, bpm, t.swing, STEP_COUNT, cycleBeats);
    seqTimer = setTimeout(() => {
      if (!seqOn) return;
      ensureAudio();
      seqStep = (seqStep + 1) % STEP_COUNT;
      triggerStep(seqStep);
      notify();
      scheduleSeqStep();
    }, delay);
  }

  function startSeq() {
    stopSeq();
    seqOn = true;
    seqStep = 0;
    getTabRuntime().setAudioSession(true);
    triggerStep(0);
    notify();
    scheduleSeqStep();
  }

  function stopSeq() {
    seqOn = false;
    getTabRuntime().setAudioSession(false);
    if (seqTimer) clearTimeout(seqTimer);
    seqTimer = null;
    seqStep = 0;
    notify();
  }

  function buildPayload() {
    const t = refreshTheory();
    const bpm = t.locked?.bpm ? t.bpm : getBpm() || t.bpm || 120;
    const notes = [];
    for (const [note, arr] of Object.entries(noteSteps)) {
      arr.forEach((on, i) => {
        if (on) notes.push({ note, beat: i / 4, step: i });
      });
    }
    const musica = notes.map((n) => n.note).join(" ");
    return {
      bpm,
      musica,
      theory: getTheoryState(),
      pattern: { pads: padSteps, notes: noteSteps, steps: STEP_COUNT, envelope: waveEnvelope },
      notes,
    };
  }

  function pushToGrandPiano(payload) {
    try {
      const bc = new BroadcastChannel("piano-buddy-state");
      bc.postMessage({
        type: "piano-state",
        t: performance.now(),
        musica: payload.musica,
        bpm: payload.bpm,
        pattern: payload.pattern,
        source: "qbpm-music-lab",
      });
      bc.close();
    } catch (_) {}
    try {
      const kb = new BroadcastChannel("kbatch-keyboard-data");
      kb.postMessage({
        musica: payload.musica,
        bpm: payload.bpm,
        flow: payload.musica,
        text: payload.musica,
      });
      kb.close();
    } catch (_) {}
  }

  function sendPattern(targetRaw) {
    const raw = targetRaw || "broadcast:all";
    const [type, id] = raw.split(":");
    const payload = buildPayload();
    if (type === "daw") {
      onDawSend?.(id, payload);
    } else {
      onSend?.({ targetType: type, target: id, payload });
    }
    pushToGrandPiano(payload);
    return payload;
  }

  function collectActiveNotes() {
    const out = [];
    for (const [note, arr] of Object.entries(noteSteps)) {
      if (arr.some(Boolean)) out.push({ note });
    }
    return out;
  }

  function setWavePoint(idx, val) {
    if (idx < 0 || idx >= waveEnvelope.length) return;
    waveEnvelope[idx] = Math.max(0, Math.min(1, val));
    notify();
  }

  function clearWaveEnvelope(val = 0.5) {
    waveEnvelope = createWaveEnvelope(waveEnvelope.length);
    if (val !== 0.5) waveEnvelope.fill(val);
    notify();
  }

  function getState() {
    return {
      padSteps,
      noteSteps,
      selectedPad,
      selectedNote,
      seqStep,
      waveEnvelope: [...waveEnvelope],
      theory: getTheoryState(),
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.padSteps) padSteps = s.padSteps;
    if (s.noteSteps) noteSteps = s.noteSteps;
    if (s.selectedPad != null) selectedPad = s.selectedPad;
    if (s.selectedNote) selectedNote = s.selectedNote;
    if (s.seqStep != null) seqStep = s.seqStep;
    if (s.waveEnvelope?.length) waveEnvelope = [...s.waveEnvelope];
    if (s.theory) setTheoryState(s.theory);
    notify();
  }

  function destroy() {
    stopSeq();
    listeners.clear();
    if (audioCtx) {
      getTabRuntime().unregisterAudioContext(audioCtx);
      audioCtx.close();
    }
    audioCtx = null;
    analyser = null;
  }

  return {
    MPC_PADS,
    PIANO_KEYS,
    GRAND_KEYS,
    STEP_COUNT,
    ensureAudio,
    getAnalyser: () => analyser,
    getTimeDomainWave,
    getScratchFx,
    setScratchFx,
    subscribe,
    playPad,
    playTone,
    currentSteps,
    toggleStep,
    toggleNoteStep,
    triggerStep,
    startSeq,
    stopSeq,
    get seqOn() { return seqOn; },
    get seqStep() { return seqStep; },
    get selectedPad() { return selectedPad; },
    set selectedPad(v) { selectedPad = v; notify(); },
    get selectedNote() { return selectedNote; },
    set selectedNote(v) { selectedNote = v; notify(); },
    get padSteps() { return padSteps; },
    get noteSteps() { return noteSteps; },
    get waveEnvelope() { return waveEnvelope; },
    setWavePoint,
    clearWaveEnvelope,
    buildPayload,
    pushToGrandPiano,
    sendPattern,
    toggleAutotune,
    getAutotune,
    captureWaveform,
    exportWaveformBlob,
    downloadWaveformCapture,
    audioToMidi,
    getLastDetectedMidi,
    getWaveformCapture,
    collectActiveNotes,
    getSendTargets,
    getBpm,
    getTheory: getTheoryState,
    setTheory: setTheoryState,
    onJamEval,
    getState,
    setState,
    destroy,
  };
}