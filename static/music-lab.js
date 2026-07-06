/** Music lab — compact overview: piano, pads, beat, strudel, send-to */

import {
  createMusicCore,
  drawSpectrum,
  midiToName,
  PIANO_KEYS,
  STEP_COUNT,
} from "./music-core.js";
import {
  TIME_SIGNATURES,
  EDO_OPTIONS,
  STRUCTURE_SECTIONS,
  THEORY_PRESETS,
  theorySummary,
  timeSigLabel,
} from "./music-theory.js";

function drawStaff(el, notes, keys = PIANO_KEYS) {
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
    const w = el.clientWidth || 240;
    const h = 52;
    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(w, h);
    const ctx = renderer.getContext();
    const stave = new Stave(4, 8, w - 8);
    stave.addClef("treble").setContext(ctx).draw();
    const tickables = notes.map((n) => {
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
    new Formatter().joinVoices([voice]).format([voice], w - 20);
    voice.draw(ctx, stave);
  } catch (_) {
    el.textContent = notes.map((n) => n.note).join(" ");
  }
}

export function createMusicLab(coreOrOpts, maybeOpts) {
  const core = coreOrOpts?.playPad ? coreOrOpts : createMusicCore(coreOrOpts || {});
  const opts = coreOrOpts?.playPad ? maybeOpts || {} : maybeOpts || coreOrOpts || {};
  const {
    onOpenGrandPiano,
    onOpenPane,
    onOpenStrudel,
    onStrudelLoad,
    onStrudelPlay,
    onJamEval = core.onJamEval,
    onDawLink,
    onDawOpen,
  } = opts;

  let wfRaf = 0;
  let unsub = null;

  function mount(root) {
    if (!root || root.querySelector(".music-lab")) return;
    root.innerHTML = `
      <div class="music-lab">
        <div class="ml-toolbar">
          <span class="ml-bpm-lbl" id="ml-bpm-lbl">120 bpm</span>
          <button type="button" class="ml-btn" id="ml-seq-play" title="Play pattern">▶</button>
          <button type="button" class="ml-btn" id="ml-seq-stop" title="Stop">■</button>
          <button type="button" class="ml-btn ml-link" id="ml-grand" title="Grand piano pane">🎹</button>
          <button type="button" class="ml-btn ml-link" id="ml-mpc" title="MPC pads pane">pads</button>
          <button type="button" class="ml-btn ml-link" id="ml-beat" title="Beat MPC pane">beat</button>
          <button type="button" class="ml-btn ml-link" id="ml-wave" title="Waveform edit pane">∿</button>
        </div>
        <div class="ml-theory" aria-label="Music theory · BPM · swing · signature">
          <div class="ml-theory-row">
            <label class="ml-theory-field" title="Time signature">
              <span>sig</span>
              <select id="ml-sig"></select>
            </label>
            <label class="ml-theory-field ml-theory-swing" title="Swing amount">
              <span>sw</span>
              <input id="ml-swing" type="range" min="0" max="100" value="0" />
            </label>
            <label class="ml-theory-field" title="BPM">
              <span>bpm</span>
              <input id="ml-bpm" type="number" min="20" max="320" step="1" value="120" />
            </label>
            <button type="button" class="ml-lock" id="ml-lock-bpm" title="Lock BPM">○</button>
            <button type="button" class="ml-lock" id="ml-lock-swing" title="Lock swing">○</button>
            <button type="button" class="ml-lock" id="ml-lock-sig" title="Lock signature">○</button>
          </div>
          <div class="ml-theory-row">
            <label class="ml-theory-field" title="Microtonal EDO">
              <span>edo</span>
              <select id="ml-edo"></select>
            </label>
            <label class="ml-theory-field ml-theory-swing" title="Microtonal cents shift">
              <span>¢</span>
              <input id="ml-cents" type="range" min="-50" max="50" value="0" />
            </label>
            <label class="ml-theory-field" title="Song structure section">
              <span>form</span>
              <select id="ml-structure"></select>
            </label>
            <button type="button" class="ml-chip-toggle" id="ml-neg" title="Negative harmony flip">neg</button>
            <button type="button" class="ml-chip-toggle" id="ml-poly" title="Polyrhythm overlay">poly</button>
          </div>
          <div class="ml-theory-presets qb-btn-group" aria-label="Arrangement presets">
            ${Object.values(THEORY_PRESETS).map((p) => `<button type="button" class="qb-chip ml-preset" data-preset="${p.id}" title="${p.label}">${p.label}</button>`).join("")}
          </div>
          <div class="ml-theory-meta" id="ml-theory-meta">4/4 · verse</div>
        </div>
        <div class="ml-strudel-row">
          <input id="ml-strudel" type="text" placeholder="GitHub repo · strudel.cc · d1 $ s 'bd sd'" spellcheck="false" autocomplete="off" aria-label="Strudel pattern or project URL" />
          <button type="button" id="ml-strudel-open" class="ml-btn qb-btn--accent qb-btn--icon" title="Open Strudel pane">()</button>
          <button type="button" id="ml-strudel-go" class="ml-btn qb-btn--play qb-btn--icon" title="Load / play in Strudel">▶</button>
        </div>
        <div class="ml-strudel-presets qb-btn-group">
          <button type="button" class="qb-chip" id="ml-failsafe" title="Load Fail-safe project">Fail-safe</button>
          <button type="button" class="qb-chip" id="ml-strudel-cc" title="Open strudel.cc REPL">strudel.cc</button>
        </div>
        <div class="ml-audio-tools qb-btn-group" aria-label="Audio tools">
          <button type="button" class="qb-chip" id="ml-wf-capture" title="Capture waveform snapshot (JSON)">∿ cap</button>
          <button type="button" class="qb-chip" id="ml-autotune" title="Standard autotune · quantize pitch">♪ tune</button>
          <button type="button" class="qb-chip" id="ml-a2m" title="Audio → MIDI note detect">a→midi</button>
        </div>
        <div class="ml-daw-row" id="ml-daw-chips" aria-label="DAW link targets"></div>
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
    buildTheoryControls();
    bindEvents();
    refreshDawChips();
    refreshSendTargets();
    drawStaff(document.getElementById("ml-staff"), []);
    startWaveform();
    unsub = core.subscribe(syncUi);
    syncUi();
  }

  function buildPads() {
    const el = document.getElementById("ml-pads");
    if (!el) return;
    el.innerHTML = "";
    core.MPC_PADS.forEach((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ml-pad${p.id === core.selectedPad ? " active" : ""}`;
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
  }

  function buildTheoryControls() {
    const sig = document.getElementById("ml-sig");
    if (sig) {
      sig.innerHTML = TIME_SIGNATURES.map(
        (ts) => `<option value="${ts[0]}/${ts[1]}">${timeSigLabel(ts)}</option>`,
      ).join("");
    }
    const edo = document.getElementById("ml-edo");
    if (edo) {
      edo.innerHTML = EDO_OPTIONS.map((n) => `<option value="${n}">${n}-TET</option>`).join("");
    }
    const sec = document.getElementById("ml-structure");
    if (sec) {
      sec.innerHTML = STRUCTURE_SECTIONS.map((s) => `<option value="${s}">${s}</option>`).join("");
    }
    syncTheoryUi();
  }

  function syncTheoryUi() {
    const t = core.getTheory?.() || {};
    const sig = document.getElementById("ml-sig");
    if (sig) sig.value = timeSigLabel(t.timeSig);
    const swing = document.getElementById("ml-swing");
    if (swing) swing.value = String(Math.round((t.swing || 0) * 100));
    const bpm = document.getElementById("ml-bpm");
    if (bpm) bpm.value = String(Math.round(t.bpm || core.getBpm?.() || 120));
    const edo = document.getElementById("ml-edo");
    if (edo) edo.value = String(t.microtonal?.edo || 12);
    const cents = document.getElementById("ml-cents");
    if (cents) cents.value = String(t.microtonal?.cents || 0);
    const structure = document.getElementById("ml-structure");
    if (structure) structure.value = t.structure?.section || "verse";
    document.getElementById("ml-neg")?.classList.toggle("active", !!t.negativeHarmony?.enabled);
    document.getElementById("ml-poly")?.classList.toggle("active", !!t.polyrhythm?.enabled);
    const lockBpm = document.getElementById("ml-lock-bpm");
    if (lockBpm) {
      lockBpm.classList.toggle("locked", !!t.locked?.bpm);
      lockBpm.textContent = t.locked?.bpm ? "●" : "○";
    }
    const lockSwing = document.getElementById("ml-lock-swing");
    if (lockSwing) {
      lockSwing.classList.toggle("locked", !!t.locked?.swing);
      lockSwing.textContent = t.locked?.swing ? "●" : "○";
    }
    const lockSig = document.getElementById("ml-lock-sig");
    if (lockSig) {
      lockSig.classList.toggle("locked", !!t.locked?.signature);
      lockSig.textContent = t.locked?.signature ? "●" : "○";
    }
    const meta = document.getElementById("ml-theory-meta");
    if (meta) meta.textContent = theorySummary(t);
  }

  function patchTheory(patch) {
    core.setTheory?.(patch);
    syncTheoryUi();
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

  function syncUi() {
    const steps = core.currentSteps();
    const pad = core.MPC_PADS[core.selectedPad];
    document.getElementById("ml-step-label").textContent = pad?.label || "—";
    document.querySelectorAll(".ml-step").forEach((el, i) => {
      el.classList.toggle("on", !!steps[i]);
      el.classList.toggle("playhead", core.seqOn && i === core.seqStep);
    });
    document.querySelectorAll(".ml-pad").forEach((el) => {
      el.classList.toggle("active", Number(el.dataset.pad) === core.selectedPad);
    });
    document.getElementById("ml-seq-play")?.classList.toggle("active", core.seqOn);
  }

  function refreshDawChips() {
    const host = document.getElementById("ml-daw-chips");
    if (!host) return;
    const { daws = [] } = core.getSendTargets();
    if (!daws.length) {
      host.innerHTML = '<span class="ml-daw-ph">daw · link targets in send ▾</span>';
      return;
    }
    host.innerHTML = daws
      .slice(0, 8)
      .map(
        (d) =>
          `<button type="button" class="qb-chip ml-daw-chip${d.linked ? " linked" : ""}" data-daw="${d.id}" title="${d.label} · ${d.repo || ""}">${d.label.slice(0, 10)}</button>`,
      )
      .join("");
    host.querySelectorAll(".ml-daw-chip").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        const id = ev.currentTarget.dataset.daw;
        const linked = opts.onDawLink?.(id);
        ev.currentTarget.classList.toggle("linked", !!linked);
        refreshSendTargets();
      });
      btn.addEventListener("dblclick", (ev) => {
        opts.onDawOpen?.(ev.currentTarget.dataset.daw);
      });
    });
  }

  function refreshSendTargets() {
    const sel = document.getElementById("ml-send-target");
    if (!sel) return;
    const { nodes = [], peers = [], users = [], daws = [] } = core.getSendTargets();
    const prev = sel.value;
    sel.innerHTML = `<option value="broadcast:all">⊙ broadcast</option>`;
    if (daws.length) {
      const og = document.createElement("optgroup");
      og.label = "daw";
      daws.forEach((d) => {
        const o = document.createElement("option");
        o.value = `daw:${d.id}`;
        o.textContent = `${d.linked ? "◉" : "○"} ${d.label}`;
        og.appendChild(o);
      });
      sel.appendChild(og);
    }
    nodes.forEach((n) => {
      const o = document.createElement("option");
      o.value = `node:${n.id}`;
      o.textContent = `◆ ${n.label || n.id}`;
      sel.appendChild(o);
    });
    const seenPeers = new Set();
    users.forEach((u) => {
      if (!u.clientId || seenPeers.has(u.clientId)) return;
      seenPeers.add(u.clientId);
      const o = document.createElement("option");
      o.value = `peer:${u.clientId}`;
      o.textContent = `◎ ${u.name || u.clientId}`;
      sel.appendChild(o);
    });
    peers.forEach((p) => {
      if (seenPeers.has(p.clientId)) return;
      seenPeers.add(p.clientId);
      const o = document.createElement("option");
      o.value = `peer:${p.clientId}`;
      o.textContent = `◎ ${p.name || p.clientId}`;
      sel.appendChild(o);
    });
    if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
  }

  function startWaveform() {
    const canvas = document.getElementById("ml-waveform");
    if (!canvas) return;
    let stopped = false;
    const draw = () => {
      if (stopped) return;
      core.ensureAudio();
      drawSpectrum(canvas, core.getAnalyser());
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
      core.selectedPad = id;
      const p = core.MPC_PADS[id];
      if (p) core.playPad(p);
    });

    document.getElementById("ml-steps")?.addEventListener("click", (ev) => {
      const step = ev.target.closest(".ml-step");
      if (!step) return;
      core.toggleStep(Number(step.dataset.step));
    });

    document.getElementById("ml-piano")?.addEventListener("pointerdown", (ev) => {
      const key = ev.target.closest(".ml-key");
      if (!key) return;
      ev.preventDefault();
      key.classList.add("active");
      const note = key.dataset.note;
      core.selectedNote = note;
      core.playTone(parseFloat(key.dataset.freq));
      if (core.seqOn) core.toggleNoteStep(note, core.seqStep);
      drawStaff(document.getElementById("ml-staff"), [{ note }]);
    });
    document.getElementById("ml-piano")?.addEventListener("pointerup", (ev) => {
      ev.target.closest(".ml-key")?.classList.remove("active");
    });

    document.getElementById("ml-seq-play")?.addEventListener("click", () => {
      if (core.seqOn) core.stopSeq();
      else core.startSeq();
    });
    document.getElementById("ml-seq-stop")?.addEventListener("click", () => core.stopSeq());

    document.getElementById("ml-sig")?.addEventListener("change", (ev) => {
      const parts = ev.target.value.split("/").map(Number);
      patchTheory({ timeSig: parts, locked: { signature: core.getTheory?.().locked?.signature } });
    });
    document.getElementById("ml-swing")?.addEventListener("input", (ev) => {
      patchTheory({ swing: Number(ev.target.value) / 100 });
    });
    document.getElementById("ml-bpm")?.addEventListener("change", (ev) => {
      const bpm = Math.max(20, Math.min(320, Number(ev.target.value) || 120));
      patchTheory({ bpm });
    });
    document.getElementById("ml-edo")?.addEventListener("change", (ev) => {
      patchTheory({ microtonal: { edo: Number(ev.target.value) } });
    });
    document.getElementById("ml-cents")?.addEventListener("input", (ev) => {
      patchTheory({ microtonal: { cents: Number(ev.target.value) } });
    });
    document.getElementById("ml-structure")?.addEventListener("change", (ev) => {
      patchTheory({ structure: { section: ev.target.value } });
    });
    document.getElementById("ml-neg")?.addEventListener("click", (ev) => {
      const on = !core.getTheory?.().negativeHarmony?.enabled;
      patchTheory({ negativeHarmony: { enabled: on } });
      ev.currentTarget.classList.toggle("active", on);
    });
    document.getElementById("ml-poly")?.addEventListener("click", (ev) => {
      const on = !core.getTheory?.().polyrhythm?.enabled;
      patchTheory({ polyrhythm: { enabled: on } });
      ev.currentTarget.classList.toggle("active", on);
    });
    const toggleLock = (key, btnId) => {
      document.getElementById(btnId)?.addEventListener("click", () => {
        const t = core.getTheory?.() || {};
        const locked = { ...t.locked, [key]: !t.locked?.[key] };
        patchTheory({ locked });
      });
    };
    toggleLock("bpm", "ml-lock-bpm");
    toggleLock("swing", "ml-lock-swing");
    toggleLock("signature", "ml-lock-sig");
    document.querySelectorAll(".ml-preset").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = THEORY_PRESETS[btn.dataset.preset];
        if (!preset) return;
        patchTheory({ ...preset.theory, preset: preset.id });
      });
    });

    document.getElementById("ml-send-btn")?.addEventListener("click", () => {
      core.sendPattern(document.getElementById("ml-send-target")?.value);
    });

    document.getElementById("ml-wf-capture")?.addEventListener("click", () => {
      const cap = core.downloadWaveformCapture();
      if (cap) drawStaff(document.getElementById("ml-staff"), [{ note: "C4" }]);
    });
    document.getElementById("ml-autotune")?.addEventListener("click", (ev) => {
      const on = core.toggleAutotune();
      ev.currentTarget.classList.toggle("active", on);
      ev.currentTarget.title = on ? "Autotune on · quantize pitch" : "Autotune off";
    });
    document.getElementById("ml-a2m")?.addEventListener("click", () => {
      const hit = core.audioToMidi();
      if (hit) drawStaff(document.getElementById("ml-staff"), [{ note: hit.note }]);
    });

    document.getElementById("ml-grand")?.addEventListener("click", () => {
      const payload = core.buildPayload();
      core.pushToGrandPiano(payload);
      onOpenGrandPiano?.(payload);
      onOpenPane?.("grand");
    });

    document.getElementById("ml-mpc")?.addEventListener("click", () => onOpenPane?.("mpc"));
    document.getElementById("ml-beat")?.addEventListener("click", () => onOpenPane?.("beat"));
    document.getElementById("ml-wave")?.addEventListener("click", () => onOpenPane?.("wave"));

    const isStrudelProject = (src) =>
      /strudel\.cc/i.test(src) ||
      (/github\.com/i.test(src) && (/\.js(\?|$)/i.test(src) || /\/blob\//i.test(src) || /github\.com\/[^/]+\/[^/]+\/?$/i.test(src)));

    const isStrudelCode = (src) =>
      /stack\s*\(|setcps\s*\(|samples\s*\(|\.bank\s*\(|sound\s*\(|\.gain\s*\(|\bs\s*\(|^\s*d\d+\s*\$/im.test(src);

    const runStrudel = async () => {
      const src = document.getElementById("ml-strudel")?.value?.trim();
      if (!src) return;
      if (isStrudelProject(src)) {
        await onStrudelLoad?.(src);
        return;
      }
      if (isStrudelCode(src)) {
        await onStrudelPlay?.(src);
        return;
      }
      onOpenStrudel?.();
      await onStrudelPlay?.(src);
      onJamEval?.(src, core.getBpm() || 120);
    };

    document.getElementById("ml-strudel-open")?.addEventListener("click", () => onOpenStrudel?.());
    document.getElementById("ml-strudel-go")?.addEventListener("click", () => runStrudel().catch(() => {}));
    document.getElementById("ml-strudel")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); runStrudel().catch(() => {}); }
    });
    document.getElementById("ml-failsafe")?.addEventListener("click", () => {
      const url = "https://github.com/algorave-dave/Fail-safe";
      const inp = document.getElementById("ml-strudel");
      if (inp) inp.value = url;
      onStrudelLoad?.(url).then(() => onStrudelPlay?.()).catch(() => {});
    });
    document.getElementById("ml-strudel-cc")?.addEventListener("click", () => {
      onOpenStrudel?.();
      onStrudelLoad?.("https://strudel.cc/").catch(() => {});
    });
  }

  function drawNotation(live) {
    const t = core.getTheory?.() || {};
    const bpm = t.locked?.bpm ? t.bpm : live?.bpm || live?.cpm || core.getBpm() || 120;
    const lbl = document.getElementById("ml-bpm-lbl");
    if (lbl) lbl.textContent = `${Math.round(bpm)} bpm · ${timeSigLabel(t.timeSig)}`;
    syncTheoryUi();
    const meta = document.getElementById("ml-meta");
    const musica = live?.musica || live?.flow || "";
    if (meta) {
      meta.textContent = musica
        ? `${musica.slice(0, 32)} · ${theorySummary(t)}`
        : `${theorySummary(t)} · ${STEP_COUNT} steps`;
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
      if (parsed.length) drawStaff(document.getElementById("ml-staff"), parsed);
    }
    refreshDawChips();
    refreshSendTargets();
    syncUi();
    document.getElementById("ml-autotune")?.classList.toggle("active", core.getAutotune?.());
  }

  function getState() {
    return {
      ...core.getState(),
      strudel: document.getElementById("ml-strudel")?.value || "",
    };
  }

  function setState(s) {
    if (!s) return;
    core.setState(s);
    buildPads();
    buildSteps();
    buildPiano();
    const str = document.getElementById("ml-strudel");
    if (str && s.strudel) str.value = s.strudel;
    syncUi();
  }

  function destroy() {
    cancelAnimationFrame(wfRaf);
    unsub?.();
    if (!coreOrOpts?.playPad) core.destroy();
  }

  return {
    mount,
    drawNotation,
    buildPayload: () => core.buildPayload(),
    refreshSendTargets,
    refreshDawChips,
    getState,
    setState,
    getCore: () => core,
    destroy,
  };
}