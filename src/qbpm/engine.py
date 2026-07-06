from __future__ import annotations

import time
from typing import Any

from qbpm.graph import Graph, GraphNode
from qbpm.live_bus import get_bus


def _safe_namespace() -> dict[str, Any]:
    return {"__builtins__": __builtins__}


def run_python_node(node: GraphNode, inputs: dict[str, Any]) -> dict[str, Any]:
    namespace = _safe_namespace()
    namespace["inputs"] = inputs
    namespace["result"] = None
    exec(node.code, namespace, namespace)
    out = namespace.get("result")
    if out is None:
        return {"ok": True, "node": node.id, "result": None}
    return {"ok": True, "node": node.id, "result": out}


def run_jax_node(node: GraphNode, inputs: dict[str, Any]) -> dict[str, Any]:
    try:
        import jax.numpy as jnp  # type: ignore
    except ImportError as exc:
        return {
            "ok": False,
            "node": node.id,
            "error": "jax not installed — uv sync --extra jax",
            "detail": str(exc),
        }
    namespace = _safe_namespace()
    namespace["jnp"] = jnp
    namespace["inputs"] = inputs
    namespace["result"] = None
    exec(node.code, namespace, namespace)
    out = namespace.get("result")
    return {"ok": True, "node": node.id, "result": out}


def run_node(node: GraphNode, inputs: dict[str, Any]) -> dict[str, Any]:
    if node.type == "core.clock":
        return {
            "ok": True,
            "node": node.id,
            "result": {"cpm": node.params.get("cpm", 120), "t": time.time()},
        }
    if node.type == "core.output":
        return {"ok": True, "node": node.id, "result": inputs}
    if node.type == "python.jax":
        return run_jax_node(node, inputs)
    if node.type == "python.exec":
        return run_python_node(node, inputs)
    if node.type == "kernel.cuda":
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "status": "stub",
                "message": "CUDA kernel binding — build src/kernels with nvcc",
                "inputs": inputs,
            },
        }
    if node.type == "agent.mutator":
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "status": "stub",
                "message": "POST /api/agent/propose for JSON graph diffs",
            },
        }
    if node.type == "music.clock":
        cpm = float(node.params.get("cpm") or inputs.get("clock", {}).get("cpm") or 120)
        bpm = float(node.params.get("bpm") or cpm)
        return {"ok": True, "node": node.id, "result": {"cpm": cpm, "bpm": bpm, "t": time.time()}}
    if node.type == "music.score":
        live = get_bus().state
        merged = {**live}
        for val in inputs.values():
            if isinstance(val, dict):
                merged.update(val)
        flow = str(merged.get("flow") or merged.get("contrail") or "")
        musica = str(merged.get("musica") or "")
        bpm = float(merged.get("bpm") or merged.get("cpm") or 120)
        notes = [c for c in musica if c.isalpha() or c in "♩♪♫#b"][:64]
        if not notes and flow:
            notes = list(flow.replace(" ", ""))[:32]
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "bpm": bpm,
                "flow": flow,
                "musica": musica,
                "notes": notes,
                "score": " ".join(notes) if notes else "(rest)",
            },
        }
    if node.type == "tool.kbatch":
        live = get_bus().state
        merged = {**live}
        for val in inputs.values():
            if isinstance(val, dict):
                merged.update(val)
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "tool": "kbatch",
                "text": merged.get("text", ""),
                "flow": merged.get("flow", ""),
                "musica": merged.get("musica", ""),
                "bpm": merged.get("bpm", 0),
                "wpm": merged.get("wpm"),
                "url": "/tools/kbatch/kbatch.html",
            },
        }
    if node.type == "wasm.classify":
        text = ""
        for val in inputs.values():
            if isinstance(val, dict) and val.get("text"):
                text = str(val["text"])
                break
        if not text:
            text = str(get_bus().state.get("text") or "")
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "lane": "wasm",
                "module": "/static/wasm/prefix_engine.js",
                "text": text[:512],
                "status": "browser-wasm",
                "budgetNs": 300,
            },
        }
    if node.type == "repel.play":
        stream = str(node.params.get("stream") or "/tmp/piano-live.m3u8")
        for val in inputs.values():
            if isinstance(val, dict) and val.get("stream"):
                stream = str(val["stream"])
        room = str(node.params.get("room") or "live")
        cmd = f"repel play {stream}"
        return {
            "ok": True,
            "node": node.id,
            "result": {
                "tool": "repel",
                "command": cmd,
                "stream": stream,
                "room": room,
                "hint": "~/dev/ffmpeg/repel",
            },
        }
    return {"ok": False, "node": node.id, "error": f"unknown type: {node.type}"}


def topological_order(graph: Graph) -> list[str]:
    nodes = graph.node_map()
    indegree = {nid: 0 for nid in nodes}
    for edge in graph.edges:
        indegree[edge.to] = indegree.get(edge.to, 0) + 1
    queue = [nid for nid, deg in indegree.items() if deg == 0]
    order: list[str] = []
    while queue:
        nid = queue.pop(0)
        order.append(nid)
        for child in graph.children_of(nid):
            indegree[child] -= 1
            if indegree[child] == 0:
                queue.append(child)
    if len(order) != len(nodes):
        return list(nodes.keys())
    return order


def run_graph(graph: Graph) -> dict[str, Any]:
    order = topological_order(graph)
    node_outputs: dict[str, Any] = {}
    trace: list[dict[str, Any]] = []

    for node_id in order:
        node = graph.node_map()[node_id]
        inputs = {
            parent: node_outputs.get(parent, {}).get("result")
            for parent in graph.parents_of(node_id)
        }
        result = run_node(node, inputs)
        node_outputs[node_id] = result
        trace.append(result)

    sinks = [n.id for n in graph.nodes if not graph.children_of(n.id)]
    return {
        "ok": True,
        "order": order,
        "trace": trace,
        "outputs": {sid: node_outputs.get(sid) for sid in sinks},
    }