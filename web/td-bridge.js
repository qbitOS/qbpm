/** TouchDesigner bridge — OSC-style WebSocket · TOP feedback · comp lane export */

const TD_CH = "qbpm-td";

function tdWsUrl() {
  const P = typeof window !== "undefined" && window.QBPM_PAGES;
  if (P?.wsApi) return P.wsApi("api/td/ws");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/td/ws`;
}

export function createTdBridge(opts = {}) {
  const { onStatus, onMessage } = opts;

  let ws = null;
  let enabled = localStorage.getItem("qbpm-td-enabled") === "1";
  let reconnectTimer = null;
  const pending = [];

  function setStatus(t) {
    onStatus?.(t);
  }

  function connect() {
    const P = typeof window !== "undefined" && window.QBPM_PAGES;
    if (P?.staticShell) {
      if (!P.hasComponent?.("td")) {
        setStatus("td · disabled for this launch variant");
        return;
      }
      if (P.componentMode?.("td") === "bridge" && !P.apiBase?.()) {
        setStatus("td · set API base (api.qbitos.ai)");
        return;
      }
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(tdWsUrl());
    ws.onopen = () => {
      setStatus("td · connected");
      flush();
    };
    ws.onclose = () => {
      setStatus("td · offline");
      ws = null;
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 2500);
    };
    ws.onerror = () => setStatus("td · ws error");
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        onMessage?.(msg);
      } catch (_) {}
    };
  }

  function flush() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (pending.length) {
      ws.send(JSON.stringify(pending.shift()));
    }
  }

  function send(msg) {
    if (!enabled) return;
    const payload = { ts: performance.now(), ...msg };
    window.dispatchEvent(new CustomEvent(TD_CH, { detail: payload }));
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    else pending.push(payload);
  }

  function sendOsc(address, args = []) {
    send({ type: "osc", address, args });
  }

  function sendViz(bundle) {
    send({ type: "viz", ...bundle });
    Object.entries(bundle).forEach(([k, v]) => {
      if (typeof v === "number") sendOsc(`/qbpm/${k}`, [v]);
    });
  }

  function setEnabled(on) {
    enabled = !!on;
    localStorage.setItem("qbpm-td-enabled", enabled ? "1" : "0");
    if (enabled) connect();
    setStatus(enabled ? "td · streaming" : "td · paused");
  }

  function isEnabled() {
    return enabled;
  }

  if (enabled) connect();

  return {
    connect,
    send,
    sendOsc,
    sendViz,
    setEnabled,
    isEnabled,
    destroy() {
      clearTimeout(reconnectTimer);
      ws?.close();
      ws = null;
    },
  };
}

/** TouchDesigner-style TOP feedback renderer (2D tunnel / audio reactive). */
export function createTdTop(canvas, getAudioLevel = () => 0) {
  if (!canvas) return { tick() {}, destroy() {} };
  const ctx = canvas.getContext("2d");
  let t = 0;
  let raf = 0;
  const buf = document.createElement("canvas");
  buf.width = canvas.width;
  buf.height = canvas.height;
  const bctx = buf.getContext("2d");

  function tick() {
    const w = canvas.width;
    const h = canvas.height;
    const amp = Math.min(1, getAudioLevel() * 4);
    t += 0.02 + amp * 0.08;

    bctx.save();
    bctx.globalAlpha = 0.82;
    bctx.drawImage(buf, 0, 0);
    bctx.restore();

    const cx = w / 2;
    const cy = h / 2;
    const rings = 6;
    for (let i = 0; i < rings; i++) {
      const phase = t + i * 0.7;
      const rad = (w * 0.08 + i * w * 0.06) * (1 + Math.sin(phase) * 0.15 * amp);
      bctx.strokeStyle = `hsla(${200 + i * 18 + amp * 40}, 70%, ${45 + amp * 25}%, ${0.35 - i * 0.04})`;
      bctx.lineWidth = 1 + amp * 2;
      bctx.beginPath();
      for (let a = 0; a <= Math.PI * 2; a += 0.18) {
        const wobble = Math.sin(a * 3 + phase) * amp * 8;
        const x = cx + Math.cos(a) * (rad + wobble);
        const y = cy + Math.sin(a) * (rad * 0.72 + wobble);
        if (a === 0) bctx.moveTo(x, y);
        else bctx.lineTo(x, y);
      }
      bctx.closePath();
      bctx.stroke();
    }

    const grd = bctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
    grd.addColorStop(0, `rgba(88,166,255,${0.25 + amp * 0.35})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    bctx.fillStyle = grd;
    bctx.fillRect(0, 0, w, h);

    ctx.drawImage(buf, 0, 0);
    raf = requestAnimationFrame(tick);
  }

  raf = requestAnimationFrame(tick);

  return {
    tick,
    destroy() {
      cancelAnimationFrame(raf);
    },
    resize(w, h) {
      canvas.width = w;
      canvas.height = h;
      buf.width = w;
      buf.height = h;
    },
  };
}