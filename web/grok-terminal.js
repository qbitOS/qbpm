(function (global) {
  "use strict";

  function resolveApiUrl(path) {
    const P = global.QBPM_PAGES;
    if (P?.bridgeOnline === false) return null;
    const rel = String(path || "").replace(/^\//, "");
    if (P?.api) {
      const url = P.api(rel);
      if (url) return url;
    }
    if (P?.staticShell) return null;
    return `/${rel}`;
  }

  function grokApiEnabled() {
    const P = global.QBPM_PAGES;
    if (!P) return true;
    if (!P.staticShell) return true;
    if (!P.hasComponent?.("grok")) return false;
    if (P.componentMode?.("grok") === "bridge") {
      if (P.bridgeOnline === false) return false;
      if (P.bridgeOnline == null) return false;
      return !!(P.apiBase?.() || P.defaultApiBase);
    }
    return !!P.hasComponent?.("grok");
  }

  function whenBridgeReady(fn) {
    const P = global.QBPM_PAGES;
    if (!P?.staticShell || P.bridgeOnline != null) {
      fn();
      return;
    }
    global.addEventListener("qbpm-bridge-status", () => fn(), { once: true });
    setTimeout(fn, 10000);
  }

  function localTerminalHelp() {
    return [
      "grok · local shell (API bridge offline)",
      "run · save · graph · agent · help",
      "canvas + music work locally on this device",
    ].join("\n");
  }

  async function fetchApiJson(url, options) {
    if (!url) return { ok: false, local: true };
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      return { ok: false, local: true, error: err.message };
    }
    const text = await res.text();
    if (!text) return { ok: res.ok, empty: true };
    try {
      const data = JSON.parse(text);
      return { ...data, ok: res.ok };
    } catch {
      return { ok: false, error: "non-json" };
    }
  }

  const termOut = () => document.getElementById("grok-terminal-out");
  const termIn = () => document.getElementById("grok-terminal-in");
  let ws = null;
  let sessionId = "main";
  let history = [];
  let histIdx = -1;

  function render(text) {
    const el = termOut();
    if (el) el.textContent = text || "";
  }

  function wsUrl() {
    const P = typeof window !== "undefined" && window.QBPM_PAGES;
    if (P?.wsApi) return P.wsApi("api/grok/ws");
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/api/grok/ws`;
  }

  let wsBackoff = 0;
  let wsTimer = null;

  function connect() {
    if (!grokApiEnabled()) {
      render(localTerminalHelp());
      return Promise.resolve();
    }
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    if (ws && ws.readyState === WebSocket.CONNECTING) return Promise.resolve();
    return new Promise((resolve) => {
      try {
        ws = new WebSocket(wsUrl());
      } catch (_) {
        render(localTerminalHelp());
        resolve();
        return;
      }
      ws.onopen = () => {
        wsBackoff = 0;
        ws.send(JSON.stringify({ type: "join", client: "qbpm-ui", role: "terminal" }));
        resolve();
      };
      ws.onerror = () => {};
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.terminalText != null) render(msg.terminalText);
          if (msg.type === "terminal" && msg.terminalText != null) render(msg.terminalText);
          if (msg.type === "log" && termOut()) {
            const cur = termOut().textContent;
            render((cur ? cur + "\n" : "") + msg.text);
          }
        } catch (_) {
          render(String(ev.data));
        }
      };
      ws.onclose = () => {
        ws = null;
        if (!grokApiEnabled()) return;
        wsBackoff += 1;
        if (wsBackoff > 5) return;
        clearTimeout(wsTimer);
        wsTimer = setTimeout(() => connect().catch(() => {}), Math.min(30000, 2500 * wsBackoff));
      };
      setTimeout(() => resolve(), 4000);
    });
  }

  async function inject(text, opts = {}) {
    const source = opts.source || "grok";
    const execute = opts.execute !== false;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "inject",
          sessionId: opts.sessionId || sessionId,
          source,
          text,
        })
      );
      return { ok: true, transport: "ws" };
    }
    const url = resolveApiUrl("api/grok/inject");
    if (!url) {
      const line = String(text || "").trim();
      if (line && global.qbpm?.onTerminalCommand) {
        try { await global.qbpm.onTerminalCommand(line.replace(/\n$/, "")); } catch (_) {}
      }
      const cur = termOut()?.textContent || "";
      const echo = line ? `❯ ${line}` : "";
      render(cur ? `${cur}\n${echo}` : echo || localTerminalHelp());
      return { ok: true, local: true };
    }
    const data = await fetchApiJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sessionId: opts.sessionId || sessionId,
        source,
        execute,
      }),
    });
    if (data.terminalText) render(data.terminalText);
    return data;
  }

  async function refresh() {
    if (!grokApiEnabled()) {
      render(localTerminalHelp());
      return { terminalText: "", local: true };
    }
    const url = resolveApiUrl(`api/grok/terminal?session_id=${encodeURIComponent(sessionId)}`);
    const data = await fetchApiJson(url);
    if (data.terminalText) render(data.terminalText);
    else if (!data.ok) render(localTerminalHelp());
    return data;
  }

  function clearTerminal() {
    const url = resolveApiUrl("api/grok/clear");
    if (!url) {
      render("");
      return Promise.resolve();
    }
    return fetchApiJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    }).then(() => render(""));
  }

  function bindUi() {
    const input = termIn();
    const btn = document.getElementById("grok-terminal-send");
    const toggle = document.getElementById("btn-grok-terminal");
    const panel = document.getElementById("grok-terminal");

    if (toggle) {
      toggle.addEventListener("click", () => {
        const isMobile = window.matchMedia("(max-width: 900px)").matches;
        if (isMobile && global.qbpm?.setMobilePanel) {
          global.qbpm.setMobilePanel("terminal");
          toggle.setAttribute("aria-pressed", "true");
          return;
        }
        if (panel) {
          panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
          document.getElementById("grok-terminal-in")?.focus();
        }
        toggle.setAttribute("aria-pressed", "true");
      });
    }

    async function submitLine() {
      if (!input) return;
      const line = input.value.trim();
      if (!line) return;
      history.unshift(line);
      histIdx = -1;
      input.value = "";
      try {
        await connect();
      } catch (_) {}
      await inject(line + "\n", { source: "ui" });
      if (global.qbpm?.onTerminalCommand) global.qbpm.onTerminalCommand(line);
    }

    if (btn) btn.addEventListener("click", submitLine);
    if (input) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          submitLine();
        }
        if (ev.key === "ArrowUp") {
          ev.preventDefault();
          if (histIdx < history.length - 1) {
            histIdx += 1;
            input.value = history[histIdx];
          }
        }
        if (ev.key === "ArrowDown") {
          ev.preventDefault();
          if (histIdx > 0) {
            histIdx -= 1;
            input.value = history[histIdx];
          } else {
            histIdx = -1;
            input.value = "";
          }
        }
      });
    }

    whenBridgeReady(() => {
      refresh().catch(() => {});
      connect().catch(() => {});
    });
  }

  global.grokTools = {
    inject,
    clearTerminal,
    connect,
    refresh,
    get sessionId() {
      return sessionId;
    },
    set sessionId(v) {
      sessionId = v;
    },
    runGraph: () => inject("run\n"),
    saveGraph: () => inject("save\n"),
    showGraph: () => inject("graph\n"),
    agent: () => inject("agent\n"),
    help: () => inject("help\n"),
  };

  global.qbpm = global.qbpm || {};
  global.qbpm.grok = global.grokTools;
  global.qbpm.setMobilePanel = global.qbpm.setMobilePanel || function (name) {
    document.querySelectorAll("#mobile-tabs button").forEach((btn) => {
      if (btn.dataset.panel === name) btn.click();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindUi);
  } else {
    bindUi();
  }
})(window);