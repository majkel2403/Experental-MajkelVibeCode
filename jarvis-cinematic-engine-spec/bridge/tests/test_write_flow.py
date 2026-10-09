"""Test write-flow: pełny cykl mutacji notatki z cleanupem.

    create_note → notes_list (potwierdzenie że powstała) → notes_update (marker
    e2e-leftover, brak risk='confirm' w odróżnieniu od notes_delete).

Cleanup: zamiast notes_delete (które wymaga potwierdzenia użytkownika i w
headless E2E wisi 90 s do DENIED) przemianowujemy notatkę na '__E2E_LEFTOVER_<ts>'
i przenosimy do folderu 'e2e-leftovers'. Notatka zostaje w systemie z wyraźnym
markerem do późniejszego ręcznego posprzątania przez operatora — to kompromis
między pełnym cleanupem a brakiem dostępu do UI potwierdzenia.
"""
from __future__ import annotations

import time
import unittest

from e2e_client import MCPClient, Result, preflight


NOTE_TITLE = f"E2E test note {int(time.time() * 1000)}"
NOTE_CONTENT = "Treść testowa z drilla E2E — cleanup oznacza ją markerem."
LEFTOVER_TITLE = f"__E2E_LEFTOVER_{int(time.time() * 1000)}__"
LEFTOVER_FOLDER = "e2e-leftovers"


class WriteFlowTest(unittest.TestCase):
    """create_note → notes_list → notes_update + notes_folder (cleanup)."""

    @classmethod
    def setUpClass(cls):
        cls.pf = preflight()
        if not cls.pf.ok(require_clients=True):
            raise unittest.SkipTest(
                f"pre-flight nie przeszedł — {cls.pf.summary()}"
            )
        cls.client = MCPClient()
        cls.created_id: str | None = None

    @classmethod
    def tearDownClass(cls):
        # Awaryjnie: gdyby któryś test w środku nie doszedł do cleanupu,
        # szukamy po oryginalnym tytule i oznaczamy jako leftover.
        if cls.created_id:
            cls.client.call(
                "notes_update",
                {"note": cls.created_id, "title": LEFTOVER_TITLE,
                 "content": "__e2e_leftover__"},
            )
            cls.client.call(
                "notes_folder",
                {"note": cls.created_id, "folder": LEFTOVER_FOLDER},
            )
            return
        # Szukamy po tytule
        r = cls.client.call("notes_list", {"limit": 100, "folder": LEFTOVER_FOLDER})
        if not (r.ok and isinstance(r.data, list)):
            r = cls.client.call("notes_list", {"limit": 100})
        if r.ok:
            notes = r.data if isinstance(r.data, list) else (
                r.data.get("notes", []) if isinstance(r.data, dict) else [])
            for n in notes:
                if isinstance(n, dict) and n.get("title") == NOTE_TITLE:
                    nid = n.get("id") or NOTE_TITLE
                    cls.client.call(
                        "notes_update",
                        {"note": nid, "title": LEFTOVER_TITLE,
                         "content": "__e2e_leftover__"},
                    )
                    cls.client.call(
                        "notes_folder",
                        {"note": nid, "folder": LEFTOVER_FOLDER},
                    )
                    break

    def test_01_create_note(self):
        r: Result = self.client.call(
            "create_note",
            {"title": NOTE_TITLE, "content": NOTE_CONTENT, "show": False},
        )
        self.assertTrue(r.ok, f"create_note fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")
        data = r.data or {}
        note_id = data.get("id") if isinstance(data, dict) else None
        if not note_id and isinstance(data, dict):
            note = data.get("note") or {}
            note_id = note.get("id")
        type(self).created_id = note_id or NOTE_TITLE

    def test_02_note_appears_in_list(self):
        self.assertTrue(getattr(type(self), "created_id", None),
                        "test_01 nie zostawił id — czy był uruchomiony?")
        r: Result = self.client.call("notes_list", {"limit": 100})
        self.assertTrue(r.ok, f"notes_list fail: {r.code} {r.text}")
        self.assertEqual(r.code, "OK")
        # notes_list zwraca {"count": N, "notes": [...]}; akceptujemy też listę
        notes = r.data if isinstance(r.data, list) else (
            r.data.get("notes", []) if isinstance(r.data, dict) else [])
        titles = {n.get("title") for n in notes if isinstance(n, dict)}
        self.assertIn(NOTE_TITLE, titles,
                      f"nie znalazłem {NOTE_TITLE!r} w notes_list; mam {len(notes)} notatek")

    def test_03_cleanup_mark_as_leftover(self):
        # Cleanup bez notes_delete: przemianuj + przenieś do folderu e2e-leftovers.
        target = getattr(type(self), "created_id", None) or NOTE_TITLE
        r1: Result = self.client.call(
            "notes_update",
            {"note": target, "title": LEFTOVER_TITLE,
             "content": "__e2e_leftover__"},
        )
        self.assertTrue(r1.ok, f"notes_update fail: {r1.code} {r1.text[:200]}")
        self.assertEqual(r1.code, "OK")
        r2: Result = self.client.call(
            "notes_folder",
            {"note": target, "folder": LEFTOVER_FOLDER},
        )
        self.assertTrue(r2.ok, f"notes_folder fail: {r2.code} {r2.text[:200]}")
        self.assertEqual(r2.code, "OK")
        type(self).created_id = None  # już posprzątane (oznaczone)


if __name__ == "__main__":
    unittest.main(verbosity=2)
