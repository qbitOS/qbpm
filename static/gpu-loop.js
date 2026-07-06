/** ugrad-r0-style dirty RAF scheduler — one loop, GPU-friendly canvas, throttled DOM */

export function createGpuLoop() {
  let rafId = null;
  let lastDom = 0;
  const dirty = new Set();
  const tasks = new Map();

  function register(name, fn, { dom = false, domMs = 100 } = {}) {
    tasks.set(name, { fn, dom, domMs });
  }

  function mark(...names) {
    if (names.length === 0) tasks.forEach((_, k) => dirty.add(k));
    else names.forEach((n) => dirty.add(n));
    schedule();
  }

  function schedule() {
    if (rafId != null) return;
    rafId = requestAnimationFrame(tick);
  }

  function tick(now) {
    rafId = null;
    const runDom = now - lastDom >= 100;
    if (runDom) lastDom = now;

    if (dirty.has("all")) {
      dirty.clear();
      tasks.forEach((_, k) => dirty.add(k));
    }

    const batch = [...dirty];
    dirty.clear();

    for (const name of batch) {
      const t = tasks.get(name);
      if (!t) continue;
      if (t.dom && !runDom) {
        dirty.add(name);
        continue;
      }
      try {
        t.fn(now);
      } catch (_) {}
    }

    if (dirty.size) schedule();
  }

  function destroy() {
    if (rafId != null) cancelAnimationFrame(rafId);
    rafId = null;
    dirty.clear();
    tasks.clear();
  }

  return { register, mark, schedule, destroy };
}

/** Move element with transform3d (compositor layer, no layout thrash) */
export function moveLayer(el, x, y) {
  if (!el) return;
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (el._gpuX === ix && el._gpuY === iy) return;
  el._gpuX = ix;
  el._gpuY = iy;
  el.style.transform = `translate3d(${ix}px,${iy}px,0)`;
}