from qbpm.imagine_api import list_slugs
from qbpm.video_api import commands_for, list_tools, normalize_url, register_play_session


def test_video_tools() -> None:
    out = list_tools()
    assert out["ok"] is True
    assert "tools" in out


def test_video_commands() -> None:
    cmds = commands_for("https://example.com/watch?v=test")
    assert "play" in cmds
    assert "download" in cmds
    assert "resolve" in cmds


def test_normalize_url() -> None:
    assert normalize_url("  https://www.tiktok.com/@x/video/1  ") == "https://www.tiktok.com/@x/video/1"
    try:
        normalize_url("not-a-url")
        assert False, "expected ValueError"
    except ValueError:
        pass


def test_play_session_shape(monkeypatch) -> None:
    monkeypatch.setattr(
        "qbpm.video_api.resolve_stream_url",
        lambda url, fmt=None: "https://cdn.example/stream.mp4",
    )
    monkeypatch.setattr("qbpm.video_api._fetch_title", lambda url: "test title")
    sess = register_play_session("https://www.tiktok.com/@x/video/1")
    assert sess["playId"]
    assert sess["playPath"].startswith("/api/video/play/")
    assert sess["streamKind"] == "direct"


def test_imagine_slugs() -> None:
    out = list_slugs()
    assert out["ok"] is True
    assert isinstance(out["slugs"], list)