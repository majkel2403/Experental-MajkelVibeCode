#!/usr/bin/env python3
"""
obsidian-brain.py — Główny hub integracji Hermes ↔ Obsidian

Uruchamia różne workflowy z jednego miejsca.

Użycie:
  python obsidian-brain.py briefing          — poranny briefing
  python obsidian-brain.py capture-session    — zapisz sesję
  python obsidian-brain.py capture-daily      — zapisz dzienny kontekst
  python obsidian-brain.py capture-update     — update projektu
  python obsidian-brain.py capture-decision   — zapisz decyzję
  python obsidian-brain.py capture-error      — zapisz błąd
  python obsidian-brain.py process-inbox      — przetwórz ForAI
  python obsidian-brain.py full-sync          — pełny sync
  python obsidian-brain.py status             — status systemu
  python obsidian-brain.py dashboard          — dashboard linków
"""

import os
import sys
import json
from datetime import datetime, date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a skrypt drukuje emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# Importuj z innych skryptów (prosty import)
SCRIPT_DIR = Path(__file__).parent
sys.path.insert(0, str(SCRIPT_DIR))

def today(fmt: str = "%Y-%m-%d") -> str:
    return date.today().strftime(fmt)

def now(fmt: str = "%Y-%m-%d %H:%M") -> str:
    return datetime.now().strftime(fmt)

def vault_path(subpath: str = "") -> Path:
    vault = Path(os.environ.get(
        "OBSIDIAN_VAULT_PATH",
        r"C:\Users\majke\Documents\hermes"
    ))
    return vault / subpath if subpath else vault

def run_script(script_name: str, *args) -> str:
    """Uruchamia inny skrypt i zwraca output."""
    import subprocess
    script_path = SCRIPT_DIR / script_name
    cmd = [sys.executable, str(script_path)] + list(args)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return result.stdout or result.stderr or ""
    except Exception as e:
        return f"Error: {e}"

def get_system_status() -> dict:
    """Zbiera status systemu."""
    status = {
        "timestamp": now(),
        "vault": str(vault_path()),
        "vault_exists": vault_path().exists(),
        "notes_count": 0,
        "by_folder": {},
        "cron_jobs": [],
        "last_activity": None,
    }
    
    # Policz notatki
    for folder in ["06 - AI Sessions", "00 - Inbox", "01 - Daily", "02 - Projects"]:
        folder_path = vault_path(folder)
        if folder_path.exists():
            md_files = list(folder_path.rglob("*.md"))
            md_files = [f for f in md_files if ".obsidian" not in f.parts]
            status["by_folder"][folder] = len(md_files)
            status["notes_count"] += len(md_files)
    
    # Ostatnia aktywność
    all_notes = []
    for md in vault_path().rglob("*.md"):
        if ".obsidian" in md.parts:
            continue
        all_notes.append(md)
    
    if all_notes:
        all_notes.sort(key=lambda f: f.stat().st_mtime, reverse=True)
        latest = all_notes[0]
        status["last_activity"] = {
            "file": latest.name,
            "modified": datetime.fromtimestamp(latest.stat().st_mtime).strftime("%Y-%m-%d %H:%M")
        }
    
    # Cron jobs
    cron_file = Path.home() / ".hermes" / "cron" / "state"
    if cron_file.exists():
        try:
            import sqlite3
            conn = sqlite3.connect(cron_file)
            c = conn.cursor()
            c.execute("SELECT name, schedule, last_run, next_run FROM cron_jobs")
            rows = c.fetchall()
            conn.close()
            for row in rows:
                status["cron_jobs"].append({
                    "name": row[0],
                    "schedule": row[1],
                    "last_run": row[2],
                    "next_run": row[3]
                })
        except Exception:
            pass
    
    return status

def full_briefing() -> str:
    """Generuje pełny poranny briefing."""
    output = []
    output.append("=" * 60)
    output.append("JARVIS — RANKING BRIEFING")
    output.append(f"Data: {now()}")
    output.append("=" * 60)
    output.append("")
    
    # Status systemu
    status = get_system_status()
    output.append("📊 STATUS SYSTEMU")
    output.append(f"  Vault: {status['vault']}")
    output.append(f"  Notatek: {status['notes_count']}")
    for folder, count in status["by_folder"].items():
        if count:
            output.append(f"    {folder}: {count}")
    if status["last_activity"]:
        output.append(f"  Ostatnia aktywność: {status['last_activity']['file']} ({status['last_activity']['modified']})")
    output.append("")
    
    # Kontekst z vaultu
    output.append("📋 OSTATNIE NOTATKI (7 dni)")
    output.append(run_script("obsidian-context.py", "recent", "7"))
    output.append("")
    
    # Kontekst na dziś
    output.append("🤖 KONTEKST NA DZIŚ")
    output.append(run_script("obsidian-context.py", "daily"))
    output.append("")
    
    # Decyzje
    output.append("⚖️ OSTATNIE DECYZJE")
    output.append(run_script("obsidian-context.py", "decisions"))
    output.append("")
    
    # Błędy
    output.append("🐛 OSTATNIE BŁĘDY")
    output.append(run_script("obsidian-context.py", "errors"))
    output.append("")
    
    # ForAI inbox
    output.append("📥 FORAI INBOX")
    output.append(run_script("obsidian-inbox.py", "stats"))
    
    return "\n".join(output)

def dashboard() -> str:
    """Zwraca linki do kluczowych notatek."""
    links = {
        "Mapa vaultu": vault_path("Home.md"),
        "Ostatnia sesja": sorted(vault_path("06 - AI Sessions/Daily Summaries").glob("*.md"), reverse=True)[0] if vault_path("06 - AI Sessions/Daily Summaries").glob("*.md") else None,
        "Kontekst na dziś": vault_path(f"01 - Daily/AI Context/AI-Context-{today()}.md"),
        "Kontekst Hermesa": vault_path("04 - Resources/Hermes Memory.md"),
        "Inbox Summary": vault_path("04 - Resources/Inbox Summary.md"),
        "Sync Log": vault_path("04 - Resources/Sync Log.md"),
    }
    
    lines = ["# 🗺️ Dashboard linków", ""]
    for label, path in links.items():
        if path and path.exists():
            lines.append(f"- [[{label}]] — `{path.relative_to(vault_path())}`")
        else:
            lines.append(f"- {label} — _brak_")
    
    lines.append("")
    lines.append("## 📂 Struktura vaultu")
    lines.append("")
    
    folders = [
        ("06 - AI Sessions", "Notatki od Hermesa"),
        ("00 - Inbox/ForAI", "Notatki od Ciebie (dla Hermesa)"),
        ("01 - Daily/AI Context", "Dzienny kontekst AI"),
        ("02 - Projects", "Projekty"),
        ("03 - Areas", "Obszary"),
        ("04 - Resources", "Zasoby i sync"),
        ("Templates", "Szablony"),
    ]
    
    for folder, desc in folders:
        folder_path = vault_path(folder)
        count = len([f for f in folder_path.rglob("*.md")]) if folder_path.exists() else 0
        lines.append(f"- **{folder}** ({count}) — {desc}")
    
    return "\n".join(lines)

def usage():
    return """obsidian-brain.py — Hermes ↔ Obsidian integration hub

Workflowy:
  briefing          — pełny poranny briefing (dla crona / Jarvis)
  capture-session   — zapisz podsumowanie sesji
  capture-daily     — zapisz dzienny kontekst AI
  capture-update    — zapisz update projektu
  capture-decision  — zapisz decyzję
  capture-error     — zapisz błąd i fix
  process-inbox     — przetwórz ForAI inbox
  full-sync         — pełny sync (memory → Obsidian + Inbox → Memory)
  status            — status systemu
  dashboard         — dashboard linków

Przykłady:
  python obsidian-brain.py briefing
  python obsidian-brain.py capture-session accomplishments="Zrobiłem X" notes="..."
  python obsidian-brain.py capture-decision "Wybór tech" chosen_option="SQLite"
  python obsidian-brain.py process-inbox
"""

def main():
    if len(sys.argv) < 2:
        print(usage())
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    args = sys.argv[2:]
    
    if cmd == "briefing":
        print(full_briefing())
        
    elif cmd == "capture-session":
        print(run_script("obsidian-capture.py", "session", *args))
        
    elif cmd == "capture-daily":
        print(run_script("obsidian-capture.py", "daily", *args))
        
    elif cmd == "capture-update":
        print(run_script("obsidian-capture.py", "update", *args))
        
    elif cmd == "capture-decision":
        print(run_script("obsidian-capture.py", "decision", *args))
        
    elif cmd == "capture-error":
        print(run_script("obsidian-capture.py", "error", *args))
        
    elif cmd == "process-inbox":
        print(run_script("obsidian-inbox.py", "process"))
        
    elif cmd == "full-sync":
        print("🔄 Uruchamiam pełny sync...")
        print("📤 Hermes Memory → Obsidian")
        print(run_script("sync-memory-to-obsidian.py"))
        print("📥 ForAI Inbox → Memory")
        print(run_script("obsidian-inbox.py", "process"))
        print("✅ Full sync complete")
        
    elif cmd == "status":
        import json
        print(json.dumps(get_system_status(), indent=2, default=str))
        
    elif cmd == "dashboard":
        print(dashboard())
        
    else:
        print(f"❌ Nieznany command: {cmd}")
        print(usage())
        sys.exit(1)

if __name__ == "__main__":
    main()