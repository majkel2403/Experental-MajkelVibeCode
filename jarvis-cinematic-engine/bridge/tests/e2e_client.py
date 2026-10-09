"""Wspólny klient E2E: pre-flight, JSON-RPC do /mcp, autoryzacja tokenem mostu.

Zaprojektowany do unittest, ale bez zależności — wystarczy stdlib + requests.
Każdy wynik narzędzia zwraca jako `Result(ok, code, data, text, raw)` —
dokładnie tak jak definiuje `BridgeRelay` (jarvis_bridge.py:84).
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import requests

BRIDGE_HOST = os.environ.get("JARVIS_BRIDGE_HOST", "127.0.0.1")
BRIDGE_PORT = int(os.environ.get("JARVIS_BRIDGE_PORT", "8651"))
PWA_URL = os.environ.get("JARVIS_PWA_URL", "http://localhost:4000")
TOKEN_PATH = Path(os.environ.get("JARVIS_BRIDGE_TOKEN_FILE")
                  or Path.home() / ".jarvis-os" / "bridge-token")
# Izolowany most na potrzeby testu OFFLINE (osobny port, własny token, pusty tools.json).
OFFLINE_PORT = int(os.environ.get("JARVIS_OFFLINE_BRIDGE_PORT", "18652"))


def load_token(path: Path = TOKEN_PATH) -> str:
    if not path.exists():
        raise RuntimeError(f"Brak pliku tokenu mostu: {path}. Uruchom most: "
                           "python bridge/jarvis_bridge.py --show-token")
    t = path.read_text(encoding="utf-8").strip()
    if not t:
        raise RuntimeError(f"Token mostu w {path} jest pusty.")
    return t


@dataclass
class PreFlight:
    bridge_alive: bool
    pwa_http: int
    pwa_ok: bool
    ws_clients: int
    elapsed_ms: int

    def ok(self, require_clients: bool = True) -> bool:
        if not self.bridge_alive or not self.pwa_ok:
            return False
        if require_clients and self.ws_clients < 1:
            return False
        return True

    def summary(self) -> str:
        return (f"bridge={'up' if self.bridge_alive else 'DOWN'} "
                f"pwa=http{self.pwa_http} ws_clients={self.ws_clients} "
                f"({self.elapsed_ms} ms)")


def preflight(host: str = BRIDGE_HOST, port: int = BRIDGE_PORT,
              pwa: str = PWA_URL, token: Optional[str] = None,
              timeout: float = 3.0) -> PreFlight:
    """Trzy kontrole: most /health-like, PWA HTTP 200, bridge /bridge/status → clients≥1."""
    t0 = time.time()
    if token is None:
        try:
            token = load_token()
        except RuntimeError:
            return PreFlight(False, 0, False, 0, int((time.time() - t0) * 1000))
    bridge_alive = False
    ws_clients = 0
    try:
        r = requests.get(f"http://{host}:{port}/bridge/status",
                         headers={"x-bridge-token": token}, timeout=timeout)
        if r.status_code == 200:
            d = r.json()
            bridge_alive = bool(d.get("ok"))
            ws_clients = int(d.get("clients", 0))
    except requests.RequestException:
        pass
    pwa_http = 0
    pwa_ok = False
    try:
        r = requests.get(pwa, timeout=timeout)
        pwa_http = r.status_code
        pwa_ok = r.status_code == 200
    except requests.RequestException:
        pass
    return PreFlight(bridge_alive, pwa_http, pwa_ok, ws_clients,
                     int((time.time() - t0) * 1000))


@dataclass
class Result:
    """Wynik jednego wywołania JSON-RPC tools/call."""
    ok: bool
    code: str
    data: Any
    text: str
    raw: dict
    elapsed_ms: int

    def __bool__(self) -> bool:
        return self.ok


class MCPClient:
    """Minimalny klient JSON-RPC streamable HTTP dla mostu MCP."""

    def __init__(self, host: str = BRIDGE_HOST, port: int = BRIDGE_PORT,
                 token: Optional[str] = None, timeout: float = 90.0):
        self.host = host
        self.port = port
        self.url = f"http://{host}:{port}/mcp"
        self.token = token or load_token()
        self.timeout = timeout
        self.req_id = 0

    def call(self, tool: str, args: Optional[dict] = None,
             timeout: Optional[float] = None) -> Result:
        """Wywołaj narzędzie; Result.ok True tylko gdy code=='OK' i brak isError."""
        self.req_id += 1
        payload = {"jsonrpc": "2.0", "id": self.req_id,
                   "method": "tools/call",
                   "params": {"name": tool, "arguments": args or {}}}
        t0 = time.time()
        try:
            r = requests.post(
                self.url,
                headers={"Authorization": f"Bearer {self.token}", "X-Jarvis-Quiet": "1",
                         "Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream"},
                json=payload,
                timeout=timeout or self.timeout,
            )
        except requests.RequestException as e:
            return Result(False, "TRANSPORT", None, str(e), {}, int((time.time() - t0) * 1000))
        elapsed = int((time.time() - t0) * 1000)
        try:
            d = r.json()
        except ValueError:
            return Result(False, "BAD_JSON", None, r.text[:300],
                          {"http_status": r.status_code}, elapsed)
        if "error" in d:
            return Result(False, "JSONRPC_ERROR", None,
                          str(d["error"]), d, elapsed)
        result = d.get("result") or {}
        if result.get("isError"):
            txt = self._first_text(result)
            return Result(False, "TOOL_ERROR", None, txt, result, elapsed)
        text = self._first_text(result)
        try:
            payload = json.loads(text)
        except (ValueError, TypeError):
            payload = {"ok": False, "code": "BAD_PAYLOAD", "text": text}
        return Result(payload.get("ok", False),
                      payload.get("code", "UNKNOWN"),
                      payload.get("data"),
                      payload.get("text", ""),
                      result,
                      elapsed)

    @staticmethod
    def _first_text(result: dict) -> str:
        content = result.get("content") or []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                return c.get("text", "")
        return ""


# kolory ANSI (auto-wyłączane gdy brak TTY)
def _ansi(code: str) -> str:
    if not sys.stdout.isatty():
        return ""
    return code


GREEN = _ansi("\033[32m")
RED = _ansi("\033[31m")
YELLOW = _ansi("\033[33m")
DIM = _ansi("\033[2m")
RESET = _ansi("\033[0m")


def colored_pass() -> str:
    return f"{GREEN}PASS{RESET}" if GREEN else "PASS"


def colored_fail() -> str:
    return f"{RED}FAIL{RESET}" if RED else "FAIL"


def colored_skip() -> str:
    return f"{YELLOW}SKIP{RESET}" if YELLOW else "SKIP"
