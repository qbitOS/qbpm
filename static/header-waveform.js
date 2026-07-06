/** Page-top spectrum bar — mirrors music lab waveform */

import { drawSpectrum } from "./music-core.js";
import { getTabRuntime } from "./tab-runtime.js";

export function createHeaderWaveform(core) {
  let canvas = null;
  let raf = 0;
  let stopped = false;

  function mount() {
    const host = document.getElementById("header-waveform");
    if (!host || host.querySelector("canvas")) return;
    canvas = document.createElement("canvas");
    canvas.id = "header-waveform-canvas";
    canvas.setAttribute("aria-label", "Live audio spectrum");
    host.appendChild(canvas);
    resize();
    window.addEventListener("resize", resize);
    getTabRuntime().registerVisualLoop("header-waveform", {
      start: () => loop(),
      stop: () => { cancelAnimationFrame(raf); raf = 0; },
    });
    loop();
  }

  function resize() {
    if (!canvas) return;
    const host = document.getElementById("header-waveform");
    const w = host?.clientWidth || window.innerWidth;
    const h = host?.clientHeight || 32;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }

  function loop() {
    if (stopped) return;
    core?.ensureAudio?.();
    drawSpectrum(canvas, core?.getAnalyser?.(), { barW: 3, color: "#6e7681" });
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