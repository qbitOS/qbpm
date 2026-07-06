from qbpm.graph_ws import GraphCollabHub


def test_collab_hub_presence() -> None:
    hub = GraphCollabHub()
    assert hub.presence("default") == []
    hub._rooms["default"] = {}
    assert hub.next_rev("default") == 1
    assert hub.next_rev("default") == 2
    assert hub.chat_log("default") == []