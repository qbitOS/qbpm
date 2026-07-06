from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    type: str
    pos: tuple[float, float]
    params: dict[str, Any] = Field(default_factory=dict)
    code: str = ""


class GraphEdge(BaseModel):
    from_: str = Field(alias="from")
    to: str
    port: str = "default"

    model_config = {"populate_by_name": True}


class Graph(BaseModel):
    version: int = 1
    meta: dict[str, Any] = Field(default_factory=dict)
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)

    def node_map(self) -> dict[str, GraphNode]:
        return {n.id: n for n in self.nodes}

    def children_of(self, node_id: str) -> list[str]:
        return [e.to for e in self.edges if e.from_ == node_id]

    def parents_of(self, node_id: str) -> list[str]:
        return [e.from_ for e in self.edges if e.to == node_id]


def load_graph(path: Path) -> Graph:
    data = json.loads(path.read_text(encoding="utf-8"))
    return Graph.model_validate(data)


def save_graph(graph: Graph, path: Path) -> None:
    payload = graph.model_dump(by_alias=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")