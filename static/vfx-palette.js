/** Natron / Nuke / OTOY-style neutral comp palette — no full-canvas blue wash */

export const VFX = {
  bg: "#0a0b0d",
  grid: "#14161a",
  gridMajor: "#1c1f24",
  compStroke: "#484f58",
  compStrokeActive: "#9ca3af",
  compHeader: "rgba(22, 24, 28, 0.92)",
  compFill: "rgba(72, 79, 88, 0.04)",
  compFillActive: "rgba(120, 128, 140, 0.06)",
  crosshair: "rgba(168, 173, 182, 0.62)",
  crosshairFade: "rgba(168, 173, 182, 0.12)",
  text: "#b1bac4",
  textDim: "#6e7681",
  accent: "#8b949e",
  lanes: {
    prompt: { color: "#9ca3af", glyph: "◉" },
    video: { color: "#a8b0bc", glyph: "▶" },
    audio: { color: "#7d8590", glyph: "♪" },
    midi: { color: "#6e7681", glyph: "𝄞" },
    collab: { color: "#8b949e", glyph: "⊕" },
  },
};

const DEVICE_TINT = {
  phone: "rgba(110,118,129,0.05)",
  tablet: "rgba(110,118,129,0.05)",
  "ar-vr": "rgba(130,130,140,0.06)",
  mini: "rgba(100,108,118,0.05)",
  desktop: "rgba(72,79,88,0.05)",
  server: "rgba(90,96,106,0.06)",
  iot: "rgba(80,86,94,0.05)",
  watch: "rgba(80,86,94,0.05)",
  cluster: "rgba(110,118,129,0.07)",
};

export function compFillForDevice(device) {
  return DEVICE_TINT[device] || VFX.compFill;
}

export function laneColor(lane) {
  return VFX.lanes[lane]?.color || VFX.accent;
}

/** Comp window ports — VFX + DAW in/out lanes (Nuke-style) */
export function framePipelinePorts(rect) {
  const { x, y, w, h } = rect;
  return [
    { id: "in", lane: "prompt", side: "in", label: "in◉", x, y },
    { id: "in-a", lane: "audio", side: "in", label: "in♪", x, y: y + 22 },
    { id: "in-midi", lane: "midi", side: "in", label: "midi", x, y: y + h - 10 },
    { id: "out-v", lane: "video", side: "out", label: "out▶", x: x + w, y },
    { id: "out-a", lane: "audio", side: "out", label: "out♪", x: x + w, y: y + h },
    { id: "out-midi", lane: "midi", side: "out", label: "𝄞out", x: x + w, y: y + h * 0.5 },
  ];
}

export function normalizeLegacyFrameColor(color) {
  if (!color) return null;
  const c = String(color).toLowerCase();
  if (c.includes("58a6ff") || c.includes("79c0ff") || c.includes("3fb95022") || c.includes("bc8cff")) {
    return null;
  }
  return color;
}