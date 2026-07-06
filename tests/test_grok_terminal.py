from fastapi.testclient import TestClient

from qbpm.api import app

client = TestClient(app)


def test_grok_inject_help():
    r = client.post("/api/grok/inject", json={"text": "help", "source": "test"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert "run" in data["terminalText"]


def test_grok_health_has_endpoints():
    r = client.get("/api/health")
    assert r.json()["grok"]["inject"] == "/api/grok/inject"


def test_manifest():
    r = client.get("/manifest.webmanifest")
    assert r.status_code == 200
    assert "qbpm" in r.text