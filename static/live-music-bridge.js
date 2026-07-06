/**
 * qbpm live music bridge — JAX/Python/JSON/Repel/WASM ingest fan-in.
 * WS api/live/ws · POST api/live/ingest · BroadcastChannel qbpm-live
 */

import { componentApiEnabled, fetchApiJson, getPages, resolveApiUrl } from "./api-bridge.js";

const LIVE_CH = "qbpm-live";
const KBATCH_CH = "kbatch-keyboard-data";

function wsUrl() {
  const P = getPages();
  if (P?.wsApi) return P.wsApi("api/live/ws");
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/api/live/ws`;
}

function localStateFromPayload(payload, source) {
  return {
    bpm: payload.bpm ?? payload.cpm,
    cpm: payload.cpm ?? payload.bpm,
    musica: payload.musica,
    flow: payload.flow ?? payload.text,
    flare: payload.flare,
    text: payload.text,
    source,
    ...payload,
  };
}

export function createLiveMusicBridge(opts = {}) {
  const onState = opts.onState || (() => {});
  const onEvent = opts.onEvent || (() => {});
  let ws = null;
  let reconnectTimer = null;
  let bc = null;
  let pianoIngestTimer = null;

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
    if (!componentApiEnabled("live")) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    ws = new WebSocket(wsUrl());
    ws.onopen = () => onEvent({ type: "open" });
    ws.onclose = () => {
      onEvent({ type: "close" });
      clearTimeout(reconnectTimer);
      if (componentApiEnabled("live")) {
        reconnectTimer = setTimeout(connect, 2000);
      }
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

  async function ingestNow(payload, source = "qbpm") {
    const url = resolveApiUrl(`api/live/ingest?source=${encodeURIComponent(source)}`);
    if (!url) {
      const state = localStateFromPayload(payload, source);
      const msg = { state, local: true, source };
      handlePayload(msg);
      return msg;
    }
    const data = await fetchApiJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (data.ok === false && (data.local || data.error)) {
      const state = localStateFromPayload(payload, source);
      const msg = { state, local: true, source, bridgeError: data.error };
      handlePayload(msg);
      return msg;
    }
    handlePayload(data);
    return data;
  }

  function ingest(payload, source = "qbpm") {
    if (source === "piano") {
      return new Promise((resolve) => {
        clearTimeout(pianoIngestTimer);
        pianoIngestTimer = setTimeout(() => {
          ingestNow(payload, source).then(resolve);
        }, 220);
      });
    }
    return ingestNow(payload, source);
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
  if (typeof window !== "undefined") {
    window.addEventListener("qbpm-launch-ready", () => connect());
  }

  return {
    connect,
    ingest,
    get socket() {
      return ws;
    },
    close() {
      clearTimeout(reconnectTimer);
      clearTimeout(pianoIngestTimer);
      bc?.close();
      ws?.close();
    },
  };
}