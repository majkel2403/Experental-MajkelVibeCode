# Podłączenie Hermesa

> Przeniesione z README.md (2026-10-04). Krótki opis i szybki start: [README](../../README.md).

Jarvis rozmawia z Hermesem przez API zgodne z OpenAI (`/v1/chat/completions`, strumień SSE). Konfiguracja: **Ustawienia → Hermes · Nous Research**.
Zalecana i domyślna droga to **profil `jarvis-desktop` z mostem MCP** (niżej). Bezpośrednie połączenie ze zwykłym serwerem Hermesa
albo innym modelem opisuje sekcja [Inne źródła modelu](#inne-źródła-modelu-hermes).

## Hermes Desktop — natywne narzędzia przez most MCP (domyślnie, Windows bez WSL)

Hermes Agent **ignoruje** pole `tools` z zapytania klienta, więc najpewniejsza droga to narzędzia MCP. Most `bridge/jarvis_bridge.py` wystawia Hermesowi **wszystkie polecenia z Command Registry** jako `mcp__jarvis_desktop__*` (te same schematy, walidacja, zgody Tak / Nie / Zawsze i Process Log co przy poleceniach lokalnych). Pętlę narzędzi prowadzi Hermes; wynik każdego narzędzia wraca do niego jako koperta `{ok, code, data, text}`.

```
                ┌── czat: POST /bridge/v1/chat/completions (token mostu) ──┐
Jarvis OS ──────┤                                                          ▼
(przeglądarka)  │◄── SSE /bridge/events: cmd (polecenia) · agent (zadania) ── bridge/jarvis_bridge.py (127.0.0.1:8651)
   │            └── wynik POST /bridge/result ─────────────────────────────►   │  ▲ MCP /mcp (Bearer)   │ klucz API dokłada most
   │                                                                           │  │                      ▼
   └─────────────────────── Telegram / cron ──► Hermes gateway (profil jarvis-desktop, :8643)
                                                 └─ wtyczka jarvis-events → POST /bridge/agent-event (zadania na Orbie i w Process Logu)
```

1. **Most:** `bridge\start-bridge.bat` (zostaw uruchomiony). Token jest w `%USERPROFILE%\.jarvis-os\bridge-token`; strona pobiera go sama (parowanie tylko dla dozwolonego Origin).
2. **Profil Hermesa:** `powershell -ExecutionPolicy Bypass -File hermes\install-profile.ps1 -DryRun`, potem bez `-DryRun`. Tworzy profil (klon aktywnego, **bez kanałów**) i uruchamia `hermes\apply_profile.py`, który wgrywa docelową konfigurację z repo ([ADR 0002](../adr/0002-docelowa-konfiguracja-hermesa.md)): most MCP, pełny zestaw narzędzi (terminal, pliki, kod, skille, pulpit — wszystkie widoczne wprost, bez `tool_search`, [ADR 0006](../adr/0006-narzedzia-pulpitu-wprost-i-straznik-czynnosci.md)), wtyczki (m.in. `jarvis-events`, `rtk-rewrite`, `security-guidance`), `SOUL.md` (tylko tożsamość), `HERMES.md` (zasady pracy) w katalogu roboczym `%USERPROFILE%\JarvisWorkspace`, hak blokad i limity (kompresja przy 120 tys. tokenów, sesja wygasa po 2 h ciszy). Każdą późniejszą zmianę wprowadzasz w repo i ponownie uruchamiasz `apply_profile.py`; strażnik `scripts\config_guard.py` (cron 7:50) zgłasza odstępstwa.
3. **Gateway:** `hermes\start-desktop-gateway.bat` (API na `:8643`).
4. **Jarvis OS:** łączy się z Hermesem sam — karta pyta most (`/bridge/hermes`) i rozmawia przez pośrednika `/bridge/v1`, a **klucz gatewaya zostaje w moście** (nie trafia do przeglądarki ani do `config.local.js`). Tryb MCP włącza się sam, gdy profil zgłosi się do mostu (*Ustawienia → Most pulpitu dla Hermesa*).

Lista narzędzi, którą Hermes widzi od startu, to migawka `bridge/tools.json` (tylko do odczytu, pilnowana testem). Po zmianie `js/commands.js` odśwież ją: `node bridge/export-tools.js`; otwarta karta i tak zgłasza mostowi aktualne opisy (most zapisuje je w `%USERPROFILE%\.jarvis-os\tools.runtime.json`), a Hermes zobaczy zmianę po restarcie gatewaya. Testy mostu (odizolowany most + prawdziwy klient MCP + atrapa gatewaya): `python -m pytest` z venv Hermesa. Autostart mostu, strony i gatewaya: `bridge\install-autostart.ps1`; wdrożenie zmian: `bridge\redeploy.ps1`.

> **Bezpieczeństwo mostu:** nasłuchuje tylko na `127.0.0.1`; `/mcp` wymaga tokenu Bearer, kanał przeglądarki — tokenu i dozwolonego Origin (CORS + Private Network Access); polecenia trafiają do widocznej / ostatnio aktywnej karty.

### Zgody Hermesa a pytania o komputer (`system_info`)

Hermes ocenia niebezpieczne polecenia terminala przez `approvals` (dokumentacja: *user-guide/security*). Sesje **bez człowieka**
(`api_server` — czyli karta Jarvisa i evale, webhooki) są rozstrzygane natychmiast przez `approvals.unattended_mode` (domyślnie i u nas
`deny`, zapisane wprost w `hermes/apply_profile.py`): polecenie z listy niebezpiecznych jest odrzucane, chyba że jego klucz reguły
jest w `command_allowlist`. U nas jest tam `script execution via heredoc` i `execute_code`, **nie ma** `script execution via -e/-c flag`
— więc `powershell -c "Get-PSDrive …"` jest odrzucane (a model próbował wtedy obejść to zapisem skryptu do pliku; audyt 2026-10-05).
Szerokie dopuszczenie `-c` byłoby ryzykowne, dlatego pytania o stan komputera obsługuje narzędzie **`system_info`**: tylko odczyt,
działa w moście (bez karty, bez powłoki, bez zapisu), zwraca wolne miejsce na dyskach stałych, RAM, obciążenie procesora, czas
działania i 5 największych programów (sama nazwa i MB — bez ścieżek i właścicieli). Ten sam odczyt dla karty: `GET /bridge/system?drive=C`
(token mostu), a w czacie „ile mam miejsca na dysku”. Reguła dla Hermesa jest w `hermes/HERMES.md`, a eval `miejsce-na-dysku` pilnuje,
że odpowiada jednym narzędziem i bez skryptów.

`security.tirith_enabled: true` nie daje na Windows żadnej ochrony: dokumentacja mówi wprost, że Tirith nie ma gotowej wersji dla Windows
i jest po cichu pomijany. Jedyną blokadą treści poleceń u nas są wzorce Hermesa i hak `scripts/guard_tools.py` (przeglądarka, restart gatewaya).

## Inne źródła modelu Hermes

Bez mostu karta łączy się z serwerem bezpośrednio, a narzędzia pulpitu opisuje modelowi w prompcie (format `<tool_call>`
albo natywne `tool_calls`).

| Tryb | Adres | Model | Narzędzia |
|---|---|---|---|
| Zwykły Hermes Agent | `http://localhost:8642/v1` (`hermes gateway`) | `hermes-agent` | `<tool_call>` |
| Nous Portal | `https://inference-api.nousresearch.com/v1` | `Hermes-4-405B`, `Hermes-4-70B` | `<tool_call>` |
| Ollama / LM Studio / vLLM | np. `http://localhost:11434/v1` | np. `hermes3` (Ollama: ustaw `OLLAMA_ORIGINS` na adres Jarvisa) | natywne `tool_calls` lub `<tool_call>` (auto) |

Dla zwykłego Hermes Agent włącz w `~/.hermes/.env` serwer API i wpuść adres strony:
```bash
API_SERVER_ENABLED=true
API_SERVER_KEY=twój-tajny-klucz
API_SERVER_CORS_ORIGINS=http://localhost:4000   # adres, pod którym otwierasz Jarvis OS
```
W Jarvis OS wpisz ten sam klucz i kliknij **Połącz i testuj** — test sprawdza połączenie i wykrywa format narzędzi.
(Nagłówek `X-Hermes-Session-Key` nie jest wysyłany: Hermes Agent 0.21 nie dopuszcza go w CORS.)

W tym trybie klucz jest przechowywany wyłącznie w `localStorage` tej przeglądarki (eksport kopii zapasowej go pomija) — dlatego
domyślną drogą jest most, który trzyma klucz u siebie ([ADR 0003](../adr/0003-klucz-hermesa-przez-most.md)). Gdy Hermes nie
odpowiada lub odrzuca klucz, polecenie wykonuje lokalny silnik, a w czacie pojawia się ostrzeżenie. `Esc` przerywa generowanie odpowiedzi.

## Jak model „widzi” Jarvis OS

Każda wiadomość użytkownika jest poprzedzona blokiem `<environment>{…}</environment>` — zwięzłym JSON-em ze stanem środowiska, wysyłanym jako różnica względem poprzedniej tury. Wyniki narzędzi wracają jako `{name, ok, code, data, text}` z kodami `OK · NOT_FOUND · AMBIGUOUS · INVALID_ARGS · DENIED · DUPLICATE · OFFLINE · TIMEOUT · UNSUPPORTED · INTERNAL`, a prompt systemowy zawiera reguły groundingu (nie twierdź, że coś zrobiłeś, bez `ok=true`; odczytaj przed zmianą; pytaj przy dwuznaczności). Szczegóły: [docs/spec/11-agent.md](../spec/11-agent.md) i [katalog poleceń](../spec/katalog-polecen.md).
