/**
 * qbpm live music bridge — JAX/Python/JSON/Repel/WASM ingest fan-in.
 * WS /api/live/ws · POST /api/live/ingest · BroadcastChannel qbpm-live
 */

const LIVE_CH = "qbpm-live";
const KBATCH_CH = "kbatch-keyboard-data";

function wsUrl() {
  const P = typeof window !== "undefined" && window.QBPM_PAGES;
  if (P?.wsApi) return P.wsApi("api/live/ws");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/live/ws`;
}

export function createLiveMusicBridge(opts = {}) {
  const onState = opts.onState || (() => {});
  const onEvent = opts.onEvent || (() => {});
  let ws = null;
  let reconnectTimer = null;
  let bc = null;

  function handlePayload(msg) {
    const state = msg.state || msg;
    onState(state);
    onEvent(msg);
    window.dispatchEvent(new CustomEvent("qbpm-live", { detail: msg }));
    try {
      bc?.postMessage(msg);
    } catch (_) {
      /* ignore */
    }
  }

  function connect() {
    const P = typeof window !== "undefined" && window.QBPM_PAGES;
    if (P?.staticShell) {
      if (!P.hasComponent?.("live")) return;
      if (P.componentMode?.("live") === "bridge" && !P.apiBase?.()) return;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl());
    ws.onopen = () => onEvent({ type: "open" });
    ws.onclose = () => {
      onEvent({ type: "close" });
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connect, 2000);
    };
    ws.onerror = () => onEvent({ type: "error" });
    ws.onmessage = (ev) => {
      try {
        handlePayload(JSON.parse(ev.data));
      } catch (_) {
        /* ignore */
      }
    };
  }

  async function ingest(payload, source = "qbpm") {
    const res = await fetch(`/api/live/ingest?source=${encodeURIComponent(source)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    handlePayload(data);
    return data;
  }

  function listenBroadcast() {
    if (typeof BroadcastChannel === "undefined") return;
    bc = new BroadcastChannel(LIVE_CH);
    bc.onmessage = (ev) => handlePayload(ev.data || {});

    const kb = new BroadcastChannel(KBATCH_CH);
    kb.onmessage = (ev) => {
      const d = ev.data || {};
      ingest(
        {
          text: d.text,
          flow: d.flow,
          musica: d.musica,
          bpm: d.bpm,
          blocks: d.blocks,
          stack: d.stack,
        },
        "kbatch-bc",
      ).catch(() => {});
    };
  }

  connect();
  listenBroadcast();

  return {
    connect,
    ingest,
    get socket() {
      return ws;
    },
    close() {
      clearTimeout(reconnectTimer);
      bc?.close();
      ws?.close();
    },
  };
}