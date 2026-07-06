/**
 * qbpm tools hub — collapsible sections; kbatch = full keyboard batch app
 */

import { ensureKbatchPanel, initKbatchLoader } from "./kbatch-loader.js";
import { ensurePianoPanel } from "./piano/piano-loader.js";

const COLLAPSE_KEY = "qbpm-tools-collapse";

/** All kbatch tabs (keyboard batch tool surface) */
export const KBATCH_TABS = [
  { id: "analyzer", label: "Analyzer" },
  { id: "layouts", label: "Layouts" },
  { id: "dictionary", label: "Dictionary" },
  { id: "quantum", label: "Quantum" },
  { id: "training", label: "Training" },
  { id: "capsules", label: "Capsules" },
  { id: "contrails", label: "Contrails" },
  { id: "musica", label: "Musica" },
  { id: "symbollab", label: "Symbols" },
  { id: "lattice", label: "Lattice" },
];

let toolsCatalog = [];
let collapseState = {};
let mountedIframes = new Set();
let toolsPanelReady = false;

function loadCollapseState() {
  try {
    collapseState = JSON.parse(localStorage.getItem(COLLAPSE_KEY) || "{}");
  } catch (_) {
    collapseState = {};
  }
}

function saveCollapseState() {
  try {
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapseState));
  } catch (_) { /* ignore */ }
}

function defaultExpanded(id) {
  if (collapseState[id] !== undefined) return collapseState[id];
  return id === "kbatch";
}

function setToolStatus(id, text, ok = true) {
  const el = document.querySelector(`.tool-section[data-tool="${id}"] .tool-status`);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("active", ok);
  el.classList.toggle("error", !ok);
}

function kbatchFrame() {
  return document.getElementById("kbatch-frame");
}

function switchKbatchTab(tab) {
  kbatchFrame()?.contentWindow?.postMessage({ type: "qbpm-switch-tab", tab }, "*");
  setToolStatus("kbatch", `● ${tab}`, true);
}

function mountToolIframe(section, url) {
  if (!url || mountedIframes.has(url)) return;
  const body = section.querySelector(".tool-section-body");
  if (!body || body.querySelector("iframe")) return;
  const iframe = document.createElement("iframe");
  iframe.className = "tool-iframe";
  iframe.title = section.dataset.tool || "tool";
  iframe.loading = "lazy";
  iframe.src = url;
  body.appendChild(iframe);
  mountedIframes.add(url);
}

function buildSection(id, meta) {
  const label = meta.label || id;
  const category = meta.category || meta.role || "tool";
  const expanded = defaultExpanded(id);
  const section = document.createElement("div");
  section.className = `tool-section${expanded ? " open" : ""}`;
  section.dataset.tool = id;
  section.dataset.category = category;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "tool-section-head";
  head.innerHTML = `
    <span class="tool-chevron" aria-hidden="true">▸</span>
    <span class="tool-label">${label}</span>
    <span class="tool-cat">${category}</span>
    <span class="tool-status">●</span>
  `;

  const actions = document.createElement("span");
  actions.className = "tool-section-actions";
  if (meta.url) {
    const full = document.createElement("button");
    full.type = "button";
    full.className = "tool-act";
    full.title = "Open full";
    full.textContent = "⤢";
    full.addEventListener("click", (ev) => {
      ev.stopPropagation();
      window.open(meta.url + (meta.url.includes("?") ? "&" : "?") + "qbpm=1", "_blank", "noopener");
    });
    actions.appendChild(full);
  }
  head.appendChild(actions);

  const body = document.createElement("div");
  body.className = "tool-section-body";

  head.addEventListener("click", () => {
    section.classList.toggle("open");
    collapseState[id] = section.classList.contains("open");
    saveCollapseState();
    if (section.classList.contains("open")) onSectionOpen(id, meta, section);
  });

  section.append(head, body);
  return section;
}

function onSectionOpen(id, meta, section) {
  if (id === "kbatch") {
    ensureKbatchPanel();
    setToolStatus(id, "● kbatch", true);
    return;
  }
  if (id === "piano") {
    const host = section.querySelector("#piano-panel-body");
    if (host) {
      ensurePianoPanel().catch((err) => {
        if (host) host.textContent = `piano error: ${err}`;
        setToolStatus(id, "● error", false);
      });
    }
    return;
  }
  const embed = meta.embed || meta.url;
  if (embed) mountToolIframe(section, embed);
}

function renderKbatchSection(accordion, meta) {
  const kbatch = buildSection("kbatch", {
    label: "kbatch",
    category: "keyboard batch",
    url: meta.url || "/tools/kbatch/kbatch.html",
  });
  const body = kbatch.querySelector(".tool-section-body");
  const tabOptions = KBATCH_TABS.map(
    (t) => `<option value="${t.id}">${t.label}</option>`,
  ).join("");

  body.innerHTML = `
    <div class="kbatch-toolbar">
      <span class="kbatch-toolbar-title">keyboard batch</span>
      <span id="kbatch-status" class="live-status">● idle</span>
      <label class="kbatch-tab-pick">tab
        <select id="kbatch-tab-select" title="kbatch tab">
          ${tabOptions}
        </select>
      </label>
      <button type="button" id="btn-kbatch-focus" title="Focus typing input">⌨</button>
      <button type="button" id="btn-kbatch-reload" title="Reload kbatch">↻</button>
      <button type="button" id="btn-kbatch-full" title="Open kbatch full window">⤢</button>
    </div>
    <p class="kbatch-tools-hint">analyzer · layouts · dictionary · quantum · training · capsules · contrails · musica · symbols · lattice · code cell · terminal</p>
    <iframe id="kbatch-frame" class="kbatch-frame tool-embed-frame" title="kbatch — keyboard batch" loading="lazy"></iframe>
  `;

  accordion.append(kbatch);

  document.getElementById("kbatch-tab-select")?.addEventListener("change", (ev) => {
    switchKbatchTab(ev.target.value);
  });
}

function renderBuiltinSections(accordion) {
  const kbatchMeta = toolsCatalog.find((t) => t.id === "kbatch") || {};
  renderKbatchSection(accordion, kbatchMeta);

  const piano = buildSection("piano", { label: "Piano Buddy", category: "live-music" });
  piano.querySelector(".tool-section-body").innerHTML =
    '<div id="piano-panel-body" class="piano-panel-body">expand to load piano…</div>';
  accordion.append(piano);
}

function renderApiTools(accordion) {
  for (const tool of toolsCatalog) {
    if (tool.id === "kbatch" || tool.id === "piano") continue;
    const section = buildSection(tool.id, {
      label: tool.label || tool.id,
      category: tool.category || tool.role || "tool",
      url: tool.url,
      embed: tool.embed,
    });
    accordion.append(section);
  }
}

function bindToolbar() {
  document.getElementById("tools-expand-all")?.addEventListener("click", () => {
    document.querySelectorAll(".tool-section").forEach((s) => {
      s.classList.add("open");
      collapseState[s.dataset.tool] = true;
      onSectionOpen(s.dataset.tool, toolsCatalog.find((t) => t.id === s.dataset.tool) || {}, s);
    });
    saveCollapseState();
  });
  document.getElementById("tools-collapse-all")?.addEventListener("click", () => {
    document.querySelectorAll(".tool-section").forEach((s) => {
      s.classList.remove("open");
      collapseState[s.dataset.tool] = false;
    });
    saveCollapseState();
  });
}

export async function initToolsPanel() {
  if (toolsPanelReady) {
    document.querySelectorAll(".tool-section.open").forEach((section) => {
      const id = section.dataset.tool;
      if (id === "kbatch") ensureKbatchPanel();
    });
    return;
  }

  loadCollapseState();
  const accordion = document.getElementById("tools-accordion");
  if (!accordion) return;

  try {
    const res = await fetch("/api/tools");
    const data = await res.json();
    toolsCatalog = data.tools || [];
  } catch (_) {
    toolsCatalog = [];
  }

  accordion.innerHTML = "";
  renderBuiltinSections(accordion);
  renderApiTools(accordion);
  bindToolbar();
  initKbatchLoader();

  document.querySelectorAll(".tool-section.open").forEach((section) => {
    const id = section.dataset.tool;
    const meta = toolsCatalog.find((t) => t.id === id) || {};
    onSectionOpen(id, meta, section);
  });

  if (!window._qbpmKbatchMsgBound) {
    window._qbpmKbatchMsgBound = true;
    window.addEventListener("message", (ev) => {
      const data = ev.data || {};
      if (data.source !== "kbatch-qbpm") return;
      if (data.type === "ready") setToolStatus("kbatch", "● kbatch", true);
      if (data.type === "pattern-mode") setToolStatus("kbatch", `● ${data.mode}`, true);
    });
  }

  window.qbpmTools = window.qbpmTools || {};
  window.qbpmTools.openTool = (id, opts = {}) => {
    if (id === "pattern-flow") id = "kbatch";
    const section = document.querySelector(`.tool-section[data-tool="${id}"]`);
    if (!section) return;
    section.classList.add("open");
    collapseState[id] = true;
    saveCollapseState();
    onSectionOpen(id, toolsCatalog.find((t) => t.id === id) || {}, section);
    if (id === "kbatch" && opts.tab) {
      setTimeout(() => switchKbatchTab(opts.tab), 300);
    }
  };
  window.qbpmTools.switchKbatchTab = switchKbatchTab;
  window.qbpmTools.setPatternMode = (mode) => {
    switchKbatchTab("contrails");
    kbatchFrame()?.contentWindow?.postMessage({ type: "qbpm-pattern-mode", mode }, "*");
  };

  toolsPanelReady = true;
}

export function ensureToolsPanel() {
  initToolsPanel().catch(() => {});
}