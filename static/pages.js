/** Shared pages helper for ES modules */
export function pages() {
  const d = typeof window !== "undefined" && window.QBPM_PAGES;
  if (d) return d;
  return {
    base: "/",
    basePath: "/",
    variant: "desktop",
    staticShell: false,
    defaultApiBase: "",
    bridgeOnline: true,
    bridgeBase: "",
    apiBase() {
      return "";
    },
    kbatchSrc: "/tools/kbatch/kbatch.html?qbpm=1",
    asset(p) {
      const s = String(p || "").replace(/^\//, "");
      return s.startsWith("static/") ? `/${s}` : `/static/${s}`;
    },
    api(p) {
      return `/${String(p || "").replace(/^\//, "")}`;
    },
    wsApi(p) {
      const rel = String(p || "").replace(/^\//, "");
      const proto = typeof location !== "undefined" && location.protocol === "https:" ? "wss:" : "ws:";
      const host = typeof location !== "undefined" ? location.host : "127.0.0.1:8796";
      return `${proto}//${host}/${rel}`;
    },
    hasComponent() {
      return true;
    },
    componentMode() {
      return "on";
    },
    graphJson(name = "default") {
      return `/static/graphs/${name}.json`;
    },
    toolsJson() {
      return "/static/tools.json";
    },
    setApiBase() {
      return "";
    },
    launch: null,
  };
}