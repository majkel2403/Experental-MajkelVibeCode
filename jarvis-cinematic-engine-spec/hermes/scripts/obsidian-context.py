#!/usr/bin/env python3
"""
obsidian-context.py — Obsidian → Hermes context loader

Czyta notatki z vaultu i zwraca sformatowany kontekst dla Hermesa.
Używane przez Hermesa do wczytywania kontekstu przed pracą.

Użycie:
  python obsidian-context.py recent [limit]     — ostatnie notatki
  python obsidian-context.py project <name>      — kontekst projektu
  python obsidian-context.py daily              — dzienny kontekst
  python obsidian-context.py decisions          — ostatnie decyzje
  python obsidian-context.py errors             — ostatnie błędy
  python obsidian-context.py research <query>   — research o temacie
  python obsidian-context.py full               — pełny briefing
  python obsidian-context.py forai              — ForAI inbox
  python obsidian-context.py search "<pattern>" — wyszukaj
"""

import os
import sys
import re
from datetime import datetime, date, timedelta
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a skrypt drukuje emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ─── Konfiguracja ────────────────────────────────────────────────────────────

def vault_path(subpath: str = "") -> Path:
    vault = Path(os.environ.get(
        "OBSIDIAN_VAULT_PATH",
        r"C:\Users\majke\Documents\hermes"
    ))
    return vault / subpath if subpath else vault

def today(fmt: str = "%Y-%m-%d") -> str:
    return date.today().strftime(fmt)

def days_ago(n: int) -> str:
    return (date.today() - timedelta(days=n)).strftime("%Y-%m-%d")

def read_file(path: str | Path) -> str:
    try:
        return Path(path).read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError):
        return ""

def extract_frontmatter(content: str) -> dict:
    """Wyciąga frontmatter z notatki — blok między dwiema pierwszymi liniami `---` (wcześniej czytano tu treść notatki)."""
    fm = {}
    m = re.match(r"---\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)", content, re.S)
    if m:
        for line in m.group(1).splitlines():
            if ":" in line and not line.startswith((" ", "\t", "-")):
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm

def extract_body(content: str, max_lines: int = 50) -> str:
    """Wyciąga treść notatki bez frontmatter, max_lines."""
    lines = content.split("\n")
    
    # Pomijamy frontmatter
    if lines and lines[0] == "---":
        in_fm = True
        body_lines = []
        for line in lines[1:]:
            if in_fm and line.strip() == "---":
                in_fm = False
                continue
            if not in_fm:
                body_lines.append(line)
    else:
        body_lines = lines
    
    # Pomijamy puste na początku i końcu
    body_lines = [l for l in body_lines if l.strip()]
    
    return "\n".join(body_lines[:max_lines])

def format_note(path: Path, include_body: bool = True, max_lines: int = 30) -> str:
    """Formatuje pojedynczą notatkę do czytelnego stringu."""
    content = read_file(path)
    fm = extract_frontmatter(content)
    
    name = path.stem
    note_type = fm.get("type", "note")
    project = fm.get("project", "")
    status = fm.get("status", "")
    tags = fm.get("tags", "")
    created = fm.get("created", fm.get("date", "?"))
    
    lines = [
        f"## {name}",
        f"*type: {note_type} | created: {created} | status: {status} | project: {project}*",
    ]
    
    if tags:
        lines.append(f"*tags: {tags}*")
    
    if include_body:
        body = extract_body(content, max_lines=max_lines)
        if body.strip():
            lines.append("")
            lines.append(body)
    
    return "\n".join(lines)

def get_notes_by_folder(folder: str, since: str = None, limit: int = 10) -> list[Path]:
    """Zwraca notatki z folderu, posortowane po dacie."""
    folder_path = vault_path(folder)
    if not folder_path.exists():
        return []
    
    notes = []
    for f in folder_path.glob("*.md"):
        content = read_file(f)
        fm = extract_frontmatter(content)
        created = fm.get("created", fm.get("date", "1970-01-01"))
        
        if since and created < since:
            continue
        
        notes.append((created, f))
    
    notes.sort(reverse=True)
    return [f for _, f in notes[:limit]]

# ─── Generatory kontekstu ──────────────────────────────────────────────────────

def recent_notes(limit: int = 10) -> str:
    """Zwraca ostatnie notatki ze wszystkich folderów AI."""
    folders = {
        "06 - AI Sessions/Daily Summaries": "📅 Sesje",
        "06 - AI Sessions/Task Reports": "📋 Taski",
        "06 - AI Sessions/Project Updates": "📊 Projekty",
        "06 - AI Sessions/Decisions": "⚖️ Decyzje",
        "06 - AI Sessions/Errors & Fixes": "🐛 Błędy",
        "06 - AI Sessions/Research Logs": "🔬 Research",
    }
    
    lines = ["# 📋 Ostatnie notatki", ""]
    for folder, label in folders.items():
        notes = get_notes_by_folder(folder, since=days_ago(7), limit=3)
        if not notes:
            continue
        lines.append(f"### {label}")
        for n in notes:
            fm = extract_frontmatter(read_file(n))
            name = n.stem
            created = fm.get("created", "?")
            note_type = fm.get("type", "?")
            project = fm.get("project", "")
            status = fm.get("status", "")
            lines.append(f"- [[{name}]] — {note_type}{f' ({project})' if project else ''} — {created} {f'[{status}]' if status else ''}")
        lines.append("")
    
    return "\n".join(lines).strip()

def project_context(project_name: str) -> str:
    """Zwraca pełen kontekst projektu."""
    project_folder = None
    
    # Szukaj folderu projektu
    for p in vault_path("02 - Projects").iterdir():
        if project_name.lower() in p.name.lower() and p.is_dir():
            project_folder = p
            break
    
    if not project_folder:
        return f"❌ Nie znaleziono projektu: {project_name}"
    
    lines = [f"# 📊 Projekt: {project_name}", ""]
    
    # Główny plik projektu
    main_md = None
    for f in project_folder.glob("*.md"):
        if f.stem == project_folder.name.split("/")[-1]:
            main_md = f
            break
    if not main_md:
        main_md = list(project_folder.glob("*.md"))[0] if list(project_folder.glob("*.md")) else None
    
    if main_md:
        content = read_file(main_md)
        body = extract_body(content, max_lines=60)
        lines.append("## Strona główna")
        lines.append(body)
        lines.append("")
    
    # Ostatnie update'y AI
    lines.append("## Ostatnie AI Updates")
    updates = get_notes_by_folder("06 - AI Sessions/Project Updates", limit=3)
    project_updates = [n for n in updates if project_name.lower() in read_file(n).lower()]
    if project_updates:
        for u in project_updates[:3]:
            lines.append(format_note(u, include_body=True, max_lines=15))
            lines.append("")
    else:
        lines.append("- Brak updateów")
        lines.append("")
    
    # Ostatnie taski
    lines.append("## Ostatnie Taski")
    tasks = get_notes_by_folder("06 - AI Sessions/Task Reports", limit=5)
    project_tasks = [t for t in tasks if project_name.lower() in read_file(t).lower()]
    if project_tasks:
        for t in project_tasks[:3]:
            lines.append(format_note(t, include_body=True, max_lines=10))
            lines.append("")
    else:
        lines.append("- Brak tasków")
        lines.append("")
    
    return "\n".join(lines).strip()

def daily_context() -> str:
    """Zwraca kontekst na dziś."""
    today_file = vault_path(f"01 - Daily/AI Context/AI-Context-{today()}.md")
    if not today_file.exists():   # stara nazwa (do 2026-10-05) kolidowała z dziennikiem RRRR-MM-DD.md
        today_file = vault_path(f"01 - Daily/AI Context/{today()}.md")
    
    if today_file.exists():
        content = read_file(today_file)
        return f"# 🤖 Kontekst na dziś ({today()})\n\n{extract_body(content, max_lines=80)}"
    
    # Jeśli nie ma na dziś, weź z ostatnich dni
    context_folder = vault_path("01 - Daily/AI Context")
    notes = sorted(context_folder.glob("*.md"), reverse=True) if context_folder.exists() else []
    
    if notes:
        latest = notes[0]
        fm = extract_frontmatter(read_file(latest))
        created = fm.get("date", "?")
        return f"# 🤖 Ostatni kontekst ({created})\n\n{extract_body(read_file(latest), max_lines=60)}\n\n_(Brak kontekstu na dziś — najnowszy z {created})_"
    
    return f"# 🤖 Brak kontekstu\n\nBrak notatek kontekstowych. Można użyć `python obsidian-context.py recent`."

def decisions_summary() -> str:
    """Zwraca ostatnie decyzje."""
    notes = get_notes_by_folder("06 - AI Sessions/Decisions", since=days_ago(30), limit=10)
    
    if not notes:
        return "## ⚖️ Decyzje\n\nBrak decyzji."
    
    lines = ["## ⚖️ Ostatnie decyzje", ""]
    for n in notes:
        fm = extract_frontmatter(read_file(n))
        name = n.stem
        created = fm.get("created", "?")
        status = fm.get("status", "")
        project = fm.get("project", "")
        content = extract_body(read_file(n), max_lines=10)
        lines.append(f"### [[{name}]] — {created} {f'[{status}]' if status else ''} {f'({project})' if project else ''}")
        lines.append(content)
        lines.append("")
    
    return "\n".join(lines).strip()

def errors_summary() -> str:
    """Zwraca ostatnie błędy i fixy."""
    notes = get_notes_by_folder("06 - AI Sessions/Errors & Fixes", since=days_ago(30), limit=10)
    
    if not notes:
        return "## 🐛 Błędy\n\nBrak logów błędów."
    
    lines = ["## 🐛 Ostatnie błędy i fixy", ""]
    for n in notes[:5]:
        fm = extract_frontmatter(read_file(n))
        name = n.stem
        created = fm.get("created", "?")
        status = fm.get("status", "")
        project = fm.get("project", "")
        lines.append(f"- [[{name}]] — {created} {f'[{status}]' if status else ''} {f'({project})' if project else ''}")
    
    return "\n".join(lines).strip()

def research_context(query: str) -> str:
    """Szuka research notes pasujących do query."""
    folder = vault_path("06 - AI Sessions/Research Logs")
    if not folder.exists():
        return f"❌ Brak folderu Research Logs"
    
    query_lower = query.lower()
    results = []
    
    for f in folder.glob("*.md"):
        content = read_file(f).lower()
        if query_lower in content or query_lower in f.stem.lower():
            fm = extract_frontmatter(content)
            results.append((f, fm))
    
    if not results:
        return f"🔍 Nie znaleziono researchu o: {query}"
    
    lines = [f"# 🔬 Research: {query}", ""]
    for f, fm in results[:5]:
        lines.append(format_note(f, include_body=True, max_lines=20))
        lines.append("")
    
    return "\n".join(lines).strip()

def forai_inbox() -> str:
    """Zwraca notatki z ForAI inbox do przeczytania przez Hermesa."""
    inbox_folder = vault_path("00 - Inbox/ForAI")
    if not inbox_folder.exists():
        return "📥 **ForAI Inbox** — pusty"
    
    notes = sorted(inbox_folder.glob("*.md"), key=lambda f: f.stat().st_mtime, reverse=True)
    
    if not notes:
        return "📥 **ForAI Inbox** — pusty"
    
    lines = ["# 📥 ForAI Inbox (notatki od użytkownika)", ""]
    for f in notes[:10]:
        fm = extract_frontmatter(read_file(f))
        created = fm.get("created", "?") or fm.get("date", "?")
        priority = fm.get("priority", "")
        lines.append(f"## {f.stem} — {created} {f'⚡{priority}' if priority else ''}")
        lines.append(extract_body(read_file(f), max_lines=30))
        lines.append("")
    
    return "\n".join(lines).strip()

def full_briefing() -> str:
    """Zwraca pełny briefing na dziś."""
    lines = [
        "# 🤖 Jarvis — Pełny briefing",
        "",
        f"*Wygenerowano: {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
        "",
        "---",
    ]
    
    # Kontekst na dziś
    lines.append("")
    daily = daily_context()
    if "Brak kontekstu" not in daily:
        lines.append(daily)
    else:
        lines.append("## 🤖 Kontekst")
        lines.append("Brak kontekstu na dziś.")
    
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 📋 Ostatnie notatki (7 dni)")
    lines.append(recent_notes(limit=15))
    
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## ⚖️ Ostatnie decyzje")
    lines.append(decisions_summary())
    
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 🐛 Ostatnie błędy")
    lines.append(errors_summary())
    
    return "\n".join(lines)


# ─── Progressive Context Loading (L0-L3) ──────────────────────────────────────

def load_level_l0() -> str:
    """L0 — Identity (~170 tokens). SOUL.md + CRITICAL_FACTS.md."""
    lines = ["# L0 — Identity", ""]
    
    soul = read_file(vault_path("SOUL.md"))
    if soul:
        lines.append("## SOUL.md")
        lines.append(extract_body(soul, max_lines=15))
        lines.append("")
    
    facts = read_file(vault_path("CRITICAL_FACTS.md"))
    if facts:
        lines.append("## CRITICAL_FACTS.md")
        lines.append(extract_body(facts, max_lines=10))
        lines.append("")
    
    return "\n".join(lines).strip()


def load_level_l1() -> str:
    """L1 — Navigation (~1-2K tokens). index.md + hot.md + log.md."""
    lines = ["# L1 — Navigation", ""]
    
    # Hot cache (najważniejsze — ostatni kontekst)
    hot = read_file(vault_path("hot.md"))
    if hot:
        lines.append("## 🔥 Hot Cache")
        lines.append(extract_body(hot, max_lines=20))
        lines.append("")
    
    # Index (katalog)
    index = read_file(vault_path("index.md"))
    if index:
        lines.append("## 📑 Index")
        # Tylko sekcje nawigacyjne, bez stats
        body = extract_body(index, max_lines=30)
        # Filtruj out stats block
        body = re.sub(r'<!-- BEGIN STATS.*?<!-- END STATS -->', '', body, flags=re.DOTALL)
        lines.append(body)
        lines.append("")
    
    # Ostatnie 10 log entries
    log = read_file(vault_path("log.md"))
    if log:
        lines.append("## 📋 Ostatnie operacje (log.md)")
        log_lines = log.split("\n")
        # Weź ostatnie 10 wpisów (po --- separator)
        entry_lines = []
        past_separator = False
        for l in log_lines:
            if l.strip() == "---":
                past_separator = True
                continue
            if past_separator and l.strip():
                entry_lines.append(l)
        lines.extend(entry_lines[-10:])
        lines.append("")
    
    return "\n".join(lines).strip()


def load_level_l2() -> str:
    """L2 — Current State (~2-5K tokens). Home.md + daily notes + active projects."""
    lines = ["# L2 — Current State", ""]
    
    # Home dashboard
    home = read_file(vault_path("Home.md"))
    if home:
        lines.append("## 🏠 Home Dashboard")
        lines.append(extract_body(home, max_lines=20))
        lines.append("")
    
    # Dzisiejszy daily note
    today_file = vault_path(f"01 - Daily/{today()}.md")
    if today_file.exists():
        lines.append(f"## 📅 Daily Note ({today()})")
        lines.append(extract_body(read_file(today_file), max_lines=30))
        lines.append("")
    else:
        lines.append(f"## 📅 Daily Note ({today()})")
        lines.append("_Brak notatki dzisiejszej_")
        lines.append("")
    
    # Ostatnie 3 daily notes
    daily_folder = vault_path("01 - Daily")
    if daily_folder.exists():
        dailies = sorted(daily_folder.glob("*.md"), reverse=True)[:3]
        if dailies:
            lines.append("## 📅 Ostatnie daily notes")
            for d in dailies:
                lines.append(f"### {d.stem}")
                lines.append(extract_body(read_file(d), max_lines=10))
                lines.append("")
    
    # Aktywne projekty
    projects_folder = vault_path("02 - Projects")
    if projects_folder.exists():
        lines.append("## 🚀 Aktywne projekty")
        for proj_dir in sorted(projects_folder.iterdir()):
            if not proj_dir.is_dir():
                continue
            for md in proj_dir.glob("*.md"):
                fm = extract_frontmatter(read_file(md))
                status = fm.get("status", "")
                if status in ("active", "in-progress", "planning"):
                    lines.append(f"- **{proj_dir.name}** — {status}")
                    # Krótki opis z For future Jarvis
                    body = extract_body(read_file(md), max_lines=5)
                    if body.strip():
                        lines.append(f"  {body.strip().split(chr(10))[0]}")
                    break
        lines.append("")
    
    return "\n".join(lines).strip()


def load_level_l3(topic: str = "") -> str:
    """L3 — Deep Context (on demand). Pełne notatki projektów + źródła."""
    lines = ["# L3 — Deep Context", ""]
    
    if topic:
        # Szukaj konkretnego tematu
        lines.append(f"## Temat: {topic}")
        lines.append("")
        
        # Search w project notes
        projects_folder = vault_path("02 - Projects")
        if projects_folder.exists():
            for proj_dir in projects_folder.iterdir():
                if not proj_dir.is_dir():
                    continue
                for md in proj_dir.glob("*.md"):
                    content = read_file(md)
                    if topic.lower() in content.lower():
                        lines.append(f"### {proj_dir.name}/{md.stem}")
                        lines.append(extract_body(content, max_lines=30))
                        lines.append("")
        
        # Search w research
        research = research_context(topic)
        if "Nie znaleziono" not in research:
            lines.append(research)
    else:
        # Pełne konteksty aktywnych projektów
        projects_folder = vault_path("02 - Projects")
        if projects_folder.exists():
            for proj_dir in sorted(projects_folder.iterdir()):
                if not proj_dir.is_dir():
                    continue
                for md in proj_dir.glob("*.md"):
                    fm = extract_frontmatter(read_file(md))
                    if fm.get("status") in ("active", "in-progress"):
                        lines.append(f"## 🚀 {proj_dir.name}")
                        lines.append(extract_body(read_file(md), max_lines=50))
                        lines.append("")
    
    return "\n".join(lines).strip()


def progressive_context(level: str = "L2", topic: str = "") -> str:
    """Ładuje kontekst progressywnie — L0 → L1 → L2 → L3."""
    levels = level.upper().split(",")
    
    all_output = []
    
    if "L0" in levels:
        all_output.append(load_level_l0())
    
    if "L1" in levels:
        all_output.append(load_level_l1())
    
    if "L2" in levels:
        all_output.append(load_level_l2())
    
    if "L3" in levels:
        all_output.append(load_level_l3(topic))
    
    if not all_output:
        # Default: L0+L1+L2
        all_output = [load_level_l0(), load_level_l1(), load_level_l2()]
    
    return "\n\n---\n\n".join(all_output)

def search_notes(pattern: str) -> str:
    """Wyszukuje we wszystkich notatkach."""
    import glob
    
    pattern_lower = pattern.lower()
    results = []
    
    for md in vault_path().rglob("*.md"):
        # Pomijamy ustawienia Obsidiana i kosz (.trash, dawny _trash)
        if {".obsidian", ".trash", "_trash"} & set(md.parts):
            continue
        # Archiwum Perplexity: rozmów prywatnych (18+) i szumu nie pokazujemy agentowi
        if "Perplexity" in md.parts and {"Prywatne", "Krótkie i przypadkowe"} & set(md.parts):
            continue

        try:
            content = read_file(md)
            if pattern_lower in content.lower() or pattern_lower in md.stem.lower():
                fm = extract_frontmatter(content)
                created = fm.get("created", fm.get("date", "?"))
                note_type = fm.get("type", "?")
                results.append((md, created, note_type, content))
        except Exception:
            pass
    
    if not results:
        return f"🔍 Nie znaleziono: {pattern}"
    
    # Najpierw notatki core, potem archiwum Perplexity (inaczej 1800 rozmów zasłania wiedzę z core)
    results.sort(key=lambda r: "06-AI-Sessions" in r[0].parts)

    lines = [f"# 🔍 Wyniki wyszukiwania: {pattern}", ""]
    lines.append(f"Znaleziono: {len(results)} notatek\n")

    for md, created, note_type, content in results[:10]:
        # Pokaż fragment z dopasowaniem
        content_lower = content.lower()
        idx = content_lower.find(pattern_lower)
        
        # Find start of line containing match
        line_start = content.rfind("\n", 0, idx) + 1 if idx > 0 else 0
        # Find end of line
        line_end = content.find("\n", idx)
        line_end = line_end if line_end > 0 else len(content)
        snippet = content[line_start:line_end].strip()[:200]
        
        lines.append(f"### [[{md.stem}]] — {note_type} ({created})")
        lines.append(f"```\n{snippet}\n```")
        lines.append("")
    
    return "\n".join(lines).strip()

# ─── Główny CLI ────────────────────────────────────────────────────────────────

def usage():
    return """obsidian-context.py — Obsidian → Hermes context loader

Użycie:
  python obsidian-context.py recent [limit]       — ostatnie notatki
  python obsidian-context.py project <name>       — kontekst projektu
  python obsidian-context.py daily               — dzienny kontekst
  python obsidian-context.py decisions            — ostatnie decyzje
  python obsidian-context.py errors               — ostatnie błędy
  python obsidian-context.py research <query>     — research o temacie
  python obsidian-context.py forai               — ForAI inbox
  python obsidian-context.py full                — pełny briefing
  python obsidian-context.py search "<pattern>"  — wyszukaj
"""

def main():
    if len(sys.argv) < 2:
        print(usage())
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    args = sys.argv[2:]
    
    if cmd == "recent":
        limit = int(args[0]) if args and args[0].isdigit() else 10
        print(recent_notes(limit))
        
    elif cmd == "project":
        if not args:
            print("❌ Podaj nazwę projektu: project <name>")
            sys.exit(1)
        print(project_context(args[0]))
        
    elif cmd == "daily":
        print(daily_context())
        
    elif cmd == "decisions":
        print(decisions_summary())
        
    elif cmd == "errors":
        print(errors_summary())
        
    elif cmd == "research":
        if not args:
            print("❌ Podaj zapytanie: research <query>")
            sys.exit(1)
        print(research_context(args[0]))
        
    elif cmd == "forai":
        print(forai_inbox())
        
    elif cmd == "full":
        print(full_briefing())
    
    elif cmd == "levels":
        # Progressive context loading: levels=L0,L1,L2,L3 [topic=...]
        level_arg = args[0] if args else "L0,L1,L2"
        topic_arg = ""
        for a in args[1:]:
            if a.startswith("topic="):
                topic_arg = a.split("=", 1)[1]
        print(progressive_context(level_arg, topic_arg))
    
    elif cmd == "l0":
        print(load_level_l0())
    
    elif cmd == "l1":
        print(load_level_l1())
    
    elif cmd == "l2":
        print(load_level_l2())
    
    elif cmd == "l3":
        topic = " ".join(args) if args else ""
        print(load_level_l3(topic))
        
    elif cmd == "search":
        if not args:
            print("❌ Podaj wzór: search <pattern>")
            sys.exit(1)
        print(search_notes(args[0]))
        
    else:
        print(f"❌ Nieznany command: {cmd}")
        print(usage())
        sys.exit(1)

if __name__ == "__main__":
    main()