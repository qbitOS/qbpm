/** Shared pages helper for ES modules */
export function pages() {
  const d = typeof window !== "undefined" && window.QBPM_PAGES;
  if (d) return d;
  return {
    base: "/",
    basePath: "/",
    staticShell: false,
    kbatchSrc: "/tools/kbatch/kbatch.html?qbpm=1",
    asset(p) {
      const s = String(p || "").replace(/^\//, "");
      return s.startsWith("static/") ? `/${s}` : `/static/${s}`;
    },
    api(p) {
      return `/${String(p || "").replace(/^\//, "")}`;
    },
    graphJson(name = "default") {
      return `/static/graphs/${name}.json`;
    },
    toolsJson() {
      return "/static/tools.json";
    },
  };
}