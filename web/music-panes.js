/** Full floating music panes — grand, MPC pads, beat map, waveform edit */

import {
  drawEditableWave,
  drawSpectrum,
  midiToName,
  PIANO_KEYS,
} from "./music-core.js";

function drawStaffInto(el, notes, keys = PIANO_KEYS) {
  if (!el) return;
  el.innerHTML = "";
  if (typeof Vex === "undefined") {
    el.textContent = "staff…";
    return;
  }
  if (!notes?.length) {
    el.innerHTML = '<span class="ml-staff-ph">staff · play or sequence notes</span>';
    return;
  }
  try {
    const { Renderer, Stave, StaveNote, Voice, Formatter } = Vex.Flow;
    const w = el.clientWidth || 320;
    const h = el.classList.contains("mp-grand-staff") ? 88 : 72;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(w, h);
    const ctx = renderer.getContext();
    const stave = new Stave(8, 12, w - 16);
    stave.addClef("treble").setContext(ctx).draw();
    const tickables = notes.slice(0, 16).map((n) => {
      const m = keys.find((k) => k.n === n.note)?.midi ?? 60;
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
    new Formatter().joinVoices([voice]).format([voice], w - 28);
    voice.draw(ctx, stave);
  } catch (_) {
    el.textContent = notes.map((n) => n.note).join(" ");
  }
}

export function createMusicPanes(core, opts = {}) {
  const { onOpenGrandPiano } = opts;
  const mounts = {};
  let unsub = null;
  let waveRaf = 0;

  function bindRefresh() {
    unsub?.();
    unsub = core.subscribe(() => refreshAll());
  }

  function refreshAll() {
    refreshMpc();
    refreshBeat();
    refreshWave();
    refreshGrand();
  }

  function mountGrand(root) {
    if (!root || root.querySelector(".mp-grand")) return;
    root.innerHTML = `
      <div class="mp-grand">
        <div class="mp-toolbar">
          <span class="mp-bpm" id="mp-grand-bpm">120 bpm</span>
          <button type="button" class="ml-btn" id="mp-grand-play">▶</button>
          <button type="button" class="ml-btn" id="mp-grand-stop">■</button>
          <button type="button" class="ml-btn ml-link" id="mp-grand-tools">🎹 tools piano</button>
        </div>
        <div id="mp-grand-staff" class="ml-staff mp-grand-staff" aria-label="Grand staff"></div>
        <div id="mp-grand-piano" class="mp-grand-piano" aria-label="Grand piano"></div>
        <div class="mp-meta" id="mp-grand-meta">3 oct · C3–B5</div>
      </div>`;
    const piano = root.querySelector("#mp-grand-piano");
    piano.innerHTML = `<div class="mp-white"></div><div class="mp-black"></div>`;
    const white = piano.querySelector(".mp-white");
    const black = piano.querySelector(".mp-black");
    core.GRAND_KEYS.filter((k) => !k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mp-key mp-white-key";
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      white.appendChild(b);
    });
    core.GRAND_KEYS.filter((k) => k.black).forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mp-key mp-black-key";
      if (k.w != null) b.style.left = `${k.w * 100}%`;
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      black.appendChild(b);
    });
    piano.addEventListener("pointerdown", (ev) => {
      const key = ev.target.closest(".mp-key");
      if (!key) return;
      ev.preventDefault();
      key.classList.add("active");
      core.selectedNote = key.dataset.note;
      core.playTone(parseFloat(key.dataset.freq));
      drawStaffInto(root.querySelector("#mp-grand-staff"), [{ note: key.dataset.note }], core.GRAND_KEYS);
    });
    piano.addEventListener("pointerup", (ev) => ev.target.closest(".mp-key")?.classList.remove("active"));
    root.querySelector("#mp-grand-play")?.addEventListener("click", () => {
      if (core.seqOn) core.stopSeq();
      else core.startSeq();
    });
    root.querySelector("#mp-grand-stop")?.addEventListener("click", () => core.stopSeq());
    root.querySelector("#mp-grand-tools")?.addEventListener("click", () => {
      const payload = core.buildPayload();
      core.pushToGrandPiano(payload);
      onOpenGrandPiano?.(payload);
    });
    mounts.grand = root;
    bindRefresh();
    refreshGrand();
  }

  function refreshGrand() {
    const root = mounts.grand;
    if (!root) return;
    const bpm = core.getBpm() || 120;
    const lbl = root.querySelector("#mp-grand-bpm");
    if (lbl) lbl.textContent = `${bpm} bpm`;
    root.querySelector("#mp-grand-play")?.classList.toggle("active", core.seqOn);
    drawStaffInto(
      root.querySelector("#mp-grand-staff"),
      core.collectActiveNotes().slice(0, 16),
      core.GRAND_KEYS,
    );
  }

  function mountMpc(root) {
    if (!root || root.querySelector(".mp-mpc")) return;
    root.innerHTML = `
      <div class="mp-mpc">
        <div class="mp-toolbar">
          <span class="mp-bpm" id="mp-mpc-bpm">120 bpm</span>
          <button type="button" class="ml-btn" id="mp-mpc-play">▶</button>
          <button type="button" class="ml-btn" id="mp-mpc-stop">■</button>
        </div>
        <div id="mp-mpc-pads" class="mp-mpc-pads" aria-label="MPC pads"></div>
        <div class="mp-meta">16 pads · velocity tap</div>
      </div>`;
    const pads = root.querySelector("#mp-mpc-pads");
    core.MPC_PADS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "mp-mpc-pad";
      b.dataset.pad = String(p.id);
      b.innerHTML = `<span class="mp-pad-lbl">${p.label}</span><span class="mp-pad-kind">${p.kind}</span>`;
      pads.appendChild(b);
    });
    pads.addEventListener("pointerdown", (ev) => {
      const pad = ev.target.closest(".mp-mpc-pad");
      if (!pad) return;
      ev.preventDefault();
      const id = Number(pad.dataset.pad);
      core.selectedPad = id;
      const p = core.MPC_PADS[id];
      if (p) core.playPad(p);
      pad.classList.add("hit");
      setTimeout(() => pad.classList.remove("hit"), 120);
    });
    root.querySelector("#mp-mpc-play")?.addEventListener("click", () => {
      if (core.seqOn) core.stopSeq();
      else core.startSeq();
    });
    root.querySelector("#mp-mpc-stop")?.addEventListener("click", () => core.stopSeq());
    mounts.mpc = root;
    bindRefresh();
    refreshMpc();
  }

  function refreshMpc() {
    const root = mounts.mpc;
    if (!root) return;
    const bpm = core.getBpm() || 120;
    const lbl = root.querySelector("#mp-mpc-bpm");
    if (lbl) lbl.textContent = `${bpm} bpm`;
    root.querySelector("#mp-mpc-play")?.classList.toggle("active", core.seqOn);
    root.querySelectorAll(".mp-mpc-pad").forEach((el) => {
      const id = Number(el.dataset.pad);
      el.classList.toggle("active", id === core.selectedPad);
    });
  }

  function mountBeat(root) {
    if (!root || root.querySelector(".mp-beat")) return;
    root.innerHTML = `
      <div class="mp-beat">
        <div class="mp-toolbar">
          <span class="mp-bpm" id="mp-beat-bpm">120 bpm</span>
          <button type="button" class="ml-btn" id="mp-beat-play">▶</button>
          <button type="button" class="ml-btn" id="mp-beat-stop">■</button>
          <select id="mp-beat-send" class="mp-beat-send" aria-label="Send target"></select>
          <button type="button" class="ml-btn ml-send" id="mp-beat-send-btn">send →</button>
        </div>
        <div class="mp-beat-hd">
          <span class="mp-beat-pad-col">pad</span>
          <span class="mp-beat-steps-hd">16 steps</span>
        </div>
        <div id="mp-beat-grid" class="mp-beat-grid" aria-label="Beat sequencer"></div>
        <div class="mp-meta">FL-style beat map · click cell to toggle</div>
      </div>`;
    const grid = root.querySelector("#mp-beat-grid");
    core.MPC_PADS.forEach((p) => {
      const row = document.createElement("div");
      row.className = "mp-beat-row";
      row.dataset.pad = String(p.id);
      row.innerHTML = `<span class="mp-beat-pad-lbl">${p.label}</span>`;
      const steps = document.createElement("div");
      steps.className = "mp-beat-steps";
      for (let i = 0; i < core.STEP_COUNT; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mp-beat-cell";
        b.dataset.step = String(i);
        steps.appendChild(b);
      }
      row.appendChild(steps);
      grid.appendChild(row);
    });
    grid.addEventListener("click", (ev) => {
      const cell = ev.target.closest(".mp-beat-cell");
      const row = ev.target.closest(".mp-beat-row");
      if (!cell || !row) return;
      const padId = Number(row.dataset.pad);
      core.selectedPad = padId;
      core.toggleStep(Number(cell.dataset.step), padId);
    });
    root.querySelector("#mp-beat-play")?.addEventListener("click", () => {
      if (core.seqOn) core.stopSeq();
      else core.startSeq();
    });
    root.querySelector("#mp-beat-stop")?.addEventListener("click", () => core.stopSeq());
    root.querySelector("#mp-beat-send-btn")?.addEventListener("click", () => {
      core.sendPattern(root.querySelector("#mp-beat-send")?.value);
    });
    mounts.beat = root;
    bindRefresh();
    refreshBeat();
  }

  function refreshBeat() {
    const root = mounts.beat;
    if (!root) return;
    const bpm = core.getBpm() || 120;
    root.querySelector("#mp-beat-bpm").textContent = `${bpm} bpm`;
    root.querySelector("#mp-beat-play")?.classList.toggle("active", core.seqOn);
    const sel = root.querySelector("#mp-beat-send");
    if (sel) {
      const prev = sel.value;
      const { nodes = [], peers = [] } = core.getSendTargets();
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
    root.querySelectorAll(".mp-beat-row").forEach((row) => {
      const padId = Number(row.dataset.pad);
      const steps = core.padSteps[padId] || [];
      row.querySelectorAll(".mp-beat-cell").forEach((cell, i) => {
        cell.classList.toggle("on", !!steps[i]);
        cell.classList.toggle("playhead", core.seqOn && i === core.seqStep);
      });
      row.classList.toggle("active", padId === core.selectedPad);
    });
  }

  function mountWave(root) {
    if (!root || root.querySelector(".mp-wave")) return;
    root.innerHTML = `
      <div class="mp-wave">
        <div class="mp-toolbar">
          <span class="mp-bpm" id="mp-wave-bpm">120 bpm</span>
          <button type="button" class="ml-btn" id="mp-wave-clear">clear</button>
          <button type="button" class="ml-btn" id="mp-wave-flat">flat</button>
        </div>
        <canvas id="mp-wave-edit" class="mp-wave-edit" width="480" height="140" aria-label="Editable waveform"></canvas>
        <canvas id="mp-wave-live" class="mp-wave-live" width="480" height="48" aria-label="Live spectrum"></canvas>
        <div class="mp-meta">drag to sculpt envelope · modulates step gain</div>
      </div>`;
    const edit = root.querySelector("#mp-wave-edit");
    let painting = false;

    function paint(ev) {
      const rect = edit.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const w = edit.width;
      const h = edit.height;
      const n = core.waveEnvelope.length;
      const idx = Math.round((x / rect.width) * (n - 1));
      const val = 1 - y / rect.height;
      core.setWavePoint(idx, val);
      if (painting && ev.buttons === 1) {
        const prev = Math.max(0, idx - 1);
        const next = Math.min(n - 1, idx + 1);
        core.setWavePoint(prev, val);
        core.setWavePoint(next, val);
      }
      drawEditableWave(edit, core.waveEnvelope);
    }

    edit.addEventListener("pointerdown", (ev) => {
      painting = true;
      edit.setPointerCapture(ev.pointerId);
      paint(ev);
    });
    edit.addEventListener("pointermove", (ev) => {
      if (painting) paint(ev);
    });
    edit.addEventListener("pointerup", () => { painting = false; });
    edit.addEventListener("pointerleave", () => { painting = false; });

    root.querySelector("#mp-wave-clear")?.addEventListener("click", () => {
      core.clearWaveEnvelope(0.1);
    });
    root.querySelector("#mp-wave-flat")?.addEventListener("click", () => {
      core.clearWaveEnvelope(0.5);
    });

    mounts.wave = root;
    bindRefresh();
    refreshWave();
    const liveLoop = () => {
      const live = root.querySelector("#mp-wave-live");
      if (live && mounts.wave) {
        core.ensureAudio();
        drawSpectrum(live, core.getAnalyser(), { barW: 4 });
      }
      waveRaf = requestAnimationFrame(liveLoop);
    };
    waveRaf = requestAnimationFrame(liveLoop);
  }

  function refreshWave() {
    const root = mounts.wave;
    if (!root) return;
    const bpm = core.getBpm() || 120;
    root.querySelector("#mp-wave-bpm").textContent = `${bpm} bpm`;
    const edit = root.querySelector("#mp-wave-edit");
    drawEditableWave(edit, core.waveEnvelope);
  }

  function drawNotation(live) {
    refreshAll();
    const bpm = live?.bpm || live?.cpm || core.getBpm() || 120;
    document.querySelectorAll(".mp-bpm").forEach((el) => {
      if (!live?.bpm && !live?.cpm) return;
      el.textContent = `${bpm} bpm`;
    });
    if (live?.musica || live?.flow) {
      const parsed = [];
      const re = /([A-Ga-g])([#b]?)(\d)?/g;
      let m;
      const musica = live.musica || live.flow;
      while ((m = re.exec(musica)) && parsed.length < 16) {
        const base = m[1].toUpperCase();
        const acc = m[2] || "";
        const oct = m[3] || "4";
        parsed.push({ note: `${base}${acc}${oct}` });
      }
      if (parsed.length && mounts.grand) {
        drawStaffInto(mounts.grand.querySelector("#mp-grand-staff"), parsed, core.GRAND_KEYS);
      }
    }
  }

  function destroy() {
    cancelAnimationFrame(waveRaf);
    unsub?.();
    unsub = null;
    mounts.grand = null;
    mounts.mpc = null;
    mounts.beat = null;
    mounts.wave = null;
  }

  return {
    mountGrand,
    mountMpc,
    mountBeat,
    mountWave,
    drawNotation,
    refreshAll,
    destroy,
  };
}