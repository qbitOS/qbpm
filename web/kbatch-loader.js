/** Lazy-load kbatch tool panel into qbpm right panel */

let kbatchMounted = false;

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
}

export function ensureKbatchPanel() {
  const frame = frameEl();
  if (!frame) return;
  if (!frame.src || frame.src === "about:blank") {
    frame.src = "/tools/kbatch/kbatch-qbpm.html?qbpm=1";
  }
  frame.classList.add("loading");
  setStatus("loading…");
}

export function reloadKbatchPanel() {
  const frame = frameEl();
  if (!frame) return;
  kbatchMounted = false;
  const base = "/tools/kbatch/kbatch-qbpm.html?qbpm=1";
  frame.src = `${base}&t=${Date.now()}`;
  setStatus("reloading…");
}

export function openKbatchFull() {
  window.open("/tools/kbatch/kbatch.html?qbpm=1", "_blank", "noopener");
}

export function initKbatchLoader() {
  const frame = frameEl();
  if (!frame) return;

  frame.addEventListener("load", () => {
    frame.classList.remove("loading");
    if (frame.contentWindow?.kbatch) {
      kbatchMounted = true;
      setStatus("● live");
    }
  });

  window.addEventListener("message", (ev) => {
    const data = ev.data || {};
    if (data.source !== "kbatch-qbpm") return;
    if (data.type === "ready") {
      kbatchMounted = true;
      setStatus("● ready");
    }
  });

  document.getElementById("btn-kbatch-reload")?.addEventListener("click", reloadKbatchPanel);
  document.getElementById("btn-kbatch-full")?.addEventListener("click", openKbatchFull);
  document.getElementById("btn-kbatch-focus")?.addEventListener("click", () => {
    frame.contentWindow?.postMessage({ type: "qbpm-focus-input" }, "*");
    frame.focus();
  });
}