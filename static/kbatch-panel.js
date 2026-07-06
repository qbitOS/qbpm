/**
 * qbpm kbatch tab — full keyboard batch (same-origin embed, all tabs/tools)
 */

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

function kbatchSrc() {
  return (typeof window !== "undefined" && window.QBPM_PAGES?.kbatchSrc)
    || "/tools/kbatch/kbatch.html?qbpm=1";
}

let bound = false;
let mounted = false;

function frame() {
  return document.getElementById("kbatch-frame");
}

function statusEl() {
  return document.getElementById("kbatch-status");
}

function setStatus(text, ok = true) {
  const el = statusEl();
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", !ok);
  el.classList.toggle("active", ok);
}

export function switchKbatchTab(tab) {
  frame()?.contentWindow?.postMessage({ type: "qbpm-switch-tab", tab }, "*");
  const sel = document.getElementById("kbatch-tab-select");
  if (sel && tab) sel.value = tab;
  setStatus(`● ${tab || "kbatch"}`, true);
}

export function ensureKbatchPanel(tab) {
  const f = frame();
  if (!f) return;
  const src = kbatchSrc();
  const base = tab ? `${src}&tab=${encodeURIComponent(tab)}` : src;
  if (!f.src || f.src === "about:blank") {
    f.src = base;
  }
  f.classList.add("loading");
  setStatus("loading kbatch…");
}

export function reloadKbatchPanel() {
  const f = frame();
  if (!f) return;
  mounted = false;
  const tab = document.getElementById("kbatch-tab-select")?.value;
  const src = kbatchSrc();
  const base = tab ? `${src}&tab=${encodeURIComponent(tab)}` : src;
  f.src = `${base}&t=${Date.now()}`;
  setStatus("reloading…");
}

export function openKbatchFull() {
  const tab = document.getElementById("kbatch-tab-select")?.value;
  const src = kbatchSrc();
  const url = tab ? `${src}&tab=${encodeURIComponent(tab)}` : src;
  window.open(url, "_blank", "noopener");
}

function bindControls() {
  if (bound) return;
  bound = true;

  const f = frame();
  if (!f) return;

  f.addEventListener("load", () => {
    f.classList.remove("loading");
    if (f.contentWindow?.kbatch) {
      mounted = true;
      setStatus("● kbatch");
    }
  });

  document.getElementById("kbatch-tab-select")?.addEventListener("change", (ev) => {
    switchKbatchTab(ev.target.value);
  });
  document.getElementById("btn-kbatch-reload")?.addEventListener("click", reloadKbatchPanel);
  document.getElementById("btn-kbatch-full")?.addEventListener("click", openKbatchFull);
  document.getElementById("btn-kbatch-focus")?.addEventListener("click", () => {
    f.contentWindow?.postMessage({ type: "qbpm-focus-input" }, "*");
    f.focus();
  });

  if (!window._qbpmKbatchPanelMsg) {
    window._qbpmKbatchPanelMsg = true;
    window.addEventListener("message", (ev) => {
      const data = ev.data || {};
      if (data.source !== "kbatch-qbpm") return;
      if (data.type === "ready") {
        mounted = true;
        setStatus("● kbatch");
        if (data.tab) {
          const sel = document.getElementById("kbatch-tab-select");
          if (sel) sel.value = data.tab;
        }
      }
      if (data.type === "tab") setStatus(`● ${data.tab}`, true);
    });
  }
}

export function initKbatchPanel() {
  bindControls();
  ensureKbatchPanel();
}

/** Open kbatch tab from prompt search / graph nodes / API */
export function openKbatchTool(opts = {}) {
  window.qbpm?.setRightPanelTab?.("kbatch");
  initKbatchPanel();
  if (opts.tab) {
    setTimeout(() => switchKbatchTab(opts.tab), 250);
  }
}

export function registerQbpmTools() {
  window.qbpmTools = window.qbpmTools || {};
  window.qbpmTools.openTool = (id, opts = {}) => {
    if (id === "kbatch" || id === "pattern-flow") {
      openKbatchTool(opts);
      return;
    }
    window.qbpm?.setRightPanelTab?.("tools");
    import("./tools-panel.js").then((m) => {
      m.initToolsPanel().then(() => {
        window.qbpmTools.openAccordionTool?.(id, opts);
      });
    });
  };
  window.qbpmTools.switchKbatchTab = switchKbatchTab;
  window.qbpmTools.setPatternMode = (mode) => {
    openKbatchTool({ tab: "contrails" });
    setTimeout(() => {
      frame()?.contentWindow?.postMessage({ type: "qbpm-pattern-mode", mode }, "*");
    }, 300);
  };
}