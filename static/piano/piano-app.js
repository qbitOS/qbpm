import { SONGS, ALBUMS, readySongs, albumFor, colorForMidi, MIDI_TO_NAME, NAME_TO_MIDI, NOTE_COLORS } from './songs.js';
import { initStreamPanel } from './stream-panel.js';
import { STACK_LINKS } from './hex-bridge.js';

// ─── State ───────────────────────────────────────────────────────────────────
const state = {
  song: readySongs()[0] || SONGS.find((s) => s.notes?.length) || SONGS[0],
  albumFilter: localStorage.getItem('qbpm-piano-album') || 'all',
  albumSort: localStorage.getItem('qbpm-piano-album-sort') || 'order',
  playing: false,
  beat: 0,
  startTime: 0,
  role: localStorage.getItem('qbpm-piano-role') || 'kid',
  stars: JSON.parse(localStorage.getItem('qbpm-piano-stars') || '{}'),
  stickers: JSON.parse(localStorage.getItem('qbpm-piano-stickers') || '[]'),
  cal: JSON.parse(localStorage.getItem('qbpm-piano-cal') || JSON.stringify({
    startMidi: 48, endMidi: 72, offsetX: 0, keyWidth: 1, flipH: true, flipV: false, brightness: 1,
  })),
  camCal: JSON.parse(localStorage.getItem('qbpm-piano-cam-cal') || JSON.stringify({
    left: 0.05, top: 0.55, width: 0.9, height: 0.35,
  })),
  customLessons: JSON.parse(localStorage.getItem('qbpm-piano-lessons') || '[]'),
  grandmaMsg: '',
  tempoMultiplier: parseFloat(localStorage.getItem('qbpm-piano-speed-mult') || '1'),
  dockFlipH: localStorage.getItem('qbpm-piano-dock-flip') === '1',
  phoneRotate: localStorage.getItem('qbpm-piano-phone-rotate') === '1',
  lastGuideMidi: null,
};

let rafId = null;
let wakeLock = null;
let audioCtx = null;
let cameraStream = null;
let streamPanel = null;

const PX_PER_BEAT = 50;
const SCORE_PAD_X = 28;

function beatToX(beat) {
  return SCORE_PAD_X + beat * PX_PER_BEAT;
}

function scoreContentWidth(song) {
  if (!isPlayable(song)) return 320;
  return Math.max(320, beatToX(songDuration(song)) + 48);
}

// ─── DOM ─────────────────────────────────────────────────────────────────────
let PIANO_ROOT = null;
const $ = (s) => {
  const el = PIANO_ROOT || document;
  return s.startsWith('#') ? el.querySelector(s) : el.querySelector(s);
};
const $$ = (s) => (PIANO_ROOT || document).querySelectorAll(s);

// ─── Init ────────────────────────────────────────────────────────────────────
function init() {
  loadSharedLesson();
  renderAlbumControls();
  renderSongList();
  renderNotation(state.song);
  bindTabs();
  bindControls();
  bindCalibration();
  bindShare();
  bindBuilder();
  updateRoleUI();
  updateStickers();
  initLegend();
  updateDockSong(state.song);
  requestAnimationFrame(() => {
    drawMiniKeyboard();
    resizeKeymap();
    resizePianoRoll();
    syncVisuals(0);
  });
  applyDockView();
  detectPhoneLandscape();
  window.addEventListener('resize', () => {
    resizeKeymap();
    resizePianoRoll();
    detectPhoneLandscape();
    renderNotation(state.song);
    syncVisuals(state.beat);
  });

  streamPanel = initStreamPanel(
    () => state,
    () => activeNotesForStream(state.song, state.beat),
    () => $('#camera-overlay'),
  );

  // Prevent sleep during mirror
  document.addEventListener('visibilitychange', () => {
    if (state.playing && document.visibilityState === 'visible') tryWakeLock();
  });
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
function bindTabs() {
  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach((t) => t.classList.remove('active'));
      $$('.panel').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $(`#panel-${tab.dataset.panel}`)?.classList.add('active');
      if (tab.dataset.panel === 'camera' || tab.dataset.panel === 'live') startCamera();
      else stopCamera();
    });
  });
}

// ─── Song list ───────────────────────────────────────────────────────────────
function isPlayable(song) {
  return song.status !== 'placeholder' && (song.notes?.length ?? 0) > 0;
}

function sortedAlbums() {
  const albums = [...ALBUMS];
  if (state.albumSort === 'title') {
    albums.sort((a, b) => a.title.localeCompare(b.title));
  } else if (state.albumSort === 'year') {
    albums.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.order ?? 99) - (b.order ?? 99));
  } else {
    albums.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }
  return albums;
}

function songsInAlbum(albumId) {
  return SONGS.filter((s) => s.albumId === albumId);
}

function appendSongButton(list, song) {
  const playable = isPlayable(song);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'song-btn'
    + (song.id === state.song.id ? ' selected' : '')
    + (playable ? '' : ' is-placeholder');
  btn.innerHTML = `
    <span class="emoji">${song.emoji || '🎹'}</span>
    <span class="info">
      <div class="title">${song.title}</div>
      <div class="meta">${playable
    ? `${song.tempo} BPM · ${song.notes.length} notes${song.message ? ' · 💌' : ''}`
    : 'Coming soon'}</div>
    </span>`;
  btn.addEventListener('click', () => selectSong(song));
  list.appendChild(btn);
}

function renderSongList() {
  const list = $('#song-list');
  list.innerHTML = '';

  const custom = state.customLessons.filter((s) => !s.albumId);
  const albums = state.albumFilter === 'all'
    ? sortedAlbums()
    : sortedAlbums().filter((a) => a.id === state.albumFilter);

  albums.forEach((album) => {
    const tracks = songsInAlbum(album.id);
    if (!tracks.length) return;

    const head = document.createElement('div');
    head.className = 'album-header';
    head.innerHTML = `
      <span class="album-title">${album.title}</span>
      <span class="album-artist">${album.artist}${album.year ? ` · ${album.year}` : ''}</span>`;
    list.appendChild(head);
    tracks.forEach((song) => appendSongButton(list, song));
  });

  if (custom.length) {
    const head = document.createElement('div');
    head.className = 'album-header';
    head.innerHTML = '<span class="album-title">Family</span><span class="album-artist">Shared lessons</span>';
    list.appendChild(head);
    custom.forEach((song) => appendSongButton(list, song));
  }
}

function renderAlbumControls() {
  const filter = $('#album-filter');
  const sort = $('#album-sort');
  if (!filter) return;

  const selected = filter.value || state.albumFilter;
  filter.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = 'all';
  allOpt.textContent = 'All albums';
  filter.appendChild(allOpt);
  sortedAlbums().forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.title;
    filter.appendChild(opt);
  });
  filter.value = [...filter.options].some((o) => o.value === selected) ? selected : 'all';
  state.albumFilter = filter.value;
  if (sort) sort.value = state.albumSort;
}

function selectSong(song) {
  state.song = song;
  resetPlayback();
  renderSongList();
  renderNotation(song);
  updateDockSong(song);
  syncVisuals(0);
  $('#tempo-slider').value = song.tempo;
  $('#tempo-val').textContent = effectiveTempo();
  $('#grandma-msg-display').textContent = song.message || '';
}

function updateDockSong(song) {
  $('#dock-song-emoji').textContent = song.emoji || '🎹';
  $('#dock-song-title').textContent = song.title;
  const album = song.albumId ? albumFor(song.albumId) : null;
  const author = song.author || album?.artist || '';
  if (author) {
    $('#dock-song-title').textContent = `${song.title} — ${author}`;
  }
  updateMeasureLabel(state.beat);
  const playable = isPlayable(song);
  $('#dock-play-btn').disabled = !playable;
  $('#play-btn').disabled = !playable;
}

function effectiveTempo() {
  return Math.round(state.song.tempo * state.tempoMultiplier);
}

function beatDurationSec() {
  return 60 / effectiveTempo();
}

function getMeasures(song) {
  const [num] = song.timeSignature.split('/').map(Number);
  const beatsPerMeasure = num || 4;
  const total = songDuration(song);
  const measures = [];
  for (let start = 0; start < total; start += beatsPerMeasure) {
    measures.push({ start, end: Math.min(start + beatsPerMeasure, total), index: measures.length });
  }
  return measures.length ? measures : [{ start: 0, end: total, index: 0 }];
}

function measureAtBeat(beat) {
  const measures = getMeasures(state.song);
  return measures.find((m) => beat >= m.start && beat < m.end) || measures[measures.length - 1];
}

function updateMeasureLabel(beat) {
  const m = measureAtBeat(beat);
  const eff = effectiveTempo();
  $('#dock-song-meta').innerHTML =
    `${eff} BPM · ${state.song.timeSignature} · <span id="dock-measure">m${m.index + 1}</span>`;
}

function initLegend() {
  $$('.legend-chip').forEach((chip) => {
    const n = chip.dataset.note;
    if (n && NOTE_COLORS[n]) {
      chip.style.borderColor = NOTE_COLORS[n];
      chip.dataset.color = NOTE_COLORS[n];
    }
  });
}

// ─── Playback engine ─────────────────────────────────────────────────────────
function songDuration(song) {
  if (!song.notes?.length) return 0;
  return Math.max(...song.notes.map((n) => n.beat + n.duration), 0);
}

function activeNotes(song, beat) {
  return song.notes.filter((n) => n.beat <= beat && n.beat + n.duration > beat);
}

function activeNotesForStream(song, beat) {
  return activeNotes(song, beat).map((n) => ({
    midi: n.midi,
    name: MIDI_TO_NAME(n.midi),
    color: colorForMidi(n.midi),
  }));
}

function updateTransportUI() {
  const label = state.playing ? '⏸' : '▶';
  $('#play-btn').textContent = state.playing ? '⏸ Pause' : '▶ Play';
  $('#dock-play-btn').textContent = label;
}

function startPlayback(fromBeat = state.beat) {
  state.playing = true;
  state.beat = fromBeat;
  state.startTime = performance.now() - fromBeat * beatDurationSec() * 1000;
  state.lastGuideMidi = null;
  updateTransportUI();
  tryWakeLock();
  tick();
}

function pausePlayback() {
  state.playing = false;
  if (rafId) cancelAnimationFrame(rafId);
  updateTransportUI();
  releaseWakeLock();
}

function resetPlayback() {
  pausePlayback();
  state.beat = 0;
  state.lastGuideMidi = null;
  $('#progress-fill').style.width = '0%';
  $('#now-playing').innerHTML = '';
  syncVisuals(0);
  updateMeasureLabel(0);
}

function restartPlayback() {
  const wasPlaying = state.playing;
  pausePlayback();
  state.beat = 0;
  state.lastGuideMidi = null;
  syncVisuals(0);
  if (wasPlaying) startPlayback(0);
  else {
    $('#progress-fill').style.width = '0%';
    updateMeasureLabel(0);
  }
}

function seekToBeat(beat) {
  const total = songDuration(state.song);
  state.beat = Math.max(0, Math.min(beat, total - 0.001));
  state.lastGuideMidi = null;
  if (state.playing) {
    state.startTime = performance.now() - state.beat * beatDurationSec() * 1000;
  }
  const pct = (state.beat / total) * 100;
  $('#progress-fill').style.width = `${pct}%`;
  syncVisuals(state.beat);
  updateMeasureLabel(state.beat);
}

function seekMeasure(delta) {
  const measures = getMeasures(state.song);
  const cur = measureAtBeat(state.beat);
  const idx = Math.max(0, Math.min(measures.length - 1, cur.index + delta));
  seekToBeat(measures[idx].start);
}

function togglePlayback() {
  if (!isPlayable(state.song)) return;
  if (state.playing) pausePlayback();
  else startPlayback(state.beat);
}

function tick() {
  if (!state.playing) return;
  const elapsed = (performance.now() - state.startTime) / 1000;
  state.beat = elapsed / beatDurationSec();
  const total = songDuration(state.song);

  if (state.beat >= total) {
    onSongComplete();
    return;
  }

  const pct = (state.beat / total) * 100;
  $('#progress-fill').style.width = `${pct}%`;
  updateMeasureLabel(state.beat);

  const active = activeNotes(state.song, state.beat);
  updateNowPlaying(active);
  syncVisuals(state.beat, active);
  maybePlayGuideTone(active);

  const video = $('#camera-video');
  if (video?.style.display !== 'none') streamPanel?.publishFrame(video);

  rafId = requestAnimationFrame(tick);
}

function syncVisuals(beat, activeNotesArr) {
  const active = activeNotesArr || activeNotes(state.song, beat);
  drawKeymap(active);
  drawPianoRoll(beat);
  updateLegendHighlight(active);
  drawMirrorKeys(active);
  drawCameraOverlay(active);
  highlightNotation(beat);
  highlightLetterLabels(beat);
  updatePlayhead(beat);
  scrollNotationToBeat(beat);
}

function maybePlayGuideTone(active) {
  if (!active.length) return;
  const midi = active[0].midi;
  if (midi !== state.lastGuideMidi) {
    state.lastGuideMidi = midi;
    playTone(midi, Math.min(0.5, active[0].duration * beatDurationSec()));
  }
}

function updateNowPlaying(notes) {
  const el = $('#now-playing');
  if (!notes.length) { el.innerHTML = '<span style="color:var(--muted)">…</span>'; return; }
  el.innerHTML = notes.map((n) => {
    const c = colorForMidi(n.midi);
    const name = MIDI_TO_NAME(n.midi);
    return `<span class="note-pill" style="background:${c};color:#000">${name}</span>`;
  }).join(' ');
}

function onSongComplete() {
  pausePlayback();
  const id = state.song.id;
  state.stars[id] = (state.stars[id] || 0) + 1;
  localStorage.setItem('qbpm-piano-stars', JSON.stringify(state.stars));
  unlockSticker(id);
  showCelebrate();
  updateStickers();
}

function showCelebrate() {
  const ov = $('#celebrate');
  ov.classList.add('active');
  const count = state.stars[state.song.id] || 1;
  $('#celebrate-text').textContent = `Complete — ${count} run${count === 1 ? '' : 's'}`;
  setTimeout(() => ov.classList.remove('active'), 3000);
}

// ─── Audio feedback (optional guide tones) ───────────────────────────────────
function playTone(midi, dur = 0.3) {
  if (!$('#guide-audio').checked) return;
  if (!audioCtx) audioCtx = new AudioContext();
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.frequency.value = freq;
  osc.type = 'sine';
  gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + dur);
}

// ─── VexFlow notation + letter row ───────────────────────────────────────────
function renderNotation(song) {
  const container = $('#notation-container');
  const lettersLayer = $('#notation-letters');
  container.innerHTML = '';
  if (lettersLayer) lettersLayer.innerHTML = '';

  if (typeof Vex === 'undefined') {
    container.innerHTML = '<p style="color:#666;padding:20px">Loading notation…</p>';
    return;
  }

  if (!isPlayable(song)) {
    container.innerHTML = '<p class="notation-placeholder">Chart coming soon — pick a ready song to play along.</p>';
    container._staveNotes = null;
    container._width = 0;
    $('#notation-scroll')?.classList.remove('has-narrow-score');
    $('#piano-roll-scroll')?.classList.remove('has-narrow-score');
    resizePianoRoll();
    drawPianoRoll(0);
    return;
  }

  const { Renderer, Stave, StaveNote, Voice, Formatter, Accidental } = Vex.Flow;
  const scrollW = $('#notation-scroll')?.clientWidth || 400;
  const width = Math.max(scrollW, scoreContentWidth(song));
  const height = 108;
  const renderer = new Renderer(container, Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new Stave(10, 32, width - 20);
  const [num, den] = song.timeSignature.split('/').map(Number);
  stave.addClef('treble').addTimeSignature(song.timeSignature);
  stave.setContext(ctx).draw();

  const staveNotes = [];
  const measures = getMeasures(song);

  song.notes.forEach((n) => {
    const name = MIDI_TO_NAME(n.midi);
    const letter = name.replace(/\d/, '');
    const octave = name.match(/\d/)[0];
    const isSharp = letter.includes('#');
    const baseLetter = letter.replace('#', '');

    let duration = 'q';
    if (n.duration <= 0.375) duration = '8';
    else if (n.duration <= 1.6) duration = n.duration <= 1.1 ? 'q' : 'h';
    else duration = 'w';

    const sn = new StaveNote({ clef: 'treble', keys: [`${baseLetter}/${octave}`], duration });
    if (isSharp) sn.addModifier(new Accidental('#'), 0);
    const color = colorForMidi(n.midi);
    sn.setStyle({ fillStyle: color, strokeStyle: color });
    sn._beat = n.beat;
    sn._duration = n.duration;
    sn._midi = n.midi;
    sn._letter = letter;
    staveNotes.push(sn);
  });

  if (!staveNotes.length) return;

  const voice = new Voice({ num_beats: Math.ceil(songDuration(song)), beat_value: den });
  voice.setStrict(false);
  voice.addTickables(staveNotes);
  new Formatter().joinVoices([voice]).format([voice], width - 60);
  voice.draw(ctx, stave);

  container._staveNotes = staveNotes;
  container._width = width;
  container._measures = measures;

  alignNotesToBeats(staveNotes);

  const viewport = $('#notation-viewport');
  const scroll = $('#notation-scroll');
  const rollScroll = $('#piano-roll-scroll');
  if (viewport) viewport.style.width = `${width}px`;
  const narrow = width <= scrollW;
  if (scroll) scroll.classList.toggle('has-narrow-score', narrow);
  if (rollScroll) rollScroll.classList.toggle('has-narrow-score', narrow);

  resizePianoRoll();
  requestAnimationFrame(() => {
    placeLetterLabels(staveNotes);
    syncVisuals(state.beat);
  });
}

function alignNotesToBeats(staveNotes) {
  staveNotes.forEach((sn) => {
    const el = sn.attrs?.el;
    if (!el) return;
    const targetX = beatToX(sn._beat);
    const currentX = getNoteCenterX(sn);
    if (currentX == null) return;
    const dx = targetX - currentX;
    sn._x = targetX;
    sn._dx = dx;
    el.style.transform = `translateX(${dx}px)`;
    el.style.transformOrigin = 'center bottom';
  });
}

function placeLetterLabels(staveNotes) {
  const lettersLayer = $('#notation-letters');
  const container = $('#notation-container');
  if (!lettersLayer || !container) return;
  lettersLayer.innerHTML = '';
  lettersLayer.style.width = `${container._width || container.offsetWidth}px`;

  staveNotes.forEach((sn, i) => {
    const noteEl = sn.attrs?.el;
    if (!noteEl) return;
    let cx;
    try {
      const bb = noteEl.getBBox();
      const root = container.querySelector('svg');
      if (root) {
        const pt = root.createSVGPoint();
        pt.x = bb.x + bb.width / 2;
        pt.y = bb.y;
        const ctm = noteEl.getCTM();
        if (ctm) {
          const sp = pt.matrixTransform(ctm);
          cx = sp.x;
        } else cx = bb.x + bb.width / 2;
      } else cx = bb.x + bb.width / 2;
    } catch (_) {
      cx = 40 + i * 48;
    }

    const span = document.createElement('span');
    span.className = 'note-letter';
    span.dataset.beat = String(sn._beat);
    span.dataset.duration = String(sn._duration);
    span.dataset.midi = String(sn._midi);
    span.textContent = sn._letter;
    span.style.color = colorForMidi(sn._midi);
    span.style.left = `${sn._x ?? beatToX(sn._beat)}px`;
    lettersLayer.appendChild(span);
  });

  highlightLetterLabels(state.beat);
  updatePlayhead(state.beat);
}

function highlightNotation(beat) {
  const container = $('#notation-container');
  if (!container._staveNotes) return;
  container._staveNotes.forEach((sn) => {
    const el = sn.attrs?.el;
    if (!el) return;
    const dur = sn._duration ?? 1;
    const active = sn._beat <= beat && sn._beat + dur > beat;
    const upcoming = !active && sn._beat > beat && sn._beat <= beat + 2;
    const dx = sn._dx ?? 0;
    el.style.opacity = active ? '1' : upcoming ? '0.7' : '0.38';
    el.style.filter = active ? 'drop-shadow(0 0 8px ' + colorForMidi(sn._midi) + ')' : 'none';
    el.style.transform = active ? `translateX(${dx}px) scale(1.05)` : `translateX(${dx}px)`;
    el.style.transformOrigin = 'center bottom';
  });
}

function getNoteCenterX(sn) {
  const container = $('#notation-container');
  const noteEl = sn?.attrs?.el;
  if (!noteEl || !container) return null;
  try {
    const bb = noteEl.getBBox();
    const root = container.querySelector('svg');
    if (root) {
      const pt = root.createSVGPoint();
      pt.x = bb.x + bb.width / 2;
      const ctm = noteEl.getCTM();
      if (ctm) return pt.matrixTransform(ctm).x;
    }
    return bb.x + bb.width / 2;
  } catch (_) {
    return null;
  }
}

function getLetterCenterX(beat) {
  const letters = $$(`.note-letter`);
  for (const el of letters) {
    const b = parseFloat(el.dataset.beat);
    const d = parseFloat(el.dataset.duration);
    if (beat >= b && beat < b + d) {
      return parseFloat(el.style.left) || null;
    }
  }
  return beatXAt(beat);
}

function beatXAt(beat) {
  const container = $('#notation-container');
  const hit = container?._staveNotes?.find((sn) => {
    const dur = sn._duration ?? 1;
    return sn._beat <= beat && sn._beat + dur > beat;
  });
  if (hit) {
    const progress = (beat - hit._beat) / (hit._duration || 1);
    const x0 = hit._x ?? beatToX(hit._beat);
    const idx = container._staveNotes.indexOf(hit);
    const next = container._staveNotes[idx + 1];
    if (next && progress > 0) {
      const x1 = next._x ?? beatToX(next._beat);
      return x0 + (x1 - x0) * Math.min(1, progress);
    }
    return x0 + progress * PX_PER_BEAT * (hit._duration || 1);
  }
  return beatToX(beat);
}

function updatePlayhead(beat) {
  const playhead = $('#notation-playhead');
  const container = $('#notation-container');
  if (!playhead || !container?._staveNotes) return;

  const hit = container._staveNotes.find((sn) => {
    const dur = sn._duration ?? 1;
    return sn._beat <= beat && sn._beat + dur > beat;
  });

  const x = beatXAt(beat);

  if (x != null) {
    playhead.style.left = `${x}px`;
    playhead.classList.add('visible');
  } else {
    playhead.classList.remove('visible');
  }
}

function highlightLetterLabels(beat) {
  $$(`.note-letter`).forEach((el) => {
    const b = parseFloat(el.dataset.beat);
    const d = parseFloat(el.dataset.duration);
    const active = beat >= b && beat < b + d;
    const upcoming = !active && b > beat && b <= beat + 2;
    el.classList.toggle('active', active);
    el.classList.toggle('upcoming', upcoming);
  });
}

function scrollNotationToBeat(beat) {
  const scroll = $('#notation-scroll');
  const container = $('#notation-container');
  if (!scroll || !container?._staveNotes) return;

  const contentW = container._width || scroll.scrollWidth;
  const viewW = scroll.clientWidth;
  if (contentW <= viewW) {
    scroll.scrollLeft = 0;
    const rollScroll = $('#piano-roll-scroll');
    if (rollScroll) rollScroll.scrollLeft = 0;
    return;
  }

  const hit = container._staveNotes.find((sn) => {
    const dur = sn._duration ?? 1;
    return sn._beat <= beat && sn._beat + dur > beat;
  });

  const x = beatXAt(beat);

  const target = x - viewW * 0.5;
  const maxScroll = Math.max(0, contentW - viewW);
  const scrollLeft = Math.max(0, Math.min(target, maxScroll));
  scroll.scrollLeft = scrollLeft;
  const rollScroll = $('#piano-roll-scroll');
  if (rollScroll) rollScroll.scrollLeft = scrollLeft;
}

// ─── Piano roll (time × pitch grid) ──────────────────────────────────────────
function resizePianoRoll() {
  const canvas = $('#piano-roll-canvas');
  const container = $('#notation-container');
  if (!canvas) return;
  const width = container?._width || scoreContentWidth(state.song);
  const dpr = devicePixelRatio || 1;
  canvas.style.width = `${width}px`;
  canvas.style.height = '88px';
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(88 * dpr));
}

function drawPianoRoll(beat) {
  const canvas = $('#piano-roll-canvas');
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!isPlayable(state.song)) {
    ctx.fillStyle = '#333';
    ctx.font = `${11 * dpr}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.fillText('Piano roll — pick a ready song', w / 2, h / 2);
    return;
  }

  const song = state.song;
  const midis = song.notes.map((n) => n.midi);
  const low = Math.min(...midis, state.cal.startMidi);
  const high = Math.max(...midis, state.cal.endMidi);
  const range = Math.max(1, high - low);
  const rowH = h / (range + 1);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, w, h);

  for (let m = low; m <= high; m++) {
    const row = high - m;
    const y = row * rowH;
    const isBlack = [1, 3, 6, 8, 10].includes(m % 12);
    ctx.fillStyle = isBlack ? '#141414' : '#1a1a1a';
    ctx.fillRect(0, y, w, rowH);
  }

  const [num] = song.timeSignature.split('/').map(Number);
  const beatsPerMeasure = num || 4;
  const total = songDuration(song);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  for (let b = 0; b <= total; b += beatsPerMeasure) {
    const x = beatToX(b) * dpr;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  song.notes.forEach((n) => {
    const row = high - n.midi;
    const x = beatToX(n.beat) * dpr;
    const nw = Math.max(4 * dpr, n.duration * PX_PER_BEAT * dpr - 2);
    const y = row * rowH + 1;
    const color = colorForMidi(n.midi);
    const active = n.beat <= beat && n.beat + n.duration > beat;
    const upcoming = !active && n.beat > beat && n.beat <= beat + 2;
    ctx.globalAlpha = active ? 1 : upcoming ? 0.75 : 0.45;
    ctx.fillStyle = color;
    if (active) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * dpr;
    }
    roundRect(ctx, x, y, nw, rowH - 2, 2 * dpr);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });

  const phX = beatXAt(beat) * dpr;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2 * dpr;
  ctx.beginPath();
  ctx.moveTo(phX, 0);
  ctx.lineTo(phX, h);
  ctx.stroke();
}

// ─── Live key map (always visible in score dock) ─────────────────────────────
function resizeKeymap() {
  const canvas = $('#keymap-canvas');
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
}

function drawKeymap(activeNotesArr) {
  const canvas = $('#keymap-canvas');
  if (!canvas?.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const dpr = devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const start = state.cal.startMidi;
  const end = state.cal.endMidi;
  const activeSet = new Set((activeNotesArr || []).map((n) => n.midi));
  const upcomingSet = new Set();
  if (state.playing) {
    state.song.notes
      .filter((n) => n.beat > state.beat && n.beat <= state.beat + 2)
      .forEach((n) => upcomingSet.add(n.midi));
  }

  const whiteMidis = [];
  for (let m = start; m <= end; m++) {
    if (![1, 3, 6, 8, 10].includes(m % 12)) whiteMidis.push(m);
  }
  const whiteW = w / Math.max(1, whiteMidis.length);

  whiteMidis.forEach((midi, wi) => {
    const x = wi * whiteW;
    const lit = activeSet.has(midi);
    const soon = upcomingSet.has(midi);
    const color = colorForMidi(midi);
    const names = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const letter = names[midi % 12];

    ctx.globalAlpha = lit ? 1 : soon ? 0.55 : 1;
    ctx.fillStyle = lit || soon ? color : '#e8e8f0';
    if (lit) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 16 * dpr;
    } else {
      ctx.shadowBlur = 0;
    }
    roundRect(ctx, x + 1, 4, whiteW - 2, h - 8, 4 * dpr);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    ctx.fillStyle = lit ? '#000' : soon ? color : '#666';
    ctx.font = `bold ${Math.max(9, whiteW * 0.28)}px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(letter, x + whiteW / 2, h - 6);
  });

  for (let midi = start; midi <= end; midi++) {
    if (![1, 3, 6, 8, 10].includes(midi % 12)) continue;
    const wi = whiteMidis.findIndex((m) => m > midi) - 1;
    const anchor = wi < 0 ? whiteMidis.length - 1 : wi;
    const x = anchor * whiteW + whiteW * 0.72;
    const bw = whiteW * 0.55;
    const lit = activeSet.has(midi);
    const soon = upcomingSet.has(midi);
    const color = colorForMidi(midi);

    ctx.globalAlpha = lit ? 1 : soon ? 0.7 : 1;
    ctx.fillStyle = lit ? color : soon ? '#444' : '#1a1a22';
    if (lit) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 * dpr;
    }
    roundRect(ctx, x, 4, bw, h * 0.58, 3 * dpr);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
}

function updateLegendHighlight(activeNotesArr) {
  const activeLetters = new Set(
    (activeNotesArr || []).map((n) => MIDI_TO_NAME(n.midi).replace(/\d/, '').replace('#', ''))
  );
  $$('.legend-chip').forEach((chip) => {
    const lit = activeLetters.has(chip.dataset.note);
    chip.classList.toggle('lit', lit);
    if (lit && chip.dataset.color) chip.style.borderColor = chip.dataset.color;
  });
}

// ─── Mirror mode (the phone-on-keys light trick) ─────────────────────────────
function openMirror() {
  const screen = $('#mirror-screen');
  screen.classList.add('active');
  tryWakeLock();
  resizeMirrorCanvas();
  const active = state.playing ? activeNotes(state.song, state.beat) : [];
  drawMirrorKeys(active);
  window.addEventListener('resize', resizeMirrorCanvas);
}

function closeMirror() {
  $('#mirror-screen').classList.remove('active');
  window.removeEventListener('resize', resizeMirrorCanvas);
  if (!state.playing) releaseWakeLock();
}

function resizeMirrorCanvas() {
  const canvas = $('#mirror-canvas');
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
}

function drawMirrorKeys(activeNotesArr) {
  const canvas = $('#mirror-canvas');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cal = state.cal;
  ctx.clearRect(0, 0, w, h);

  // Pure black background — maximizes key illumination
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);

  const activeSet = new Set((activeNotesArr || []).map((n) => n.midi));
  const start = cal.startMidi;
  const end = cal.endMidi;
  const totalKeys = end - start + 1;
  const baseKeyW = (w / totalKeys) * cal.keyWidth;
  const offsetPx = cal.offsetX * w;

  for (let midi = start; midi <= end; midi++) {
    const idx = midi - start;
    let x = offsetPx + idx * baseKeyW;
    let kw = baseKeyW * 0.92;

    if (cal.flipH) x = w - x - kw;

    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    const color = colorForMidi(midi);
    const lit = activeSet.has(midi);

    const keyH = isBlack ? h * 0.55 : h * 0.85;
    const keyY = cal.flipV ? 0 : h - keyH;

    if (lit) {
      // Bright glow for mirror illumination
      ctx.shadowColor = color;
      ctx.shadowBlur = 40 * cal.brightness;
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = isBlack ? '#111' : '#1a1a1a';
      ctx.globalAlpha = isBlack ? 0.6 : 0.35;
    }

    const rx = 4;
    roundRect(ctx, x, keyY, kw, keyH, rx);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (lit) {
      // Extra bright core
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.35;
      roundRect(ctx, x + kw * 0.15, keyY + keyH * 0.1, kw * 0.7, keyH * 0.25, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Upcoming notes preview strip at top
  if (state.playing) {
    drawUpcomingStrip(ctx, w, h * 0.08, activeSet);
  }
}

function drawUpcomingStrip(ctx, w, stripH, activeSet) {
  const upcoming = state.song.notes.filter((n) => n.beat > state.beat && n.beat <= state.beat + 4);
  if (!upcoming.length) return;
  upcoming.forEach((n, i) => {
    const color = colorForMidi(n.midi);
    const x = (i / 4) * w;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x, 0, w / 4 - 2, stripH);
  });
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Camera AR overlay ─────────────────────────────────────────────────────────
async function startCamera() {
  const video = $('#camera-video');
  const placeholder = $('#camera-placeholder');
  if (!navigator.mediaDevices?.getUserMedia) {
    placeholder.innerHTML = `Camera unavailable — use <a href="${STACK_LINKS.hexcast}" target="_blank" rel="noopener">hexcast</a> or <a href="${STACK_LINKS.overview}" target="_blank" rel="noopener">overview</a> on another device.`;
    return;
  }
  try {
    if (cameraStream) return;
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    video.srcObject = cameraStream;
    await video.play();
    placeholder.style.display = 'none';
    video.style.display = 'block';
    drawCameraOverlay(state.playing ? activeNotes(state.song, state.beat) : []);
  } catch (e) {
    placeholder.textContent = 'Camera access needed. Allow camera permission and try again.';
  }
}

function stopCamera() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  const video = $('#camera-video');
  video.srcObject = null;
  video.style.display = 'none';
  $('#camera-placeholder').style.display = 'flex';
}

function drawCameraOverlay(activeNotesArr) {
  const canvas = $('#camera-overlay');
  const wrap = canvas?.parentElement;
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width * devicePixelRatio;
  canvas.height = rect.height * devicePixelRatio;

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cal = state.camCal;
  const kx = cal.left * canvas.width;
  const ky = cal.top * canvas.height;
  const kw = cal.width * canvas.width;
  const kh = cal.height * canvas.height;

  const start = state.cal.startMidi;
  const end = state.cal.endMidi;
  const total = end - start + 1;
  const activeSet = new Set((activeNotesArr || []).map((n) => n.midi));

  for (let midi = start; midi <= end; midi++) {
    const idx = midi - start;
    const isBlack = [1, 3, 6, 8, 10].includes(midi % 12);
    const x = kx + (idx / total) * kw;
    const keyW = kw / total;
    const keyH = isBlack ? kh * 0.6 : kh;
    const keyY = isBlack ? ky : ky;
    const color = colorForMidi(midi);
    const lit = activeSet.has(midi);

    if (lit) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
    } else {
      ctx.fillStyle = isBlack ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.08)';
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
    ctx.fillRect(x, keyY, keyW - 1, keyH);
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // Calibration outline
  if ($('#show-cam-cal').checked) {
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(kx, ky, kw, kh);
    ctx.setLineDash([]);
  }
}

// ─── Calibration bindings ──────────────────────────────────────────────────────
function bindCalibration() {
  const fields = ['startMidi', 'endMidi', 'offsetX', 'keyWidth', 'brightness'];
  fields.forEach((f) => {
    const input = $(`#cal-${f}`);
    const val = $(`#cal-${f}-val`);
    if (!input) return;
    input.value = state.cal[f];
    val.textContent = formatCalVal(f, state.cal[f]);
    input.addEventListener('input', () => {
      state.cal[f] = parseFloat(input.value);
      val.textContent = formatCalVal(f, state.cal[f]);
      localStorage.setItem('qbpm-piano-cal', JSON.stringify(state.cal));
      drawMirrorKeys(activeNotes(state.song, state.beat));
      drawKeymap(activeNotes(state.song, state.beat));
    });
  });

  ['flipH', 'flipV'].forEach((f) => {
    const input = $(`#cal-${f}`);
    if (!input) return;
    input.checked = state.cal[f];
    input.addEventListener('change', () => {
      state.cal[f] = input.checked;
      localStorage.setItem('qbpm-piano-cal', JSON.stringify(state.cal));
      drawMirrorKeys([]);
    });
  });

  const camFields = ['left', 'top', 'width', 'height'];
  camFields.forEach((f) => {
    const input = $(`#cam-${f}`);
    const val = $(`#cam-${f}-val`);
    if (!input) return;
    input.value = state.camCal[f];
    val.textContent = state.camCal[f].toFixed(2);
    input.addEventListener('input', () => {
      state.camCal[f] = parseFloat(input.value);
      val.textContent = state.camCal[f].toFixed(2);
      localStorage.setItem('qbpm-piano-cam-cal', JSON.stringify(state.camCal));
      drawCameraOverlay([]);
    });
  });

  $('#show-cam-cal')?.addEventListener('change', () => drawCameraOverlay([]));
}

function formatCalVal(f, v) {
  if (f === 'startMidi' || f === 'endMidi') return MIDI_TO_NAME(Math.round(v));
  if (f === 'offsetX' || f === 'keyWidth' || f === 'brightness') return v.toFixed(2);
  return v;
}

function applyDockView() {
  const wrap = $('#score-dock-flip');
  const flipBtn = $('#dock-flip-btn');
  const rotBtn = $('#dock-rotate-btn');
  const landscape = window.innerWidth > window.innerHeight;
  if (wrap) {
    wrap.classList.toggle('is-flip-h', state.dockFlipH);
    wrap.classList.toggle('is-rotate', state.phoneRotate && !landscape);
  }
  if (flipBtn) flipBtn.classList.toggle('active', state.dockFlipH);
  if (rotBtn) rotBtn.classList.toggle('active', state.phoneRotate);
  document.body.classList.toggle('phone-rotate-mode', state.phoneRotate);
  requestAnimationFrame(() => {
    resizeKeymap();
    drawKeymap(activeNotes(state.song, state.beat));
  });
}

function detectPhoneLandscape() {
  const landscape = window.innerWidth > window.innerHeight && window.innerHeight < 520;
  document.body.classList.toggle('phone-landscape', landscape);
}

function setSpeedMultiplier(mult) {
  const wasPlaying = state.playing;
  const beat = state.beat;
  if (wasPlaying) pausePlayback();
  state.tempoMultiplier = mult;
  localStorage.setItem('qbpm-piano-speed-mult', String(mult));
  $$('.speed-chip').forEach((c) => c.classList.toggle('active', parseFloat(c.dataset.mult) === mult));
  $('#tempo-val').textContent = effectiveTempo();
  updateMeasureLabel(state.beat);
  if (wasPlaying) startPlayback(beat);
}

// ─── Controls ──────────────────────────────────────────────────────────────────
function safeBind(sel, event, fn) {
  const el = $(sel);
  if (el) el.addEventListener(event, fn);
}

function bindControls() {
  safeBind('#play-btn', 'click', togglePlayback);
  safeBind('#dock-play-btn', 'click', togglePlayback);
  safeBind('#restart-btn', 'click', restartPlayback);
  safeBind('#dock-restart-btn', 'click', restartPlayback);

  const prevM = () => seekMeasure(-1);
  const nextM = () => seekMeasure(1);
  safeBind('#measure-prev-btn', 'click', prevM);
  safeBind('#measure-next-btn', 'click', nextM);
  safeBind('#dock-measure-prev', 'click', prevM);
  safeBind('#dock-measure-next', 'click', nextM);

  safeBind('#mirror-btn', 'click', openMirror);
  safeBind('#dock-mirror-btn', 'click', openMirror);
  safeBind('#mirror-close', 'click', closeMirror);

  $('#dock-flip-btn')?.addEventListener('click', () => {
    state.dockFlipH = !state.dockFlipH;
    localStorage.setItem('qbpm-piano-dock-flip', state.dockFlipH ? '1' : '0');
    applyDockView();
  });

  $('#dock-rotate-btn')?.addEventListener('click', () => {
    state.phoneRotate = !state.phoneRotate;
    localStorage.setItem('qbpm-piano-phone-rotate', state.phoneRotate ? '1' : '0');
    applyDockView();
    tryWakeLock();
  });

  $('#phone-rotate-exit')?.addEventListener('click', () => {
    state.phoneRotate = false;
    localStorage.setItem('qbpm-piano-phone-rotate', '0');
    applyDockView();
  });

  const tempoSlider = $('#tempo-slider');
  if (tempoSlider) {
    tempoSlider.addEventListener('input', (e) => {
      const wasPlaying = state.playing;
      const beat = state.beat;
      if (wasPlaying) pausePlayback();
      state.song.tempo = parseInt(e.target.value, 10);
      const tv = $('#tempo-val');
      if (tv) tv.textContent = effectiveTempo();
      if (wasPlaying) startPlayback(beat);
    });
    tempoSlider.value = state.song.tempo;
  }
  const tempoVal = $('#tempo-val');
  if (tempoVal) tempoVal.textContent = effectiveTempo();

  $$('.speed-chip').forEach((chip) => {
    chip.classList.toggle('active', parseFloat(chip.dataset.mult) === state.tempoMultiplier);
    chip.addEventListener('click', () => setSpeedMultiplier(parseFloat(chip.dataset.mult)));
  });

  safeBind('#celebrate-dismiss', 'click', () => $('#celebrate')?.classList.remove('active'));
  $('#camera-placeholder')?.addEventListener('click', startCamera);

  $('#album-filter')?.addEventListener('change', (e) => {
    state.albumFilter = e.target.value;
    localStorage.setItem('qbpm-piano-album', state.albumFilter);
    renderSongList();
  });

  $('#album-sort')?.addEventListener('change', (e) => {
    state.albumSort = e.target.value;
    localStorage.setItem('qbpm-piano-album-sort', state.albumSort);
    renderAlbumControls();
    renderSongList();
  });
}

// ─── Share / family game ───────────────────────────────────────────────────────
function bindShare() {
  safeBind('#role-grandma', 'click', () => setRole('grandma'));
  safeBind('#role-kid', 'click', () => setRole('kid'));

  safeBind('#share-lesson', 'click', () => {
    const msg = $('#lesson-message').value.trim();
    const payload = {
      title: state.song.title,
      emoji: state.song.emoji,
      tempo: state.song.tempo,
      timeSignature: state.song.timeSignature,
      notes: state.song.notes,
      message: msg,
      author: state.role === 'grandma' ? 'Grandma' : 'Family',
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${location.origin}${location.pathname}?lesson=${encoded}`;
    $('#share-url').value = url;
    navigator.clipboard?.writeText(url);
    $('#share-status').textContent = 'Link copied! Send to your kid 💌';
  });

  safeBind('#send-stars', 'click', () => {
    const count = state.stars[state.song.id] || 0;
    const payload = { type: 'stars', song: state.song.title, stars: count, from: 'Player' };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
    const url = `${location.origin}${location.pathname}?stars=${encoded}`;
    navigator.clipboard?.writeText(url);
    $('#share-status').textContent = `⭐ Sent ${count} stars to Grandma! Link copied.`;
  });
}

function setRole(role) {
  state.role = role;
  localStorage.setItem('qbpm-piano-role', role);
  updateRoleUI();
}

function updateRoleUI() {
  $('#role-grandma').classList.toggle('btn-primary', state.role === 'grandma');
  $('#role-kid').classList.toggle('btn-primary', state.role === 'kid');
  $('#role-badge').textContent = state.role === 'grandma' ? 'Teacher' : 'Player';
  $('#role-badge').className = 'role-badge ' + state.role;
  $('#builder-card').style.display = state.role === 'grandma' ? 'block' : 'none';
}

function loadSharedLesson() {
  const params = new URLSearchParams(location.search);

  const lessonParam = params.get('lesson');
  if (lessonParam) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(lessonParam))));
      const lesson = { ...data, id: 'shared-' + Date.now() };
      state.customLessons.push(lesson);
      localStorage.setItem('qbpm-piano-lessons', JSON.stringify(state.customLessons));
      state.song = lesson;
      if (data.message) {
        $('#grandma-msg-display').textContent = '💌 ' + data.message;
      }
      history.replaceState({}, '', location.pathname);
    } catch (_) { /* ignore bad payload */ }
  }

  const starsParam = params.get('stars');
  if (starsParam) {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(starsParam))));
      $('#stars-received').textContent = `🧒 played "${data.song}" and earned ${data.stars} stars!`;
      history.replaceState({}, '', location.pathname);
    } catch (_) { /* ignore */ }
  }
}

// ─── Lesson builder (grandma) ──────────────────────────────────────────────────
const builderNotes = [];

function bindBuilder() {
  safeBind('#builder-clear', 'click', () => {
    builderNotes.length = 0;
    renderBuilderNotes();
    drawMiniKeyboard();
  });

  safeBind('#builder-save', 'click', () => {
    const title = $('#builder-title').value.trim() || 'Grandma\'s Song';
    const lesson = {
      id: 'custom-' + Date.now(),
      title,
      emoji: '💌',
      author: 'Grandma',
      tempo: parseInt($('#builder-tempo').value, 10) || 96,
      timeSignature: '4/4',
      notes: [...builderNotes],
      message: $('#lesson-message').value.trim(),
    };
    state.customLessons.push(lesson);
    localStorage.setItem('qbpm-piano-lessons', JSON.stringify(state.customLessons));
    builderNotes.length = 0;
    renderSongList();
    selectSong(lesson);
    $('#share-status').textContent = 'Lesson saved! Share the link below.';
  });
}

function renderBuilderNotes() {
  const el = $('#builder-notes');
  el.innerHTML = builderNotes.map((n, i) =>
    `<span style="color:${colorForMidi(n.midi)};margin-right:6px">${MIDI_TO_NAME(n.midi)}</span>`
  ).join('') || '<span style="color:var(--muted)">Tap keys below to add notes</span>';
}

function drawMiniKeyboard() {
  const kb = $('#mini-kb');
  if (!kb) return;
  kb.innerHTML = '';
  const start = 60, end = 72;
  const whiteKeys = [];
  for (let m = start; m <= end; m++) {
    if (![1,3,6,8,10].includes(m % 12)) whiteKeys.push(m);
  }
  whiteKeys.forEach((midi) => {
    const key = document.createElement('div');
    key.className = 'mini-key white';
    key.style.color = colorForMidi(midi);
    key.title = MIDI_TO_NAME(midi);
    key.addEventListener('click', () => addBuilderNote(midi));
    kb.appendChild(key);
  });
  const blackPositions = { 1: 0.7, 3: 1.7, 6: 3.7, 8: 4.7, 10: 5.7 };
  for (let m = start; m <= end; m++) {
    if (![1,3,6,8,10].includes(m % 12)) continue;
    const whiteIdx = [...Array(m - start).keys()].filter(i => ![1,3,6,8,10].includes((start + i) % 12)).length;
    const key = document.createElement('div');
    key.className = 'mini-key black';
    key.style.left = `${((whiteIdx + 0.72) / whiteKeys.length) * 100}%`;
    key.style.color = colorForMidi(m);
    key.title = MIDI_TO_NAME(m);
    key.addEventListener('click', () => addBuilderNote(m));
    kb.appendChild(key);
  }
}

function addBuilderNote(midi) {
  const beat = builderNotes.length;
  builderNotes.push({ midi, beat, duration: 1 });
  renderBuilderNotes();
  playTone(midi);
}

// ─── Stickers ──────────────────────────────────────────────────────────────────
const STICKER_MAP = {
  fixurface: '🎸', twinkle: '⭐', mary: '🐑', birthday: '🎂', ode: '🎵', scale: '🌈',
  levitating: '◇', witches: '🎃', celebrity: '◇',
};

function unlockSticker(songId) {
  const base = songId.replace(/^shared-|^custom-/, '').split('-')[0] || songId;
  const sticker = STICKER_MAP[base] || '🏆';
  if (!state.stickers.includes(sticker)) {
    state.stickers.push(sticker);
    localStorage.setItem('qbpm-piano-stickers', JSON.stringify(state.stickers));
  }
}

function updateStickers() {
  const grid = $('#sticker-grid');
  if (!grid) return;
  const all = ['🎸', '⭐', '🐑', '🎂', '🎵', '🌈', '🏆', '💌'];
  grid.innerHTML = all.map((s) =>
    `<div class="sticker${state.stickers.includes(s) ? ' unlocked' : ''}">${s}</div>`
  ).join('');
  const totalStars = Object.values(state.stars).reduce((a, b) => a + b, 0);
  $('#total-stars').textContent = '⭐'.repeat(Math.min(totalStars, 10)) + (totalStars > 10 ? ` +${totalStars - 10}` : '');
}

// ─── Wake lock ─────────────────────────────────────────────────────────────────
async function tryWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) { /* unsupported */ }
}

function releaseWakeLock() {
  wakeLock?.release();
  wakeLock = null;
}

export function mountPianoPanel(root) {
  PIANO_ROOT = root;
  init();
}

// Expose for mirror animation loop when playing in mirror mode
setInterval(() => {
  if (!PIANO_ROOT || !state.playing) return;
  const ms = $('#mirror-screen');
  if (ms && ms.classList.contains('active')) {
    drawMirrorKeys(activeNotes(state.song, state.beat));
  }
}, 50);