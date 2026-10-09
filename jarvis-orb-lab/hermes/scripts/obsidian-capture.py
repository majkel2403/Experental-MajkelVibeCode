#!/usr/bin/env python3
"""
obsidian-capture.py — Hermes → Obsidian memory capture system

Zapisuje różne typy notatek do vaultu:
- session-summary  — podsumowanie sesji
- task-report      — raport z zadania
- project-update   — update projektu  
- decision         — log decyzji
- research-log     — log researchu
- error-fix        — log błędu i fix-a
- daily-ai-context — dzienny kontekst AI

Użycie:
  python obsidian-capture.py session          # podsumowanie sesji
  python obsidian-capture.py task "<title>"   # raport zadania
  python obsidian-capture.py update "<proj>"  # update projektu
  python obsidian-capture.py decision "<title>" # log decyzji
  python obsidian-capture.py research "<query>" # log researchu
  python obsidian-capture.py error "<title>"   # log błędu
  python obsidian-capture.py daily            # dzienny kontekst
  python obsidian-capture.py list             # listuj wszystkie notatki
"""

import os
import sys
import json
import re
import uuid
import glob
from datetime import datetime, date
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):   # konsola/cron na Windows = cp1250, a skrypt drukuje emoji
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


# ─── Konfiguracja ────────────────────────────────────────────────────────────

HERMES_HOME = Path.home() / ".hermes"
SESSIONS_DIR = HERMES_HOME / "sessions"
MEMORY_FILE = HERMES_HOME / "MEMORIES" / "MEMORY.md"
KANBAN_DB = HERMES_HOME / "kanban" / "kanban.db"
CRON_OUTPUT = HERMES_HOME / "cron" / "output"

def vault_path(subpath: str = "") -> Path:
    """Zwraca ścieżkę w vault."""
    vault = Path(os.environ.get(
        "OBSIDIAN_VAULT_PATH",
        r"C:\Users\majke\Documents\hermes"
    ))
    return vault / subpath if subpath else vault

def now(fmt: str = "%Y-%m-%d %H:%M") -> str:
    return datetime.now().strftime(fmt)

def today(fmt: str = "%Y-%m-%d") -> str:
    return date.today().strftime(fmt)

def read_file(path: str | Path) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    except (FileNotFoundError, PermissionError):
        return ""

# ───Źródła danych ─────────────────────────────────────────────────────────────

def get_recent_sessions(limit: int = 5) -> list[dict]:
    """Pobiera info o ostatnich sesjach."""
    sessions = []
    if not SESSIONS_DIR.exists():
        return sessions
    
    for d in sorted(SESSIONS_DIR.iterdir(), reverse=True)[:limit]:
        if d.is_dir():
            info_file = d / "session.json"
            session_data = {"id": d.name, "path": str(d)}
            if info_file.exists():
                try:
                    with open(info_file, "r", encoding="utf-8") as f:
                        session_data.update(json.load(f))
                except Exception:
                    pass
            sessions.append(session_data)
    return sessions

def get_cron_summary() -> str:
    """Pobiera ostatni output z crona (jeśli istnieje)."""
    if not CRON_OUTPUT.exists():
        return "Brak cron outputu."
    
    jobs = sorted(CRON_OUTPUT.iterdir(), reverse=True)
    summary_parts = []
    for job_dir in jobs[:3]:
        latest = sorted(job_dir.glob("*.stdout"))[-1] if job_dir.glob("*.stdout") else None
        if latest:
            content = read_file(latest)
            summary_parts.append(f"[{job_dir.name}]\n{content[:500]}")
    
    return "\n---\n".join(summary_parts) if summary_parts else "Brak cron outputu."

def get_memory_context() -> str:
    """Pobiera kluczowe fakty z memory."""
    return read_file(MEMORY_FILE)

# ─── Generatory notatek ────────────────────────────────────────────────────────

SESSION_FALLBACK = """---
date: {{date}}
type: session-summary
tags: [session, hermes, ai-session]
source: hermes
ai-first: true
---

# 🧠 Sesja Jarvisa — {{date}}

## Dla przyszłego Jarvisa

{{context}}

## ✅ Zrealizowane

{{accomplishments}}

## 🔧 Szczegóły techniczne

{{technical_details}}

## 📝 Notatki

{{notes}}

## ❓ Pytania otwarte

{{open_questions}}

## ▶️ Następne kroki

{{next_steps}}

## 🔗 Powiązane

{{related_notes}}

*Wygenerowano: {{timestamp}} · sesja {{session_id}}*
"""


def gen_session_summary(**kwargs) -> str:
    """Generuje podsumowanie sesji."""
    template = read_file(vault_path("Templates/Sessions/Session Summary.md")) or SESSION_FALLBACK
    
    recent = get_recent_sessions(3)
    sessions_info = "\n".join([
        f"- Sesja {s.get('id','?')}: {s.get('title', s.get('id','?'))}"
        for s in recent
    ]) or "- Brak danych o poprzednich sesjach"
    
    return template \
        .replace("{{date}}", today()) \
        .replace("{{timestamp}}", now()) \
        .replace("{{session_id}}", str(uuid.uuid4())[:8]) \
        .replace("{{context}}", kwargs.get("context", sessions_info)) \
        .replace("{{accomplishments}}", kwargs.get("accomplishments", "- ")) \
        .replace("{{technical_details}}", kwargs.get("technical_details", "- ")) \
        .replace("{{notes}}", kwargs.get("notes", "- ")) \
        .replace("{{related_notes}}", kwargs.get("related_notes", "- ")) \
        .replace("{{open_questions}}", kwargs.get("open_questions", "- ")) \
        .replace("{{next_steps}}", kwargs.get("next_steps", "- "))

def gen_task_report(title: str, **kwargs) -> str:
    """Generuje raport zadania."""
    template = read_file(vault_path("Templates/Sessions/Task Report.md"))
    
    status_emoji = {"done": "✅", "in-progress": "🔄", "failed": "❌", "planned": "📋"}.get(
        kwargs.get("status", "done"), "📋"
    )
    
    return template \
        .replace("{{title}}", title) \
        .replace("{{date}}", today()) \
        .replace("{{timestamp}}", now()) \
        .replace("{{status}}", kwargs.get("status", "done")) \
        .replace("{{status_emoji}}", status_emoji) \
        .replace("{{project}}", kwargs.get("project", "General")) \
        .replace("{{task_id}}", kwargs.get("task_id", str(uuid.uuid4())[:8])) \
        .replace("{{goal}}", kwargs.get("goal", "- ")) \
        .replace("{{approach}}", kwargs.get("approach", "- ")) \
        .replace("{{steps_completed}}", kwargs.get("steps_completed", "- ")) \
        .replace("{{results}}", kwargs.get("results", "- ")) \
        .replace("{{issues_and_fixes}}", kwargs.get("issues_and_fixes", "- ")) \
        .replace("{{artifacts}}", kwargs.get("artifacts", "- ")) \
        .replace("{{duration}}", kwargs.get("duration", "- ")) \
        .replace("{{related_notes}}", kwargs.get("related_notes", "- "))

def gen_project_update(project: str, **kwargs) -> str:
    """Generuje update projektu."""
    template = read_file(vault_path("Templates/Sessions/Project Update.md"))
    
    return template \
        .replace("{{project}}", project) \
        .replace("{{date}}", today()) \
        .replace("{{timestamp}}", now()) \
        .replace("{{status}}", kwargs.get("status", "active")) \
        .replace("{{phase}}", kwargs.get("phase", "- ")) \
        .replace("{{what_was_done}}", kwargs.get("what_was_done", "- ")) \
        .replace("{{project_state}}", kwargs.get("project_state", "- ")) \
        .replace("{{technical_changes}}", kwargs.get("technical_changes", "- ")) \
        .replace("{{completed_task_1}}", kwargs.get("completed_task_1", "brak")) \
        .replace("{{completed_task_2}}", kwargs.get("completed_task_2", "")) \
        .replace("{{in_progress_task_1}}", kwargs.get("in_progress_task_1", "brak")) \
        .replace("{{in_progress_task_2}}", kwargs.get("in_progress_task_2", "")) \
        .replace("{{next_task_1}}", kwargs.get("next_task_1", "brak")) \
        .replace("{{next_task_2}}", kwargs.get("next_task_2", "")) \
        .replace("{{issues_and_risks}}", kwargs.get("issues_and_risks", "- ")) \
        .replace("{{notes_for_next_session}}", kwargs.get("notes_for_next_session", "- ")) \
        .replace("{{previous_update}}", kwargs.get("previous_update", "brak"))

def gen_decision(title: str, **kwargs) -> str:
    """Generuje log decyzji."""
    template = read_file(vault_path("Templates/Sessions/Decision.md"))
    
    return template \
        .replace("{{title}}", title) \
        .replace("{{date}}", today()) \
        .replace("{{timestamp}}", now()) \
        .replace("{{status}}", kwargs.get("status", "made")) \
        .replace("{{project}}", kwargs.get("project", "General")) \
        .replace("{{decision_id}}", kwargs.get("decision_id", str(uuid.uuid4())[:8])) \
        .replace("{{context}}", kwargs.get("context", "- ")) \
        .replace("{{option_1}}", kwargs.get("option_1", "Opcja 1")) \
        .replace("{{option_1_pros}}", kwargs.get("option_1_pros", "- ")) \
        .replace("{{option_1_cons}}", kwargs.get("option_1_cons", "- ")) \
        .replace("{{option_2}}", kwargs.get("option_2", "Opcja 2")) \
        .replace("{{option_2_pros}}", kwargs.get("option_2_pros", "- ")) \
        .replace("{{option_2_cons}}", kwargs.get("option_2_cons", "- ")) \
        .replace("{{option_3}}", kwargs.get("option_3", "Opcja 3")) \
        .replace("{{option_3_pros}}", kwargs.get("option_3_pros", "- ")) \
        .replace("{{option_3_cons}}", kwargs.get("option_3_cons", "- ")) \
        .replace("{{cost_1}}", kwargs.get("cost_1", "-")) \
        .replace("{{cost_2}}", kwargs.get("cost_2", "-")) \
        .replace("{{cost_3}}", kwargs.get("cost_3", "-")) \
        .replace("{{time_1}}", kwargs.get("time_1", "-")) \
        .replace("{{time_2}}", kwargs.get("time_2", "-")) \
        .replace("{{time_3}}", kwargs.get("time_3", "-")) \
        .replace("{{risk_1}}", kwargs.get("risk_1", "-")) \
        .replace("{{risk_2}}", kwargs.get("risk_2", "-")) \
        .replace("{{risk_3}}", kwargs.get("risk_3", "-")) \
        .replace("{{maintain_1}}", kwargs.get("maintain_1", "-")) \
        .replace("{{maintain_2}}", kwargs.get("maintain_2", "-")) \
        .replace("{{maintain_3}}", kwargs.get("maintain_3", "-")) \
        .replace("{{chosen_option}}", kwargs.get("chosen_option", "- ")) \
        .replace("{{rationale}}", kwargs.get("rationale", "- ")) \
        .replace("{{review_condition}}", kwargs.get("review_condition", "- ")) \
        .replace("{{change_condition}}", kwargs.get("change_condition", "- ")) \
        .replace("{{stakeholders}}", kwargs.get("stakeholders", "- ")) \
        .replace("{{related_decisions}}", kwargs.get("related_decisions", "- "))

def gen_error_fix(title: str, **kwargs) -> str:
    """Generuje log błędu."""
    template = read_file(vault_path("Templates/Sessions/Error Fix.md"))
    
    return template \
        .replace("{{title}}", title) \
        .replace("{{date}}", today()) \
        .replace("{{resolved_date}}", today() if kwargs.get("status") == "resolved" else "- ") \
        .replace("{{status}}", kwargs.get("status", "resolved")) \
        .replace("{{timestamp}}", now()) \
        .replace("{{project}}", kwargs.get("project", "General")) \
        .replace("{{error_id}}", kwargs.get("error_id", str(uuid.uuid4())[:8])) \
        .replace("{{symptoms}}", kwargs.get("symptoms", "- ")) \
        .replace("{{system}}", kwargs.get("system", "Hermes")) \
        .replace("{{version}}", kwargs.get("version", "- ")) \
        .replace("{{context}}", kwargs.get("context", "- ")) \
        .replace("{{step_1}}", kwargs.get("step_1", "- ")) \
        .replace("{{step_2}}", kwargs.get("step_2", "- ")) \
        .replace("{{step_3}}", kwargs.get("step_3", "- ")) \
        .replace("{{step_4}}", kwargs.get("step_4", "- ")) \
        .replace("{{hypothesis}}", kwargs.get("hypothesis", "- ")) \
        .replace("{{test_description}}", kwargs.get("test_description", "- ")) \
        .replace("{{expected_result}}", kwargs.get("expected_result", "- ")) \
        .replace("{{actual_result}}", kwargs.get("actual_result", "- ")) \
        .replace("{{language}}", kwargs.get("language", "bash")) \
        .replace("{{fix_code}}", kwargs.get("fix_code", "...")) \
        .replace("{{lessons_learned}}", kwargs.get("lessons_learned", "- ")) \
        .replace("{{related_errors}}", kwargs.get("related_errors", "- ")) \
        .replace("{{related_notes}}", kwargs.get("related_notes", "- "))

def gen_daily_ai_context(**kwargs) -> str:
    """Generuje dzienny kontekst AI."""
    template = read_file(vault_path("Templates/Sessions/Daily AI Context.md"))
    
    # Pobierz ostatnie update'y projektów
    project_updates = sorted(
        vault_path("06 - AI Sessions/Project Updates").glob("*.md"),
        reverse=True
    )[:2]
    project_context = "\n".join([f"- [[{p.stem}]]" for p in project_updates]) or "- Brak updateów"
    
    return template \
        .replace("{{date}}", today()) \
        .replace("{{timestamp}}", now()) \
        .replace("{{todays_priorities}}", kwargs.get("todays_priorities", "- ")) \
        .replace("{{project_1}}", kwargs.get("project_1", "TradeLens AIO")) \
        .replace("{{status_1}}", kwargs.get("status_1", "- ")) \
        .replace("{{goal_1}}", kwargs.get("goal_1", "- ")) \
        .replace("{{blocker_1}}", kwargs.get("blocker_1", "- ")) \
        .replace("{{project_2}}", kwargs.get("project_2", "Hermes Agent")) \
        .replace("{{status_2}}", kwargs.get("status_2", "- ")) \
        .replace("{{goal_2}}", kwargs.get("goal_2", "- ")) \
        .replace("{{blocker_2}}", kwargs.get("blocker_2", "- ")) \
        .replace("{{quick_action_1}}", kwargs.get("quick_action_1", "- ")) \
        .replace("{{quick_action_2}}", kwargs.get("quick_action_2", "- ")) \
        .replace("{{hermes_status}}", kwargs.get("hermes_status", "running")) \
        .replace("{{obsidian_status}}", kwargs.get("obsidian_status", "active")) \
        .replace("{{trading_status}}", kwargs.get("trading_status", "- ")) \
        .replace("{{known_issues}}", kwargs.get("known_issues", "- ")) \
        .replace("{{yesterday_notes}}", kwargs.get("yesterday_notes", "- ")) \
        .replace("{{link_1}}", kwargs.get("link_1", "- ")) \
        .replace("{{link_2}}", kwargs.get("link_2", "- "))

# ─── Zapisywanie notatek ────────────────────────────────────────────────────────

def save_note(content: str, folder: str, filename: str) -> Path:
    """Zapisuje notatkę do vaultu."""
    folder_path = vault_path(folder)
    folder_path.mkdir(parents=True, exist_ok=True)
    
    file_path = folder_path / f"{filename}.md"
    file_path.write_text(content, encoding="utf-8")
    return file_path


# ─── Auto-Propagation ──────────────────────────────────────────────────────────

DAILY_SKELETON = """---
date: {{date}}
type: daily
tags: [daily, ai-operations]
ai-first: true
source: hermes
---

# 📅 {{date}}

## Dla przyszłego Jarvisa

Dziennik dnia utworzony automatycznie przy pierwszym zapisie do sejfu. Sesje AI (Jarvis, Claude Code) dopisuj w tabeli niżej.

## 3. 💼 Sesje AI tego dnia

| # | Czas | Tytuł sesji | Cel krótko | Status | Link |
|---|------|-------------|------------|--------|------|

## 5. 💡 Notatki i obserwacje

## 🔄 Vault Updates
"""


def update_daily_note_with_link(note_title: str, note_rel_path: str, link_label: str = ""):
    """Dodaje link do nowo utworzonej notatki w dzisiejszym daily note."""
    daily_folder = vault_path("01 - Daily")
    daily_folder.mkdir(parents=True, exist_ok=True)
    daily_file = daily_folder / f"{today()}.md"
    
    link_text = f"- [[{note_title}]] — {link_label}" if link_label else f"- [[{note_title}]]"
    
    if daily_file.exists():
        existing = read_file(daily_file)
        if f"[[{note_title}]]" in existing:      # link już jest — nie dublujemy
            return
        if "## 🔄 Vault Updates" not in existing:
            existing = existing.rstrip() + "\n\n## 🔄 Vault Updates\n"
        existing = existing.rstrip("\n") + f"\n{link_text}\n"
        daily_file.write_text(existing, encoding="utf-8")
    else:
        # Zwięzły szkielet (szablon Templates/Daily Note.md to instrukcja z <<placeholderami>>, nie notatka)
        content = DAILY_SKELETON.replace("{{date}}", today()) + f"{link_text}\n"
        daily_file.write_text(content, encoding="utf-8")


def update_hot_md(event_summary: str):
    """Aktualizuje hot.md o najnowsze wydarzenie."""
    hot_file = vault_path("hot.md")
    if hot_file.exists():
        content = read_file(hot_file)
        # Dodaj pod "Ostatnie wydarzenia"
        new_entry = f"- **{today()}:** {event_summary}"
        if new_entry in content:
            return
        if "## 🕐 Ostatnia aktualizacja" in content:
            lines = content.split("\n")
            i = next(n for n, l in enumerate(lines) if "## 🕐 Ostatnia aktualizacja" in l)
            lines.insert(i + 2 if i + 1 < len(lines) and not lines[i + 1].strip() else i + 1, new_entry)
            content = "\n".join(lines)
        elif "## Ostatnie wydarzenia" in content:
            # Wstaw po nagłówku
            lines = content.split("\n")
            insert_idx = None
            for i, line in enumerate(lines):
                if "## Ostatnie wydarzenia" in line:
                    insert_idx = i + 1
                    break
            if insert_idx is not None:
                lines.insert(insert_idx, new_entry)
                content = "\n".join(lines)
        else:
            content = content.rstrip() + f"\n\n## Ostatnie wydarzenia\n{new_entry}\n"
        
        # Zaktualizuj timestamp
        content = content.replace(
            "*Ostatnia aktualizacja: *",
            f"*Ostatnia aktualizacja: {today()} {now()}*"
        )
        hot_file.write_text(content, encoding="utf-8")


def update_log_md(operation: str, description: str):
    """Dopisuje wiersz tabeli NA KOŃCU log.md (konwencja sejfu; wpisy sortuje się po dacie z początku wiersza)."""
    log_file = vault_path("log.md")
    entry = f"| {now()} | {operation} | [Jarvis] {description} |"
    if log_file.exists():
        raw = log_file.read_bytes().decode("utf-8", errors="replace")
        nl = "\r\n" if "\r\n" in raw else "\n"
        if entry in raw:            # ten sam wpis w tej samej minucie (np. podwójne uruchomienie crona)
            return
        with open(log_file, "w", encoding="utf-8", newline="") as f:
            f.write(raw.rstrip("\r\n") + nl + entry + nl)
    else:
        log_file.write_text(f"# log.md — Operation Log\n\n{entry}\n", encoding="utf-8")


def propagate_note(note_title: str, note_rel_path: str, note_type: str, summary: str = ""):
    """Pełna auto-propagacja po zapisie notatki."""
    link_label = note_type.replace("-", " ").title()
    
    # 1. Update daily note
    update_daily_note_with_link(note_title, note_rel_path, link_label)
    
    # 2. Update hot.md
    update_hot_md(f"{link_label}: {summary or note_title}")
    
    # 3. Update log.md
    update_log_md(note_type.upper(), f"{note_title} → {note_rel_path}")
    
    # 4. Update vault stats
    try:
        import subprocess
        subprocess.run(
            ["python", str(Path(__file__).parent / "vault_stats.py"), "--vault", str(vault_path())],
            capture_output=True, timeout=30
        )
    except Exception:
        pass  # Stats update is best-effort

def append_to_daily(content: str, note_type: str = "general") -> Path:
    """Dopisuje do dziennej notatki AI."""
    daily_folder = vault_path("01 - Daily/AI Context")
    daily_folder.mkdir(parents=True, exist_ok=True)
    
    daily_file = daily_folder / f"{today()}.md"
    
    if daily_file.exists():
        existing = read_file(daily_file)
        # Dopisz pod nową sekcją
        section = f"\n\n## {note_type.upper()} — {now()}\n\n{content}"
        content = existing + section
    
    daily_file.write_text(content, encoding="utf-8")
    return daily_file

# ─── Lista notatek ──────────────────────────────────────────────────────────────

def list_notes(type_filter: str = "") -> str:
    """Listuje notatki w vaultze."""
    lines = ["📋 Notatki w vaultze", ""]
    
    folders = {
        "06 - AI Sessions/Daily Summaries": "📅 Daily",
        "06 - AI Sessions/Task Reports": "📋 Tasks",
        "06 - AI Sessions/Project Updates": "📊 Projects",
        "06 - AI Sessions/Research Logs": "🔬 Research",
        "06 - AI Sessions/Decisions": "⚖️ Decisions",
        "06 - AI Sessions/Errors & Fixes": "🐛 Errors",
        "01 - Daily/AI Context": "🤖 AI Context",
    }
    
    for folder, label in folders.items():
        folder_path = vault_path(folder)
        if not folder_path.exists():
            continue
        
        files = sorted(folder_path.glob("*.md"), reverse=True)
        if not files:
            continue
        
        lines.append(f"### {label}")
        for f in files[:10]:
            created = "?"
            content = read_file(f)
            for line in content.split("\n"):
                if line.startswith("created:") or line.startswith("date:"):
                    created = line.split(":", 1)[1].strip()
                    break
            lines.append(f"  - [[{f.stem}]] ({created})")
        lines.append("")
    
    return "\n".join(lines)

# ─── Główny CLI ────────────────────────────────────────────────────────────────

def usage():
    return """obsidian-capture.py — Hermes → Obsidian memory capture

Użycie:
  python obsidian-capture.py session                    # podsumowanie sesji
  python obsidian-capture.py task "<title>" [key=val...] # raport zadania
  python obsidian-capture.py update "<project>" [key=val...] # update projektu
  python obsidian-capture.py decision "<title>" [key=val...] # log decyzji
  python obsidian-capture.py research "<query>" [key=val...] # log researchu
  python obsidian-capture.py error "<title>" [key=val...]  # log błędu
  python obsidian-capture.py daily                      # dzienny kontekst
  python obsidian-capture.py list                       # listuj notatki
  python obsidian-capture.py inbox                      # procesuj ForAI inbox

Przykłady:
  python obsidian-capture.py task "Setup pipeline" status=done project=TradeLens
  python obsidian-capture.py update "Hermes Agent" phase=testing what_was_done="..." 
  python obsidian-capture.py decision "Wybór DB" chosen_option="SQLite"
  python obsidian-capture.py error "Kanban DB corrupt" status=resolved fix_code="..."

Szablony z {{placeholder}} które nie zostaną podane jako key=val zostaną zastąpione "-"."""

def main():
    if len(sys.argv) < 2:
        print(usage())
        sys.exit(1)
    
    cmd = sys.argv[1].lower()
    
    # Parsuj key=val z args
    kwargs = {}
    extra_args = []
    for arg in sys.argv[2:]:
        if "=" in arg:
            k, v = arg.split("=", 1)
            kwargs[k.strip()] = v.strip()
        else:
            extra_args.append(arg)
    
    if cmd == "session":
        content = gen_session_summary(**kwargs)
        path = save_note(content, "06 - AI Sessions/Daily Summaries", f"session-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "session", kwargs.get("context", "")[:100])
        print(f"✅ Session summary: {path.name}")
        
    elif cmd == "task":
        title = extra_args[0] if extra_args else "Untitled Task"
        content = gen_task_report(title, **kwargs)
        safe_name = re.sub(r"[^\w\s-]", "", title)[:60].replace(" ", "-")
        path = save_note(content, "06 - AI Sessions/Task Reports", f"task-{safe_name}-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "task", title)
        print(f"✅ Task report: {path.name}")
        
    elif cmd == "update":
        project = extra_args[0] if extra_args else "General"
        content = gen_project_update(project, **kwargs)
        safe_name = re.sub(r"[^\w\s-]", "", project)[:60].replace(" ", "-")
        path = save_note(content, "06 - AI Sessions/Project Updates", f"update-{safe_name}-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "project-update", project)
        print(f"✅ Project update: {path.name}")
        
    elif cmd == "decision":
        title = extra_args[0] if extra_args else "Untitled Decision"
        content = gen_decision(title, **kwargs)
        safe_name = re.sub(r"[^\w\s-]", "", title)[:60].replace(" ", "-")
        path = save_note(content, "06 - AI Sessions/Decisions", f"decision-{safe_name}-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "decision", title)
        print(f"✅ Decision: {path.name}")
        
    elif cmd == "research":
        query = extra_args[0] if extra_args else "Untitled Research"
        content = gen_research_log(query, **kwargs) if 'gen_research_log' in dir() else f"# Research: {query}"
        # Use generic research template
        template_path = vault_path("Templates/Sessions/Research Log.md")
        if template_path.exists():
            template = read_file(template_path)
            content = template \
                .replace("{{query}}", query) \
                .replace("{{date}}", today()) \
                .replace("{{timestamp}}", now()) \
                .replace("{{status}}", kwargs.get("status", "in-progress")) \
                .replace("{{research_question}}", kwargs.get("research_question", "- ")) \
                .replace("{{sources}}", kwargs.get("sources", "- ")) \
                .replace("{{primary_sources}}", kwargs.get("primary_sources", "- ")) \
                .replace("{{secondary_sources}}", kwargs.get("secondary_sources", "- ")) \
                .replace("{{analysis}}", kwargs.get("analysis", "- ")) \
                .replace("{{key_finding_1}}", kwargs.get("key_finding_1", "- ")) \
                .replace("{{key_finding_2}}", kwargs.get("key_finding_2", "- ")) \
                .replace("{{key_finding_3}}", kwargs.get("key_finding_3", "- ")) \
                .replace("{{uncertainties}}", kwargs.get("uncertainties", "- ")) \
                .replace("{{operational_recommendation}}", kwargs.get("operational_recommendation", "- ")) \
                .replace("{{related_notes}}", kwargs.get("related_notes", "- ")) \
                .replace("{{project}}", kwargs.get("project", "General"))
        safe_name = re.sub(r"[^\w\s-]", "", query)[:60].replace(" ", "-")
        path = save_note(content, "06 - AI Sessions/Research Logs", f"research-{safe_name}-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "research", query)
        print(f"✅ Research log: {path.name}")
        
    elif cmd == "error":
        title = extra_args[0] if extra_args else "Untitled Error"
        content = gen_error_fix(title, **kwargs)
        safe_name = re.sub(r"[^\w\s-]", "", title)[:60].replace(" ", "-")
        path = save_note(content, "06 - AI Sessions/Errors & Fixes", f"error-{safe_name}-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "error-fix", title)
        print(f"✅ Error fix: {path.name}")
        
    elif cmd == "daily":
        content = gen_daily_ai_context(**kwargs)
        path = save_note(content, "01 - Daily/AI Context", f"AI-Context-{today()}")
        propagate_note(path.stem, str(path.relative_to(vault_path())), "daily-context", "Daily AI context")
        print(f"✅ Daily AI context: {path.name}")
        
    elif cmd == "list":
        print(list_notes())
        
    elif cmd == "inbox":
        # ForAI inbox processing (handled by separate script)
        print("ℹ️  ForAI inbox processed by obsidian-inbox.py")
        
    else:
        print(f"❌ Nieznany command: {cmd}")
        print(usage())
        sys.exit(1)

if __name__ == "__main__":
    main()