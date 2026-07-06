/** Floating workspace — music lab, oscillator, blank-style video, frame-anchored chat */

import { createMusicLab } from "./music-lab.js";
import { createFloatDock } from "./float-dock.js";
import { createProcessingWing } from "./processing-wing.js";
import { createVideoFeed } from "./video-feed.js";

const floatDock = createFloatDock();

export function createFloatWorkspace(opts = {}) {
  const {
    onChatSend,
    onPromptIngest,
    onNotePlay,
    onMusicSend,
    onOpenGrandPiano,
    getSendTargets,
    getBpm,
    getLocalHandle = () => "guest",
    getPeers = () => [],
    getPanScale,
    getFrames,
    onJamEval,
    onWorkspaceChange,
  } = opts;

  let chatToId = "all";

  let musicLab = null;
  let processingWing = null;
  let videoFeed = null;
  const chatHistory = [];

  const wrap = document.getElementById("canvas-wrap");
  if (!wrap) return stub();

  ensureDom(wrap);
  bindEvents();

  function stub() {
    return { setPeerChats() {}, positionFramePanels() {}, getLeftDockLayout() {}, destroy() {} };
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
        <div class="float-hd">music lab · notation</div>
        <div id="float-music-lab-host"></div>
      </aside>
      <aside id="float-panel-br" class="float-panel float-br" aria-label="Processing wing">
        <div class="float-hd">processing · bloch · eq · bus</div>
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
    musicLab = createMusicLab({
      onNotePlay,
      onSend: onMusicSend,
      onOpenGrandPiano,
      onJamEval,
      getSendTargets,
      getBpm,
    });
    musicLab.mount(document.getElementById("float-music-lab-host"));
    processingWing = createProcessingWing();
    processingWing.mount(document.getElementById("float-processing-host"));
    videoFeed = createVideoFeed({ onIngestUrl: onPromptIngest });
    videoFeed.mount(document.getElementById("float-video-host"));
    refreshChatRoute();
    requestAnimationFrame(() => floatDock.layoutPanels());
  }

  function refreshChatRoute() {
    const fromEl = document.getElementById("float-chat-from");
    const toEl = document.getElementById("float-chat-to");
    if (fromEl) fromEl.value = getLocalHandle() || "guest";

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
    };
  }

  function importState(s) {
    if (!s) return;
    if (s.musicLab) musicLab?.setState?.(s.musicLab);
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

  function destroy() {
    musicLab?.destroy?.();
    processingWing?.destroy?.();
    videoFeed?.destroy?.();
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
    openDockPanel: (k) => floatDock.openPanel(k),
    collapseDock: () => floatDock.collapseAll(),
    destroy,
  };
}