/** Static shell ↔ remote API bridge — resolve URLs, safe JSON, component gates */

export function getPages() {
  return typeof window !== "undefined" ? window.QBPM_PAGES : null;
}

export function isBridgeOnline() {
  const P = getPages();
  if (!P?.staticShell) return true;
  return P.bridgeOnline === true;
}

export function resolveApiUrl(path) {
  const P = getPages();
  const rel = String(path || "").replace(/^\//, "");
  if (!isBridgeOnline()) return null;
  if (P?.api) {
    const url = P.api(rel);
    if (url) return url;
  }
  if (P?.staticShell) return null;
  return `/${rel}`;
}

export function bridgeComponentEnabled(name) {
  const P = getPages();
  if (!P) return true;
  if (!P.staticShell) return true;
  if (!P.hasComponent?.(name)) return false;
  const mode = P.componentMode?.(name);
  if (mode === "bridge") {
    if (P.bridgeOnline === false) return false;
    if (P.bridgeOnline == null) return false;
    const base = P.apiBase?.() || P.defaultApiBase;
    return !!base;
  }
  return mode === "on" || mode === true || !!mode;
}

export function componentApiEnabled(name) {
  return bridgeComponentEnabled(name);
}

export function waitForBridgeReady(timeoutMs = 10000) {
  const P = getPages();
  if (!P?.staticShell || P.bridgeOnline != null) {
    return Promise.resolve(isBridgeOnline());
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = (online) => {
      if (done) return;
      done = true;
      resolve(!!online);
    };
    const onStatus = (ev) => finish(ev.detail?.online);
    window.addEventListener("qbpm-bridge-status", onStatus, { once: true });
    setTimeout(() => finish(P?.bridgeOnline !== false), timeoutMs);
  });
}

export function scheduleBridgeReconnect(key, fn, state = {}) {
  const P = getPages();
  if (!P?.staticShell || P.bridgeOnline === false) return;
  state.attempts = (state.attempts || 0) + 1;
  if (state.attempts > 6) return;
  const delay = Math.min(30000, 2500 * Math.pow(1.6, state.attempts - 1));
  clearTimeout(state.timer);
  state.timer = setTimeout(fn, delay);
}

export function resetBridgeReconnect(state) {
  if (!state) return;
  state.attempts = 0;
  clearTimeout(state.timer);
}

export async function fetchApiJson(url, options = {}) {
  if (!url) return { ok: false, local: true, error: "no-api" };
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    return { ok: false, local: true, error: err.message || "fetch-failed" };
  }
  const text = await res.text();
  if (!text) return { ok: res.ok, status: res.status, empty: true };
  try {
    const data = JSON.parse(text);
    if (!res.ok) return { ...data, ok: false, status: res.status };
    return { ...data, ok: true, status: res.status };
  } catch {
    return {
      ok: false,
      status: res.status,
      error: "non-json",
      hint: text.trimStart().startsWith("<") ? "html-response" : "parse-error",
    };
  }
}