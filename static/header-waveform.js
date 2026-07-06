/** Page-top spectrum bar — structure chart behind waveform */

import { drawSpectrum } from "./music-core.js";
import { getTabRuntime } from "./tab-runtime.js";
import { drawStructureChart } from "./notation-chart.js";
import { resolveTransportTheory } from "./music-theory.js";

export function createHeaderWaveform(core, opts = {}) {
  const { getTheory = () => null, getMusicTransport = () => null } = opts;
  let canvas = null;
  let structCanvas = null;
  let raf = 0;
  let stopped = false;

  function mount() {
    const stack = document.getElementById("header-waveform-stack");
    const host = document.getElementById("header-waveform");
    if (!stack || !host) return;
    if (!structCanvas) {
      structCanvas = document.createElement("canvas");
      structCanvas.id = "header-structure-chart";
      structCanvas.className = "header-structure-chart";
      structCanvas.setAttribute("aria-hidden", "true");
      stack.insertBefore(structCanvas, host);
    }
    if (!host.querySelector("#header-waveform-canvas")) {
      canvas = document.createElement("canvas");
      canvas.id = "header-waveform-canvas";
      canvas.setAttribute("aria-label", "Live audio spectrum");
      host.appendChild(canvas);
    } else {
      canvas = host.querySelector("#header-waveform-canvas");
    }
    resize();
    window.addEventListener("resize", resize);
    getTabRuntime().registerVisualLoop("header-waveform", {
      start: () => loop(),
      stop: () => { cancelAnimationFrame(raf); raf = 0; },
    });
    loop();
  }

  function resize() {
    const stack = document.getElementById("header-waveform-stack");
    const w = stack?.clientWidth || window.innerWidth;
    const h = stack?.clientHeight || 40;
    const dpr = window.devicePixelRatio || 1;
    [structCanvas, canvas].forEach((c) => {
      if (!c) return;
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    });
  }

  function loop() {
    if (stopped) return;
    core?.ensureAudio?.();
    const theory = getTheory?.() || {};
    const transport = resolveTransportTheory({
      musicTransport: { ...getMusicTransport?.(), theory },
    });
    drawStructureChart(structCanvas, theory, transport);
    drawSpectrum(canvas, core?.getAnalyser?.(), { barW: 3, color: "#8b949e", alpha: 0.9, transparent: true });
    raf = requestAnimationFrame(loop);
  }

  function destroy() {
    stopped = true;
    cancelAnimationFrame(raf);
    getTabRuntime().unregisterVisualLoop("header-waveform");
    window.removeEventListener("resize", resize);
  }

  return { mount, destroy };
}