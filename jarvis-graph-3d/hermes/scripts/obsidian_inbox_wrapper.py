"""Cron „Obsidian ForAI Inbox Sync” (co 2 h, no_agent): przetwarza 00 - Inbox/ForAI.

Poprawione 2026-10-05 (Claude Code): wcześniej wołało `obsidian-capture.py inbox`, które tylko wypisywało
komunikat — skrzynka nigdy nie była przetwarzana. Teraz `obsidian-inbox.py process` (klasyfikacja notatek,
podsumowanie w 04 - Resources/Inbox Summary.md; pamięci Hermesa nie rusza, notatek nie usuwa).
Notatki w skrzynce widzi też Jarvis na starcie rozmowy (wtyczka obsidian-brain).
"""
import os
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a wypisujemy emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = Path(__file__).parent
# obsidian-inbox.py drukuje emoji — bez UTF-8 konsola cp1250 wywraca go przy pierwszej notatce
env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
result = subprocess.run(
    [sys.executable, str(SCRIPT_DIR / "obsidian-inbox.py"), "process"],
    capture_output=True, text=True, encoding="utf-8", timeout=60, env=env
)
print(result.stdout.strip())
if result.returncode != 0:
    print(f"ERROR: {result.stderr.strip()}", file=sys.stderr)
    sys.exit(result.returncode)
