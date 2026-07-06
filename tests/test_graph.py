from pathlib import Path

from qbpm.engine import run_graph
from qbpm.graph import load_graph


def test_default_graph_runs():
    root = Path(__file__).resolve().parents[1]
    graph = load_graph(root / "graphs" / "default.json")
    result = run_graph(graph)
    assert result["ok"] is True
    assert "trace" in result