"""Jarvis OS <-> Hermes: most MCP (streamable HTTP) i kanał SSE do przeglądarki.

Hermes (Agent) wywołuje narzędzia `mcp__jarvis_desktop__*` -> most przekazuje polecenie
do otwartej karty Jarvis OS (SSE /bridge/events) -> przeglądarka wykonuje je i odsyła
wynik (POST /bridge/result) -> wynik wraca do Hermesa jako wynik narzędzia.

Uruchamiaj środowiskiem Hermesa (ma mcp, starlette, uvicorn):
  %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe bridge\\jarvis_bridge.py
"""
from __future__ import annotations

import argparse
import asyncio
import atexit
import contextvars
import json
import os
import re
import secrets
import sys
import time
import uuid
from collections import deque
from pathlib import Path
from threading import Lock
from typing import Optional
from urllib.parse import quote

import agents as agents_mod   # bridge/agents.py: agent WWW i sterowanie komputerem
import writer_proxy           # bridge/writer_proxy.py: model pomocniczy (darmowe modele → Hermes)
import system_info            # bridge/system_info.py: stan komputera tylko do odczytu (dysk, RAM, procesor, procesy)
import day_history            # bridge/day_history.py: dziennik zadań Hermesa na dysku („Film dnia”)
import uvicorn
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, TextContent, Tool
from starlette.requests import Request
from starlette.responses import JSONResponse, Response, StreamingResponse

DEFAULT_ORIGINS = ["http://localhost:4000", "http://127.0.0.1:4000", "https://majkel2403.github.io"]
# /bridge/pair oddaje token tylko originom lokalnym. Strona z GitHub Pages ma CORS (ORIGINS), ale token
# wkleja się tam raz ręcznie: origin Pages jest wspólny dla wszystkich repozytoriów użytkownika, więc
# automatyczne oddanie tokenu dałoby kontrolę nad komputerem każdej stronie na tej domenie.
PAIR_ORIGINS = ["http://localhost:4000", "http://127.0.0.1:4000"]
# Ochrona przed DNS rebinding; ustawiane w main() z faktycznego portu.
# Puste = bez sprawdzania, bo testy startują build_app() bez main(), na portach losowych.
ALLOWED_HOSTS: set[str] = set()
CALL_TIMEOUT = float(os.environ.get("JARVIS_BRIDGE_CALL_TIMEOUT", "90"))   # zapas na potwierdzenie użytkownika (Tak / Nie)
QUIET: contextvars.ContextVar[bool] = contextvars.ContextVar("jarvis_quiet", default=False)   # polecenie z testów E2E (X-Jarvis-Quiet: 1)

# Circuit breaker (per-tool). Chroni przed pętlą OFFLINE/INTERNAL/TIMEOUT: po N failed w T sekundach
# kolejne wywołanie danego narzędzia dostaje jawny {code:"THROTTLED", retry_after_s} zamiast cichego odrzucenia.
# Stan globalny: licznik per-tool; OPEN/HALF_OPEN dotyczy jednego narzędzia, nie całego mostu.
CB_FAIL_THRESHOLD = int(os.environ.get("JARVIS_BRIDGE_CB_FAIL_THRESHOLD", "5"))   # N failed → OPEN
CB_FAIL_WINDOW = float(os.environ.get("JARVIS_BRIDGE_CB_FAIL_WINDOW", "10"))      # okno czasowe (s)
CB_COOLDOWN = float(os.environ.get("JARVIS_BRIDGE_CB_COOLDOWN", "15"))            # pauza przed HALF_OPEN (s)
CB_FAILURE_CODES = {"OFFLINE", "INTERNAL", "TIMEOUT"}                             # kody zliczane jako failed


class CircuitBreaker:
    """Trzy stany na narzędzie: CLOSED (normalny) → OPEN (odrzuca z retry_after_s) → HALF_OPEN (jeden dozwolony
    probe) → CLOSED po sukcesie / OPEN po failed. Progi: CB_FAIL_THRESHOLD failed w CB_FAIL_WINDOW sekund."""

    __slots__ = ("_state", "_lock", "_failures", "_opened_at", "_half_open_in_flight")

    def __init__(self) -> None:
        self._state: dict[str, str] = {}                     # name → "CLOSED" | "OPEN" | "HALF_OPEN"
        self._lock = Lock()
        self._failures: dict[str, deque[float]] = {}        # name → ts ostatnich failed
        self._opened_at: dict[str, float] = {}              # name → ts wejścia w OPEN
        self._half_open_in_flight: set[str] = set()         # nazwy z aktywnym HALF_OPEN probe

    def _now(self) -> float:
        return time.monotonic()

    def check(self, name: str) -> tuple[bool, float]:
        """Zwraca (allow, retry_after_s). allow=True = wywołanie przechodzi; False = throttled z retry_after_s."""
        with self._lock:
            state = self._state.get(name, "CLOSED")
            if state == "CLOSED":
                return True, 0.0
            if state == "OPEN":
                opened = self._opened_at.get(name, 0.0)
                retry_after = CB_COOLDOWN - (self._now() - opened)
                if retry_after <= 0:
                    # Cooldown minął → HALF_OPEN (dopuszczamy jeden probe)
                    self._state[name] = "HALF_OPEN"
                    self._half_open_in_flight.add(name)
                    return True, 0.0
                return False, retry_after
            # HALF_OPEN: tylko jeden probe naraz (limit poniżej)
            if name in self._half_open_in_flight:
                return False, 1.0
            self._half_open_in_flight.add(name)
            return True, 0.0

    def record(self, name: str, ok: bool, code: Optional[str]) -> None:
        """Rejestruj wynik wywołania. PO ok == False i kodzie w CB_FAILURE_CODES → +1 failed; OPEN jeśli próg."""
        with self._lock:
            state = self._state.get(name, "CLOSED")
            if ok:
                # Sukces resetuje stan (nawet w HALF_OPEN)
                self._state[name] = "CLOSED"
                self._failures.pop(name, None)
                self._opened_at.pop(name, None)
                self._half_open_in_flight.discard(name)
                return
            if code not in CB_FAILURE_CODES:
                # NOT_FOUND/INVALID_ARGS/DENIED to nie awaria mostu — nie zwiększamy licznika
                self._half_open_in_flight.discard(name)
                return
            if state == "HALF_OPEN":
                # Probe się nie powiódł → wracamy do OPEN z odświeżonym opened_at
                self._state[name] = "OPEN"
                self._opened_at[name] = self._now()
                self._half_open_in_flight.discard(name)
                return
            # CLOSED: dodaj do sliding window
            dq = self._failures.setdefault(name, deque())
            now = self._now()
            dq.append(now)
            cutoff = now - CB_FAIL_WINDOW
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= CB_FAIL_THRESHOLD:
                self._state[name] = "OPEN"
                self._opened_at[name] = now

    def release(self, name: str) -> None:
        """Wywołanie skończyło się bez werdyktu (CancelledError, nieprzewidziany wyjątek): zwolnij probe HALF_OPEN.
        Bez tego narzędzie zostawało THROTTLED na zawsze (flaga in-flight nigdy nie schodziła). Po record() to no-op."""
        with self._lock:
            self._half_open_in_flight.discard(name)
            if self._state.get(name) == "HALF_OPEN":
                self._state[name] = "OPEN"
                self._opened_at[name] = self._now() - CB_COOLDOWN   # następny check od razu dopuści nowy probe

    def snapshot(self) -> dict:
        """Stan do diagnostyki: ile narzędzi jest OPEN/HALF_OPEN i których."""
        with self._lock:
            return {
                "threshold": CB_FAIL_THRESHOLD,
                "window_s": CB_FAIL_WINDOW,
                "cooldown_s": CB_COOLDOWN,
                "states": {n: s for n, s in self._state.items() if s != "CLOSED"},
                "failures": {n: len(d) for n, d in self._failures.items()},
            }


CB = CircuitBreaker()


def token_path() -> Path:
    return Path(os.environ.get("JARVIS_BRIDGE_TOKEN_FILE") or Path.home() / ".jarvis-os" / "bridge-token")


def load_token() -> str:
    env = os.environ.get("JARVIS_BRIDGE_TOKEN", "").strip()
    if env:
        return env
    p = token_path()
    if p.exists() and p.read_text(encoding="utf-8").strip():
        return p.read_text(encoding="utf-8").strip()
    p.parent.mkdir(parents=True, exist_ok=True)
    t = secrets.token_urlsafe(24)
    p.write_text(t, encoding="utf-8")
    try:
        os.chmod(p, 0o600)
    except OSError:
        pass
    return t


TOKEN = ""
ORIGINS: list[str] = []


class Browser:
    """Jedna otwarta karta Jarvis OS podłączona przez SSE."""

    def __init__(self) -> None:
        self.id = uuid.uuid4().hex[:8]
        self.queue: asyncio.Queue = asyncio.Queue()
        self.since = time.time()
        self.visible = False      # karta zgłasza, czy jest widoczna/aktywna
        self.focus_ts = 0.0


CLIENTS: dict[str, Browser] = {}
PENDING: dict[str, tuple[asyncio.Future, str]] = {}
HERMES_SEEN: dict[str, float] = {}   # nazwa profilu Hermesa (nagłówek X-Jarvis-Profile) -> ostatnie żądanie /mcp
# Wake handshake: karta zgłasza POST /bridge/wake gdy tylko zaczyna się ładować (przed SSE). Most ma wtedy 3 s na
# pojawienie się SSE handshake zamiast natychmiast zwracać OFFLINE. Bez tego pierwsze wywołanie MCP po otwarciu karty
# przegrywa wyścig (~0.4–1.2 s) i daje fałszywy OFFLINE. Token mostu -> czas ostatniego /bridge/wake.
WAKE: dict[str, float] = {}
WAKE_TTL = 3.0
WAKE_WAIT = 2.0   # ile relay() czeka na klienta gdy wake świeży


_WAKE_EVENT: Optional[asyncio.Event] = None
_WAKE_LOOP: Optional[asyncio.AbstractEventLoop] = None


def _wake_event() -> asyncio.Event:
    """Wspólny Event „pojawił się klient”, tworzony leniwie w bieżącym event loopie.

    Stały globalny Event w module jest powiązany z pętlą, w której go utworzono — w testach
    izolowany most działa na własnej pętli i `await event.wait()` rzuca `bound to different event loop`.
    Dlatego Event jest odtwarzany, gdy zmieni się pętla; w obrębie jednej pętli set()/wait() dzielą ten sam obiekt.
    """
    global _WAKE_EVENT, _WAKE_LOOP
    loop = asyncio.get_running_loop()
    if _WAKE_EVENT is None or _WAKE_LOOP is not loop:
        _WAKE_EVENT, _WAKE_LOOP = asyncio.Event(), loop
    return _WAKE_EVENT


def _reset_wake_for_tests() -> None:
    """Czysty stan handshake'u wake między testami (izolowany most w bridge/tests/test_race.py)."""
    global _WAKE_EVENT, _WAKE_LOOP
    WAKE.clear()
    _WAKE_EVENT = _WAKE_LOOP = None


def newest() -> Optional[Browser]:
    """Karta docelowa: widoczna > ostatnio aktywna > najnowsza (kilka kart nie miesza poleceń)."""
    return max(CLIENTS.values(), key=lambda c: (c.visible, c.focus_ts, c.since)) if CLIENTS else None


async def relay(name: str, args: dict, timeout: float | None = None) -> dict:
    """Wyślij polecenie do przeglądarki i poczekaj na wynik.

    Race fix: jeśli brak klienta SSE, ale karta właśnie wysłała /bridge/wake (PWA-side handshake),
    czekaj krótko (do WAKE_WAIT) na zakończenie SSE handshake zamiast natychmiast rzucać OFFLINE.
    Bez handshake → natychmiast OFFLINE (karta dawno zamknięta, narzędzie musi zgłosić błąd od razu).
    """
    client = newest()
    if client is None:
        last_wake = WAKE.get(TOKEN, 0.0)
        if time.time() - last_wake < WAKE_TTL:
            deadline = time.time() + WAKE_WAIT
            while time.time() < deadline:
                if time.time() - last_wake >= WAKE_TTL:
                    break
                client = newest()
                if client is not None:
                    break
                try:
                    await asyncio.wait_for(_wake_event().wait(), min(0.1, deadline - time.time()))
                except asyncio.TimeoutError:
                    pass
                _wake_event().clear()
            client = newest()
        if client is None:
            raise ToolError("Jarvis OS nie jest połączony z mostem — użytkownik musi mieć otwartą kartę Jarvis OS (np. http://localhost:4000) z włączonym mostem w Ustawieniach.")
    cid = uuid.uuid4().hex[:12]
    fut: asyncio.Future = asyncio.get_running_loop().create_future()
    PENDING[cid] = (fut, client.id)
    await client.queue.put({"id": cid, "name": name, "args": {k: v for k, v in args.items() if v is not None}, **({"quiet": True} if QUIET.get() else {})})
    if client.id not in CLIENTS and not fut.done():   # karta rozłączyła się między newest() a put — sprzątanie SSE już przeleciało, nikt by nie rozstrzygnął fut (czekanie pełne 90 s)
        fut.set_result({"ok": False, "code": "OFFLINE", "text": "Połączenie z kartą Jarvis OS zostało utracone w trakcie polecenia."})
    try:
        res = await asyncio.wait_for(fut, timeout or CALL_TIMEOUT)
    except asyncio.TimeoutError:
        raise ToolError(f"Przeglądarka nie odpowiedziała w {timeout or CALL_TIMEOUT:.0f} s (karta uśpiona, zablokowana albo brak zgody użytkownika).")
    finally:
        PENDING.pop(cid, None)
    return res


# -------------------- media_play / media_control (most-owned, bez karty) --------------------
# Te dwa narzędzia nie potrzebują karty Jarvis OS (SSE) — działają przez WebAgent (osobny Chromium agenta Jeva).
# Dlatego NIE idą przez relay() i NIE rzucają OFFLINE gdy karta jest zamknięta (typowy przypadek: user na Telegramie
# bez otwartej karty, albo headless drill kanban). Fallback gdy WebAgent nie działa (brak klucza Jeva / brak Node):
#   - media_play    → ok=True z url=YouTube search (zamiast playback). User może kliknąć i posłuchać.
#   - media_control → ok=False code=OFFLINE (tu nie ma sensu zwracać URL — playback nie ruszy).
YT_SEARCH_URL = "https://www.youtube.com/results?search_query="
MEDIA_PLAY_PATH = "/agent/play"
MEDIA_CONTROL_PATH = "/agent/media"
MEDIA_ACTIONS = {"pause", "resume", "next", "status"}


async def _bridge_handle_media(name, args, cb):
    """Wykonaj media_play/media_control bezpośrednio z mostu przez WebAgent (bez karty SSE).

    Routing: most → WebAgent.call("POST", "/agent/play"|"/agent/media", body) → envelope.
    Circuit breaker: każde wywołanie sprawdza/prosi o stan CB; INTERNAL/TIMEOUT/OFFLINE → +1 failed.
    """
    args = args or {}

    def _envelope(code, ok, data, text):
        body = {"ok": ok, "code": code, "data": data, "text": text}
        return CallToolResult(content=[TextContent(type="text", text=json.dumps(body, ensure_ascii=False))],
                              is_error=not ok)

    allow, retry_after = cb.check(name)
    if not allow:
        return _envelope("THROTTLED", False, {"retry_after_s": round(retry_after, 3)},
                         f"Circuit breaker dla '{name}' otwarty po {CB_FAIL_THRESHOLD} failed w {CB_FAIL_WINDOW:g}s. Ponów za {retry_after:.2f}s.")
    try:
        return await _bridge_handle_media_inner(name, args, cb, _envelope)
    finally:
        cb.release(name)   # ścieżki fallbacku i przerwania nie wołają record() — bez tego probe HALF_OPEN wisiał


async def _bridge_handle_media_inner(name, args, cb, _envelope):
    if name == "media_play":
        query = (args.get("query") or "").strip()
        if not query:
            cb.record(name, ok=False, code="INVALID_ARGS")
            return _envelope("INVALID_ARGS", False, {"query": ""},
                             "media_play: brak query (tytuł lub wykonawca).")
        web = get_agents().web
        try:
            await web.ensure()
            data = await web.call("POST", MEDIA_PLAY_PATH, {"query": query})
        except agents_mod.AgentError as e:
            # kontrolowany fallback (ok=True z URL) to dla użytkownika sukces — NIE liczymy go do CB,
            # inaczej po kilku „sukcesach” narzędzie przechodziło w OPEN i user dostawał THROTTLED zamiast URL
            url = YT_SEARCH_URL + quote(query, safe="")
            return _envelope("OK", True,
                             {"query": query, "url": url, "title": query,
                              "playing": False, "fallback": "youtube_search"},
                             f"Agent WWW niedostępny ({e}); otwieram wyniki YouTube dla „{query}”.")
        except (asyncio.TimeoutError, RuntimeError):
            url = YT_SEARCH_URL + quote(query, safe="")
            return _envelope("OK", True,
                             {"query": query, "url": url, "title": query,
                              "playing": False, "fallback": "youtube_search"},
                             f"Agent WWW nie odpowiedział; otwieram wyniki YouTube dla „{query}”.")
        status = data.get("status") if isinstance(data, dict) else None
        if status != "done":
            cb.record(name, ok=False, code="INTERNAL")
            url = YT_SEARCH_URL + quote(query, safe="")
            return _envelope("INTERNAL", False,
                             {"query": query, "url": url,
                              "title": (data or {}).get("title", query),
                              "detail": (data or {}).get("detail", "brak wyników")},
                             (data or {}).get("summary") or f"Agent WWW nie znalazł „{query}”. Otwórz {url}.")
        page = data.get("page") or {}
        cb.record(name, ok=True, code="OK")
        return _envelope("OK", True,
                         {"query": query,
                          "url": page.get("url") or (YT_SEARCH_URL + quote(query, safe="")),
                          "title": data.get("title", query),
                          "playing": bool(data.get("playing", False)),
                          "ad": bool(data.get("ad", False)),
                          "ms": data.get("ms")},
                         f"Puszczam „{data.get('title', query)}”.")

    if name == "media_control":
        action = (args.get("action") or "").strip().lower()
        if action not in MEDIA_ACTIONS:
            cb.record(name, ok=False, code="INVALID_ARGS")
            return _envelope("INVALID_ARGS", False, {"action": action or ""},
                             f"media_control: nieznana akcja „{action}”. Dozwolone: {', '.join(sorted(MEDIA_ACTIONS))}.")
        web = get_agents().web
        try:
            await web.ensure()
            data = await web.call("POST", MEDIA_CONTROL_PATH, {"action": action})
        except agents_mod.AgentError as e:
            cb.record(name, ok=False, code="OFFLINE")
            return _envelope("OFFLINE", False, {"action": action},
                             f"media_control: agent WWW niedostępny ({e}).")
        except (asyncio.TimeoutError, RuntimeError):
            cb.record(name, ok=False, code="INTERNAL")
            return _envelope("OFFLINE", False, {"action": action},
                             "media_control: agent WWW nie odpowiedział.")
        cb.record(name, ok=True, code="OK")
        return _envelope("OK", True,
                         {"action": action,
                          "playing": bool((data or {}).get("playing", False)),
                          "title": (data or {}).get("title"),
                          "position": (data or {}).get("position"),
                          "duration": (data or {}).get("duration")},
                         f"media_control {action} wykonane.")

    cb.record(name, ok=False, code="INVALID_ARGS")
    return _envelope("INVALID_ARGS", False, {"name": name}, f"Nieobsługiwane media_* narzędzie: {name}")


# Narzędzia obsługiwane przez most bezpośrednio (BRIDGE_OWNED) — nie wymagają karty Jarvis OS / SSE.
BRIDGE_OWNED = frozenset({"media_play", "media_control"})


# -------------------- desktop_open: „odpal Jarvis OS” bez proszenia użytkownika o kliknięcie --------------------
# Brak karty → strona :4000 (gdy nie działa) + karta w domyślnej przeglądarce + czekanie na SSE.
# Karta jest → okno przeglądarki na wierzch (winfocus) i karta „wchodzi do systemu” (bridge.js → J.bootEnter).
# Karta nie odpowiada (np. przeglądarka zamroziła kartę w tle) → po wyciągnięciu na wierzch ponów, w ostateczności nowa karta.
SITE_URL = os.environ.get("JARVIS_SITE_URL", "http://localhost:4000")
REPO_DIR = Path(__file__).resolve().parent.parent


def _site_up() -> bool:
    import socket
    from urllib.parse import urlsplit
    u = urlsplit(SITE_URL)
    try:
        with socket.create_connection((u.hostname or "127.0.0.1", u.port or 80), 0.5):
            return True
    except OSError:
        return False


async def _ensure_site() -> str:
    """'' = strona już działała; 'started' = uruchomiona; 'failed' = nie wstała."""
    if _site_up():
        return ""
    import subprocess
    started = False
    if os.name == "nt":   # najpierw zadanie autostartu (te same logi i ustawienia co po zalogowaniu)
        r = await asyncio.to_thread(subprocess.run, ["schtasks", "/Run", "/TN", "JarvisOS-Site"], capture_output=True, creationflags=agents_mod.NO_WINDOW)
        started = r.returncode == 0
    if not started:
        from urllib.parse import urlsplit
        subprocess.Popen([sys.executable, str(REPO_DIR / "bridge" / "serve_site.py"), str(urlsplit(SITE_URL).port or 4000)], cwd=str(REPO_DIR),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=agents_mod.NO_WINDOW)
    for _ in range(60):
        if _site_up():
            return "started"
        await asyncio.sleep(0.25)
    return "failed"


def _open_tab() -> None:
    if os.name == "nt":
        os.startfile(SITE_URL)   # domyślna przeglądarka użytkownika (np. Comet), jego profil i logowania
    else:
        import webbrowser
        webbrowser.open(SITE_URL)


async def _wait_client(seconds: float) -> bool:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if newest() is not None:
            return True
        try:
            await asyncio.wait_for(_wake_event().wait(), 0.5)
        except asyncio.TimeoutError:
            pass
        _wake_event().clear()
    return newest() is not None


async def _bridge_desktop_open(args: dict) -> CallToolResult:
    import winfocus

    def env(code, ok, data, text):
        return CallToolResult(content=[TextContent(type="text", text=json.dumps({"ok": ok, "code": code, "data": data, "text": text}, ensure_ascii=False, default=str))], is_error=not ok)

    focus = (args or {}).get("focus", True) is not False
    opened, site, win, res = False, "", None, None
    if newest() is None:
        site = await _ensure_site()
        if site == "failed":
            return env("INTERNAL", False, {"site": "failed"}, f"Strona Jarvis OS ({SITE_URL}) nie wstała. Sprawdź integrations\\doctor.ps1.")
        await asyncio.to_thread(_open_tab)
        opened = True
        if not await _wait_client(30):
            return env("OFFLINE", False, {"opened": True, "site": site or "ok"}, "Otworzyłem kartę Jarvis OS, ale nie połączyła się z mostem w 30 s (przeglądarka nie wystartowała albo most jest wyłączony w Ustawieniach karty).")
    if focus:
        win = await asyncio.to_thread(winfocus.bring_to_front)   # najpierw na wierzch: widoczna karta „odmarza” i pokaże okna zgody
    for attempt in range(3):
        try:
            res = await relay("desktop_open", {}, timeout=12)
            break
        except ToolError:
            if attempt == 0 and not win:
                win = await asyncio.to_thread(winfocus.bring_to_front)
            elif attempt == 1:   # karta martwa mimo połączenia — nowa karta
                await asyncio.to_thread(_open_tab)
                opened = True
                await asyncio.sleep(3)
                await _wait_client(25)
                if focus:
                    win = await asyncio.to_thread(winfocus.bring_to_front)
    if res is None:
        return env("TIMEOUT", False, {"opened": opened, "window": win}, "Karta Jarvis OS nie odpowiada mimo wyciągnięcia na wierzch i otwarcia nowej. Zamknij ręcznie stare karty Jarvisa.")
    data = dict(res.get("data") or {}) if isinstance(res.get("data"), dict) else {}
    data.update(opened=opened, site=site or "ok", focused=bool(win and win.get("foreground")), window=(win or {}).get("title"), browser=(win or {}).get("browser"))
    if not res.get("ok") and res.get("code") == "NOT_FOUND":   # karta ze starszym kodem (bez desktop_open) — weszła do systemu przez bridge.js, odświeży się sama
        data.setdefault("booted", True)
    parts = ["Otworzyłem nową kartę Jarvis OS." if opened else "Karta Jarvis OS już działała."]
    if site == "started":
        parts.insert(0, "Uruchomiłem stronę Jarvis OS.")
    parts.append(str(res.get("text") or "") if res.get("ok") else "Wszedłem do systemu.")
    if focus:
        parts.append(f"Okno {data.get('browser') or 'przeglądarki'} jest na wierzchu." if data["focused"] else ("Nie udało się wyciągnąć okna na wierzch (Windows zablokował zmianę fokusu)." if win and win.get("found") else "Nie znalazłem okna przeglądarki z Jarvisem (karta może nie być aktywną kartą okna)."))
    return env("OK", True, data, " ".join(p for p in parts if p))


SCREENS_KEEP = 20


async def _bridge_desktop_screenshot(args: dict) -> CallToolResult:
    """Zrzut okna Jarvisa do %USERPROFILE%\\.jarvis-os\\screens (zostaje SCREENS_KEEP ostatnich); Hermes odsyła go jako MEDIA:<ścieżka>."""
    import winfocus

    def env(code, ok, data, text):
        return CallToolResult(content=[TextContent(type="text", text=json.dumps({"ok": ok, "code": code, "data": data, "text": text}, ensure_ascii=False, default=str))], is_error=not ok)

    if os.name != "nt":
        return env("UNSUPPORTED", False, None, "Zrzut ekranu działa tylko na Windows.")
    scope = "monitor" if (args or {}).get("scope") == "monitor" else "window"
    d = agents_mod.home() / "screens"
    path = d / f"jarvis-{time.strftime('%Y%m%d-%H%M%S')}.png"
    try:
        r = await asyncio.to_thread(winfocus.capture, str(path), scope=scope)
    except Exception as e:  # noqa: BLE001
        return env("INTERNAL", False, None, f"Zrzut ekranu nie udał się: {e}")
    if not r.get("found"):
        return env("NOT_FOUND", False, None, "Nie znalazłem okna przeglądarki z Jarvis OS — najpierw desktop_open.")
    for old in sorted(d.glob("jarvis-*.png"))[:-SCREENS_KEEP]:
        old.unlink(missing_ok=True)
    return env("OK", True, r, f"Zrobiłem zrzut ({r['size'][0]}×{r['size'][1]}, {r['browser']}). Wyślij go użytkownikowi linią: MEDIA:{r['path']}")




INSTRUCTIONS = (
    "Narzędzia sterują działającym pulpitem Jarvis OS w przeglądarce użytkownika (Command Registry Jarvis OS). "
    "Każdy wynik to JSON {ok, code, data, text}; kody: OK, NOT_FOUND, AMBIGUOUS, INVALID_ARGS, DENIED, DUPLICATE, OFFLINE, TIMEOUT. "
    "Zanim zmienisz lub usuniesz obiekt, którego id nie znasz, użyj *_list / *_read / *_search. "
    "Wynik narzędzia to prawda o stanie pulpitu — nie zakładaj powodzenia bez ok=true."
)
TOOLS_FILE = Path(os.environ.get("JARVIS_BRIDGE_TOOLS_FILE") or Path(__file__).resolve().parent / "tools.json")
# Migawka w repo (node bridge/export-tools.js, pilnowana testem) jest TYLKO DO ODCZYTU. Schematy zgłoszone przez kartę most
# zapisuje do pliku roboczego poza repo — wcześniej nadpisywał śledzony plik i brudził drzewo git po każdym uruchomieniu.
RUNTIME_TOOLS_FILE = Path(os.environ.get("JARVIS_BRIDGE_TOOLS_RUNTIME") or agents_mod.home() / "tools.runtime.json")
_REPO_TOOLS_FILE = Path(__file__).resolve().parent / "tools.json"   # migawka w repo (TOOLS_FILE może wskazywać plik testowy)


def runtime_tools_file() -> Path:
    """Plik roboczy schematów: w ~/.jarvis-os dla migawki z repo; obok podmienionej migawki (testy) — nigdy w danych użytkownika."""
    return RUNTIME_TOOLS_FILE if TOOLS_FILE == _REPO_TOOLS_FILE else TOOLS_FILE.with_name(TOOLS_FILE.stem + ".runtime.json")
# nazwa -> {name, description, parameters}; źródło: migawka tools.json, aktualizowana schematami z przeglądarki
TOOLS: dict[str, dict] = {}
# nazwy z migawki przy starcie mostu (= aktualny kod, node bridge/export-tools.js): karta ze starym kodem nie może ich usunąć
BASELINE: set[str] = set()


def load_tools() -> None:
    try:
        data = json.loads(TOOLS_FILE.read_text(encoding="utf-8"))
        TOOLS.clear()
        TOOLS.update({t["name"]: t for t in data if isinstance(t, dict) and t.get("name")})
        BASELINE.clear()
        BASELINE.update(TOOLS)
    except (OSError, ValueError) as e:
        print(f"[jarvis-bridge] brak migawki narzędzi {TOOLS_FILE}: {e}", file=sys.stderr)
        return
    try:   # schematy z karty z poprzedniego uruchomienia — tylko gdy dotyczą tej samej wersji kodu (identyczny zestaw nazw)
        rt = {t["name"]: t for t in json.loads(runtime_tools_file().read_text(encoding="utf-8")) if isinstance(t, dict) and t.get("name")}
        if set(rt) == BASELINE:
            TOOLS.clear()
            TOOLS.update(rt)
    except (OSError, ValueError, TypeError):
        pass


def stale_names(tools: list) -> list[str]:
    """Narzędzia z aktualnego kodu, których zgłoszony rejestr nie ma — karta działa na starej wersji strony."""
    have = {t.get("name") for t in tools if isinstance(t, dict)}
    return sorted(BASELINE - have)


def update_tools(tools: list) -> bool:
    """Przeglądarka zgłasza aktualny rejestr. Zmiana trafia do pliku — Hermes zobaczy ją po restarcie gatewaya.
    Rejestr bez narzędzi z aktualnego kodu (stara karta) jest odrzucany: inaczej wypierał nowe narzędzia i nadpisywał migawkę.
    Tylko nazwy z BASELINE (migawka = node bridge/export-tools.js, pilnowana testem) i opisy z limitem długości (2000) —
    karta z tokenem nie może dopisać NOWEGO narzędzia ani wstrzyknąć elaboratu do kontekstu Hermesa (kanał prompt-injection przy XSS)."""
    # limit 2000: najdłuższy prawdziwy opis ma ~900 znaków (600 ucinało computer_use/web_task i rozjeżdżało migawkę z kodem)
    fresh = {t["name"]: {"name": t["name"], "description": str(t.get("description") or "")[:2000], "parameters": t.get("parameters") or {"type": "object", "properties": {}}}
             for t in tools if isinstance(t, dict) and isinstance(t.get("name"), str) and re.fullmatch(r"[a-z][a-z0-9_]{0,63}", t["name"]) and t["name"] in BASELINE}
    if not fresh or fresh == TOOLS or stale_names(list(fresh.values())):
        return False
    TOOLS.clear()
    TOOLS.update(fresh)
    try:
        rt_file = runtime_tools_file()
        rt_file.parent.mkdir(parents=True, exist_ok=True)
        rt_file.write_text(json.dumps(list(fresh.values()), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    except OSError:
        pass
    return True


class DesktopMCP(MCPServer):
    """Narzędzia nie są zakodowane w Pythonie: lista pochodzi z rejestru Jarvis OS, wywołanie idzie do karty przeglądarki."""

    async def list_tools(self) -> list[Tool]:
        return [Tool(name=t["name"], description=t["description"], input_schema=t["parameters"]) for t in TOOLS.values()]

    async def _handle_call_tool(self, ctx, params):  # noqa: ANN001 — sygnatura z MCPServer
        name, args = params.name, params.arguments or {}
        if name not in TOOLS:
            return CallToolResult(content=[TextContent(type="text", text=f"Nieznane narzędzie: {name}")], is_error=True)
        # Narzędzia BRIDGE_OWNED (media_play, media_control) — most obsługuje je bezpośrednio przez WebAgent,
        # NIE wymagają karty Jarvis OS (SSE). Dlatego NIE idą przez relay() i NIE rzucają OFFLINE gdy karta
        # zamknięta. To jest fix z t_874a5201 / B4: wcześniej każde media_* bez karty → OFFLINE.
        if name in BRIDGE_OWNED:
            return await _bridge_handle_media(name, args, CB)
        if name in WF_TOOLS:   # workflow: silnik w moście, bez karty (ADR 0007)
            return await _bridge_workflow(name, args)
        if name == "system_info":   # odczyt stanu komputera: lokalnie w moście, bez karty i bez powłoki
            return await _bridge_system_info(args)
        if name == "desktop_open":   # narzędzie naprawcze: bez bezpiecznika (CB) i bez wymogu połączonej karty
            return await _bridge_desktop_open(args)
        if name == "desktop_screenshot":
            return await _bridge_desktop_screenshot(args)
        # Circuit breaker: przed relay() sprawdź czy to narzędzie nie jest w trakcie cooldown.
        # Chroni przed pętlą OFFLINE/INTERNAL/TIMEOUT — model widzi jawny kod THROTTLED zamiast cichego odrzucenia.
        allow, retry_after = CB.check(name)
        if not allow:
            payload = {"ok": False, "code": "THROTTLED",
                       "text": (f"Circuit breaker dla '{name}' otwarty po {CB_FAIL_THRESHOLD} failed w "
                                f"{CB_FAIL_WINDOW:g}s. Ponów za {retry_after:.2f}s."),
                       "data": {"retry_after_s": round(retry_after, 3)}}
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(payload, ensure_ascii=False))], is_error=True)
        try:
            try:
                res = await relay(name, args)
            except ToolError as e:
                # ToolError to awaria mostu (brak karty, timeout) → traktuj jak failure
                CB.record(name, ok=False, code="INTERNAL")
                return CallToolResult(content=[TextContent(type="text", text=str(e))], is_error=True)
            ok = bool(res.get("ok"))
            code = res.get("code")
            CB.record(name, ok=ok, code=code)
            payload = {k: res.get(k) for k in ("ok", "code", "data", "text")}
            return CallToolResult(content=[TextContent(type="text", text=json.dumps(payload, ensure_ascii=False, default=str))], is_error=not ok)
        finally:
            CB.release(name)   # no-op po record(); ratuje probe HALF_OPEN przy CancelledError (Hermes zrywa wywołanie)


mcp = DesktopMCP("jarvis-desktop", instructions=INSTRUCTIONS, version="2.0.0")


# ---------------------------------------------------------------- kanał przeglądarki

def cors(request: Request, resp: Response) -> Response:
    origin = request.headers.get("origin", "")
    if origin in ORIGINS:
        resp.headers["Access-Control-Allow-Origin"] = origin
        resp.headers["Vary"] = "Origin"
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Bridge-Token"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        if request.headers.get("access-control-request-private-network"):
            resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


def authorized(request: Request) -> bool:
    if ALLOWED_HOSTS and request.headers.get("host", "") not in ALLOWED_HOSTS:
        return False
    tok = request.headers.get("x-bridge-token") or ""
    if not tok and request.url.path == "/bridge/events":   # EventSource nie może ustawić nagłówka — TYLKO tu token w query (adresy trafiają do logów/historii)
        tok = request.query_params.get("token") or ""
    return secrets.compare_digest(tok, TOKEN)


DRIVE_RE = re.compile(r"^[A-Za-z]:?[\\/]?$")


def _sys_args(raw_drive, raw_processes) -> tuple[str | None, int]:
    """Walidacja wspólna dla MCP i HTTP: litera dysku (opcjonalnie) i liczba procesów 0–10."""
    drive = str(raw_drive or "").strip()
    if drive and not DRIVE_RE.match(drive):
        raise ValueError("drive: podaj literę dysku, np. C")
    try:
        n = int(5 if raw_processes in (None, "") else raw_processes)
    except (TypeError, ValueError):
        raise ValueError("processes: liczba od 0 do 10") from None
    return (drive or None), max(0, min(10, n))


async def _bridge_system_info(args: dict) -> CallToolResult:
    def env(code: str, ok: bool, data, text: str) -> CallToolResult:
        body = {"ok": ok, "code": code, "data": data, "text": text}
        return CallToolResult(content=[TextContent(type="text", text=json.dumps(body, ensure_ascii=False, default=str))], is_error=not ok)
    try:
        drive, n = _sys_args(args.get("drive"), args.get("processes"))
    except ValueError as e:
        return env("INVALID_ARGS", False, None, str(e))
    try:
        data = await asyncio.to_thread(system_info.snapshot, drive, n)
    except Exception as e:  # noqa: BLE001
        return env("INTERNAL", False, None, f"Nie udało się odczytać stanu komputera: {type(e).__name__}")
    return env("OK", True, data, system_info.describe(data, drive))


@mcp.custom_route("/bridge/system", methods=["GET", "OPTIONS"])
async def system_route(request: Request) -> Response:
    """Stan komputera (tylko odczyt) dla karty: ?drive=C&processes=5 — ta sama odpowiedź co narzędzie MCP system_info."""
    if (g := await agents_guard(request)) is not None:
        return g
    try:
        drive, n = _sys_args(request.query_params.get("drive"), request.query_params.get("processes"))
    except ValueError as e:
        return cors(request, JSONResponse({"error": str(e)}, status_code=400))
    data = await asyncio.to_thread(system_info.snapshot, drive, n)
    return cors(request, JSONResponse({"ok": True, "data": data, "text": system_info.describe(data, drive)}))


@mcp.custom_route("/bridge/status", methods=["GET", "OPTIONS"])
async def status(request: Request) -> Response:
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    now = time.time()
    target = newest()
    last_wake = WAKE.get(TOKEN, 0.0)
    wake_age = round(now - last_wake, 3) if last_wake else None
    wake_valid = wake_age is not None and wake_age < WAKE_TTL
    try:
        agents_info = await get_agents().status()
    except Exception:  # noqa: BLE001 — status mostu nie może zależeć od agentów
        agents_info = None
    return cors(request, JSONResponse({"ok": True, "clients": len(CLIENTS), "tools": sorted(TOOLS),
                                       "circuit_breaker": CB.snapshot(),
                                       "browsers": [{"id": c.id, "visible": c.visible, "target": c is target} for c in CLIENTS.values()],
                                       "hermes": {k: round(now - v) for k, v in HERMES_SEEN.items()}, "agents": agents_info,
                                       "wake": {"age_s": wake_age, "valid": wake_valid, "ttl_s": WAKE_TTL, "wait_s": WAKE_WAIT}}))


@mcp.custom_route("/bridge/pair", methods=["GET", "OPTIONS"])
async def pair(request: Request) -> Response:
    """Zero-konfiguracji: token dostaje wyłącznie strona z lokalnego Origin (przeglądarka nie pozwala go podrobić).
    Origin publiczny (GitHub Pages) jest w ORIGINS dla CORS, ale tokenu tą drogą nie dostanie — patrz PAIR_ORIGINS."""
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    # Host sprawdzamy przed Origin: Origin da się podrobić spoza przeglądarki, Host przy DNS rebinding — nie
    if ALLOWED_HOSTS and request.headers.get("host", "") not in ALLOWED_HOSTS:
        return JSONResponse({"error": "host not allowed"}, status_code=403)
    if request.headers.get("origin", "") not in PAIR_ORIGINS:
        return JSONResponse({"error": "origin not allowed"}, status_code=403)
    return cors(request, JSONResponse({"token": TOKEN}))


@mcp.custom_route("/bridge/wake", methods=["POST", "OPTIONS"])
async def wake(request: Request) -> Response:
    """Handshake z karty: „idę do SSE". Most rezerwuje WAKE_TTL s na pojawienie się klienta SSE.
    Pierwsze wywołanie MCP po otwarciu karty (race 0.4–1.2 s) czeka w relay() zamiast natychmiast dostać OFFLINE.
    Body może być puste lub {client_hint: "..."} — bez walidacji, handshake to tylko znacznik czasu.
    """
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    WAKE[TOKEN] = time.time()
    _wake_event().set()   # obudź też czekające relay() — karta zgłosiła się
    return cors(request, JSONResponse({"ok": True, "ttl_s": WAKE_TTL, "wait_s": WAKE_WAIT}))


@mcp.custom_route("/bridge/hermes", methods=["GET", "OPTIONS"])
async def hermes_pair(request: Request) -> Response:
    """Połączenie karty z Hermesem jarvis-desktop bez ręcznej konfiguracji: adres, model i klucz gatewaya dostaje tylko
    strona z dozwolonego Origin, która ma już token mostu. Bez tego karta z domyślnymi ustawieniami (:8642, bez klucza)
    po cichu nie rozmawiała z Hermesem i złożone zadania trafiały do prostego silnika lokalnego."""
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    # tylko lokalne originy (PAIR_ORIGINS): klucz gatewaya daje od 2026-10-03 pełne narzędzia (terminal, pliki),
    # więc nie wydajemy go stronie z github.io, nawet z tokenem mostu
    if request.headers.get("origin", "") not in PAIR_ORIGINS or not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    t = writer_proxy.hermes_target()
    if not t:
        return cors(request, JSONResponse({"error": "nie znaleziono profilu jarvis-desktop (API_SERVER_KEY)"}, status_code=404))
    _url, _key, model = t
    # Klucz gatewaya NIE trafia do przeglądarki (od 2026-10-04): karta rozmawia z Hermesem przez most (/bridge/v1/*),
    # uwierzytelniając się tokenem mostu, a most dokłada klucz po swojej stronie. XSS w karcie nie daje już klucza
    # do agenta z terminalem.
    base = f"{request.url.scheme}://{request.headers.get('host') or '127.0.0.1:8651'}/bridge/v1"   # Host już sprawdzony w authorized()
    return cors(request, JSONResponse({"url": base, "key": "", "model": model, "preset": "desktop", "proxy": True}))


HOP_HEADERS = {"content-length", "transfer-encoding", "connection", "content-encoding", "keep-alive"}


async def hermes_proxy(request: Request, path: str) -> Response:
    """Przekazuje zapytanie karty do gatewaya Hermesa z kluczem API dodanym po stronie mostu; strumień SSE bez buforowania."""
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if request.headers.get("origin", "") not in PAIR_ORIGINS or not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    t = writer_proxy.hermes_target()
    if not t:
        return cors(request, JSONResponse({"error": "nie znaleziono profilu jarvis-desktop (API_SERVER_KEY)"}, status_code=503))
    url, key, _model = t
    target = url.removesuffix("/chat/completions") + "/" + path
    import aiohttp
    headers = {"Authorization": "Bearer " + key, "Content-Type": request.headers.get("content-type", "application/json")}
    body = await request.body() if request.method == "POST" else None
    session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=None, sock_connect=10, sock_read=900))
    try:
        upstream = await session.request(request.method, target, data=body, headers=headers)
    except Exception as e:  # noqa: BLE001 — gateway wyłączony / restart
        await session.close()
        return cors(request, JSONResponse({"error": f"Hermes niedostępny: {e}"}, status_code=502))
    out_headers = {k: v for k, v in upstream.headers.items() if k.lower() not in HOP_HEADERS and not k.lower().startswith("access-control-")}

    async def stream():
        try:
            async for chunk in upstream.content.iter_any():
                yield chunk
        finally:
            upstream.release()
            await session.close()

    return cors(request, StreamingResponse(stream(), status_code=upstream.status, headers=out_headers,
                                           media_type=upstream.headers.get("content-type")))


@mcp.custom_route("/bridge/v1/chat/completions", methods=["POST", "OPTIONS"])
async def hermes_chat(request: Request) -> Response:
    return await hermes_proxy(request, "chat/completions")


@mcp.custom_route("/bridge/v1/models", methods=["GET", "OPTIONS"])
async def hermes_models(request: Request) -> Response:
    return await hermes_proxy(request, "models")


# ---------------------------------------------------------------- zdarzenia zadań Hermesa (wtyczka jarvis-events)
# Hermes obsługuje Telegram/cron poza kartą; wtyczka hermes/plugins/jarvis-events wysyła tu start zadania, narzędzia i wynik,
# a most rozsyła je kartom (SSE „event: agent”), żeby Orb i Process Log pokazywały prawdziwą pracę agenta.
AGENT_TYPES = {"task.created", "tool.started", "tool.completed", "tool.failed", "task.completed", "task.failed"}
AGENT_FIELDS = {"v": int, "type": str, "ts": float, "task_id": str, "platform": str, "model": str, "title": str, "call_id": str,
                "tool": str, "label": str, "ms": int, "error": str, "result": str}
AGENT_LOG: deque = deque(maxlen=300)
AGENT_REPLAY_MAX_AGE = 600   # s — starsze, niezakończone zadanie uznajemy za porzucone (np. restart gatewaya)


def clean_agent_event(raw: dict) -> Optional[dict]:
    if not isinstance(raw, dict) or raw.get("type") not in AGENT_TYPES or not isinstance(raw.get("task_id"), str):
        return None
    out = {}
    for k, typ in AGENT_FIELDS.items():
        v = raw.get(k)
        if v is None:
            continue
        try:
            v = typ(v)
        except (TypeError, ValueError):
            continue
        out[k] = v[:400] if isinstance(v, str) else v
    out.setdefault("ts", time.time())
    return out


def agent_replay() -> list[dict]:
    """Zdarzenia ostatniego zadania, jeśli wciąż trwa (karta podłączona w jego trakcie)."""
    events = list(AGENT_LOG)
    starts = [e for e in events if e["type"] == "task.created"]
    if not starts:
        return []
    last = starts[-1]
    if time.time() - last["ts"] > AGENT_REPLAY_MAX_AGE:
        return []
    mine = [e for e in events if e.get("task_id") == last["task_id"]]
    return [] if any(e["type"] in ("task.completed", "task.failed") for e in mine) else mine


@mcp.custom_route("/bridge/agent-event", methods=["POST"])
async def agent_event(request: Request) -> Response:
    if not authorized(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    try:
        evt = clean_agent_event(await read_json(request))
    except agents_mod.AgentError as e:   # zły JSON / za duże ciało → 400/413, nie 500
        return JSONResponse({"error": str(e)}, status_code=getattr(e, "status", 400))
    if not evt:
        return JSONResponse({"error": "nieznany typ zdarzenia albo brak task_id"}, status_code=400)
    AGENT_LOG.append(evt)
    if evt["type"] in day_history.TYPES:
        tools = sum(1 for e in AGENT_LOG if e.get("task_id") == evt["task_id"] and e["type"] == "tool.started")
        day_history.record(AGENT_HISTORY, evt, tools)
    for c in list(CLIENTS.values()):
        c.queue.put_nowait({"_sse": "agent", **evt})
    return JSONResponse({"ok": True, "clients": len(CLIENTS)})


AGENT_HISTORY = Path(os.environ.get("JARVIS_AGENT_HISTORY") or agents_mod.home() / "agent-history.jsonl")   # testy: osobny plik


@mcp.custom_route("/bridge/agent-history", methods=["GET", "OPTIONS"])
async def agent_history(request: Request) -> Response:
    """Zadania Hermesa (Telegram, cron, konsola) od `since` (epoch s; domyślnie północ) — także te sprzed otwarcia karty."""
    if (g := await agents_guard(request)) is not None:
        return g
    try:
        since = float(request.query_params.get("since") or 0)
    except ValueError:
        since = 0.0
    if since <= 0:
        lt = time.localtime()
        since = time.mktime((lt.tm_year, lt.tm_mon, lt.tm_mday, 0, 0, 0, 0, 0, -1))
    return cors(request, JSONResponse({"since": since, "tasks": day_history.tasks(AGENT_HISTORY, since)[-200:]}))


# ---------------------------------------------------------------- workflow (ADR 0007): silnik w moście, zdarzenia „event: workflow”
# Definicje: workflows/*.yaml (repo); stan przebiegów: ~/.jarvis-os/workflows/runs. Narzędzia workflow_* obsługuje most sam
# (bez karty) — workflow można uruchomić z Telegrama przez Hermesa, a karta tylko pokazuje przebieg na żywo.
import workflow_engine as wf_mod  # noqa: E402 — moduł z katalogu bridge/

WF: Optional[wf_mod.WorkflowEngine] = None
WF_TOOLS = frozenset({"workflow_list", "workflow_run", "workflow_status", "workflow_stop", "workflow_answer"})
WF_RETRY_STATUS = {429, 500, 502, 503, 504}


def wf_emit(evt: dict) -> None:
    for c in list(CLIENTS.values()):
        c.queue.put_nowait({"_sse": "workflow", **evt})


def _wf_call(fn, arg) -> None:
    try:
        fn(arg)
    except Exception as e:  # noqa: BLE001 — podgląd na żywo nie może przerwać kroku
        print("[jarvis-bridge] workflow podgląd:", e, file=sys.stderr)


async def _wf_read_stream(r, on_text, on_tool) -> tuple[str, int]:
    """Odpowiedź Hermesa strumieniem (SSE): tekst z delta.content, narzędzia z „event: hermes.tool.progress”,
    tokeny z ostatniego kawałka (stream_options.include_usage). Tekst końcowy jest ten sam co bez strumienia."""
    text, tokens, event, data = "", 0, "message", []

    def dispatch() -> None:
        nonlocal text, tokens
        payload = "\n".join(data)
        if not payload or payload == "[DONE]":
            return
        try:
            j = json.loads(payload)
        except ValueError:
            return
        if not isinstance(j, dict):
            return
        if event == "hermes.tool.progress":
            if on_tool:
                _wf_call(on_tool, j)
            return
        if isinstance(j.get("usage"), dict):
            tokens = int(j["usage"].get("total_tokens") or 0)
        delta = "".join(str((c.get("delta") or {}).get("content") or "") for c in (j.get("choices") or []) if isinstance(c, dict))
        if delta:
            text += delta
            _wf_call(on_text, text)

    async for raw in r.content:
        line = raw.decode("utf-8", "replace").rstrip("\r\n")
        if not line:
            dispatch()
            event, data = "message", []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
    dispatch()
    return text, tokens


async def wf_hermes(messages: list, session_id: str, timeout: float, on_text=None, on_tool=None) -> tuple[str, int]:
    """Jedna tura Hermesa dla kroku workflow: osobna sesja na krok i próbę; ponowienia tylko przy 429/5xx/zerwanym połączeniu.
    Z on_text odpowiedź przychodzi strumieniem — karta widzi pisanie na żywo (karta w czacie, Film)."""
    import aiohttp
    t = writer_proxy.hermes_target()
    if not t:
        raise RuntimeError("nie znaleziono profilu jarvis-desktop (API_SERVER_KEY)")
    url, key, model = t
    stream = on_text is not None
    body = {"model": model, "stream": stream, "messages": messages, **({"stream_options": {"include_usage": True}} if stream else {})}
    headers = {"Authorization": "Bearer " + key, "X-Hermes-Session-Id": session_id}
    for attempt, delay in enumerate((5, 15, None)):
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as sess:
                async with sess.post(url, json=body, headers=headers) as r:
                    if r.status == 200:
                        if stream and "text/event-stream" in (r.headers.get("Content-Type") or ""):
                            return await _wf_read_stream(r, on_text, on_tool)
                        j = await r.json(content_type=None)
                        msg = ((j.get("choices") or [{}])[0].get("message") or {})
                        return str(msg.get("content") or ""), int((j.get("usage") or {}).get("total_tokens") or 0)
                    if r.status not in WF_RETRY_STATUS or delay is None:
                        raise RuntimeError(f"Hermes HTTP {r.status}: {(await r.text())[:200]}")
        except (aiohttp.ClientConnectionError, aiohttp.ClientPayloadError) as e:
            if delay is None:
                raise RuntimeError(f"Hermes niedostępny: {type(e).__name__}") from e
        except asyncio.TimeoutError as e:   # długa generacja — ponawia krok silnik (z podpowiedzią), nie ten klient
            raise RuntimeError(f"Hermes nie odpowiedział w {timeout:.0f} s") from e
        await asyncio.sleep(delay)
    raise RuntimeError("Hermes niedostępny")


async def wf_judge(question: str, content: str) -> tuple[float, str]:
    """Sprawdzenie kroku przez niezależny model (darmowe OpenRouter → Hermes), nie ten, który krok wykonał."""
    msgs = [{"role": "system", "content": 'Oceniasz wynik jednego kroku pracy agenta. Odpowiedz WYŁĄCZNIE JSON-em: {"score": liczba od 0 do 1, "why": "jedno zdanie po polsku"}.'},
            {"role": "user", "content": f"Pytanie: {question}\n\nWynik kroku:\n{content}"}]
    reply, _model = await writer_proxy.complete({"model": "judge", "messages": msgs, "max_tokens": 200}, agents_mod.openrouter_key(),
                                                models=agents_mod.planner_models(), timeout=20)
    data = wf_mod.parse_json_reply(((reply.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
    return max(0.0, min(1.0, float(data.get("score", 0)))), str(data.get("why", ""))[:200]


async def wf_relay(tool: str, args: dict) -> dict:
    if tool in WF_TOOLS:
        return {"ok": False, "code": "DENIED", "text": "workflow nie uruchamia innych workflow"}
    try:
        return await relay(tool, args, timeout=90)
    except ToolError as e:
        return {"ok": False, "code": "OFFLINE", "text": str(e)}


def get_workflows() -> wf_mod.WorkflowEngine:
    """Leniwie (pierwsze użycie jest zawsze w pętli zdarzeń): tworzy silnik i wznawia przebiegi przerwane restartem mostu."""
    global WF
    if WF is None:
        WF = wf_mod.WorkflowEngine(
            defs_dir=Path(os.environ.get("JARVIS_WORKFLOWS_DIR") or Path(__file__).resolve().parent.parent / "workflows"),
            runs_dir=Path(os.environ.get("JARVIS_WORKFLOW_RUNS") or agents_mod.home() / "workflows" / "runs"),
            projects_root=Path(os.environ.get("JARVIS_PROJECTS_ROOT") or Path.home() / "JarvisWorkspace" / "projects"),
            hermes=wf_hermes, judge=wf_judge, relay=wf_relay, emit=wf_emit,
            log=lambda *a: print("[jarvis-bridge]", *a, file=sys.stderr))
        resumed = WF.resume_pending()
        if resumed:
            print(f"[jarvis-bridge] workflow: wznowiono {len(resumed)} przebieg(i)", file=sys.stderr)
    return WF


def wf_describe(snap: dict) -> str:
    """Zdanie dla modelu i użytkownika: co się dzieje z przebiegiem."""
    if snap.get("state") == "idle":
        return "Żaden workflow nie trwa."
    steps = snap.get("steps") or []
    done = sum(1 for x in steps if x.get("state") in ("done", "skipped"))
    cur = next((x for x in steps if x.get("state") == "running"), None)
    head = f"„{snap.get('name')}” ({snap.get('id')}): "
    if snap.get("state") == "done":
        return head + "zakończony. " + (snap.get("report") or "")
    if snap.get("state") in ("failed", "stopped"):
        return head + ("nie powiódł się: " if snap["state"] == "failed" else "zatrzymany: ") + str(snap.get("reason") or "")
    if snap.get("state") == "waiting" and snap.get("pending"):
        p = snap["pending"]
        return head + f"czeka na odpowiedź: {p.get('question')} (opcje: {', '.join(p.get('options') or [])}) — workflow_answer."
    return head + f"krok {done + 1}/{len(steps)}" + (f" — {cur['title']} (próba {cur.get('attempts')})" if cur else "")


async def _bridge_workflow(name: str, args: dict) -> CallToolResult:
    def env(code: str, ok: bool, data, text: str) -> CallToolResult:
        body = {"ok": ok, "code": code, "data": data, "text": text}
        return CallToolResult(content=[TextContent(type="text", text=json.dumps(body, ensure_ascii=False, default=str))], is_error=not ok)
    wf = get_workflows()
    try:
        if name == "workflow_list":
            items = wf.list()
            return env("OK", True, {"workflows": items}, "Dostępne workflow: " + ("; ".join(f"„{i['name']}” ({i['id']}, wejście: {', '.join(i['inputs']) or 'brak'})" for i in items) or "brak") + ".")
        if name == "workflow_run":
            snap = await wf.start(str(args.get("workflow") or ""), args.get("inputs") or {}, args.get("autonomy"), source="hermes")
            return env("OK", True, snap, f"Uruchomiłem „{snap['name']}” (przebieg {snap['id']}, autonomia {snap['autonomy']}, {len(snap['steps'])} kroków). Postęp: workflow_status — przebieg widać też na pulpicie (karta w czacie, „pokaż film”).")
        if name == "workflow_status":
            snap = wf.status(args.get("run_id") or None)
            return env("OK", True, snap, wf_describe(snap))
        if name == "workflow_stop":
            r = await wf.stop(str(args.get("run_id") or "all"))
            return env("OK", True, r, f"Zatrzymano: {len(r['stopped'])} przebieg(i)." if r["stopped"] else "Żaden workflow nie trwał.")
        if name == "workflow_answer":
            r = wf.answer(str(args.get("run_id") or ""), str(args.get("answer") or ""))
            return env("OK" if r["ok"] else "NOT_FOUND", r["ok"], r, "Przekazano odpowiedź." if r["ok"] else r["error"])
    except KeyError as e:
        return env("NOT_FOUND", False, None, str(e).strip("'\""))
    except ValueError as e:
        return env("INVALID_ARGS", False, None, str(e))
    except RuntimeError as e:
        return env("DUPLICATE", False, None, str(e))
    return env("UNSUPPORTED", False, None, f"nieznane polecenie {name}")


@mcp.custom_route("/workflows", methods=["GET", "OPTIONS"])
async def workflows_list(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    wf = get_workflows()
    return cors(request, JSONResponse({"workflows": wf.list(), "errors": wf._def_errors}))


@mcp.custom_route("/workflows/run", methods=["POST", "OPTIONS"])
async def workflows_run(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    try:
        b = await read_json(request)
        snap = await get_workflows().start(str(b.get("workflow") or ""), b.get("inputs") or {}, b.get("autonomy"), source="desktop")
        return cors(request, JSONResponse(snap))
    except ValueError as e:
        return cors(request, JSONResponse({"error": str(e)}, status_code=400))
    except RuntimeError as e:
        return cors(request, JSONResponse({"error": str(e)}, status_code=409))
    except Exception as e:  # noqa: BLE001
        return agent_error(request, e)


@mcp.custom_route("/workflows/runs", methods=["GET", "OPTIONS"])
async def workflows_runs(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    return cors(request, JSONResponse({"runs": get_workflows().recent(20)}))


@mcp.custom_route("/workflows/runs/{run_id}", methods=["GET", "OPTIONS"])
async def workflows_run_get(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    wf, rid = get_workflows(), request.path_params["run_id"]
    try:
        if request.query_params.get("events") == "1":
            return cors(request, JSONResponse({"events": wf.events_of(rid)}))
        return cors(request, JSONResponse(wf.status(rid)))
    except KeyError as e:
        return cors(request, JSONResponse({"error": str(e).strip("'\"")}, status_code=404))


@mcp.custom_route("/workflows/runs/{run_id}/{action}", methods=["POST", "OPTIONS"])
async def workflows_run_action(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    wf, rid, action = get_workflows(), request.path_params["run_id"], request.path_params["action"]
    try:
        if action == "stop":
            return cors(request, JSONResponse(await wf.stop(rid)))
        if action == "answer":
            b = await read_json(request)
            r = wf.answer(rid, str(b.get("answer") or ""))
            return cors(request, JSONResponse(r, status_code=200 if r["ok"] else 409))
    except Exception as e:  # noqa: BLE001
        return agent_error(request, e)
    return cors(request, JSONResponse({"error": "nie ma takiej akcji"}, status_code=404))


@mcp.custom_route("/workflows/runs/{run_id}/file", methods=["GET"])
async def workflows_run_file(request: Request) -> Response:
    """Plik projektu zapisanego przez przebieg (czytnik README w Filmie); ?path=README.md, tylko wewnątrz folderu projektu."""
    if (g := await agents_guard(request)) is not None:
        return g
    try:
        return cors(request, JSONResponse(get_workflows().project_file(request.path_params["run_id"], request.query_params.get("path") or "README.md")))
    except KeyError as e:
        return cors(request, JSONResponse({"error": str(e).strip("'\"")}, status_code=404))
    except ValueError as e:
        return cors(request, JSONResponse({"error": str(e)}, status_code=400))


def tasklog_path() -> Path:
    return Path(os.environ.get("JARVIS_TASKLOG") or agents_mod.home() / "logs" / "tasks.jsonl")


@mcp.custom_route("/bridge/tasklog", methods=["POST", "OPTIONS"])
async def tasklog(request: Request) -> Response:
    """Dziennik zadań z karty (js/ai.js → J.tasklog) na dysk: %USERPROFILE%\\.jarvis-os\\logs\\tasks.jsonl — do raportu porażek i doctor.ps1."""
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    try:
        e = await read_json(request)
    except agents_mod.AgentError as er:
        return cors(request, JSONResponse({"error": str(er)}, status_code=er.status))
    keep = ("ts", "text", "route", "status", "ms", "tools", "partial", "hermes", "reply", "source", "fail")
    rec = {k: e.get(k) for k in keep if k in e}
    p = tasklog_path()

    def _append() -> None:   # rotacja do 2 MB czyta/pisze cały plik — poza pętlą zdarzeń, żeby nie zamrażać mostu
        p.parent.mkdir(parents=True, exist_ok=True)
        if p.exists() and p.stat().st_size > 2_000_000:   # rotacja: zostaje ostatnia połowa
            lines = p.read_text(encoding="utf-8").splitlines()
            p.write_text("\n".join(lines[len(lines) // 2:]) + "\n", encoding="utf-8")
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    try:
        await asyncio.to_thread(_append)
    except OSError as er:
        return cors(request, JSONResponse({"error": str(er)}, status_code=500))
    return cors(request, JSONResponse({"ok": True}))


@mcp.custom_route("/bridge/events", methods=["GET", "OPTIONS"])
async def events(request: Request) -> Response:
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    client = Browser()

    async def stream():
        # Rejestracja dopiero przy starcie strumienia: jeśli odpowiedź nie dojdzie do skutku,
        # generator się nie uruchomi i nie zostanie „martwy” klient w CLIENTS (finally sprząta tylko uruchomione).
        try:
            CLIENTS[client.id] = client
            _wake_event().set()   # obudź czekające relay(), pojawił się klient
            yield f"retry: 3000\nevent: hello\ndata: {json.dumps({'client': client.id, 'tools': sorted(TOOLS)})}\n\n"
            for evt in agent_replay():   # karta podłączona w trakcie zadania z Telegrama/crona widzi je od początku
                yield f"event: agent\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
            try:
                for evt in get_workflows().replay():   # przebiegi workflow w toku — karta od razu rysuje ich stan
                    yield f"event: workflow\ndata: {json.dumps(evt, ensure_ascii=False, default=str)}\n\n"
            except Exception as e:  # noqa: BLE001 — zły plik definicji nie może zablokować kanału poleceń
                print("[jarvis-bridge] workflow replay:", e, file=sys.stderr)
            while True:
                try:
                    cmd = await asyncio.wait_for(client.queue.get(), 15)
                    kind = cmd.pop("_sse", "cmd")   # „agent” = zdarzenie zadania Hermesa (POST /bridge/agent-event)
                    yield f"event: {kind}\ndata: {json.dumps(cmd, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            CLIENTS.pop(client.id, None)
            for cid, (fut, owner) in list(PENDING.items()):
                if owner == client.id and not fut.done():
                    fut.set_result({"ok": False, "code": "OFFLINE", "text": "Połączenie z kartą Jarvis OS zostało utracone w trakcie polecenia."})   # jawny kod: Hermes i CB wiedzą, co się stało

    return cors(request, StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}))


@mcp.custom_route("/bridge/focus", methods=["POST", "OPTIONS"])
async def focus(request: Request) -> Response:
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    try:
        body = await read_json(request)
    except agents_mod.AgentError as er:
        return cors(request, JSONResponse({"error": str(er)}, status_code=er.status))
    c = CLIENTS.get(str(body.get("client", "")))
    if c:
        c.visible = bool(body.get("visible"))
        if c.visible:
            c.focus_ts = time.time()
    return cors(request, JSONResponse({"ok": bool(c)}))


@mcp.custom_route("/bridge/result", methods=["POST", "OPTIONS"])
async def result(request: Request) -> Response:
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    try:
        body = await read_json(request, limit=512 * 1024)   # wyniki narzędzi bywają większe (np. files_read)
    except agents_mod.AgentError as er:
        return cors(request, JSONResponse({"error": str(er)}, status_code=er.status))
    entry = PENDING.get(str(body.get("id", "")))
    if entry and not entry[0].done():
        entry[0].set_result({"ok": bool(body.get("ok")), "code": body.get("code") or ("OK" if body.get("ok") else "INTERNAL"), "data": body.get("data"), "text": body.get("text")})
    return cors(request, JSONResponse({"ok": True}))


@mcp.custom_route("/bridge/tools", methods=["POST", "OPTIONS"])
async def tools_route(request: Request) -> Response:
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    try:
        body = await read_json(request, limit=1024 * 1024)   # pełny rejestr ~140 narzędzi ze schematami
    except agents_mod.AgentError as er:
        return cors(request, JSONResponse({"error": str(er)}, status_code=er.status))
    tools = body.get("tools") or []
    missing = stale_names(tools)
    if missing:
        print(f"[jarvis-bridge] karta ze starą wersją Jarvisa (brak {len(missing)} narzędzi, np. {missing[0]}) — pominięto jej listę; karta powinna się odświeżyć", file=sys.stderr)
        return cors(request, JSONResponse({"ok": True, "tools": len(TOOLS), "changed": False, "stale": True, "missing": missing[:20]}))
    changed = update_tools(tools)
    if changed:
        print(f"[jarvis-bridge] rejestr narzędzi zmieniony ({len(TOOLS)}) — zrestartuj gateway Hermesa, by je zobaczył", file=sys.stderr)
    return cors(request, JSONResponse({"ok": True, "tools": len(TOOLS), "changed": changed}))


# ---------------------------------------------------------------- agenci lokalni: WWW (Jev + Playwright) i komputer (Jev + Windows)

AGENTS: agents_mod.Agents | None = None


def get_agents() -> agents_mod.Agents:
    global AGENTS
    if AGENTS is None:
        AGENTS = agents_mod.Agents(TOKEN)
        atexit.register(AGENTS.shutdown)   # koniec mostu = koniec agenta WWW i ewentualnego zadania na komputerze
    return AGENTS


async def agents_guard(request: Request) -> Response | None:
    """OPTIONS i uwierzytelnienie; None = można przetwarzać."""
    if request.method == "OPTIONS":
        return cors(request, Response(status_code=204))
    if not authorized(request):
        return cors(request, JSONResponse({"error": "unauthorized"}, status_code=401))
    return None


async def read_json(request: Request, limit: int = 65536) -> dict:
    """Twardy limit na strumieniu — sam Content-Length da się ominąć (transfer chunked)."""
    raw = b""
    async for chunk in request.stream():
        raw += chunk
        if len(raw) > limit:
            raise agents_mod.AgentError("za duże żądanie", 413)
    try:
        body = json.loads(raw or b"{}")
    except ValueError:
        raise agents_mod.AgentError("bad json", 400)
    return body if isinstance(body, dict) else {}


def agent_error(request: Request, e: Exception) -> Response:
    if isinstance(e, agents_mod.AgentError):
        return cors(request, JSONResponse({"error": str(e)}, status_code=e.status))
    return cors(request, JSONResponse({"error": f"błąd agenta: {e}"}, status_code=500))


@mcp.custom_route("/agents/status", methods=["GET", "OPTIONS"])
async def agents_status(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    return cors(request, JSONResponse(await get_agents().status()))


WEB_ACTIONS = {"command": "POST", "confirm": "POST", "pick": "POST", "goto": "POST", "play": "POST", "media": "POST", "read": "GET", "state": "GET"}


@mcp.custom_route("/agents/web/{action}", methods=["GET", "POST", "OPTIONS"])
async def agents_web(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    action = request.path_params["action"]
    if WEB_ACTIONS.get(action) != request.method:
        return cors(request, JSONResponse({"error": "nie ma takiej akcji"}, status_code=404))
    try:
        path, body = f"/agent/{action}", None
        if request.method == "POST":
            body = await read_json(request)
        elif action == "read" and request.query_params.get("max", "").isdigit():
            path += "?max=" + request.query_params["max"]
        return cors(request, JSONResponse(await get_agents().web.call(request.method, path, body)))
    except Exception as e:  # noqa: BLE001 — każdy błąd agenta wraca do strony jako JSON
        return agent_error(request, e)


@mcp.custom_route("/agents/computer/{action}", methods=["GET", "POST", "OPTIONS"])
async def agents_computer(request: Request) -> Response:
    if (g := await agents_guard(request)) is not None:
        return g
    action, comp = request.path_params["action"], get_agents().computer
    try:
        if action == "run" and request.method == "POST":
            b = await read_json(request)
            return cors(request, JSONResponse(await comp.start(b.get("goal"), b.get("steps", 25), b.get("delay", 1.5))))
        if action == "status" and request.method == "GET":
            tail = request.query_params.get("tail", "25")
            return cors(request, JSONResponse(comp.snapshot(int(tail) if tail.isdigit() else 25)))
        if action == "stop" and request.method == "POST":
            return cors(request, JSONResponse(await comp.stop()))
    except Exception as e:  # noqa: BLE001
        return agent_error(request, e)
    return cors(request, JSONResponse({"error": "nie ma takiej akcji"}, status_code=404))


@mcp.custom_route("/agents/webtask/{action}", methods=["GET", "POST", "OPTIONS"])
async def agents_webtask(request: Request) -> Response:
    """Zadanie w internecie na cel (bridge/web_task.py): run / status / stop / confirm."""
    if (g := await agents_guard(request)) is not None:
        return g
    action, wt = request.path_params["action"], get_agents().webtask
    try:
        if action == "run" and request.method == "POST":
            b = await read_json(request)
            try:
                return cors(request, JSONResponse(await wt.start(b.get("goal"), b.get("steps", 12), b.get("seconds", 150))))
            except ValueError as e:
                raise agents_mod.AgentError(str(e), 400)
            except RuntimeError as e:
                raise agents_mod.AgentError(str(e), 409)
        if action == "status" and request.method == "GET":
            return cors(request, JSONResponse(wt.snapshot()))
        if action == "stop" and request.method == "POST":
            return cors(request, JSONResponse(await wt.stop()))
        if action == "confirm" and request.method == "POST":
            b = await read_json(request)
            return cors(request, JSONResponse(wt.decide(b.get("accept") is True)))
    except Exception as e:  # noqa: BLE001
        return agent_error(request, e)
    return cors(request, JSONResponse({"error": "nie ma takiej akcji"}, status_code=404))


@mcp.custom_route("/writer/v1/chat/completions", methods=["POST"])
async def writer_completions(request: Request) -> Response:
    """Model pomocniczy clickera (OpenAI-compatible): darmowe modele OpenRouter z łańcuchem awaryjnym, na końcu Hermes. Tylko z tokenem mostu."""
    auth = request.headers.get("authorization", "")
    if not (auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], TOKEN)) and not authorized(request):
        return JSONResponse({"error": {"message": "unauthorized"}}, status_code=401)
    try:
        body = await read_json(request, limit=512 * 1024)   # kontekst planisty bywa spory, ale nie nieograniczony
        if not isinstance(body.get("messages"), list):
            raise ValueError("brak messages")
    except agents_mod.AgentError as er:
        return JSONResponse({"error": {"message": str(er)}}, status_code=er.status)
    except ValueError:
        return JSONResponse({"error": {"message": "bad json"}}, status_code=400)
    try:
        reply, used = await writer_proxy.complete(body, agents_mod.openrouter_key(), log=lambda *a: print("[jarvis-bridge]", *a, file=sys.stderr))
    except RuntimeError as e:
        return JSONResponse({"error": {"message": str(e)}}, status_code=502)
    reply["x_jarvis_model"] = used
    return JSONResponse(reply)


class BearerGate:
    """Ścieżka /mcp wymaga nagłówka Authorization: Bearer <token>."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if WF is None and scope["type"] == "http":   # pierwszy ruch po starcie (np. ping Hermesa co ~45 s): wznów przerwane workflow
            try:
                get_workflows()
            except Exception as e:  # noqa: BLE001 — zła definicja nie może zablokować mostu
                print("[jarvis-bridge] workflow start:", e, file=sys.stderr)
        if scope["type"] == "http" and scope["path"].startswith("/mcp"):
            auth = dict(scope["headers"]).get(b"authorization", b"").decode()
            if not (auth.startswith("Bearer ") and secrets.compare_digest(auth[7:], TOKEN)):
                await JSONResponse({"error": "unauthorized"}, status_code=401)(scope, receive, send)
                return
            prof = dict(scope["headers"]).get(b"x-jarvis-profile", b"").decode()[:64]
            if prof:
                HERMES_SEEN[prof] = time.time()
            # testy E2E (bridge/tests) oznaczają się nagłówkiem — ich polecenia nie zaśmiecają czatu użytkownika w karcie
            QUIET.set(dict(scope["headers"]).get(b"x-jarvis-quiet", b"") == b"1")
        await self.app(scope, receive, send)


def build_app(host: str = "127.0.0.1"):
    app = mcp.streamable_http_app(host=host, stateless_http=True, json_response=True)
    return BearerGate(app)


def main() -> None:
    global TOKEN, ORIGINS, ALLOWED_HOSTS
    ap = argparse.ArgumentParser(description="Jarvis OS <-> Hermes MCP bridge")
    ap.add_argument("--host", default=os.environ.get("JARVIS_BRIDGE_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("JARVIS_BRIDGE_PORT", "8651")))
    ap.add_argument("--show-token", action="store_true", help="wypisz token i zakończ")
    ap.add_argument("--log-level", default=os.environ.get("JARVIS_BRIDGE_LOG_LEVEL", "warning"), choices=["critical", "error", "warning", "info", "debug"], help="szczegółowość logów serwera (diagnoza: info)")
    args = ap.parse_args()
    TOKEN = load_token()
    load_tools()
    ORIGINS = DEFAULT_ORIGINS + [o.strip() for o in os.environ.get("JARVIS_BRIDGE_ORIGINS", "").split(",") if o.strip()]
    ALLOWED_HOSTS = {f"127.0.0.1:{args.port}", f"localhost:{args.port}"}
    if args.host not in ("127.0.0.1", "localhost", "::1") and os.environ.get("JARVIS_BRIDGE_ALLOW_LAN") != "1":
        print("[jarvis-bridge] ODMOWA STARTU: host " + args.host + " wystawia most (sterowanie komputerem) poza ten komputer.\n"
              "Jeśli na pewno tego chcesz, ustaw JARVIS_BRIDGE_ALLOW_LAN=1 i dopisz pełny host:port do JARVIS_BRIDGE_ORIGINS.", file=sys.stderr)
        sys.exit(2)
    if args.show_token:
        print(TOKEN)
        return
    print(f"[jarvis-bridge] {len(TOOLS)} narzędzi | MCP: http://{args.host}:{args.port}/mcp  |  przeglądarka: /bridge/events  |  token: {token_path()}", file=sys.stderr)
    uvicorn.run(build_app(args.host), host=args.host, port=args.port, log_level=args.log_level)


if __name__ == "__main__":
    main()
