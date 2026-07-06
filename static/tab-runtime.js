/**
 * Background tab runtime — keep audio/sequencer alive, pause visual loops, trim video decode RAM.
 * Ported patterns: grok-cli hardStop / FPS cap, grok_play Theatre dormancy, qbpm gpu-loop.
 */

let singleton = null;

export function getTabRuntime() {
  if (!singleton) singleton = createTabRuntime();
  return singleton;
}

export function createTabRuntime() {
  let visible = typeof document === "undefined" || document.visibilityState === "visible";
  let audioSession = false;
  let wakeLock = null;
  const visualLoops = new Map();
  const audioCtxSet = new Set();
  const pausedByTab = new WeakMap();

  function isVisible() {
    return visible;
  }

  async function acquireWakeLock() {
    if (!navigator.wakeLock?.request || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } catch (_) { /* ignore */ }
  }

  async function releaseWakeLock() {
    try { await wakeLock?.release(); } catch (_) { /* ignore */ }
    wakeLock = null;
  }

  async function resumeAllAudioContexts() {
    for (const ctx of audioCtxSet) {
      if (ctx?.state === "suspended") {
        try { await ctx.resume(); } catch (_) { /* ignore */ }
      }
    }
  }

  function registerAudioContext(ctx) {
    if (ctx) audioCtxSet.add(ctx);
  }

  function unregisterAudioContext(ctx) {
    if (ctx) audioCtxSet.delete(ctx);
  }

  /** Mark transport/sequencer active — keeps AudioContext resumed when tab hidden */
  function setAudioSession(active) {
    audioSession = !!active;
    if (audioSession) {
      resumeAllAudioContexts();
      if (visible) acquireWakeLock();
    } else {
      releaseWakeLock();
    }
  }

  function registerVisualLoop(id, { start, stop } = {}) {
    visualLoops.set(id, { start, stop, running: false });
    if (visible) startLoop(id);
  }

  function unregisterVisualLoop(id) {
    stopLoop(id);
    visualLoops.delete(id);
  }

  function startLoop(id) {
    const loop = visualLoops.get(id);
    if (!loop || loop.running) return;
    loop.running = true;
    loop.start?.();
  }

  function stopLoop(id) {
    const loop = visualLoops.get(id);
    if (!loop?.running) return;
    loop.running = false;
    loop.stop?.();
  }

  function pauseOffscreenVideos() {
    document.querySelectorAll("video").forEach((v) => {
      if (v.dataset.qbpmKeepAlive === "1") return;
      if (v.closest(".vid-stage") && audioSession) return;
      if (pausedByTab.has(v)) return;
      pausedByTab.set(v, { paused: v.paused, srcObject: v.srcObject });
      try { v.pause(); } catch (_) { /* ignore */ }
      if (v.dataset.qbpmThumbVid === "1") {
        v.removeAttribute("src");
        v.srcObject = null;
      }
    });
  }

  function restoreOffscreenVideos() {
    document.querySelectorAll("video").forEach((v) => {
      const prev = pausedByTab.get(v);
      if (!prev) return;
      if (prev.srcObject && !v.srcObject) v.srcObject = prev.srcObject;
      if (!prev.paused) v.play().catch(() => {});
      pausedByTab.delete(v);
    });
  }

  function onVisibilityChange() {
    const nowVisible = document.visibilityState === "visible";
    if (nowVisible === visible) return;
    visible = nowVisible;
    if (visible) {
      resumeAllAudioContexts();
      if (audioSession) acquireWakeLock();
      visualLoops.forEach((_, id) => startLoop(id));
      restoreOffscreenVideos();
      window.dispatchEvent(new CustomEvent("qbpm-tab-visible"));
    } else {
      visualLoops.forEach((_, id) => stopLoop(id));
      pauseOffscreenVideos();
      if (!audioSession) releaseWakeLock();
      window.dispatchEvent(new CustomEvent("qbpm-tab-hidden"));
    }
  }

  const unlock = () => resumeAllAudioContexts();
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("pointerdown", unlock, { passive: true });
    document.addEventListener("keydown", unlock, { passive: true });
    setInterval(() => {
      if (audioSession) resumeAllAudioContexts();
    }, 12000);
  }

  return {
    isVisible,
    setAudioSession,
    registerAudioContext,
    unregisterAudioContext,
    resumeAllAudioContexts,
    registerVisualLoop,
    unregisterVisualLoop,
    destroy() {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
      }
      visualLoops.forEach((_, id) => stopLoop(id));
      visualLoops.clear();
      releaseWakeLock();
      singleton = null;
    },
  };
}