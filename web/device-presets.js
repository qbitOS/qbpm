/** Device / cluster bounding-box presets for canvas frames */

export const DEVICE_PRESETS = [
  { id: "phone", label: "Phone", icon: "📱", w: 390, h: 844, cluster: "edge" },
  { id: "tablet", label: "Tablet", icon: "📲", w: 834, h: 1194, cluster: "edge" },
  { id: "ar-vr", label: "AR/VR", icon: "🥽", w: 1920, h: 1080, cluster: "immersive" },
  { id: "mini", label: "Mini PC", icon: "🧩", w: 1280, h: 720, cluster: "edge" },
  { id: "desktop", label: "Desktop", icon: "🖥", w: 1920, h: 1080, cluster: "local" },
  { id: "server", label: "Server", icon: "🗄", w: 2400, h: 1400, cluster: "compute" },
  { id: "iot", label: "IoT", icon: "📡", w: 320, h: 240, cluster: "iot" },
  { id: "watch", label: "Wearable", icon: "⌚", w: 198, h: 242, cluster: "iot" },
  { id: "cluster", label: "Cluster", icon: "⊞", w: 3200, h: 2000, cluster: "compute" },
];

const COLORS = {
  phone: "#58a6ff22",
  tablet: "#79c0ff22",
  "ar-vr": "#bc8cff22",
  mini: "#3fb95022",
  desktop: "#58a6ff33",
  server: "#d2992222",
  iot: "#f8514922",
  watch: "#ffa65722",
  cluster: "#8b949e22",
};

export function presetById(id) {
  return DEVICE_PRESETS.find((p) => p.id === id) || DEVICE_PRESETS[4];
}

export function presetColor(id) {
  return COLORS[id] || "#58a6ff22";
}

export function nextDeviceFrameRect(preset, existingFrames, origin = { x: 0, y: 0 }) {
  const gap = 80;
  let x = origin.x;
  let y = origin.y;
  const same = existingFrames.filter((f) => f.device === preset.id);
  if (same.length) {
    const last = same[same.length - 1];
    const [lx, ly, lw] = last.rect;
    x = lx + lw + gap;
    y = ly;
  }
  return [x, y, preset.w, preset.h];
}