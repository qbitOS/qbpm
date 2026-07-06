"""In-process live music coding bus — kbatch / piano / WASM / Repel ingest."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class LiveMusicBus:
    """Ring buffer of recent live events for graph nodes and WS clients."""

    max_events: int = 128
    events: list[dict[str, Any]] = field(default_factory=list)
    state: dict[str, Any] = field(default_factory=dict)

    def ingest(self, payload: dict[str, Any], source: str = "unknown") -> dict[str, Any]:
        now = time.time()
        text = str(payload.get("text") or "")
        rhythm = payload.get("rhythm") if isinstance(payload.get("rhythm"), dict) else {}
        flow = str(payload.get("flow") or payload.get("arrows") or "")
        musica = str(payload.get("musica") or "")
        bpm = float(rhythm.get("bpm") or payload.get("bpm") or 0)
        cpm = float(payload.get("cpm") or (bpm if bpm else 120))

        snap = {
            "ts": now,
            "source": source,
            "text": text,
            "flow": flow,
            "musica": musica,
            "bpm": bpm,
            "cpm": cpm,
            "beats": rhythm.get("beats") or "",
            "timeSig": rhythm.get("timeSig") or "",
            "blocks": payload.get("blocks") or [],
            "contrail": payload.get("contrail") or flow,
            "wpm": payload.get("wpm"),
            "keysPerSec": payload.get("keysPerSec"),
        }
        self.state = snap
        self.events.append(snap)
        if len(self.events) > self.max_events:
            self.events = self.events[-self.max_events :]
        return {"ok": True, "state": snap}

    def snapshot(self) -> dict[str, Any]:
        return {"ok": True, "state": dict(self.state), "count": len(self.events)}

    def recent(self, n: int = 16) -> list[dict[str, Any]]:
        return list(self.events[-max(1, n) :])


_BUS = LiveMusicBus()


def get_bus() -> LiveMusicBus:
    return _BUS