/** DJ / scratch spot — loop, splice, quick FX in header play strip row */

import { getTabRuntime } from "./tab-runtime.js";

const FX_HTML = `
  <label title="LFO depth"><span>lfo</span><input type="range" class="djs-knob" data-fx="lfo" min="0" max="100" value="0" /></label>
  <label title="Envelope"><span>env</span><input type="range" class="djs-knob" data-fx="env" min="0" max="100" value="50" /></label>
  <label title="Pan"><span>pan</span><input type="range" class="djs-knob" data-fx="pan" min="-100" max="100" value="0" /></label>
  <label title="Warp rate"><span>warp</span><input type="range" class="djs-knob" data-fx="warp" min="50" max="200" value="100" /></label>
  <label title="Echo"><span>echo</span><input type="range" class="djs-knob" data-fx="echo" min="0" max="100" value="0" /></label>
  <label title="Delay"><span>dly</span><input type="range" class="djs-knob" data-fx="delay" min="0" max="100" value="0" /></label>`;

export function createDjScratchSpot(core, opts = {}) {
  const { onCollabPatch } = opts;

  let host = null;
  let waveCanvas = null;
  let raf = 0;
  let stopped = false;
  let loopA = 0.12;
  let loopB = 0.88;
  let playhead = 0;
  let dragging = null;
  let spliceRegions = [];

  function mount(el) {
    const playStrip = el || document.getElementById("header-play-strip");
    host = playStrip?.querySelector(".hps-inner");
    if (!host || host.querySelector(".djs-inner")) return;

    const inner = document.createElement("div");
    inner.className = "djs-inner";
    inner.setAttribute("role", "region");
    inner.setAttribute("aria-label", "Scratch loop splice");
    inner.innerHTML = `
      <canvas class="djs-wave" aria-label="Waveform loop region"></canvas>
      <div class="djs-tools">
        <button type="button" class="djs-btn" data-act="loop" title="Toggle loop">↻</button>
        <button type="button" class="djs-btn" data-act="splice" title="Splice at playhead">✂</button>
        <button type="button" class="djs-btn" data-act="clear" title="Clear splices">✕</button>
      </div>`;

    const fx = document.createElement("div");
    fx.className = "djs-fx";
    fx.setAttribute("aria-label", "Quick FX");
    fx.innerHTML = FX_HTML;

    host.appendChild(inner);
    host.appendChild(fx);

    waveCanvas = inner.querySelector(".djs-wave");
    bind();
    resize();
    window.addEventListener("resize", resize);
    getTabRuntime().registerVisualLoop("dj-scratch-spot", {
      start: () => loop(),
      stop: () => { cancelAnimationFrame(raf); raf = 0; },
    });
    loop();
  }

  function bind() {
    host?.querySelectorAll(".djs-knob").forEach((inp) => {
      inp.addEventListener("input", () => {
        const fx = inp.dataset.fx;
        const v = parseFloat(inp.value);
        const patch = {};
        if (fx === "pan") patch.pan = v / 100;
        else if (fx === "warp") patch.warp = v / 100;
        else if (fx === "env") patch.env = v / 100;
        else if (fx === "lfo") patch.lfo = v / 100;
        else if (fx === "echo") patch.echo = v / 100;
        else if (fx === "delay") patch.delay = v / 100;
        core?.setScratchFx?.(patch);
        onCollabPatch?.({ scratchFx: core?.getScratchFx?.() });
      });
    });

    host?.querySelectorAll(".djs-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "loop") btn.classList.toggle("active");
        else if (act === "splice") spliceAtPlayhead();
        else if (act === "clear") { spliceRegions = []; drawWave(); }
      });
    });

    waveCanvas?.addEventListener("pointerdown", (ev) => {
      const rect = waveCanvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) / rect.width;
      const nearA = Math.abs(x - loopA) < 0.04;
      const nearB = Math.abs(x - loopB) < 0.04;
      dragging = nearA ? "a" : nearB ? "b" : "scratch";
      if (dragging === "scratch") playhead = x;
      waveCanvas.setPointerCapture(ev.pointerId);
      drawWave();
    });
    waveCanvas?.addEventListener("pointermove", (ev) => {
      if (!dragging) return;
      const rect = waveCanvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      if (dragging === "a") loopA = Math.min(x, loopB - 0.04);
      else if (dragging === "b") loopB = Math.max(x, loopA + 0.04);
      else {
        playhead = x;
        core?.setScratchFx?.({ warp: 0.75 + Math.abs(x - 0.5) * 1.5 });
      }
      drawWave();
    });
    waveCanvas?.addEventListener("pointerup", () => { dragging = null; });
  }

  function spliceAtPlayhead() {
    spliceRegions.push({ at: playhead, t: Date.now() });
    if (spliceRegions.length > 8) spliceRegions.shift();
    onCollabPatch?.({ splice: spliceRegions.slice() });
    drawWave();
  }

  function resize() {
    if (!waveCanvas) return;
    const inner = host?.querySelector(".djs-inner");
    const w = inner?.clientWidth || 160;
    const h = inner?.clientHeight || 44;
    const dpr = window.devicePixelRatio || 1;
    waveCanvas.width = Math.floor(w * dpr);
    waveCanvas.height = Math.floor(h * dpr);
    waveCanvas.style.width = `${w}px`;
    waveCanvas.style.height = `${h}px`;
    drawWave();
  }

  function drawWave() {
    if (!waveCanvas) return;
    const ctx = waveCanvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = waveCanvas.width / dpr;
    const h = waveCanvas.height / dpr;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0a0d12";
    ctx.fillRect(0, 0, w, h);

    const data = core?.getTimeDomainWave?.(128) || new Float32Array(128).fill(0);
    const top = 4;
    const bh = h - top - 6;
    ctx.strokeStyle = "#58a6ff";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = (i / (data.length - 1)) * w;
      const y = top + bh * 0.5 - data[i] * bh * 0.42;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const ax = loopA * w;
    const bx = loopB * w;
    ctx.fillStyle = "rgba(88, 166, 255, 0.12)";
    ctx.fillRect(ax, top, bx - ax, bh);
    ctx.strokeStyle = "#3fb950";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, top);
    ctx.lineTo(ax, top + bh);
    ctx.stroke();
    ctx.strokeStyle = "#f0883e";
    ctx.beginPath();
    ctx.moveTo(bx, top);
    ctx.lineTo(bx, top + bh);
    ctx.stroke();

    const ph = playhead * w;
    ctx.strokeStyle = "#f85149";
    ctx.beginPath();
    ctx.moveTo(ph, top);
    ctx.lineTo(ph, top + bh);
    ctx.stroke();

    spliceRegions.forEach((s) => {
      const sx = s.at * w;
      ctx.strokeStyle = "#d29922";
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(sx, top);
      ctx.lineTo(sx, top + bh);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    if (host?.querySelector('[data-act="loop"]')?.classList.contains("active")) {
      playhead += 0.004;
      if (playhead > loopB) playhead = loopA;
    }
  }

  function loop() {
    if (stopped) return;
    drawWave();
    raf = requestAnimationFrame(loop);
  }

  function applyRemote(patch) {
    if (!patch) return;
    if (patch.scratchFx) core?.setScratchFx?.(patch.scratchFx);
    if (Array.isArray(patch.splice)) spliceRegions = patch.splice.slice();
  }

  function destroy() {
    stopped = true;
    cancelAnimationFrame(raf);
    getTabRuntime().unregisterVisualLoop("dj-scratch-spot");
    window.removeEventListener("resize", resize);
    host?.querySelector(".djs-inner")?.remove();
    host?.querySelector(".djs-fx")?.remove();
    host = null;
  }

  return { mount, applyRemote, destroy };
}