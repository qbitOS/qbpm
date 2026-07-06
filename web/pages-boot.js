/** GitHub Pages project-path boot — detects /Qbpm/ or /qbpm/ base */
(function () {
  const host = location.hostname;
  const path = location.pathname;

  // GitHub project pages are case-sensitive: repo is Qbpm, not qbpm.
  if (host.endsWith("github.io") && /^\/qbpm(\/|$)/.test(path)) {
    const rest = path.slice("/qbpm".length);
    location.replace(`/Qbpm${rest || "/"}`);
    return;
  }
  const m = path.match(/^(.*\/(?:Qbpm|qbpm))\/?/i);
  const base = m ? `${m[1]}/` : "/";
  const staticShell =
    host.endsWith("github.io") ||
    host.endsWith("githubusercontent.com") ||
    new URLSearchParams(location.search).has("static");

  function joinBase(p) {
    const s = String(p || "").replace(/^\//, "");
    return `${base}${s}`;
  }

  window.QBPM_PAGES = {
    base,
    basePath: base,
    staticShell,
    kbatchSrc: staticShell
      ? "https://mueee.qbitos.ai/kbatch.html?qbpm=1"
      : "/tools/kbatch/kbatch.html?qbpm=1",
    asset(p) {
      const s = String(p || "").replace(/^\//, "");
      if (s.startsWith("static/")) return joinBase(s);
      return joinBase(`static/${s}`);
    },
    api(p) {
      if (staticShell) return null;
      return `/${String(p || "").replace(/^\//, "")}`;
    },
    graphJson(name = "default") {
      return joinBase(`static/graphs/${name}.json`);
    },
    toolsJson() {
      return joinBase("static/tools.json");
    },
  };
})();