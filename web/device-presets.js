/** Device / cluster bounding-box presets — neutral VFX comp tints */

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

export function presetById(id) {
  return DEVICE_PRESETS.find((p) => p.id === id) || DEVICE_PRESETS[4];
}

export function presetColor(id) {
  return COLORS[id] || COLORS.desktop;
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