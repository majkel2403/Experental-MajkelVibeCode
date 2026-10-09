"""Testy dziennika zadań Hermesa (bridge/day_history.py) — bez sieci. Uruchom: python bridge/test_day_history.py"""
import json
import shutil
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import day_history as dh  # noqa: E402

fails = []


def check(name, cond, extra=""):
    print(("  ok   " if cond else "  BŁĄD ") + name + ("" if cond else f"  [{extra}]"))
    if not cond:
        fails.append(name)


tmp = Path(tempfile.mkdtemp(prefix="day-history-"))
try:
    p, now = tmp / "agent-history.jsonl", time.time()
    ev = lambda typ, tid, ts, **x: {"type": typ, "task_id": tid, "ts": ts, **x}
    check("zapis początku", dh.record(p, ev("task.created", "t1", now - 3600, platform="telegram", title="Sprawdź pogodę we Wrocławiu")))
    check("narzędzia pomijane", not dh.record(p, ev("tool.started", "t1", now - 3590, tool="weather")))
    dh.record(p, ev("task.completed", "t1", now - 3500, result="Słonecznie, 18°C"), tools=2)
    dh.record(p, ev("task.created", "t2", now - 600, platform="cron", title="Raport rynku"))
    dh.record(p, ev("task.failed", "t2", now - 500, error="timeout"), tools=1)
    dh.record(p, ev("task.created", "t3", now - 60, platform="cli", title="Trwa"))
    dh.record(p, ev("task.created", "old", now - 3 * 86400, platform="telegram", title="Stare"))
    dh.record(p, ev("task.completed", "nieznane", now - 30, result="koniec bez początku"))
    t = dh.tasks(p, now - 86400)
    check("trzy zadania z ostatniej doby, od najstarszego", [x["id"] for x in t] == ["t1", "t2", "t3"], json.dumps(t, ensure_ascii=False))
    check("zakończone: status, wynik, narzędzia, czas", t[0]["status"] == "done" and t[0]["result"].startswith("Słonecznie") and t[0]["tools"] == 2 and t[0]["ended"] - t[0]["started"] == 100)
    check("porażka: błąd jako wynik", t[1]["status"] == "failed" and t[1]["result"] == "timeout" and t[1]["platform"] == "cron")
    check("bez końca = running", t[2]["status"] == "running" and t[2]["ended"] is None)
    check("zakres since/until", [x["id"] for x in dh.tasks(p, now - 4 * 86400, now - 86400)] == ["old"])
    with p.open("ab") as f:
        f.write(b"to nie json\n{\"type\": \"task.created\"}\n")
    check("uszkodzone wiersze pominięte", len(dh.tasks(p, now - 86400)) == 3)
    dh.prune(p, now=now + 6 * 86400)
    check("rotacja: zostają ostatnie dni", [x["id"] for x in dh.tasks(p, 0)] == ["t1", "t2", "t3"] and "old" not in p.read_text(encoding="utf-8"))
    long = ev("task.created", "x" * 200, now, title="T" * 500, platform="telegram")
    dh.record(p, long)
    last = json.loads(p.read_text(encoding="utf-8").splitlines()[-1])
    check("pola przycięte", len(last["title"]) == 160 and len(last["task_id"]) == 80)
    check("brak katalogu → tworzony", dh.record(tmp / "nowy" / "h.jsonl", ev("task.created", "a", now, title="x")))
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print("\n" + ("WSZYSTKO OK" if not fails else f"BŁĘDY ({len(fails)}): " + ", ".join(fails)))
sys.exit(1 if fails else 0)
