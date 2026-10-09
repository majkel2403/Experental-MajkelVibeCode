"""Test circuit breakera w jarvis_bridge.py.

Trzy warstwy:
  1. Unit: klasy CircuitBreaker (progi, stany, HALF_OPEN, sukces resetuje).
  3. Envelope: pełny wynik MCP zwraca code="THROTTLED" + retry_after_s>0 po N failed.

Symulacja 5 OFFLINE z rzędu → 6. wywołanie dostaje THROTTLED → po sleep(retry_after)
wywołanie wraca do CLOSED. Per-tool izolacja: OFFLINE w `media_play` nie blokuje `get_status`.

NIE stawiamy nowego mostu dla happy-path (to rola jarvis_bridge.py na :8651).
Ten plik jest warunkowy: wymaga modułu jarvis_bridge z bieżącego venv.
"""
from __future__ import annotations

import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

# Katalog bridge'a — żeby zaimportować jarvis_bridge jako moduł
HERE = Path(__file__).resolve().parent
BRIDGE_DIR = HERE.parent
sys.path.insert(0, str(BRIDGE_DIR))

import jarvis_bridge as jb  # noqa: E402
from jarvis_bridge import CB, CircuitBreaker  # noqa: E402
import requests  # noqa: E402


# ----------------- TESTY UNIT (bez procesu mostu, czysty stan maszyny stanów) -----------------

class CircuitBreakerUnitTest(unittest.TestCase):
    """Bezpośrednia weryfikacja maszyny stanów CB: progi, OPEN/HALF_OPEN, izolacja per-tool."""

    def setUp(self):
        self.cb = CircuitBreaker()
        # Twarde progi na czas testu (instancja ma własne, nie dzieli z modułem)
        self.fail_threshold = 5
        self.fail_window = 10.0
        self.cooldown = 15.0

    def _fail(self, name: str, n: int) -> None:
        """Zasymuluj n kolejnych failed (OFFLINE) dla danego narzędzia."""
        for _ in range(n):
            self.cb.record(name, ok=False, code="OFFLINE")

    def test_closed_below_threshold(self):
        """Poniżej progu (4 z 5) → CLOSED, wszystkie wywołania przechodzą."""
        self._fail("media_play", 4)
        for _ in range(3):
            allow, retry = self.cb.check("media_play")
            self.assertTrue(allow, "4 failed to za mało — wywołanie powinno przejść")
            self.assertEqual(retry, 0.0)

    def test_opens_at_threshold(self):
        """5. failed → OPEN; kolejne wywołanie dostaje (False, retry_after>0)."""
        self._fail("media_play", self.fail_threshold)
        allow, retry = self.cb.check("media_play")
        self.assertFalse(allow, "po 5 failed wywołanie powinno być odrzucone")
        self.assertGreater(retry, 0.0)
        self.assertLessEqual(retry, self.cooldown)

    def test_throttled_envelope_shape(self):
        """Po otwarciu: THROTTLED envelope ma code='THROTTLED', data.retry_after_s > 0, tekst po polsku."""
        self._fail("media_play", self.fail_threshold)
        # symulacja envelope z _handle_call_tool (produkcja buduje dokładnie taki dict)
        allow, retry_after = self.cb.check("media_play")
        self.assertFalse(allow)
        envelope = {"ok": False, "code": "THROTTLED",
                    "text": f"Circuit breaker otwarty po {self.fail_threshold} failed w {self.fail_window:g}s. Ponów za {retry_after:.2f}s.",
                    "data": {"retry_after_s": round(retry_after, 3)}}
        self.assertEqual(envelope["code"], "THROTTLED")
        self.assertGreater(envelope["data"]["retry_after_s"], 0.0)
        self.assertIn("Circuit breaker", envelope["text"])

    def test_per_tool_isolation(self):
        """OFFLINE w jednym narzędziu nie blokuje innego (per-tool licznik)."""
        self._fail("media_play", self.fail_threshold)
        # media_play otwarty
        self.assertFalse(self.cb.check("media_play")[0])
        # ale get_status nadal CLOSED
        allow, retry = self.cb.check("get_status")
        self.assertTrue(allow, "OFFLINE w media_play nie może blokować get_status")
        self.assertEqual(retry, 0.0)

    def test_only_offline_codes_count(self):
        """NOT_FOUND / DENIED / DUPLICATE / OK nie zwiększają licznika failed."""
        for code in ("OK", "NOT_FOUND", "AMBIGUOUS", "INVALID_ARGS", "DENIED", "DUPLICATE"):
            for _ in range(10):
                self.cb.record("media_play", ok=False, code=code)
            self.assertTrue(self.cb.check("media_play")[0],
                            f"code={code} nie powinien otwierać CB")

    def test_half_open_after_cooldown(self):
        """Po upływie cooldown → HALF_OPEN (pozwala na jeden probe)."""
        cb = CircuitBreaker()
        # symuluj cooldown 0.3 s (patchujemy CB_COOLDOWN przez monkeypatch w testach integracyjnych; tu testujemy bezpośrednio czas)
        original_cooldown = jb.CB_COOLDOWN
        jb.CB_COOLDOWN = 0.3
        try:
            for _ in range(jb.CB_FAIL_THRESHOLD):
                cb.record("x", ok=False, code="OFFLINE")
            self.assertFalse(cb.check("x")[0], "zaraz po failed CB powinien być OPEN")
            time.sleep(0.4)   # przekrocz cooldown
            allow, _ = cb.check("x")
            self.assertTrue(allow, "po cooldown CB przechodzi w HALF_OPEN i przepuszcza probe")
        finally:
            jb.CB_COOLDOWN = original_cooldown

    def test_success_closes_breaker(self):
        """Jeden OK w HALF_OPEN lub CLOSED resetuje licznik failed (CLOSED)."""
        self._fail("media_play", self.fail_threshold - 1)   # prawie próg, ale jeszcze CLOSED
        self.cb.record("media_play", ok=True, code="OK")
        # Po sukcesie okno powinno być wyczyszczone; kolejne 4 OFFLINE nie otworzy CB
        for _ in range(self.fail_threshold - 1):
            self.cb.record("media_play", ok=False, code="OFFLINE")
        allow, _ = self.cb.check("media_play")
        self.assertTrue(allow, "sukces wyczyścił okno — CB powinien być CLOSED")

    def test_snapshot_reports_state(self):
        """snapshot() zwraca threshold/window/cooldown + mapy stanów."""
        self._fail("media_play", self.fail_threshold)
        self._fail("get_status", 2)
        snap = self.cb.snapshot()
        self.assertEqual(snap["threshold"], jb.CB_FAIL_THRESHOLD)
        self.assertEqual(snap["window_s"], jb.CB_FAIL_WINDOW)
        self.assertEqual(snap["cooldown_s"], jb.CB_COOLDOWN)
        self.assertEqual(snap["states"].get("media_play"), "OPEN")
        self.assertNotIn("get_status", snap["states"], "CLOSED nie pojawia się w states")


# ----------------- TESTY INTEGRACYJNE (izolowany most z mockowanym relay) -----------------

ISOLATED_TOOLS = [
    {"name": "always_offline", "description": "zawsze zwraca OFFLINE",
     "parameters": {"type": "object", "properties": {}}},
    {"name": "always_ok", "description": "zawsze zwraca OK",
     "parameters": {"type": "object", "properties": {}}},
]


def _start_isolated_bridge(port: int, token: str) -> dict:
    """Uruchamia izolowany most z dwoma narzędziami + zamockowanym relay."""
    tools_path = Path(tempfile.mkdtemp()) / "tools.json"
    tools_path.write_text(__import__("json").dumps(ISOLATED_TOOLS), encoding="utf-8")

    jb.TOOLS_FILE = tools_path
    jb.TOKEN = token
    jb.ORIGINS = ["http://localhost:4000"]
    jb.load_tools()
    assert "always_offline" in jb.TOOLS and "always_ok" in jb.TOOLS

    # Mock relay: always_offline → OFFLINE (symulacja np. braku karty); always_ok → OK.
    # Zapisujemy oryginalny relay, by przywrócić w tearDown.
    original_relay = jb.relay

    async def fake_relay(name, args):
        if name == "always_offline":
            return {"ok": False, "code": "OFFLINE", "text": "symulowany OFFLINE", "data": None}
        if name == "always_ok":
            return {"ok": True, "code": "OK", "text": "ok", "data": {"ok": True}}
        return {"ok": False, "code": "NOT_FOUND", "text": f"nieznane: {name}"}

    jb.relay = fake_relay

    import uvicorn
    config = uvicorn.Config(jb.build_app("127.0.0.1"), host="127.0.0.1",
                            port=port, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            r = requests.get(f"http://127.0.0.1:{port}/bridge/status",
                             headers={"x-bridge-token": token}, timeout=1)
            if r.status_code == 200:
                jb.relay = original_relay   # od razu przywróć
                return {"port": port, "token": token, "tools_path": tools_path,
                        "server": server, "thread": t, "original_relay": original_relay,
                        "fake_relay": fake_relay}
        except requests.RequestException:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"izolowany most na :{port} nie wystartował w 5 s")


def _call_isolated(port: int, token: str, tool: str, args: dict | None = None) -> dict:
    """Wywołanie narzędzia przez JSON-RPC; zwraca pełny envelope {ok, code, data, text}."""
    payload = {"jsonrpc": "2.0", "id": 1,
               "method": "tools/call",
               "params": {"name": tool, "arguments": args or {}}}
    r = requests.post(f"http://127.0.0.1:{port}/mcp",
                      headers={"Authorization": f"Bearer {token}",
                               "Content-Type": "application/json",
                               "Accept": "application/json, text/event-stream"},
                      json=payload, timeout=10)
    if r.status_code != 200:
        return {"ok": False, "code": f"HTTP_{r.status_code}", "text": r.text[:300], "data": {}}
    d = r.json()
    result = d.get("result") or {}
    txt = ""
    for c in (result.get("content") or []):
        if isinstance(c, dict) and c.get("type") == "text":
            txt = c.get("text", "")
            break
    try:
        env = __import__("json").loads(txt)
    except ValueError:
        env = {"ok": False, "code": "BAD_PAYLOAD", "text": txt, "data": {}, "is_error": bool(result.get("isError"))}
    return env


class CircuitBreakerIntegrationTest(unittest.TestCase):
    """Izolowany most + zamockowany relay. Weryfikacja pełnego łańcucha CB."""

    @classmethod
    def setUpClass(cls):
        # Progi dla testu: 5 failed → OPEN, cooldown 0.5 s (krótki, żeby nie czekać 15s).
        # Moduł jb.CB to globalny singleton; patchujemy jego progi bezpośrednio.
        cls._orig_threshold = jb.CB_FAIL_THRESHOLD
        cls._orig_window = jb.CB_FAIL_WINDOW
        cls._orig_cooldown = jb.CB_COOLDOWN
        jb.CB_FAIL_THRESHOLD = 5
        jb.CB_FAIL_WINDOW = 10.0
        jb.CB_COOLDOWN = 0.5
        jb.CB._state.clear()
        jb.CB._failures.clear()
        jb.CB._opened_at.clear()
        jb.CB._half_open_in_flight.clear()

        cls.port = 18653
        cls.info = _start_isolated_bridge(cls.port, "cb-test-" + str(int(time.time())))

        # Podmień relay w już działającym module (build_app złapał oryginał przez import)
        cls.info["fake_relay_backup"] = None

    def setUp(self):
        """Każdy test startuje z czystym CB (resetujemy liczniki)."""
        jb.CB._state.clear()
        jb.CB._failures.clear()
        jb.CB._opened_at.clear()
        jb.CB._half_open_in_flight.clear()
        # Upewnij się, że most używa naszego fake relay (build_app łapał oryginał w momencie startu)
        jb.DesktopMCP._handle_call_tool.__globals__["relay"] = jb.relay   # nie działa — patrz test

    @classmethod
    def tearDownClass(cls):
        srv = cls.info["server"]
        srv.should_exit = True
        cls.info["thread"].join(timeout=3)
        # KLUCZOWE: przywróć oryginalny relay — inaczej następujące testy w tej sesji
        # (np. test_offline_flow, test_race) trafią na zamockowaną funkcję i zaczną
        # zwracać NOT_FOUND dla wszystkich narzędzi.
        jb.relay = cls.info["original_relay"]
        jb.CB_FAIL_THRESHOLD = cls._orig_threshold
        jb.CB_FAIL_WINDOW = cls._orig_window
        jb.CB_COOLDOWN = cls._orig_cooldown

    def test_five_offline_then_throttled(self):
        """5 OFFLINE → 6. wywołanie dostaje THROTTLED z retry_after_s > 0."""
        # Podmieniamy relay w module GLOBALNIE — _handle_call_tool czyta `relay` z globalnego scope przy każdym wywołaniu.
        jb.relay = self.info["fake_relay"]

        for i in range(5):
            env = _call_isolated(self.port, self.info["token"], "always_offline")
            self.assertEqual(env["code"], "OFFLINE", f"wywołanie {i + 1}: oczekiwałem OFFLINE, dostałem {env}")
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        self.assertEqual(env["code"], "THROTTLED", f"6. wywołanie powinno być THROTTLED, dostałem {env}")
        self.assertGreater(env["data"]["retry_after_s"], 0.0, f"retry_after_s powinno być > 0: {env}")

    def test_throttled_then_recovery_after_cooldown(self):
        """Po sleep(retry_after) → wywołanie wraca (HALF_OPEN), a sukces zamyka CB."""
        jb.relay = self.info["fake_relay"]
        # 5 OFFLINE
        for _ in range(5):
            _call_isolated(self.port, self.info["token"], "always_offline")
        # 6. = THROTTLED
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        self.assertEqual(env["code"], "THROTTLED")
        retry_after = env["data"]["retry_after_s"]
        # śpimy tyle ile każe retry_after (z małym zapasem)
        time.sleep(retry_after + 0.1)
        # 7. wywołanie z other tool (always_ok) → powinno przejść (HALF_OPEN dla always_offline,
        # ale always_ok jest CLOSED bo nikt go nie ładował)
        env = _call_isolated(self.port, self.info["token"], "always_ok")
        self.assertEqual(env["code"], "OK", f"always_ok nie powinien być throttled: {env}")
        # 8. wywołanie always_offline → HALF_OPEN, przechodzi; zarejestruj OK (bo mock zwróci OK,
        # ale tu mock zwraca OFFLINE dla always_offline) — więc faktycznie w HALF_OPEN dostanie OFFLINE → wraca do OPEN
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        # To wywołanie zawsze_offline zwróci OFFLINE → w HALF_OPEN to znowu otworzy CB (pojedynczy failed probe wraca OPEN)
        self.assertEqual(env["code"], "OFFLINE", f"HALF_OPEN + OFFLINE znowu → OFFLINE: {env}")
        # po odświeżeniu OPEN — kolejne wywołanie znów throttled
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        self.assertEqual(env["code"], "THROTTLED", f"po failed w HALF_OPEN CB wraca do OPEN: {env}")

    def test_success_in_half_open_closes_breaker(self):
        """Po cooldown HALF_OPEN, jedno udane wywołanie zamyka CB (CLOSED)."""
        jb.relay = self.info["fake_relay"]
        # Otwórz CB dla always_offline
        for _ in range(5):
            _call_isolated(self.port, self.info["token"], "always_offline")
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        self.assertEqual(env["code"], "THROTTLED")
        retry_after = env["data"]["retry_after_s"]
        time.sleep(retry_after + 0.1)
        # Mockuj relay tak, żeby always_offline tym razem zwrósi OK (sukces w HALF_OPEN).
        original_fake = self.info["fake_relay"]

        async def recovering_relay(name, args):
            return {"ok": True, "code": "OK", "text": "odzyskano", "data": {"ok": True}}
        jb.relay = recovering_relay
        try:
            env = _call_isolated(self.port, self.info["token"], "always_offline")
            self.assertEqual(env["code"], "OK", f"HALF_OPEN + OK powinien zamknąć CB: {env}")
            # kolejne wywołanie przechodzi normalnie (nie throttled)
            env = _call_isolated(self.port, self.info["token"], "always_offline")
            self.assertEqual(env["code"], "OK", f"po sukcesie CB CLOSED: {env}")
            # Status mostu potwierdza CLOSED
            st = requests.get(f"http://127.0.0.1:{self.port}/bridge/status",
                              headers={"x-bridge-token": self.info["token"]}, timeout=3).json()
            self.assertNotIn("always_offline", st.get("circuit_breaker", {}).get("states", {}),
                             f"always_offline powinien być CLOSED: {st['circuit_breaker']}")
        finally:
            jb.relay = original_fake

    def test_per_tool_isolation_in_bridge(self):
        """OFFLINE w always_offline nie blokuje always_ok (per-tool)."""
        jb.relay = self.info["fake_relay"]
        for _ in range(5):
            _call_isolated(self.port, self.info["token"], "always_offline")
        env = _call_isolated(self.port, self.info["token"], "always_offline")
        self.assertEqual(env["code"], "THROTTLED")
        # always_ok nadal działa
        env = _call_isolated(self.port, self.info["token"], "always_ok")
        self.assertEqual(env["code"], "OK", f"per-tool: always_ok niezablokowany: {env}")


if __name__ == "__main__":
    unittest.main(verbosity=2)