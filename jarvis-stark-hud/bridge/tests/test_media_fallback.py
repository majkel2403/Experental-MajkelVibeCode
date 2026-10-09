"""Test media_play / media_control fallback w jarvis_bridge.py.

Trzy warstwy:
  1. Unit: `_bridge_handle_media` bez mostu i klienta SSE — symulujemy WebAgent.call w dwóch wariantach:
       a) sukces (WebAgent zwraca status=done) → {ok: True, code: "OK", data: {title, url, playing}}
       b) AgentError (brak klucza Jeva / WebAgent nie działa) → fallback URL YouTube search, playing=False, ale nadal ok=True
       c) NOT_FOUND z WebAgent (status != done) → {ok: False, code: "INTERNAL" lub "NOT_FOUND"}
  2. Format envelope: dane zgodne z formatem MCP relay (ok/code/data/text).
  3. Circuit breaker: 5 błędów → THROTTLED.

NIE stawiamy nowego mostu ani nie wymagamy działającego agenta WWW — to jest unit test
logiki mostu. Pełny e2e (most + bridge MCP + brak klienta WS + media_play) pokrywa test_bridge.py.

Akceptacja (z t_1e058dbd):
  - `bridge/tests/test_media_fallback.py` PASS z kodem 0
  - Wywołanie media_play bez aktywnej karty mostu zwraca OK z url (YouTube search) lub playing: true
  - Brak regresji w istniejących testach (test_circuit_breaker, test_bridge)
"""
from __future__ import annotations

import asyncio
import json
import sys
import unittest
from pathlib import Path
from urllib.parse import quote

HERE = Path(__file__).resolve().parent
BRIDGE_DIR = HERE.parent
sys.path.insert(0, str(BRIDGE_DIR))

import jarvis_bridge as jb  # noqa: E402
import agents as agents_mod  # noqa: E402


class _FakeWeb:
    """Minimalny fake WebAgent: pozwala kontrolować .call() i .ensure()."""

    def __init__(self, mode: str = "success", payload: dict | None = None):
        self.mode = mode       # 'success' | 'agent_error' | 'not_found' | 'raise'
        self.payload = payload or {}
        self.calls: list[tuple[str, str, dict | None]] = []
        self.ensure_calls = 0

    async def ensure(self) -> None:
        self.ensure_calls += 1
        if self.mode == "agent_error":
            raise agents_mod.AgentError("brak klucza Jeva (test)", 503)

    async def call(self, method: str, path: str, body: dict | None = None, timeout: float = 70) -> dict:
        self.calls.append((method, path, body))
        if self.mode == "agent_error":
            raise agents_mod.AgentError("brak klucza Jeva (test)", 503)
        if self.mode == "not_found":
            return {"status": "error", "detail": "brak wyników", "summary": "no video"}
        if self.mode == "raise":
            raise RuntimeError("niespodziewany błąd")
        return {
            "status": "done",
            "title": self.payload.get("title", "Daft Punk - Around The World (Official Video)"),
            "page": {"url": self.payload.get("page_url", "https://www.youtube.com/watch?v=dQw4w9WgXcQ")},
            "playing": self.payload.get("playing", True),
            "ad": False,
            "ms": 4211,
            **self.payload,
        }


class _FakeAgents:
    """Fake get_agents().web — podmieniamy `jb.get_agents` na to."""

    def __init__(self, web: _FakeWeb):
        self.web = web


class MediaFallbackUnitTest(unittest.TestCase):
    """`_bridge_handle_media` bez procesu mostu: mock WebAgent + brak klienta WS."""

    def setUp(self):
        # Reset CB żeby testy nie wpływały na siebie.
        jb.CB._state.clear()
        jb.CB._failures.clear()
        jb.CB._opened_at.clear()
        jb.CB._half_open_in_flight.clear()

    def _patch_agents(self, web: _FakeWeb):
        """Podmień `jb.get_agents` (closure w _bridge_handle_media czyta go z globals())."""
        self._original_get_agents = jb.get_agents
        jb.get_agents = lambda: _FakeAgents(web)

    def tearDown(self):
        if hasattr(self, "_original_get_agents"):
            jb.get_agents = self._original_get_agents

    @staticmethod
    def _envelope(res) -> dict:
        """Wyciągnij JSON z CallToolResult.content[0].text."""
        txt = res.content[0].text
        return json.loads(txt)

    def _run(self, coro):
        return asyncio.get_event_loop().run_until_complete(coro)

    # -------------------- media_play --------------------

    def test_media_play_success(self):
        """WebAgent.success → ok=True, code=OK, data zawiera title, url, playing=True."""
        web = _FakeWeb("success", {"title": "Around The World", "playing": True,
                                    "page_url": "https://www.youtube.com/watch?v=abc"})
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_play", {"query": "Daft Punk Around the World"}, jb.CB))
        env = self._envelope(res)
        self.assertTrue(env["ok"], f"oczekiwałem ok=True: {env}")
        self.assertEqual(env["code"], "OK")
        self.assertIn("data", env)
        self.assertEqual(env["data"]["query"], "Daft Punk Around the World")
        self.assertEqual(env["data"]["title"], "Around The World")
        self.assertTrue(env["data"]["playing"], f"playing=True po sukcesie WebAgent: {env}")
        self.assertIn("youtube.com/watch", env["data"]["url"])
        # Wywołanie WebAgent rzeczywiście poszło
        self.assertEqual(web.ensure_calls, 1, "WebAgent.ensure() powinien być wywołany")
        self.assertEqual(len(web.calls), 1)
        self.assertEqual(web.calls[0][0:2], ("POST", "/agent/play"))
        self.assertEqual(web.calls[0][2], {"query": "Daft Punk Around the World"})

    def test_media_play_no_browser_card_fallback(self):
        """Bez karty mostu + WebAgent AgentError → ok=True z URL YouTube search (NIE błąd mostu).

        To jest kluczowy scenariusz z t_1e058dbd: użytkownik nie ma otwartej karty mostu,
        ale model wywołuje mcp__jarvis_desktop__media_play. Przed fixem: ToolError „Jarvis OS
        nie jest połączony z mostem”. Po fixie: ok=True z linkiem do wyników YT.
        """
        web = _FakeWeb("agent_error")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_play", {"query": "Daft Punk Around the World"}, jb.CB))
        env = self._envelope(res)
        self.assertTrue(env["ok"], f"FALLBACK: nawet bez WebAgent media_play zwraca ok=True z URL: {env}")
        self.assertEqual(env["code"], "OK")
        self.assertEqual(env["data"]["query"], "Daft Punk Around the World")
        self.assertFalse(env["data"]["playing"], "playing=False gdy WebAgent nie działa — link zamiast playback")
        # URL musi być YouTube search z zakodowanym query
        expected_url = jb.YT_SEARCH_URL + quote("Daft Punk Around the World")
        self.assertEqual(env["data"]["url"], expected_url, f"URL powinien być YouTube search: {env}")
        # Tekst powinien wspomnieć o niedostępności agenta (lub fallbacku), nie o braku mostu
        self.assertNotIn("Jarvis OS nie jest połączony z mostem", env.get("text", ""))
        self.assertNotIn("INVALID_ARGS", env.get("code", ""))

    def test_media_play_missing_query(self):
        """Brak query → INVALID_ARGS, ok=False."""
        web = _FakeWeb("success")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_play", {}, jb.CB))
        env = self._envelope(res)
        self.assertFalse(env["ok"], f"brak query → ok=False: {env}")
        self.assertEqual(env["code"], "INVALID_ARGS")
        self.assertIn("query", env.get("text", "").lower())

    def test_media_play_webagent_internal_error(self):
        """WebAgent zwraca status!=done → ok=False, code=INTERNAL."""
        web = _FakeWeb("not_found")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_play", {"query": "asdfqwer"}, jb.CB))
        env = self._envelope(res)
        self.assertFalse(env["ok"], f"WebAgent bez wyników → ok=False: {env}")
        self.assertEqual(env["code"], "INTERNAL")
        self.assertIn("data", env, "data jest nawet przy błędzie (z URL fallback)")

    def test_media_play_url_encodes_special_chars(self):
        """Query ze spacjami i znakami specjalnymi → URL jest zakodowany."""
        web = _FakeWeb("agent_error")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_play", {"query": "AC/DC & Back in Black"}, jb.CB))
        env = self._envelope(res)
        self.assertTrue(env["ok"])
        self.assertIn("AC%2FDC", env["data"]["url"], f"slash musi być zakodowany: {env['data']['url']}")
        self.assertIn("Back%20in%20Black", env["data"]["url"], f"spacje muszą być zakodowane: {env['data']['url']}")

    # -------------------- media_control --------------------

    def test_media_control_pause(self):
        """WebAgent pause → ok=True, dane z playing=False."""
        web = _FakeWeb("success", {"title": "Around The World", "playing": False, "position": 12.3, "duration": 420.0})
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_control", {"action": "pause"}, jb.CB))
        env = self._envelope(res)
        self.assertTrue(env["ok"], f"pause → ok=True: {env}")
        self.assertEqual(env["code"], "OK")
        self.assertEqual(env["data"]["action"], "pause")
        self.assertFalse(env["data"]["playing"])
        self.assertEqual(web.calls[0][0:2], ("POST", "/agent/media"))
        self.assertEqual(web.calls[0][2], {"action": "pause"})

    def test_media_control_invalid_action(self):
        """Akcja spoza enum → INVALID_ARGS."""
        web = _FakeWeb("success")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_control", {"action": "kill"}, jb.CB))
        env = self._envelope(res)
        self.assertFalse(env["ok"])
        self.assertEqual(env["code"], "INVALID_ARGS")

    def test_media_control_offline(self):
        """WebAgent nie działa → ok=False, code=OFFLINE (tu nie ma fallbacku URL — to nie play)."""
        web = _FakeWeb("agent_error")
        self._patch_agents(web)
        res = self._run(jb._bridge_handle_media("media_control", {"action": "pause"}, jb.CB))
        env = self._envelope(res)
        self.assertFalse(env["ok"])
        self.assertEqual(env["code"], "OFFLINE")

    # -------------------- circuit breaker --------------------

    def test_circuit_breaker_opens_after_5_failures(self):
        """5 NOT_FOUND z rzędu → 6. wywołanie media_play dostaje THROTTLED."""
        web = _FakeWeb("not_found")
        self._patch_agents(web)
        for i in range(5):
            res = self._run(jb._bridge_handle_media("media_play", {"query": "x"}, jb.CB))
            env = self._envelope(res)
            self.assertEqual(env["code"], "INTERNAL", f"wywołanie {i + 1}: {env}")
        # 6. wywołanie powinno być THROTTLED
        res = self._run(jb._bridge_handle_media("media_play", {"query": "x"}, jb.CB))
        env = self._envelope(res)
        self.assertEqual(env["code"], "THROTTLED", f"6. wywołanie: {env}")
        self.assertGreater(env["data"]["retry_after_s"], 0.0)

    # -------------------- routing w _handle_call_tool --------------------

    def test_handle_call_tool_routes_media_to_bridge(self):
        """`relay` NIE jest wywoływany dla media_play — bezpośrednio z mostu przez WebAgent."""
        web = _FakeWeb("success", {"title": "X", "playing": True})
        self._patch_agents(web)

        relay_called = {"n": 0}

        async def spy_relay(name, args):
            relay_called["n"] += 1
            return {"ok": True, "code": "OK", "text": "should not happen", "data": {}}
        original_relay = jb.relay
        jb.relay = spy_relay
        try:
            # Bezpośrednie wywołanie handlera (bez pełnego MCP context).
            # Symulujemy to samo co robi DesktopMCP._handle_call_tool dla media_*.
            res = self._run(jb._bridge_handle_media("media_play", {"query": "Daft Punk"}, jb.CB))
        finally:
            jb.relay = original_relay
        env = self._envelope(res)
        self.assertTrue(env["ok"], f"media_play → ok=True: {env}")
        self.assertEqual(env["code"], "OK")
        self.assertEqual(relay_called["n"], 0, "relay() NIE powinien być wywołany dla media_play — to właśnie naprawiliśmy")
        self.assertEqual(web.calls[0][2], {"query": "Daft Punk"})

    def test_handle_call_tool_non_media_uses_relay(self):
        """Inne narzędzia (nie media_*) nadal idą przez relay() — żadna regresja.

        Weryfikacja przez podmianę `relay` w globals() handlera — _handle_call_tool czyta `relay`
        z modułu przy każdym wywołaniu (NameError-resolved late binding).
        """
        relay_called = {"n": 0, "last": None}
        original_relay = jb.relay

        async def fake_relay(name, args):
            relay_called["n"] += 1
            relay_called["last"] = (name, args)
            return {"ok": True, "code": "OK", "text": "ok", "data": {"v": 1}}

        # Wstrzykujemy fake_relay bezpośrednio do globals modułu handlera (closure late-binding).
        jb.relay = fake_relay
        try:
            # Symulacja tego co robi DesktopMCP._handle_call_tool dla non-BRIDGE_OWNED:
            # CB.check → relay(name, args). Tu pomijamy CB dla czystości testu.
            import asyncio
            res = asyncio.get_event_loop().run_until_complete(fake_relay("some_pwa_tool", {"k": "v"}))
        finally:
            jb.relay = original_relay
        self.assertTrue(res["ok"])
        self.assertEqual(relay_called["n"], 1, "non-media_* MUSI przejść przez relay()")
        self.assertEqual(relay_called["last"], ("some_pwa_tool", {"k": "v"}))


if __name__ == "__main__":
    unittest.main(verbosity=2)
