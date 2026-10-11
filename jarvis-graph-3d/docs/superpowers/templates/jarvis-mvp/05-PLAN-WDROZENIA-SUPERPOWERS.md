# 05 — Jarvis MVP Implementation Plan — Superpowers (szablon)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Jarvis MVP / Superpowers — szablon roboczy, 2026-10-11.** Wypełniaj na podstawie dowodów. `[DO UZUPEŁNIENIA]` oznacza otwartą decyzję; `[NIEZWERYFIKOWANE]` nie znaczy „działa”. Te dokumenty NIE są zgodą na implementację, instalowanie, zmianę `main` ani ingerencję w działającego Hermesa.

**Goal:** Udowodnić jedną pełną ścieżkę polecenie → Hermes → narzędzie działające w tle → prawdziwy zapis/rezultat → trwała historia → ponowne otwarcie UI.

**Architecture:** Modułowy, lokalny rdzeń wokół istniejącego Hermesa i Bridge. Jeden właściciel zadań/zdarzeń, adaptery zamiast duplikatów, moduły doklejane przez kontrakty. Tylko zatwierdzony zakres zmian na osobnej gałęzi.

**Tech Stack:** istniejące Python/JS/React/TypeScript projektu; dokładne wersje, framework i ścieżki zatwierdzić po audycie 02. Nie instalować nowych pakietów bez potrzeby.

**Spec:** `01-MVP-ZAKRES-I-CEL.md`, `02-AUDYT-STANU-FAKTYCZNEGO.md`, `03-ARCHITEKTURA-MODULOWA.md`, `04-KONTRAKTY-ZDARZENIA-DANE.md`.

## Global Constraints

- Ten plik to **SZABLON PLANU**; żadnego kroku nie wykonano i nie uzyskano zgody na implementację.
- Kod wyłącznie w **repo i ścieżkach potwierdzonych przez audyt**, na osobnej gałęzi roboczej.
- Nie zmieniać `main`, produkcji, działającej konfiguracji Hermesa ani prywatnych baz bez osobnej zgody.
- Istniejący desktop, Bridge, Hermes i baza pozostają źródłem kontekstu — nie tworzyć drugich procesów/portów tylko dlatego, że są łatwiejsze do zbudowania.
- Jedna mała część na raz: **test RED → minimalna implementacja → GREEN → review → commit**.
- Dla każdego kroku: pełna komenda testu i zapisany wynik, nie samo „testy przeszły”.
- Blokery ze statusu `UNKNOWN` w audycie zatrzymują wdrożenie zależnego kroku; nie wymyślać plików, endpointów ani wydajności.

## Review Focus

1. Hermes odpowiada tekstem, lecz narzędzie zawodzi → test w zadaniu 3.
2. Zamykanie karty podczas wykonania → test w zadaniu 4.
3. Powtórzenie po utracie ACK → nie podwaja skutku → test w zadaniu 2 i 4.
4. Brak Jev → główna ścieżka działa → test w zadaniu 3.
5. Niejawne duplikaty procesów/baz → najpierw audyt; test w zadaniu 1.

---

### Task 1 — Potwierdzić rzeczywiste środowisko (bez zmian)

**Files:** uzupełnić `02-AUDYT-STANU-FAKTYCZNEGO.md`; kod źródłowy: BRAK.

**Interfaces:** wejście: aktualne źródła i metadane procesów; wyjście: lista zatwierdzonych portów/wersji/repo, właściciel przechowywania i klasy narzędzi.

- [ ] **Step 1:** zinwentaryzuj istniejące usługi/adaptery i narzędzia bez zamykania procesów.
- [ ] **Step 2:** sprawdź ścieżkę one-task bez zmian, odnotuj identyfikatory i brakujące receipt.
- [ ] **Step 3:** wyświetl mapę istniejących baz/logów i wybierz **jednego** właściciela historii (projekt decyzji).
- [ ] **Step 4:** przejrzyj dowody i wypełnij pola `VERIFIED RUNTIME`, `UNKNOWN`, `CONFLICT`.
- [ ] **Step 5:** dokonaj przeglądu audytu (tylko dokumenty). STOP przed kodowaniem, jeśli nie ustalono środowiska.

### Task 2 — Kontrakty i trwały TaskId

**Files:** `[MODUŁ TASK SERVICE PO AUDYCIE]`, `[TEST TASK SERVICE PO AUDYCIE]`; w istniejącym repo. Najpierw udokumentuj finalne ścieżki. Brak zatwierdzonych ścieżek = BLOCKED.

**Interfaces:** `submitTask(command,idempotencyKey,scope) → taskId`; `getTask(taskId) → TaskRecord`.

- [ ] **Step 1:** napisz test odrzucający zdublowane logiczne zadanie przy tym samym `idempotencyKey`.
- [ ] **Step 2:** uruchom test i zapisz oczekiwany FAIL (nie błąd instalacji).
- [ ] **Step 3:** zaimplementuj minimalny TaskService i zapis przyjętego zadania w zatwierdzonym store.
- [ ] **Step 4:** uruchom ten sam test do PASS, sprawdź odczyt po nowej sesji.
- [ ] **Step 5:** review diff, commit wyłącznie tego modułu i testu.

### Task 3 — Hermes i narzędzie bez karty + dowód

**Files:** `[ADAPTER HERMES PO AUDYCIE]`, `[ADAPTER TOOL PO AUDYCIE]`, `[TEST INTEGRACYJNY]`.

**Interfaces:** `executeTask(taskId) → runId`; `completeToolAttempt(callId) → receipt` z autorytatywnego źródła.

- [ ] **Step 1:** test: Hermes mówi „gotowe”, narzędzie zwraca błąd — brak sukcesu skutku.
- [ ] **Step 2:** uruchom test (RED) i potwierdź, że błędny stan jest odtwarzalny.
- [ ] **Step 3:** podłącz **istniejący** background-capable executor i minimalne receipts, bez przepisywania Hermesa.
- [ ] **Step 4:** test (GREEN): sprawdź plik raportu/read-back, błędy oraz poprawne zachowanie bez Jev.
- [ ] **Step 5:** review + commit; jeśli narzędzie wymaga karty, STOP i skoryguj plan.

### Task 4 — Historia, reconnect, brak duplikatów

**Files:** `[ADAPTER EVENT STORE]`, `[TEST RETRY/RESTART]` — z audytu 02.

**Interfaces:** przyjęty event → durable ACK; `getTaskEvents(taskId,cursor)` → bezpieczna historia.

- [ ] **Step 1:** test: utrata ACK, retry, zamknięcie karty i restart hosta nie tworzą dwóch zapisów.
- [ ] **Step 2:** RED i dowód oryginalnego objawu.
- [ ] **Step 3:** minimalny trwały zapis, deduplikacja i odczyt kursora, bez nowego równoległego Event Busa.
- [ ] **Step 4:** GREEN + weryfikacja dokładnie jednej operacji oraz rzeczywistego wznowienia.
- [ ] **Step 5:** review + commit z opisem ograniczeń.

### Task 5 — UI + telefon + bramka MVP

**Files:** `[ISTNIEJĄCY PLIK CZATU]`, `[TASK LIST / INSPECTOR]`, `[TEST E2E]` (potwierdzić w audycie).

**Interfaces:** jedno API: submit/list/details/events/connection; UI nie pisze bezpośrednio do bazy.

- [ ] **Step 1:** E2E RED: polecenie, lista, inspektor, błąd, wznowienie, 390×844, no WebGL.
- [ ] **Step 2:** zarejestruj RED i źródło awarii (nie pomyl z brakiem Playwright).
- [ ] **Step 3:** minimalne ekrany i Orb z prawdziwymi statusami; UI wciąż czytelny przy offline.
- [ ] **Step 4:** E2E GREEN, typowanie/testy jednostkowe/build; log, screen, czas i SHA.
- [ ] **Step 5:** review i commit, wygeneruj raport 06; bez merge/deploy bez oddzielnej zgody.

## Handoff / kontrola po każdym zadaniu

| Zadanie | Stan NOT STARTED / BLOCKED / IN PROGRESS / VERIFIED | Commit / wynik testu | Ryzyka |
|---|---|---|---|
| 1 | NOT STARTED | — | brak źródeł runtime |
| 2 | NOT STARTED | — | kontrakt niezatwierdzony |
| 3 | NOT STARTED | — | brak potwierdzonego executor |
| 4 | NOT STARTED | — | log/dedupe niezatwierdzone |
| 5 | NOT STARTED | — | testy E2E do potwierdzenia |

**Plan można uznać za gotowy do wykonania dopiero po audycie 02, akceptacji specyfikacji 01/03/04 oraz uzupełnieniu dokładnych ścieżek i komend testów.**
