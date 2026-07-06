(function (global) {
  "use strict";

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
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/api/grok/ws`;
  }

  function connect() {
    if (typeof window !== "undefined" && window.QBPM_PAGES?.staticShell) {
      render("static shell — grok WS needs API host (qbitos.ai)");
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
    const res = await fetch("/api/grok/inject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        sessionId: opts.sessionId || sessionId,
        source,
        execute,
      }),
    });
    const data = await res.json();
    if (data.terminalText) render(data.terminalText);
    return data;
  }

  async function refresh() {
    const res = await fetch(`/api/grok/terminal?session_id=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    render(data.terminalText || "");
    return data;
  }

  function clearTerminal() {
    fetch("/api/grok/clear", {
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