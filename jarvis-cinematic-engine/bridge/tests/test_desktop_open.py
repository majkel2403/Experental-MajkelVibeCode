# -*- coding: utf-8 -*-
"""desktop_open — logika mostu bez prawdziwej przeglądarki (podstawione: karta, otwieranie karty, okno, strona).

Scenariusze: brak karty → strona + nowa karta + wejście; karta jest → okno na wierzch + wejście bez nowej karty;
karta zamrożona → ponowienie po wyciągnięciu na wierzch, w ostateczności nowa karta; strona nie wstaje → INTERNAL.
"""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import jarvis_bridge as jb  # noqa: E402
import winfocus  # noqa: E402
from mcp.server.mcpserver.exceptions import ToolError  # noqa: E402


class Fake:
    def __init__(self, client=True, freeze=0, site="", focus_ok=True):
        self.client, self.freeze, self.site, self.focus_ok = client, freeze, site, focus_ok
        self.opened = self.focused = self.relays = 0

    def install(self):
        self.saved = (jb.newest, jb.relay, jb._open_tab, jb._ensure_site, jb._wait_client, winfocus.bring_to_front)
        jb.newest = lambda: object() if self.client else None

        async def relay(name, args, timeout=None):
            self.relays += 1
            if self.freeze > 0:
                self.freeze -= 1
                raise ToolError("Przeglądarka nie odpowiedziała w 12 s")
            return {"ok": True, "code": "OK", "data": {"booted": True, "entered_now": True, "windows": 0}, "text": "Wszedłem do systemu (ekran startowy zdjęty)."}
        jb.relay = relay

        def open_tab():
            self.opened += 1
            self.client = True
        jb._open_tab = open_tab

        async def ensure_site():
            return self.site
        jb._ensure_site = ensure_site

        async def wait_client(seconds):
            return self.client
        jb._wait_client = wait_client

        def front(title=winfocus.TITLE):
            self.focused += 1
            return {"found": True, "title": "Jarvis OS – Comet", "browser": "comet", "foreground": self.focus_ok}
        winfocus.bring_to_front = front
        return self

    def restore(self):
        jb.newest, jb.relay, jb._open_tab, jb._ensure_site, jb._wait_client, winfocus.bring_to_front = self.saved


def call(args=None):
    # własna pętla zamiast asyncio.run(): run() zeruje pętlę głównego wątku, a test_media_fallback (uruchamiany później
    # w tym samym procesie) korzysta z asyncio.get_event_loop()
    loop = asyncio.new_event_loop()
    try:
        r = loop.run_until_complete(jb._bridge_desktop_open(args or {}))
    finally:
        loop.close()
    return r.is_error, json.loads(r.content[0].text)


class DesktopOpenTest(unittest.TestCase):
    def test_no_card_opens_tab_and_enters(self):
        f = Fake(client=False, site="started").install()
        try:
            err, d = call()
        finally:
            f.restore()
        self.assertFalse(err, d)
        self.assertEqual(f.opened, 1)
        self.assertTrue(d["data"]["opened"]); self.assertTrue(d["data"]["booted"]); self.assertTrue(d["data"]["focused"])
        self.assertIn("Uruchomiłem stronę", d["text"]); self.assertIn("nową kartę", d["text"])

    def test_existing_card_no_new_tab(self):
        f = Fake(client=True).install()
        try:
            err, d = call()
        finally:
            f.restore()
        self.assertFalse(err, d)
        self.assertEqual(f.opened, 0, "karta działała — bez nowej")
        self.assertEqual(f.focused, 1)
        self.assertIn("już działała", d["text"]); self.assertIn("na wierzchu", d["text"])

    def test_frozen_card_retry_then_new_tab(self):
        f = Fake(client=True, freeze=2).install()
        try:
            err, d = call()
        finally:
            f.restore()
        self.assertFalse(err, d)
        self.assertEqual(f.relays, 3)
        self.assertEqual(f.opened, 1, "po dwóch nieudanych próbach — nowa karta")
        self.assertTrue(d["data"]["opened"])

    def test_frozen_card_recovers_after_focus(self):
        f = Fake(client=True, freeze=1).install()
        try:
            err, d = call()
        finally:
            f.restore()
        self.assertFalse(err, d)
        self.assertEqual(f.opened, 0)

    def test_site_failed(self):
        f = Fake(client=False, site="failed").install()
        try:
            err, d = call()
        finally:
            f.restore()
        self.assertTrue(err)
        self.assertEqual(d["code"], "INTERNAL")
        self.assertEqual(f.opened, 0)

    def test_focus_false_does_not_touch_windows(self):
        f = Fake(client=True).install()
        try:
            err, d = call({"focus": False})
        finally:
            f.restore()
        self.assertFalse(err, d)
        self.assertEqual(f.focused, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
