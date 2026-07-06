/**
 * qbpm tools hub — piano, jam hub, blank-ingest, imagine, vwall, grok-pipe
 * (kbatch lives on its own tab — see kbatch-panel.js)
 */

import { ensurePianoPanel } from "./piano/piano-loader.js";

const COLLAPSE_KEY = "qbpm-tools-collapse";

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
  return id === "jam-hub";
}

function setToolStatus(id, text, ok = true) {
  const el = document.querySelector(`.tool-section[data-tool="${id}"] .tool-status`);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("active", ok);
  el.classList.toggle("error", !ok);
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
  if (id === "jam-hub") {
    setToolStatus(id, "● jam", true);
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

async function renderJamHub(accordion) {
  const jam = buildSection("jam-hub", {
    label: "live jam hub",
    category: "collab · strudel · TD · DAW refs",
  });
  const body = jam.querySelector(".tool-section-body");
  body.innerHTML = `<p class="jam-hub-loading">loading ecosystem…</p>`;
  accordion.append(jam);

  let eco = { tools: [], stacks: {} };
  try {
    const jamUrl = (typeof window !== "undefined" && window.QBPM_PAGES?.asset)
      ? window.QBPM_PAGES.asset("jam-ecosystem.json")
      : "/static/jam-ecosystem.json";
    const res = await fetch(jamUrl, { cache: "no-store" });
    if (res.ok) eco = await res.json();
  } catch (_) {}

  const stacks = Object.entries(eco.stacks || {})
    .map(([k, v]) => `<span class="jam-stack-tag">${k}: ${(v || []).join(" · ")}</span>`)
    .join("");
  const links = (eco.tools || [])
    .slice(0, 32)
    .map(
      (t) =>
        `<a class="jam-eco-link" href="${t.repo}" target="_blank" rel="noopener" title="${t.role || ""}">${t.label}</a>`,
    )
    .join("");

  body.innerHTML = `
    <p class="jam-hub-mission">${eco.mission || "mass collaboration live jam"}</p>
    <div class="jam-hub-stacks">${stacks}</div>
    <p class="jam-hub-hint">◎ dock rail · ♪ music lab · () strudel flare · send → nodes/users · comp lanes</p>
    <div class="jam-eco-grid">${links}</div>
  `;
}

function renderBuiltinSections(accordion) {
  renderJamHub(accordion);
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
    document.querySelectorAll("#tools-accordion .tool-section").forEach((s) => {
      s.classList.add("open");
      collapseState[s.dataset.tool] = true;
      onSectionOpen(s.dataset.tool, toolsCatalog.find((t) => t.id === s.dataset.tool) || {}, s);
    });
    saveCollapseState();
  });
  document.getElementById("tools-collapse-all")?.addEventListener("click", () => {
    document.querySelectorAll("#tools-accordion .tool-section").forEach((s) => {
      s.classList.remove("open");
      collapseState[s.dataset.tool] = false;
    });
    saveCollapseState();
  });
}

function openAccordionTool(id, opts = {}) {
  const section = document.querySelector(`#tools-accordion .tool-section[data-tool="${id}"]`);
  if (!section) return false;
  section.classList.add("open");
  collapseState[id] = true;
  saveCollapseState();
  onSectionOpen(id, toolsCatalog.find((t) => t.id === id) || {}, section);
  return true;
}

export async function initToolsPanel() {
  loadCollapseState();
  const accordion = document.getElementById("tools-accordion");
  if (!accordion) return;

  if (!toolsPanelReady) {
    try {
    const toolsApi = (typeof window !== "undefined" && window.QBPM_PAGES?.api)
      ? window.QBPM_PAGES.api("api/tools")
      : "/api/tools";
    if (toolsApi) {
      const res = await fetch(toolsApi);
      const data = await res.json();
      toolsCatalog = data.tools || [];
    } else {
      const toolsUrl = (typeof window !== "undefined" && window.QBPM_PAGES?.toolsJson)
        ? window.QBPM_PAGES.toolsJson()
        : "/static/tools.json";
      const res = await fetch(toolsUrl);
      toolsCatalog = (await res.json()).tools || [];
    }
  } catch (_) {
    toolsCatalog = [];
  }
    accordion.innerHTML = "";
    renderBuiltinSections(accordion);
    renderApiTools(accordion);
    bindToolbar();
    toolsPanelReady = true;
  }

  document.querySelectorAll("#tools-accordion .tool-section.open").forEach((section) => {
    const id = section.dataset.tool;
    onSectionOpen(id, toolsCatalog.find((t) => t.id === id) || {}, section);
  });

  window.qbpmTools = window.qbpmTools || {};
  window.qbpmTools.openAccordionTool = openAccordionTool;
}

export function ensureToolsPanel() {
  initToolsPanel().catch(() => {});
}