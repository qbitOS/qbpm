/** Teams · channels · genres — user grouping + moderator orchestra controls */

import { ORCHESTRA_SECTIONS } from "./canvas-groups.js";

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function createVizGroupsRail(opts = {}) {
  const {
    getGroups = () => null,
    getLocalClient = () => ({ clientId: "local", name: "guest" }),
    getPeers = () => [],
    isModerator = () => false,
    onToggleGroup,
    onJoinChannel,
    onAddChannel,
    onOrchestraArrange,
    onAssignFrame,
    getFrames = () => [],
  } = opts;

  let host = null;
  let open = localStorage.getItem("qbpm-viz-groups-open") !== "0";

  function mount(el) {
    host = el || document.getElementById("viz-groups-rail");
    if (!host) return;
    if (!host.querySelector(".vgr-root")) {
      host.innerHTML = `<div class="vgr-root" aria-label="Teams channels genres"></div>`;
    }
    render();
  }

  function setOpen(v) {
    open = !!v;
    localStorage.setItem("qbpm-viz-groups-open", open ? "1" : "0");
    render();
  }

  function render() {
    const root = host?.querySelector(".vgr-root");
    if (!root) return;

    const groups = getGroups();
    const local = getLocalClient();
    const cid = local.clientId;
    const prefs = groups?.memberPrefs?.[cid] || { teams: [], channels: [], genres: ["collab"] };
    const mod = isModerator();
    const teams = groups?.teams || ORCHESTRA_SECTIONS;
    const genres = groups?.genres || [];
    const channels = groups?.channels || [];
    const hostId = groups?.session?.hostId;

    root.innerHTML = `
      <details class="vgr-panel" ${open ? "open" : ""}>
        <summary class="vgr-hd">
          <span class="vgr-title">teams · channels · genres</span>
          <span class="vgr-count">${prefs.teams.length}t · ${prefs.channels.length}ch · ${prefs.genres.length}g</span>
        </summary>
        <div class="vgr-body">
          ${mod
            ? `<div class="vgr-mod-bar">
                <span class="vgr-mod-lbl">◎ moderator</span>
                <button type="button" class="vgr-btn vgr-mod" data-act="orchestra" title="Arrange all views/nodes in orchestra layout">🎼 arrange</button>
                <button type="button" class="vgr-btn" data-act="claim-host" title="Claim session host">★ host</button>
              </div>`
            : `<div class="vgr-mod-bar vgr-mod-hint">
                <span>join groups below · host can 🎼 arrange</span>
                ${hostId ? `<span class="vgr-host">host · ${escapeHtml(hostId.slice(-6))}</span>` : ""}
              </div>`}
          <div class="vgr-section">
            <div class="vgr-section-hd">genres</div>
            <div class="vgr-chips">
              ${genres
                .map((g) => {
                  const on = prefs.genres.includes(g.id);
                  return `<button type="button" class="vgr-chip${on ? " on" : ""}" data-kind="genres" data-id="${escapeHtml(g.id)}" style="--vgr-c:${escapeHtml(g.color || "#8b949e")}">${escapeHtml(g.label)}</button>`;
                })
                .join("")}
            </div>
          </div>
          <div class="vgr-section">
            <div class="vgr-section-hd">teams (orchestra sections)</div>
            <div class="vgr-chips">
              ${teams
                .map((t) => {
                  const on = prefs.teams.includes(t.id);
                  const n = t.members?.length || 0;
                  return `<button type="button" class="vgr-chip vgr-team${on ? " on" : ""}" data-kind="teams" data-id="${escapeHtml(t.id)}" style="--vgr-c:${escapeHtml(t.color || "#58a6ff")}" title="${n} member${n === 1 ? "" : "s"}">${escapeHtml(t.label)}<span class="vgr-n">${n}</span></button>`;
                })
                .join("")}
            </div>
          </div>
          <div class="vgr-section">
            <div class="vgr-section-hd">channels ${mod ? `<button type="button" class="vgr-btn vgr-mini" data-act="add-channel">+ ch</button>` : ""}</div>
            <div class="vgr-chips">
              ${channels.length
                ? channels
                    .map((c) => {
                      const on = prefs.channels.includes(c.id);
                      return `<button type="button" class="vgr-chip${on ? " on" : ""}" data-kind="channels" data-id="${escapeHtml(c.id)}" style="--vgr-c:${escapeHtml(c.color || "#6e7681")}">${escapeHtml(c.label)}</button>`;
                    })
                    .join("")
                : '<span class="vgr-ph">no channels · mod can + ch</span>'}
            </div>
          </div>
          ${mod
            ? `<div class="vgr-section">
                <div class="vgr-section-hd">assign frame → section</div>
                <div class="vgr-assign">
                  <select class="vgr-sel" id="vgr-frame-sel">
                    ${(getFrames() || []).map((f) => `<option value="${escapeHtml(f.id)}">${escapeHtml(f.label || f.id)}</option>`).join("")}
                  </select>
                  <select class="vgr-sel" id="vgr-team-sel">
                    ${teams.map((t) => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.label)}</option>`).join("")}
                  </select>
                  <button type="button" class="vgr-btn" data-act="assign-frame">assign</button>
                </div>
              </div>`
            : ""}
        </div>
      </details>`;

    root.querySelector(".vgr-panel")?.addEventListener("toggle", (ev) => setOpen(ev.target.open));

    root.querySelectorAll(".vgr-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        onToggleGroup?.(btn.dataset.kind, btn.dataset.id);
      });
    });

    root.querySelector('[data-act="orchestra"]')?.addEventListener("click", () => onOrchestraArrange?.());
    root.querySelector('[data-act="claim-host"]')?.addEventListener("click", () => onToggleGroup?.("claim-host"));
    root.querySelector('[data-act="add-channel"]')?.addEventListener("click", () => onAddChannel?.());
    root.querySelector('[data-act="assign-frame"]')?.addEventListener("click", () => {
      const frameId = root.querySelector("#vgr-frame-sel")?.value;
      const teamId = root.querySelector("#vgr-team-sel")?.value;
      if (frameId && teamId) onAssignFrame?.(frameId, teamId);
    });
  }

  function destroy() {
    if (host) host.innerHTML = "";
  }

  return { mount, render, destroy };
}