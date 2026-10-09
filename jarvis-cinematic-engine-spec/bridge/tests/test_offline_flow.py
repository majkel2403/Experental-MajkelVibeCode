"""Test offline-flow: most bez klienta SSE → mutacja → OFFLINE.

Wystawiamy własną instancję jarvis_bridge.py na :18652 z:
- osobnym tokenem (wygenerowanym lokalnie)
- narzędziem 'get_status' (read-only, nie wymaga klienta)
- narzędziem 'create_note' (wymaga klienta; bez SSE → ToolError)

Każde wywołanie mutacji na izolowanym moście zwróci isError=True z tekstem
zaczynającym się od 'Jarvis OS nie jest połączony z mostem'.

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

from e2e_client import Result, preflight  # noqa: E402


# Minimalny tools.json — wystarczy, że nazwa 'create_note' istnieje w rejestrze
# (mutacja wykonywana przez bridge.py sprawdza tylko `if name not in TOOLS`).
MINIMAL_TOOLS = [
    {
        "name": "create_note",
        "description": "mutacja bez klienta",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_status",
        "description": "read-only",
        "parameters": {"type": "object", "properties": {}},
    },
]


def _start_isolated_bridge(port: int, token: str) -> dict:
    """Uruchamia drugą instancję jarvis_bridge.py na wskazanym porcie.

    Zwraca dict z proc/port/token/tools_path. Most działa w tle (daemon thread).
    """
    import jarvis_bridge as jb  # type: ignore

    tools_path = Path(tempfile.mkdtemp()) / "tools.json"
    tools_path.write_text(__import__("json").dumps(MINIMAL_TOOLS), encoding="utf-8")

    # nadpisz stan mostu na potrzeby tego procesu
    jb.TOOLS_FILE = tools_path
    jb.TOKEN = token
    jb.ORIGINS = ["http://localhost:4000"]
    jb.load_tools()
    assert "create_note" in jb.TOOLS, "nie załadowałem create_note do izolowanego mostu"

    import uvicorn
    config = uvicorn.Config(jb.build_app("127.0.0.1"), host="127.0.0.1",
                            port=port, log_level="error")
    server = uvicorn.Server(config)
    t = threading.Thread(target=server.run, daemon=True)
    t.start()

    # czekamy aż most wstanie (do 5 s)
    import requests
    deadline = time.time() + 5
    while time.time() < deadline:
        try:
            r = requests.get(f"http://127.0.0.1:{port}/bridge/status",
                             headers={"x-bridge-token": token}, timeout=1)
            if r.status_code == 200 and r.json().get("clients") == 0:
                return {"port": port, "token": token, "tools_path": tools_path,
                        "server": server, "thread": t}
        except requests.RequestException:
            pass
        time.sleep(0.1)
    raise RuntimeError(f"izolowany most na :{port} nie wystartował w 5 s")


class OfflineFlowTest(unittest.TestCase):
    """Weryfikacja, że most bez klienta zwraca OFFLINE/ToolError przy mutacji."""

    @classmethod
    def setUpClass(cls):
        # mimo wszystko sprawdź główny most (logi, spójność)
        cls.pf_main = preflight()
        # nie wymagamy klienta w głównym moście — testujemy izolowaną instancję

        # izolowany most na :18652 z własnym tokenem
        cls.port = 18652
        cls.token = "offline-test-" + str(int(time.time()))
        cls.info = _start_isolated_bridge(cls.port, cls.token)

    @classmethod
    def tearDownClass(cls):
        srv = cls.info["server"]
        srv.should_exit = True
        # chwila na zamknięcie serwera (uvicorn ma własny loop)
        cls.info["thread"].join(timeout=3)

    def _call(self, tool: str, args: dict | None = None) -> Result:
        """Wywołanie izolowanego mostu (bez klienta SSE)."""
        import requests as rq
        self.assertTrue(hasattr(self, "token"))
        payload = {"jsonrpc": "2.0", "id": 1,
                   "method": "tools/call",
                   "params": {"name": tool, "arguments": args or {}}}
        t0 = time.time()
        try:
            r = rq.post(
                f"http://127.0.0.1:{self.port}/mcp",
                headers={"Authorization": f"Bearer {self.token}",
                         "Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream"},
                json=payload,
                timeout=15,
            )
        except rq.RequestException as e:
            return Result(False, "TRANSPORT", None, str(e), {},
                          int((time.time() - t0) * 1000))
        elapsed = int((time.time() - t0) * 1000)
        try:
            d = r.json()
        except ValueError:
            return Result(False, "BAD_JSON", None, r.text[:300], {"http": r.status_code}, elapsed)
        result = d.get("result") or {}
        if result.get("isError"):
            content = result.get("content") or []
            txt = ""
            for c in content:
                if isinstance(c, dict) and c.get("type") == "text":
                    txt = c.get("text", "")
                    break
            return Result(False, "TOOL_ERROR", None, txt, result, elapsed)
        # odpowiedź OK (np. read-only narzędzie, które nie wymaga klienta)
        text = ""
        for c in (result.get("content") or []):
            if isinstance(c, dict) and c.get("type") == "text":
                text = c.get("text", "")
                break
        try:
            payload2 = __import__("json").loads(text) if text else {}
        except ValueError:
            payload2 = {}
        return Result(payload2.get("ok", True), payload2.get("code", "OK"),
                      payload2.get("data"), payload2.get("text", text),
                      result, elapsed)

    def test_isolated_bridge_has_no_clients(self):
        """Most izolowany ma 0 klientów SSE (nikt go nie subskrybuje)."""
        import requests
        r = requests.get(f"http://127.0.0.1:{self.port}/bridge/status",
                         headers={"x-bridge-token": self.token}, timeout=3)
        self.assertEqual(r.status_code, 200)
        d = r.json()
        self.assertEqual(d.get("clients"), 0,
                         f"izolowany most powinien mieć 0 klientów, ma {d.get('clients')}")

    def test_mutation_returns_offline_error(self):
        """Mutacja create_note bez klienta → isError z 'nie jest połączony z mostem'."""
        r = self._call("create_note", {"title": "offline test", "content": "x"})
        self.assertFalse(r.ok,
                         f"mutacja bez klienta NIE powinna zwrócić ok=True; "
                         f"dostałem code={r.code} text={r.text[:200]}")
        # ToolError zamienia się w JSON-RPC isError=true z code='TOOL_ERROR'
        self.assertEqual(r.code, "TOOL_ERROR",
                         f"oczekiwałem TOOL_ERROR, dostałem {r.code}")
        self.assertIn("nie jest połączony", r.text.lower(),
                      f"tekst błędu nie zawiera 'nie jest połączony': {r.text[:200]}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
