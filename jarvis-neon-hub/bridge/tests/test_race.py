"""Bridge race fix: handshake /bridge/wake eliminuje OFFLINE przy pierwszym MCP wywołaniu
po otwarciu karty (race window ~0.4-1.2 s zanim SSE handshake się zakończy).

Scenariusze:
  A) wake + SSE w trakcie wait  → mutacja PRZECHODZI (race fix działa)
  B) bez wake, bez klienta       → mutacja natychmiast OFFLINE (regresja: stare zachowanie dla karty, która nigdy się nie łączyła)
  C) wake, ale SSE nie pojawia się w WAKE_WAIT → mutacja zwraca OFFLINE po ~WAKE_WAIT (limit nie zabija CPU)

Każdy scenariusz ma własny izolowany most (osobny port, osobny token, pusty tools.json)
→ wzorzec z test_offline_flow.py (nie kolidujemy z :8651 głównego mostu).

NIE testujemy bezpośrednio z karty JS — symulujemy timing:
  - request_t0:    POST /bridge/wake
  - request_t1:    POST /mcp (tools/call)
  - sse_connect:   GET /bridge/events (z opóźnieniem X ms od t1)
  - oczekujemy, że t1 zwróci wynik mutacji po < WAKE_WAIT + 0.5s, o ile sse_connect nastąpił przed deadline.

PASS = exit 0 i wszystkie 3 unittesty zielone; FAIL = exit 1.
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
BRIDGE_DIR = HERE.parent
sys.path.insert(0, str(BRIDGE_DIR))

# Minimalny tools.json — nazwa 'mutate_client' musi istnieć w rejestrze (most sprawdza `if name not in TOOLS`).
# Drugie narzędzie 'read_only' nie wymaga klienta SSE.
MINIMAL_TOOLS = [
    {
        "name": "mutate_client",
        "description": "mutacja wymaga klienta SSE",
        "parameters": {"type": "object", "properties": {"payload": {"type": "string"}}},
    },
    {
        "name": "read_only",
        "description": "read-only, nie wymaga klienta",
        "parameters": {"type": "object", "properties": {}},
    },
]


def _start_isolated_bridge(port: int, token: str) -> dict:
    """Uruchamia drugą instancję jarvis_bridge.py na wskazanym porcie.

    Zwraca dict z proc/port/token/tools_path. Most działa w tle (daemon thread).
    Wzorzec z test_offline_flow.py.
    """
    import jarvis_bridge as jb  # type: ignore

    tools_path = Path(tempfile.mkdtemp()) / "tools.json"
    tools_path.write_text(json.dumps(MINIMAL_TOOLS), encoding="utf-8")

    jb.TOOLS_FILE = tools_path
    jb.TOKEN = token
    jb.ORIGINS = ["http://localhost:4000"]
    jb.load_tools()
    assert "mutate_client" in jb.TOOLS, "nie załadowałem mutate_client do izolowanego mostu"
    # wyczyść stan race-fix z poprzedniego testu (moduł trzymany w pamięci)
    jb.CLIENTS.clear()
    jb._reset_wake_for_tests()

    import uvicorn
    config = uvicorn.Config(jb.build_app("127.0.0.1"), host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            r = requests.get(f"http://127.0.0.1:{port}/bridge/status", headers={"x-bridge-token": token}, timeout=1)
            if r.status_code == 200 and r.json().get("clients") == 0:
                return {"port": port, "token": token, "tools_path": tools_path, "server": server, "thread": t}
        except requests.RequestException:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"izolowany most na :{port} nie wystartował w 5 s")


def _call_mutation(port: int, token: str, tool: str = "mutate_client", payload: str = "hi") -> tuple[requests.Response, float]:
    """Wywołanie izolowanego mostu (POST /mcp z JSON-RPC tools/call). Zwraca (response, elapsed_s)."""
    body = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
            "params": {"name": tool, "arguments": {"payload": payload}}}
    t0 = time.time()
    r = requests.post(
        f"http://127.0.0.1:{port}/mcp",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json",
                 "Accept": "application/json, text/event-stream"},
        json=body,
        timeout=20,   # > WAKE_WAIT (4 s od t_93ab5e70) + margines na SSE + odpowiedź
    )
    return r, time.time() - t0


def _post_wake(port: int, token: str) -> requests.Response:
    return requests.post(f"http://127.0.0.1:{port}/bridge/wake",
                         headers={"x-bridge-token": token, "Content-Type": "application/json"},
                         json={}, timeout=3)


def _open_sse_after(port: int, token: str, delay_s: float, result_text: str = "ok"):
    """Po `delay_s` otwiera SSE i czeka na pierwsze polecenie; odpowiada z result_text.

    Zwraca thread (daemon). Symuluje opóźnienie handshake z karty.
    """
    import aiohttp

    async def run():
        await asyncio.sleep(delay_s)   # noqa: F821 — import wewnątrz
        async with aiohttp.ClientSession() as s:
            try:
                async with s.get(f"http://127.0.0.1:{port}/bridge/events?token={token}",
                                 headers={"Origin": "http://localhost:4000"}) as r:
                    event = None
                    async for raw in r.content:
                        line = raw.decode().rstrip("\n")
                        if line.startswith("event:"):
                            event = line[6:].strip()
                        elif line.startswith("data:") and event == "cmd":
                            cmd = json.loads(line[5:])
                            await s.post(f"http://127.0.0.1:{port}/bridge/result",
                                         json={"id": cmd["id"], "ok": True, "text": result_text},
                                         headers={"X-Bridge-Token": token})
                            return
            except Exception:
                return

    import asyncio
    t = threading.Thread(target=lambda: asyncio.run(run()), daemon=True)
    t.start()
    return t


class RaceFixTest(unittest.TestCase):
    """Weryfikacja race-fix: wake handshake eliminuje OFFLINE przy pierwszym MCP wywołaniu."""

    @classmethod
    def setUpClass(cls):
        # każdy scenariusz dostanie własny port; tu tylko baseline check
        cls.main_preflight = None

    def setUp(self):
        # każdy test ma własny izolowany most (oddzielny port/token)
        self.port = 18760 + (int(time.time() * 1000) % 100)   # unikalny port per test
        self.token = "race-test-" + str(int(time.time() * 1000))
        self.info = _start_isolated_bridge(self.port, self.token)

    def tearDown(self):
        srv = self.info["server"]
        srv.should_exit = True
        self.info["thread"].join(timeout=3)

    # ----------------------------------------------------------------- A: race fix działa
    def test_A_wake_then_sse_during_wait_succeeds(self):
        """POST /bridge/wake + mutacja + SSE w trakcie 2s wait → mutacja PRZECHODZI."""
        # 1) karta wysyła handshake (PWA-side: js/bridge.js reportWake() tuż po załadowaniu modułu)
        r = _post_wake(self.port, self.token)
        self.assertEqual(r.status_code, 200, f"wake nie 200: {r.status_code} {r.text[:200]}")
        self.assertTrue(r.json().get("ok"))

        # 2) karta startuje SSE z opóźnieniem 600 ms (symulacja: setTimeout(connect, 600) w js/bridge.js)
        #    między wake a SSE — most dostał handshake, więc relay() czeka na klienta
        _open_sse_after(self.port, self.token, delay_s=0.6, result_text="mutation ok")

        # 3) Hermes natychmiast po otwarciu karty wywołuje MCP — powinno przejść po pojawieniu się SSE
        t0 = time.time()
        r, elapsed = _call_mutation(self.port, self.token, payload="race-test-A")
        # wynik mutacji zwrócony przez relay() → narzędzie w TOOLS (nie wymaga wykonania przez kartę,
        # ale relay() z toolem „mutate_client" czeka na wynik z przeglądarki; bridge ma tylko pusty rejestr,
        # więc faktycznie narzędzie przejdzie przez relay → SSE → kartę → result)
        self.assertEqual(r.status_code, 200, f"mcp nie 200: {r.status_code} {r.text[:200]}")

        # Sprawdź czas: powinno zadziałać w ok. 0.6-1.5 s (SSE po 600 ms + relay wait + handshake)
        # Bez fix → natychmiast OFFLINE. Z fix → czeka na SSE.
        self.assertLess(elapsed, 2.5, f"trwało za długo ({elapsed:.2f}s) — race fix nie zadziałał?")
        self.assertGreater(elapsed, 0.3, f"zwrócono za szybko ({elapsed:.2f}s) — pewnie bez czekania")

        # Sprawdź zawartość odpowiedzi
        d = r.json()
        result = d.get("result") or {}
        content = result.get("content") or []
        text = next((c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"), "")
        try:
            payload = json.loads(text) if text else {}
        except ValueError:
            payload = {}
        # karta odpowiedziała 'mutation ok' przez /bridge/result → relay() dostał ok=True
        self.assertTrue(payload.get("ok") is True, f"oczekiwałem ok=True, payload={payload}")
        self.assertEqual(payload.get("text"), "mutation ok", f"text: {payload.get('text')}")

    # ----------------------------------------------------------------- B: bez wake → OFFLINE natychmiast (regresja off-flow)
    def test_B_no_wake_no_client_returns_offline_immediately(self):
        """Bez /bridge/wake i bez SSE → mutacja zwraca OFFLINE szybko (sprawdza że
        test_offline_flow.py nie jest złamany: brak handshake = brak czekania).
        """
        # upewnij się że wake nie było
        r = requests.get(f"http://127.0.0.1:{self.port}/bridge/status",
                         headers={"x-bridge-token": self.token}, timeout=2)
        d = r.json()
        self.assertFalse(d.get("wake", {}).get("valid", False),
                         f"wake nie powinno być valid na świeżym moście: {d.get('wake')}")

        t0 = time.time()
        r, elapsed = _call_mutation(self.port, self.token, payload="race-test-B")
        self.assertEqual(r.status_code, 200, f"mcp nie 200: {r.status_code}")   # JSON-RPC zwraca 200 + isError

        d = r.json()
        result = d.get("result") or {}
        self.assertTrue(result.get("isError"), f"oczekiwałem isError=True, mam {result}")
        content = result.get("content") or []
        text = next((c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"), "")
        self.assertIn("nie jest połączony", text.lower(),
                      f"tekst błędu nie zawiera 'nie jest połączony': {text[:200]}")

        # Bez handshake → natychmiast OFFLINE, < 500 ms (nie czekamy 2 s na nikogo)
        self.assertLess(elapsed, 0.5, f"OFFLINE powinien być natychmiast (bez wake), trwało {elapsed:.2f}s")

    # ----------------------------------------------------------------- C: wake ale SSE nie pojawia się → OFFLINE po WAKE_WAIT
    def test_C_wake_but_no_sse_returns_offline_after_wait(self):
        """/bridge/wake bez SSE w oknie WAKE_WAIT → OFFLINE po ~WAKE_WAIT (limit czasu, nie czeka w nieskończoność)."""
        r = _post_wake(self.port, self.token)
        self.assertEqual(r.status_code, 200)

        # NIE otwieramy SSE — karta zgłosiła się ale nie dokończyła handshake (np. crash / błąd JS)
        t0 = time.time()
        r, elapsed = _call_mutation(self.port, self.token, payload="race-test-C")
        self.assertEqual(r.status_code, 200)

        d = r.json()
        result = d.get("result") or {}
        self.assertTrue(result.get("isError"), f"oczekiwałem isError=True: {result}")
        content = result.get("content") or []
        text = next((c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"), "")
        self.assertIn("nie jest połączony", text.lower(), f"tekst: {text[:200]}")

        # Czekał ~WAKE_WAIT (wartość z kodu mostu, nie na sztywno), nie natychmiast (jak B) i nie dłużej niż WAKE_WAIT+1s
        import jarvis_bridge as jb  # type: ignore
        self.assertGreater(elapsed, jb.WAKE_WAIT - 0.5, f"OFFLINE powinien przyjść po ~WAKE_WAIT ({jb.WAKE_WAIT}s), trwało {elapsed:.2f}s")
        self.assertLess(elapsed, jb.WAKE_WAIT + 1.0, f"OFFLINE nie powinien czekać dłużej niż WAKE_WAIT+1s, trwało {elapsed:.2f}s")


if __name__ == "__main__":
    # verbose, bez unittest.main() żeby wyjście było ładniejsze
    import unittest as _u
    runner = _u.TextTestRunner(verbosity=2)
    suite = _u.defaultTestLoader.loadTestsFromTestCase(RaceFixTest)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
