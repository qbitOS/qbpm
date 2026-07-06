from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from qbpm.api import app
from qbpm.engine import run_graph
from qbpm.graph import load_graph
from qbpm.live_bus import get_bus
from qbpm.tools_registry import discover_tools


@pytest.fixture
def client():
    return TestClient(app)


def test_discover_kbatch_tool():
    root = Path(__file__).resolve().parents[1]
    tools = discover_tools(root)
    ids = [t["id"] for t in tools]
    assert "kbatch" in ids
    kbatch = next(t for t in tools if t["id"] == "kbatch")
    assert kbatch["url"] == "/tools/kbatch/kbatch.html"
    assert kbatch["embed"] == "/tools/kbatch/kbatch-qbpm.html?qbpm=1"
    assert "jax" in kbatch.get("stack", [])


def test_live_ingest_and_state(client):
    bus = get_bus()
    bus.events.clear()
    bus.state.clear()

    res = client.post(
        "/api/live/ingest?source=test",
        json={"text": "hello", "flow": "→↑", "musica": "C", "bpm": 128},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert data["state"]["text"] == "hello"
    assert data["state"]["bpm"] == 128

    snap = client.get("/api/live/state").json()
    assert snap["state"]["flow"] == "→↑"


def test_live_music_graph_runs():
    root = Path(__file__).resolve().parents[1]
    get_bus().ingest({"text": "do re", "flow": "→→", "musica": "CD", "bpm": 120}, source="test")
    graph = load_graph(root / "graphs" / "live-music.json")
    result = run_graph(graph)
    assert result["ok"] is True
    score = next(t for t in result["trace"] if t.get("node") == "score")
    assert score["result"]["notes"]


def test_tools_and_health(client):
    health = client.get("/api/health").json()
    assert health["ok"] is True
    assert "live" in health
    assert any(t["id"] == "kbatch" for t in health["tools"])

    tools = client.get("/api/tools").json()
    assert tools["ok"] is True
    assert len(tools["tools"]) >= 1