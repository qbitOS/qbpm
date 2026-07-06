/** Lazy-load full kbatch into qbpm tools panel */

let kbatchMounted = false;

const KBATCH_EMBED = "/tools/kbatch/kbatch.html?qbpm=1";

function frameEl() {
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

export function ensureKbatchPanel(tab) {
  const frame = frameEl();
  if (!frame) return;
  const base = tab ? `${KBATCH_EMBED}&tab=${encodeURIComponent(tab)}` : KBATCH_EMBED;
  if (!frame.src || frame.src === "about:blank") {
    frame.src = base;
  }
  frame.classList.add("loading");
  setStatus("loading kbatch…");
}

export function reloadKbatchPanel(tab) {
  const frame = frameEl();
  if (!frame) return;
  kbatchMounted = false;
  const base = tab ? `${KBATCH_EMBED}&tab=${encodeURIComponent(tab)}` : KBATCH_EMBED;
  frame.src = `${base}&t=${Date.now()}`;
  setStatus("reloading…");
}

export function openKbatchFull(tab) {
  const url = tab ? `${KBATCH_EMBED}&tab=${encodeURIComponent(tab)}` : KBATCH_EMBED;
  window.open(url, "_blank", "noopener");
}

export function initKbatchLoader() {
  const frame = frameEl();
  if (!frame || frame.dataset.bound === "1") return;
  frame.dataset.bound = "1";

  frame.addEventListener("load", () => {
    frame.classList.remove("loading");
    if (frame.contentWindow?.kbatch) {
      kbatchMounted = true;
      setStatus("● kbatch");
    }
  });

  document.getElementById("btn-kbatch-reload")?.addEventListener("click", () => {
    const tab = document.getElementById("kbatch-tab-select")?.value;
    reloadKbatchPanel(tab);
  });
  document.getElementById("btn-kbatch-full")?.addEventListener("click", () => {
    const tab = document.getElementById("kbatch-tab-select")?.value;
    openKbatchFull(tab);
  });
  document.getElementById("btn-kbatch-focus")?.addEventListener("click", () => {
    frame.contentWindow?.postMessage({ type: "qbpm-focus-input" }, "*");
    frame.focus();
  });
}