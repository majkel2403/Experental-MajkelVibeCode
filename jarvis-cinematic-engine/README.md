# Jarvis OS

Wirtualne środowisko AI w przeglądarce — neonowy pulpit HUD sterowany przez agenta **Jarvis**, głosem lub tekstem.
Czysty HTML/CSS/JS, bez builda i bez zależności: wystarczy otworzyć `index.html` albo wdrożyć na GitHub Pages.

Zasada projektu: **nic „na niby”**. Każda karta HUD, każdy impuls, plan, sygnał i liczba w telemetrii pochodzi z realnego zdarzenia lub pomiaru.

## Co potrafi

| | |
|---|---|
| **Animacja startowa** | reaktor łukowy, siatka HUD, log rozruchu z procentem, syntezowany dźwięk, powitanie głosowe |
| **Core** | żywa kula z orbitami, wiązką i odbiciem w jeziorze; pierścienie HUD reagujące na stan (czuwam / słucham / analizuję / działam / czekam na zgodę / pauza / błąd); wokół Core **10 kart** zasilanych wyłącznie zdarzeniami Event Busa |
| **Dashboard agenta** | pasek górny: segmentowy wskaźnik trybu wprost z maszyny stanów, status Hermesa, licznik narzędzi, FPS, zegar; **Telemetria** (zwijana, `Alt+3`): pogoda, zegar, wykres aktywności agenta, FPS, pamięć, sieć, bateria, zadania, akcje, czas pracy, okna |
| **Jarvis ↔ Hermes** | mózgiem jest **Hermes Agent** (Nous Research) albo dowolny serwer OpenAI-compatible z modelem Hermes. Model dostaje w każdej turze **Context Packet** (stan pulpitu, aktywna aplikacja, widgety, notatki, zadania, minutnik, sygnały, profil) i steruje systemem przez **ponad 130 narzędzi** z Command Registry (aktualna liczba: `bridge/tools.json`); wywołania w formacie `<tool_call>` **albo** natywnym `tool_calls` (autodetekcja) |
| **Sędzia Jev** | opcjonalny model decyzyjny **Jev** (TypeSafe AI, „System One”) przez OpenRouter: w ~200 ms ocenia intencję wypowiedzi z kalibrowaną pewnością, ryzyko działania, dwuznaczność i to, czy chodzi o aktywne okno. Wysoka pewność = wykonanie z rejestru bez czekania na Hermesa, reszta = Hermes z podpowiedzią `<judge>` (bez Hermesa albo w trybie „zawsze pytaj” — pytanie „Chodzi o…?”). Rozstrzyga też, którą notatkę lub zadanie masz na myśli, weryfikuje odpowiedzi Hermesa względem wyników narzędzi (stan WERYFIKACJA) i ocenia pilność sygnałów w trybie aktywnym. Klucz OpenRouter w Ustawieniach, poziomy prywatności, autonomia z przyciskiem „Cofnij”, budżet, tryb cienia; bez klucza wszystko działa jak dotąd |
| **Command Registry** | jedno źródło prawdy: każde polecenie ma schemat, poziom ryzyka, przykłady PL i z tego samego wpisu powstają narzędzie dla modelu, wzorce silnika lokalnego, pozycja palety `Ctrl+K` i opis „co potrafisz” |
| **Silnik lokalny** | działa bez modelu: dopasowanie do przykładów z rejestru z rozumieniem czasu („za 20 minut”, „w piątek o 9”, „o osiemnastej trzydzieści”), łańcuchy („otwórz notatnik i ustaw minutnik 5 minut”), procenty, jednostki |
| **Narzędzia** | notatki (lista/odczyt/szukaj/dopisz/zmień/usuń), zadania (lista/dodaj/odhacz/przełóż/odłóż/usuń), okna (lista/aktywuj/minimalizuj/przyciągnij/kafelkuj/układy), widgety (lista/zmień/usuń), minutnik (start/stop/przedłuż/status), pogoda, kursy krypto i **alerty kursów**, kalkulator, strony WWW, schowek, ustawienia, terminal, pamięć, pliki, wskazywanie elementów, pytania do użytkownika |
| **Uprawnienia** | narzędzia ryzykowne (usuwanie, zamknięcie wszystkiego, obce adresy, schowek) wymagają zgody: chip **Tak / Nie / Zawsze** przy Core, szybkie odpowiedzi w czacie i głos; model dostaje `DENIED`, gdy odmówisz |
| **Plan i pytania** | model deklaruje plan (`<plan>`) widoczny jako lista kroków w Process Log i karcie „Logika”; przy dwuznaczności pyta (`ui_ask`) zamiast zgadywać; długie zadania wstrzymują się z pytaniem „kontynuować?” (budżet tur, narzędzi, czasu) |
| **Pamięć i ciągłość** | historia rozmowy i czat w IndexedDB (wracają po odświeżeniu), streszczenie kroczące długich rozmów, fakty o użytkowniku („zapamiętaj, że…”) wstrzykiwane do kontekstu |
| **Sygnały i proaktywność** | minutnik, przypomnienia (także zaległe po powrocie do karty), alerty kursów, zmiany połączenia trafiają do **centrum powiadomień** (`Alt+N`) i do następnej rozmowy; w trybie **aktywnym** Jarvis sam zaczyna rozmowę (limit/h, cisza nocna); rutyny: poranny briefing i podsumowanie dnia |
| **Głos 2.0** | pojedyncze nasłuchiwanie (`Ctrl+Spacja`) albo **czuwanie ze słowem „Jarvis, …”** (`Alt+J`); kolejka mowy z priorytetami, alarm nie ucina odpowiedzi; odpowiedzi na pytania głosem; cichy tryb głosowy |
| **Okna** | przeciąganie z przyciąganiem do krawędzi (podgląd), kafelkowanie, `Alt+strzałki`, `Alt+Enter`, `Alt+W` (następne), układy zapisane i presety (praca, rynek, skupienie, czysto) |
| **Workflow** | powtarzalne procesy pracy z kroków (`workflows/*.yaml`): silnik w moście sprawdza każdy krok, ponawia ze zmianą, pilnuje budżetu i wznawia po restarcie; przebieg na żywo w czacie i jako **film** na cały ekran („pokaż film”; moduł scenariuszy: [docs/guide/film.md](docs/guide/film.md)); np. „zrób projekt z pomysłu …” → brief, architektura, struktura i szkielet projektu; **Film** — przebieg na cały ekran jak scena z filmu (na żywo z pisaniem Hermesa albo z zapisu, lektor Jarvis), **Film dnia** — montaż całego dnia ([przewodnik](docs/guide/workflow.md)) |
| **Process Log** | polecenie, myśli modelu, zapytania, narzędzia z argumentami i wynikami, plan, błędy, czasy; historia z eksportem i **Replay** na Core |
| **Aplikacje** | Czat (przypinanie odpowiedzi jako widget), Notatnik, Monitor rynku (Binance WebSocket + CoinGecko), Harmonogram (import `.ics`), Pogoda (Open-Meteo), Monitor systemu, Terminal, Kalkulator, Minutnik/Stoper, Ustawienia, Biblioteka |
| **Pliki** | folder roboczy przez File System Access (Chrome/Edge): lista, odczyt, zapis, eksport notatek do `.md` |
| **Wydajność** | rysowanie zatrzymane w tle, adaptacyjna jakość efektów przy niskim FPS, ping Hermesa z backoffem, WebSocket rynku pauzowany w tle, Wake Lock przy minutniku i czuwaniu |
| **PWA** | instalowalna, działa offline (service worker), powiadomienie o nowej wersji |

Wszystkie dane (notatki, zadania, ustawienia, pamięć, rozmowa) są zapisywane lokalnie w przeglądarce; można je wyeksportować i zaimportować w Ustawieniach.

## Uruchomienie

```bash
python bridge/serve_site.py 8080     # serwer strony z walidacją Host (chroni config.local.js przed DNS rebinding)
# → http://localhost:8080
```

Na komputerze z Hermesem strona, most i gateway startują same przy logowaniu (`bridge\install-autostart.ps1`, strona na `:4000`).
Zadziała też dowolny statyczny serwer albo `index.html` otwarty z dysku (wtedy bez PWA i trybu offline).

## Wdrożenie

Na tym komputerze: zmiany strony działają po odświeżeniu karty (service worker podbija wersję), zmiany mostu i Hermesa wdraża
`bridge\redeploy.ps1`. Publikacja na **GitHub Pages** jest ręczna: *Actions → „Wdrożenie na GitHub Pages” → Run workflow*
(jednorazowo włącz *Settings → Pages → Source: GitHub Actions*). Wersja z Pages działa bez Hermesa Desktop — most
przyjmuje tylko stronę z tego komputera.

## Architektura w skrócie

```
Telegram / cron ──► Hermes Agent (profil jarvis-desktop, :8643) ──MCP──► most bridge/jarvis_bridge.py (:8651) ◄──SSE/HTTP──► Jarvis OS (karta, :4000)
                     │ MiniMax-M3 + fallbacki                         │ polecenia pulpitu → karta (Command Registry)
                     │ wtyczka jarvis-events ──► /bridge/agent-event ─┤ zadania Hermesa → Orb i Process Log
                     └─────────── czat z karty przez /bridge/v1 ◄─────┘ klucz gatewaya zostaje w moście
                                                                        agenci Jeva: przeglądarka (Chrome CDP) i komputer (clicker)
```

- **Jarvis OS** (ta strona) — pulpit, okna, widgety, notatki, zadania, głos, Orb, Process Log; wykonuje polecenia z **Command Registry** (`js/registry.js`, `js/commands*.js`).
- **Most** (`bridge/`) — wystawia polecenia rejestru Hermesowi jako narzędzia MCP, przekazuje je do karty, pośredniczy w czacie z Hermesem i uruchamia agentów Jeva.
- **Hermes** (`hermes/`) — profil `jarvis-desktop` budowany z repo przez `hermes/apply_profile.py` (konfiguracja, `SOUL.md`, `HERMES.md`, wtyczki, hak blokad, strażnik konfiguracji).

Szczegóły: [Hermes i most MCP](docs/guide/hermes-i-most.md) · [Decyzje architektoniczne](docs/adr/README.md) · [Agenci Jeva — internet i prawdziwy komputer](docs/guide/agenci-jeva.md) · [Sędzia Jev](docs/guide/jev.md) · [Workflow](docs/guide/workflow.md) · [Specyfikacja](docs/spec/README.md) · [Archiwum dawnych planów](docs/archiwum/README.md).

## Hermes — szybki start (Windows, bez WSL)

```powershell
powershell -ExecutionPolicy Bypass -File hermes\install-profile.ps1 -DryRun   # podgląd
powershell -ExecutionPolicy Bypass -File hermes\install-profile.ps1           # profil jarvis-desktop + konfiguracja z repo
powershell -ExecutionPolicy Bypass -File bridge\install-autostart.ps1         # most, strona i gateway przy logowaniu (+ watchdog co 5 min)
```

Zmiana konfiguracji Hermesa = zmiana w `hermes/` i ponowne `apply_profile.py` (z venv Hermesa); sprawdzenie:
`%USERPROFILE%\.hermes\hermes-agent\venv\Scripts\python.exe %USERPROFILE%\.hermes\profiles\jarvis-desktop\scripts\config_guard.py --verbose`.
Wdrożenie zmian mostu i Hermesa bez restartu komputera: `bridge\redeploy.ps1`.

Jarvis OS łączy się z Hermesem sam (przez most) — w Ustawieniach nie trzeba wpisywać klucza. Inne źródła modelu (Nous Portal, Ollama, OpenRouter) opisuje [przewodnik](docs/guide/hermes-i-most.md).

## Skróty klawiszowe

| Skrót | Akcja |
|---|---|
| `Ctrl K` / `/` | paleta poleceń (dopasowanie rozmyte, ostatnie, wykonanie polecenia lokalnego) |
| `Ctrl Spacja` | mów do Jarvisa |
| `Alt J` | czuwanie ze słowem wybudzającym „Jarvis” |
| `Alt 1` / `Alt 2` / `Alt 3` | czat / Process Log / telemetria |
| `Alt N` | centrum powiadomień |
| `Alt W` | następne okno · `Alt ←→↑↓` przyciągnij okno · `Alt Enter` maksymalizuj |
| `Esc` | zamknij okno / panel / anuluj pytanie / przerwij mowę |
| Prawy przycisk | menu kontekstowe pulpitu i skrótów |

## Testy

```bash
npm test                                  # testy jednostkowe JS (rejestr, silnik lokalny, NLP, most, zdarzenia, kontekst)
npm run test:e2e                          # test dymny w Chromium (Playwright): boot → polecenia → zgody → trwałość
npm run test:web-agent                    # agent WWW: prawdziwy Chromium + atrapa Jeva (bez klucza i internetu)
python -m pytest                          # Python (z venv Hermesa): most, agenci, planista, writer, wtyczki jarvis-events i obsidian-brain, clicker
python -m pytest -m unit                  # tylko testy Pythona bez sieci i bez venv Hermesa (tak jak w CI)
python bridge/tests/run_e2e.py            # most na żywo z otwartą kartą (sprząta po sobie)
python hermes/evals/run_evals.py          # evale zachowania Hermesa na żywym gatewayu (polecenia bez skutków ubocznych)
python hermes/scripts/metrics_report.py   # metryki z historii rozmów: czasy, kroki, tokeny, model zapasowy, błędy
```

CI (`.github/workflows/ci.yml`) przy każdym pushu: składnia JS, testy jednostkowe JS, test dymny w Chromium i testy jednostkowe Pythona (Windows).
`npm run typecheck` uruchamia sprawdzanie typów (`tsc --noEmit`).

## Struktura

```
index.html, css/, js/       interfejs Jarvis OS (bez builda; kolejność skryptów w index.html i sw.js)
  js/registry.js            Command Registry: schematy, koercja, uprawnienia, dopasowanie PL, NLP czasu
  js/commands*.js           polecenia (narzędzia modelu)
  js/events.js              Event Bus i maszyna stanów agenta (Orb, HUD)
  js/process.js             Process Log
  js/ai.js                  silnik lokalny + pętla Hermesa
  js/bridge.js              klient mostu: polecenia Hermesa, zadania z Telegrama, połączenie przez pośrednika
  js/judge.js, jev-*.js     sędzia Jev i jego polityka
  js/agents.js              agenci Jeva (internet, prawdziwy komputer)
  js/main.js, apps*.js      start, pulpit, aplikacje
sw.js                       service worker (offline; numer wersji CACHE podbijany przy zmianach plików)
bridge/                     most MCP (Python): jarvis_bridge.py, workflow_engine.py, day_history.py, agents.py, web_task.py, writer_proxy.py, winfocus.py,
                            serve_site.py, skrypty Windows (run-service, install-autostart, redeploy), testy
workflows/                  definicje workflow (*.yaml) + schemat; silnik: bridge/workflow_engine.py
integrations/               agenci Jeva: setup.ps1, set-key.ps1, doctor.ps1, agent WWW (web/agent.mjs), clicker, łatki, testy
hermes/                     profil Hermesa: SOUL.md, HERMES.md, apply_profile.py, install-profile.ps1,
                            plugins/ (jarvis-events, obsidian-brain — sejf Obsidian na start rozmowy), scripts/ (+ skrypty i crony sejfu Obsidian) (strażnik, hak blokad, health-check, raport poranny), tests/
docs/                       specyfikacja (spec/), przewodniki (guide/), decyzje (adr/), plan Jeva, archiwum planów (archiwum/)
tests/                      testy jednostkowe (Node), test dymny (Playwright), zbiory zdań
tools/                      generator katalogów specyfikacji (gen-spec.js) i narzędzia pomocnicze
```

## Bezpieczeństwo i prywatność

- **Klucz Hermesa nie trafia do przeglądarki.** Karta rozmawia z Hermesem przez most (`/bridge/v1`), uwierzytelniając się tokenem mostu; klucz gatewaya (agent z terminalem i plikami) dokłada most.
- **CSP:** strona wykonuje wyłącznie skrypty z własnych plików — wstrzyknięty HTML nie uruchomi kodu.
- **Klucze API** (Jev/OpenRouter) zostają tylko w tej przeglądarce (`localStorage`); model ich nie dostaje (narzędzie ustawień je pomija), eksport kopii zapasowej je usuwa. Klucz w adresie podawaj po `#` (`index.html#jevKey=…`), nie po `?`.
- **Most** nasłuchuje tylko na `127.0.0.1`; `/mcp` wymaga tokenu Bearer, kanał przeglądarki — tokenu i dozwolonego Origin; nagłówek `Host` jest sprawdzany (DNS rebinding).
- **Ryzykowne działania** (usuwanie, zamykanie wszystkich okien, obce adresy, schowek, pliki, prawdziwy komputer) wymagają zgody — na pulpicie albo, gdy Ciebie przy nim nie ma, w rozmowie (Hermes pyta i wywołuje ponownie dopiero po „tak”). Nieodwracalne — wyłącznie na pulpicie.
- **Hermes:** Telegram przyjmuje tylko ID z listy `TELEGRAM_ALLOWED_USERS`; hak `pre_tool_call` blokuje zabijanie przeglądarki i restart gatewaya z jego własnego terminala; strażnik konfiguracji sprawdza codziennie ustawienia bezpieczeństwa.
- **Sędzia Jev** domyślnie na poziomie prywatności P1 (bez tytułów notatek, widgetów i profilu).
- **Zapis danych:** gdy przeglądarka odmówi zapisu (brak miejsca, tryb prywatny), Jarvis ostrzega zamiast milczeć.
