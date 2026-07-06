from qbpm.imagine_api import list_slugs
from qbpm.video_api import commands_for, list_tools


def test_video_tools() -> None:
    out = list_tools()
    assert out["ok"] is True
    assert "tools" in out


def test_video_commands() -> None:
    cmds = commands_for("https://example.com/watch?v=test")
    assert "play" in cmds
    assert "download" in cmds


def test_imagine_slugs() -> None:
    out = list_slugs()
    assert out["ok"] is True
    assert isinstance(out["slugs"], list)