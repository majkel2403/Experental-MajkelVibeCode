# Specyfikacja Jarvis OS — pełny pakiet

Ten folder opisuje **wszystko**, co Jarvis OS robi i ma robić: każde okno, przycisk, polecenie, stan, ustawienie, błąd i test. Punkt wyjścia była [inwentaryzacja](../archiwum/INWENTARYZACJA.md) (archiwum); plan sędziego Jev jest osobno w [JEV-PLAN.md](../JEV-PLAN.md).

Pisane prostym językiem. Tam, gdzie trzeba było coś zdecydować, a decyzji właściciela jeszcze nie ma, wpisałem **decyzję domyślną** (oznaczenie „⚑ domyślnie”) — każdą da się zmienić w [01-decyzje.md](01-decyzje.md) bez przepisywania reszty.

## Jak czytać

1. Najpierw [01-decyzje.md](01-decyzje.md) — 20 decyzji, od których zależy reszta.
2. Potem [02-obiekty-akcje.md](02-obiekty-akcje.md) — wielka tabela: każdy „rzeczownik” (okno, notatka, zadanie…) × każdy „czasownik” (utwórz, usuń, przesuń…).
3. Dokumenty obszarów (03–16) opisują szczegóły.
4. [17-wdrozenie.md](17-wdrozenie.md) — kolejność prac, pliki do zmiany, kryteria „gotowe”.

## Spis

| # | dokument | o czym |
|---|---|---|
| 01 | [01-decyzje.md](01-decyzje.md) | decyzje produktowe (co robimy, czego nie) z wartościami domyślnymi |
| 02 | [02-obiekty-akcje.md](02-obiekty-akcje.md) | macierz obiekt × działanie: mysz, klawiatura, głos, agent, ryzyko, cofanie |
| 03 | [03-nawigacja.md](03-nawigacja.md) | poruszanie się: aplikacje, widoki w aplikacjach, historia, wyszukiwanie, paleta, adresy, skróty, tryby |
| 04 | [04-okna.md](04-okna.md) | menedżer okien: otwieranie, zamykanie, przesuwanie, rozmiar, przyciąganie, układy, warstwy, kolizje |
| 05 | [05-widgety.md](05-widgety.md) | widgety, w tym **budowane z opisu** (schemat, bloki, dane, odświeżanie, bezpieczeństwo) |
| 06 | [06-notatki.md](06-notatki.md) | notatki: tworzenie, edycja, tagi, foldery, kosz, wersje, eksport |
| 07 | [07-zadania.md](07-zadania.md) | zadania i harmonogram: terminy, powtarzanie, priorytety, podzadania, ICS |
| 08 | [08-aplikacje.md](08-aplikacje.md) | pozostałe aplikacje: czat, rynek, pogoda, monitor, terminal, kalkulator, minutnik, biblioteka, pliki, pamięć |
| 09 | [09-wyglad-stany.md](09-wyglad-stany.md) | wygląd: stany (ładowanie, pusto, błąd…), rdzeń, karty HUD, efekty, wykresy, dostępność, małe ekrany |
| 10 | [10-ustawienia.md](10-ustawienia.md) | ustawienia: układ sekcji, każdy klucz, kto może zmieniać, nowe ustawienia |
| 11 | [11-agent.md](11-agent.md) | agent: przebieg polecenia, plany, rutyny, cofanie, pamięć, proaktywność |
| 12 | [12-glos.md](12-glos.md) | głos: nasłuch, słowo „Jarvis”, mowa, przerywanie, dyktowanie |
| 13 | [13-bledy.md](13-bledy.md) | błędy i przypadki brzegowe: kody → co widzi użytkownik, kolejność `Esc`, konflikty |
| 14 | [14-integracje.md](14-integracje.md) | usługi zewnętrzne: podłączenie, test, stan, awaria, czego nie robimy |
| 15 | [15-bezpieczenstwo.md](15-bezpieczenstwo.md) | zaufanie, zgody, prywatność, spis danych, klucze |
| 16 | [16-testy.md](16-testy.md) | testy automatyczne i ręczne, kryteria akceptacji |
| 17 | [17-wdrozenie.md](17-wdrozenie.md) | fale W1–W5, zadania z plikami, zależności, definicja „gotowe” |
| 18 | [18-handoff-pulpit.md](18-handoff-pulpit.md) | handoff ekranu głównego: dokładne wymiary, tokeny, stany, ruch, RWD, dostępność (z kodu) |

## Pliki generowane i maszynowe

| plik | co zawiera | skąd |
|---|---|---|
| [katalog-polecen.md](katalog-polecen.md) / [katalog-polecen.json](katalog-polecen.json) | 63 istniejące polecenia: argumenty, ryzyko, poziom autonomii, cofanie, przykłady | generowane z kodu |
| [katalog-nowych-polecen.md](katalog-nowych-polecen.md) | planowane polecenia (nowe i rozszerzenia); tabele „Planowane polecenia tej części” w dokumentach 03–11 też są generowane | generowane z [nowe-polecenia.js](nowe-polecenia.js) |
| [katalog-ustawien.md](katalog-ustawien.md) | wszystkie klucze ustawień z wartościami domyślnymi | generowane z kodu |
| [katalog-zdarzen.md](katalog-zdarzen.md) | wszystkie zdarzenia i gdzie powstają | generowane z kodu |
| [widget.schema.json](widget.schema.json) | schemat opisu widgetu | ręcznie, sprawdzany testem |
| [widget-przyklady.json](widget-przyklady.json) | 5 przykładowych opisów widgetów | ręcznie, sprawdzany testem |
| `../../tests/fixtures/corpus-nowe.js` | zdania testowe dla planowanych poleceń | ręcznie, sprawdzany testem |

Odświeżenie katalogów: `node tools/gen-spec.js`. Test `tests/unit/spec.test.js` pilnuje, żeby katalogi były aktualne, schematy poprawne, przykłady zgodne ze schematem, a każde planowane polecenie było opisane w swoim dokumencie i miało zdania testowe.

## Słownik (krótko)

- **Polecenie** — jedna czynność z rejestru (`js/commands.js`), np. `add_task`. To samo polecenie wywołuje parser, Jev, Hermes, paleta i przycisk.
- **Poziom autonomii** — A3 (sam, po cichu: odczyty i nawigacja), A2 (sam, z przyciskiem „Cofnij”), A1 (pyta „Chodzi o…?”), A0 (zawsze prosi o zgodę). Szczegóły w [JEV-PLAN.md](../JEV-PLAN.md).
- **Źródło polecenia** — kto je wydał: `ui` (kliknięcie), `local` (wpisane i rozpoznane przez parser), `voice`, `jev`, `hermes`, `signal`, `routine`. Od źródła zależy, czy trzeba pytać o zgodę.
- **Cofnij** — każda odwracalna zmiana odkłada na stos funkcję cofającą (`js/undo.js`); stos trzyma 20 wpisów przez 10 minut.
- **Widok** — konkretne miejsce w aplikacji (np. zakładka „Stoper” w Minutniku, dzień w Harmonogramie).
- **Fala (W1–W5)** — etap wdrożenia z [17-wdrozenie.md](17-wdrozenie.md).
