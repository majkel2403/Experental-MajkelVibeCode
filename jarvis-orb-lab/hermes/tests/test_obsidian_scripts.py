"""Testy skryptów sejfu Obsidian (hermes/scripts: crony 7:30 i co 2 h, zapis notatek, kopia pamięci) na sejfie tymczasowym."""
from __future__ import annotations

import os
import subprocess
import sys
from datetime import date
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit
SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
TODAY = date.today().isoformat()


@pytest.fixture()
def vault(tmp_path):
    v = tmp_path / "vault"
    for d in ("00 - Inbox/ForAI", "01 - Daily/AI Context", "02 - Projects", "04 - Resources", "Templates/Sessions"):
        (v / d).mkdir(parents=True)
    (v / "hot.md").write_text("---\ntype: system\n---\n\n# hot\n\n## 🕐 Ostatnia aktualizacja\n\n**Znacznik-HOT**\n\n---\n\n## 🎯 W toku\n", encoding="utf-8")
    (v / "log.md").write_text("---\ntype: system\n---\n\n# 📋 log.md\n\n| Czas | Typ | Opis |\n|---|---|---|\n| 2026-10-05 10:00 | INIT | start |\n",
                              encoding="utf-8", newline="\r\n")   # sejf ma pliki CRLF — dopisywanie musi zachować styl
    (v / "CRITICAL_FACTS.md").write_text("---\ntype: system\n---\n\n## fakty\n", encoding="utf-8")
    (v / "02 - Projects" / "Projekt A.md").write_text("---\nstatus: active\nupdated: 2026-10-05\n---\n# A\n", encoding="utf-8")
    (v / "02 - Projects" / "Projects Hub.md").write_text("---\ntype: index\n---\n# hub\n", encoding="utf-8")
    prof = tmp_path / "profile" / "memories"
    prof.mkdir(parents=True)
    (prof / "MEMORY.md").write_text("Pierwszy wpis pamięci.\n§\nDrugi wpis, api_key=abc123SEKRET\n§\nTrzeci wpis.\n", encoding="utf-8")
    (prof / "USER.md").write_text("Michał mieszka w Gorinchem.\n", encoding="utf-8")
    return v


def run(vault, script, *args):
    env = {**os.environ, "OBSIDIAN_VAULT_PATH": str(vault), "HERMES_PROFILE_DIR": str(vault.parent / "profile")}
    env.pop("PYTHONIOENCODING", None)   # jak w cronie — skrypty same muszą sobie poradzić z kodowaniem konsoli
    r = subprocess.run([sys.executable, str(SCRIPTS / script), *args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=env, timeout=120)
    assert r.returncode == 0, r.stdout + r.stderr
    return r.stdout


def test_daily_cron_builds_real_context_without_fake_daily(vault):
    run(vault, "obsidian_daily_wrapper.py")
    run(vault, "obsidian_daily_wrapper.py")                 # drugi przebieg tego samego dnia
    ctx = (vault / "01 - Daily" / "AI Context" / f"AI-Context-{TODAY}.md").read_text(encoding="utf-8")
    assert "Znacznik-HOT" in ctx and "[[Projekt A]] — active" in ctx and "start" in ctx
    assert "Projects Hub" not in ctx                        # huby nie są projektami
    assert not (vault / "01 - Daily" / f"{TODAY}.md").exists()   # koniec fałszywych dzienników z szablonu
    log = (vault / "log.md").read_text(encoding="utf-8")
    assert log.count("DAILY-CONTEXT") == 1 and log.rstrip().endswith(f"[[AI-Context-{TODAY}]] |")
    assert log.index("# 📋 log.md") < log.index("DAILY-CONTEXT")   # nie nad tytułem
    raw = (vault / "log.md").read_bytes()
    assert raw.count(b"\r\n") == raw.count(b"\n")           # zachowany styl CRLF pliku


def test_daily_cron_also_copies_jarvis_memory_with_secrets_masked(vault):
    run(vault, "obsidian_daily_wrapper.py")
    note = (vault / "04 - Resources" / "Hermes Memory.md").read_text(encoding="utf-8")
    assert "Pierwszy wpis pamięci." in note and "Trzeci wpis." in note and "Michał mieszka w Gorinchem." in note
    assert "abc123SEKRET" not in note and "[ukryte]" in note
    assert "(MEMORY.md — 3 wpisów)" in note
    assert "✅" in (vault / "04 - Resources" / "Sync Log.md").read_text(encoding="utf-8")


def test_capture_appends_log_at_end_and_never_duplicates(vault):
    run(vault, "obsidian-capture.py", "task", "Test zapisu", "status=done")
    run(vault, "obsidian-capture.py", "task", "Test zapisu", "status=done")
    daily = (vault / "01 - Daily" / f"{TODAY}.md").read_text(encoding="utf-8")
    assert "<<" not in daily and "## 3. 💼 Sesje AI tego dnia" in daily   # zwięzły szkielet, nie szablon
    assert daily.count(f"[[task-Test-zapisu-{TODAY}]]") == 1
    log = (vault / "log.md").read_text(encoding="utf-8")
    assert log.count("| TASK | [Jarvis]") == 1 and log.rstrip().endswith("|")
    hot = (vault / "hot.md").read_text(encoding="utf-8")
    assert hot.index("Task: Test zapisu") < hot.index("## 🎯 W toku")   # w sekcji „Ostatnia aktualizacja”


def test_every_repo_script_compiles():
    """Każdy skrypt z hermes/scripts (crony no-agent, haki, sejf, radar) musi się kompilować — błąd składni = cichy padnięty cron."""
    scripts = sorted(SCRIPTS.glob("*.py"))
    assert len(scripts) >= 15
    for s in scripts:
        compile(s.read_text(encoding="utf-8"), str(s), "exec")   # w pamięci — bez plików .pyc


def test_search_skips_trash(vault):
    for d in (".trash/stare", "_trash/stare"):
        (vault / d).mkdir(parents=True)
        (vault / d / "skasowana.md").write_text("Znacznik-KOSZ\n", encoding="utf-8")
    (vault / "02 - Projects" / "Projekt A.md").write_text("---\nstatus: active\n---\n# A\nZnacznik-KOSZ żywy\n", encoding="utf-8")
    out = run(vault, "obsidian-context.py", "search", "Znacznik-KOSZ")
    assert "Projekt A" in out and "skasowana" not in out


def test_frontmatter_is_read_from_header_not_body():
    """Regresja 2026-10-05: parser czytał treść notatki zamiast frontmattera (typ „?”, lista aktywnych projektów pusta)."""
    import importlib.util
    for name in ("obsidian-context.py", "obsidian-inbox.py"):
        spec = importlib.util.spec_from_file_location(name.replace("-", "_")[:-3], SCRIPTS / name)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        note = '---\ntype: project\nstatus: "active"\ntags: [a, b]\n---\n# Tytuł\nstatus: z treści\n'
        fm = mod.extract_frontmatter(note)
        assert fm["type"] == "project" and fm["status"] == "active", name
        assert mod.extract_frontmatter("# bez frontmattera\nstatus: x\n") == {}, name


def test_vault_health_accepts_escaped_table_alias(vault):
    """`[[Nota\\|alias]]` w tabeli to poprawny link Obsidiana — nie może być liczony jako martwy."""
    import json
    (vault / "02 - Projects" / "Tabela.md").write_text(
        "---\ntype: index\n---\n# T\n\n| Notatka |\n|---|\n| [[Projekt A\\|alias A]] |\n| [[Nie istnieje\\|x]] |\n", encoding="utf-8")
    out = run(vault, "vault_health.py", "--path", str(vault), "--scope", "core", "--json")
    broken = [i["broken_link"] for w in json.loads(out)["warnings"] if w["type"] == "broken_links" for i in w["items"]]
    assert "Nie istnieje" in broken and not any(b.startswith("Projekt A") for b in broken)


def test_search_skips_private_archive_and_puts_core_first(vault):
    arch = vault / "06-AI-Sessions" / "Perplexity"
    for folder, name in (("Prywatne", "rozmowa-18plus"), ("Krótkie i przypadkowe", "halo"), ("Trading", "rozmowa-trading")):
        (arch / folder).mkdir(parents=True)
        (arch / folder / f"{name}.md").write_text("Znacznik-ARCH\n", encoding="utf-8")
    (vault / "02 - Projects" / "Projekt B.md").write_text("---\nstatus: active\n---\n# B\nZnacznik-ARCH w core\n", encoding="utf-8")
    out = run(vault, "obsidian-context.py", "search", "Znacznik-ARCH")
    assert "rozmowa-18plus" not in out and "halo" not in out
    assert out.index("Projekt B") < out.index("rozmowa-trading")


def test_inbox_cron_processes_forai_notes(vault):
    (vault / "00 - Inbox" / "ForAI" / "zadanie.md").write_text("---\ntype: task\n---\n# Zrób coś\n", encoding="utf-8")
    out = run(vault, "obsidian_inbox_wrapper.py")
    assert "Przetworzono: 1" in out
    assert "zadanie" in (vault / "04 - Resources" / "Inbox Summary.md").read_text(encoding="utf-8")
