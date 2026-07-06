/** Video feed wing — transport, timeline, display, source handling */

function fmtTime(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function createVideoFeed(opts = {}) {
  const { onIngestUrl, onStatus, onSnapshot } = opts;

  let host = null;
  let video = null;
  let localStream = null;
  let objectUrl = null;
  let raf = 0;
  let sourceKind = "none";

  const state = {
    loop: false,
    muted: true,
    mirrorH: false,
    mirrorV: false,
    fit: "cover",
    brightness: 100,
    contrast: 100,
    saturate: 100,
    zoom: 100,
  };

  function mount(el) {
    host = el;
    host.innerHTML = `
      <div class="vid-wing">
        <pre class="vid-status">no source</pre>
        <div class="vid-stage">
          <video class="vid-el" playsinline></video>
          <span class="vid-ph">📹</span>
          <span class="vid-meta"></span>
        </div>
        <div class="vid-scrub">
          <input type="range" class="vid-seek" min="0" max="1000" value="0" step="1" title="Seek" />
          <span class="vid-time">0:00 / 0:00</span>
        </div>
        <div class="vid-transport">
          <button type="button" class="vid-btn vid-play" title="Play / pause">▶</button>
          <button type="button" class="vid-btn vid-stop" title="Stop">■</button>
          <button type="button" class="vid-btn vid-loop" title="Loop">↻</button>
          <button type="button" class="vid-btn vid-step-back" title="Frame back">⏮</button>
          <button type="button" class="vid-btn vid-step-fwd" title="Frame fwd">⏭</button>
          <select class="vid-rate" title="Playback speed">
            <option value="0.25">0.25×</option>
            <option value="0.5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="1.25">1.25×</option>
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
          </select>
        </div>
        <div class="vid-source">
          <input type="url" class="vid-url" placeholder="paste URL · yt-dlp ingest" autocomplete="off" />
          <div class="vid-src-btns">
            <button type="button" class="vid-btn vid-cam" title="Camera">📷</button>
            <button type="button" class="vid-btn vid-ingest" title="Ingest URL">▶</button>
            <button type="button" class="vid-btn vid-file" title="Open file">📁</button>
            <button type="button" class="vid-btn vid-snap" title="Snapshot frame">📸</button>
          </div>
        </div>
        <div class="vid-controls">
          <label class="vid-knob" title="Volume"><span>vol</span><input type="range" class="vid-vol" min="0" max="100" value="80" /></label>
          <button type="button" class="vid-btn vid-mute active" title="Mute">🔇</button>
          <select class="vid-fit" title="Object fit">
            <option value="cover">cover</option>
            <option value="contain">contain</option>
            <option value="fill">fill</option>
          </select>
          <button type="button" class="vid-btn vid-mirror-h" title="Mirror H">⇋</button>
          <button type="button" class="vid-btn vid-mirror-v" title="Mirror V">⇅</button>
        </div>
        <div class="vid-filters">
          <label class="vid-knob"><span>bright</span><input type="range" class="vid-bright" min="0" max="200" value="100" /></label>
          <label class="vid-knob"><span>contrast</span><input type="range" class="vid-contrast" min="0" max="200" value="100" /></label>
          <label class="vid-knob"><span>sat</span><input type="range" class="vid-sat" min="0" max="200" value="100" /></label>
          <label class="vid-knob"><span>zoom</span><input type="range" class="vid-zoom" min="100" max="200" value="100" /></label>
        </div>
        <div class="vid-out">
          <button type="button" class="vid-btn vid-pip" title="Picture in picture">⊡</button>
          <button type="button" class="vid-btn vid-fs" title="Fullscreen">⤢</button>
          <button type="button" class="vid-btn vid-eject" title="Clear source">⏏</button>
        </div>
      </div>`;

    video = host.querySelector(".vid-el");
    applyDisplay();
    bindEvents();
    tickTime();
    setStatus("no source");
  }

  function bindEvents() {
    host.querySelector(".vid-play")?.addEventListener("click", togglePlay);
    host.querySelector(".vid-stop")?.addEventListener("click", stop);
    host.querySelector(".vid-loop")?.addEventListener("click", toggleLoop);
    host.querySelector(".vid-step-back")?.addEventListener("click", () => stepFrame(-1));
    host.querySelector(".vid-step-fwd")?.addEventListener("click", () => stepFrame(1));
    host.querySelector(".vid-cam")?.addEventListener("click", toggleCamera);
    host.querySelector(".vid-ingest")?.addEventListener("click", ingestUrl);
    host.querySelector(".vid-file")?.addEventListener("click", openFile);
    host.querySelector(".vid-snap")?.addEventListener("click", snapshot);
    host.querySelector(".vid-pip")?.addEventListener("click", enterPip);
    host.querySelector(".vid-fs")?.addEventListener("click", enterFullscreen);
    host.querySelector(".vid-eject")?.addEventListener("click", clearSource);

    host.querySelector(".vid-mute")?.addEventListener("click", toggleMute);
    host.querySelector(".vid-mirror-h")?.addEventListener("click", () => toggleMirror("h"));
    host.querySelector(".vid-mirror-v")?.addEventListener("click", () => toggleMirror("v"));

    video?.addEventListener("loadedmetadata", updateMeta);
    video?.addEventListener("durationchange", updateSeekMax);
    video?.addEventListener("ended", () => {
      if (state.loop && video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    });

    host.querySelector(".vid-seek")?.addEventListener("input", (ev) => {
      if (!video || !Number.isFinite(video.duration)) return;
      const t = (parseFloat(ev.target.value) / 1000) * video.duration;
      video.currentTime = t;
      updateTimeLabel();
    });

    host.querySelector(".vid-rate")?.addEventListener("change", (ev) => {
      if (video) video.playbackRate = parseFloat(ev.target.value);
    });

    host.querySelector(".vid-vol")?.addEventListener("input", (ev) => {
      if (!video) return;
      video.volume = parseFloat(ev.target.value) / 100;
      if (video.volume > 0) {
        state.muted = false;
        video.muted = false;
        host.querySelector(".vid-mute")?.classList.remove("active");
        host.querySelector(".vid-mute").textContent = "🔊";
      }
    });

    host.querySelector(".vid-fit")?.addEventListener("change", (ev) => {
      state.fit = ev.target.value;
      applyDisplay();
    });

    ["bright", "contrast", "sat", "zoom"].forEach((key) => {
      const cls = `.vid-${key === "bright" ? "bright" : key === "sat" ? "sat" : key}`;
      host.querySelector(cls)?.addEventListener("input", (ev) => {
        const map = { bright: "brightness", contrast: "contrast", sat: "saturate", zoom: "zoom" };
        state[map[key]] = parseFloat(ev.target.value);
        applyDisplay();
      });
    });

    host.querySelector(".vid-url")?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); ingestUrl(); }
    });
  }

  function revokeObjectUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function showVideo(on) {
    const ph = host?.querySelector(".vid-ph");
    if (video) video.style.display = on ? "block" : "none";
    if (ph) ph.style.display = on ? "none" : "flex";
  }

  function setSourceKind(kind) {
    sourceKind = kind;
    updateMeta();
  }

  function loadStream(stream) {
    clearSource(false);
    localStream = stream;
    if (!video) return;
    video.srcObject = stream;
    video.muted = state.muted;
    video.play().catch(() => {});
    showVideo(true);
    setSourceKind("camera");
    setStatus("live camera");
  }

  function loadUrl(url, kind = "url") {
    if (!video || !url) return;
    clearSource(false);
    video.srcObject = null;
    video.src = url;
    video.muted = state.muted;
    video.play().catch(() => {});
    showVideo(true);
    setSourceKind(kind);
    setStatus(kind === "file" ? `file · ${url.split("/").pop()?.slice(0, 24)}` : "url loaded");
  }

  function loadBlob(file) {
    if (!file) return;
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(file);
    loadUrl(objectUrl, file.type.startsWith("image/") ? "image" : "file");
  }

  async function toggleCamera() {
    const btn = host.querySelector(".vid-cam");
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
      if (video) video.srcObject = null;
      showVideo(false);
      btn?.classList.remove("active");
      setSourceKind("none");
      setStatus("camera off");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      loadStream(stream);
      btn?.classList.add("active");
    } catch (err) {
      setStatus(`camera: ${err.message}`);
    }
  }

  function ingestUrl() {
    const url = host.querySelector(".vid-url")?.value?.trim();
    if (!url) return;
    if (/^https?:\/\//.test(url) && /\.(mp4|webm|m3u8|mov)(\?|$)/i.test(url)) {
      loadUrl(url, "url");
      return;
    }
    onIngestUrl?.(url);
    setStatus(`ingest → ${url.slice(0, 40)}…`);
  }

  function openFile() {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "video/*,image/*";
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (f) loadBlob(f);
    };
    inp.click();
  }

  function togglePlay() {
    if (!video?.src && !video?.srcObject) return;
    const btn = host.querySelector(".vid-play");
    if (video.paused) {
      video.play().catch(() => {});
      btn.textContent = "⏸";
      btn.classList.add("active");
    } else {
      video.pause();
      btn.textContent = "▶";
      btn.classList.remove("active");
    }
  }

  function stop() {
    if (!video) return;
    video.pause();
    if (!video.srcObject) video.currentTime = 0;
    host.querySelector(".vid-play").textContent = "▶";
    host.querySelector(".vid-play")?.classList.remove("active");
    updateTimeLabel();
  }

  function toggleLoop() {
    state.loop = !state.loop;
    if (video) video.loop = state.loop;
    host.querySelector(".vid-loop")?.classList.toggle("active", state.loop);
  }

  function stepFrame(dir) {
    if (!video || video.srcObject) return;
    const fps = 30;
    video.pause();
    video.currentTime = clamp(video.currentTime + dir / fps, 0, video.duration || 0);
    updateTimeLabel();
    const seek = host.querySelector(".vid-seek");
    if (seek && video.duration) seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
  }

  function toggleMute() {
    state.muted = !state.muted;
    if (video) video.muted = state.muted;
    const btn = host.querySelector(".vid-mute");
    btn?.classList.toggle("active", state.muted);
    btn.textContent = state.muted ? "🔇" : "🔊";
  }

  function toggleMirror(axis) {
    if (axis === "h") {
      state.mirrorH = !state.mirrorH;
      host.querySelector(".vid-mirror-h")?.classList.toggle("active", state.mirrorH);
    } else {
      state.mirrorV = !state.mirrorV;
      host.querySelector(".vid-mirror-v")?.classList.toggle("active", state.mirrorV);
    }
    applyDisplay();
  }

  function applyDisplay() {
    if (!video) return;
    const sx = state.mirrorH ? -1 : 1;
    const sy = state.mirrorV ? -1 : 1;
    const z = state.zoom / 100;
    video.style.objectFit = state.fit;
    video.style.transform = `scale(${sx * z}, ${sy * z})`;
    video.style.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;
  }

  function updateSeekMax() {
    const seek = host?.querySelector(".vid-seek");
    if (seek) seek.max = "1000";
  }

  function updateMeta() {
    const meta = host?.querySelector(".vid-meta");
    if (!meta || !video) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w && h) meta.textContent = `${w}×${h} · ${sourceKind}`;
    else meta.textContent = sourceKind;
  }

  function updateTimeLabel() {
    const el = host?.querySelector(".vid-time");
    const seek = host?.querySelector(".vid-seek");
    if (!video || !el) return;
    const cur = fmtTime(video.currentTime);
    const dur = video.srcObject ? "live" : fmtTime(video.duration);
    el.textContent = `${cur} / ${dur}`;
    if (seek && Number.isFinite(video.duration) && video.duration > 0) {
      seek.value = String(Math.round((video.currentTime / video.duration) * 1000));
    }
  }

  function tickTime() {
    updateTimeLabel();
    raf = requestAnimationFrame(tickTime);
  }

  function snapshot() {
    if (!video || (!video.src && !video.srcObject)) return;
    const w = video.videoWidth || 640;
    const h = video.videoHeight || 360;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    const sx = state.mirrorH ? -1 : 1;
    const sy = state.mirrorV ? -1 : 1;
    ctx.filter = `brightness(${state.brightness}%) contrast(${state.contrast}%) saturate(${state.saturate}%)`;
    ctx.translate(sx < 0 ? w : 0, sy < 0 ? h : 0);
    ctx.scale(sx, sy);
    ctx.drawImage(video, 0, 0, w, h);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `qbpm-frame-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
      onSnapshot?.(blob);
      setStatus("snapshot saved");
    }, "image/png");
  }

  async function enterPip() {
    if (!video?.requestPictureInPicture) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch (err) {
      setStatus(`pip: ${err.message}`);
    }
  }

  function enterFullscreen() {
    const stage = host?.querySelector(".vid-stage");
    if (!stage) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else stage.requestFullscreen?.();
  }

  function clearSource(stopCam = true) {
    if (stopCam && localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
      host?.querySelector(".vid-cam")?.classList.remove("active");
    }
    revokeObjectUrl();
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
    }
    showVideo(false);
    setSourceKind("none");
    setStatus("no source");
  }

  function setStatus(text) {
    const el = host?.querySelector(".vid-status");
    if (el) el.textContent = text;
    onStatus?.(text);
  }

  function getVideoElement() {
    return video;
  }

  function destroy() {
    cancelAnimationFrame(raf);
    clearSource(true);
    video = null;
  }

  return {
    mount,
    loadUrl,
    loadBlob,
    loadStream,
    clearSource,
    getVideoElement,
    setStatus,
    destroy,
  };
}