# 02 — Jarvis MVP: audyt stanu obecnego (TYLKO ODCZYT)

## Aktualizacja po audycie 11.10.2026

> **Audyt wykonany 11.10.2026 (część bezpieczna, tylko odczyt):** wyniki i statusy VERIFIED/UNKNOWN są w [raporcie z laptopa](02-AUDYT-WYNIKI-2026-10-11.md). Ten plik pozostaje **wzorem wielokrotnego użytku**; nie należy odznaczać pól, których nie zweryfikowano. Aktywna lokalna gałąź `auto/nowa-petla-2026-10-09` ma cztery zmodyfikowane pliki — nie wolno ich nadpisywać.


> **Jarvis MVP / Superpowers — szablon roboczy, 2026-10-11.** Wypełniaj na podstawie dowodów. `[DO UZUPEŁNIENIA]` oznacza otwartą decyzję; `[NIEZWERYFIKOWANE]` nie znaczy „działa”. Te dokumenty NIE są zgodą na implementację, instalowanie, zmianę `main` ani ingerencję w działającego Hermesa.

**Status:** SZABLON do ponownego użycia; audyt bieżącego komputera wykonano częściowo w osobnym raporcie z rzeczywistymi dowodami, bez E2E. **Cel:** odkryć, co działa, czego brakuje oraz gdzie istnieją duplikaty, zanim zaplanujemy zmiany.

## 1. Zasady pracy audytora

- Sprawdzaj wersje, ścieżki, uruchomione procesy, porty, pliki, testy, statusy — **bez zatrzymywania, restartowania, zmieniania czy usuwania**.
- Bez odczytu lub publikacji tokenów/API keys, plików prywatnych, treści pamięci albo pełnych logów zawierających dane wrażliwe. Zbieraj metadane i maskuj sekrety.
- Każdy fakt ma: **źródło, ścieżkę, SHA/wersję, datę, sposób sprawdzenia, wynik**.
- `VERIFIED CODE` ≠ `VERIFIED RUNTIME`. Jeśli nie wiesz — wpisz `UNKNOWN`.

## 2. Inwentaryzacja i właściciele

| Element | Lokalizacja / port / proces | Wersja / commit | Status: VERIFIED RUNTIME / CODE / UNKNOWN | Dowód |
|---|---|---|---|---|
| Repo `Jarvis-` | [ŚCIEŻKA] | [SHA] | UNKNOWN | [ODNOŚNIK] |
| Hermes Desktop (aktywny profil) | [ŚCIEŻKA] / [PORT] | [SHA/BUILD] | UNKNOWN | [DOWÓD] |
| Bridge (jeden właściwy) | [ŚCIEŻKA] / [PORT] | [SHA/BUILD] | UNKNOWN | [DOWÓD] |
| Jarvis PWA/UI | [ŚCIEŻKA] / [URL] | [SHA] | UNKNOWN | [DOWÓD] |
| Jev (opcjonalny) | [ADAPTER / PROFIL] | [WERSJA] | UNKNOWN | [DOWÓD] |
| Historia zadań / zdarzeń | [BAZA / JSONL] | [SCHEMAT] | UNKNOWN | [DOWÓD] |
| Graph 3D (osobny eksperyment) | [ŚCIEŻKA] | [SHA] | VERIFIED CODE (GitHub) | Blueprint 17 |

## 3. Audyt przepływu polecenia — śledź jedno zadanie

| Krok | System | Jakie ID, status i rezultat? | Dowód | Luka |
|---|---|---|---|---|
| Utworzenie zadania | UI/TaskService | [TaskId?] | [LOG/TRACE] | [—] |
| Przekazanie do Hermesa | API/adapter | [RunId?] | [LOG] | [—] |
| Start narzędzia | Bridge/tool | [callId?] | [LOG] | [—] |
| Koniec narzędzia | Bridge/tool | [outcome?] | [RECEIPT] | [—] |
| Weryfikacja skutku | system plików/test | [plik/sha/stan] | [DOWÓD] | [—] |
| Utrwalenie historii | bazowe źródło prawdy | [cursor/stan] | [READ-BACK] | [—] |
| Zamknięcie/wznowienie UI | PWA | [ostatni stan] | [SCREEN/TRACE] | [—] |

## 4. Kontrola duplikatów

- [ ] Liczba aktywnych instancji Hermes i ich role/profili; nie myl wielu procesów z błędem bez sprawdzenia.
- [ ] Które Bridge są aktywne, jakie mają porty i repo źródłowe?
- [ ] Czy zadania mają kilka niespójnych identyfikatorów i historię w różnych miejscach?
- [ ] Czy dwa moduły aktualizują ten sam status niezależnie?
- [ ] Czy nowy Graph 3D korzysta tylko z syntetycznego DEMO?
- [ ] Czy „success” oznacza rzeczywisty wynik narzędzia, czy samą odpowiedź LLM?
- [ ] Czy narzędzie działa po zamknięciu karty?

## 5. Znane fakty z odczytu repo (nie stan komputera)

| Fakt w kodzie GitHub | Konsekwencja | Referencja |
|---|---|---|
| Hermes `jarvis-events`: kolejka 500, po błędzie wysyłki zdarzenie może zginąć | potrzebne niezawodne zdarzenia dla LIVE | Blueprint 17 |
| Hook `post_llm_call`: niepusta odpowiedź → `task.completed` | to nie potwierdza sukcesu skutku zewnętrznego | Blueprint 17 |
| Bridge: fragment historii zdarzeń w RAM oraz zapis skróconych zadań do JSONL | nie mylić z pełnym trwałym dziennikiem narzędzi | Blueprint 17 |
| Graph 3D: odtwarzanie syntetycznych tras co 2500 ms | DEMO, nie LIVE | Blueprint 17 |

## 6. Pytania audytowe z decyzją

| Pytanie | Wynik | Dowód | Wniosek |
|---|---|---|---|
| Który Hermes jest jedynym docelowym? | [UNKNOWN] | [—] | [—] |
| Czy istnieje sprawdzony background executor bez UI? | [UNKNOWN] | [—] | [—] |
| Która baza/log może być właścicielem stanu? | [UNKNOWN] | [—] | [—] |
| Czy restart jest bezpieczny dla aktywnego zadania? | [UNKNOWN] | [—] | [—] |
| Jak działają uprawnienia i redakcja danych? | [UNKNOWN] | [—] | [—] |

## 7. Wyniki i zalecenia

**Co zachować bez zmian:** [LISTA + DOWODY].

**Co wymaga adaptera, a nie przepisywania:** [LISTA + DOWODY].

**Co trzeba dopiero dobudować:** [LISTA + DOWODY].

**Najważniejszy bloker MVP:** [JEDEN KONKRETNY + DOWÓD].

**Poziom pewności:** [VERIFIED RUNTIME / VERIFIED CODE / INFERRED / UNKNOWN].

**Status audytu:** `NOT STARTED` → `IN PROGRESS` → `EVIDENCE REVIEWED`; data, audytor, commit, zakres `[DO UZUPEŁNIENIA]`.
