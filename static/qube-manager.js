/** Qubes-style compartment manager — per user/node/viewport persistence */

import { qubePut, qubeGet, qubeList, getLocalQubeClientId } from "./qube-store.js";

const QUBE_COLORS = ["#58a6ff", "#3fb950", "#d29922", "#a371f7", "#f85149", "#79c0ff"];

export function createQubeManager(opts = {}) {
  const {
    graphName = "default",
    getSnapshot,
    applySnapshot,
    onRestored,
  } = opts;

  const clientId = getLocalQubeClientId();
  const timers = new Map();
  let restored = false;

  function qubeColor(qubeId) {
    let h = 0;
    for (let i = 0; i < qubeId.length; i++) h = (h * 31 + qubeId.charCodeAt(i)) >>> 0;
    return QUBE_COLORS[h % QUBE_COLORS.length];
  }

  function scheduleFlush(kind = "session", delay = 1400) {
    clearTimeout(timers.get(kind));
    timers.set(
      kind,
      setTimeout(() => flush(kind).catch(() => {}), delay),
    );
  }

  async function flush(kind = "all") {
    const snap = getSnapshot?.();
    if (!snap) return;

    const owner = snap.owner || clientId;
    const tasks = [];

    if (kind === "all" || kind === "session") {
      tasks.push(
        qubePut(graphName, `session:${owner}`, {
          type: "session",
          owner,
          label: snap.ownerName || owner,
          state: snap.session || {},
        }),
      );
    }

    if (kind === "all" || kind === "frames") {
      for (const frame of snap.frames || []) {
        if (!frame?.id) continue;
        tasks.push(
          qubePut(graphName, `frame:${frame.id}`, {
            type: "frame",
            owner: frame.owner || frame.clientId || owner,
            label: frame.label || frame.id,
            state: { frame },
          }),
        );
      }
    }

    if (kind === "all" || kind === "viewports") {
      for (const vp of snap.viewports || []) {
        if (!vp?.id) continue;
        tasks.push(
          qubePut(graphName, `viewport:${vp.id}`, {
            type: "viewport",
            owner,
            label: vp.label || vp.id,
            state: { viewport: vp },
          }),
        );
      }
    }

    if (kind === "all" || kind === "nodes") {
      for (const node of snap.nodes || []) {
        if (!node?.id) continue;
        tasks.push(
          qubePut(graphName, `node:${node.id}`, {
            type: "node",
            owner: node.owner || owner,
            label: node.id,
            state: { node },
          }),
        );
      }
    }

    if (kind === "all" || kind === "workspace") {
      tasks.push(
        qubePut(graphName, `workspace:${owner}`, {
          type: "workspace",
          owner,
          label: "float workspace",
          state: snap.workspace || {},
        }),
      );
    }

    await Promise.all(tasks);
  }

  async function restore() {
    if (restored) return;
    const rows = await qubeList(graphName);
    if (!rows.length) {
      restored = true;
      return;
    }

    const patch = {
      session: null,
      frames: [],
      viewports: [],
      nodes: [],
      workspace: null,
      qubeMeta: {},
    };

    for (const row of rows) {
      patch.qubeMeta[row.qubeId] = {
        type: row.type,
        owner: row.owner,
        label: row.label,
        color: qubeColor(row.qubeId),
        updatedAt: row.updatedAt,
      };
      const s = row.state || {};
      if (row.type === "session" && row.qubeId === `session:${clientId}`) {
        patch.session = s;
      } else if (row.type === "frame" && s.frame) {
        patch.frames.push(s.frame);
      } else if (row.type === "viewport" && s.viewport) {
        patch.viewports.push(s.viewport);
      } else if (row.type === "node" && s.node) {
        patch.nodes.push(s.node);
      } else if (row.type === "workspace" && row.qubeId === `workspace:${clientId}`) {
        patch.workspace = s;
      }
    }

    applySnapshot?.(patch);
    restored = true;
    onRestored?.(patch);
  }

  function tagFrame(frame) {
    if (!frame) return frame;
    const qid = `frame:${frame.id}`;
    return {
      ...frame,
      qubeId: qid,
      qubeColor: qubeColor(qid),
      qubePersistent: true,
    };
  }

  return {
    clientId,
    restore,
    flush,
    scheduleFlush,
    tagFrame,
    qubeColor,
    isRestored: () => restored,
  };
}

export { getLocalQubeClientId, qubeGet };