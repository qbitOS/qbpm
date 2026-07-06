/** Qubes-style compartment store — IndexedDB + localStorage manifest */

const DB_NAME = "qbpm-qubes";
const DB_VERSION = 1;
const STORE = "compartments";
const MANIFEST_PREFIX = "qbpm-qube-manifest:";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "key" });
      }
    };
  });
}

export function qubeKey(graphName, qubeId) {
  return `${graphName}:${qubeId}`;
}

export async function qubePut(graphName, qubeId, entry) {
  const key = qubeKey(graphName, qubeId);
  const payload = {
    key,
    graphName,
    qubeId,
    type: entry.type || "session",
    owner: entry.owner || "local",
    label: entry.label || qubeId,
    state: entry.state || {},
    rev: (entry.rev || 0) + 1,
    updatedAt: Date.now(),
  };
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(payload);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (_) {
    /* IDB unavailable — fall through */
  }
  try {
    const manifest = JSON.parse(localStorage.getItem(MANIFEST_PREFIX + graphName) || "[]");
    const idx = manifest.findIndex((m) => m.qubeId === qubeId);
    const meta = {
      qubeId,
      type: payload.type,
      owner: payload.owner,
      label: payload.label,
      updatedAt: payload.updatedAt,
    };
    if (idx >= 0) manifest[idx] = meta;
    else manifest.push(meta);
    localStorage.setItem(MANIFEST_PREFIX + graphName, JSON.stringify(manifest));
    localStorage.setItem(`qbpm-qube:${key}`, JSON.stringify(payload));
  } catch (_) {}
  return payload;
}

export async function qubeGet(graphName, qubeId) {
  const key = qubeKey(graphName, qubeId);
  try {
    const db = await openDb();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (row) return row;
  } catch (_) {}
  try {
    const raw = localStorage.getItem(`qbpm-qube:${key}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

export async function qubeList(graphName) {
  const out = new Map();
  try {
    const db = await openDb();
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    rows.filter((r) => r.graphName === graphName).forEach((r) => out.set(r.qubeId, r));
  } catch (_) {}
  try {
    const manifest = JSON.parse(localStorage.getItem(MANIFEST_PREFIX + graphName) || "[]");
    for (const m of manifest) {
      if (out.has(m.qubeId)) continue;
      const row = await qubeGet(graphName, m.qubeId);
      if (row) out.set(m.qubeId, row);
    }
  } catch (_) {}
  return [...out.values()];
}

export function getLocalQubeClientId() {
  try {
    let id = localStorage.getItem("qbpm-qube-client");
    if (!id) {
      id = `local-${Math.random().toString(16).slice(2, 10)}`;
      localStorage.setItem("qbpm-qube-client", id);
    }
    return id;
  } catch (_) {
    return "local-guest";
  }
}