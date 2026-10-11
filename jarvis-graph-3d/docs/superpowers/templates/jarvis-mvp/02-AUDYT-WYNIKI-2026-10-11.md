# Jarvis MVP — AUDYT STANU FAKTYCZNEGO (11.10.2026)

**Rodzaj:** raport wykonany, wyłącznie odczyt. **System:** laptop Windows `LAPTOP-B4NPR9O5`.  
**Wykonawca:** ChatGPT przez autoryzowane narzędzie Remote Desktop Commander.  
**Zakres:** porty, procesy, katalogi/profil, Git, identyfikacja mechanizmów zdarzeń i istniejących magazynów — bez modyfikacji plików, uruchamiania/zatrzymywania usług, pozyskiwania sekretów, testów E2E i zrzutów prywatnych danych.
**Klasy dowodów:** `RUNTIME-METADATA VERIFIED` = odczyt aktualnego stanu systemu; `LOCAL-SOURCE VERIFIED` = odczyt lokalnego kodu; `UNKNOWN` = tego nie sprawdzono. Stan jest migawką z 11 października 2026 r., nie gwarancją dalszej dostępności.

## 1. Jednozdaniowy wynik

**Istnieje aktywny lokalny Jarvis (PWA, Bridge i proces Hermes gateway), ale nie ma dowodu spełnienia kryterium MVP „polecenie → wykonanie narzędzia w tle → zweryfikowany skutek → niezawodne odtworzenie historii”.** Nie wolno uznać samej obecności procesów i plików za test wykonania zadania.

## 2. Procesy i sieć — wykonano bez ingerencji

| Nasłuch | PID | Zidentyfikowane źródło procesu | Stan i znaczenie |
|---|---:|---|---|
| `127.0.0.1:4000` | `20048` | `%USERPROFILE%\Desktop\jarvis-\bridge\serve_site.py` | `RUNTIME-METADATA VERIFIED` — serwer strony |
| `127.0.0.1:8651` | `19992` | `%USERPROFILE%\Desktop\jarvis-\bridge\jarvis_bridge.py` | `RUNTIME-METADATA VERIFIED` — proces Bridge |
| `127.0.0.1:8642` | `32576` | proces uruchomiony przez `hermes.exe`, komenda zawiera `gateway` | `RUNTIME-METADATA VERIFIED` — proces Hermes/gateway |
| `:8643` | — | brak listenera w przeprowadzonym odczycie | Nie zakładać, że wcześniej używany port 8643 jest nadal aktualny |
| `:8080` | — | brak listenera w przeprowadzonym odczycie | Nie zakładać aktywnego serwera na 8080 |

**Nie zostało jeszcze potwierdzone:** jaki profil Hermes faktycznie ładuje proces na 8642, czy API autoryzuje żądania, czy Bridge odsyła poprawny wynik, czy po zamknięciu karty wykonanie trwa oraz czy wymienione porty są stale dostępne.

## 3. Główne repozytorium — wynik Gita

| Pole | Wartość / dowód |
|---|---|
| Folder | `%USERPROFILE%\Desktop\jarvis-` |
| Gałąź robocza | `auto/nowa-petla-2026-10-09` |
| HEAD podczas audytu | `3d7328f40f42acb6d23762e5adaa6d28eb4a47ff` |
| Zmodyfikowane śledzone pliki | **4** (nie wolno nadpisywać bez przeglądu) |
| Pliki ze zmianami | `docs/spec/katalog-zdarzen.md`, `hermes/skills/note-taking/obsidian/SKILL.md`, `index.html`, `sw.js` |
| Untracked | **NIE SPRAWDZONO**; `git status --porcelain -uno` nie obejmuje untracked |
| Zmiany w repo w ramach audytu | **BRAK** |

**Bloker wdrożenia:** przed implementacją utworzyć **osobny, poprawnie oparty na aktualnym źródle worktree/branch** z zachowaniem 4 zmodyfikowanych plików; nie przełączać obecnej gałęzi i nie czyścić katalogu roboczego na ślepo. Migracja docelowego kodu do `main` dopiero po osobnym review.

## 4. Istniejące profile i magazyny (metadane, bez odczytu rekordów)

- Istnieje `%USERPROFILE%\.hermes\profiles\jarvis-desktop` z `config.yaml`, `projects.db`, `response_store.db`, `runs_idempotency.db`, `verification_evidence.db`, `state.db`, plikami konfiguracyjnymi i katalogami roboczymi. **Istnienie plików nie potwierdza, że konkretny proces ich używa.**
- `%USERPROFILE%\.hermes\profiles\jarvis-desktop\state.db` istnieje, rozmiar podczas odczytu **238 313 472 bajtów**; plik był aktualizowany 11.10.2026 ok. 20:05 czasu lokalnego.
- `%USERPROFILE%\.hermes\profiles\jarvis-desktop\runs_idempotency.db` istnieje (**16 384 bajtów**), ale jego schemat/wykorzystanie nie były badane.
- W `%USERPROFILE%\.hermes` są również m.in. `state.db`, `projects.db`, `memory_store.db`, `runs_idempotency.db`, `kanban.db`. **Nie należy tworzyć nowego magazynu tylko dlatego, że katalog jest rozproszony** — najpierw ustalić, który ma być właścicielem danego typu danych.
- `%USERPROFILE%\.jarvis-os\agent-history.jsonl` istnieje (**252 291 bajtów** podczas odczytu, modyfikowany 11.10.2026 ok. 20:08). Zawartość i kompletność historii **nie zostały odczytane**.

## 5. Prawdziwe luki potwierdzone w lokalnym kodzie

Źródło: lokalne, śledzone pliki `%USERPROFILE%\Desktop\jarvis-\...`; odnalezione poprzez odczyt wybranych wierszy z numerami linii.

| Priorytet | Plik i linie (lokalna wersja) | Potwierdzona obserwacja | Konsekwencja dla MVP |
|---|---|---|---|
| P0 | `hermes/plugins/jarvis-events/__init__.py:27,29,57,65` | `MAX_QUEUE=500`; błąd wysyłki i `queue.Full` mogą zostać bez obsługi trwałego retry | Brak gwarancji kompletności strumienia LIVE |
| P0 | `hermes/plugins/jarvis-events/__init__.py:128–134` | niepusta odpowiedź modelu powoduje `task.completed` | Zakończenie wypowiedzi nie dowodzi sukcesu działania narzędzi |
| P0 | `bridge/jarvis_bridge.py:855,858–859` | allowlista `AGENT_TYPES`, `AGENT_LOG` to `deque(maxlen=300)`, `AGENT_REPLAY_MAX_AGE=600` sekund | RAM i ograniczony replay nie są kompletnym dziennikiem wykonania |
| P0 | `bridge/jarvis_bridge.py:892,902–905` | `/bridge/agent-event` przyjmuje zdarzenia, zapisuje do bounded logu i przekazuje wybrane do `day_history.record` | Trzeba sprawdzić ACK, trwałość, source ID i receipt, zanim oznaczymy sukces |
| P1 | `%USERPROFILE%\.jarvis-os\agent-history.jsonl` | istniejący zapis historii | Należy **zachować** i porównać z nowym planem — nie tworzyć bez potrzeby drugiego „Filmu dnia” |

**Ważna korekta wobec czysto teoretycznych planów:** część infrastruktury i historia zadań **już istnieją**. Problemem jest ich **gwarancja i semantyka**, a nie całkowity brak Bridge, Event Busa i zapisu.

## 6. Wstępna mapa: zachować, dopasować, dodać

| Element | Wniosek | Warunek |
|---|---|---|
| Serwer na 4000 i dotychczasowa PWA | **ZACHOWAĆ** | przejrzeć 4 lokalnie zmodyfikowane pliki przed nową gałęzią |
| Lokalny Bridge na 8651 | **ZACHOWAĆ** | zidentyfikować rzeczywisty katalog startowy i które narzędzia działają bez karty |
| Hermes gateway na 8642 | **ZACHOWAĆ** | ustalić aktywny profil, read-only przegląd configu bez sekretów |
| Hook zdarzeń Hermesa | **ADAPTER / POPRAWKI** | osobno zdefiniować LLM-turn, task i tool outcome; dedupe/retry |
| `agent-history.jsonl` | **ZACHOWAĆ** | utrzymać stary widok i rozszerzyć pełną historię tylko w miejscu, które tego wymaga |
| `runs_idempotency.db`, pozostałe DB | **NIE DUBLOWAĆ** | odczytać schemat/właściciela i retention przed decyzją o nowej bazie |
| Graph 3D | **PO MVP** | osobny eksperyment, brak potwierdzonego rzeczywistego LIVE |
| Mission Control / Second Brain / Trading | **PO MVP** | przyszłe moduły nad wspólnymi kontraktami i źródłem prawdy |

## 7. Czego świadomie nie wykonano

- Nie wysyłano poleceń do Hermesa/Bridge, nie wywoływano narzędzi użytkownika i nie zapisano pliku testowego na jego komputerze.
- Nie weryfikowano odpowiedzi HTTP ani żadnego rzeczywistego TaskId/RunId/ToolReceipt.
- Nie zatrzymano usług i nie restartowano komputera/profilu.
- Nie czytano pełnej konfiguracji, kluczy, zawartości baz, pamięci czy osobistych logów.
- Nie sprawdzano aktywnego profilu Hermes w procesie na 8642 ani nie uruchamiano testów E2E.
- Nie wykonano `git status` z kompletnymi plikami untracked; potwierdzono wyłącznie 4 zmodyfikowane pliki śledzone.

## 8. Bramy: jakie dowody jeszcze potrzebujemy

1. **R0 — ustalenie aktywnego profilu i adapterów:** port 8642 i Bridge 8651 → jaka konfiguracja i jaki proces faktycznie obsługuje zadania? Tylko odczyt metadanych.
2. **R1 — odbiór narzędzia niezależnego od karty:** wskazać jeden prawdziwy Bridge-owned/background-capable tool. Na podstawie dostępnego kodu sporządzić wykaz trybów `requiresBrowser` vs `headless`. Nie uruchamiać narzędzi na komputerze bez osobnej zgody na test.
3. **R2 — właściciel trwałego stanu:** odczyt schematów i kwerend `SELECT` tylko w bezpiecznym trybie, bez modyfikacji WAL, ewentualnie katalog metadanych. Wybór najmniejszej bezpiecznej bazy i ścieżki backup.
4. **R3 — formalny kontrakt `task / run / tool_attempt / evidenceRef`:** dopasować do aktualnego hooka oraz istniejących ID.
5. **R4 — kryterium MVP:** zbudować w przyszłości jedną małą ścieżkę end-to-end i udowodnić na prawdziwych danych; nie ufać samym statusom UI.

## 9. Ostateczny stan audytu

| Obszar | Status |
|---|---|
| Lokalny komputer i porty | **VERIFIED RUNTIME-METADATA** |
| Powiązanie portów 4000/8651 z procesami serwera i Bridge | **VERIFIED RUNTIME-METADATA** |
| Proces Hermes uruchamiający gateway na 8642 | **VERIFIED RUNTIME-METADATA**, profil niepotwierdzony |
| Lokalny Git / 4 zmodyfikowane pliki | **VERIFIED RUNTIME-METADATA** |
| Istnienie DB i historii | **VERIFIED RUNTIME-METADATA**, schematy i rekordy niebadane |
| Potencjalna utrata eventów i fałszywe `task.completed` | **LOCAL-SOURCE VERIFIED** |
| Prawdziwa autonomiczna realizacja zadania przez Hermesa | **NOT VERIFIED** |
| Gotowość MVP do wydania | **BLOCKED — brak testu E2E i decyzji o trwałym ownerze** |

**Rekomendacja:** nie budować kolejnego Jarvisa ani drugiej bazy. Następny etap to kontraktowo uporządkować źródła prawdy, potem mały background-capable E2E. Szczegóły w [planie po audycie](07-PLAN-MVP-PO-AUDYCIE-2026-10-11.md).

**Powiązanie:** [02 Szablon audytu](02-AUDYT-STANU-FAKTYCZNEGO.md) · [03 Moduły](03-ARCHITEKTURA-MODULOWA.md) · [04 Kontrakty](04-KONTRAKTY-ZDARZENIA-DANE.md) · [05 Superpowers](05-PLAN-WDROZENIA-SUPERPOWERS.md).
