import { HexBridge, buildRoomShareUrl, parseRoomFromUrl, generateRoomId, ffmpegCommands, STACK_LINKS } from './hex-bridge.js';

export function initStreamPanel(getAppState, getActiveNotes, getOverlayCanvas) {
  const bridge = new HexBridge();
  let roomId = parseRoomFromUrl() || localStorage.getItem('pb-room') || null;

  const $ = (s) => document.querySelector(s);

  async function buildOverviewRoomUrl(id) {
    if (!id || typeof LZString === 'undefined') return STACK_LINKS.overview;
    const json = JSON.stringify({ v: 1, room: id, peer: `peer:piano` });
    const lzBody = { v: 1, m: 'lz', p: LZString.compressToEncodedURIComponent(json) };
    const bytes = new TextEncoder().encode(JSON.stringify(lzBody));
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const payload = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    return `${STACK_LINKS.overview}#vfl-room=${payload}`;
  }

  async function updateRoomUI() {
    const url = roomId ? buildRoomShareUrl(roomId) : '';
    const overviewUrl = roomId ? await buildOverviewRoomUrl(roomId) : STACK_LINKS.overview;
    $('#room-id-display').textContent = roomId || '—';
    $('#room-share-url').value = url;
    $('#overview-room-url').value = overviewUrl;
    if (roomId) bridge.setRoom(roomId);
  }

  function syncFfmpegCommands() {
    const cmds = ffmpegCommands({ roomId: roomId || 'lesson', device: '0' });
    $('#ffmpeg-camera-cmd').textContent = cmds.cameraMac;
    $('#ffmpeg-obs-cmd').textContent = cmds.obsSpaces;
  }

  $('#btn-new-room')?.addEventListener('click', async () => {
    roomId = generateRoomId();
    localStorage.setItem('pb-room', roomId);
    await updateRoomUI();
    syncFfmpegCommands();
    $('#stream-status').textContent = 'New room created — send link to Grandma!';
  });

  $('#btn-copy-room')?.addEventListener('click', async () => {
    if (!roomId) { $('#btn-new-room').click(); return; }
    await navigator.clipboard?.writeText(buildRoomShareUrl(roomId));
    $('#stream-status').textContent = 'Room link copied 💌';
  });

  $('#btn-copy-overview')?.addEventListener('click', async () => {
    const url = $('#overview-room-url').value;
    await navigator.clipboard?.writeText(url);
    $('#stream-status').textContent = 'Overview room link copied (Video Feeds Lab)';
  });

  $('#btn-broadcast')?.addEventListener('click', () => {
    if (!roomId) { $('#btn-new-room').click(); }
    if (bridge.broadcasting) {
      bridge.stopBroadcast();
      $('#btn-broadcast').textContent = '📡 Start hexcast';
      $('#btn-broadcast').classList.remove('active-stream');
      $('#stream-status').textContent = 'Broadcast stopped';
    } else {
      bridge.startBroadcast();
      $('#btn-broadcast').textContent = '⏹ Stop hexcast';
      $('#btn-broadcast').classList.add('active-stream');
      $('#stream-status').textContent = 'Broadcasting to hexcast-stream + overview room';
    }
  });

  $('#btn-receive')?.addEventListener('click', () => {
    if (!roomId) { $('#btn-new-room').click(); }
    if (bridge.receiving) {
      bridge.stopReceive();
      $('#btn-receive').textContent = '👀 Grandma watch';
      $('#grandma-view-wrap').style.display = 'none';
      $('#stream-status').textContent = 'Receive stopped';
    } else {
      bridge.startReceive();
      $('#btn-receive').textContent = '⏹ Stop watching';
      $('#grandma-view-wrap').style.display = 'block';
      $('#stream-status').textContent = 'Watching hexcast + piano state…';
    }
  });

  bridge.onHexFrame = (msg) => {
    const canvas = $('#grandma-hex-canvas');
    if (canvas) bridge.drawHexFrame(canvas, msg.hex, msg.res, msg.mode);
    $('#grandma-feed-key').textContent = msg.feedKey || 'piano-buddy';
  };

  bridge.onPianoState = (msg) => {
    $('#grandma-song-title').textContent = msg.songTitle || '—';
    $('#grandma-beat').textContent = msg.beat?.toFixed(1) ?? '—';
    if (msg.activeNotes?.length) {
      $('#grandma-notes').innerHTML = msg.activeNotes.map((n) =>
        `<span class="note-pill" style="background:${n.color};color:#000">${n.name}</span>`
      ).join(' ');
    } else {
      $('#grandma-notes').innerHTML = '<span style="color:var(--muted)">…</span>';
    }
  };

  $('#btn-copy-ffmpeg')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText($('#ffmpeg-camera-cmd').textContent);
    $('#stream-status').textContent = 'ffmpeg camera command copied';
  });

  $('#btn-kbatch-sync')?.addEventListener('click', () => {
    const st = getAppState();
    if (window.kbatch?.analyze) {
      const noteStr = st.song.notes.map((n) => String.fromCharCode(67 + (n.midi % 12))).join('');
      const analysis = window.kbatch.analyze(noteStr.slice(0, 32) || 'CDEFG');
      $('#stream-status').textContent = `kbatch synced · WPM lane open · ${analysis?.efficiency?.toFixed?.(0) || '—'}% eff`;
    } else {
      window.open(STACK_LINKS.kbatch + '?tab=musica', '_blank');
      $('#stream-status').textContent = 'Opened kbatch Musica tab — type along to sync';
    }
  });

  $('#hex-fps')?.addEventListener('input', (e) => {
    bridge.fps = parseInt(e.target.value, 10);
    $('#hex-fps-val').textContent = bridge.fps;
  });

  // Publish loop hook — called from app.js animation tick
  function publishFrame(videoEl) {
    if (!bridge.broadcasting) return;
    const overlay = getOverlayCanvas();
    bridge.publishComposite(videoEl, overlay);
    const st = getAppState();
    const notes = getActiveNotes();
    bridge.publishPianoState({
      songTitle: st.song.title,
      beat: st.beat,
      playing: st.playing,
      tempo: st.song.tempo,
      activeNotes: notes.map((n) => ({
        midi: n.midi,
        name: n.name,
        color: n.color,
      })),
    });
  }

  function pushMusicaToKbatch() {
    const st = getAppState();
    if (!window.kbatch) return null;
    const text = st.song.notes.map((n) => 'CDEFGAB'[n.midi % 12]).join(' ');
    return window.kbatch.analyze?.(text) || null;
  }

  updateRoomUI().then(syncFfmpegCommands);

  return { bridge, publishFrame, pushMusicaToKbatch };
}
