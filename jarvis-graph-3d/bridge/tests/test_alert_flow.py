"""Test alert-flow: market_watch z absurdalnym progiem → list → remove.

Nie chcemy fałszywych alertów kursów — ustawiamy BTC powyżej 999 999 999 USD
(co nigdy nie nastąpi), potem usuwamy alert po id. Weryfikujemy pełen cykl
zapisu/odczytu/usunięcia, a nie sam alert.
"""
from __future__ import annotations

import unittest

from e2e_client import MCPClient, Result, preflight


class AlertFlowTest(unittest.TestCase):
    """market_watch BTC absurdalny próg → market_alerts list → remove (cleanup)."""

    @classmethod
    def setUpClass(cls):
        cls.pf = preflight()
        if not cls.pf.ok(require_clients=True):
            raise unittest.SkipTest(
                f"pre-flight nie przeszedł — {cls.pf.summary()}"
            )
        cls.client = MCPClient()
        cls.alert_id: str | None = None

    @classmethod
    def tearDownClass(cls):
        # Bezpiecznik: gdyby test w środku nie posprzątał, usuń wszystkie alerty BTC
        # ustawione powyżej 999_999_999 USD.
        if cls.alert_id:
            cls.client.call("market_alerts", {"op": "remove", "alert": cls.alert_id})
            return
        r = cls.client.call("market_alerts", {"op": "list"})
        if r.ok:
            alerts = r.data if isinstance(r.data, list) else (
                r.data.get("alerts", []) if isinstance(r.data, dict) else [])
            for a in alerts:
                if isinstance(a, dict) and float(a.get("price") or 0) >= 999_999_999:
                    cls.client.call(
                        "market_alerts",
                        {"op": "remove", "alert": a.get("id") or a.get("symbol")},
                    )

    def test_01_set_btc_alert_with_absurd_threshold(self):
        # silent=true → bez pytania o confirm (drill / cron path)
        r: Result = self.client.call(
            "market_watch",
            {"symbol": "BTC", "direction": "above", "price": 999_999_999, "silent": True},
        )
        self.assertTrue(r.ok, f"market_watch fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")
        # zapisz id do cleanup (może być w data.id albo data.symbol)
        data = r.data or {}
        aid = data.get("id") if isinstance(data, dict) else None
        if not aid and isinstance(data, dict):
            aid = data.get("symbol")
        type(self).alert_id = aid or "BTC"

    def test_02_alert_listed(self):
        r: Result = self.client.call("market_alerts", {"op": "list"})
        self.assertTrue(r.ok, f"market_alerts list fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")
        # market_alerts list: {"alerts": [...]}; akceptujemy też listę
        alerts = r.data if isinstance(r.data, list) else (
            r.data.get("alerts", []) if isinstance(r.data, dict) else [])
        # szukamy alertu BTC z absurdalnym progiem
        found = False
        for a in alerts:
            if isinstance(a, dict):
                sym = (a.get("symbol") or "").upper()
                try:
                    price = float(a.get("price") or 0)
                except (TypeError, ValueError):
                    continue
                if sym == "BTC" and price >= 999_999_999:
                    found = True
                    break
        self.assertTrue(found,
                        f"alert BTC≥999999999 nie pojawił się na liście; mam {len(alerts)} alertów")

    def test_03_remove_alert_cleanup(self):
        target = getattr(type(self), "alert_id", None) or "BTC"
        r: Result = self.client.call("market_alerts", {"op": "remove", "alert": target})
        # market_alerts.remove zwraca code='OK' nawet gdy alert nie istniał
        self.assertTrue(r.ok, f"market_alerts remove fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")
        type(self).alert_id = None


if __name__ == "__main__":
    unittest.main(verbosity=2)
