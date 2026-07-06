# qbpm

qbitOS node process manager — spatial graph UI, **JSON across**, **Python/JAX up**, **CUDA/C++ down**.

Not ComfyUI. Local app for graph orchestration; Colossus configs stay portable in `configs/colossus.yaml`.

## Stack

| Layer | Path |
|---|---|
| Graph UI | `web/` — canvas node editor |
| API / runtime | `src/qbpm/` — FastAPI + graph engine |
| JSON graphs | `graphs/*.json` + `schemas/graph.schema.json` |
| CUDA stubs | `src/kernels/*.cu` |
| Cluster port | `configs/colossus.yaml` |
| Tools | `tools/` — e.g. `tools/kbatch/` (live keyboard analyzer) |

## Start

```bash
cd /Volumes/qbitOS/00.dev/projects/qbpm
chmod +x start.sh
./start.sh
```

Open **http://127.0.0.1:8796** · static shell at **https://qbitos.github.io/qbpm/** · **https://fornevercollective.github.io/Qbpm/** · full stack at **https://qbitos.ai**

## Screenshots

### Workspace

| Graph canvas + dock rail | All float panels open |
|---|---|
| ![Graph workspace](docs/screenshots/workspace-graph.png) | ![Dock panels](docs/screenshots/workspace-dock-all.png) |

Canvas toolbar (`+`, `◎`, frames) sits **right of** the dock rail — not over it.

### Right panel tabs

| Visualizer | Inspector | kbatch |
|---|---|---|
| ![Visualizer](docs/screenshots/panel-viz.png) | ![Inspector](docs/screenshots/panel-inspector.png) | ![kbatch](docs/screenshots/panel-kbatch.png) |

| Tools hub | .grok terminal |
|---|---|
| ![Tools](docs/screenshots/panel-tools.png) | ![Grok terminal](docs/screenshots/panel-grok.png) |

### Float dock panels

| Video | Chat | Music lab | Processing · osc |
|---|---|---|---|
| ![Video](docs/screenshots/dock-video.png) | ![Chat](docs/screenshots/dock-chat.png) | ![Music lab](docs/screenshots/dock-music.png) | ![Processing](docs/screenshots/dock-proc.png) |

Regenerate: `./start.sh` then `node scripts/capture-readme-screenshots.mjs`

## go-ugrad HUD

Canvas overlay (like [go-ugrad](https://mueee.qbitos.ai/go-ugrad.html)):

- Crosshairs + dashed targeting lines to peers
- Target cards: **video left**, name + coords right (local cursor + remote peers)
- **Top-right:** chat notification toasts
- **Bottom-left:** live music notation mini-strip
- **Bottom-right:** processing readout (flow, run trace, frames, peers)

## Deploy

### GitHub Pages (static shell)

1. Push to `https://github.com/qbitOS/qbpm`
2. **Settings → Pages → Source:** GitHub Actions
3. Workflow `.github/workflows/deploy-pages.yml` → **https://qbitos.github.io/qbpm/**

### fornevercollective/Qbpm Pages

Live: **https://fornevercollective.github.io/Qbpm/**

```bash
chmod +x scripts/publish-fornevercollective.sh deploy/build-static.sh
./scripts/publish-fornevercollective.sh   # sync web → Qbpm/ and push
```

In **fornevercollective/Qbpm**: **Settings → Pages → Source:** GitHub Actions. Base path `/Qbpm/` — static graph JSON, music lab, collab UI (solo); point API host at qbitos.ai for full stack.

### Full stack on qbitos.ai

`qbitos.ai` CNAME points at `qbitOS.github.io` (org landing). Run the API on your host:

```bash
./start.sh   # port 8796
```

Reverse-proxy with `deploy/nginx-qbitos.conf.example` — e.g. `qbitos.ai/qbpm` or a dedicated subdomain → **8796**.

## Mobile & PWA

- Responsive layout with bottom panels (graph / viz / edit / grok tabs)
- Pinch zoom · **✥** pan mode button · 44px touch targets
- `manifest.webmanifest` + `sw.js` — offline shell caching
- Safe-area padding for notched devices

## Grok terminal injection

| Endpoint | Purpose |
|---|---|
| `POST /api/grok/inject` | Direct line injection (`{"text":"run"}`) |
| `POST /api/grok/inject/batch` | Multiple commands |
| `GET /api/grok/terminal` | Read terminal buffer |
| `WS /api/grok/ws` | Railway-compatible live inject |

Browser bridge:

```javascript
await grokTools.inject("run\n");
await grokTools.agent();
grokTools.connect(); // WebSocket
```

Commands: `help` · `run` · `save` · `graph` · `agent` · `set code <id> <py>` · `align node|graph`

## Live music coding (JAX / Python / JSON / Repel / WASM)

| Endpoint | Purpose |
|---|---|
| `POST /api/live/ingest` | kbatch / piano / browser live payload |
| `GET /api/live/state` | Latest flow, musica, bpm snapshot |
| `WS /api/live/ws` | Live fan-out to qbpm UI + tools |
| `GET /api/tools` | Discover `tools/kbatch` etc. |
| `/tools/kbatch/kbatch.html` | Embedded kbatch (same-origin) |

Starter graph: `graphs/live-music.json` — `music.clock` → `tool.kbatch` → `music.score` → `python.jax` / `wasm.classify` → `repel.play`.

```bash
# qbpm app (8796) — embeds kbatch
./start.sh

# kbatch standalone (8795) — forwards ingest to qbpm via CORS
cd tools/kbatch && ./start.sh
```

Browser bridge: `window.qbpmLive.ingest({ text, flow, musica, bpm })`

## Node types

- `core.clock` — tick / cpm
- `music.clock` — live tempo (cpm / bpm)
- `music.score` — flow + musica → notes from live bus
- `tool.kbatch` — keyboard live ingest snapshot
- `wasm.classify` — prefix_engine WASM lane (browser)
- `repel.play` — stream play hint (`~/dev/ffmpeg/repel`)
- `python.exec` — Python snippet (`result = ...`)
- `python.jax` — JAX snippet (`uv sync --extra jax`)
- `kernel.cuda` — CUDA binding stub
- `agent.mutator` — JSON diff proposals via `/api/agent/propose`
- `core.output` — sink

## CUDA build (optional)

```bash
nvcc -std=c++17 -arch=sm_80 -c src/kernels/attention_kernel.cu -o build/attention_kernel.o
```

## License

Apache-2.0