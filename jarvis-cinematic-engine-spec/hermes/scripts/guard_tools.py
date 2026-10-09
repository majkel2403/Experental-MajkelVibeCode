# -*- coding: utf-8 -*-
"""Hak pre_tool_call Hermesa (config.yaml: hooks.pre_tool_call) — twarde blokady zamiast próśb w SOUL/HERMES.md.

Źródło w repo: hermes/scripts/guard_tools.py (apply_profile kopiuje do scripts/ profilu i wpisuje hak do config.yaml).
Wejście (stdin, JSON od Hermesa): {hook_event_name, tool_name, tool_input|args, ...}. Blokada = kod wyjścia 2 + JSON
{"decision": "block", "reason": "..."} (komunikat trafia do modelu). Każdy błąd parsowania = przepuść (fail open).

Blokuje:
1. zabicie CAŁEJ przeglądarki (taskkill /IM, Stop-Process -Name, Get-Process … | Stop-Process, pkill/killall) —
   zamyka wszystkie karty użytkownika (incydent z 2026-10-04: zabity cały Edge, a Jarvis był w Comecie);
2. `hermes … gateway restart|stop` z terminala Hermesa — gateway zabiłby sam siebie w trakcie rozmowy.
"""
from __future__ import annotations

import json
import re
import sys

BROWSERS = r"(?:msedge|chrome|comet|firefox|brave|opera|vivaldi|arc|chromium)"
KILL_BROWSER = re.compile(
    r"taskkill\b[^\n]*?(?:/|-)im\s*[\"']?" + BROWSERS + r"(?:\.exe)?"
    r"|stop-process\b[^\n]*?-name\s*[\"']?" + BROWSERS +
    r"|(?:get-process|gps)\s+(?:-name\s+)?[\"']?" + BROWSERS + r"[^\n|]*\|\s*(?:stop-process|spps|kill)"
    r"|\b(?:pkill|killall)\b[^\n]*?" + BROWSERS,
    re.I)
GATEWAY_SELF = re.compile(r"\bhermes(?:\.exe)?\b[^\n]*?\bgateway\s+(?:restart|stop)\b", re.I)


def verdict(tool: str, inp: dict) -> str | None:
    text = inp.get("command") or inp.get("code") or inp.get("cmd") or ""
    if not isinstance(text, str) or not text:
        return None
    if KILL_BROWSER.search(text):
        return ("Zablokowane: to polecenie zamknęłoby CAŁĄ przeglądarkę ze wszystkimi kartami użytkownika. "
                "Kartę Jarvis OS otwiera/wyciąga na wierzch narzędzie desktop_open; innych kart nie zamykaj — powiedz użytkownikowi, co chcesz zrobić.")
    if GATEWAY_SELF.search(text):
        return ("Zablokowane: `hermes gateway restart/stop` z Twojego terminala zabiłoby Ciebie w trakcie rozmowy. "
                "Restart gatewaya wyłącznie: schtasks /Run /TN JarvisOS-GatewayRestart (skill jarvis-operations).")
    return None


def main() -> int:
    try:
        data = json.loads(sys.stdin.read() or "{}")
    except ValueError:
        return 0
    inp = data.get("tool_input") or data.get("args") or {}
    if not isinstance(inp, dict):
        return 0
    why = verdict(str(data.get("tool_name") or ""), inp)
    if not why:
        return 0
    sys.stdout.write(json.dumps({"decision": "block", "reason": why}, ensure_ascii=False))
    return 2


if __name__ == "__main__":
    sys.exit(main())
