"""Testy wtyczki hermes/plugins/jarvis-events (bez sieci i bez Hermesa)."""
from __future__ import annotations

import importlib.util
import queue
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit
PLUGIN = Path(__file__).resolve().parent.parent / "plugins" / "jarvis-events" / "__init__.py"


@pytest.fixture()
def plugin(monkeypatch):
    spec = importlib.util.spec_from_file_location("jarvis_events_under_test", PLUGIN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    monkeypatch.setattr(mod, "_sender", lambda: None)   # bez wątku wysyłki — zdarzenia zostają w kolejce testu
    mod._q = queue.Queue()
    hooks = {}

    class Ctx:
        def register_hook(self, name, fn):
            hooks[name] = fn

    mod.register(Ctx())
    mod.hooks = hooks
    return mod


def drain(mod):
    out = []
    while not mod._q.empty():
        out.append(mod._q.get_nowait())
    return out


def test_telegram_turn_produces_task_and_tool_events(plugin):
    h = plugin.hooks
    assert h["pre_llm_call"](session_id="s1", turn_id="t1", user_message="sprawdź pogodę", platform="telegram", model="MiniMax-M3") is None
    h["pre_tool_call"](tool_name="web_search", args={"query": "pogoda Gorinchem"}, session_id="s1", tool_call_id="c1")
    h["post_tool_call"](tool_name="web_search", args={}, session_id="s1", tool_call_id="c1", duration_ms=840, status="ok")
    h["pre_tool_call"](tool_name="tool_call", args={"name": "mcp__jarvis_desktop__create_note", "arguments": {}}, session_id="s1", tool_call_id="c2")
    h["post_tool_call"](tool_name="terminal", args={"command": "x"}, session_id="s1", tool_call_id="c3", status="error", error_message="exit 1")
    assert h["post_llm_call"](session_id="s1", assistant_response="12°C") is None
    ev = drain(plugin)
    assert [e["type"] for e in ev] == ["task.created", "tool.started", "tool.completed", "tool.started", "tool.failed", "task.completed"]
    assert ev[0]["task_id"] == "h-s1-t1" and ev[0]["platform"] == "telegram" and ev[0]["title"] == "sprawdź pogodę"
    assert ev[1]["label"] == "pogoda Gorinchem" and ev[2]["ms"] == 840
    assert ev[3]["tool"] == "mcp__jarvis_desktop__create_note", "narzędzie za tool_call pod prawdziwą nazwą"
    assert ev[4]["error"] == "exit 1"
    assert ev[5]["result"] == "12°C" and "s1" not in plugin._sessions


def test_desktop_chat_and_subagents_are_skipped(plugin):
    h = plugin.hooks
    h["pre_llm_call"](session_id="api-1", turn_id="t", user_message="hej", platform="api_server")
    h["pre_llm_call"](session_id="sub-1", turn_id="t", user_message="zadanie", platform="subagent")
    h["pre_tool_call"](tool_name="terminal", args={"command": "dir"}, session_id="api-1")
    assert drain(plugin) == []


def test_secrets_are_masked_in_labels_and_titles(plugin):
    h = plugin.hooks
    h["pre_llm_call"](session_id="s2", turn_id="t", user_message="użyj klucza sk-or-v1-abcdefghijklmnop", platform="telegram")
    h["pre_tool_call"](tool_name="terminal", args={"command": "curl -H 'Authorization: Bearer abc123def' http://x"}, session_id="s2")
    ev = drain(plugin)
    assert "sk-or-v1" not in ev[0]["title"] and "***" in ev[0]["title"]
    assert "abc123def" not in ev[1]["label"]
    assert len(ev[1]["label"]) <= 61


def test_empty_response_is_a_failure_and_queue_never_blocks(plugin):
    h = plugin.hooks
    h["pre_llm_call"](session_id="s3", turn_id="t", user_message="x", platform="cron")
    h["post_llm_call"](session_id="s3", assistant_response="")
    assert [e["type"] for e in drain(plugin)] == ["task.created", "task.failed"]
    plugin._q = queue.Queue(maxsize=1)
    for _ in range(5):
        plugin._emit("tool.started", task_id="x")   # pełna kolejka: zdarzenie przepada, Hermes nie czeka
    assert plugin._q.qsize() == 1
