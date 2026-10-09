"""Metryki pracy Hermesa (profil jarvis-desktop) z bazy rozmów state.db — tylko odczyt.

Po co: każdą zmianę konfiguracji da się porównać z punktem wyjścia (liczba kroków na polecenie, czas, tokeny,
model zapasowy, błędy narzędzi), zamiast zgadywać, czy pomogła.

Użycie (Python z venv Hermesa albo dowolny 3.10+):
    python metrics_report.py                 # ostatnie 7 dni, raport Markdown na stdout
    python metrics_report.py --days 1 --json # ostatnia doba jako JSON (np. do porównań)
    python metrics_report.py --out raport.md
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

for _s in (sys.stdout, sys.stderr):   # konsola Windows bywa w cp1250
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

DB = Path.home() / ".hermes" / "profiles" / "jarvis-desktop" / "state.db"
PRIMARY = "MiniMax-M3"


def pct(values: list[float], q: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    k = min(len(values) - 1, max(0, round(q * (len(values) - 1))))
    return values[k]


def collect(db: Path, days: float) -> dict:
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    since = time.time() - days * 86400
    sessions = con.execute(
        "SELECT id, source, model, message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens "
        "FROM sessions WHERE started_at > ?", (since,)).fetchall()
    by_src: dict[str, dict] = defaultdict(lambda: Counter())
    for sid, src, model, msgs, tools, tin, tout, tcache in sessions:
        c = by_src[src or "?"]
        c["sesje"] += 1
        c["wiadomości"] += msgs or 0
        c["narzędzia"] += tools or 0
        c["tokeny_wejście"] += tin or 0
        c["tokeny_wyjście"] += tout or 0
        c["tokeny_cache"] += tcache or 0

    # tury użytkownika: od wiadomości użytkownika do kolejnej; czas = ostatnia wiadomość tury − pierwsza
    turns: list[dict] = []
    rows = con.execute(
        "SELECT m.session_id, s.source, m.role, m.tool_name, m.timestamp, m.content FROM messages m "
        "JOIN sessions s ON s.id = m.session_id WHERE m.timestamp > ? ORDER BY m.session_id, m.id", (since,)).fetchall()
    cur = None
    tool_counter: Counter = Counter()
    tool_errors: Counter = Counter()
    for sid, src, role, tool, ts, content in rows:
        if role == "user" and content and not str(content).startswith("[System note"):
            if cur:
                turns.append(cur)
            cur = {"source": src or "?", "t0": ts, "t1": ts, "tools": 0}
        elif cur is not None:
            cur["t1"] = ts
            if role == "tool":
                cur["tools"] += 1
                tool_counter[tool or "?"] += 1
                if content and ('"error"' in str(content)[:300] or "Traceback" in str(content)[:2000]):
                    tool_errors[tool or "?"] += 1
    if cur:
        turns.append(cur)

    turn_stats = {}
    for src in sorted({t["source"] for t in turns}):
        ts = [t for t in turns if t["source"] == src]
        secs = [t["t1"] - t["t0"] for t in ts]
        tools = [t["tools"] for t in ts]
        turn_stats[src] = {
            "tury": len(ts),
            "czas_p50_s": round(pct(secs, .5) or 0, 1), "czas_p90_s": round(pct(secs, .9) or 0, 1),
            "narzędzia_p50": pct(tools, .5), "narzędzia_p90": pct(tools, .9),
            "tury_bez_narzędzi_%": round(100 * sum(1 for x in tools if x == 0) / len(tools), 1) if tools else None,
            "tury_>20_narzędzi": sum(1 for x in tools if x > 20),
        }

    usage = con.execute(
        "SELECT model, COALESCE(task, ''), SUM(api_call_count), SUM(input_tokens), SUM(output_tokens) "
        "FROM session_model_usage WHERE last_seen > ? GROUP BY model, task", (since,)).fetchall()
    main_calls = {m: c for m, task, c, _i, _o in usage if task == "" and c}
    total_main = sum(main_calls.values()) or 1
    aux: Counter = Counter()
    for _m, task, c, _i, _o in usage:
        if task:
            aux[task] += int(c or 0)   # to samo zadanie bywa na kilku modelach — sumujemy
    con.close()
    return {
        "okno_dni": days, "baza": str(db), "wygenerowano": time.strftime("%Y-%m-%d %H:%M"),
        "kanały": {k: dict(v) for k, v in by_src.items()},
        "tury": turn_stats,
        "modele_główne_%": {m: round(100 * c / total_main, 1) for m, c in sorted(main_calls.items(), key=lambda x: -x[1])},
        "model_zapasowy_%": round(100 * (total_main - main_calls.get(PRIMARY, 0)) / total_main, 1),
        "zadania_pomocnicze": dict(aux.most_common()),
        "narzędzia_top": dict(tool_counter.most_common(15)),
        "błędy_narzędzi_top": dict(tool_errors.most_common(10)),
    }


def markdown(d: dict) -> str:
    out = [f"# Metryki Hermesa — ostatnie {d['okno_dni']:g} dni ({d['wygenerowano']})", ""]
    out += ["## Kanały", "", "| kanał | sesje | wiadomości | narzędzia | tokeny wej. | tokeny z cache |", "|---|---|---|---|---|---|"]
    for k, v in sorted(d["kanały"].items(), key=lambda x: -x[1].get("wiadomości", 0)):
        out.append(f"| {k} | {v.get('sesje', 0)} | {v.get('wiadomości', 0)} | {v.get('narzędzia', 0)} | {v.get('tokeny_wejście', 0):,} | {v.get('tokeny_cache', 0):,} |")
    out += ["", "## Tury użytkownika (polecenie → odpowiedź)", "", "| kanał | tury | czas p50 | czas p90 | narzędzia p50 | p90 | bez narzędzi | >20 narzędzi |", "|---|---|---|---|---|---|---|---|"]
    for k, v in d["tury"].items():
        out.append(f"| {k} | {v['tury']} | {v['czas_p50_s']} s | {v['czas_p90_s']} s | {v['narzędzia_p50']} | {v['narzędzia_p90']} | {v['tury_bez_narzędzi_%']}% | {v['tury_>20_narzędzi']} |")
    out += ["", f"## Modele (wywołania główne)", "", f"Model zapasowy: **{d['model_zapasowy_%']}%** wywołań.", ""]
    out += [f"- {m}: {p}%" for m, p in d["modele_główne_%"].items()]
    out += ["", "## Zadania pomocnicze (w tle)", ""] + [f"- {t}: {c} wywołań" for t, c in d["zadania_pomocnicze"].items()]
    out += ["", "## Najczęstsze narzędzia", ""] + [f"- {t}: {c}" for t, c in d["narzędzia_top"].items()]
    if d["błędy_narzędzi_top"]:
        out += ["", "## Błędy narzędzi", ""] + [f"- {t}: {c}" for t, c in d["błędy_narzędzi_top"].items()]
    return "\n".join(out) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--days", type=float, default=7)
    ap.add_argument("--db", default=str(DB))
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--out")
    a = ap.parse_args()
    d = collect(Path(a.db), a.days)
    text = json.dumps(d, ensure_ascii=False, indent=1) if a.json else markdown(d)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"zapisano: {a.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
