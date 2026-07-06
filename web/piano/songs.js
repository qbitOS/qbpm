/** Re-export catalog + note color helpers */
export { CATALOG as SONGS, ALBUMS, albumFor, songsForAlbum, readySongs } from './catalog.js';

export const NOTE_COLORS = {
  C: '#FF3366',
  'C#': '#FF6633', Db: '#FF6633',
  D: '#FFAA00',
  'D#': '#FFDD00', Eb: '#FFDD00',
  E: '#AAFF00',
  F: '#00FF88',
  'F#': '#00DDFF', Gb: '#00DDFF',
  G: '#3388FF',
  'G#': '#8855FF', Ab: '#8855FF',
  A: '#CC44FF',
  'A#': '#FF44CC', Bb: '#FF44CC',
  B: '#FF6699',
};

export const MIDI_TO_NAME = (midi) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  return `${names[midi % 12]}${octave}`;
};

export const NAME_TO_MIDI = (name) => {
  const m = name.match(/^([A-G]#?|Db|Eb|Gb|Ab|Bb)(\d)$/);
  if (!m) return 60;
  const map = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  return (parseInt(m[2], 10) + 1) * 12 + (map[m[1]] ?? 0);
};

export const colorForMidi = (midi) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  return NOTE_COLORS[names[midi % 12]] || '#FFFFFF';
};