"""TouchDesigner bridge — WebSocket OSC-style fan-out for TD WebSocket / OSC In DAT."""

from __future__ import annotations

import time
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect


class TouchDesignerHub:
    """Relay qbpm viz + live data to TouchDesigner clients (and browser preview)."""

    def __init__(self) -> None:
        self.clients: list[WebSocket] = []
        self._last: dict[str, Any] = {}

    async def broadcast(self, payload: dict[str, Any]) -> None:
        if payload.get("address"):
            self._last[payload["address"]] = payload
        dead: list[WebSocket] = []
        for ws in self.clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            if ws in self.clients:
                self.clients.remove(ws)

    def snapshot(self) -> list[dict[str, Any]]:
        return list(self._last.values())


async def td_ws_loop(websocket: WebSocket, hub: TouchDesignerHub) -> None:
    await websocket.accept()
    hub.clients.append(websocket)
    try:
        for msg in hub.snapshot():
            await websocket.send_json(msg)
        await websocket.send_json({"type": "hello", "ts": time.time(), "role": "td"})
        while True:
            raw = await websocket.receive_text()
            try:
                import json

                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"type": "osc", "address": "/qbpm/td/in", "args": [raw]}

            mtype = msg.get("type", "osc")
            if mtype == "ping":
                await websocket.send_json({"type": "pong", "ts": msg.get("ts")})
                continue
            if mtype in {"osc", "chop", "top", "viz"}:
                out = {**msg, "from": "browser", "ts": time.time()}
                await hub.broadcast(out)
                continue
            await websocket.send_json({"type": "log", "text": f"[td] unknown {mtype}"})
    except WebSocketDisconnect:
        return
    finally:
        if websocket in hub.clients:
            hub.clients.remove(websocket)