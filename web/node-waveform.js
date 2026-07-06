/** Mini waveform strip inside audio/music nodes */

export function drawNodeWaveform(ctx, r, n, scale = 1, samples) {
  if (!ctx || !r) return;
  const px = (v) => v / Math.max(0.05, scale);
  const pad = px(8);
  const top = r.y + px(38);
  const h = Math.max(px(10), r.h - px(48));
  const w = r.w - pad * 2;
  const x = r.x + pad;

  ctx.save();
  ctx.fillStyle = "#0a0d12";
  ctx.fillRect(x, top, w, h);
  ctx.strokeStyle = "#21262d";
  ctx.lineWidth = px(1);
  ctx.strokeRect(x, top, w, h);

  const data = samples || synthWave(n);
  ctx.strokeStyle = n.type?.startsWith("audio.") ? "#f0883e" : "#58a6ff";
  ctx.lineWidth = px(1.2);
  ctx.beginPath();
  for (let i = 0; i < data.length; i++) {
    const tx = x + (i / (data.length - 1)) * w;
    const ty = top + h * 0.5 - data[i] * h * 0.42;
    if (i === 0) ctx.moveTo(tx, ty);
    else ctx.lineTo(tx, ty);
  }
  ctx.stroke();

  const mic = n.data?.mic || n.params?.mic;
  if (mic) {
    ctx.fillStyle = "#6e7681";
    ctx.font = `${px(7)}px Menlo, monospace`;
    ctx.fillText(mic, x + px(2), top + h - px(2));
  }
  ctx.restore();
}

function synthWave(n) {
  const seed = (n.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const out = new Float32Array(48);
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    out[i] = Math.sin(t * Math.PI * 6 + seed * 0.1) * 0.35 + Math.sin(t * Math.PI * 19) * 0.12;
  }
  return out;
}