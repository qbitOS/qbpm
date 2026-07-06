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
    getPanScale,
    getFrames,
    onJamEval,
  } = opts;

  let musicLab = null;
  let processingWing = null;
  let videoFeed = null;

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
      <aside id="float-panel-tr" class="float-panel float-tr" aria-label="Chat">
        <div class="float-hd">chat</div>
        <div id="float-chat-log" class="float-chat-log"></div>
        <div class="float-chat-row">
          <input id="float-chat-in" type="text" placeholder="quick chat…" autocomplete="off" enterkeyhint="send" />
          <button type="button" id="float-chat-send">↵</button>
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
    requestAnimationFrame(() => floatDock.layoutPanels());
  }

  function bindEvents() {
    const sendChat = () => {
      const text = document.getElementById("float-chat-in")?.value?.trim();
      if (!text) return;
      onChatSend?.(text);
      document.getElementById("float-chat-in").value = "";
    };
    document.getElementById("float-chat-send")?.addEventListener("click", sendChat);
    document.getElementById("float-chat-in")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); sendChat(); }
    });

  }

  function appendChatLine(msg) {
    const log = document.getElementById("float-chat-log");
    if (!log) return;
    const who = msg.fromName || msg.from || "sys";
    const line = document.createElement("div");
    line.className = "float-chat-line";
    line.innerHTML = `<span class="float-chat-who" style="color:${msg.color || "#8b949e"}">${escapeHtml(who)}</span> ${escapeHtml(msg.text)}`;
    log.appendChild(line);
    while (log.children.length > 24) log.firstChild?.remove();
    log.scrollTop = log.scrollHeight;
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