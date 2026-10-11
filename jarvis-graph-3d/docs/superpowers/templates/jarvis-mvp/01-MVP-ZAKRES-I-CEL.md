# 01 — Jarvis MVP: cel, zakres i wymagania (PRD)

## Aktualizacja po audycie 11.10.2026

> **Status po audycie 11.10.2026:** rzeczywisty lokalny serwer Jarvisa, Bridge i proces Hermes zostały potwierdzone na portach 4000/8651/8642. **Działanie pełnego polecenia nie zostało jeszcze przetestowane.** Dowody: [02 — wyniki audytu](02-AUDYT-WYNIKI-2026-10-11.md); dalsze kroki: [07 — plan po audycie](07-PLAN-MVP-PO-AUDYCIE-2026-10-11.md).


> **Jarvis MVP / Superpowers — szablon roboczy, 2026-10-11.** Wypełniaj na podstawie dowodów. `[DO UZUPEŁNIENIA]` oznacza otwartą decyzję; `[NIEZWERYFIKOWANE]` nie znaczy „działa”. Te dokumenty NIE są zgodą na implementację, instalowanie, zmianę `main` ani ingerencję w działającego Hermesa.

**Status:** DRAFT · **Właściciel decyzji:** użytkownik · **Zależność:** istniejący projekt `Jarvis-`, Hermes, Bridge; Graph 3D jako przyszły moduł.

## 1. Wersja MVP w jednym zdaniu

Jarvis jest MVP, gdy **jedno polecenie użytkownika** dociera do Hermesa, uruchamia autentyczną operację narzędzia niezależnie od otwartej karty, zapisuje wynik oraz dowód i po ponownym otwarciu pokazuje prawdziwy status, także po błędzie.

## 2. Przykład referencyjny — weryfikowalny od początku do końca

**Polecenie:** „Sprawdź stan repozytorium Jarvis i zapisz raport w zatwierdzonym katalogu roboczym”.

**Oczekiwany przebieg:** użytkownik → `TaskId` → Hermes → narzędzie bez wymagania otwartej karty → plik raportu → weryfikacja treści i ścieżki → potwierdzony `ToolReceipt` → zapis historii → odczyt po wznowieniu UI. Jeśli narzędzie zawiedzie, UI pokazuje błąd, nie zielony sukces. Ścieżka raportu: `[DO UZUPEŁNIENIA — bez zgadywania lokalnej ścieżki]`.

## 3. Dla kogo i jaka wartość

- **Użytkownik:** jedna osoba obsługująca własny komputer i projekty.
- **Problem:** dzisiejsze rozwiązania mogą rozpraszać stan między Hermesem, Bridge i kartą; status ukończenia modelu może nie dowodzić rezultatu narzędzia.
- **Efekt:** jedno miejsce poleceń, sprawdzalna historia, łatwe wznowienie i podstawa pod moduły.

## 4. Minimalny produkt — wymagane

- [ ] Czat z prawdziwym Hermesem: potwierdzenie utworzenia `TaskId`.
- [ ] Jeden działający **w tle** scenariusz narzędziowy; nie wymaga otwartego UI.
- [ ] Lista zadań, statusy i szczegóły ostatniej próby.
- [ ] Dziennik zdarzeń oraz wyników narzędzi, zachowany po zamknięciu karty.
- [ ] Dowód wykonanego skutku (np. istniejący raport z oczekiwaną treścią).
- [ ] Widoczny stan połączenia: CONNECTED / STALE / DISCONNECTED.
- [ ] Podstawowa reakcja Orb lub tekstowa aktywność, sterowana prawdziwymi zdarzeniami.
- [ ] Wspólne API/statusy dla przyszłych modułów i działanie bez Jev.
- [ ] Czytelny interfejs także przy 390×844, na klawiaturze i bez WebGL.
- [ ] Kontrolowany błąd, restart, próba ponowna bez podwójnego skutku.

## 5. Świadomie poza MVP

Galaktyka 3D, G6, Second Brain, wieloagentowe roje, trading na prawdziwych pieniądzach, marketplace pluginów, zdalny publiczny dostęp do komputera, nowa druga instalacja Hermesa oraz nowy niezależny Bridge. Wszystkie mogą być modułami **po potwierdzeniu MVP**.

## 6. Ekran MVP (prosty)

| Obszar | Co użytkownik widzi | Sposób potwierdzenia |
|---|---|---|
| Czat | polecenie, ID zadania, odpowiedź Hermesa | ID istnieje w serwerowej historii |
| Zadania | oczekuje / pracuje / zablokowane / sukces / błąd / nieznany | stan z właściciela zadania, nie z animacji |
| Process Log | rzeczywisty start i wynik narzędzia, czas, dowód | zapisany receipt / błąd |
| Status + Orb | połączenie i zaakceptowane zdarzenia | animacja nie zmienia stanu domenowego |

## 7. Warunki: „Jarvis działa”

- [ ] Test polecenie → Hermes → narzędzie → weryfikowalny rezultat: **PASS z dowodem**.
- [ ] Zamknij kartę podczas pracy i otwórz ją ponownie: zadanie i historia nadal istnieją.
- [ ] Zasymuluj błąd narzędzia: nie pokazuje fałszywego sukcesu.
- [ ] Zasymuluj utratę ACK/reconnect: operacja nie wykonuje się podwójnie.
- [ ] Wyłącz Jev: podstawowa ścieżka dalej działa.
- [ ] Sprawdź 390×844 i dostępność bez efektów.
- [ ] Zapisz rzeczywisty commit, log testów i dowód widoku — bez zgadywania.

## 8. Decyzje do uzupełnienia

| Decyzja | Propozycja | Status / dowód |
|---|---|---|
| Repo implementacyjne | istniejący `Jarvis-`, bez przepisywania całego projektu | [POTWIERDŹ PO AUDYCIE] |
| Lokalny host wykonania | wykorzystać działający Bridge lub istniejący wykonawczy proces | [NIEZWERYFIKOWANE] |
| Właściciel trwałych zadań | jedna zatwierdzona baza/warstwa, bez kopii | [NIEZWERYFIKOWANE] |
| Interfejs | dotychczasowy Jarvis OS + minimalne poprawki | [DO PRZEGLĄDU] |
| Zakres zapisu | wybrany katalog na raporty | [DO UZUPEŁNIENIA] |

**Akceptacja dokumentu:** decyzja użytkownika `[NIEZATWIERDZONE]`, data `[—]`.

**Źródła:** `docs/superpowers/specs/2026-10-11-jarvis-os-mvp-modular-design.md` oraz Blueprint 17–18.
