"""Test hermes/scripts/metrics_report.py na małej, sztucznej bazie (schemat jak w state.db Hermesa)."""
from __future__ import annotations

import importlib.util
import sqlite3
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.unit
SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "metrics_report.py"


def load():
    spec = importlib.util.spec_from_file_location("metrics_report_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def make_db(path: Path) -> None:
    con = sqlite3.connect(path)
    con.executescript("""
        CREATE TABLE sessions (id TEXT, source TEXT, model TEXT, message_count INT, tool_call_count INT,
                               input_tokens INT, output_tokens INT, cache_read_tokens INT, started_at REAL);
        CREATE TABLE messages (id INTEGER PRIMARY KEY, session_id TEXT, role TEXT, tool_name TEXT, timestamp REAL, content TEXT);
        CREATE TABLE session_model_usage (session_id TEXT, model TEXT, task TEXT, api_call_count INT,
                                          input_tokens INT, output_tokens INT, last_seen REAL);
    """)
    now = time.time()
    con.execute("INSERT INTO sessions VALUES ('s1','telegram','MiniMax-M3',6,3,1000,100,5000,?)", (now - 600,))
    con.execute("INSERT INTO sessions VALUES ('old','telegram','MiniMax-M3',9,9,9,9,9,?)", (now - 30 * 86400,))
    rows = [("s1", "user", None, now - 600, "zrób coś"), ("s1", "tool", "terminal", now - 590, '{"output": "ok"}'),
            ("s1", "tool", "terminal", now - 580, '{"error": "exit 1"}'), ("s1", "assistant", None, now - 570, "gotowe"),
            ("s1", "user", None, now - 300, "a teraz?"), ("s1", "assistant", None, now - 295, "nic")]
    con.executemany("INSERT INTO messages (session_id, role, tool_name, timestamp, content) VALUES (?,?,?,?,?)", rows)
    con.executemany("INSERT INTO session_model_usage VALUES (?,?,?,?,?,?,?)", [
        ("s1", "MiniMax-M3", "", 3, 0, 0, now), ("s1", "MiniMax-M2.5", "", 1, 0, 0, now),
        ("s1", "MiniMax-M3", "background_review", 2, 0, 0, now), ("s1", "MiniMax-M2.5", "background_review", 5, 0, 0, now)])
    con.commit()
    con.close()


def test_report_counts_turns_tools_fallback_and_aux(tmp_path):
    db = tmp_path / "state.db"
    make_db(db)
    m = load()
    d = m.collect(db, 7)
    assert d["kanały"]["telegram"]["sesje"] == 1, "starsze sesje poza oknem"
    tg = d["tury"]["telegram"]
    assert tg["tury"] == 2 and tg["tury_bez_narzędzi_%"] == 50.0
    assert d["narzędzia_top"] == {"terminal": 2} and d["błędy_narzędzi_top"] == {"terminal": 1}
    assert d["model_zapasowy_%"] == 25.0
    assert d["zadania_pomocnicze"] == {"background_review": 7}, "to samo zadanie na dwóch modelach się sumuje"
    md = m.markdown(d)
    assert "Model zapasowy: **25.0%**" in md and "| telegram | 2 |" in md
