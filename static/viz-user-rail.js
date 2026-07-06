/** Per-user collapsible node rail under viz-log — mix · multichannel · share · save */

import { buildCollabInviteUrl } from "./viz-views-rail.js";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createVizUserRail(opts = {}) {
  const {
    getPeers = () => [],
    getLocalClient = () => ({ clientId: "local", name: "guest" }),
    getNodesForUser = () => [],
    getGraphName = () => "default",
    getCollab = () => null,
    onInviteUser,
    onMixOut,
    onMultichannelSend,
    onAiLink,
    onSaveCompTree,
    onSelectNode,
    onClearUserNodes,
  } = opts;

  let host = null;
  const openUsers = new Set();

  function mount(el) {
    host = el || document.getElementById("viz-user-rail");
    if (!host) return;
    if (!host.querySelector(".vur-root")) {
      host.innerHTML = `
        <div class="vur-session" aria-label="Collab session">
          <div class="vur-session-hd">
            <span class="vur-session-lbl">session</span>
            <span class="vur-session-count" id="vur-session-count">solo</span>
            <button type="button" class="vur-add-user" id="vur-add-user" title="Invite collaborator (+ user)">+ user</button>
          </div>
          <div class="vur-invite" id="vur-invite" hidden>
            <input type="text" class="vur-invite-url" id="vur-invite-url" readonly aria-label="Invite URL" />
            <button type="button" class="vur-btn vur-copy" id="vur-invite-copy" title="Copy link">copy</button>
            <button type="button" class="vur-btn vur-close" id="vur-invite-close" title="Close">✕</button>
          </div>
        </div>
        <div class="vur-root" aria-label="User node rails"></div>`;
      bindSession();
    }
    render();
  }

  function bindSession() {
    const addBtn = host?.querySelector("#vur-add-user");
    const invite = host?.querySelector("#vur-invite");
    const urlEl = host?.querySelector("#vur-invite-url");
    const copyBtn = host?.querySelector("#vur-invite-copy");
    const closeBtn = host?.querySelector("#vur-invite-close");

    addBtn?.addEventListener("click", () => {
      const url = buildCollabInviteUrl(getGraphName());
      if (urlEl) urlEl.value = url;
      invite?.removeAttribute("hidden");
      getCollab?.()?.sendJoin?.();
      onInviteUser?.(url);
      urlEl?.select?.();
    });
    copyBtn?.addEventListener("click", async () => {
      const url = urlEl?.value || buildCollabInviteUrl(getGraphName());
      try {
        await navigator.clipboard.writeText(url);
        copyBtn.textContent = "✓";
        setTimeout(() => { copyBtn.textContent = "copy"; }, 1200);
      } catch (_) {
        urlEl?.select?.();
      }
      onInviteUser?.(url, { copied: true });
    });
    closeBtn?.addEventListener("click", () => invite?.setAttribute("hidden", ""));
  }

  function toggleUser(id) {
    if (openUsers.has(id)) openUsers.delete(id);
    else openUsers.add(id);
    render();
  }

  function render() {
    const root = host?.querySelector(".vur-root");
    if (!root) return;
    const local = getLocalClient();
    const peers = getPeers();
    const countEl = host?.querySelector("#vur-session-count");
    if (countEl) {
      countEl.textContent = peers.length ? `${peers.length + 1} users` : "solo";
      countEl.dataset.level = peers.length ? "live" : "solo";
    }
    const users = [
      { clientId: local.clientId, name: local.name || "you", color: local.color || "#58a6ff", local: true },
      ...peers.map((p) => ({
        clientId: p.clientId,
        name: p.name || p.clientId,
        color: p.color || "#8b949e",
        local: false,
      })),
    ];
    const seen = new Set();
    const uniq = users.filter((u) => {
      if (!u.clientId || seen.has(u.clientId)) return false;
      seen.add(u.clientId);
      return true;
    });

    if (!uniq.length) {
      root.innerHTML = '<span class="vur-ph">user rails · solo</span>';
      return;
    }

    root.innerHTML = uniq
      .map((u) => {
        const nodes = getNodesForUser(u.clientId) || [];
        const open = openUsers.has(u.clientId) || (u.local && openUsers.size === 0);
        if (u.local && openUsers.size === 0) openUsers.add(u.clientId);
        const running = nodes.filter((n) => n.running !== false);
        return `
          <details class="vur-user${open ? " open" : ""}" data-user="${escapeHtml(u.clientId)}" ${open ? "open" : ""}>
            <summary class="vur-hd" style="--vur-c:${escapeHtml(u.color)}">
              <span class="vur-dot"></span>
              <span class="vur-name">${escapeHtml(u.name)}</span>
              <span class="vur-count">${running.length} node${running.length === 1 ? "" : "s"}</span>
            </summary>
            <div class="vur-body">
              <div class="vur-actions">
                <button type="button" class="vur-btn vur-mix" data-act="mix" data-user="${escapeHtml(u.clientId)}" title="Mix/raw signal out from all nodes">+ mix</button>
                <button type="button" class="vur-btn vur-send" data-act="send" data-user="${escapeHtml(u.clientId)}" title="Send multichannel to new work area">&gt; send</button>
                <button type="button" class="vur-btn vur-ai" data-act="ai" data-user="${escapeHtml(u.clientId)}" title="AI link / share live project">◎ ai</button>
                <button type="button" class="vur-btn vur-save" data-act="save" data-user="${escapeHtml(u.clientId)}" title="Save node comp tree">⬇ tree</button>
                ${u.local ? `<button type="button" class="vur-btn vur-clear" data-act="clear" data-user="${escapeHtml(u.clientId)}" title="Clear your nodes">✕ clear</button>` : ""}
              </div>
              <ul class="vur-nodes">
                ${nodes.length
                  ? nodes
                      .map(
                        (n) => `<li class="vur-node" data-node="${escapeHtml(n.id)}">
                          <button type="button" class="vur-node-btn" data-select="${escapeHtml(n.id)}">${escapeHtml(n.id)}</button>
                          <span class="vur-type">${escapeHtml(n.type || "—")}</span>
                          ${n.running === false ? '<span class="vur-idle">idle</span>' : '<span class="vur-run">●</span>'}
                        </li>`,
                      )
                      .join("")
                  : '<li class="vur-ph">no nodes</li>'}
              </ul>
            </div>
          </details>`;
      })
      .join("");

    root.querySelectorAll(".vur-btn").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const uid = btn.dataset.user;
        const act = btn.dataset.act;
        if (act === "mix") onMixOut?.(uid);
        else if (act === "send") onMultichannelSend?.(uid);
        else if (act === "ai") onAiLink?.(uid);
        else if (act === "save") onSaveCompTree?.(uid);
        else if (act === "clear") onClearUserNodes?.(uid);
      });
    });
    root.querySelectorAll("[data-select]").forEach((btn) => {
      btn.addEventListener("click", () => onSelectNode?.(btn.dataset.select));
    });
    root.querySelectorAll("details.vur-user").forEach((det) => {
      det.addEventListener("toggle", () => {
        const id = det.dataset.user;
        if (det.open) openUsers.add(id);
        else openUsers.delete(id);
      });
    });
  }

  return { mount, render, destroy: () => { if (host) host.innerHTML = ""; } };
}