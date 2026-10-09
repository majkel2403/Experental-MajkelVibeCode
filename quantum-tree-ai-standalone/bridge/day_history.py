"""Dziennik zadań Hermesa na dysku (Telegram, cron, konsola) — źródło „Filmu dnia” w Jarvis OS.

Wtyczka hermes/plugins/jarvis-events wysyła do mostu zdarzenia zadań; most trzyma je tylko w pamięci (AGENT_LOG), więc po
restarcie i przy zamkniętej karcie znikały. Tu zapisujemy jedynie początek i koniec zadania (tytuł, platforma, wynik
w skrócie, liczba narzędzi) w `~/.jarvis-os/agent-history.jsonl`; 8 dni, najwyżej 3000 wierszy.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

KEEP_DAYS, MAX_LINES = 8, 3000
TYPES = {"task.created", "task.completed", "task.failed"}


def _line(evt: dict, tools: int) -> dict:
    out = {"ts": float(evt.get("ts") or time.time()), "type": evt["type"], "task_id": str(evt["task_id"])[:80]}
    for k, n in (("platform", 30), ("title", 160), ("result", 200), ("error", 160)):
        if evt.get(k):
            out[k] = str(evt[k])[:n]
    if evt["type"] != "task.created":
        out["tools"] = int(tools)
    return out


def record(path: Path, evt: dict, tools: int = 0) -> bool:
    """Dopisuje początek/koniec zadania; inne zdarzenia (narzędzia) pomija. Błąd zapisu nie przerywa obsługi zdarzenia."""
    if not isinstance(evt, dict) or evt.get("type") not in TYPES or not isinstance(evt.get("task_id"), str):
        return False
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("ab") as f:
            f.write((json.dumps(_line(evt, tools), ensure_ascii=False) + "\n").encode("utf-8", "replace"))
        if path.stat().st_size > MAX_LINES * 400:
            prune(path)
        return True
    except OSError:
        return False


def _read(path: Path) -> list[dict]:
    try:
        raw = path.read_bytes().decode("utf-8", "replace").splitlines()
    except OSError:
        return []
    out = []
    for ln in raw:
        try:
            j = json.loads(ln)
        except ValueError:
            continue
        if isinstance(j, dict) and j.get("type") in TYPES and isinstance(j.get("task_id"), str):
            out.append(j)
    return out


def prune(path: Path, now: float | None = None) -> None:
    """Zostawia ostatnie KEEP_DAYS dni i najwyżej MAX_LINES wierszy (zapis atomowy)."""
    now = time.time() if now is None else now
    keep = [j for j in _read(path) if now - float(j.get("ts") or 0) <= KEEP_DAYS * 86400][-MAX_LINES:]
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes("".join(json.dumps(j, ensure_ascii=False) + "\n" for j in keep).encode("utf-8", "replace"))
    tmp.replace(path)


def tasks(path: Path, since: float, until: float | None = None) -> list[dict]:
    """Zadania rozpoczęte w [since, until): {id, platform, title, started, ended, status, result, tools}, od najstarszego.
    status: done | failed | running (bez końca — trwa albo przerwane przez restart gatewaya)."""
    until = time.time() + 60 if until is None else until
    by: dict[str, dict] = {}
    for j in _read(path):
        tid = j["task_id"]
        if j["type"] == "task.created":
            if since <= float(j["ts"]) < until:
                by[tid] = {"id": tid, "platform": j.get("platform", ""), "title": j.get("title", "") or "Zadanie", "started": j["ts"],
                           "ended": None, "status": "running", "result": "", "tools": 0}
        elif tid in by:
            by[tid].update(ended=j["ts"], status="done" if j["type"] == "task.completed" else "failed",
                           result=j.get("result") or j.get("error") or "", tools=int(j.get("tools") or 0))
    return sorted(by.values(), key=lambda t: t["started"])
