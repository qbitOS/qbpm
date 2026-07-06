# qbpm foundation

Shared layer adapted from [grok-public-folder](https://github.com/fornevercollective/grok-public-folder) and [grok-repo-template](https://github.com/fornevercollective/grok-repo-template).

## Layout

```
foundation/
├── grok_paths.py       # path SSOT
├── grok_presets.py     # Imagine slug loader
├── metadata.yaml       # ecosystem routing
├── project/
│   └── presets-manifest.json
├── skills/
│   └── terminal-commands/   # yt-dlp/ffmpeg/ffplay recipes
└── schemas/            # interchange JSON schemas
```

## Media sinks (under qbpm root)

- `media/video/` — generated clips
- `media/blank/downloads/` — yt-dlp archives
- `media/streaming/` — HLS / RTMP artifacts

## Env

- `GROK_PUBLIC_FOLDER` — path to grok-public-folder clone
- `IMAGINE_REPO` — path to imagine preset repo