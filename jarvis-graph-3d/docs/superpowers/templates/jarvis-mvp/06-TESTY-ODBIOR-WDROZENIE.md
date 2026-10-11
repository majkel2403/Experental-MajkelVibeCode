# 06 — Jarvis MVP: testy odbiorcze, dowody, wydanie i rollback

> **Jarvis MVP / Superpowers — szablon roboczy, 2026-10-11.** Wypełniaj na podstawie dowodów. `[DO UZUPEŁNIENIA]` oznacza otwartą decyzję; `[NIEZWERYFIKOWANE]` nie znaczy „działa”. Te dokumenty NIE są zgodą na implementację, instalowanie, zmianę `main` ani ingerencję w działającego Hermesa.

**Status:** SZABLON — wszystkie testy `NOT RUN`. Samo istnienie tej listy nie oznacza PASS. **Cel:** obiektywna odpowiedź na pytanie „czy Jarvis MVP działa?”.

## 1. Środowisko testowe — obowiązkowe pola

| Parametr | Wartość |
|---|---|
| Repo / branch / commit | [—] |
| Hermes wersja/profil | [—] |
| Bridge / executor wersja, port | [—] |
| Baza/event store | [—] |
| System / przeglądarka / viewport | [—] |
| Katalog raportu testowego | [—] |
| Data, wykonawca i tryb DEMO / REAL | [—] |

## 2. Scenariusze E2E (Given → When → Then)

| ID | Given / When | Then — co sprawdzamy | Stan / dowód |
|---|---|---|---|
| E2E-01 | Wpisuję polecenie raportu | Jeden TaskId, zapisany plan startu, prawdziwy Hermes run | NOT RUN |
| E2E-02 | Tool wywołany w tle | Wynik + dowód raportu (plik istnieje i zawartość jest poprawna) | NOT RUN |
| E2E-03 | Hermes zwraca „zrobione”, narzędzie zgłasza błąd | Brak VERIFIED SUCCESS, jawny błąd narzędzia | NOT RUN |
| E2E-04 | Zamykam kartę podczas zadania | Tło pracuje dalej, po powrocie dokładnie jeden wynik | NOT RUN |
| E2E-05 | Restartuję kontrolowanie lokalny host w teście | Historia i TaskId zachowane lub oznaczone UNKNOWN; brak samowolnego ponownego wykonania | NOT RUN |
| E2E-06 | Zrywam połączenie z Bridge | UI STALE/DISCONNECTED, a nie FAILED zadania bez dowodu | NOT RUN |
| E2E-07 | Gubię ACK i ponawiam żądanie | Skutek zewnętrzny najwyżej jeden raz; dedupe | NOT RUN |
| E2E-08 | Jev jest wyłączony | Podstawowa ścieżka polecenia nadal działa | NOT RUN |
| E2E-09 | Zmieniam rozmiar na 390×844 | Czat, lista i inspektor są dostępne bez przewijania poziomego | NOT RUN |
| E2E-10 | WebGL niedostępny / reduced motion | Brak utraty informacji; dostępny tekstowy status | NOT RUN |
| E2E-11 | Próbuję wykonać polecenie spoza dozwolonego scope | Odrzucenie, bez ujawniania tokenów, błąd w logu zredagowany | NOT RUN |
| E2E-12 | Wyłączam przykładowy moduł | Zadania i zdarzenia nadal działają, brak usuwania historii | NOT RUN |

## 3. Wymagane dowody testu

Przy każdym E2E wpisz:

```text
Test ID: E2E-XX
Data i środowisko:
Commit / zainstalowana wersja:
Polecenie uruchomienia testu:
Oczekiwany rezultat:
Rzeczywisty rezultat (exit code, błędy):
TaskId / RunId / ToolAttemptId:
Dowód: link do zredagowanego logu / screenshota / pliku i jego hasha
Status: PASS / FAIL / BLOCKED / NOT RUN
Uwagi / następne działanie:
```

**Dowód nie może być:** deklaracją modelu, niezweryfikowaną animacją, zieloną ikoną lub samym statusem Vercel READY. Zrzuty ekranu nie powinny zawierać sekretów.

## 4. Kryteria końcowe wydania MVP

- [ ] Wszystkie E2E-01..12 mają rzeczywisty PASS lub jawnie zatwierdzony, udokumentowany wyjątek **nie dotyczący istoty MVP**.
- [ ] Brak otwartych błędów krytycznych dla zapisu, statusu, bezpieczeństwa, restartów i utraty zdarzeń.
- [ ] Jeden eksperyment rzeczywiście zapisuje raport w dozwolonym katalogu i potem go odczytuje.
- [ ] Brak fałszywych sukcesów i dublowania skutków po retry.
- [ ] Zapisany zestaw: SHA kodu, wersje procesów, komendy testów, exit codes, czas, screenshot 390×844, logi.
- [ ] Użytkownik zaakceptował **wydanie** osobno od zatwierdzenia projektu i implementacji.

## 5. Release checklist (przykład, nie wykonuj automatycznie)

1. Zweryfikuj SHA wdrażanej wersji, brak niezatwierdzonych zmian i zgodność kontraktów.
2. Wykonaj testy w środowisku testowym; zapisz dowody.
3. Zrób potwierdzoną kopię bezpieczeństwa istniejącego magazynu stanu, zanim dopuścisz migrację.
4. Sprawdź ścieżkę przywrócenia poprzedniej wersji (kod + zgodna baza), nie zakładaj, że cofnięcie commita cofa DB.
5. Dopiero po zgodzie wykonaj wdrożenie i ponów smoke test rzeczywistego polecenia.
6. W przypadku FAIL zatrzymaj promocję, odnotuj incydent, uruchom uzgodniony rollback.

## 6. Plan rollback — uzupełnij przed release

| Zakres | Wersja stara / nowa | Backup / lokalizacja | Sposób przywrócenia | Dowód testu rollback |
|---|---|---|---|---|
| Kod Jarvis | [—] | [—] | [—] | [—] |
| Konfiguracja Bridge | [—] | [—] | [—] | [—] |
| Baza i eventy | [—] | [—] | [—] | [—] |
| UI assets | [—] | [—] | [—] | [—] |

## 7. Krótki raport końcowy (wzór)

**Czy Jarvis MVP działa?** `NOT VERIFIED / YES / NO`.

**Dowód głównego scenariusza:** [—].

**Najpoważniejsza pozostała usterka:** [—].

**Co rzeczywiście przetestowano:** [—].

**Czego nie sprawdzano:** [—].

**Rekomendacja:** RELEASE / STOP / REWORK; uzasadnienie [—].

**Akceptacja użytkownika dla wdrożenia:** `BRAK` / [data, decyzja].
