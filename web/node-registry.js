/** Node types · typed ports · studio/music/live breakouts */

export const PORT_TYPES = {
  audio: { color: "#3fb950", label: "♪" },
  midi: { color: "#bc8cff", label: "midi" },
  video: { color: "#79c0ff", label: "▶" },
  clock: { color: "#d29922", label: "⏱" },
  data: { color: "#8b949e", label: "data" },
  control: { color: "#6e7681", label: "ctl" },
};

export const NODE_DEFS = {
  "core.clock": { w: 168, h: 64, section: "music", in: ["clock"], out: ["clock", "midi"] },
  "core.output": { w: 168, h: 64, section: "music", in: ["audio", "data", "video"], out: [] },
  "music.clock": { w: 168, h: 64, section: "music", in: ["midi"], out: ["clock", "midi"] },
  "music.score": { w: 180, h: 88, section: "music", waveform: true, in: ["midi", "clock"], out: ["midi", "audio"] },
  "music.piano": { w: 200, h: 96, section: "music", waveform: true, in: ["midi", "clock"], out: ["midi", "audio"] },
  "music.beatpad": { w: 180, h: 88, section: "music", waveform: true, in: ["clock", "midi"], out: ["midi", "audio"] },
  "music.loop": { w: 180, h: 88, section: "music", waveform: true, in: ["audio", "clock"], out: ["audio", "midi"] },
  "music.notation": { w: 200, h: 96, section: "music", in: ["midi"], out: ["midi", "data"] },
  "music.eq": { w: 168, h: 80, section: "music", waveform: true, in: ["audio"], out: ["audio"] },
  "music.code": { w: 200, h: 96, section: "music", in: ["midi", "clock"], out: ["midi", "audio", "data"] },
  "music.waveform": { w: 200, h: 72, section: "music", waveform: true, in: ["audio"], out: ["audio", "data"] },
  "audio.mic": { w: 156, h: 80, section: "percussion", waveform: true, in: ["control"], out: ["audio"] },
  "studio.session": { w: 220, h: 88, section: "percussion", in: ["audio", "midi", "video", "clock"], out: ["audio", "midi", "video", "data"] },
  "live.ingest": { w: 200, h: 72, section: "video", in: ["video", "data"], out: ["video"] },
  "live.transport": { w: 180, h: 64, section: "video", in: ["video", "clock"], out: ["video", "control"] },
  "live.rail": { w: 200, h: 72, section: "video", in: ["video"], out: ["video"] },
  "live.vwall": { w: 200, h: 72, section: "video", in: ["video"], out: ["video"] },
  "live.queue": { w: 180, h: 64, section: "video", in: ["video", "data"], out: ["video"] },
  "live.video": { w: 200, h: 72, section: "video", in: ["video"], out: ["video"] },
  "python.exec": { w: 168, h: 64, section: "compute", in: ["data", "clock"], out: ["data"] },
  "python.jax": { w: 168, h: 64, section: "compute", in: ["data"], out: ["data"] },
};

export function nodeDef(type) {
  if (NODE_DEFS[type]) return NODE_DEFS[type];
  if (type?.startsWith("live.")) return NODE_DEFS["live.rail"];
  if (type?.startsWith("music.")) return { w: 180, h: 80, section: "music", waveform: true, in: ["midi"], out: ["audio"] };
  if (type?.startsWith("audio.")) return NODE_DEFS["audio.mic"];
  return { w: 168, h: 64, section: "graph", in: ["data"], out: ["data"] };
}

export function nodeSize(n) {
  const d = nodeDef(n?.type);
  return { w: d.w || 168, h: d.h || 64 };
}

export function hasWaveform(n) {
  return !!nodeDef(n?.type).waveform;
}

export function portsCompatible(outType, inType) {
  if (!outType || !inType) return true;
  if (outType === inType) return true;
  if (outType === "data" || inType === "data") return true;
  if (outType === "control" || inType === "control") return true;
  if (outType === "midi" && inType === "clock") return true;
  if (outType === "clock" && inType === "midi") return true;
  return false;
}

export function portTypeForNode(n, side, portId = "main") {
  const d = nodeDef(n?.type);
  if (portId === "+" || portId === "-" || portId === "0") return "control";
  const list = side === "in" ? d.in : d.out;
  if (!list?.length) return side === "in" ? "data" : "data";
  if (portId === "main") return list[0];
  return list.includes(portId) ? portId : list[0];
}

export function defaultNodeData(type) {
  if (type === "music.code") return { lang: "strudel", code: 's("bd sd")' };
  if (type === "music.eq") return { bands: { low: 0, mid: 0, high: 0 } };
  if (type === "music.loop") return { bars: 4, bpm: 120 };
  if (type === "music.beatpad") return { pattern: { pads: { main: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] } } };
  if (type === "live.queue") return { queue: [], playhead: 0 };
  if (type === "live.transport") return { playing: false, loop: true };
  if (type === "live.vwall") return { layout: "grid", pins: [] };
  if (type === "live.rail") return { urls: [], features: ["rail"] };
  if (type === "live.ingest") return { urls: [], ingestUrl: "" };
  if (type?.startsWith("audio.mic") || type === "audio.mic") return { mic: "snare-top", gain: 0, pan: 0 };
  if (type === "studio.session") return { preset: "underoath-gillespie", bpm: 148 };
  return undefined;
}

export function defaultNodeCode(type) {
  if (type?.startsWith("live.")) {
    return JSON.stringify(defaultNodeData(type) || { urls: [] }, null, 2);
  }
  if (type === "music.code") return 's("bd*4, sd*2")';
  return 'result = {"hello": "qbpm"}';
}