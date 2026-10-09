# E2E testy mostu MCP ↔ karta Jarvis OS

Zestaw testów end-to-end, które uderzają w **prawdziwy** most MCP na
`http://127.0.0.1:8651` i **prawdziwą** kartę PWA na `http://localhost:4000`.
Nic nie jest mockowane poza testem offline-flow (który stawia własną instancję
mostu na `:18652` bez klienta SSE).

## Wymagania

-   Most MCP działa na `127.0.0.1:8651` (`python bridge/jarvis_bridge.py`)
-   Karta PWA otwarta na `http://localhost:4000` z włączonym mostem w Ustawieniach
-   Token mostu w `~/.jarvis-os/bridge-token` (tworzony przy pierwszym uruchomieniu mostu)
-   Python 3.11+ z pakietami: `requests` (stdlib reszta)

> Testy, które wymagają importu `jarvis_bridge` (offline-flow, circuit-breaker,
> race-fix), muszą być uruchamiane z **venv Hermesa** — `jarvis_bridge.py`
> importuje `mcp.server.mcpserver`, którego nie ma w systemowym Pythonie:
>
>     %USERPROFILE%\\.hermes\\hermes-agent\\venv\\Scripts\\python.exe ^
>         bridge\\tests\\run_e2e.py
>
> Testy z samym JSON-RPC przez `requests` (happy-path, write-flow, window-flow,
> widget-flow, alert-flow) działają też w systemowym Pythonie, jeśli ma `requests`.

## Szybki start

```bash
# pełen pakiet (happy + write + window + widget + alert + offline + inne)
python bridge/tests/run_e2e.py

# tylko wybrany plik
python bridge/tests/run_e2e.py test_happy_path
python bridge/tests/run_e2e.py test_offline_flow

# bez kolorów (logi, CI)
python bridge/tests/run_e2e.py --no-color

# z dodatkowym verbose z unittest
python bridge/tests/run_e2e.py -v
```

Exit code: **0** = wszystko OK, **1** = coś faktycznie padło (FAIL lub ERROR).
Skip (karta zamknięta, brak klienta) nie zmienia exit code — to nie jest awaria.

## Struktura

```
bridge/tests/
├── __init__.py
├── e2e_client.py            # wspólny helper: MCPClient, preflight, kolory
├── run_e2e.py               # runner z kolorowym PASS/FAIL/ czasem per test
├── test_happy_path.py       # read-only: get_status, get_datetime, calculate
├── test_write_flow.py       # create_note → notes_list → notes_update (marker)
├── test_window_flow.py      # open_app notes → wm_list → wm_minimize (cleanup)
├── test_widget_flow.py      # create_widget → check_item → widgets_update (marker)
├── test_alert_flow.py       # market_watch BTC absurdalny → list → remove
└── test_offline_flow.py     # izolowany most :18652 bez klienta → OFFLINE
```

## Pre-flight

Każdy test przed uruchomieniem sprawdza trzy rzeczy (`e2e_client.preflight`):

1. **Most żyje**: `GET /bridge/status` z tokenem → `ok=true`
2. **PWA odpowiada**: `GET http://localhost:4000` → `HTTP 200`
3. **Jest klient SSE**: most zgłasza `clients ≥ 1` (aktywna karta)

Jeśli którykolwiek warunek zawiedzie, test rzuca `unittest.SkipTest` z
komunikatem „pre-flight nie przeszedł”. To chroni przed false-negative gdy
karta jest zamknięta lub most padł — operator dostaje czytelną przyczynę.

## Cleanup

Ponieważ `notes_delete`, `widgets_remove`, `close_app(all)` wymagają
**potwierdzenia użytkownika** w karcie (chip `#askChip`), a my nie mamy
głownej przeglądarki do kliknięcia „Tak”, cleanup pozostawia **marker
w postaci**:

-   notatka → `notes_update` (tytuł `__E2E_LEFTOVER_<ts>__`) + `notes_folder`
    do katalogu `e2e-leftovers`
-   widget → `widgets_update` (tytuł `__E2E_LEFTOVER_WIDGET_<ts>__`)
-   alert → `market_alerts remove` (autonomiczny, bez confirm)
-   okno notes → `wm_minimize` (bez confirm dla pojedynczego okna)

Po każdym przebiegu `run_e2e.py` woła narzędzie **`e2e_cleanup`**, które usuwa bez pytania
WYŁĄCZNIE obiekty o zastrzeżonych nazwach testów (`__E2E_LEFTOVER_…`, `E2E drill widget <ts>`,
`E2E test note <ts>`). Klient testów wysyła też nagłówek `X-Jarvis-Quiet: 1`, więc polecenia
testów nie pojawiają się w czacie użytkownika w karcie.

## Co NIE jest testowane

Świadomie poza zakresem (per zadanie kanban):

-   mockowanie mostu / rejestru / przeglądarki — testy muszą widzieć realny łańcuch
-   akcje agent-web / `computer_use` — wymagają Playwright / CDP, osobna ścieżka
-   read-only narzędzia bez mutacji poza happy-path — pokryte w drillu t_a45fbbc8

## Diagnostyka

```bash
# tylko pre-flight (bez uruchamiania testów)
python bridge/tests/e2e_client.py
# lub
python -c "from e2e_client import preflight; print(preflight().summary())"

# konkretny test z pełnym tracebackiem
python bridge/tests/run_e2e.py test_write_flow -v
```
