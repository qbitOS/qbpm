/** Music lab — 2-oct piano, FL step grid, MPC pads, VFL waveform, send-to routing */

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const STEP_COUNT = 16;

const MPC_PADS = [
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

function midiToFreq(m) {
  return 440 * 2 ** ((m - 69) / 12);
}

function midiToName(m) {
  const oct = Math.floor(m / 12) - 1;
  return `${NOTE_NAMES[m % 12]}${oct}`;
}

function buildTwoOctaveKeys() {
  const keys = [];
  let whitePos = 0;
  for (let m = 48; m <= 72; m++) {
    const name = midiToName(m);
    const black = name.includes("#");
    const w = black ? null : whitePos * 11;
    if (!black) whitePos++;
    keys.push({ n: name, midi: m, f: midiToFreq(m), w: w ?? 0, black });
  }
  let blackIdx = 0;
  const blackOffsets = [8, 19, 30, 50, 61, 72, 83, 94, 114, 125];
  keys.filter((k) => k.black).forEach((k, i) => {
    k.w = blackOffsets[i] ?? blackIdx * 11 + 8;
    blackIdx++;
  });
  return keys;
}

const PIANO_KEYS = buildTwoOctaveKeys();

function emptySteps() {
  return Array.from({ length: STEP_COUNT }, () => false);
}

export function createMusicLab(opts = {}) {
  const {
    onNotePlay,
    onSend,
    onOpenGrandPiano,
    onJamEval,
    getSendTargets = () => ({ nodes: [], peers: [] }),
    getBpm = () => 120,
  } = opts;

  let audioCtx = null;
  let analyser = null;
  let masterGain = null;
  let wfRaf = 0;
  let seqTimer = null;
  let seqStep = 0;
  let seqOn = false;
  let selectedPad = 0;
  let selectedNote = "C4";
  let padSteps = Object.fromEntries(MPC_PADS.map((p) => [p.id, emptySteps()]));
  let noteSteps = Object.fromEntries(PIANO_KEYS.map((k) => [k.n, emptySteps()]));

  function mount(root) {
    if (!root || root.querySelector(".music-lab")) return;
    root.innerHTML = `
      <div class="music-lab">
        <div class="ml-toolbar">
          <span class="ml-bpm-lbl" id="ml-bpm-lbl">120 bpm</span>
          <button type="button" class="ml-btn" id="ml-seq-play" title="Play pattern">▶</button>
          <button type="button" class="ml-btn" id="ml-seq-stop" title="Stop">■</button>
          <button type="button" class="ml-btn ml-link" id="ml-grand" title="Open grand piano + staff">🎹 grand</button>
        </div>
        <div class="ml-strudel-row">
          <input id="ml-strudel" type="text" placeholder="d1 $ s 'bd sd' · (flare) · live jam" spellcheck="false" autocomplete="off" aria-label="Strudel-style pattern" />
          <button type="button" id="ml-strudel-go" class="ml-btn" title="Eval pattern">()</button>
        </div>
        <canvas id="ml-waveform" class="ml-waveform" width="240" height="36" aria-label="Audio waveform"></canvas>
        <div id="ml-staff" class="ml-staff" aria-label="Staff notation"></div>
        <div class="ml-section-hd">mpc pads</div>
        <div id="ml-pads" class="ml-pads" aria-label="MPC pads"></div>
        <div class="ml-section-hd">beat map · <span id="ml-step-label">kick</span></div>
        <div id="ml-steps" class="ml-steps" aria-label="Step sequencer"></div>
        <div class="ml-send-row">
          <select id="ml-send-target" aria-label="Send target"></select>
          <button type="button" id="ml-send-btn" class="ml-btn ml-send">send →</button>
        </div>
        <div class="ml-section-hd">piano · 2 oct</div>
        <div id="ml-piano" class="ml-piano" aria-label="Two octave piano"></div>
        <div id="ml-meta" class="ml-meta">—</div>
      </div>
    `;
    buildPads();
    buildSteps();
    buildPiano();
    bindEvents();
    refreshSendTargets();
    drawStaff([]);
    startWaveform();
  }

  function buildPads() {
    const el = document.getElementById("ml-pads");
    if (!el) return;
    el.innerHTML = "";
    MPC_PADS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ml-pad${p.id === selectedPad ? " active" : ""}`;
      b.dataset.pad = String(p.id);
      b.innerHTML = `<span class="ml-pad-lbl">${p.label}</span>`;
      el.appendChild(b);
    });
  }

  function buildSteps() {
    const el = document.getElementById("ml-steps");
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < STEP_COUNT; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ml-step";
      b.dataset.step = String(i);
      el.appendChild(b);
    }
    syncStepUi();
  }

  function buildPiano() {
    const el = document.getElementById("ml-piano");
    if (!el) return;
    el.innerHTML = `<div class="ml-white"></div><div class="ml-black"></div>`;
    const white = el.querySelector(".ml-white");
    const black = el.querySelector(".ml-black");
    PIANO_KEYS.filter((k) => !k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ml-key ml-white-key";
      b.dataset.note = k.n;
      b.dataset.midi = String(k.midi);
      b.dataset.freq = String(k.f);
      b.title = k.n;
      white.appendChild(b);
    });
    PIANO_KEYS.filter((k) => k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ml-key ml-black-key";
      b.style.left = `${k.w}px`;
      b.dataset.note = k.n;
      b.dataset.midi = String(k.midi);
      b.dataset.freq = String(k.f);
      b.title = k.n;
      black.appendChild(b);
    });
  }

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.62;
      masterGain.connect(analyser);
      analyser.connect(audioCtx.destination);
      masterGain.gain.value = 0.12;
    }
    return audioCtx;
  }

  function playPad(pad) {
    const ctx = ensureAudio();
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(masterGain);
    if (pad.kind === "kick" || pad.kind === "sub") {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(pad.kind === "kick" ? 90 : 55, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.9, t);
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
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      src.connect(g);
      src.start(t);
    } else if (pad.kind === "hat" || pad.kind === "rim") {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = pad.kind === "hat" ? 8000 : 1200;
      g.gain.setValueAtTime(0.15, t);
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

  function playTone(freq, ms = 180) {
    const ctx = ensureAudio();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = 0.35;
    o.connect(g);
    g.connect(masterGain);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + ms / 1000);
    o.stop(ctx.currentTime + ms / 1000 + 0.02);
    onNotePlay?.({ hz: freq, note: freq });
  }

  function currentSteps() {
    return padSteps[selectedPad] || emptySteps();
  }

  function syncStepUi() {
    const steps = currentSteps();
    const pad = MPC_PADS[selectedPad];
    document.getElementById("ml-step-label").textContent = pad?.label || "—";
    document.querySelectorAll(".ml-step").forEach((el, i) => {
      el.classList.toggle("on", !!steps[i]);
      el.classList.toggle("playhead", seqOn && i === seqStep);
    });
    document.querySelectorAll(".ml-pad").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.pad) === selectedPad);
    });
  }

  function toggleStep(i) {
    const steps = currentSteps();
    steps[i] = !steps[i];
    padSteps[selectedPad] = steps;
    syncStepUi();
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

  function startSeq() {
    stopSeq();
    seqOn = true;
    seqStep = 0;
    const bpm = getBpm() || 120;
    const ms = (60 / bpm / 4) * 1000;
    triggerStep(0);
    syncStepUi();
    seqTimer = setInterval(() => {
      seqStep = (seqStep + 1) % STEP_COUNT;
      triggerStep(seqStep);
      syncStepUi();
    }, ms);
    document.getElementById("ml-seq-play")?.classList.add("active");
  }

  function stopSeq() {
    seqOn = false;
    if (seqTimer) clearInterval(seqTimer);
    seqTimer = null;
    seqStep = 0;
    document.getElementById("ml-seq-play")?.classList.remove("active");
    syncStepUi();
  }

  function refreshSendTargets() {
    const sel = document.getElementById("ml-send-target");
    if (!sel) return;
    const { nodes = [], peers = [] } = getSendTargets();
    const prev = sel.value;
    sel.innerHTML = `<option value="broadcast:all">⊙ broadcast</option>`;
    nodes.forEach((n) => {
      const o = document.createElement("option");
      o.value = `node:${n.id}`;
      o.textContent = `◆ ${n.label || n.id}`;
      sel.appendChild(o);
    });
    peers.forEach((p) => {
      const o = document.createElement("option");
      o.value = `peer:${p.clientId}`;
      o.textContent = `◎ ${p.name || p.clientId}`;
      sel.appendChild(o);
    });
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function buildPayload() {
    const bpm = getBpm() || 120;
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
      pattern: { pads: padSteps, notes: noteSteps, steps: STEP_COUNT },
      notes,
    };
  }

  function sendPattern() {
    const sel = document.getElementById("ml-send-target");
    const raw = sel?.value || "broadcast:all";
    const [type, id] = raw.split(":");
    const payload = buildPayload();
    onSend?.({ targetType: type, target: id, payload });
    pushToGrandPiano(payload);
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

  function drawStaff(noteList) {
    const el = document.getElementById("ml-staff");
    if (!el) return;
    el.innerHTML = "";
    if (typeof Vex === "undefined") {
      el.textContent = "staff…";
      return;
    }
    const notes = noteList?.length
      ? noteList
      : collectActiveNotes().slice(0, 8);
    if (!notes.length) {
      el.innerHTML = '<span class="ml-staff-ph">staff · play or sequence notes</span>';
      return;
    }
    try {
      const { Renderer, Stave, StaveNote, Voice, Formatter } = Vex.Flow;
      const w = el.clientWidth || 240;
      const h = 52;
      const renderer = new Renderer(el, Renderer.Backends.SVG);
      renderer.resize(w, h);
      const ctx = renderer.getContext();
      const stave = new Stave(4, 8, w - 8);
      stave.addClef("treble").setContext(ctx).draw();
      const tickables = notes.map((n) => {
        const m = PIANO_KEYS.find((k) => k.n === n.note)?.midi ?? 60;
        const nm = midiToName(m);
        const letter = nm.replace(/\d/, "");
        const oct = nm.match(/\d/)?.[0] || "4";
        const base = letter.replace("#", "");
        const sn = new StaveNote({ clef: "treble", keys: [`${base}/${oct}`], duration: "8" });
        if (letter.includes("#")) sn.addModifier(new Vex.Flow.Accidental("#"), 0);
        return sn;
      });
      const voice = new Voice({ num_beats: tickables.length, beat_value: 8 });
      voice.setStrict(false);
      voice.addTickables(tickables);
      new Formatter().joinVoices([voice]).format([voice], w - 20);
      voice.draw(ctx, stave);
    } catch (_) {
      el.textContent = notes.map((n) => n.note).join(" ");
    }
  }

  function collectActiveNotes() {
    const out = [];
    for (const [note, arr] of Object.entries(noteSteps)) {
      if (arr.some(Boolean)) out.push({ note });
    }
    return out;
  }

  function startWaveform() {
    const canvas = document.getElementById("ml-waveform");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const fallback = new Uint8Array(128);
    let freqBuf = null;
    let stopped = false;

    const draw = () => {
      if (stopped) return;
      const w = canvas.width;
      const h = canvas.height;
      let data = fallback;
      if (analyser) {
        if (!freqBuf || freqBuf.length !== analyser.frequencyBinCount) {
          freqBuf = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(freqBuf);
        data = freqBuf;
      }
      ctx.fillStyle = "#0a0d12";
      ctx.fillRect(0, 0, w, h);
      const barCount = Math.min(data.length, Math.max(16, Math.floor(w / 4)));
      const step = w / barCount;
      ctx.fillStyle = "#7d8590";
      for (let i = 0; i < barCount; i++) {
        const norm = analyser ? data[i] / 255 : 0.04;
        const bh = Math.max(1, norm * h * 0.92);
        ctx.fillRect(Math.floor(i * step), h - bh, Math.max(1, Math.ceil(step) - 1), bh);
      }
      wfRaf = requestAnimationFrame(draw);
    };
    wfRaf = requestAnimationFrame(draw);
    return () => {
      stopped = true;
      cancelAnimationFrame(wfRaf);
    };
  }

  function bindEvents() {
    document.getElementById("ml-pads")?.addEventListener("pointerdown", (ev) => {
      const pad = ev.target.closest(".ml-pad");
      if (!pad) return;
      ev.preventDefault();
      const id = Number(pad.dataset.pad);
      selectedPad = id;
      const p = MPC_PADS[id];
      if (p) playPad(p);
      syncStepUi();
    });

    document.getElementById("ml-steps")?.addEventListener("click", (ev) => {
      const step = ev.target.closest(".ml-step");
      if (!step) return;
      toggleStep(Number(step.dataset.step));
    });

    document.getElementById("ml-piano")?.addEventListener("pointerdown", (ev) => {
      const key = ev.target.closest(".ml-key");
      if (!key) return;
      ev.preventDefault();
      key.classList.add("active");
      const note = key.dataset.note;
      selectedNote = note;
      playTone(parseFloat(key.dataset.freq));
      if (seqOn) {
        const steps = noteSteps[note] || emptySteps();
        steps[seqStep] = !steps[seqStep];
        noteSteps[note] = steps;
      }
      drawStaff([{ note }]);
    });
    document.getElementById("ml-piano")?.addEventListener("pointerup", (ev) => {
      ev.target.closest(".ml-key")?.classList.remove("active");
    });

    document.getElementById("ml-seq-play")?.addEventListener("click", () => {
      if (seqOn) stopSeq();
      else startSeq();
    });
    document.getElementById("ml-seq-stop")?.addEventListener("click", stopSeq);

    document.getElementById("ml-send-btn")?.addEventListener("click", sendPattern);
    document.getElementById("ml-grand")?.addEventListener("click", () => {
      const payload = buildPayload();
      pushToGrandPiano(payload);
      onOpenGrandPiano?.(payload);
    });

    const runStrudel = () => {
      const src = document.getElementById("ml-strudel")?.value?.trim();
      if (!src) return;
      onJamEval?.(src, getBpm() || 120);
    };
    document.getElementById("ml-strudel-go")?.addEventListener("click", runStrudel);
    document.getElementById("ml-strudel")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); runStrudel(); }
    });
  }

  function drawNotation(live) {
    const bpm = live?.bpm || live?.cpm || getBpm() || 120;
    const lbl = document.getElementById("ml-bpm-lbl");
    if (lbl) lbl.textContent = `${bpm} bpm`;
    const meta = document.getElementById("ml-meta");
    const musica = live?.musica || live?.flow || "";
    if (meta) {
      meta.textContent = musica
        ? `${musica.slice(0, 32)} · ${bpm} bpm`
        : `pads · ${STEP_COUNT} steps · 2 oct`;
    }
    if (musica) {
      const parsed = [];
      const re = /([A-Ga-g])([#b]?)(\d)?/g;
      let m;
      while ((m = re.exec(musica)) && parsed.length < 8) {
        const base = m[1].toUpperCase();
        const acc = m[2] || "";
        const oct = m[3] || "4";
        parsed.push({ note: `${base}${acc}${oct}` });
      }
      if (parsed.length) drawStaff(parsed);
    }
    refreshSendTargets();
  }

  function getState() {
    return {
      padSteps,
      noteSteps,
      selectedPad,
      selectedNote,
      seqStep,
      strudel: document.getElementById("ml-strudel")?.value || "",
    };
  }

  function setState(s) {
    if (!s) return;
    if (s.padSteps) padSteps = s.padSteps;
    if (s.noteSteps) noteSteps = s.noteSteps;
    if (s.selectedPad != null) selectedPad = s.selectedPad;
    if (s.selectedNote) selectedNote = s.selectedNote;
    if (s.seqStep != null) seqStep = s.seqStep;
    buildPads();
    buildSteps();
    buildPiano();
    const str = document.getElementById("ml-strudel");
    if (str && s.strudel) str.value = s.strudel;
  }

  function destroy() {
    stopSeq();
    cancelAnimationFrame(wfRaf);
    if (audioCtx) audioCtx.close();
    audioCtx = null;
  }

  return { mount, drawNotation, buildPayload, refreshSendTargets, getState, setState, destroy };
}