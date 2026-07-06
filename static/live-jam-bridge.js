/** Live jam — Strudel-lite () flare, collab pattern sync, TD-style routing */

const JAM_CH = "qbpm-jam";

/** Minimal pattern tokens: s 'bd' hh, note c4, () accent flare */
export function parseJamPattern(src) {
  const text = String(src || "").trim();
  if (!text) return { musica: "", flare: [], steps: [] };
  const flare = [];
  const re = /\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(text))) flare.push({ at: m.index, text: m[1].trim() });
  const stripped = text.replace(re, " ").replace(/\s+/g, " ").trim();
  const steps = [];
  const drumRe = /s\s+['"]([^'"]+)['"]/gi;
  let dm;
  while ((dm = drumRe.exec(stripped))) {
    dm[1].split(/\s+/).forEach((s, i) => steps.push({ type: "drum", sound: s, step: i % 16 }));
  }
  const noteRe = /([a-g][#b]?\d)/gi;
  const notes = [];
  let nm;
  while ((nm = noteRe.exec(stripped))) notes.push(nm[1]);
  return {
    musica: notes.join(" ") || stripped,
    flare,
    steps,
    raw: text,
    bpm: null,
  };
}

export function createLiveJamBridge(opts = {}) {
  const {
    onPattern,
    onCollabJam,
    getCollab,
    ingest,
  } = opts;

  let bc = null;

  function publish(pattern) {
    const msg = { type: "jam", t: performance.now(), pattern };
    onPattern?.(pattern);
    try {
      bc?.postMessage(msg);
    } catch (_) {}
    ingest?.(pattern, "jam");
    return pattern;
  }

  function sendCollab(pattern) {
    const c = getCollab?.();
    if (c?.sendJam) c.sendJam(pattern);
    onCollabJam?.(pattern);
    return publish(pattern);
  }

  function listen() {
    if (typeof BroadcastChannel === "undefined") return;
    bc = new BroadcastChannel(JAM_CH);
    bc.onmessage = (ev) => {
      const d = ev.data || {};
      if (d.type === "jam" && d.pattern) onPattern?.(d.pattern);
    };
  }

  function evalAndPlay(src, bpm = 120) {
    const pattern = parseJamPattern(src);
    pattern.bpm = bpm;
    return sendCollab(pattern);
  }

  listen();

  return {
    parseJamPattern,
    publish,
    sendCollab,
    evalAndPlay,
    close() {
      bc?.close();
    },
  };
}