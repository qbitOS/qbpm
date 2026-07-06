(function (global) {
  "use strict";

  function resolveApiUrl(path) {
    const P = global.QBPM_PAGES;
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
    if (P.componentMode?.("grok") === "bridge") return !!P.apiBase?.();
    return !!P.hasComponent?.("grok");
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

  function connect() {
    if (!grokApiEnabled()) {
      render("grok · static shell — set API base or use desktop");
      return Promise.resolve();
    }
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      ws = new WebSocket(wsUrl());
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "join", client: "qbpm-ui", role: "terminal" }));
        resolve();
      };
      ws.onerror = () => reject(new Error("grok ws failed"));
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
      };
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
    if (!url) return { ok: false, local: true };
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
      render("grok · offline (static shell)");
      return { terminalText: "", local: true };
    }
    const url = resolveApiUrl(`api/grok/terminal?session_id=${encodeURIComponent(sessionId)}`);
    const data = await fetchApiJson(url);
    if (data.terminalText) render(data.terminalText);
    else if (!data.ok) render("grok · terminal unavailable (API bridge)");
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

    refresh().catch(() => {});
    connect().catch(() => {});
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