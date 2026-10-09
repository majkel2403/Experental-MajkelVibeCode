"""Test widget-flow: create_widget → widgets_update check_item → widgets_update marker.

Tworzy widget-listę, dodaje pozycję, odhacza ją, potem przemianowuje na
'__E2E_LEFTOVER_<ts>' (zamiast widgets_remove, które wymaga potwierdzenia).
Widget zostaje w systemie z wyraźnym markerem do ręcznego sprzątania.
"""
from __future__ import annotations

import time
import unittest

from e2e_client import MCPClient, Result, preflight


WIDGET_TITLE = f"E2E drill widget {int(time.time() * 1000)}"
LEFTOVER_TITLE = f"__E2E_LEFTOVER_WIDGET_{int(time.time() * 1000)}__"


class WidgetFlowTest(unittest.TestCase):
    """create_widget → check_item → widgets_update marker (cleanup)."""

    @classmethod
    def setUpClass(cls):
        cls.pf = preflight()
        if not cls.pf.ok(require_clients=True):
            raise unittest.SkipTest(
                f"pre-flight nie przeszedł — {cls.pf.summary()}"
            )
        cls.client = MCPClient()
        cls.widget_id: str | None = None

    @classmethod
    def tearDownClass(cls):
        # Awaryjnie: gdyby test w środku nie doszedł do cleanupu,
        # szukamy widgetu po tytule i przemianowujemy.
        if cls.widget_id:
            cls.client.call(
                "widgets_update",
                {"widget": cls.widget_id, "title": LEFTOVER_TITLE,
                 "content": "__e2e_leftover__"},
            )
            return
        r = cls.client.call("widgets_list")
        if r.ok:
            widgets = r.data if isinstance(r.data, list) else (
                r.data.get("widgets", []) if isinstance(r.data, dict) else [])
            for w in widgets:
                if isinstance(w, dict) and w.get("title") == WIDGET_TITLE:
                    wid = w.get("id") or WIDGET_TITLE
                    cls.client.call(
                        "widgets_update",
                        {"widget": wid, "title": LEFTOVER_TITLE,
                         "content": "__e2e_leftover__"},
                    )
                    break

    def test_01_create_widget_list(self):
        r: Result = self.client.call(
            "create_widget",
            {"type": "list", "title": WIDGET_TITLE,
             "items": ["pozycja alfa", "pozycja beta"]},
        )
        self.assertTrue(r.ok, f"create_widget fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")
        data = r.data or {}
        wid = data.get("id") if isinstance(data, dict) else None
        type(self).widget_id = wid or WIDGET_TITLE

    def test_02_widget_list_contains_title(self):
        r: Result = self.client.call("widgets_list")
        self.assertTrue(r.ok, f"widgets_list fail: {r.code} {r.text}")
        # widgets_list: {"widgets": [...]}; akceptujemy też listę
        widgets = r.data if isinstance(r.data, list) else (
            r.data.get("widgets", []) if isinstance(r.data, dict) else [])
        titles = {w.get("title") for w in widgets if isinstance(w, dict)}
        self.assertIn(WIDGET_TITLE, titles,
                      f"nie znalazłem widgetu {WIDGET_TITLE!r}; mam {len(widgets)} widgetów")

    def test_03_check_item(self):
        # Odhaczenie pozycji alfa (weryfikacja mutacji items bez confirm).
        wid = getattr(type(self), "widget_id", None) or WIDGET_TITLE
        r: Result = self.client.call(
            "widgets_update",
            {"widget": wid, "check_item": "pozycja alfa"},
        )
        self.assertTrue(r.ok, f"widgets_update check_item fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")

    def test_04_cleanup_rename_widget(self):
        wid = getattr(type(self), "widget_id", None) or WIDGET_TITLE
        r: Result = self.client.call(
            "widgets_update",
            {"widget": wid, "title": LEFTOVER_TITLE,
             "content": "__e2e_leftover__"},
        )
        self.assertTrue(r.ok, f"widgets_update rename fail: {r.code} {r.text[:200]}")
        self.assertEqual(r.code, "OK")
        type(self).widget_id = None


if __name__ == "__main__":
    unittest.main(verbosity=2)
