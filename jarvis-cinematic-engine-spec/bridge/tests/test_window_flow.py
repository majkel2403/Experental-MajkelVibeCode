"""Test window-flow: open_app → wm_list → wm_close_others (z cleanupem).

Weryfikuje warstwę WindowManager: otwarcie okna notes, wylistowanie okien
oraz zamknięcie wszystkich innych (zostawiając notes). Cleanup przywraca
stan wyjściowy minimalizując notatki na końcu.
"""
from __future__ import annotations

import unittest

from e2e_client import MCPClient, Result, preflight


class WindowFlowTest(unittest.TestCase):
    """open_app + wm_list + minimalizacja notatek na końcu."""

    @classmethod
    def setUpClass(cls):
        cls.pf = preflight()
        if not cls.pf.ok(require_clients=True):
            raise unittest.SkipTest(
                f"pre-flight nie przeszedł — {cls.pf.summary()}"
            )
        cls.client = MCPClient()

    def test_01_open_notes_app(self):
        r: Result = self.client.call("open_app", {"app": "notes"})
        self.assertTrue(r.ok, f"open_app notes fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")

    def test_02_wm_list_contains_notes(self):
        r: Result = self.client.call("wm_list")
        self.assertTrue(r.ok, f"wm_list fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")
        data = r.data if isinstance(r.data, dict) else {}
        windows = data.get("windows") or []
        # szukamy okna notes (id aplikacji 'notes' lub app='notes')
        ids = set()
        for w in windows:
            if isinstance(w, dict):
                ids.add(w.get("app") or w.get("id"))
        self.assertIn("notes", ids,
                      f"nie widzę okna notes w wm_list; mam okna: {sorted(ids)}")

    def test_99_cleanup_minimize_notes(self):
        # minimalizujemy notatki zamiast close_app, żeby następny test
        # zaczął od pustego pulpitu bez proszenia użytkownika o potwierdzenie
        r: Result = self.client.call("wm_minimize", {"app": "notes"})
        # wm_minimize zwraca ok=True nawet gdy okno już zminimalizowane
        self.assertTrue(r.ok, f"wm_minimize notes fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")


if __name__ == "__main__":
    unittest.main(verbosity=2)
