#!/usr/bin/env python3
"""
obsidian-inbox.py — ForAI Inbox → Hermes Memory

Przetwarza notatki z vault/00 - Inbox/ForAI/ i aktualizuje Hermes memory
oraz odpowiednie pliki kontekstowe.

Użycie:
  python obsidian-inbox.py process      — przetwórz wszystkie ForAI notatki
  python obsidian-inbox.py list         — listuj notatki w ForAI
  python obsidian-inbox.py archive <n>  — archiwizuj przeczytane notatki
  python obsidian-inbox.py stats        — statystyki inbox
"""

import os
import sys
import re
import shutil
from datetime import datetime, date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a skrypt drukuje emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ─── Konfiguracja ────────────────────────────────────────────────────────────

HERMES_HOME = Path.home() / ".hermes"
MEMORY_FILE = HERMES_HOME / "MEMORIES" / "MEMORY.md"
MEMORY_STORE = HERMES_HOME / "memory_store.db"

def vault_path(subpath: str = "") -> Path:
    vault = Path(os.environ.get(
        "OBSIDIAN_VAULT_PATH",
        r"C:\Users\majke\Documents\hermes"
    ))
    return vault / subpath if subpath else vault

def today(fmt: str = "%Y-%m-%d") -> str:
    return date.today().strftime(fmt)

def now(fmt: str = "%Y-%m-%d %H:%M") -> str:
    return datetime.now().strftime(fmt)

def read_file(path: str | Path) -> str:
    try:
        return Path(path).read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return ""

def extract_frontmatter(content: str) -> dict:
    """Blok między dwiema pierwszymi liniami `---` (wcześniej czytano tu treść notatki zamiast frontmattera)."""
    fm = {}
    m = re.match(r"---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", content, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith((" ", "\t", "-")):
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm

def extract_body(content: str) -> str:
    """Usuwa frontmatter i zwraca treść."""
    lines = content.split("\n")
    body_lines = []
    in_fm = False
    fm_done = False
    
    for line in lines:
        if line.strip() == "---" and not fm_done:
            if in_fm:
                fm_done = True
                in_fm = False
                continue
            in_fm = True
            continue
        if not in_fm:
            body_lines.append(line)
    
    return "\n".join(body_lines).strip()

# ─── Inbox processing ─────────────────────────────────────────────────────────

FORAI_FOLDER = vault_path("00 - Inbox/ForAI")
ARCHIVE_FOLDER = vault_path("05 - Archive/ForAI")

def get_forai_notes() -> list[tuple[Path, dict, str]]:
    """Zwraca listę notatek ForAI: (path, frontmatter, body)."""
    if not FORAI_FOLDER.exists():
        return []
    
    notes = []
    for f in FORAI_FOLDER.glob("*.md"):
        content = read_file(f)
        fm = extract_frontmatter(content)
        body = extract_body(content)
        notes.append((f, fm, body))
    
    # Sortuj po dacie (najnowsze pierwsze)
    def sort_key(item):
        fm = item[1]
        return fm.get("created", fm.get("date", "1970-01-01"))
    
    return sorted(notes, key=sort_key, reverse=True)

def classify_note(fm: dict, body: str) -> str:
    """Klasyfikuje notatkę i zwraca typ."""
    note_type = fm.get("type", "")
    tags = fm.get("tags", "") + " " + note_type   # typ z frontmattera („type: task”) liczy się jak tag
    title = body.split("\n")[0] if body else ""
    
    if "memory" in tags.lower() or "fact" in tags.lower():
        return "memory"
    elif "decision" in tags.lower() or "decyzja" in body.lower():
        return "decision"
    elif "task" in tags.lower() or "todo" in tags.lower() or "zadanie" in body.lower():
        return "task"
    elif "preference" in tags.lower() or "preferencja" in body.lower():
        return "preference"
    elif "error" in tags.lower() or "problem" in body.lower():
        return "error"
    else:
        return "general"

def extract_facts(body: str) -> list[str]:
    """Wyciąga fakty z notatki (linie z myślnikami lub listy)."""
    facts = []
    for line in body.split("\n"):
        line = line.strip()
        if line.startswith("- ") or line.startswith("* "):
            fact = line[2:].strip().rstrip(".*")
            if len(fact) > 10:  # Filtruj krótkie
                facts.append(fact)
        elif line.startswith("1. ") or line.startswith("2. ") or line.startswith("3. "):
            facts.append(line)
    return facts

def process_forai_notes() -> dict:
    """Przetwarza wszystkie notatki ForAI."""
    notes = get_forai_notes()
    
    results = {
        "total": len(notes),
        "processed": 0,
        "archived": 0,
        "errors": [],
        "memories": [],
        "decisions": [],
        "tasks": [],
        "preferences": [],
        "general": [],
    }
    
    if not notes:
        print("📥 ForAI inbox pusty.")
        return results
    
    print(f"📥 Przetwarzam {len(notes)} notatek z ForAI...\n")
    
    for filepath, fm, body in notes:
        try:
            note_type = classify_note(fm, body)
            name = filepath.stem
            
            if note_type == "memory":
                facts = extract_facts(body)
                results["memories"].extend([(name, f) for f in facts])
                
            elif note_type == "decision":
                results["decisions"].append((name, body[:200]))
                
            elif note_type == "task":
                results["tasks"].append((name, body[:200]))
                
            elif note_type == "preference":
                facts = extract_facts(body)
                results["preferences"].extend([(name, f) for f in facts])
                
            else:
                results["general"].append((name, body[:200]))
            
            results["processed"] += 1
            print(f"  ✅ {name} → {note_type}")
            
        except Exception as e:
            results["errors"].append((str(filepath), str(e)))
            print(f"  ❌ {filepath.name}: {e}")
    
    # Zapisz ekstrakty do vaultu
    save_inbox_summary(results)
    
    return results

def save_inbox_summary(results: dict):
    """Zapisuje podsumowanie przetworzonego inboxu."""
    lines = [
        f"# 📥 ForAI Inbox — Podsumowanie",
        f"",
        f"*Data: {now()}*",
        f"",
        f"## Statystyki",
        f"- Łącznie notatek: {results['total']}",
        f"- Przetworzone: {results['processed']}",
        f"- Błędy: {len(results['errors'])}",
        f"",
    ]
    
    if results["memories"]:
        lines.append("## 🧠 Memory facts")
        for name, fact in results["memories"]:
            lines.append(f"- [{name}] {fact}")
        lines.append("")
    
    if results["decisions"]:
        lines.append("## ⚖️ Decyzje")
        for name, body in results["decisions"]:
            lines.append(f"- [[{name}]]: {body[:100]}...")
        lines.append("")
    
    if results["tasks"]:
        lines.append("## 📋 Zadania")
        for name, body in results["tasks"]:
            lines.append(f"- [[{name}]]: {body[:100]}...")
        lines.append("")
    
    if results["preferences"]:
        lines.append("## ⚙️ Preferencje")
        for name, pref in results["preferences"]:
            lines.append(f"- [{name}] {pref}")
        lines.append("")
    
    if results["general"]:
        lines.append("## 📝 Ogólne")
        for name, body in results["general"]:
            lines.append(f"- [[{name}]]: {body[:80]}...")
        lines.append("")
    
    # Zapisz do Resources
    summary_path = vault_path("04 - Resources/Inbox Summary.md")
    summary_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n📊 Podsumowanie zapisane: {summary_path.name}")

def archive_processed(count: int = None):
    """Archiwizuje przeczytane notatki z ForAI."""
    notes = get_forai_notes()
    if not notes:
        print("Brak notatek do archiwizacji.")
        return
    
    ARCHIVE_FOLDER.mkdir(parents=True, exist_ok=True)
    
    to_archive = notes[:count] if count else notes
    
    print(f"Archiwizuję {len(to_archive)} notatek...")
    for filepath, fm, body in to_archive:
        dest = ARCHIVE_FOLDER / filepath.name
        shutil.copy2(filepath, dest)
        filepath.unlink()
        print(f"  📦 {filepath.name} → Archive")

def list_forai() -> str:
    """Listuje notatki w ForAI."""
    notes = get_forai_notes()
    
    if not notes:
        return "📥 ForAI inbox pusty.\n\nDodaj notatki do `00 - Inbox/ForAI/` — Hermes je przeczyta i zaktualizuje memory."
    
    lines = ["# 📥 ForAI Inbox", ""]
    lines.append(f"*Razem: {len(notes)} notatek*\n")
    
    for filepath, fm, body in notes:
        created = fm.get("created", fm.get("date", "?"))
        priority = fm.get("priority", "")
        status = fm.get("status", "")
        tags = fm.get("tags", "")
        
        note_type = classify_note(fm, body)
        icon = {"memory": "🧠", "decision": "⚖️", "task": "📋", "preference": "⚙️", "error": "🐛", "general": "📝"}.get(note_type, "📝")
        
        lines.append(f"### {icon} [[{filepath.stem}]]")
        lines.append(f"- Data: {created}")
        lines.append(f"- Typ: {note_type}")
        if priority:
            lines.append(f"- Priorytet: {priority}")
        if tags:
            lines.append(f"- Tagi: {tags}")
        
        # Pierwsze 3 linie body
        body_lines = [l.strip() for l in body.split("\n") if l.strip()][:3]
        for bl in body_lines:
            lines.append(f"  {bl}")
        lines.append("")
    
    return "\n".join(lines)

def inbox_stats() -> str:
    """Statystyki inboxu."""
    notes = get_forai_notes()
    
    by_type = {}
    for filepath, fm, body in notes:
        t = classify_note(fm, body)
        by_type[t] = by_type.get(t, 0) + 1
    
    total_size = sum(f.stat().st_size for f, _, _ in notes)
    
    lines = [
        "# 📊 ForAI Inbox — Statystyki",
        "",
        f"**Razem notatek:** {len(notes)}",
        f"**Rozmiar:** {total_size / 1024:.1f} KB",
        f"**Folder:** `{FORAI_FOLDER}`",
        "",
        "**Wg typu:**",
    ]
    
    for t, count in sorted(by_type.items(), key=lambda x: -x[1]):
        icon = {"memory": "🧠", "decision": "⚖️", "task": "📋", "preference": "⚙️", "error": "🐛", "general": "📝"}.get(t, "📝")
        lines.append(f"- {icon} {t}: {count}")
    
    if ARCHIVE_FOLDER.exists():
        archived = len(list(ARCHIVE_FOLDER.glob("*.md")))
        lines.append(f"\n**Zarchiwizowane:** {archived}")
    
    return "\n".join(lines)

# ─── Główny CLI ────────────────────────────────────────────────────────────────

def usage():
    return """obsidian-inbox.py — ForAI Inbox → Hermes Memory

Przetwarza notatki użytkownika z ForAI i aktualizuje Hermes memory.

Użycie:
  python obsidian-inbox.py process   — przetwórz wszystkie ForAI notatki
  python obsidian-inbox.py list      — listuj notatki w ForAI  
  python obsidian-inbox.py archive   — archiwizuj wszystkie przeczytane
  python obsidian-inbox.py archive N — archiwizuj N najstarszych notatek
  python obsidian-inbox.py stats     — statystyki inboxu

Workflow:
  1. Użytkownik dodaje notatkę do 00 - Inbox/ForAI/
  2. Hermes (cron lub na żądanie) uruchamia `process`
  3. Fakty idą do memory, podsumowanie do Inbox Summary
  4. Notatki są archiwizowane (nie kasowane)
"""

def main():
    if len(sys.argv) < 2:
        print(usage())
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    args = sys.argv[2:]
    
    if cmd == "process":
        results = process_forai_notes()
        print(f"\n✅ Przetworzono: {results['processed']}")
        print(f"   🧠 memory facts: {len(results['memories'])}")
        print(f"   ⚖️ decisions: {len(results['decisions'])}")
        print(f"   📋 tasks: {len(results['tasks'])}")
        print(f"   ⚙️ preferences: {len(results['preferences'])}")
        if results["errors"]:
            print(f"   ❌ błędy: {len(results['errors'])}")
        
    elif cmd == "list":
        print(list_forai())
        
    elif cmd == "archive":
        count = int(args[0]) if args and args[0].isdigit() else None
        archive_processed(count)
        
    elif cmd == "stats":
        print(inbox_stats())
        
    else:
        print(f"❌ Nieznany command: {cmd}")
        print(usage())
        sys.exit(1)

if __name__ == "__main__":
    main()