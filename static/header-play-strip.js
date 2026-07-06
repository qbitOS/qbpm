/** Compact piano · beat map · play/record under header waveform */

import { GRAND_KEYS, STEP_COUNT } from "./music-core.js";

export function createHeaderPlayStrip(core) {
  let host = null;
  let recording = false;
  let mediaRec = null;
  let chunks = [];

  function mount(el) {
    host = el || document.getElementById("header-play-strip");
    if (!host || host.querySelector(".hps-inner")) return;
    host.innerHTML = `
      <div class="hps-inner" role="region" aria-label="Piano · beat · record">
        <div class="hps-transport">
          <button type="button" class="hps-btn" id="hps-seq-play" title="Play beat">▶</button>
          <button type="button" class="hps-btn" id="hps-seq-stop" title="Stop">■</button>
          <button type="button" class="hps-btn hps-rec" id="hps-record" title="Record mix">● rec</button>
          <span class="hps-rec-lbl" id="hps-rec-lbl"></span>
        </div>
        <div class="hps-steps" id="hps-steps" aria-label="Beat map"></div>
        <div class="hps-piano" id="hps-piano" aria-label="Keyboard"></div>
      </div>`;
    buildSteps();
    buildPiano();
    bind();
  }

  function buildSteps() {
    const el = document.getElementById("hps-steps");
    if (!el) return;
    el.innerHTML = "";
    for (let i = 0; i < STEP_COUNT; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hps-step";
      b.dataset.step = String(i);
      el.appendChild(b);
    }
  }

  function buildPiano() {
    const el = document.getElementById("hps-piano");
    if (!el) return;
    const white = GRAND_KEYS.filter((k) => !k.black);
    const black = GRAND_KEYS.filter((k) => k.black);
    el.innerHTML = `<div class="hps-white"></div><div class="hps-black"></div>`;
    const wEl = el.querySelector(".hps-white");
    const bEl = el.querySelector(".hps-black");
    white.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hps-key hps-wk";
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      wEl.appendChild(b);
    });
    black.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hps-key hps-bk";
      if (k.w != null) b.style.left = `${k.w * 100}%`;
      b.dataset.note = k.n;
      b.dataset.freq = String(k.f);
      b.title = k.n;
      bEl.appendChild(b);
    });
  }

  function syncSteps() {
    const steps = core?.currentSteps?.() || [];
    document.querySelectorAll(".hps-step").forEach((el, i) => {
      el.classList.toggle("on", !!steps[i]);
      el.classList.toggle("playhead", core?.seqOn && i === core?.seqStep);
    });
  }

  function bind() {
    document.getElementById("hps-steps")?.addEventListener("click", (ev) => {
      const step = ev.target.closest(".hps-step");
      if (!step || !core) return;
      core.toggleStep(Number(step.dataset.step));
      syncSteps();
    });
    document.getElementById("hps-piano")?.addEventListener("pointerdown", (ev) => {
      const key = ev.target.closest(".hps-key");
      if (!key || !core) return;
      ev.preventDefault();
      key.classList.add("active");
      core.playTone(parseFloat(key.dataset.freq));
    });
    document.getElementById("hps-piano")?.addEventListener("pointerup", (ev) => {
      ev.target.closest(".hps-key")?.classList.remove("active");
    });
    document.getElementById("hps-seq-play")?.addEventListener("click", () => {
      if (!core) return;
      if (core.seqOn) core.stopSeq();
      else core.startSeq();
      syncSteps();
    });
    document.getElementById("hps-seq-stop")?.addEventListener("click", () => {
      core?.stopSeq?.();
      syncSteps();
    });
    document.getElementById("hps-record")?.addEventListener("click", () => toggleRecord());
    core?.subscribe?.(() => syncSteps());
    syncSteps();
  }

  async function toggleRecord() {
    const btn = document.getElementById("hps-record");
    const lbl = document.getElementById("hps-rec-lbl");
    if (recording) {
      mediaRec?.stop();
      return;
    }
    try {
      core?.ensureAudio?.();
      const ctx = core.getAnalyser?.()?.context;
      const dest = ctx?.createMediaStreamDestination?.();
      if (!ctx || !dest) throw new Error("no audio ctx");
      const stream = dest.stream;
      chunks = [];
      mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mediaRec.onstop = () => {
        recording = false;
        btn?.classList.remove("active");
        if (lbl) lbl.textContent = "";
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `qbpm-rec-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      mediaRec.start();
      recording = true;
      btn?.classList.add("active");
      if (lbl) lbl.textContent = "rec…";
    } catch (err) {
      if (lbl) lbl.textContent = "rec unavailable";
    }
  }

  function destroy() {
    if (recording) mediaRec?.stop();
    if (host) host.innerHTML = "";
  }

  return { mount, destroy, syncSteps };
}