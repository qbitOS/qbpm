from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable

from fastapi import WebSocket, WebSocketDisconnect


@dataclass
class CollabClient:
    ws: WebSocket
    client_id: str
    name: str
    color: str
    cursor: tuple[float, float] = (0.0, 0.0)
    viewport: dict[str, Any] = field(default_factory=dict)
    joined_at: float = field(default_factory=time.time)


class GraphCollabHub:
    """Multi-user presence + graph sync for infinite canvas sessions."""

    def __init__(self) -> None:
        self._rooms: dict[str, dict[str, CollabClient]] = {}
        self._graph_rev: dict[str, int] = {}
        self._chat: dict[str, list[dict[str, Any]]] = {}
        self._chat_max = 120

    def room(self, graph_name: str) -> dict[str, CollabClient]:
        return self._rooms.setdefault(graph_name, {})

    def next_rev(self, graph_name: str) -> int:
        self._graph_rev[graph_name] = self._graph_rev.get(graph_name, 0) + 1
        return self._graph_rev[graph_name]

    def presence(self, graph_name: str) -> list[dict[str, Any]]:
        return [
            {
                "clientId": c.client_id,
                "name": c.name,
                "color": c.color,
                "cursor": list(c.cursor),
                "viewport": c.viewport,
            }
            for c in self.room(graph_name).values()
        ]

    async def broadcast(self, graph_name: str, payload: dict[str, Any], *, skip: str | None = None) -> None:
        dead: list[str] = []
        for cid, client in self.room(graph_name).items():
            if skip and cid == skip:
                continue
            try:
                await client.ws.send_json(payload)
            except Exception:
                dead.append(cid)
        for cid in dead:
            self.room(graph_name).pop(cid, None)

    async def join(
        self,
        websocket: WebSocket,
        graph_name: str,
        client_id: str,
        name: str,
        color: str,
    ) -> CollabClient:
        client = CollabClient(ws=websocket, client_id=client_id, name=name, color=color)
        self.room(graph_name)[client_id] = client
        await self.broadcast(
            graph_name,
            {"type": "presence", "clients": self.presence(graph_name)},
        )
        return client

    async def leave(self, graph_name: str, client_id: str) -> None:
        self.room(graph_name).pop(client_id, None)
        await self.broadcast(
            graph_name,
            {"type": "presence", "clients": self.presence(graph_name)},
        )

    def chat_log(self, graph_name: str) -> list[dict[str, Any]]:
        return self._chat.setdefault(graph_name, [])

    async def add_chat(
        self,
        graph_name: str,
        *,
        client_id: str,
        name: str,
        color: str,
        text: str,
    ) -> dict[str, Any]:
        entry = {
            "from": client_id,
            "fromName": name,
            "color": color,
            "text": text[:500],
            "ts": time.time(),
        }
        log = self.chat_log(graph_name)
        log.append(entry)
        if len(log) > self._chat_max:
            del log[: len(log) - self._chat_max]
        await self.broadcast(graph_name, {"type": "chat", **entry})
        return entry


async def graph_ws_loop(
    websocket: WebSocket,
    hub: GraphCollabHub,
    *,
    graph_name: str,
    get_graph: Callable[[], dict[str, Any]],
) -> None:
    await websocket.accept()
    client_id = f"user-{id(websocket) & 0xFFFF:x}"
    name = "guest"
    color = "#58a6ff"
    client = await hub.join(websocket, graph_name, client_id, name, color)

    await websocket.send_json(
        {
            "type": "state",
            "clientId": client_id,
            "graph": get_graph(),
            "rev": hub._graph_rev.get(graph_name, 0),
            "clients": hub.presence(graph_name),
            "chat": hub.chat_log(graph_name)[-40:],
        }
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            mtype = msg.get("type", "")
            if mtype == "join":
                client_id = str(msg.get("clientId", client_id))
                name = str(msg.get("name", name))[:32]
                color = str(msg.get("color", color))[:16]
                client.name = name
                client.color = color
                if client_id != client.client_id:
                    hub.room(graph_name).pop(client.client_id, None)
                    client.client_id = client_id
                    hub.room(graph_name)[client_id] = client
                await hub.broadcast(
                    graph_name,
                    {"type": "presence", "clients": hub.presence(graph_name)},
                )
                continue

            if mtype == "cursor":
                client.cursor = (float(msg.get("x", 0)), float(msg.get("y", 0)))
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "cursor",
                        "clientId": client.client_id,
                        "name": client.name,
                        "color": client.color,
                        "x": client.cursor[0],
                        "y": client.cursor[1],
                    },
                    skip=client.client_id,
                )
                continue

            if mtype == "viewport":
                client.viewport = {
                    "pan": msg.get("pan", [80, 80]),
                    "scale": float(msg.get("scale", 1)),
                    "frameId": msg.get("frameId"),
                    "windowId": msg.get("windowId"),
                }
                await hub.broadcast(
                    graph_name,
                    {"type": "viewport", "clientId": client.client_id, **client.viewport},
                    skip=client.client_id,
                )
                continue

            if mtype == "graph.patch":
                rev = hub.next_rev(graph_name)
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "graph.patch",
                        "rev": rev,
                        "from": client.client_id,
                        "patch": msg.get("patch", {}),
                    },
                )
                continue

            if mtype == "graph.full":
                rev = hub.next_rev(graph_name)
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "graph.full",
                        "rev": rev,
                        "from": client.client_id,
                        "graph": msg.get("graph", {}),
                    },
                    skip=client.client_id,
                )
                continue

            if mtype == "frame.update":
                rev = hub.next_rev(graph_name)
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "frame.update",
                        "rev": rev,
                        "from": client.client_id,
                        "frames": msg.get("frames", []),
                        "viewports": msg.get("viewports", []),
                        "frameEdges": msg.get("frameEdges", []),
                    },
                )
                continue

            if mtype == "chat":
                text = str(msg.get("text", "")).strip()
                if text:
                    await hub.add_chat(
                        graph_name,
                        client_id=client.client_id,
                        name=client.name,
                        color=client.color,
                        text=text,
                    )
                continue

            if mtype == "jam":
                pattern = msg.get("pattern") or {}
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "jam",
                        "from": client.client_id,
                        "fromName": client.name,
                        "color": client.color,
                        "pattern": pattern,
                    },
                    skip=client.client_id,
                )
                continue

            if mtype == "hop.request":
                target_id = str(msg.get("targetId", ""))
                target = hub.room(graph_name).get(target_id)
                if target:
                    await target.ws.send_json(
                        {
                            "type": "hop",
                            "from": client.client_id,
                            "fromName": client.name,
                            "viewport": client.viewport,
                        }
                    )
                continue

            if mtype == "video":
                await hub.broadcast(
                    graph_name,
                    {
                        "type": "video",
                        "clientId": client.client_id,
                        "name": client.name,
                        "active": bool(msg.get("active")),
                        "roomId": msg.get("roomId"),
                    },
                    skip=client.client_id,
                )
                continue

    except WebSocketDisconnect:
        await hub.leave(graph_name, client.client_id)