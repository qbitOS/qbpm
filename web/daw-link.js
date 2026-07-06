/** DAW link + send — ecosystem registry · Web MIDI · BroadcastChannel · TD OSC · live WS */

const DAW_CH_PREFIX = "qbpm-daw-";
const LIVE_CH = "qbpm-live";

const DAW_ROLES = new Set(["daw", "ai-daw", "vocal", "midi", "editor", "sequencer", "player", "engine"]);

let ecosystemCache = null;

export async function loadDawEcosystem(url = "/static/jam-ecosystem.json") {
  if (ecosystemCache) return ecosystemCache;
  try {
    const res = await fetch(url);
    ecosystemCache = await res.json();
  } catch (_) {
    ecosystemCache = { tools: [], stacks: { daw: [] } };
  }
  return ecosystemCache;
}

export function listDawTools(eco) {
  const tools = eco?.tools || [];
  const stackIds = new Set(eco?.stacks?.daw || []);
  return tools.filter((t) => DAW_ROLES.has(t.role) || stackIds.has(t.id));
}

export function createDawLink(opts = {}) {
  const {
    onStatus = () => {},
    onMidiNote = () => {},
    getTdBridge = () => null,
    ingestLive = null,
  } = opts;

  let eco = null;
  let daws = [];
  const linked = new Set(JSON.parse(localStorage.getItem("qbpm-daw-linked") || "[]"));
  let midiAccess = null;
  let midiOut = null;
  const channels = new Map();

  async function init() {
    eco = await loadDawEcosystem();
    daws = listDawTools(eco);
    daws.forEach((d) => {
      if (typeof BroadcastChannel === "undefined") return;
      if (channels.has(d.id)) return;
      const ch = new BroadcastChannel(`${DAW_CH_PREFIX}${d.id}`);
      ch.onmessage = (ev) => onStatus?.(`${d.label} ← ${JSON.stringify(ev.data).slice(0, 40)}`);
      channels.set(d.id, ch);
    });
    await ensureMidi();
    onStatus(`daw · ${daws.length} targets · ${linked.size} linked`);
    return daws;
  }

  async function ensureMidi() {
    if (!navigator.requestMIDIAccess) return null;
    try {
      midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      const outs = [...midiAccess.outputs.values()];
      if (outs.length && !midiOut) midiOut = outs[0];
      midiAccess.onstatechange = () => {
        const outs2 = [...midiAccess.outputs.values()];
        if (!midiOut && outs2.length) midiOut = outs2[0];
      };
    } catch (_) {}
    return midiAccess;
  }

  function listDaws() {
    return daws.map((d) => ({
      id: d.id,
      label: d.label,
      repo: d.repo,
      role: d.role,
      linked: linked.has(d.id),
    }));
  }

  function isLinked(id) {
    return linked.has(id);
  }

  function linkDaw(id, on = true) {
    if (on) linked.add(id);
    else linked.delete(id);
    localStorage.setItem("qbpm-daw-linked", JSON.stringify([...linked]));
    onStatus(`${on ? "link" : "unlink"} · ${daws.find((d) => d.id === id)?.label || id}`);
    return linked.has(id);
  }

  function sendMidiNote(note, velocity = 90, durationMs = 200) {
    if (!midiOut) return false;
    const statusOn = 0x90;
    const statusOff = 0x80;
    const ch = 0;
    midiOut.send([statusOn | ch, note & 0x7f, velocity & 0x7f]);
    onMidiNote?.({ note, velocity });
    setTimeout(() => midiOut?.send([statusOff | ch, note & 0x7f, 0]), durationMs);
    return true;
  }

  function patternToMidi(payload) {
    const notes = [];
    const bpm = payload?.bpm || 120;
    if (payload?.notes?.length) {
      payload.notes.forEach((n) => {
        const k = n.note?.match(/^([A-G]#?)(\d)$/);
        if (!k) return;
        const letter = k[1];
        const oct = parseInt(k[2], 10);
        const idx = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(letter);
        if (idx < 0) return;
        notes.push({ midi: (oct + 1) * 12 + idx, beat: n.beat ?? 0 });
      });
    }
    if (!notes.length && payload?.pattern?.pads) {
      const padNotes = [36, 38, 42, 46, 48, 50, 52, 55];
      Object.entries(payload.pattern.pads).forEach(([padId, steps]) => {
        steps.forEach((on, i) => {
          if (on) notes.push({ midi: padNotes[Number(padId) % padNotes.length] || 36, beat: i / 4 });
        });
      });
    }
    return { notes, bpm };
  }

  function sendToDaw(dawId, payload, meta = {}) {
    const daw = daws.find((d) => d.id === dawId);
    if (!daw) return { ok: false, error: "unknown daw" };

    const msg = {
      type: "qbpm-pattern",
      ts: performance.now(),
      source: "qbpm-music-lab",
      dawId,
      daw: daw.label,
      payload,
      ...meta,
    };

    const ch = channels.get(dawId);
    if (ch) {
      try {
        ch.postMessage(msg);
      } catch (_) {}
    }

    try {
      const live = new BroadcastChannel(LIVE_CH);
      live.postMessage({ ...msg, state: payload });
      live.close();
    } catch (_) {}

    getTdBridge()?.sendOsc?.(`/qbpm/daw/${dawId}/pattern`, [payload?.bpm || 120, payload?.musica?.length || 0]);
    getTdBridge()?.sendOsc?.(`/qbpm/daw/${dawId}/bpm`, [payload?.bpm || 120]);

    if (linked.has(dawId) || daw.role === "midi") {
      const { notes, bpm } = patternToMidi(payload);
      notes.slice(0, 16).forEach((n) => {
        const delay = (n.beat / (bpm / 60)) * 1000;
        setTimeout(() => sendMidiNote(n.midi, 88, 160), Math.min(delay, 4000));
      });
    }

    if (ingestLive) {
      ingestLive(payload, `daw:${dawId}`).catch(() => {});
    }

    onStatus(`→ ${daw.label} · ${payload?.musica?.slice(0, 28) || "pattern"}`);
    return { ok: true, daw: daw.label, msg };
  }

  function sendToAllLinked(payload) {
    const results = [];
    for (const id of linked) {
      results.push(sendToDaw(id, payload));
    }
    return results;
  }

  function openDawRepo(id) {
    const daw = daws.find((d) => d.id === id);
    if (daw?.repo) window.open(daw.repo, "_blank", "noopener");
    return daw?.repo || null;
  }

  function destroy() {
    channels.forEach((ch) => ch.close());
    channels.clear();
  }

  return {
    init,
    listDaws,
    isLinked,
    linkDaw,
    sendToDaw,
    sendToAllLinked,
    sendMidiNote,
    patternToMidi,
    openDawRepo,
    getMidiOutputs: () => (midiAccess ? [...midiAccess.outputs.values()] : []),
    destroy,
  };
}