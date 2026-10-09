"""Pamięć Jarvisa → sejf Obsidian (`04 - Resources/Hermes Memory.md`).

Przepisane 2026-10-05 (Claude Code). Poprzednia wersja czytała globalne `~/.hermes/memories/MEMORY.md` zamiast pamięci
aktywnego profilu i szukała wypunktowań „- ”, a Hermes 0.21 zapisuje wpisy rozdzielone linią „§” — notatka stała na 2026-06.

Teraz: czyta `MEMORY.md` (pamięć Jarvisa) i `USER.md` (o Michale) z profilu `jarvis-desktop`, maskuje wszystko, co wygląda
na sekret, i nadpisuje notatkę w sejfie. Wołane przez cron „Obsidian Daily Context” (7:30), da się też ręcznie.
Michał i Claude Code widzą dzięki temu, co Jarvis o nich zapamiętał. Tylko odczyt pamięci — nic w niej nie zmienia.
"""
from __future__ import annotations

import os
import re
import sys
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VAULT = Path(os.environ.get("OBSIDIAN_VAULT_PATH") or r"C:\Users\majke\Documents\hermes")
PROFILE = Path(os.environ.get("HERMES_PROFILE_DIR") or Path.home() / ".hermes" / "profiles" / "jarvis-desktop")
NOTE = VAULT / "04 - Resources" / "Hermes Memory.md"
SYNC_LOG = VAULT / "04 - Resources" / "Sync Log.md"
SECRET = re.compile(r"(sk-[A-Za-z0-9_-]{8,}|Bearer\s+\S+|(?i:(?:api[_-]?key|token|secret|password|passwd)\s*[=:]\s*)\S+|\b[A-Za-z0-9_-]{32,}\b)")


def entries(path: Path) -> list[str]:
    """Wpisy pamięci Hermesa: bloki rozdzielone linią „§” (starszy format: wypunktowania „- ”)."""
    try:
        text = path.read_text(encoding="utf-8").replace("\r\n", "\n")
    except OSError:
        return []
    if "§" in text:
        blocks = re.split(r"\n\s*§\s*\n", "\n" + text + "\n")
    elif any(l.startswith("- ") for l in text.split("\n")):            # starszy format: wypunktowania
        blocks = [l[2:] for l in text.split("\n") if l.startswith("- ")]
    else:                                                               # jeden wpis bez separatora
        blocks = [text]
    return [SECRET.sub("[ukryte]", " ".join(b.split())) for b in blocks if b.strip()]


def build(mem: list[str], user: list[str], now: str) -> str:
    lines = [
        "---", f"date: {now[:10]}", "type: resource", "status: active", "tags: [hermes, memory, sync, auto-generated]",
        "ai-first: true", "source: hermes-cron", "---", "",
        "# 🧠 Pamięć Jarvisa (kopia)", "",
        "## Dla przyszłego Jarvisa", "",
        f"Kopia pamięci Hermesa (profil `jarvis-desktop`) z {now} — tylko do wglądu dla Michała i [[Claude Code]]. "
        "Źródło prawdy: `~/.hermes/profiles/jarvis-desktop/memories/` (limity 4400/2200 znaków). Notatkę nadpisuje cron 7:30 — nie edytuj ręcznie.",
        "", f"## 👤 O Michale (USER.md — {len(user)} wpisów)", "",
    ]
    lines += [f"- {e}" for e in user] or ["- (pusto)"]
    lines += ["", f"## 🤖 Pamięć Jarvisa (MEMORY.md — {len(mem)} wpisów)", ""]
    lines += [f"- {e}" for e in mem] or ["- (pusto)"]
    lines += ["", "## 🔗 Powiązane", "", "- [[Jarvis]] · [[Hermes Agent]] · [[SOUL]]", ""]
    return "\n".join(lines)


def log(ok: bool, details: str, now: str) -> None:
    head = "---\ndate: 2026-06-10\ntype: system\ntags: [system, sync-log, resources]\nai-first: true\n---\n\n# 📋 Sync Log\n\n"
    old = SYNC_LOG.read_text(encoding="utf-8") if SYNC_LOG.exists() else ""
    rows = [l for l in old.split("\n") if l.startswith("- ")][-49:]
    rows.append(f"- {'✅' if ok else '❌'} {now} — {details}")
    SYNC_LOG.write_text(head + "\n".join(rows) + "\n", encoding="utf-8")


def main() -> int:
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    if not VAULT.exists():
        print(f"brak sejfu: {VAULT}")
        return 1
    mem, user = entries(PROFILE / "memories" / "MEMORY.md"), entries(PROFILE / "memories" / "USER.md")
    if not mem and not user:
        log(False, f"brak pamięci w {PROFILE / 'memories'}", now)
        print("brak wpisów pamięci — notatka bez zmian")
        return 0
    NOTE.parent.mkdir(parents=True, exist_ok=True)
    NOTE.write_text(build(mem, user, now), encoding="utf-8")
    log(True, f"pamięć: {len(mem)} wpisów, o Michale: {len(user)}", now)
    print(f"OK: Hermes Memory.md ({len(mem)} + {len(user)} wpisów)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
