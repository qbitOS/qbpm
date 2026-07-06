/** Static shell ↔ remote API bridge — resolve URLs, safe JSON, component gates */

export function getPages() {
  return typeof window !== "undefined" ? window.QBPM_PAGES : null;
}

export function resolveApiUrl(path) {
  const P = getPages();
  const rel = String(path || "").replace(/^\//, "");
  if (P?.api) {
    const url = P.api(rel);
    if (url) return url;
  }
  if (P?.staticShell) return null;
  return `/${rel}`;
}

export function componentApiEnabled(name) {
  const P = getPages();
  if (!P) return true;
  if (!P.staticShell) return true;
  if (!P.hasComponent?.(name)) return false;
  const mode = P.componentMode?.(name);
  if (mode === "bridge") return !!P.apiBase?.();
  return mode === "on" || mode === true || !!mode;
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