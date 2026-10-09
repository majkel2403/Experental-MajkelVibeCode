"""Evale zachowania Hermesa: prawdziwe polecenia do żywego gatewaya (api_server :8643), ocena odpowiedzi i narzędzi.

Każdy przypadek dostaje osobną sesję (X-Hermes-Session-Id = eval-<id>-<czas>), więc nie miesza się z rozmowami
użytkownika; liczba i nazwy narzędzi są odczytywane z bazy state.db (tylko odczyt). Przypadki są bez skutków ubocznych.

Użycie (Python z venv Hermesa):
    python hermes/evals/run_evals.py                     # wszystkie przypadki
    python hermes/evals/run_evals.py rachunek tozsamosc-krotko
    python hermes/evals/run_evals.py --out raport.json   # wynik do porównań (redeploy może pilnować spadku)
Kod wyjścia: 0 = wszystkie zaliczone, 1 = coś nie przeszło.
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import time
import urllib.request
from pathlib import Path

import yaml

for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
PROFILE = Path.home() / ".hermes" / "profiles" / "jarvis-desktop"
URL = "http://127.0.0.1:8643/v1/chat/completions"


def api_key() -> str:
    m = re.search(r"^\s*API_SERVER_KEY\s*=\s*(\S+)", (PROFILE / ".env").read_text(encoding="utf-8-sig"), re.M)
    if not m:
        raise SystemExit("brak API_SERVER_KEY w .env profilu jarvis-desktop")
    return m.group(1)


def ask(prompt: str, session_id: str, key: str, timeout: float) -> tuple[str, float]:
    body = json.dumps({"model": "jarvis-desktop", "stream": False, "messages": [{"role": "user", "content": prompt}]}).encode()
    req = urllib.request.Request(URL, data=body, method="POST", headers={
        "Content-Type": "application/json", "Authorization": "Bearer " + key, "X-Hermes-Session-Id": session_id})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8"))
    text = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    return text, time.time() - t0


def tools_used(session_id: str) -> list[str]:
    con = sqlite3.connect(f"file:{PROFILE / 'state.db'}?mode=ro", uri=True)
    try:
        rows = con.execute("SELECT tool_name FROM messages WHERE session_id LIKE ? AND role = 'tool' ORDER BY id",
                           (session_id + "%",)).fetchall()
    finally:
        con.close()
    return [r[0] or "?" for r in rows]


def judge(case: dict, text: str, secs: float, tools: list[str]) -> list[str]:
    errs = []
    low = text.lower()
    for pat in case.get("expect", []):
        if not re.search(pat, text, re.I):
            errs.append(f"brak w odpowiedzi: /{pat}/")
    for pat in case.get("forbid_text", []):
        if re.search(pat, low, re.I | re.M):
            errs.append(f"zakazane w odpowiedzi: /{pat}/")
    if "max_tools" in case and len(tools) > case["max_tools"]:
        errs.append(f"narzędzi {len(tools)} > {case['max_tools']} ({', '.join(tools)})")
    if case.get("tools_any") and not set(tools) & set(case["tools_any"]):
        errs.append(f"nie użył żadnego z: {case['tools_any']}")
    bad = sorted(set(tools) & set(case.get("tools_none", [])))
    if bad:
        errs.append(f"użył zakazanych narzędzi: {bad}")
    if secs > case.get("max_seconds", 180):
        errs.append(f"czas {secs:.0f} s > {case['max_seconds']} s")
    return errs


def main() -> int:
    ap = argparse.ArgumentParser(description="Evale zachowania Hermesa")
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--out")
    a = ap.parse_args()
    cases = yaml.safe_load((HERE / "cases.yaml").read_text(encoding="utf-8"))
    if a.ids:
        cases = [c for c in cases if c["id"] in a.ids]
    key = api_key()
    results, stamp = [], time.strftime("%Y%m%d%H%M%S")
    for c in cases:
        sid = f"eval-{c['id']}-{stamp}"
        try:
            text, secs = ask(c["prompt"], sid, key, timeout=c.get("max_seconds", 180) + 60)
            time.sleep(1.0)   # zapis wiadomości do bazy
            tools = tools_used(sid)
            errs = judge(c, text, secs, tools)
        except Exception as e:  # noqa: BLE001
            text, secs, tools, errs = "", 0.0, [], [f"błąd zapytania: {e}"]
        ok = not errs
        results.append({"id": c["id"], "ok": ok, "seconds": round(secs, 1), "tools": tools, "errors": errs, "answer": text[:300]})
        print(f"{'OK  ' if ok else 'FAIL'} {c['id']:<22} {secs:6.1f} s  narzędzia: {len(tools)}" + ("" if ok else "  ← " + "; ".join(errs)))
    passed = sum(r["ok"] for r in results)
    print(f"\nZaliczone: {passed}/{len(results)}")
    if a.out:
        Path(a.out).write_text(json.dumps({"when": time.strftime("%Y-%m-%d %H:%M"), "passed": passed, "total": len(results),
                                           "results": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
