/** Collapsible rail — all frames & viewports on canvas */

function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildCollabInviteUrl(graphName = "default") {
  const url = new URL(location.href);
  url.searchParams.set("graph", graphName);
  const payload = btoa(JSON.stringify({ v: 1, graph: graphName, app: "qbpm" }));
  const base = url.hash.split("#qbpm-session=")[0].replace(/#$/, "");
  url.hash = base ? `${base}#qbpm-session=${payload}` : `#qbpm-session=${payload}`;
  return url.toString();
}

export function createVizViewsRail(opts = {}) {
  const {
    getFrames = () => [],
    getViewports = () => [],
    getPeers = () => [],
    getActiveFrameId = () => null,
    getActiveWindowId = () => null,
    getGraphName = () => "default",
    getGroups = () => null,
    onHopFrame,
    onHopViewport,
    onSelectFrame,
    onAddFrame,
    onAddViewport,
  } = opts;

  let host = null;
  let open = localStorage.getItem("qbpm-viz-views-open") !== "0";

  function mount(el) {
    host = el || document.getElementById("viz-views-rail");
    if (!host) return;
    if (!host.querySelector(".vvr-root")) {
      host.innerHTML = `<div class="vvr-root" aria-label="Canvas views"></div>`;
    }
    render();
  }

  function setOpen(v) {
    open = !!v;
    localStorage.setItem("qbpm-viz-views-open", open ? "1" : "0");
    render();
  }

  function frameMeta(f) {
    const groups = getGroups();
    const a = groups?.assignments?.frames?.[f.id];
    const team = a?.teamId ? groups?.teams?.find((t) => t.id === a.teamId)?.label : f.orchestraSection;
    const parts = [team, f.device, f.cluster, f.owner].filter(Boolean);
    return parts.length ? parts.join(" · ") : f.lane || "comp";
  }

  function render() {
    const root = host?.querySelector(".vvr-root");
    if (!root) return;

    const frames = getFrames() || [];
    const viewports = getViewports() || [];
    const peers = getPeers() || [];
    const activeFrame = getActiveFrameId();
    const activeVp = getActiveWindowId();
    const peerViews = peers.filter((p) => p.viewport?.pan);

    root.innerHTML = `
      <details class="vvr-panel" ${open ? "open" : ""}>
        <summary class="vvr-hd">
          <span class="vvr-title">canvas views</span>
          <span class="vvr-count">${frames.length}f · ${viewports.length}v${peerViews.length ? ` · ${peerViews.length} live` : ""}</span>
        </summary>
        <div class="vvr-body">
          <div class="vvr-actions">
            <button type="button" class="vvr-btn" data-act="add-frame" title="Add frame">+ frame</button>
            <button type="button" class="vvr-btn" data-act="add-vp" title="Add viewport">+ view</button>
          </div>
          <div class="vvr-section">
            <div class="vvr-section-hd">frames</div>
            <ul class="vvr-list">
              ${frames.length
                ? frames
                    .map((f) => {
                      const active = f.id === activeFrame;
                      return `<li class="vvr-item${active ? " active" : ""}" data-kind="frame" data-id="${escapeHtml(f.id)}">
                        <button type="button" class="vvr-hop" data-hop-frame="${escapeHtml(f.id)}" title="Hop to frame">◎</button>
                        <button type="button" class="vvr-label" data-select-frame="${escapeHtml(f.id)}">${escapeHtml(f.label || f.id)}</button>
                        <span class="vvr-meta">${escapeHtml(frameMeta(f))}</span>
                      </li>`;
                    })
                    .join("")
                : '<li class="vvr-ph">no frames</li>'}
            </ul>
          </div>
          <div class="vvr-section">
            <div class="vvr-section-hd">viewports</div>
            <ul class="vvr-list">
              ${viewports.length
                ? viewports
                    .map((v) => {
                      const active = v.id === activeVp;
                      const fr = frames.find((f) => f.id === v.frameId);
                      return `<li class="vvr-item${active ? " active" : ""}" data-kind="vp" data-id="${escapeHtml(v.id)}">
                        <button type="button" class="vvr-hop" data-hop-vp="${escapeHtml(v.id)}" title="Hop to viewport">◎</button>
                        <button type="button" class="vvr-label" data-select-vp="${escapeHtml(v.id)}">${escapeHtml(v.label || v.id)}</button>
                        <span class="vvr-meta">${escapeHtml(fr?.label || v.frameId || "—")}</span>
                      </li>`;
                    })
                    .join("")
                : '<li class="vvr-ph">no viewports</li>'}
            </ul>
          </div>
          ${peerViews.length
            ? `<div class="vvr-section">
                <div class="vvr-section-hd">collab views</div>
                <ul class="vvr-list">
                  ${peerViews
                    .map(
                      (p) => `<li class="vvr-item vvr-peer" data-kind="peer" data-id="${escapeHtml(p.clientId)}">
                        <button type="button" class="vvr-hop" data-hop-peer="${escapeHtml(p.clientId)}" title="Hop to peer view">◎</button>
                        <span class="vvr-label" style="color:${escapeHtml(p.color || "#8b949e")}">${escapeHtml((p.name || p.clientId).slice(0, 12))}</span>
                        <span class="vvr-meta">live</span>
                      </li>`,
                    )
                    .join("")}
                </ul>
              </div>`
            : ""}
        </div>
      </details>`;

    const det = root.querySelector(".vvr-panel");
    det?.addEventListener("toggle", () => setOpen(det.open));

    root.querySelector('[data-act="add-frame"]')?.addEventListener("click", () => onAddFrame?.());
    root.querySelector('[data-act="add-vp"]')?.addEventListener("click", () => onAddViewport?.());

    root.querySelectorAll("[data-hop-frame]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const f = frames.find((x) => x.id === btn.dataset.hopFrame);
        if (f) onHopFrame?.(f);
      });
    });
    root.querySelectorAll("[data-select-frame]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const f = frames.find((x) => x.id === btn.dataset.selectFrame);
        if (f) onSelectFrame?.(f);
      });
    });
    root.querySelectorAll("[data-hop-vp]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const v = viewports.find((x) => x.id === btn.dataset.hopVp);
        if (v) onHopViewport?.(v);
      });
    });
    root.querySelectorAll("[data-select-vp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const v = viewports.find((x) => x.id === btn.dataset.selectVp);
        if (v) onHopViewport?.(v);
      });
    });
    root.querySelectorAll("[data-hop-peer]").forEach((btn) => {
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const p = peers.find((x) => x.clientId === btn.dataset.hopPeer);
        if (p?.viewport) onHopViewport?.(p.viewport);
      });
    });
  }

  function destroy() {
    if (host) host.innerHTML = "";
  }

  return { mount, render, destroy, buildInviteUrl: () => buildCollabInviteUrl(getGraphName()) };
}