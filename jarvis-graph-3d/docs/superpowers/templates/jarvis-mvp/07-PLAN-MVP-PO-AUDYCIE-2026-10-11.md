# Jarvis MVP — PLAN PO AUDYCIE (Superpowers)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** PROPOSED IMPLEMENTATION PLAN / NOT EXECUTED. **Date:** 2026-10-11.
**Goal:** Z istniejącego Jarvisa zrobić MVP, które dowodzi działania jednego zadania na Hermesie, wykonania operacji w tle bez karty, zachowania historii i prawdziwego rezultatu.
**Architecture:** Zostają dotychczasowe PWA (`index.html`/`js/*`), Bridge (`bridge/jarvis_bridge.py`) i Hermes. Mały moduł TaskService + jedna trwała historia i adaptery do starych eventów — nie nowy agent ani nowy Bridge. Jev jest opcjonalny. Graph 3D pozostaje poza MVP.
**Tech Stack (verified local source):** istniejący Node/CommonJS (Node ≥20 wg `package.json`), Python/pytest i statyczne HTML/CSS/JS. Dokładne wersje uruchomionych środowisk należy jeszcze potwierdzić.
**Spec:** [01 — MVP zakres](01-MVP-ZAKRES-I-CEL.md), [02 — rzeczywisty audyt](02-AUDYT-WYNIKI-2026-10-11.md), [03 — architektura](03-ARCHITEKTURA-MODULOWA.md), [04 — kontrakty](04-KONTRAKTY-ZDARZENIA-DANE.md), [06 — akceptacja](06-TESTY-ODBIOR-WDROZENIE.md).

## Global constraints

1. **To jest dokument planu, nie polecenie natychmiastowej implementacji.** Nie wolno modyfikować obecnej gałęzi roboczej, usług Hermesa ani `main` przed odrębnym zatwierdzeniem wykonania.
2. Lokalny repozytorium: `%USERPROFILE%\Desktop\jarvis-`, aktualna gałąź `auto/nowa-petla-2026-10-09`, HEAD podczas audytu `3d7328f40f42acb6d23762e5adaa6d28eb4a47ff`. Cztery lokalnie zmienione śledzone pliki: `docs/spec/katalog-zdarzen.md`, `hermes/skills/note-taking/obsidian/SKILL.md`, `index.html`, `sw.js`. **Zachowaj je; nie resetuj, nie checkout i nie usuwaj.**
3. Procesy działające w chwili audytu: PWA `:4000`, Bridge `:8651`, Hermes/gateway `:8642`. **Nie zakładaj :8643.** Zewnętrzne wdrożenia/porty/profil mogą być inne; weryfikuj ponownie.
4. Przed implementacją sprawdź w trybie odczytu, jaką wersję/profil uruchamia Hermes na `8642` i jakie Bridge-owned/background-capable tool endpoints są naprawdę dostępne.
5. Ustal jednego właściciela zapisu zadań/zdarzeń. W `jarvis-desktop` i globalnym Hermes są istniejące bazy `state.db` / `projects.db` / `runs_idempotency.db`, a Jarvis ma `.jarvis-os/agent-history.jsonl`. **Nie twórz nowej bazy zanim wybierzesz istniejącą i udokumentujesz, dlaczego się nie nadaje lub nadaje.**
6. Adapter `post_llm_call` nie może przesądzać o skutku: obecnie niepusta wypowiedź mapuje się na `task.completed`; rozdziel `LLM turn ended` od `verified external result`, zachowując kompatybilność z dotychczasowym Process Log.
7. Wtyczka `jarvis-events` ma nietrwałą kolejkę 500; Bridge ma `AGENT_LOG deque(maxlen=300)` i 600 s replay ostatniego niezakończonego zadania. Zadania/receipts P0 nie mogą zależeć od tych ograniczeń.
8. Nie czytaj ani nie wysyłaj sekretów; lokalny Core jest odgrodzony od publicznego UI. Hosted Preview pozostaje DEMO.
9. Każdy przyszły krok jest osobnym przeglądanym commitem z RED/GREEN i wynikiem z jednego dokładnego SHA. Zero automatycznego merge/deploy.

## Review Focus (przyszłe testy obowiązkowe)

| Klasa błędu | Wymagane zachowanie | Sprawdza |
|---|---|---|
| Model pisze „zrobione”, narzędzie nie dało skutku | zadanie i receipt bez fałszywego VERIFIED | Task 2 + 4 |
| Zamknięta karta podczas wykonania | Bridge/local host działa i historia wraca | Task 4 + 5 |
| Duplikat POST po utracie ACK | nie ma dwukrotnego zapisu raportu | Task 3 + 4 |
| 4 lokalne zmienione pliki na poprzedniej gałęzi | praca izolowana, brak utraty zmian | Task 1 |
| Brak Jev lub WebGL | podstawowe MVP nadal dostępne | Task 4 + 5 |

## 0. Najpierw uzupełnić dwa brakujące fakty (bez zmiany kodu)

- [ ] **Step A:** potwierdź profil procesu Hermesa na `8642` i klasę konkretnego narzędzia, które działa bez karty. Zapisz tylko nazwę modułu/ścieżki i tryb wykonania, bez tokenów.
- [ ] **Step B:** odczytaj *metadane* i schemat DB/listę tabel w read-only (bez otwierania modyfikującego WAL) i porównaj z rolą `agent-history.jsonl`. Dokładny wybór store jako osobny ADR.
- [ ] **Step C:** potwierdź docelową gałąź/worktree i plan zachowania 4 zmienionych plików; wykonanie oddzielnie zatwierdzone.

**Jeśli A/B/C nie są rozstrzygnięte, Tasks 2–5 = BLOCKED.**

## Task 1: Wybór wykonywalnej ścieżki i izolacja środowiska

**Files:** READ `bridge/jarvis_bridge.py`, `bridge/agents.py`, `bridge/workflow_engine.py`, `hermes/plugins/jarvis-events/__init__.py`; create later `docs/superpowers/reports/mvp-runtime-inventory.md`.

**Interfaces:** wejście: aktywne procesy, porty, profil i tool classes; wyjście: zatwierdzony `BackgroundExecutor`, prawo do katalogu raportów, schematy źródeł i docelowy feature worktree.

- [ ] **Step 1:** zapisz testową hipotezę: wybrany executor robi operację bez dostępności SSE Browser CLIENTS.
- [ ] **Step 2:** wykonaj wyłącznie odczyt obecnych klas narzędzi i ich ograniczeń; jeśli brak takiej ścieżki, brak implementacji i należy poprawić spec.
- [ ] **Step 3:** zapisz mapę portów/profili i kodów źródłowych, porównaj z Raportem 02; odnotuj rozbieżności.
- [ ] **Step 4:** uzyskaj akceptację właściciela i izolowanego worktree przed przyszłymi próbami E2E.
- [ ] **Step 5:** zatwierdź dokumentację źródeł; nie twórz kodu w kroku audytowym.

## Task 2: Jedna semantyka Task/Run/Tool + testy negatywne

**Files (proposed after repo confirmation):**
- Modify behind adapter: `hermes/plugins/jarvis-events/__init__.py` (tylko po sprawdzeniu, czy runtime korzysta z tej kopii).
- Keep: `js/events.js` legacy reducer; no global rewrite.
- Create proposed: `bridge/task_semantics.py`, `bridge/tests/test_task_semantics.py`.

**Interfaces:** `normalize_hermes_event(raw: dict) -> CanonicalTaskEvent` i `outcome_from_receipt(receipt: ToolReceipt) -> VerifiedOutcome`.

- [ ] **Step 1:** napisz test, w którym `post_llm_call` daje niepusty tekst, ale brak rezultatu narzędzia → `effectVerification=unknown`.
- [ ] **Step 2:** w przyszłej izolacji uruchom `python -m pytest bridge/tests/test_task_semantics.py -q`; oczekuj RED z brakującą funkcją, nie błędu instalacji.
- [ ] **Step 3:** dodaj minimalny adapter lifecycle zgodny z aktywnymi hookami, z rozdzieleniem deklaracji, próby i potwierdzonego wyniku; nie generuj sztucznego evidenceRef.
- [ ] **Step 4:** GREEN z tą samą komendą; sprawdź, że stare eventy mogą być nadal mapowane dla pulpitu.
- [ ] **Step 5:** review i commit tylko adapter/test w feature worktree.

## Task 3: Przyjęcie, dedupe i trwały owner zdarzeń

**Files (proposed):** adapter wewnątrz istniejącego `bridge/jarvis_bridge.py`, ewentualny mały `bridge/task_event_store.py` i `bridge/tests/test_task_event_store.py`; lokalizacja DB wyłącznie wg ADR z Kroku 0.

**Interfaces:** `append_event(event, source) -> DurableAck`, `read_events(task_id, cursor) -> EventPage`.

- [ ] **Step 1:** test `same_event_twice_produces_one_durable_record`, `ack_lost_then_retry_is_idempotent`, `hidden_graph_events_not_leaked` oraz `write_failure_never_sends_durable_ack`.
- [ ] **Step 2:** uruchom RED: `python -m pytest bridge/tests/test_task_event_store.py -q`; expected missing store.
- [ ] **Step 3:** po zatwierdzeniu właściciela magazynu wdroż minimalną trwałą historię P0 (task/run/tool result), deduplikację i ACK; nie zastępuj `agent-history.jsonl`, nie twórz drugiego Bridge.
- [ ] **Step 4:** GREEN + odczyt po nowym procesie w **izolowanym teście**, bez dotykania żywego `state.db`.
- [ ] **Step 5:** review i commit; zachowaj backward compatibility `/bridge/agent-event`.

## Task 4: Jedno realne polecenie z wykonaniem w tle

**Files (proposed):** `bridge/task_service.py`, `bridge/tests/test_task_service.py` i adapter zatwierdzonego background tool (nazwa dopiero po kroku 0); UI jeszcze nie zmieniamy.

**Interfaces:** `submit_task(command, idempotency_key, scope) -> TaskId`, `run_task(task_id) -> RunId`, `read_task(task_id) -> TaskState`.

- [ ] **Step 1:** test poprawnego pliku raportu i odczytu zwrotnego oraz awarii narzędzia bez fałszywego sukcesu.
- [ ] **Step 2:** uruchom RED: `python -m pytest bridge/tests/test_task_service.py -q`.
- [ ] **Step 3:** wykorzystaj istniejące Bridge-owned tool lub minimalny approved local host; w tym zadaniu brak nowego ogólnego agenta. TaskService koreluje `TaskId/RunId/ToolAttemptId` i dowód raportu.
- [ ] **Step 4:** GREEN; w E2E z zatwierdzonego katalogu przetestuj wyjście z karty w trakcie operacji i retry po utracie potwierdzenia.
- [ ] **Step 5:** review i commit; raport dowodów: ścieżka bez sekretów, exit code, hash, task/run IDs.

## Task 5: Minimalny pulpit i wydanie MVP

**Files (existing):** `index.html`, `sw.js`, `js/events.js`, `docs/spec/katalog-zdarzen.md` i odpowiednie istniejące moduły UI, które trzeba zidentyfikować bez zgadywania. **Uwaga:** 3 z tych plików mają lokalne zmiany użytkownika — nie nadpisuj.

**Interfaces:** UI reads `submit/list/details/events/connectivity` through the one approved Core contract; only the local server saves data.

- [ ] **Step 1:** testy browser/smoke: polecenie, TaskId, widoczny receipt, błąd, pause effects ≠ pause execution, mobile 390×844, zero WebGL i offline.
- [ ] **Step 2:** RED z konkretnej komendy (potwierdzanej po audycie istniejącego runnera), nie z brakujących narzędzi.
- [ ] **Step 3:** minimum UI: czat, lista, inspektor, stan połączenia i mały Orb; nie dodawaj Galaktyki 3D jako bramki MVP.
- [ ] **Step 4:** GREEN + zarejestruj prawdziwe wyniki: `npm test`, `npm run typecheck`, `python -m pytest -m unit -q`, odpowiedni `npm run test:e2e` po przeglądzie, a test Bridge integracyjny `python bridge/tests/run_e2e.py` dopiero w izolowanym środowisku. **Wszystkie komendy są planem, nie zostały uruchomione.**
- [ ] **Step 5:** spisz 12 scenariuszy 06 z dowodami, porównaj commit, zachowaj fallback/rollback i osobno poproś o release sign-off.

## Raport statusu (z audytu 11.10.2026)

| Warunek / blok | Status na dziś | Dowód |
|---|---|---|
| Dostęp do laptopa i repo | **VERIFIED** | porty i Git / 02 audyt |
| Obecny frontend na 4000 | **LISTENER VERIFIED**, UI/E2E NOT RUN | PID i skrypt |
| Obecny Bridge na 8651 | **LISTENER VERIFIED**, tool-result E2E NOT RUN | PID i skrypt |
| Hermes gateway na 8642 | **LISTENER VERIFIED**, rzeczywisty profil i API niepotwierdzone | PID i hermes.exe |
| Odzyskiwanie zadania po zamknięciu karty | **NOT VERIFIED** | wymaga E2E |
| Trwała semantyka wyniku narzędzia | **GAP CONFIRMED IN LOCAL SOURCE** | `post_llm_call` mapowanie, kolejka, AGENT_LOG |
| Unikalny właściciel bazy | **NOT DECIDED** | kilka istniejących DB |
| Pierwszy działający background task | **NOT VERIFIED** | brak autoryzowanego runtime testu |

**Wniosek:** następny najcenniejszy etap to **R0: sprawdzenie aktywnego profilu, prawdziwego background executor oraz właściciela historii**. Następnie pojedyncza ścieżka TaskService z testami; dopiero potem moduły.

**Uwaga:** to dokument wykonawczy do przeglądu. Samo jego zapisanie **nie oznacza** realizacji Tasks 1–5 ani testów. Żadnych zmian w uruchomionym Jarvisie nie wykonano.
