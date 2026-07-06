/** Floating workspace — music lab, oscillator, blank-style video, frame-anchored chat */

import { createMusicCore } from "./music-core.js";
import { createMusicLab } from "./music-lab.js";
import { createMusicPanes } from "./music-panes.js";
import { createHeaderWaveform } from "./header-waveform.js";
import { createHeaderStage } from "./header-stage.js";
import { createFloatDock } from "./float-dock.js";
import { createProcessingWing } from "./processing-wing.js";
import { createVideoFeed } from "./video-feed.js";
import { createVideoWall } from "./video-wall.js";
import {
  formatResolveSummary,
  playUrlForResolved,
  resolveWatchUrl,
  spawnFfplay,
} from "./video-ingest.js";
import { createStrudelPane } from "./strudel-pane.js";
import { createDawLink } from "./daw-link.js";


const floatDock = createFloatDock();

export function createFloatWorkspace(opts = {}) {
  const {
    onChatSend,
    onPromptIngest,
    onIngestStatus,
    onNotePlay,
    onMusicSend,
    onOpenGrandPiano,
    getSendTargets,
    getBpm,
    getLocalHandle = () => "guest",
    getPeers = () => [],
    getCollab = () => null,
    getLocalClientId = () => "local",
    getLocalColor = () => "#58a6ff",
    getActiveWindowId = () => "main",
    getPanScale,
    getFrames,
    onJamEval,
    onWorkspaceChange,
  } = opts;

  let chatToId = "all";

  let musicCore = null;
  let musicLab = null;
  let musicPanes = null;
  let headerWaveform = null;
  let processingWing = null;
  let videoFeed = null;
  let videoWall = null;
  let strudelPane = null;
  let dawLink = null;
  let headerStage = null;
  const chatHistory = [];

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return stub();

  ensureDom(wrap);
  bindEvents();

  function stub() {
    return {
      setPeerChats() {},
      positionFramePanels() {},
      getLeftDockLayout() {},
      getVideoWall() { return null; },
      destroy() {},
    };
  }

  function positionFramePanels() {
    floatDock.layoutPanels();
  }

  function getLeftDockLayout() {
    return null;
  }

  function ensureDom(parent) {
    if (document.getElementById("float-workspace")) return;
    const root = document.createElement("div");
    root.id = "float-workspace";
    root.innerHTML = `
      <aside id="float-panel-tr" class="float-panel float-tr" aria-label="Quick chat">
        <div class="float-hd">quick chat · to / from</div>
        <div class="float-chat-route-bar">
          <label class="float-chat-field">
            <span>from</span>
            <input id="float-chat-from" type="text" readonly title="Your handle" />
          </label>
          <label class="float-chat-field">
            <span>to</span>
            <select id="float-chat-to" title="Recipient"></select>
          </label>
        </div>
        <div id="float-chat-log" class="float-chat-log" aria-live="polite"></div>
        <div class="float-chat-compose">
          <textarea id="float-chat-in" rows="4" placeholder="message… · Enter send · Shift+Enter newline" autocomplete="off" spellcheck="true"></textarea>
          <button type="button" id="float-chat-send" title="Send">↵</button>
        </div>
      </aside>
      <aside id="float-panel-bl" class="float-panel float-bl" aria-label="Music lab">
        <div class="float-hd">music lab · overview</div>
        <div id="float-music-lab-host"></div>
      </aside>
      <aside id="float-panel-grand" class="float-panel float-grand" aria-label="Grand piano">
        <div class="float-hd">grand piano · staff</div>
        <div id="float-grand-host"></div>
      </aside>
      <aside id="float-panel-mpc" class="float-panel float-mpc" aria-label="MPC pads">
        <div class="float-hd">mpc pads · 16</div>
        <div id="float-mpc-host"></div>
      </aside>
      <aside id="float-panel-beat" class="float-panel float-beat" aria-label="Beat MPC">
        <div class="float-hd">beat mpc · step map</div>
        <div id="float-beat-host"></div>
      </aside>
      <aside id="float-panel-wave" class="float-panel float-wave" aria-label="Waveform edit">
        <div class="float-hd">waveform · edit</div>
        <div id="float-wave-host"></div>
      </aside>
      <aside id="float-panel-strudel" class="float-panel float-strudel" aria-label="Strudel live code">
        <div class="float-hd">strudel · live code · projects</div>
        <div id="float-strudel-host"></div>
      </aside>
      <aside id="float-panel-br" class="float-panel float-br" aria-label="Processing wing">
        <div class="float-hd">processing · TD · bloch · eq · bus</div>
        <div id="float-processing-host"></div>
      </aside>
      <aside id="float-panel-video" class="float-panel float-video" aria-label="Video feed">
        <div class="float-hd">video · transport · ingest</div>
        <div id="float-video-host"></div>
      </aside>
      <div id="float-peer-chats" class="float-peer-chats"></div>
    `;
    parent.appendChild(root);
    floatDock.ensureRail(parent);
    floatDock.layoutPanels();
    dawLink = createDawLink({
      onStatus: (t) => processingWing?.setStatus?.(t),
      ingestLive: (payload, src) => window.qbpmLive?.ingest?.(payload, src),
      getTdBridge: () => processingWing?.getTdBridge?.(),
    });
    musicCore = createMusicCore({
      onNotePlay,
      onSend: onMusicSend,
      onJamEval,
      onDawSend: (id, payload) => dawLink?.sendToDaw?.(id, payload),
      getSendTargets: () => {
        const base = getSendTargets?.() || {};
        return { ...base, daws: dawLink?.listDaws?.() || [] };
      },
      getBpm,
      onStateChange: () => onWorkspaceChange?.(),
    });
    musicPanes = createMusicPanes(musicCore, { onOpenGrandPiano });
    strudelPane = createStrudelPane({
      onStatus: (t) => {
        processingWing?.setStatus?.(`strudel · ${t}`);
        onWorkspaceChange?.();
      },
      onJamEval,
      getBpm,
    });
    strudelPane.mount(document.getElementById("float-strudel-host"));
    musicLab = createMusicLab(musicCore, {
      onOpenGrandPiano,
      onOpenPane: (k) => floatDock.openPanel(k),
      onOpenStrudel: () => floatDock.openPanel("strudel"),
      onStrudelLoad: (url) => {
        floatDock.openPanel("strudel");
        return strudelPane.loadFrom(url);
      },
      onStrudelPlay: (code) => {
        floatDock.openPanel("strudel");
        return strudelPane.playCode(code);
      },
      onJamEval,
      onDawLink: (id) => {
        const was = dawLink?.isLinked?.(id);
        return dawLink?.linkDaw?.(id, !was);
      },
      onDawOpen: (id) => dawLink?.openDawRepo?.(id),
    });
    musicLab.mount(document.getElementById("float-music-lab-host"));
    dawLink.init().then(() => {
      musicLab?.refreshDawChips?.();
      musicLab?.refreshSendTargets?.();
    });
    musicPanes.mountGrand(document.getElementById("float-grand-host"));
    musicPanes.mountMpc(document.getElementById("float-mpc-host"));
    musicPanes.mountBeat(document.getElementById("float-beat-host"));
    musicPanes.mountWave(document.getElementById("float-wave-host"));
    headerWaveform = createHeaderWaveform(musicCore);
    headerWaveform.mount();
    processingWing = createProcessingWing();
    processingWing.mount(document.getElementById("float-processing-host"));
    videoWall = createVideoWall({
      getCollab,
      getPeers,
      getLocalClientId,
      getLocalHandle,
      getLocalColor,
      getRoomId: getActiveWindowId,
      onStatus: (t) => videoFeed?.setStatus?.(t),
      onCapacityChange: (report) => {
        videoFeed?.setStatus?.(`vwall ${report.lag.text} · ${report.total.toFixed(1)}/${report.max}`);
      },
    });
    videoWall.mountThumbStrip(document.getElementById("viz-stream-strip"));
    videoWall.setFloatDockOpen?.(() => floatDock.openPanel("video"));
    headerStage = createHeaderStage({
      getBpm,
      getAnalyser: () => musicCore?.getAnalyser?.(),
      getVideoWall: () => videoWall,
      getLocalHandle,
      getPeers,
      getRoomId: getActiveWindowId,
      onChatSend,
      onOpenVideo: () => floatDock.openPanel("video"),
      onVwallLive: () => processingWing?.setStatus?.("vwall · live"),
    });
    headerStage.mount(document.getElementById("header-stage"));
    videoFeed = createVideoFeed({
      videoWall,
      onIngestUrl: (url) => ingestWatchUrl(url),
      onStatus: (t) => onIngestStatus?.(t),
    });
    videoFeed.mount(document.getElementById("float-video-host"));
    refreshChatRoute();
    requestAnimationFrame(() => floatDock.layoutPanels());
  }

  function refreshChatRoute() {
    const fromEl = document.getElementById("float-chat-from");
    const toEl = document.getElementById("float-chat-to");
    if (fromEl) fromEl.value = getLocalHandle() || "guest";
    headerStage?.refreshChatRoute?.();

    if (!toEl) return;
    const peers = getPeers() || [];
    const prev = chatToId;
    toEl.innerHTML = `<option value="all">all · broadcast</option>${peers
      .map((p) => {
        const id = p.clientId || p.id;
        const name = p.name || id;
        return `<option value="${escapeAttr(id)}">${escapeHtml(name)}</option>`;
      })
      .join("")}`;
    if ([...toEl.options].some((o) => o.value === prev)) toEl.value = prev;
    else {
      chatToId = "all";
      toEl.value = "all";
    }
  }

  function bindEvents() {
    const sendChat = () => {
      const text = document.getElementById("float-chat-in")?.value?.trim();
      if (!text) return;
      const toEl = document.getElementById("float-chat-to");
      const to = toEl?.value || "all";
      const toName = to === "all" ? "all" : toEl?.selectedOptions?.[0]?.textContent?.trim() || to;
      chatToId = to;
      const fromName = getLocalHandle() || "guest";
      onChatSend?.({ text, to, toName, fromName });
      onWorkspaceChange?.();
      document.getElementById("float-chat-in").value = "";
    };
    document.getElementById("float-chat-send")?.addEventListener("click", sendChat);
    document.getElementById("float-chat-in")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); sendChat(); }
    });
    document.getElementById("float-chat-to")?.addEventListener("change", (ev) => {
      chatToId = ev.target.value;
    });
  }

  function appendChatLine(msg) {
    headerStage?.appendChatLine?.(msg);
    const log = document.getElementById("float-chat-log");
    if (!log) return;
    const from = msg.fromName || msg.from || "sys";
    const to = msg.toName || msg.to || "all";
    const line = document.createElement("div");
    line.className = `float-chat-line${msg.local ? " local" : ""}`;
    line.innerHTML = `
      <div class="float-chat-route">
        <span class="float-chat-from" style="color:${msg.color || "#8b949e"}">${escapeHtml(from)}</span>
        <span class="float-chat-arrow">→</span>
        <span class="float-chat-to">${escapeHtml(to)}</span>
      </div>
      <div class="float-chat-text">${escapeHtml(msg.text)}</div>`;
    log.appendChild(line);
    chatHistory.push({ from, to, text, color: msg.color, ts: Date.now() });
    while (chatHistory.length > 64) chatHistory.shift();
    while (log.children.length > 48) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
  }

  function exportState() {
    let dock = {};
    try {
      dock = JSON.parse(localStorage.getItem("qbpm-dock-v1") || "{}");
    } catch (_) {}
    return {
      dock,
      chatHistory: chatHistory.slice(-48),
      chatToId,
      musicLab: musicLab?.getState?.(),
      strudel: strudelPane?.getState?.(),
    };
  }

  function importState(s) {
    if (!s) return;
    if (s.musicLab) musicLab?.setState?.(s.musicLab);
    if (s.strudel) strudelPane?.setState?.(s.strudel);
    if (s.dock) {
      try {
        localStorage.setItem("qbpm-dock-v1", JSON.stringify(s.dock));
      } catch (_) {}
      floatDock.layoutPanels();
    }
    if (s.chatToId) {
      chatToId = s.chatToId;
      const toEl = document.getElementById("float-chat-to");
      if (toEl) toEl.value = chatToId;
    }
    if (Array.isArray(s.chatHistory)) {
      const log = document.getElementById("float-chat-log");
      if (log) log.innerHTML = "";
      chatHistory.length = 0;
      s.chatHistory.forEach((m) =>
        appendChatLine({
          fromName: m.from,
          toName: m.to,
          to: m.to,
          text: m.text,
          color: m.color,
        }),
      );
    }
  }

  function setProcessing(text) {
    processingWing?.setStatus?.(text);
  }

  function drawNotation(live) {
    musicLab?.drawNotation?.(live);
    musicPanes?.drawNotation?.(live);
  }

  function setPeerChats() {
    const layer = document.getElementById("float-peer-chats");
    if (layer) layer.innerHTML = "";
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function getVideoElement() {
    return videoFeed?.getVideoElement?.() || null;
  }

  async function ingestWatchUrl(url, opts = {}) {
    const watch = String(url || "").trim();
    if (!watch) return null;
    try {
      onIngestStatus?.(`resolving · ${watch.slice(0, 48)}…`);
      const data = await resolveWatchUrl(watch);
      const playSrc = playUrlForResolved(data);
      onIngestStatus?.(formatResolveSummary(data));
      if (playSrc && opts.play !== false) {
        floatDock.openPanel("video");
        videoFeed?.loadUrl?.(playSrc, data.streamKind === "hls" ? "hls" : "ytdlp");
        const inp = document.querySelector("#float-video-host .vid-url");
        if (inp) inp.value = watch;
      }
      return data;
    } catch (err) {
      onIngestStatus?.(`ingest error: ${err.message || err}`);
      throw err;
    }
  }

  async function ffplayWatchUrl(url) {
    const data = await spawnFfplay(url);
    onIngestStatus?.(`ffplay · ${data.streamUrl?.slice(0, 40) || "stream"}…`);
    return data;
  }

  function destroy() {
    headerWaveform?.destroy?.();
    musicLab?.destroy?.();
    musicPanes?.destroy?.();
    musicCore?.destroy?.();
    processingWing?.destroy?.();
    videoWall?.destroy?.();
    videoFeed?.destroy?.();
    headerStage?.destroy?.();
    dawLink?.destroy?.();
    strudelPane?.destroy?.();
  }

  function loadStrudelFrom(url) {
    floatDock.openPanel("strudel");
    return strudelPane?.loadFrom?.(url);
  }

  function playStrudelCode(code) {
    floatDock.openPanel("strudel");
    if (code) return strudelPane?.playCode?.(code);
    return strudelPane?.play?.();
  }

  return {
    appendChatLine,
    refreshChatRoute,
    exportState,
    importState,
    setProcessing,
    drawNotation,
    setPeerChats,
    positionFramePanels,
    getLeftDockLayout,
    getVideoElement,
    getVideoWall: () => videoWall,
    getDawLink: () => dawLink,
    getMusicTransport: () => {
      const core = musicCore;
      if (!core) return null;
      return {
        bpm: getBpm?.() || 120,
        seqOn: core.seqOn,
        seqStep: core.seqStep,
      };
    },
    ingestWatchUrl,
    ffplayWatchUrl,
    getVideoFeed: () => videoFeed,
    onRemoteVideo: (msg) => videoWall?.onRemoteVideo?.(msg),
    onVideoSignal: (msg) => videoWall?.handleSignal?.(msg),
    onVideoPresence: (peers) => videoWall?.onPresence?.(peers),
    refreshSendTargets: () => musicLab?.refreshSendTargets?.(),
    openDockPanel: (k) => floatDock.openPanel(k),
    collapseDock: () => floatDock.collapseAll(),
    loadStrudelFrom,
    playStrudelCode,
    getStrudelPane: () => strudelPane,
    destroy,
  };
}