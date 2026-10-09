"""jarvis-events — zadania Hermesa widoczne na pulpicie Jarvis OS (Orb, Process Log).

Hermes obsługuje rozmowy z Telegrama, crona i CLI poza kartą przeglądarki, więc pulpit nie wiedział, że agent pracuje.
Ta wtyczka wysyła zwięzłe zdarzenia do mostu (POST /bridge/agent-event), a most rozsyła je kartom (SSE `event: agent`).

Zasady:
- tylko obserwacja: haki zwracają None (nic nie trafia do kontekstu modelu, żadnych blokad);
- wysyłka w osobnym wątku z kolejką — tura Hermesa nigdy nie czeka na most; most niedostępny = zdarzenie pominięte;
- z argumentów narzędzi tylko krótka etykieta (≤ 60 znaków) z zamaskowanymi sekretami;
- api_server (czat z samej karty) i subagenci są pomijani — karta rejestruje swoje zadania sama.
"""
from __future__ import annotations

import json
import os
import queue
import re
import threading
import time
import urllib.request
from pathlib import Path
from typing import Any

SKIP_PLATFORMS = {"api_server", "subagent", "curator", "background_review"}
LABEL_KEYS = ("command", "query", "url", "path", "file_path", "name", "title", "goal", "pattern")
SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|(?i:(?:token|key|secret|password|passwd)\s*[=:]\s*)\S+|[A-Za-z0-9_-]{32,})")
MAX_QUEUE = 500

_q: "queue.Queue[dict]" = queue.Queue(maxsize=MAX_QUEUE)
_sessions: dict[str, dict] = {}       # session_id -> {task_id, platform, started}
_lock = threading.Lock()


def _bridge() -> tuple[str, str]:
    url = os.environ.get("JARVIS_BRIDGE_URL", "http://127.0.0.1:8651").rstrip("/")
    tok = os.environ.get("JARVIS_BRIDGE_TOKEN", "")
    if not tok:
        try:
            tok = (Path(os.environ.get("JARVIS_HOME") or Path.home() / ".jarvis-os") / "bridge-token").read_text(encoding="utf-8").strip()
        except OSError:
            tok = ""
    return url, tok


def _sender() -> None:
    url, tok = _bridge()
    while True:
        evt = _q.get()
        if not tok:
            url, tok = _bridge()
            if not tok:
                continue
        try:
            req = urllib.request.Request(url + "/bridge/agent-event", data=json.dumps(evt, ensure_ascii=False).encode("utf-8"),
                                         headers={"Content-Type": "application/json", "X-Bridge-Token": tok}, method="POST")
            urllib.request.urlopen(req, timeout=2).close()
        except Exception:   # noqa: BLE001 — most wyłączony/restart: zdarzenie przepada, Hermes działa dalej
            pass


def _emit(evt_type: str, **payload: Any) -> None:
    evt = {"v": 1, "type": evt_type, "ts": time.time(), **{k: v for k, v in payload.items() if v is not None}}
    try:
        _q.put_nowait(evt)
    except queue.Full:
        pass


def _mask(text: str) -> str:
    return SECRET.sub("***", text)


def _label(tool: str, args: Any) -> str:
    if not isinstance(args, dict):
        return ""
    if tool == "tool_call" and isinstance(args.get("name"), str):
        return ""
    for k in LABEL_KEYS:
        v = args.get(k)
        if isinstance(v, str) and v.strip():
            v = " ".join(v.split())
            return _mask(v[:60] + ("…" if len(v) > 60 else ""))
    return ""


def _effective_tool(tool: str, args: Any) -> str:
    """Narzędzie schowane za pomostem tool_search jest wołane przez tool_call(name=…) — pokazujemy prawdziwą nazwę."""
    if tool == "tool_call" and isinstance(args, dict) and isinstance(args.get("name"), str):
        return args["name"]
    return tool


def _task(session_id: Any) -> dict | None:
    with _lock:
        return _sessions.get(str(session_id or ""))


def register(ctx) -> None:
    threading.Thread(target=_sender, name="jarvis-events", daemon=True).start()

    def pre_llm_call(session_id=None, turn_id=None, user_message=None, platform=None, model=None, **_kw):
        plat = (platform or "").strip().lower()
        if not session_id or plat in SKIP_PLATFORMS:
            return None
        task_id = f"h-{session_id}-{turn_id or int(time.time())}"
        title = " ".join(str(user_message or "").split())
        with _lock:
            _sessions[str(session_id)] = {"task_id": task_id, "platform": plat or "cli", "started": time.time()}
        _emit("task.created", task_id=task_id, platform=plat or "cli", model=model, title=_mask(title[:160]))
        return None

    def pre_tool_call(tool_name=None, args=None, session_id=None, tool_call_id=None, **_kw):
        t = _task(session_id)
        if t and tool_name:
            _emit("tool.started", task_id=t["task_id"], call_id=tool_call_id, tool=_effective_tool(tool_name, args), label=_label(tool_name, args))
        return None

    def post_tool_call(tool_name=None, args=None, session_id=None, tool_call_id=None, duration_ms=None, status=None,
                       error_type=None, error_message=None, **_kw):
        t = _task(session_id)
        if t and tool_name:
            ok = str(status or "ok").lower() in ("ok", "success", "completed", "")
            _emit("tool.completed" if ok else "tool.failed", task_id=t["task_id"], call_id=tool_call_id,
                  tool=_effective_tool(tool_name, args), ms=duration_ms,
                  error=_mask(str(error_message or error_type or "")[:160]) if not ok else None)
        return None

    def post_llm_call(session_id=None, assistant_response=None, **_kw):
        with _lock:
            t = _sessions.pop(str(session_id or ""), None)
        if t:
            text = " ".join(str(assistant_response or "").split())
            _emit("task.completed" if text else "task.failed", task_id=t["task_id"], platform=t["platform"],
                  ms=int((time.time() - t["started"]) * 1000), result=_mask(text[:300]) if text else None)
        return None

    ctx.register_hook("pre_llm_call", pre_llm_call)
    ctx.register_hook("pre_tool_call", pre_tool_call)
    ctx.register_hook("post_tool_call", post_tool_call)
    ctx.register_hook("post_llm_call", post_llm_call)
