from __future__ import annotations

import json
from typing import Any, Callable

from fastapi import WebSocket, WebSocketDisconnect

from qbpm.terminal import TerminalHub


async def grok_ws_loop(
    websocket: WebSocket,
    hub: TerminalHub,
    *,
    on_command: Callable[[str, str], str],
) -> None:
    await websocket.accept()
    session_id = "main"
    client_id = f"grok-{id(websocket) & 0xFFFF:x}"

    hub.ensure(session_id, client=client_id)
    await websocket.send_json(
        {
            "type": "state",
            "clientId": client_id,
            "sessionId": session_id,
            "terminalText": hub.ensure(session_id).text(),
            "terminalByClient": hub.sessions(),
        }
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                msg = {"type": "TerminalInput", "text": raw, "sessionId": session_id}

            mtype = msg.get("type", "TerminalInput")
            if mtype == "join":
                client_id = str(msg.get("client", client_id))
                hub.ensure(session_id, client=client_id)
                await websocket.send_json({"type": "log", "text": f"[JOIN] {client_id}"})
                continue

            if mtype in {"TerminalInput", "inject", "terminal_input"}:
                sid = str(msg.get("sessionId") or msg.get("session_id") or session_id)
                text = str(msg.get("text", ""))
                if not text.endswith("\n") and mtype == "TerminalInput":
                    text = text + "\n"
                for line in text.splitlines():
                    if not line.strip():
                        continue
                    result = hub.inject(
                        line,
                        session_id=sid,
                        source=str(msg.get("source", "grok")),
                        handler=lambda cmd, _s: on_command(cmd, sid),
                    )
                    await websocket.send_json({"type": "terminal", **result})
                continue

            if mtype == "clear":
                hub.clear(str(msg.get("sessionId", session_id)))
                await websocket.send_json({"type": "terminal", "terminalText": "", "ok": True})
                continue

            await websocket.send_json({"type": "log", "text": f"[WARN] unknown type {mtype}"})
    except WebSocketDisconnect:
        return