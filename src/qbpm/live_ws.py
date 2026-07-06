from __future__ import annotations

import json
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect

from qbpm.live_bus import LiveMusicBus


class LiveMusicHub:
    """Fan-out live ingest/state to connected browser clients."""

    def __init__(self) -> None:
        self.clients: list[WebSocket] = []

    async def broadcast(self, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in self.clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.clients:
                self.clients.remove(ws)


async def live_ws_loop(
    websocket: WebSocket,
    hub: LiveMusicHub,
    bus: LiveMusicBus,
) -> None:
    await websocket.accept()
    hub.clients.append(websocket)
    try:
        await websocket.send_json({"type": "state", **bus.snapshot()})
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"type": "ingest", "payload": {"text": raw}, "source": "ws-text"}

            mtype = msg.get("type", "ingest")
            if mtype == "ping":
                await websocket.send_json({"type": "pong", "ts": msg.get("ts")})
                continue

            if mtype in {"ingest", "live", "kbatch-keyboard-data"}:
                payload = msg.get("payload") if isinstance(msg.get("payload"), dict) else msg
                source = str(msg.get("source") or payload.get("source") or "ws")
                result = bus.ingest(payload, source=source)
                event = {"type": "ingest", **result}
                await hub.broadcast(event)
                continue

            if mtype == "snapshot":
                await websocket.send_json({"type": "state", **bus.snapshot()})
                continue

            await websocket.send_json({"type": "log", "text": f"[WARN] unknown type {mtype}"})
    except WebSocketDisconnect:
        return
    finally:
        if websocket in hub.clients:
            hub.clients.remove(websocket)