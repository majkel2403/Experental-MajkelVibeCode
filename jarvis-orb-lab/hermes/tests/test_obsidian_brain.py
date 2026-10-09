"""Testy wtyczki hermes/plugins/obsidian-brain (bez Hermesa; sejf w katalogu tymczasowym)."""
from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit
PLUGIN = Path(__file__).resolve().parent.parent / "plugins" / "obsidian-brain" / "__init__.py"

FACTS = """---
date: 2026-10-05
type: system
---

## Dla przyszłego Jarvisa

Opis pliku, który nie powinien trafić do kontekstu.

---

## 👤 Michał

| Fact | Value |
|------|-------|
| Full name | Michał Ostrowski |
| Timezone | CET/CEST |

*Ostatnia aktualizacja: 2026-10-05*
"""

HOT = """---\r\ntype: system\r\n---\r\n\r\n# 🔥 hot.md — Hot Cache\r\n\r\n> opis pliku\r\n\r\n## 🕐 Ostatnia aktualizacja\r\n\r\n**2026-10-05 — Znacznik-ABC:** świeży kontekst.\r\n\r\n## 🧠 Co wiemy o Michale\r\n\r\n### Kim jest\r\n\r\n- powtórka z CRITICAL_FACTS\r\n\r\n## 🔥 Hot Topics\r\n\r\n| Topic | Status |\r\n|---|---|\r\n| TradeLens decision | 🔄 Open |\r\n"""

LOG = """---
type: system
---
2026-10-05 14:10 | DAILY-CONTEXT | wpis crona nad tytułem
# 📋 log.md

| Czas | Type | Opis |
|------|------|------|
| 2026-06-11 22:00 | INIT | najstarszy |
| 2026-10-05 16:00 | UPDATE | środkowy |
| 2026-10-05 17:45 | SESSION | [Claude Code] najnowszy |
"""


@pytest.fixture()
def plugin(monkeypatch, tmp_path):
    spec = importlib.util.spec_from_file_location("obsidian_brain_under_test", PLUGIN)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    (tmp_path / "CRITICAL_FACTS.md").write_text(FACTS, encoding="utf-8")
    (tmp_path / "hot.md").write_bytes(HOT.encode("utf-8"))
    (tmp_path / "log.md").write_text(LOG, encoding="utf-8")
    monkeypatch.setenv("OBSIDIAN_VAULT_PATH", str(tmp_path))
    hooks = {}

    class Ctx:
        def register_hook(self, name, fn):
            hooks[name] = fn

    mod.register(Ctx())
    mod.hook = hooks["pre_llm_call"]
    return mod


def test_first_turn_injects_vault_files(plugin):
    out = plugin.hook(is_first_turn=True, platform="telegram", session_id="s1", user_message="cześć")
    ctx = out["context"]
    assert "=== CRITICAL_FACTS.md ===" in ctx and "=== hot.md ===" in ctx and "=== log.md" in ctx
    assert "Michał Ostrowski" in ctx and "Znacznik-ABC" in ctx
    assert ctx.rstrip().endswith("[koniec kontekstu sejfu]")


def test_background_platforms_get_nothing(plugin):
    for plat in ("cron", "CRON", "subagent", "curator", "background_review"):
        assert plugin.hook(is_first_turn=True, platform=plat) is None
    for plat in ("telegram", "api_server", "cli", "", None):
        assert plugin.hook(is_first_turn=True, platform=plat) is not None


def test_later_turn_skipped_when_history_from_db_carries_the_block(plugin):
    """Telegram / X-Hermes-Session-Id: historia z state.db ma api_content z wstawką — nie dublujemy."""
    first = plugin.hook(is_first_turn=True, platform="telegram")["context"]
    history = [{"role": "user", "content": "cześć", "api_content": first + "\n\ncześć"},
               {"role": "assistant", "content": "hej"}, {"role": "user", "content": "co dalej?"}]
    assert plugin.hook(is_first_turn=False, platform="telegram", conversation_history=history) is None


def test_later_turn_reinjected_when_client_sent_history_without_block(plugin):
    """Karta Jarvis OS przysyła historię w treści zapytania (bez wstawek) — sejf musi przyjść znowu.
    To samo po kompresji, która wycięła pierwszą wiadomość."""
    history = [{"role": "user", "content": "cześć"}, {"role": "assistant", "content": "hej"},
               {"role": "user", "content": [{"type": "text", "text": "obraz"}]}]   # treść-lista nie psuje sprawdzenia
    out = plugin.hook(is_first_turn=False, platform="api_server", conversation_history=history)
    assert out and plugin.MARKER in out["context"]
    assert plugin.hook(is_first_turn=False, platform="telegram", conversation_history=None) is not None


def test_dense_format_drops_meta_and_table_headers(plugin):
    ctx = plugin.build_context()
    assert "Opis pliku, który nie powinien" not in ctx        # preambuła
    assert "opis pliku" not in ctx                             # cytat-opis
    assert "powtórka z CRITICAL_FACTS" not in ctx              # sekcja pominięta razem z podsekcjami
    assert "Fact · Value" not in ctx and "|---" not in ctx     # nagłówki i separatory tabel
    assert "Full name · Michał Ostrowski" in ctx
    assert "TradeLens decision · 🔄 Open" in ctx
    assert "Ostatnia aktualizacja: 2026-10-05*" not in ctx     # stopka
    assert "\r" not in ctx and "date: 2026-10-05" not in ctx    # CRLF i frontmatter


def test_log_tail_newest_first_including_misplaced_cron_lines(plugin):
    ctx = plugin.build_context()
    log = ctx.split("=== log.md")[1]
    assert log.index("najnowszy") < log.index("środkowy") < log.index("wpis crona")
    assert "Czas · Type" not in log


def test_size_capped_below_spill_threshold(plugin, tmp_path):
    big = "\n".join(f"- punkt {i} " + "x" * 80 for i in range(400))
    (tmp_path / "CRITICAL_FACTS.md").write_text("## A\n" + big, encoding="utf-8")
    (tmp_path / "hot.md").write_text("## B\n" + big, encoding="utf-8")
    (tmp_path / "log.md").write_text("\n".join(f"| 2026-10-0{i % 9 + 1} 10:00 | X | " + "y" * 500 + " |" for i in range(50)), encoding="utf-8")
    ctx = plugin.build_context()
    assert len(ctx) <= plugin.MAX_TOTAL + 60
    assert "skrócone — pełny plik: CRITICAL_FACTS.md" in ctx and "skrócone — pełny plik: hot.md" in ctx


def test_forai_inbox_listed_only_when_not_empty(plugin, tmp_path):
    assert "Skrzynka ForAI" not in plugin.build_context()            # brak folderu = brak sekcji
    inbox = tmp_path / "00 - Inbox" / "ForAI"
    inbox.mkdir(parents=True)
    assert "Skrzynka ForAI" not in plugin.build_context()            # pusty folder = brak sekcji
    for i in range(12):
        (inbox / f"zadanie {i:02d}.md").write_text("zrób coś", encoding="utf-8")
    ctx = plugin.build_context()
    assert "Skrzynka ForAI: 12 notatek" in ctx
    assert "- zadanie 00" in ctx and "- zadanie 09" in ctx and "- zadanie 10" not in ctx
    assert "i 2 więcej" in ctx
    assert ctx.rstrip().endswith("[koniec kontekstu sejfu]")


def test_missing_vault_is_silent(plugin, monkeypatch, tmp_path):
    monkeypatch.setenv("OBSIDIAN_VAULT_PATH", str(tmp_path / "brak"))
    assert plugin.hook(is_first_turn=True, platform="telegram") is None


def test_unreadable_vault_never_raises(plugin, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("dysk odpięty")
    monkeypatch.setattr(plugin, "build_context", boom)
    assert plugin.hook(is_first_turn=True, platform="telegram") is None
