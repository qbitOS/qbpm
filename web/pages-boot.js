/** Multi-variant boot — desktop · Pages · forge · Cloudflare · cloud */
(function () {
  const host = location.hostname;
  const path = location.pathname;
  const params = new URLSearchParams(location.search);

  if (host.endsWith("github.io") && /^\/qbpm(\/|$)/.test(path)) {
    const rest = path.slice("/qbpm".length);
    location.replace(`/Qbpm${rest || "/"}`);
    return;
  }

  const m = path.match(/^(.*\/(?:Qbpm|qbpm))\/?/i);
  const runtimeBase = m ? `${m[1]}/` : "/";

  function detectVariant() {
    if (params.has("variant")) return params.get("variant");
    const baked = window.QBPM_ENV?.variant;
    if (baked) return baked;
    if (host === "qbpm.qbitos.ai") return "cloudflare";
    if (host.endsWith("github.io")) {
      return /\/Qbpm\/?/i.test(path) ? "forge" : "pages";
    }
    if (host === "qbitos.ai" || host === "www.qbitos.ai" || host === "api.qbitos.ai") return "cloud";
    if (params.has("static")) return "pages";
    if (host === "127.0.0.1" || host === "localhost") return "desktop";
    return "desktop";
  }

  const variant = detectVariant();
  const staticShell =
    variant === "pages" ||
    variant === "forge" ||
    variant === "cloudflare" ||
    host.endsWith("github.io") ||
    host.endsWith("githubusercontent.com") ||
    params.has("static");

  const bakedEnv = window.QBPM_ENV || {};
  const defaultApiBase = bakedEnv.defaultApiBase || "";

  function readApiBase() {
    try {
      const stored = localStorage.getItem("qbpm-api-base");
      if (stored) return stored.replace(/\/$/, "");
    } catch (_) {}
    if (!staticShell) return "";
    return (defaultApiBase || "").replace(/\/$/, "");
  }

  function joinBase(p) {
    const s = String(p || "").replace(/^\//, "");
    const base = bakedEnv.basePath || runtimeBase;
    return `${base}${s}`;
  }

  let launchCfg = null;
  let launchLoaded = false;

  function apiBase() {
    return readApiBase();
  }

  function api(p) {
    const base = apiBase();
    const rel = String(p || "").replace(/^\//, "");
    if (base) return `${base}/${rel}`;
    if (staticShell) return null;
    return `/${rel}`;
  }

  function wsApi(p) {
    const rel = String(p || "").replace(/^\//, "");
    const base = apiBase();
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    if (base) {
      try {
        const u = new URL(base);
        return `${proto}//${u.host}/${rel}`;
      } catch (_) {}
    }
    return `${proto}//${location.host}/${rel}`;
  }

  function hasComponent(name) {
    const c = launchCfg?.components?.[name];
    if (c === false || c === "off") return false;
    return !!c;
  }

  function componentMode(name) {
    const c = launchCfg?.components?.[name];
    if (c === true) return "on";
    if (c === false) return "off";
    return c || "off";
  }

  window.QBPM_PAGES = {
    base: bakedEnv.basePath || runtimeBase,
    basePath: bakedEnv.basePath || runtimeBase,
    variant,
    staticShell,
    defaultApiBase,
    apiBase,
    api,
    wsApi,
    hasComponent,
    componentMode,
    kbatchSrc:
      staticShell || componentMode("kbatch") === "remote"
        ? "https://mueee.qbitos.ai/kbatch.html?qbpm=1"
        : "/tools/kbatch/kbatch.html?qbpm=1",
    asset(p) {
      const s = String(p || "").replace(/^\//, "");
      if (s.startsWith("static/")) return joinBase(s);
      return joinBase(`static/${s}`);
    },
    graphJson(name = "default") {
      return joinBase(`static/graphs/${name}.json`);
    },
    toolsJson() {
      return joinBase("static/tools.json");
    },
    setApiBase(url) {
      const v = String(url || "").replace(/\/$/, "");
      try {
        if (v) localStorage.setItem("qbpm-api-base", v);
        else localStorage.removeItem("qbpm-api-base");
      } catch (_) {}
      return v;
    },
    get launch() {
      return launchCfg;
    },
  };

  function applyLaunch() {
    document.documentElement.dataset.qbpmVariant = variant;
    if (launchCfg?.label) document.documentElement.dataset.qbpmLabel = launchCfg.label;
    Object.entries(launchCfg?.components || {}).forEach(([k, v]) => {
      if (!v || v === "off" || v === false) document.body.classList.add(`launch-off-${k}`);
      else if (v === "bridge") document.body.classList.add(`launch-bridge-${k}`);
    });
    window.dispatchEvent(new CustomEvent("qbpm-launch-ready"));
  }

  function mergeLaunch(remote, baked) {
    const base = remote?.[variant] || remote?.pages || {};
    return {
      variant,
      label: baked?.label || variant,
      origin: baked?.origin || "",
      defaultApiBase: baked?.defaultApiBase || defaultApiBase,
      components: { ...(base.components || {}) },
    };
  }

  fetch(joinBase("static/env-config.json"), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((baked) => {
      if (baked.variant) window.QBPM_PAGES.variant = baked.variant;
      if (baked.defaultApiBase) window.QBPM_PAGES.defaultApiBase = baked.defaultApiBase;
      return fetch(joinBase("static/launch-config.json"), { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then((remote) => {
          launchCfg = mergeLaunch(remote, baked);
          launchLoaded = true;
          applyLaunch();
        });
    })
    .catch(() => {
      launchCfg = { variant, label: variant, components: {} };
      launchLoaded = true;
      applyLaunch();
    });

  window.QBPM_PAGES.launchReady = () => launchLoaded;
})();