/**
 * qbpm live music bridge — JAX/Python/JSON/Repel/WASM ingest fan-in.
 * WS api/live/ws · POST api/live/ingest · BroadcastChannel qbpm-live
 */

import {
  bridgeComponentEnabled,
  fetchApiJson,
  getPages,
  resetBridgeReconnect,
  resolveApiUrl,
  scheduleBridgeReconnect,
  waitForBridgeReady,
} from "./api-bridge.js";

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
  let reconnectState = {};
  let bc = null;
  let pianoIngestTimer = null;
  let started = false;

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
    if (!bridgeComponentEnabled("live")) {
      onEvent({ type: "local" });
      return;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    try {
      ws = new WebSocket(wsUrl());
    } catch (_) {
      onEvent({ type: "error", local: true });
      return;
    }
    ws.onopen = () => {
      resetBridgeReconnect(reconnectState);
      onEvent({ type: "open" });
    };
    ws.onclose = () => {
      ws = null;
      onEvent({ type: "close" });
      scheduleBridgeReconnect("live", connect, reconnectState);
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

  function start() {
    if (started) return;
    started = true;
    waitForBridgeReady().then((ok) => {
      if (ok) connect();
      else onEvent({ type: "local" });
    });
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

  listenBroadcast();
  if (typeof window !== "undefined") {
    if (window.QBPM_PAGES?.launchReady?.()) start();
    else window.addEventListener("qbpm-launch-ready", start, { once: true });
  }

  return {
    connect: start,
    ingest,
    get socket() {
      return ws;
    },
    close() {
      clearTimeout(reconnectState.timer);
      clearTimeout(pianoIngestTimer);
      bc?.close();
      ws?.close();
    },
  };
}