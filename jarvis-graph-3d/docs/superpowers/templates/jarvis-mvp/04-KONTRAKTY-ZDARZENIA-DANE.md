# 04 — Jarvis MVP: kontrakty API, zadania, zdarzenia i dowody

> **Jarvis MVP / Superpowers — szablon roboczy, 2026-10-11.** Wypełniaj na podstawie dowodów. `[DO UZUPEŁNIENIA]` oznacza otwartą decyzję; `[NIEZWERYFIKOWANE]` nie znaczy „działa”. Te dokumenty NIE są zgodą na implementację, instalowanie, zmianę `main` ani ingerencję w działającego Hermesa.

**Status:** CANDIDATE CONTRACT / NIE ZAMROŻONY. Nie kopiować poniższych nazw do runtime bez dopasowania do aktywnego Hermesa/Bridge. Celem jest jeden wspólny język między Core, narzędziami i interfejsem.

## 1. Identyfikatory

| Nazwa | Znaczenie | Zasada |
|---|---|---|
| `TaskId` | jeden cel użytkownika | trwały i jednoznaczny |
| `RunId` | jedna próba wykonania zadania | nowy dla każdej rzeczywistej próby |
| `ToolAttemptId` | jedno wywołanie narzędzia | korelacja startu i wyniku |
| `EventId` + `source` | fakt o zdarzeniu | deduplikacja `(source,id)` |
| `EvidenceRef` | bezpieczny odnośnik do potwierdzenia | nie surowa lokalna ścieżka/sekret |
| `Cursor` | pozycja odtwarzania autoryzowanego strumienia | opaque, zakres uprawnień, nie globalny licznik |

## 2. Statusy nie mogą się mieszać

**Zadanie:** QUEUED · RUNNING · BLOCKED · SUCCEEDED · FAILED · CANCELLED · UNKNOWN.

**Narzędzie:** STARTED · COMPLETED · FAILED · TIMEOUT · DENIED · UNKNOWN. `COMPLETED` oznacza potwierdzony wynik wywołania, **nie zawsze trwały skutek zewnętrzny**.

**Połączenie:** CONNECTED · STALE · DISCONNECTED · UNAUTHORIZED.

**Dowód skutku:** UNVERIFIED · VERIFIED · REJECTED.

**Wniosek:** niepusta odpowiedź Hermesa **nie jest** dowodem sukcesu narzędzia. Rozłączenie Bridge **nie oznacza** FAILED zadania.

## 3. Przykładowe zdarzenie (format proponowany)

```json
{
  "schemaVersion": "1.0",
  "id": "evt-123",
  "source": "bridge.tools",
  "type": "tool.completed",
  "time": "2026-10-11T18:00:00Z",
  "taskId": "task-abc",
  "runId": "run-abc-1",
  "toolAttemptId": "tool-xyz",
  "data": {"tool": "report.write", "outcome": "completed"},
  "evidenceRef": "evidence:report-xyz"
}
```

**To jest WYŁĄCZNIE PRZYKŁAD kontraktu.** Domena i rzeczywiste eventy muszą zostać uzgodnione z istniejącym producentem. Nie wolno traktować `evidenceRef` jako zweryfikowanego skutku bez niezależnej weryfikacji przez właściwe narzędzie.

## 4. Planowane API / porty (interfejs do dopasowania)

| Operacja | Wejście | Wyjście | Wymaganie |
|---|---|---|---|
| `submitTask` | command, idempotencyKey, scope | TaskId + QUEUED | dokładnie jedno logiczne zadanie |
| `getTask` | TaskId, viewer scope | Task + aktualny run/status | tylko autoryzowane dane |
| `listTasks` | filtr, cursor | strona wyników | stabilna kolejność |
| `getTaskEvents` | TaskId, authorized cursor | zdarzenia/nowy cursor | replay bez duplikowania wykonania |
| `getEvidence` | evidenceRef | bezpieczny podgląd/wynik | brak sekretów i nieautoryzowanych plików |

## 5. Trwałość i dostarczanie zdarzeń

1. Przyjmij zdarzenie z autoryzowanego źródła.
2. Zweryfikuj schemat, identyfikator, uprawnienia i limit rozmiaru.
3. Zapisz je w jednym trwałym magazynie. **ACK dopiero po potwierdzeniu przyjętej semantyki zapisu.**
4. Deduplikuj po `(source,id)` i indeksuj `taskId/runId`.
5. Projektuj listę zadań i inspektor z faktów, nie ze stanu animacji.
6. Wznawiaj z cursora autoryzowanego widoku; po wygaśnięciu cursora pobierz nowy snapshot.
7. Nie wystawiaj globalnej wersji ani liczników ukrytych rekordów do nieuprawnionego UI.

## 6. Wynik narzędzia vs skutek

| Przypadek | Task | Tool | Verified effect |
|---|---|---|---|
| Model pisze „zrobione”, brak wywołania | nadal UNKNOWN / według zadań | brak | UNVERIFIED |
| Narzędzie zwraca błąd | FAILED lub RUNNING (według właściciela) | FAILED | REJECTED |
| Narzędzie wraca OK, pliku nie ma | nie wolno oznaczyć sukcesu skutku | COMPLETED | UNVERIFIED |
| Zapis raportu, odczyt zwrotny potwierdza | SUCCEEDED po zatwierdzeniu TaskService | COMPLETED | VERIFIED |
| Połączenie zniknęło | UNKNOWN/ostatni zaufany stan | UNKNOWN | bez zgadywania |

## 7. Przyszłe testy kontraktowe

- [ ] Dwa identyczne eventy nie dają dwóch zapisów/animacji.
- [ ] Odcięte połączenie nie zamienia zadania na FAILED bez źródła.
- [ ] Niepusta wiadomość LLM nie potwierdza skutku narzędzia.
- [ ] Brak `EvidenceRef` ma jawny status UNVERIFIED.
- [ ] Powtórzenie żądania z tym samym `idempotencyKey` nie wykonuje dwukrotnie zapisu.
- [ ] Zmiana uprawnień wymusza nowy bezpieczny snapshot.
- [ ] Jev nieobecny nie zmienia cyklu życia TaskService.

## 8. Zamrożenie kontraktu — podpis

Właściciel zapisu: [—] · Schema: [—] · Producer map: [—] · Idempotency: [—] · Retencja: [—] · Auth scope: [—] · Zgodność ze starym `js/events.js`: [—].

**STATUS:** PROPOSED / ACCEPTED / SUPERSEDED. **Dowód i data decyzji:** [—].
