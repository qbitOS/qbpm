/** Canvas teams · channels · genres — member prefs + orchestra layout */

export const ORCHESTRA_SECTIONS = [
  { id: "strings", label: "Strings", color: "#58a6ff", genre: "classical" },
  { id: "woodwinds", label: "Woodwinds", color: "#3fb950", genre: "classical" },
  { id: "brass", label: "Brass", color: "#d29922", genre: "classical" },
  { id: "percussion", label: "Percussion", color: "#f85149", genre: "rhythm" },
  { id: "rhythm", label: "Rhythm", color: "#f0883e", genre: "electronic" },
  { id: "vocals", label: "Vocals", color: "#bc8cff", genre: "vocal" },
  { id: "visual", label: "Visual", color: "#79c0ff", genre: "visual" },
  { id: "conductor", label: "Conductor", color: "#e6edf3", genre: "host" },
];

export const DEFAULT_GENRES = [
  { id: "classical", label: "Classical", color: "#58a6ff" },
  { id: "electronic", label: "Electronic", color: "#f0883e" },
  { id: "jazz", label: "Jazz", color: "#d29922" },
  { id: "hiphop", label: "Hip-hop", color: "#f85149" },
  { id: "ambient", label: "Ambient", color: "#6e7681" },
  { id: "visual", label: "Visual / VJ", color: "#79c0ff" },
  { id: "collab", label: "Open collab", color: "#8b949e" },
];

export function ensureCanvasGroups(meta) {
  if (!meta || typeof meta !== "object") return null;
  if (!meta.canvasGroups || typeof meta.canvasGroups !== "object") {
    meta.canvasGroups = {
      teams: ORCHESTRA_SECTIONS.map((s) => ({
        id: s.id,
        label: s.label,
        color: s.color,
        genre: s.genre,
        members: [],
      })),
      channels: [],
      genres: DEFAULT_GENRES.map((g) => ({ ...g })),
      memberPrefs: {},
      assignments: { frames: {}, viewports: {}, nodes: {} },
      session: { hostId: null, conductorId: null },
    };
  }
  const g = meta.canvasGroups;
  if (!Array.isArray(g.teams)) g.teams = [];
  if (!Array.isArray(g.channels)) g.channels = [];
  if (!Array.isArray(g.genres)) g.genres = DEFAULT_GENRES.map((x) => ({ ...x }));
  if (!g.memberPrefs) g.memberPrefs = {};
  if (!g.assignments) g.assignments = { frames: {}, viewports: {}, nodes: {} };
  if (!g.session) g.session = { hostId: null, conductorId: null };
  return g;
}

export function mergeCanvasGroups(base, patch) {
  const a = ensureCanvasGroups({ canvasGroups: structuredClone(base || {}) });
  const b = patch || {};
  if (b.teams) a.teams = b.teams;
  if (b.channels) a.channels = b.channels;
  if (b.genres) a.genres = b.genres;
  if (b.memberPrefs) a.memberPrefs = { ...a.memberPrefs, ...b.memberPrefs };
  if (b.assignments) {
    a.assignments.frames = { ...a.assignments.frames, ...(b.assignments.frames || {}) };
    a.assignments.viewports = { ...a.assignments.viewports, ...(b.assignments.viewports || {}) };
    a.assignments.nodes = { ...a.assignments.nodes, ...(b.assignments.nodes || {}) };
  }
  if (b.session) a.session = { ...a.session, ...b.session };
  return a;
}

export function getMemberPrefs(groups, clientId) {
  const g = groups || {};
  const prefs = g.memberPrefs?.[clientId] || { teams: [], channels: [], genres: ["collab"] };
  return {
    teams: [...(prefs.teams || [])],
    channels: [...(prefs.channels || [])],
    genres: [...(prefs.genres || [])],
  };
}

export function setMemberPrefs(groups, clientId, prefs) {
  if (!groups || !clientId) return groups;
  groups.memberPrefs[clientId] = {
    teams: prefs.teams || [],
    channels: prefs.channels || [],
    genres: prefs.genres || [],
  };
  syncMemberToTeams(groups, clientId);
  return groups;
}

function syncMemberToTeams(groups, clientId) {
  const prefs = getMemberPrefs(groups, clientId);
  for (const team of groups.teams) {
    const inTeam = prefs.teams.includes(team.id);
    const has = team.members.includes(clientId);
    if (inTeam && !has) team.members.push(clientId);
    if (!inTeam && has) team.members = team.members.filter((id) => id !== clientId);
  }
  for (const ch of groups.channels) {
    const inCh = prefs.channels.includes(ch.id);
    const has = ch.members?.includes(clientId);
    if (inCh && !has) {
      if (!ch.members) ch.members = [];
      ch.members.push(clientId);
    }
    if (!inCh && has) ch.members = ch.members.filter((id) => id !== clientId);
  }
}

export function toggleMemberList(groups, clientId, kind, id) {
  const prefs = getMemberPrefs(groups, clientId);
  const list = prefs[kind] || [];
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
  else list.push(id);
  prefs[kind] = list;
  setMemberPrefs(groups, clientId, prefs);
  return prefs;
}

export function isSessionModerator(clientId, groups, peers = [], opts = {}) {
  const { getVideoWall, localOnly } = opts;
  if (!clientId) return false;
  if (groups?.session?.hostId === clientId) return true;
  if (groups?.session?.conductorId === clientId) return true;
  const vw = getVideoWall?.();
  const pins = vw?.getPinnedEntries?.() || [];
  if (pins.some((p) => p.clientId === clientId && p.role === "moderator")) return true;
  const peer = peers.find((p) => p.clientId === clientId);
  if (/mod|host|conductor|teacher|maestro/i.test(peer?.name || "")) return true;
  if (localOnly && peers.length === 0) return true;
  return false;
}

export function assignToGroup(groups, kind, targetId, patch) {
  if (!groups?.assignments) return;
  const bucket = groups.assignments[kind] || {};
  bucket[targetId] = { ...bucket[targetId], ...patch, ts: Date.now() };
  groups.assignments[kind] = bucket;
}

export function teamForClient(groups, clientId) {
  const prefs = getMemberPrefs(groups, clientId);
  if (prefs.teams[0]) return prefs.teams[0];
  const t = groups.teams.find((x) => x.members?.includes(clientId));
  return t?.id || "rhythm";
}

function sectionForNode(node, groups, ownerTeam) {
  const a = groups.assignments?.nodes?.[node.id];
  if (a?.teamId) return a.teamId;
  if (node.type?.startsWith("live.")) return "visual";
  if (/music|score|piano|midi/i.test(node.type || "")) return ownerTeam || "strings";
  if (/video|live|ingest/i.test(node.type || "")) return "visual";
  if (/jax|cuda|kernel|python/i.test(node.type || "")) return "rhythm";
  return ownerTeam || "rhythm";
}

/** Orchestra semicircle — frames, nodes, viewports by team/section */
export function arrangeOrchestraLayout(opts = {}) {
  const {
    frames = [],
    viewports = [],
    nodes = [],
    groups,
    peers = [],
    getOwnerId = (n) => n.owner,
  } = opts;

  const g = structuredClone(groups || ensureCanvasGroups({}));
  const main = frames.find((f) => f.id === "frame-main");
  const [mx, my, mw, mh] = main?.rect || [-400, -300, 2400, 1800];
  const cx = mx + mw / 2;
  const cy = my + mh * 0.55;
  const radiusX = mw * 0.38;
  const radiusY = mh * 0.28;

  const teams = g.teams.length ? g.teams : ORCHESTRA_SECTIONS.map((s) => ({ ...s, members: [] }));
  const n = teams.length;

  const outFrames = frames.map((f) => structuredClone(f));
  const outNodes = nodes.map((n) => structuredClone(n));
  const outVps = viewports.map((v) => structuredClone(v));

  teams.forEach((team, i) => {
    const t = (i + 0.5) / n;
    const angle = Math.PI * 0.12 + t * Math.PI * 0.76;
    const sx = cx + Math.cos(angle) * radiusX;
    const sy = cy + Math.sin(angle) * radiusY;
    const fw = 420;
    const fh = 280;

    const memberIds = new Set([
      ...(team.members || []),
      ...peers.filter((p) => teamForClient(g, p.clientId) === team.id).map((p) => p.clientId),
    ]);

    const sectionFrames = outFrames.filter(
      (f) =>
        f.cluster === "user" &&
        (memberIds.has(f.clientId) || g.assignments?.frames?.[f.id]?.teamId === team.id),
    );

    sectionFrames.forEach((f, j) => {
      const col = j % 2;
      const row = Math.floor(j / 2);
      f.rect = [sx - fw / 2 + col * (fw + 24), sy - fh / 2 + row * (fh + 20), fw, fh];
      f.lane = "collab";
      f.orchestraSection = team.id;
      assignToGroup(g, "frames", f.id, { teamId: team.id, section: team.id, genre: team.genre });
    });

    if (team.id === "conductor" && main) {
      main.rect = [cx - 520, my + 40, 1040, 200];
      main.label = "Conductor · host";
      assignToGroup(g, "frames", main.id, { teamId: "conductor", section: "conductor" });
    }
  });

  const nodesByOwner = new Map();
  for (const node of outNodes) {
    const oid = getOwnerId(node) || "local";
    if (!nodesByOwner.has(oid)) nodesByOwner.set(oid, []);
    nodesByOwner.get(oid).push(node);
  }

  for (const [ownerId, ownerNodes] of nodesByOwner) {
    const teamId = teamForClient(g, ownerId);
    const hostFrame =
      outFrames.find((f) => f.clientId === ownerId) ||
      outFrames.find((f) => g.assignments?.frames?.[f.id]?.teamId === teamId);
    if (!hostFrame) continue;
    const [fx, fy, fw, fh] = hostFrame.rect;
    const cols = Math.ceil(Math.sqrt(ownerNodes.length));
    const cellW = Math.min(200, (fw - 40) / cols);
    const cellH = 72;
    ownerNodes.forEach((node, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const section = sectionForNode(node, g, teamId);
      node.pos = [fx + 20 + col * (cellW + 8), fy + 48 + row * (cellH + 6)];
      assignToGroup(g, "nodes", node.id, { teamId, section, ownerId });
    });
  }

  outVps.forEach((vp, i) => {
    const team = teams[i % teams.length];
    const fr = outFrames.find((f) => f.orchestraSection === team.id);
    if (fr) {
      vp.frameId = fr.id;
      vp.label = `${team.label} view`;
      const [fx, fy, fw, fh] = fr.rect;
      vp.pan = [-(fx + fw / 2) + 200, -(fy + fh / 2) + 150];
      vp.scale = 0.85;
      assignToGroup(g, "viewports", vp.id, { teamId: team.id, section: team.id });
    }
  });

  g.session = { ...g.session, lastOrchestra: Date.now() };
  return { frames: outFrames, viewports: outVps, nodes: outNodes, groups: g };
}

export function groupLabel(groups, assignment) {
  if (!assignment) return "";
  const team = groups?.teams?.find((t) => t.id === assignment.teamId);
  const genre = groups?.genres?.find((x) => x.id === assignment.genre);
  return [team?.label, genre?.label].filter(Boolean).join(" · ");
}