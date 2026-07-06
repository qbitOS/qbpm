/**
 * Piano Buddy ↔ mueee hexcast + overview live-hex bridge
 * Channels: hexcast-stream (kbatch), overview-live-hex:{room}, piano-buddy-state
 */

const HEXCAST_CH = 'hexcast-stream';
const PIANO_STATE_CH = 'piano-buddy-state';
const ROOM_PREFIX = '#pb-room=';

export function liveHexChannelForRoom(roomId) {
  const r = roomId?.trim();
  if (r && r.length <= 48) return `overview-live-hex:${r}`;
  return 'overview-live-hex';
}

export function generateRoomId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join('');
}

export function buildRoomShareUrl(roomId, origin = location.origin, pathname = location.pathname) {
  const payload = btoa(JSON.stringify({ v: 1, room: roomId, app: 'piano-buddy' }));
  return `${origin}${pathname}${ROOM_PREFIX}${payload}`;
}

export function parseRoomFromUrl(hash = location.hash) {
  const i = hash.indexOf(ROOM_PREFIX);
  if (i < 0) return null;
  try {
    const data = JSON.parse(atob(hash.slice(i + ROOM_PREFIX.length).split(/[#?&]/)[0]));
    if (data?.room) return data.room;
  } catch (_) { /* ignore */ }
  return null;
}

function luminanceHex(imageData) {
  const { data, width, height } = imageData;
  const len = width * height;
  const hex = new Array(len);
  for (let i = 0; i < len; i++) {
    const o = i * 4;
    hex[i] = Math.floor(0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2]);
  }
  return hex;
}

function rgbHex(imageData) {
  const { data, width, height } = imageData;
  const len = width * height;
  const hex = new Array(len * 3);
  for (let i = 0; i < len; i++) {
    const src = i * 4;
    const dst = i * 3;
    hex[dst] = data[src];
    hex[dst + 1] = data[src + 1];
    hex[dst + 2] = data[src + 2];
  }
  return hex;
}

export class HexBridge {
  constructor() {
    this.roomId = null;
    this.hexcastBC = null;
    this.roomBC = null;
    this.stateBC = null;
    this.broadcasting = false;
    this.receiving = false;
    this.hexRes = 72;
    this.hexMode = 'rgb';
    this._captureCanvas = document.createElement('canvas');
    this._captureCtx = this._captureCanvas.getContext('2d');
    this._offCanvas = document.createElement('canvas');
    this._offCtx = this._offCanvas.getContext('2d');
    this.onHexFrame = null;
    this.onPianoState = null;
    this._lastBroadcast = 0;
    this.fps = 8;
  }

  setRoom(roomId) {
    this.roomId = roomId;
    if (this.receiving) this.startReceive();
  }

  startBroadcast() {
    this.stopBroadcast();
    if (typeof BroadcastChannel === 'undefined') return false;
    this.hexcastBC = new BroadcastChannel(HEXCAST_CH);
    if (this.roomId) this.roomBC = new BroadcastChannel(liveHexChannelForRoom(this.roomId));
    this.stateBC = new BroadcastChannel(PIANO_STATE_CH);
    this.broadcasting = true;
    return true;
  }

  stopBroadcast() {
    this.broadcasting = false;
    [this.hexcastBC, this.roomBC, this.stateBC].forEach((bc) => { bc?.close(); });
    this.hexcastBC = this.roomBC = this.stateBC = null;
  }

  startReceive() {
    this.stopReceive();
    if (typeof BroadcastChannel === 'undefined') return false;
    this.hexcastBC = new BroadcastChannel(HEXCAST_CH);
    this.hexcastBC.onmessage = (e) => this._handleHex(e.data);
    if (this.roomId) {
      this.roomBC = new BroadcastChannel(liveHexChannelForRoom(this.roomId));
      this.roomBC.onmessage = (e) => this._handleHex(e.data);
    }
    this.stateBC = new BroadcastChannel(PIANO_STATE_CH);
    this.stateBC.onmessage = (e) => {
      if (e.data?.type === 'piano-state' && this.onPianoState) this.onPianoState(e.data);
    };
    this.receiving = true;
    return true;
  }

  stopReceive() {
    this.receiving = false;
    [this.hexcastBC, this.roomBC, this.stateBC].forEach((bc) => { bc?.close(); });
    this.hexcastBC = this.roomBC = this.stateBC = null;
  }

  _handleHex(data) {
    if (data?.type !== 'hexframe' || !Array.isArray(data.hex)) return;
    if (this.onHexFrame) this.onHexFrame(data);
  }

  publishPianoState(payload) {
    if (!this.broadcasting || !this.stateBC) return;
    this.stateBC.postMessage({ type: 'piano-state', t: performance.now(), ...payload });
  }

  /** Composite video + overlay canvas → hexframe broadcast */
  publishComposite(videoEl, overlayCanvas, feedKey = 'piano-buddy') {
    if (!this.broadcasting) return;
    const now = performance.now();
    if (now - this._lastBroadcast < 1000 / this.fps) return;
    this._lastBroadcast = now;

    const res = this.hexRes;
    this._captureCanvas.width = res;
    this._captureCanvas.height = res;

    if (videoEl?.readyState >= 2) {
      this._captureCtx.drawImage(videoEl, 0, 0, res, res);
    } else {
      this._captureCtx.fillStyle = '#111';
      this._captureCtx.fillRect(0, 0, res, res);
    }
    if (overlayCanvas) {
      this._captureCtx.drawImage(overlayCanvas, 0, 0, res, res);
    }

    const imageData = this._captureCtx.getImageData(0, 0, res, res);
    const hex = this.hexMode === 'rgb' ? rgbHex(imageData) : luminanceHex(imageData);
    const msg = {
      type: 'hexframe',
      hex,
      res,
      mode: this.hexMode,
      t: now,
      feedKey,
      source: 'piano-buddy',
    };

    this.hexcastBC?.postMessage(msg);
    this.roomBC?.postMessage(msg);
  }

  /** Decode hexframe to canvas (grandma view / kbatch receive) */
  drawHexFrame(destCanvas, hex, res, mode = 'rgb') {
    const ctx = destCanvas.getContext('2d');
    if (!ctx) return;
    this._offCanvas.width = res;
    this._offCanvas.height = res;
    const id = this._offCtx.createImageData(res, res);
    const cells = res * res;
    const pack = hex.length === cells * 3 ? 'rgb' : 'mono';

    for (let i = 0, p = 0; i < cells; i++, p += 4) {
      let r, g, b;
      if (pack === 'rgb') {
        const o = i * 3;
        r = hex[o] ?? 0;
        g = hex[o + 1] ?? 0;
        b = hex[o + 2] ?? 0;
      } else {
        const v = hex[i] ?? 0;
        const n = v / 255;
        const hue = (1 - n) * 200;
        [r, g, b] = hslToRgb(hue / 360, 0.85, (20 + n * 50) / 100);
      }
      id.data[p] = r;
      id.data[p + 1] = g;
      id.data[p + 2] = b;
      id.data[p + 3] = 255;
    }
    this._offCtx.putImageData(id, 0, 0);
    const w = destCanvas.clientWidth || res;
    const h = destCanvas.clientHeight || res;
    destCanvas.width = w;
    destCanvas.height = h;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this._offCanvas, 0, 0, res, res, 0, 0, w, h);
  }
}

function hslToRgb(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (pp, qq, t) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return pp + (qq - pp) * 6 * tt;
    if (tt < 1 / 2) return qq;
    if (tt < 2 / 3) return pp + (qq - pp) * (2 / 3 - tt) * 6;
    return pp;
  };
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

/** ffmpeg / OBS command templates for live lesson streaming */
export function ffmpegCommands(opts = {}) {
  const { rtmpUrl = 'rtmps://…', roomId = 'lesson', device = '0' } = opts;
  return {
    cameraMac: `# Mac camera → HLS preview (local)
ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "${device}:none" \\
  -c:v libx264 -preset ultrafast -tune zerolatency \\
  -f hls -hls_time 2 -hls_list_size 5 /tmp/piano-${roomId}.m3u8`,

    windowCaptureMac: `# Capture browser window (pick index from: ffmpeg -f avfoundation -list_devices true -i "")
ffmpeg -f avfoundation -framerate 30 -i "1:none" \\
  -vf "scale=1280:720" -c:v libx264 -preset ultrafast \\
  -f flv "${rtmpUrl}"`,

    obsSpaces: `# OBS → X Spaces: host a Space in X app, add OBS Virtual Camera as source
# 1. Open Piano Buddy mirror mode fullscreen
# 2. OBS: Window Capture → piano-buddy tab
# 3. X → Spaces → Start → add camera/audio
# Help: https://help.x.com/en/using-x/spaces`,

    repelPlay: `# repel ffplay pipe (~/dev/ffmpeg/repel)
repel play /tmp/piano-${roomId}.m3u8`,

    hexcastReceive: `# Open in another tab/device on same machine:
# mueee hexcast → Receive, or overview Video Feeds Lab with room link`,
  };
}

export const STACK_LINKS = {
  kbatch: 'https://mueee.qbitos.ai/kbatch.html',
  hexcast: 'https://mueee.qbitos.ai/hexcast.html',
  overview: 'https://fornevercollective.github.io/overview/',
  xSpaces: 'https://help.x.com/en/using-x/spaces',
  xCalls: 'https://help.x.com/en/using-x/direct-messages/audio-video-calls',
};