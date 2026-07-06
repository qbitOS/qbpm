from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class TerminalSession:
    id: str
    client: str = "local"
    lines: list[str] = field(default_factory=list)
    input_buffer: str = ""
    created: float = field(default_factory=time.time)

    def append(self, text: str) -> None:
        for line in text.splitlines() or [""]:
            self.lines.append(line)
        if len(self.lines) > 500:
            self.lines = self.lines[-500:]

    def text(self) -> str:
        return "\n".join(self.lines)

    def clear(self) -> None:
        self.lines.clear()
        self.input_buffer = ""


class TerminalHub:
    """Grok-compatible terminal sessions with direct command injection."""

    def __init__(self) -> None:
        self._sessions: dict[str, TerminalSession] = {}
        self._default = "main"

    def ensure(self, session_id: str | None = None, client: str = "local") -> TerminalSession:
        sid = session_id or self._default
        if sid not in self._sessions:
            self._sessions[sid] = TerminalSession(id=sid, client=client)
            self._sessions[sid].append(f"[qbpm] session {sid} ready")
        return self._sessions[sid]

    def sessions(self) -> dict[str, str]:
        return {sid: s.text() for sid, s in self._sessions.items()}

    def clear(self, session_id: str | None = None) -> None:
        self.ensure(session_id).clear()

    def inject(
        self,
        text: str,
        *,
        session_id: str | None = None,
        source: str = "grok",
        handler: Callable[[str, TerminalSession], str] | None = None,
    ) -> dict[str, Any]:
        sess = self.ensure(session_id, client=source)
        sess.append(f"[{source}] {text}")
        out = handler(text.strip(), sess) if handler else f"ack: {text.strip()}"
        if out:
            sess.append(out)
        return {
            "ok": True,
            "sessionId": sess.id,
            "source": source,
            "output": out,
            "terminalText": sess.text(),
            "lines": sess.lines[-40:],
        }


def parse_grok_command(
    line: str,
    *,
    graph_name: str,
    get_graph: Callable[[], dict[str, Any]],
    put_graph: Callable[[dict[str, Any]], None],
    run_graph: Callable[[], dict[str, Any]],
    agent_propose: Callable[[dict[str, Any]], dict[str, Any]],
) -> str:
    cmd = line.strip()
    if not cmd:
        return ""
    low = cmd.lower()
    if low in {"help", "?"}:
        return (
            "qbpm grok terminal — commands:\n"
            "  run · save · graph · agent · clear · help\n"
            "  inject node <id> <json-value>\n"
            "  set code <id> <python...>\n"
            "  align node | align graph"
        )
    if low == "clear":
        return "cleared (use API /api/grok/clear for full reset)"
    if low == "run":
        result = run_graph()
        return json.dumps(result, indent=2)
    if low == "save":
        put_graph(get_graph())
        return f"saved graph {graph_name}"
    if low == "graph":
        return json.dumps(get_graph(), indent=2)
    if low == "agent":
        result = agent_propose(get_graph())
        return json.dumps(result, indent=2)
    if low.startswith("align "):
        return f"align → {cmd.split(maxsplit=1)[1]} (apply in UI)"
    if low.startswith("set code "):
        rest = cmd[9:].strip()
        parts = rest.split(maxsplit=1)
        if len(parts) < 2:
            return "usage: set code <nodeId> <python>"
        node_id, code = parts
        g = get_graph()
        for n in g.get("nodes", []):
            if n.get("id") == node_id:
                n["code"] = code
                put_graph(g)
                return f"updated code on {node_id}"
        return f"node not found: {node_id}"
    if low.startswith("inject "):
        return f"inject queued: {cmd[7:]}"
    return f"unknown command: {cmd} (try help)"