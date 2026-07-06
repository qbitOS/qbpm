from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import yaml
from fastapi import FastAPI, HTTPException, Query, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from qbpm.engine import run_graph
from qbpm.graph import Graph, load_graph, save_graph
from qbpm.graph_ws import GraphCollabHub, graph_ws_loop
from qbpm.grok_ws import grok_ws_loop
from qbpm.live_bus import get_bus
from qbpm.live_ws import LiveMusicHub, live_ws_loop
from qbpm.terminal import TerminalHub, parse_grok_command
from qbpm.imagine_api import get_slug, list_slugs
from qbpm.tools_registry import discover_tools
from qbpm.video_api import commands_for, list_tools as video_tools, resolve_url

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "web"
GRAPHS = ROOT / "graphs"
TOOLS = ROOT / "tools"
CONFIG = ROOT / "configs" / "default.yaml"

app = FastAPI(title="qbpm", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8795",
        "http://localhost:8795",
        "http://127.0.0.1:8796",
        "http://localhost:8796",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
hub = TerminalHub()
collab = GraphCollabHub()
live_hub = LiveMusicHub()
_active_graph = "default"


class AgentProposeRequest(BaseModel):
    graph: dict[str, Any]
    intent: str = "expand"


class GrokInjectRequest(BaseModel):
    text: str
    session_id: str | None = Field(default=None, alias="sessionId")
    source: str = "grok"
    execute: bool = True

    model_config = {"populate_by_name": True}


class GrokBatchInjectRequest(BaseModel):
    lines: list[str]
    session_id: str | None = Field(default=None, alias="sessionId")
    source: str = "grok"

    model_config = {"populate_by_name": True}


class VideoResolveRequest(BaseModel):
    url: str


class LiveIngestRequest(BaseModel):
    text: str = ""
    flow: str = ""
    musica: str = ""
    bpm: float = 0
    cpm: float | None = None
    rhythm: dict[str, Any] | None = None
    blocks: list[Any] | None = None
    contrail: str | None = None
    wpm: float | None = None
    keysPerSec: float | None = None
    stack: dict[str, Any] | None = None
    source: str | None = None

    model_config = {"extra": "allow"}


def _config() -> dict[str, Any]:
    if CONFIG.exists():
        return yaml.safe_load(CONFIG.read_text(encoding="utf-8")) or {}
    return {}


def _graph_path(name: str) -> Path:
    return GRAPHS / f"{name}.json"


def _read_graph_dict(name: str | None = None) -> dict[str, Any]:
    n = name or _active_graph
    path = _graph_path(n)
    if not path.exists():
        raise HTTPException(404, f"graph not found: {n}")
    return json.loads(path.read_text(encoding="utf-8"))


def _write_graph_dict(body: dict[str, Any], name: str | None = None) -> Path:
    n = name or _active_graph
    graph = Graph.model_validate(body)
    path = _graph_path(n)
    save_graph(graph, path)
    return path


def _run_active_graph() -> dict[str, Any]:
    return run_graph(load_graph(_graph_path(_active_graph)))


def _agent_on_graph(graph_dict: dict[str, Any]) -> dict[str, Any]:
    graph = Graph.model_validate(graph_dict)
    new_id = f"node-{len(graph.nodes) + 1}"
    return {
        "ok": True,
        "diff": {
            "op": "add",
            "node": {
                "id": new_id,
                "type": "python.exec",
                "pos": [240.0, 360.0],
                "code": 'result = {"generated": True}',
            },
            "edge": {
                "from": graph.nodes[0].id if graph.nodes else "clock",
                "to": new_id,
                "port": "data",
            },
        },
    }


def _apply_agent_diff(graph_dict: dict[str, Any], proposal: dict[str, Any]) -> dict[str, Any]:
    diff = proposal.get("diff") or {}
    if diff.get("op") == "add" and diff.get("node"):
        graph_dict.setdefault("nodes", []).append(diff["node"])
        if diff.get("edge"):
            graph_dict.setdefault("edges", []).append(diff["edge"])
    return graph_dict


def _command_handler(cmd: str, _session_id: str) -> str:
    def get_g() -> dict[str, Any]:
        return _read_graph_dict(_active_graph)

    def put_g(g: dict[str, Any]) -> None:
        _write_graph_dict(g, _active_graph)

    def run_g() -> dict[str, Any]:
        return _run_active_graph()

    def agent_g(g: dict[str, Any]) -> dict[str, Any]:
        prop = _agent_on_graph(g)
        updated = _apply_agent_diff(g, prop)
        put_g(updated)
        return prop

    out = parse_grok_command(
        cmd,
        graph_name=_active_graph,
        get_graph=get_g,
        put_graph=put_g,
        run_graph=run_g,
        agent_propose=agent_g,
    )
    if cmd.strip().lower() == "agent":
        return out
    return out


@app.get("/api/health")
def health() -> dict[str, Any]:
    cfg = _config()
    tools = discover_tools(ROOT)
    return {
        "ok": True,
        "app": "qbpm",
        "version": "0.2.0",
        "graph": _active_graph,
        "graph_dir": str(GRAPHS),
        "port": cfg.get("port", 8796),
        "grok": {"inject": "/api/grok/inject", "ws": "/api/grok/ws"},
        "collab": {"ws": "/api/graph/ws"},
        "video": {"resolve": "/api/video/resolve", "tools": "/api/video/tools"},
        "imagine": {"slugs": "/api/imagine/slugs", "slug": "/api/imagine/slug/{slug}"},
        "foundation": str(ROOT / "foundation"),
        "live": {
            "ingest": "/api/live/ingest",
            "state": "/api/live/state",
            "ws": "/api/live/ws",
            "stack": ["jax", "python", "json", "wasm", "repel"],
        },
        "tools": tools,
        "pwa": {"manifest": "/manifest.webmanifest", "sw": "/sw.js"},
    }


@app.get("/api/tools")
def list_tools() -> dict[str, Any]:
    return {"ok": True, "tools": discover_tools(ROOT)}


@app.get("/api/video/tools")
def api_video_tools() -> dict[str, Any]:
    return video_tools()


@app.post("/api/video/resolve")
def api_video_resolve(req: VideoResolveRequest) -> dict[str, Any]:
    return resolve_url(req.url)


@app.get("/api/video/commands")
def api_video_commands(url: str) -> dict[str, Any]:
    return {"ok": True, "url": url, "commands": commands_for(url)}


@app.get("/api/imagine/slugs")
def api_imagine_slugs() -> dict[str, Any]:
    return list_slugs()


@app.get("/api/imagine/slug/{slug}")
def api_imagine_slug(slug: str) -> dict[str, Any]:
    return get_slug(slug)


@app.get("/api/live/state")
def live_state() -> dict[str, Any]:
    return get_bus().snapshot()


@app.post("/api/live/ingest")
async def live_ingest(
    body: LiveIngestRequest,
    source: str = Query(default="http"),
) -> dict[str, Any]:
    payload = body.model_dump(exclude_none=True)
    src = str(body.source or source)
    result = get_bus().ingest(payload, source=src)
    await live_hub.broadcast({"type": "ingest", **result})
    return result


@app.get("/api/graph/{name}")
def get_graph(name: str) -> dict[str, Any]:
    return _read_graph_dict(name)


@app.put("/api/graph/{name}")
def put_graph(name: str, body: dict[str, Any]) -> dict[str, Any]:
    global _active_graph
    _active_graph = name
    path = _write_graph_dict(body, name)
    return {"ok": True, "name": name, "path": str(path)}


@app.post("/api/graph/{name}/run")
def run_named_graph(name: str) -> dict[str, Any]:
    global _active_graph
    _active_graph = name
    return _run_active_graph()


@app.post("/api/graph/run")
def run_inline_graph(body: dict[str, Any]) -> dict[str, Any]:
    graph = Graph.model_validate(body)
    return run_graph(graph)


@app.post("/api/agent/propose")
def agent_propose(req: AgentProposeRequest) -> dict[str, Any]:
    prop = _agent_on_graph(req.graph)
    updated = _apply_agent_diff(dict(req.graph), prop)
    return {**prop, "graph": updated}


@app.get("/api/grok/terminal")
def grok_terminal(session_id: str | None = None) -> dict[str, Any]:
    sess = hub.ensure(session_id)
    return {
        "ok": True,
        "sessionId": sess.id,
        "terminalText": sess.text(),
        "terminalByClient": hub.sessions(),
        "lines": sess.lines,
    }


@app.post("/api/grok/inject")
def grok_inject(req: GrokInjectRequest) -> dict[str, Any]:
    handler = _command_handler if req.execute else None
    results = []
    for line in req.text.splitlines():
        if not line.strip():
            continue
        results.append(
            hub.inject(
                line,
                session_id=req.session_id,
                source=req.source,
                handler=handler,
            )
        )
    last = results[-1] if results else hub.ensure(req.session_id).text()
    if isinstance(last, dict):
        return last
    return {"ok": True, "terminalText": str(last)}


@app.post("/api/grok/inject/batch")
def grok_inject_batch(req: GrokBatchInjectRequest) -> dict[str, Any]:
    outputs = []
    for line in req.lines:
        if not line.strip():
            continue
        outputs.append(
            hub.inject(
                line,
                session_id=req.session_id,
                source=req.source,
                handler=_command_handler,
            )
        )
    return {"ok": True, "results": outputs}


@app.post("/api/grok/clear")
def grok_clear(session_id: str | None = None) -> dict[str, str]:
    hub.clear(session_id)
    return {"ok": "true", "sessionId": session_id or "main"}


@app.websocket("/api/grok/ws")
async def grok_websocket(websocket: WebSocket) -> None:
    await grok_ws_loop(websocket, hub, on_command=_command_handler)


@app.websocket("/api/graph/ws")
async def graph_websocket(websocket: WebSocket, graph: str = "default") -> None:
    await graph_ws_loop(
        websocket,
        collab,
        graph_name=graph,
        get_graph=lambda: _read_graph_dict(graph),
    )


@app.websocket("/api/live/ws")
async def live_websocket(websocket: WebSocket) -> None:
    await live_ws_loop(websocket, live_hub, get_bus())


@app.get("/manifest.webmanifest")
def manifest() -> FileResponse:
    return FileResponse(WEB / "manifest.webmanifest", media_type="application/manifest+json")


@app.get("/sw.js")
def service_worker() -> FileResponse:
    return FileResponse(WEB / "sw.js", media_type="application/javascript")


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB / "index.html")


app.mount("/static", StaticFiles(directory=WEB, follow_symlink=True), name="static")

for tool in discover_tools(ROOT):
    web_rel = tool.get("web")
    if not web_rel:
        continue
    web_dir = (ROOT / web_rel).parent
    mount = f"/tools/{tool['id']}"
    if web_dir.is_dir():
        app.mount(
            mount,
            StaticFiles(directory=web_dir, check_dir=False, follow_symlink=True),
            name=f"tool-{tool['id']}",
        )


def main() -> None:
    import uvicorn

    cfg = _config()
    uvicorn.run(
        "qbpm.api:app",
        host=str(cfg.get("host", "127.0.0.1")),
        port=int(cfg.get("port", 8796)),
        reload=True,
    )


if __name__ == "__main__":
    main()