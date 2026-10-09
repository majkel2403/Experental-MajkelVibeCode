"""Test happy path: read-only tools bez żadnych mutacji.

Sprawdza najkrótszy pełny łańcuch MCP:
    Hermes → most :8651 → registry.run w przeglądarce → SSE result → Hermes.

Trzy read-only narzędzia z różnych kategorii (stan pulpitu / czas / czysta
arytmetyka) — każde wraca code='OK' w czasie krótszym niż timeout karty.
"""
from __future__ import annotations

import unittest

from e2e_client import MCPClient, PreFlight, Result, preflight


class HappyPathTest(unittest.TestCase):
    """Read-only narzędzia bez mutacji — każde musi zwrócić code='OK'."""

    @classmethod
    def setUpClass(cls):
        cls.pf = preflight()
        if not cls.pf.ok(require_clients=True):
            raise unittest.SkipTest(
                f"pre-flight nie przeszedł — {cls.pf.summary()}. "
                "Sprawdź czy most działa na :8651 i czy karta :4000 jest otwarta."
            )
        cls.client = MCPClient()

    def test_get_status_returns_full_environment(self):
        """get_status: pełny stan pulpitu — najszersze read-only narzędzie."""
        r: Result = self.client.call("get_status")
        self.assertTrue(r.ok, f"get_status zwrócił ok=False: code={r.code} text={r.text[:200]}")
        self.assertEqual(r.code, "OK")
        self.assertIsInstance(r.data, dict)
        self.assertIn("time", r.data, "brak time w data")
        self.assertIn("desktop", r.data, "brak desktop w data")
        self.assertIn("conn", r.data, "brak conn w data")
        self.assertEqual(r.data["conn"].get("hermes"), "up", "conn.hermes != up")

    def test_get_datetime_returns_iso_and_local(self):
        """get_datetime: czas i strefa — weryfikacja parsowania JSON w przeglądarce."""
        r: Result = self.client.call("get_datetime")
        self.assertTrue(r.ok, f"get_datetime fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")
        d = r.data or {}
        self.assertIn("iso", d)
        self.assertIn("local", d)
        self.assertIn("tz", d)
        # ISO z T i Z (UTC)
        self.assertIn("T", d["iso"])
        self.assertTrue(d["iso"].endswith("Z") or "+" in d["iso"],
                        f"nieoczekiwany format ISO: {d['iso']}")

    def test_calculate_arithmetic(self):
        """calculate: 2+2*3 = 8 — czysta arytmetyka bez I/O."""
        r: Result = self.client.call("calculate", {"expression": "2+2*3"})
        self.assertTrue(r.ok, f"calculate fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")
        # calculate zwraca data={value: 8} lub text='8'; akceptujemy oba
        if isinstance(r.data, dict):
            val = r.data.get("value") or r.data.get("result")
        else:
            val = r.data
        self.assertIn(str(val), ("8", "8.0"), f"2+2*3 != 8, dostałem {val!r}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
