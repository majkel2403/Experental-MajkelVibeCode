#!/usr/bin/env python
"""Uruchamia wszystkie testy E2E mostu MCP <-> karta Jarvis OS.

Wynik: PASS=zielony, FAIL=czerwony, SKIP=żółty. Czas per test widoczny
w nawiasie. Exit code 0 gdy wszystko OK, 1 gdy cokolwiek failuje lub padło
(z wyjątkiem jawnych SkipTest z powodu braku karty/mostu — te są OK).

Użycie:
    python bridge/tests/run_e2e.py                 # pełen pakiet
    python bridge/tests/run_e2e.py --no-color      # bez ANSI
    python bridge/tests/run_e2e.py test_happy_path # tylko happy path
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import unittest
from pathlib import Path

for _s in (sys.stdout, sys.stderr):   # konsola Windows bywa w cp1250 — strzałki/polskie znaki wywalały raport
    if hasattr(_s, "reconfigure"):
        _s.reconfigure(encoding="utf-8", errors="replace")

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

# Plik __init__.py w tests/ sprawia, że unittest.loader widzi moduły obok.
from e2e_client import (  # noqa: E402
    DIM, GREEN, RED, RESET, YELLOW, colored_fail, colored_pass, colored_skip, preflight,
)


DISCOVERY = HERE  # katalog z test_*.py


def banner_preflight() -> tuple[bool, str]:
    """Wykonaj pełen pre-flight raz, pokaż pasek na górze raportu."""
    pf = preflight()
    line = f"Pre-flight: {pf.summary()}"
    if pf.ok(require_clients=False):
        line += "  " + (colored_pass() if GREEN else "OK")
    else:
        line += "  " + (colored_fail() if RED else "FAIL")
    return pf.bridge_alive, line


class ColoredTextTestResult(unittest.TextTestResult):
    """Zbiera testy do ładnego wydruku po zakończeniu."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.records: list[tuple[str, str, str, float]] = []
        # (full_name, status, message, elapsed_ms)

    def startTest(self, test):  # noqa: N802
        self._t0 = time.time()
        super().startTest(test)

    def stopTest(self, test):  # noqa: N802
        super().stopTest(test)
        dt = (time.time() - getattr(self, "_t0", time.time())) * 1000
        name = self._full_name(test)
        status = "PASS"
        msg = ""
        # wpis zostanie nadpisany jeśli addFailure/addError wywoła nas
        if not any(n == name for n, _, _, _ in self.records):
            self.records.append((name, status, msg, dt))

    def _full_name(self, test) -> str:
        # błąd w setUpClass/setUpModule przychodzi jako _ErrorHolder bez _testMethodName
        m = getattr(test, "_testMethodName", None)
        return f"{test.__class__.__name__}.{m}" if m else str(test.id() if hasattr(test, "id") else test)

    def addSuccess(self, test):  # noqa: N802
        name = self._full_name(test)
        dt = self._last_dt(test)
        # aktualizuj ostatni rekord na PASS
        for i, (n, _, _, _) in enumerate(self.records):
            if n == name:
                self.records[i] = (n, "PASS", "", dt)
                break
        super().addSuccess(test)

    def addFailure(self, test, err):  # noqa: N802
        name = self._full_name(test)
        dt = self._last_dt(test)
        msg = self._exc_info_to_string(err, test)
        for i, (n, _, _, _) in enumerate(self.records):
            if n == name:
                self.records[i] = (n, "FAIL", msg, dt)
                break
        else:
            self.records.append((name, "FAIL", msg, dt))
        super().addFailure(test, err)

    def addError(self, test, err):  # noqa: N802
        name = self._full_name(test)
        dt = self._last_dt(test)
        msg = self._exc_info_to_string(err, test)
        for i, (n, _, _, _) in enumerate(self.records):
            if n == name:
                self.records[i] = (n, "ERROR", msg, dt)
                break
        else:
            self.records.append((name, "ERROR", msg, dt))
        super().addError(test, err)

    def addSkip(self, test, reason):  # noqa: N802
        name = self._full_name(test)
        dt = self._last_dt(test)
        for i, (n, _, _, _) in enumerate(self.records):
            if n == name:
                self.records[i] = (n, "SKIP", str(reason), dt)
                break
        else:
            self.records.append((name, "SKIP", str(reason), dt))
        super().addSkip(test, reason)

    def _last_dt(self, test) -> float:
        return (time.time() - getattr(self, "_t0", time.time())) * 1000


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="E2E test runner dla mostu MCP <-> Jarvis OS")
    ap.add_argument("pattern", nargs="*", default=["test_*.py"],
                    help="wzorzec nazw plików (domyślnie test_*.py); można podać wiele")
    ap.add_argument("--no-color", action="store_true",
                    help="wyłącz kolory ANSI (logi bez TTY)")
    ap.add_argument("-v", "--verbose", action="store_true",
                    help="dodatkowy wydruk unittest przy każdym teście")
    args = ap.parse_args(argv)

    if args.no_color:
        # resetuj stałe — brak kolorów w druku
        global GREEN, RED, YELLOW, DIM, RESET
        GREEN = RED = YELLOW = DIM = RESET = ""

    bridge_alive, pf_line = banner_preflight()
    print(pf_line)
    if not bridge_alive:
        print("Most :8651 nie żyje — testy zakończą się SkipTest. Uruchom:")
        print("    python bridge/jarvis_bridge.py")
        print()

    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for pat in (args.pattern or ["test_*.py"]):
        suite.addTests(loader.discover(start_dir=str(DISCOVERY), pattern=pat,
                                       top_level_dir=str(HERE)))
    runner = unittest.TextTestRunner(resultclass=ColoredTextTestResult,
                                     verbosity=2 if args.verbose else 0,
                                     stream=sys.stdout)
    t0 = time.time()
    result = runner.run(suite)
    total_s = time.time() - t0

    # Sprzątanie: testy działają na żywej karcie użytkownika i zostawiają artefakty z zastrzeżonymi nazwami
    # (usuwanie zwykłymi narzędziami wymaga kliknięcia „Tak”). e2e_cleanup usuwa wyłącznie te nazwy.
    if bridge_alive:
        try:
            from e2e_client import MCPClient  # noqa: E402
            cr = MCPClient(timeout=20).call("e2e_cleanup", {})
            print(f"Sprzątanie po testach: {cr.text if cr.ok else 'nie udało się (' + str(cr.code) + ')'}")
        except Exception as e:  # noqa: BLE001 — sprzątanie nie zmienia wyniku testów
            print(f"Sprzątanie po testach: pominięte ({e})")

    # Podsumowanie
    print()
    print("=" * 72)
    print(f"{'Test':<58} {'Status':<6} {'Czas':>6}")
    print("-" * 72)
    sorted_records = sorted(result.records, key=lambda r: r[0])
    for name, status, msg, dt in sorted_records:
        if status == "PASS":
            tag = colored_pass()
        elif status == "FAIL":
            tag = colored_fail()
        elif status == "ERROR":
            tag = colored_fail()
        elif status == "SKIP":
            tag = colored_skip()
        else:
            tag = status
        # krótsza nazwa (bez 'Test' w środku)
        short = name.replace("Test.", ".").replace("Test", "")[:58]
        print(f"{short:<58} {tag:<{6 + (len(tag) - len(status))}} {dt:>5.0f} ms")
    print("-" * 72)
    runs = result.testsRun
    failed = len(result.failures)
    errors = len(result.errors)
    skipped = len(result.skipped)
    passed = runs - failed - errors - skipped
    head = f"Passed: {passed}  Failed: {failed}  Errors: {errors}  Skipped: {skipped}  /  Total: {runs}"
    print(head)
    print(f"Łączny czas: {total_s:.2f} s")

    # Exit code 1 tylko gdy cokolwiek faktycznie padło (skip jest OK).
    if failed or errors:
        print()
        print("=" * 72)
        print("SZCZEGÓŁY BŁĘDÓW")
        print("=" * 72)
        for name, status, msg, _ in sorted_records:
            if status in ("FAIL", "ERROR") and msg:
                print()
                print(f"--- {name} ({status}) ---")
                # unittest wywala AssertionError z pełnym trace; tnijmy do ostatnich 25 linii
                lines = msg.splitlines()
                tail = lines[-25:] if len(lines) > 25 else lines
                for ln in tail:
                    print(ln)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
