"""Backup bazy stanu Hermesa (state.db) — wywoływany przez cron no-agent.

Bezpieczna kopia SQLite: VACUUM INTO (zamiast shutil.copy) — nie łamie -wal/-shm,
nie wymaga zatrzymywania gatewaya, wynik to spójna kawałek bazy.

Pusty stdout = OK. Inaczej wypisuje przyczynę (idzie na Telegram przez strażnika).
"""
import shutil
import sys
import time
from pathlib import Path

HOME = Path.home()
PROFILE = HOME / ".hermes" / "profiles" / "jarvis-desktop"
STATE_DB = PROFILE / "state.db"
BACKUP_ROOT = PROFILE / "backups" / "state-db"
KEEP_DAYS = 14

problems: list[str] = []


def main() -> int:
    if not STATE_DB.exists():
        problems.append(f"brak {STATE_DB}")
        return 1

    BACKUP_ROOT.mkdir(parents=True, exist_ok=True)
    today = time.strftime("%Y-%m-%d")
    dest = BACKUP_ROOT / f"state-{today}.db"

    try:
        # sqlite3 .backup / VACUUM INTO — atomowa, spójna kopia mimo -wal/-shm
        import sqlite3
        src = sqlite3.connect(str(STATE_DB))
        try:
            src.execute("VACUUM INTO ?", (str(dest),))
        finally:
            src.close()
    except Exception as e:  # noqa: BLE001
        # Fallback: shutil.copy + .bak (mniej bezpieczne, ale działa)
        try:
            shutil.copy2(STATE_DB, dest.with_suffix(".db.bak"))
            problems.append(f"VACUUM INTO nie wyszło ({e}); zapisano .bak zamiast .db")
        except Exception as e2:  # noqa: BLE001
            problems.append(f"backup nieudany: VACUUM={e}; copy={e2}")
            return 1

    # Retencja: kasuj kopie starsze niż KEEP_DAYS dni
    cutoff = time.time() - KEEP_DAYS * 86400
    for old in BACKUP_ROOT.glob("state-*.db*"):
        if old.stat().st_mtime < cutoff:
            old.unlink()
    return 0


if __name__ == "__main__":
    code = main()
    if problems:
        for p in problems:
            print(p)
    sys.exit(code if problems else 0)
