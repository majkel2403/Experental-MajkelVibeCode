# -*- coding: utf-8 -*-
"""Poranny raport Jarvis OS na Telegram (cron Hermesa, --no-agent: bez modelu, bez kosztów).

Źródło w repo: hermes/scripts/jarvis_daily.py — hermes/apply_profile.py kopiuje go do scripts/ profilu jarvis-desktop.
Sprawdza: usługi (strona :4000, most :8651, Hermes :8643), kartę Jarvisa i bezpiecznik mostu, agentów, nieudane zadania
z ostatniej doby (~/.jarvis-os/logs/tasks.jsonl) i długość bieżącej rozmowy na Telegramie (state.db, tylko odczyt).
Wypisuje krótki raport po polsku (zawsze — to raport, nie alarm). Ręcznie: python jarvis_daily.py
"""
from __future__ import annotations

import json
import os
import socket
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HOME = Path.home()
JOS = HOME / ".jarvis-os"
PROFILE = HOME / ".hermes" / "profiles" / "jarvis-desktop"
LONG_SESSION = int(os.environ.get("JARVIS_DAILY_LONG_SESSION", "300"))   # tyle wiadomości w rozmowie = czas na /new


def port_up(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), 1.5):
            return True
    except OSError:
        return False


def bridge_get(path: str) -> dict | None:
    try:
        tok = (JOS / "bridge-token").read_text(encoding="utf-8").strip()
        req = urllib.request.Request("http://127.0.0.1:8651" + path, headers={"X-Bridge-Token": tok})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception:  # noqa: BLE001 — raport ma powiedzieć „niedostępny”, nie paść
        return None


def tasks_last_day() -> tuple[int, list[dict]]:
    p = JOS / "logs" / "tasks.jsonl"
    since = (time.time() - 86400) * 1000
    total, failed = 0, []
    try:
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                e = json.loads(line)
            except ValueError:
                continue
            if (e.get("ts") or 0) < since:
                continue
            total += 1
            if e.get("status") == "err" or e.get("fail"):
                failed.append(e)
    except OSError:
        pass
    return total, failed


def telegram_session() -> tuple[int, str] | None:
    db = PROFILE / "state.db"
    if not db.exists():
        return None
    try:
        c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
        row = c.execute("select s.id, count(m.id), max(m.timestamp) from sessions s join messages m on m.session_id = s.id "
                        "where s.source = 'telegram' group by s.id order by max(m.timestamp) desc limit 1").fetchone()
        c.close()
        return (row[1], time.strftime("%d.%m %H:%M", time.localtime(row[2]))) if row else None
    except sqlite3.Error:
        return None


def main() -> int:
    lines = ["☀️ Jarvis OS — raport poranny " + time.strftime("%d.%m.%Y")]
    svc = {"strona :4000": port_up(4000), "most :8651": port_up(8651), "Hermes :8643": port_up(8643)}
    down = [k for k, v in svc.items() if not v]
    lines.append("✅ Usługi działają." if not down else "❌ Nie działa: " + ", ".join(down) + " — napraw: powershell -File bridge\\redeploy.ps1 (albo integrations\\doctor.ps1).")

    st = bridge_get("/bridge/status") if svc["most :8651"] else None
    if st:
        cards = st.get("clients", 0)
        lines.append(f"🖥 Karta Jarvisa: {'połączona' if cards else 'brak — Hermes otworzy ją sam (desktop_open)'} · narzędzia: {len(st.get('tools') or [])}")
        cb = (st.get("circuit_breaker") or {}).get("states") or {}
        if cb:
            lines.append("⚠️ Bezpiecznik wstrzymał: " + ", ".join(f"{k} ({v})" for k, v in cb.items()))
        ag = st.get("agents") or {}
        if ag and not ag.get("key"):
            lines.append("⚠️ Brak klucza Jeva — agent WWW i sterowanie komputerem nie zadziałają (integrations\\set-key.ps1).")

    total, failed = tasks_last_day()
    if total:
        lines.append(f"📋 Zadania z doby: {total}, nieudane: {len(failed)}.")
        for e in failed[-3:]:
            lines.append(f"   • „{str(e.get('text') or '')[:60]}” — {str(e.get('reply') or e.get('fail') or 'błąd')[:90]}")
    else:
        lines.append("📋 Wczoraj Jarvis nie dostał żadnych zadań.")

    ts = telegram_session()
    if ts:
        n, last = ts
        lines.append(f"💬 Rozmowa na Telegramie: {n} wiadomości" + (f" — za długa, napisz /new (Hermes będzie szybszy i mniej się pomyli)." if n >= LONG_SESSION else "."))
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
