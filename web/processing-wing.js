/** Processing wing — Bloch sphere, vector scope, 12-band EQ, TD TOP/OSC bridge */

import { createTdBridge, createTdTop } from "./td-bridge.js";

const EQ_BANDS = [
  { f: 32, label: "32" },
  { f: 63, label: "63" },
  { f: 125, label: "125" },
  { f: 250, label: "250" },
  { f: 500, label: "500" },
  { f: 1000, label: "1k" },
  { f: 2000, label: "2k" },
  { f: 4000, label: "4k" },
  { f: 6000, label: "6k" },
  { f: 8000, label: "8k" },
  { f: 12000, label: "12k" },
  { f: 16000, label: "16k" },
];

const MAX_CHANNELS = 8;
const BUSSES = ["A", "B", "C"];

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createProcessingWing(opts = {}) {
  const { onStatus } = opts;

  let host = null;
  let audioCtx = null;
  let analyserL = null;
  let analyserR = null;
  let merger = null;
  let masterGain = null;
  let eqFilters = [];
  let oscNode = null;
  let oscOn = false;
  let micStream = null;
  let micSource = null;
  let raf = 0;

  let blochCanvas = null;
  let scopeCanvas = null;
  let chopCanvas = null;
  let tdTopCanvas = null;
  let blochCtx = null;
  let scopeCtx = null;
  let chopCtx = null;
  let tdTop = null;
  let tdBridge = null;
  let tdTick = 0;

  const channels = [];
  let channelSeq = 0;

  const state = {
    bloch: { theta: Math.PI * 0.35, phi: 0 },
    scope: { polarity: 0, correlation: 0 },
  };

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.85;

      eqFilters = EQ_BANDS.map((b) => {
        const f = audioCtx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = b.f;
        f.Q.value = 1.1;
        f.gain.value = 0;
        return f;
      });

      let tail = eqFilters[0];
      for (let i = 1; i < eqFilters.length; i++) {
        tail.connect(eqFilters[i]);
        tail = eqFilters[i];
      }
      const split = audioCtx.createChannelSplitter(2);
      tail.connect(split);
      tail.connect(masterGain);
      masterGain.connect(audioCtx.destination);

      analyserL = audioCtx.createAnalyser();
      analyserR = audioCtx.createAnalyser();
      analyserL.fftSize = 2048;
      analyserR.fftSize = 2048;
      analyserL.smoothingTimeConstant = 0.65;
      analyserR.smoothingTimeConstant = 0.65;
      split.connect(analyserL, 0);
      split.connect(analyserR, 1);
      merger = split;
    }
    return audioCtx;
  }

  function createChannel(label) {
    const ctx = ensureAudio();
    const id = ++channelSeq;
    const panner = ctx.createStereoPanner();
    const inGain = ctx.createGain();
    const outGain = ctx.createGain();
    const mixGain = ctx.createGain();
    const busGain = ctx.createGain();
    inGain.gain.value = 0.75;
    outGain.gain.value = 0.75;
    mixGain.gain.value = 0.65;
    busGain.gain.value = 0;
    panner.pan.value = label === "L" ? -0.5 : label === "R" ? 0.5 : 0;

    inGain.connect(panner);
    panner.connect(outGain);
    outGain.connect(mixGain);
    mixGain.connect(eqFilters[0]);
    busGain.connect(eqFilters[0]);

    const ch = {
      id,
      label,
      panner,
      inGain,
      outGain,
      mixGain,
      busGain,
      solo: false,
      sends: { A: false, B: false, C: false },
      osc: null,
      input: null,
      inVal: label === "L" || label === "R" ? 75 : 70,
      outVal: label === "L" || label === "R" ? 75 : 70,
      mixVal: 65,
      panVal: label === "L" ? -50 : label === "R" ? 50 : 0,
    };
    channels.push(ch);
    return ch;
  }

  function wireOscToChannel(ch) {
    if (!oscOn || !oscNode) return;
    try {
      ch.osc?.disconnect();
    } catch (_) {}
    ch.osc = audioCtx.createGain();
    ch.osc.gain.value = 0.22;
    oscNode.connect(ch.osc);
    ch.osc.connect(ch.inGain);
    ch.input = ch.osc;
  }

  function refreshChannelList() {
    const list = host?.querySelector(".proc-ch-strips");
    if (!list) return;
    list.innerHTML = channels
      .map((ch) => {
        const sends = BUSSES.map(
          (b) =>
            `<button type="button" class="proc-btn proc-send ${ch.sends[b] ? "active" : ""}" data-ch="${ch.id}" data-bus="${b}" title="Send ${b}">${b}</button>`
        ).join("");
        return `
        <div class="proc-ch" data-ch="${ch.id}">
          <div class="proc-ch-top">
            <span class="proc-ch-label">${ch.label}</span>
            <button type="button" class="proc-btn proc-solo ${ch.solo ? "active" : ""}" data-ch="${ch.id}" title="Solo">S</button>
            ${sends}
          </div>
          <div class="proc-sliders">
            <label class="proc-knob" title="In"><span>in</span><input type="range" min="0" max="100" value="${ch.inVal}" data-ch="${ch.id}" data-param="in" /></label>
            <label class="proc-knob" title="Out"><span>out</span><input type="range" min="0" max="100" value="${ch.outVal}" data-ch="${ch.id}" data-param="out" /></label>
            <label class="proc-knob" title="Mix"><span>mix</span><input type="range" min="0" max="100" value="${ch.mixVal}" data-ch="${ch.id}" data-param="mix" /></label>
            <label class="proc-knob proc-pan" title="Pan"><span>pan</span><input type="range" min="-100" max="100" value="${ch.panVal}" data-ch="${ch.id}" data-param="pan" /></label>
          </div>
        </div>`;
      })
      .join("");
  }

  function mount(el) {
    host = el;
    host.innerHTML = `
      <div class="proc-wing">
        <pre class="proc-status">idle</pre>
        <div class="proc-td-row">
          <div class="proc-td-top-wrap">
            <span class="proc-viz-lbl">TOP · feedback</span>
            <canvas class="proc-td-top" width="160" height="96" aria-label="TouchDesigner-style TOP"></canvas>
            <canvas class="proc-chop-strip" width="160" height="28" aria-label="CHOP waveform strip"></canvas>
          </div>
          <div class="proc-td-ctrl">
            <span class="proc-viz-lbl">touchdesigner</span>
            <button type="button" class="proc-btn proc-td-toggle" title="Stream OSC to TD">TD stream</button>
            <button type="button" class="proc-btn proc-td-connect" title="Reconnect WS">↻</button>
            <pre class="proc-td-log" id="proc-td-log">/api/td/ws</pre>
          </div>
        </div>
        <div class="proc-viz-row">
          <div class="proc-viz-box">
            <span class="proc-viz-lbl">bloch</span>
            <canvas class="proc-bloch" width="128" height="128" aria-label="Bloch sphere"></canvas>
          </div>
          <div class="proc-viz-box">
            <span class="proc-viz-lbl">diaphragm · polarity</span>
            <canvas class="proc-vectorscope" width="128" height="128" aria-label="Vector scope"></canvas>
          </div>
        </div>
        <div class="proc-eq">
          <div class="proc-eq-hd">12-band EQ <button type="button" class="proc-btn proc-eq-flat" title="Flat">flat</button></div>
          <div class="proc-eq-sliders">
            ${EQ_BANDS.map(
              (b, i) =>
                `<label class="proc-eq-band" title="${b.f} Hz"><span>${b.label}</span><input type="range" min="-12" max="12" value="0" step="0.5" data-eq="${i}" orient="vertical" /></label>`
            ).join("")}
          </div>
        </div>
        <div class="proc-channels">
          <div class="proc-ch-hd">
            <span>stereo · multi</span>
            <button type="button" class="proc-btn proc-ch-add" title="Add channel">+</button>
          </div>
          <div class="proc-ch-strips"></div>
        </div>
        <div class="proc-transport">
          <button type="button" class="proc-btn proc-osc-toggle" title="Oscillator">∿ osc</button>
          <input type="range" class="proc-osc-freq" min="55" max="1760" value="440" title="Osc frequency" />
          <span class="proc-osc-hz">440 Hz</span>
          <button type="button" class="proc-btn proc-mic-toggle" title="Mic input">🎙</button>
        </div>
        <div class="proc-master">
          <label class="proc-knob"><span>L in</span><input type="range" min="0" max="100" value="80" data-master="lin" /></label>
          <label class="proc-knob"><span>R in</span><input type="range" min="0" max="100" value="80" data-master="rin" /></label>
          <label class="proc-knob"><span>L out</span><input type="range" min="0" max="100" value="85" data-master="lout" /></label>
          <label class="proc-knob"><span>R out</span><input type="range" min="0" max="100" value="85" data-master="rout" /></label>
          <label class="proc-knob"><span>mix</span><input type="range" min="0" max="100" value="70" data-master="mix" /></label>
        </div>
      </div>`;

    blochCanvas = host.querySelector(".proc-bloch");
    scopeCanvas = host.querySelector(".proc-vectorscope");
    chopCanvas = host.querySelector(".proc-chop-strip");
    tdTopCanvas = host.querySelector(".proc-td-top");
    blochCtx = blochCanvas?.getContext("2d");
    scopeCtx = scopeCanvas?.getContext("2d");
    chopCtx = chopCanvas?.getContext("2d");

    tdBridge = createTdBridge({
      onStatus: (t) => {
        const el = host.querySelector("#proc-td-log");
        if (el) el.textContent = t;
      },
    });
    tdTop = createTdTop(tdTopCanvas, () => {
      if (!analyserL) return 0;
      const buf = new Float32Array(128);
      analyserL.getFloatTimeDomainData(buf);
      let e = 0;
      for (let i = 0; i < buf.length; i++) e += buf[i] ** 2;
      return Math.sqrt(e / buf.length);
    });

    createChannel("L");
    createChannel("R");
    refreshChannelList();
    bindEvents();
    startVizLoop();
    setStatus("processing wing · 2ch");
  }

  function bindEvents() {
    host.querySelector(".proc-ch-add")?.addEventListener("click", () => {
      if (channels.length >= MAX_CHANNELS) return;
      const n = channels.length + 1;
      createChannel(`Ch${n}`);
      refreshChannelList();
      if (oscOn) channels.forEach(wireOscToChannel);
      setStatus(`${channels.length}ch · EQ · bloch · scope`);
    });

    host.querySelector(".proc-eq-flat")?.addEventListener("click", () => {
      host.querySelectorAll(".proc-eq-band input").forEach((inp) => {
        inp.value = 0;
        const i = parseInt(inp.dataset.eq, 10);
        if (eqFilters[i]) eqFilters[i].gain.value = 0;
      });
    });

    host.querySelector(".proc-osc-toggle")?.addEventListener("click", toggleOsc);
    host.querySelector(".proc-mic-toggle")?.addEventListener("click", toggleMic);

    const tdBtn = host.querySelector(".proc-td-toggle");
    tdBtn?.classList.toggle("active", tdBridge?.isEnabled?.());
    tdBtn?.addEventListener("click", () => {
      const on = !tdBridge?.isEnabled?.();
      tdBridge?.setEnabled?.(on);
      tdBtn.classList.toggle("active", on);
      setStatus(on ? "TD stream · bloch/scope/eq" : "TD paused");
    });
    host.querySelector(".proc-td-connect")?.addEventListener("click", () => tdBridge?.connect?.());

    host.querySelector(".proc-osc-freq")?.addEventListener("input", (ev) => {
      const hz = ev.target.value;
      host.querySelector(".proc-osc-hz").textContent = `${hz} Hz`;
      if (oscNode) oscNode.frequency.value = parseFloat(hz);
    });

    host.addEventListener("input", (ev) => {
      const t = ev.target;
      if (t.dataset.eq != null) {
        const i = parseInt(t.dataset.eq, 10);
        if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(t.value);
        return;
      }
      if (t.dataset.master) {
        const v = parseFloat(t.value) / 100;
        if (t.dataset.master === "mix" && masterGain) masterGain.gain.value = v;
        if (t.dataset.master === "lin" && channels[0]) channels[0].inGain.gain.value = v;
        if (t.dataset.master === "rin" && channels[1]) channels[1].inGain.gain.value = v;
        if (t.dataset.master === "lout" && channels[0]) channels[0].outGain.gain.value = v;
        if (t.dataset.master === "rout" && channels[1]) channels[1].outGain.gain.value = v;
        return;
      }
      if (t.dataset.ch && t.dataset.param) {
        const ch = channels.find((c) => c.id === parseInt(t.dataset.ch, 10));
        if (!ch) return;
        const v = parseFloat(t.value);
        if (t.dataset.param === "in") { ch.inVal = v; ch.inGain.gain.value = v / 100; }
        if (t.dataset.param === "out") { ch.outVal = v; ch.outGain.gain.value = v / 100; }
        if (t.dataset.param === "mix") { ch.mixVal = v; if (!channels.some((c) => c.solo) || ch.solo) ch.mixGain.gain.value = v / 100; }
        if (t.dataset.param === "pan") { ch.panVal = v; ch.panner.pan.value = clamp(v / 100, -1, 1); }
      }
    });

    host.addEventListener("click", (ev) => {
      const solo = ev.target.closest(".proc-solo");
      if (solo) {
        const ch = channels.find((c) => c.id === parseInt(solo.dataset.ch, 10));
        if (!ch) return;
        ch.solo = !ch.solo;
        applySolo();
        refreshChannelList();
        return;
      }
      const send = ev.target.closest(".proc-send");
      if (send) {
        const ch = channels.find((c) => c.id === parseInt(send.dataset.ch, 10));
        if (!ch) return;
        const bus = send.dataset.bus;
        ch.sends[bus] = !ch.sends[bus];
        ch.busGain.gain.value = Object.values(ch.sends).some(Boolean) ? 0.35 : 0;
        refreshChannelList();
      }
    });
  }

  function applySolo() {
    const anySolo = channels.some((c) => c.solo);
    channels.forEach((ch) => {
      const aud = !anySolo || ch.solo;
      ch.mixGain.gain.value = aud ? ch.mixVal / 100 : 0;
    });
  }

  function toggleOsc() {
    const ctx = ensureAudio();
    const btn = host.querySelector(".proc-osc-toggle");
    if (oscOn) {
      try { oscNode?.stop(); } catch (_) {}
      oscNode = null;
      oscOn = false;
      channels.forEach((ch) => {
        try { ch.osc?.disconnect(); } catch (_) {}
        ch.osc = null;
      });
      btn?.classList.remove("active");
      setStatus("osc off");
      return;
    }
    oscNode = ctx.createOscillator();
    oscNode.type = "sine";
    oscNode.frequency.value = parseFloat(host.querySelector(".proc-osc-freq")?.value || "440");
    oscNode.start();
    oscOn = true;
    channels.forEach(wireOscToChannel);
    btn?.classList.add("active");
    setStatus("osc → channels");
  }

  async function toggleMic() {
    const btn = host.querySelector(".proc-mic-toggle");
    if (micStream) {
      micStream.getTracks().forEach((t) => t.stop());
      micStream = null;
      try { micSource?.disconnect(); } catch (_) {}
      micSource = null;
      btn?.classList.remove("active");
      setStatus("mic off");
      return;
    }
    try {
      const ctx = ensureAudio();
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micSource = ctx.createMediaStreamSource(micStream);
      const splitter = ctx.createChannelSplitter(2);
      micSource.connect(splitter);
      if (channels[0]) splitter.connect(channels[0].inGain, 0);
      if (channels[1]) splitter.connect(channels[1].inGain, 1);
      btn?.classList.add("active");
      setStatus("mic → L/R");
    } catch (err) {
      setStatus(`mic: ${err.message}`);
    }
  }

  function drawBloch(theta, phi) {
    if (!blochCtx || !blochCanvas) return;
    const w = blochCanvas.width;
    const h = blochCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w * 0.38;
    const ctx = blochCtx;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = "#30363d";
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r * Math.abs(Math.cos(a)), r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    const x = r * Math.sin(theta) * Math.cos(phi);
    const y = r * Math.sin(theta) * Math.sin(phi);
    const z = r * Math.cos(theta);
    const px = cx + x;
    const py = cy - y * 0.85 - z * 0.15;

    ctx.strokeStyle = "#58a6ff";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(px, py);
    ctx.stroke();

    const grd = ctx.createRadialGradient(px, py, 0, px, py, 8);
    grd.addColorStop(0, "#3fb950");
    grd.addColorStop(1, "#238636");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#6e7681";
    ctx.font = "8px Menlo, monospace";
    ctx.fillText("|0⟩", cx - r - 2, cy + 3);
    ctx.fillText("|1⟩", cx + r - 10, cy - r + 8);
  }

  function drawVectorScope(bufL, bufR) {
    if (!scopeCtx || !scopeCanvas) return;
    const w = scopeCanvas.width;
    const h = scopeCanvas.height;
    const ctx = scopeCtx;
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const rad = w * 0.42;
    ctx.strokeStyle = "#21262d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - rad, cy);
    ctx.lineTo(cx + rad, cy);
    ctx.moveTo(cx, cy - rad);
    ctx.lineTo(cx, cy + rad);
    ctx.stroke();

    const n = Math.min(bufL.length, bufR.length);
    let sumL = 0;
    let sumR = 0;
    let sumLR = 0;
    let sumL2 = 0;
    let sumR2 = 0;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < n; i += 4) {
      const l = bufL[i];
      const r = bufR[i];
      sumL += l;
      sumR += r;
      sumLR += l * r;
      sumL2 += l * l;
      sumR2 += r * r;
      const x = cx + l * rad;
      const y = cy - r * rad;
      const pol = l * r;
      ctx.strokeStyle = pol >= 0 ? `rgba(63,185,80,${0.15 + Math.abs(pol) * 2})` : `rgba(248,81,73,${0.15 + Math.abs(pol) * 2})`;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = pol >= 0 ? "#3fb950" : "#f85149";
      ctx.fillRect(x - 0.5, y - 0.5, 1.2, 1.2);
    }

    const denom = Math.sqrt(sumL2 * sumR2) || 1e-6;
    state.scope.correlation = sumLR / denom;
    state.scope.polarity = (sumL + sumR) / (n || 1);

    const diaW = 18 + Math.abs(state.scope.polarity) * 40;
    const diaH = 8 + Math.abs(state.scope.correlation) * 14;
    ctx.strokeStyle = state.scope.correlation >= 0 ? "#58a6ff" : "#d29922";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy + rad + 10, diaW * 0.5, diaH * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#6e7681";
    ctx.font = "7px Menlo, monospace";
    ctx.fillText(`ρ ${state.scope.correlation.toFixed(2)}`, 4, h - 4);
  }

  function sampleAudio() {
    if (!analyserL || !analyserR) return;
    const bufL = new Float32Array(analyserL.fftSize);
    const bufR = new Float32Array(analyserR.fftSize);
    analyserL.getFloatTimeDomainData(bufL);
    analyserR.getFloatTimeDomainData(bufR);

    let eL = 0;
    let eR = 0;
    let cross = 0;
    for (let i = 0; i < bufL.length; i++) {
      eL += bufL[i] ** 2;
      eR += bufR[i] ** 2;
      cross += bufL[i] * bufR[i];
    }
    const amp = Math.sqrt((eL + eR) / (2 * bufL.length));
    const phase = Math.atan2(cross, eL - eR + 1e-9);
    state.bloch.theta = clamp(Math.PI * amp * 3.2, 0.08, Math.PI - 0.08);
    state.bloch.phi = phase;

    drawBloch(state.bloch.theta, state.bloch.phi);
    drawVectorScope(bufL, bufR);
    drawChopStrip(bufL);
    streamTd(bufL, bufR);
  }

  function drawChopStrip(bufL) {
    if (!chopCtx || !chopCanvas) return;
    const w = chopCanvas.width;
    const h = chopCanvas.height;
    chopCtx.fillStyle = "#010409";
    chopCtx.fillRect(0, 0, w, h);
    chopCtx.strokeStyle = "#58a6ff";
    chopCtx.lineWidth = 1;
    chopCtx.beginPath();
    const step = Math.max(1, Math.floor(bufL.length / w));
    for (let x = 0; x < w; x++) {
      const i = x * step;
      const y = h / 2 - bufL[i] * (h * 0.42);
      if (x === 0) chopCtx.moveTo(x, y);
      else chopCtx.lineTo(x, y);
    }
    chopCtx.stroke();
  }

  function streamTd(bufL, bufR) {
    if (!tdBridge?.isEnabled?.()) return;
    tdTick += 1;
    if (tdTick % 3 !== 0) return;
    let peak = 0;
    for (let i = 0; i < bufL.length; i += 8) {
      peak = Math.max(peak, Math.abs(bufL[i]), Math.abs(bufR[i]));
    }
    const eq = eqFilters.map((f) => f.gain.value);
    tdBridge.sendViz({
      bloch_theta: state.bloch.theta,
      bloch_phi: state.bloch.phi,
      scope_corr: state.scope.correlation,
      scope_pol: state.scope.polarity,
      peak,
      channels: channels.length,
    });
    tdBridge.sendOsc("/qbpm/bloch/theta", state.bloch.theta);
    tdBridge.sendOsc("/qbpm/bloch/phi", state.bloch.phi);
    tdBridge.sendOsc("/qbpm/scope/corr", state.scope.correlation);
    tdBridge.sendOsc("/qbpm/audio/peak", peak);
    eq.forEach((g, i) => tdBridge.sendOsc(`/qbpm/eq/${EQ_BANDS[i].label}`, g));
  }

  function startVizLoop() {
    const tick = () => {
      sampleAudio();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function setStatus(text) {
    const el = host?.querySelector(".proc-status");
    if (el) el.textContent = text;
    onStatus?.(text);
  }

  function destroy() {
    cancelAnimationFrame(raf);
    tdTop?.destroy?.();
    tdBridge?.destroy?.();
    if (oscNode) try { oscNode.stop(); } catch (_) {}
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    if (audioCtx) audioCtx.close();
    audioCtx = null;
    channels.length = 0;
  }

  return { mount, setStatus, destroy, getTdBridge: () => tdBridge };
}