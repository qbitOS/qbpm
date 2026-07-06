const CACHE = "qbpm-v37";
const SHELL = [
  "./",
  "./static/pages-boot.js",
  "./static/pages.js",
  "./static/tools.json",
  "./static/qbpm.css",
  "./static/qbpm.js",
  "./static/canvas-collab.js",
  "./static/collab-shell.js",
  "./static/ugrad-hud.js",
  "./static/ugrad-hud.css",
  "./static/device-presets.js",
  "./static/gpu-loop.js",
  "./static/float-workspace.js",
  "./static/float-workspace.css",
  "./static/ui-buttons.css",
  "./static/strudel-pane.js",
  "./static/strudel-samples.js",
  "./static/terminal-commands.js",
  "./static/node-cycle.js",
  "./static/td-bridge.js",
  "./static/music-lab.js",
  "./static/music-core.js",
  "./static/music-theory.js",
  "./static/notation-chart.js",
  "./static/music-panes.js",
  "./static/header-waveform.js",
  "./static/header-stage.js",
  "./static/tab-runtime.js",
  "./static/video-embed-parse.js",
  "./static/live-video-rail.js",
  "./static/grok-playground.js",
  "./static/grok-playground.html",
  "./static/piano/hex-bridge.js",
  "./static/processing-wing.js",
  "./static/video-feed.js",
  "./static/video-wall.js",
  "./static/video-float-bar.js",
  "./static/daw-link.js",
  "./static/video-ingest.js",
  "./static/qube-store.js",
  "./static/qube-manager.js",
  "./static/float-dock.js",
  "./static/live-jam-bridge.js",
  "./static/jam-ecosystem.json",
  "./static/launch-config.json",
  "./static/env-config.json",
  "./static/vfx-palette.js",
  "./static/vfx-compositor.js",
  "./static/live-music-bridge.js",
  "./static/grok-terminal.js",
  "./static/piano/panel.html",
  "./static/piano/piano-panel.css",
  "./static/icons/icon-192.svg",
  "./static/icons/icon-512.svg",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.allSettled(SHELL.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const net = fetch(request)
        .then((res) => {
          if (res.ok && url.origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});