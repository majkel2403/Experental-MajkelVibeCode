# 13 · Błędy i przypadki brzegowe

## 1. Kody wyniku poleceń → co widzi użytkownik

Każde polecenie zwraca kopertę `{ ok, code, data, text, ui }` (`js/registry.js`). Tabela obowiązuje wszystkie źródła; tekst `text` jest zawsze po polsku i bez żargonu.

| kod | kiedy | UI (czat / toast) | rdzeń | model (Hermes) dostaje | stan |
|---|---|---|---|---|---|
| `OK` | udało się | odpowiedź, podświetlenie, „Cofnij” dla A2 | `idle` | wynik | ✅ |
| `NOT_FOUND` | brak obiektu („Nie ma notatki „x””) | dymek + 🆕 podpowiedź najbliższych nazw („Może: Zakupy, Zadania?”) | `idle` | kod + tekst | ✅ / 🆕 podpowiedzi |
| `AMBIGUOUS` | kilka pasuje | chipy z kandydatami (✅ w J.flow), dla Hermesa lista kandydatów | `approval` | kod + kandydaci | ✅ |
| `INVALID_ARGS` | zły argument | „Nie rozumiem godziny „25:00”.” + pytanie o poprawną wartość (slot-ask) | `idle` | kod + który argument | ✅ |
| `NEEDS_CONFIRMATION` | wymaga zgody (wewnętrzne) | chip Tak / Nie / Zawsze | `approval` | — | ✅ |
| `DENIED` | użytkownik odmówił albo zakaz (klucze) | „Użytkownik odmówił.” (dymek szary) | `idle` | „odmówiono — nie ponawiaj” | ✅ |
| `DUPLICATE` | ta sama zapisująca akcja 2× w jednej turze | wykonane raz, dymek „Powtórzone — wykonano raz” | — | kod | ✅ |
| `OFFLINE` | brak sieci dla usługi | stan `offline` w oknie + dymek | `error` krótko | kod | 🟡 kod opisany w rejestrze, ale polecenia zwracają dziś `TIMEOUT`/tekst błędu → 🆕 W2 sprawdzanie `navigator.onLine` przed usługą |
| `RATE_LIMITED` | usługa ogranicza (429) | „Usługa jest przeciążona — spróbuję za chwilę.” | — | kod | 🆕 W2 (dziś tylko bezpiecznik Jeva rozpoznaje 429) |
| `TIMEOUT` | przekroczony czas | „Nie doczekałem się odpowiedzi od …” + „Spróbuj ponownie” | `error` | kod | ✅ |
| `UNSUPPORTED` | przeglądarka nie umie (FSA, mowa, telefon) | co nie działa + co zrobić („Użyj Chrome”) | — | kod | ✅ |
| `INTERNAL` | błąd w kodzie | „Coś poszło nie tak — szczegóły w Process Log.” | `error` | kod | ✅ |
| 🆕 `CONFLICT` | obiekt zmieniony w międzyczasie / okno przeciągane / kolizja cofania | „Notatka zmieniła się w międzyczasie. Nadpisać?” | `approval` | kod | 🆕 W1 |
| 🆕 `LIMIT` | przekroczony limit (widgety, rutyny, minutniki, kosz) | „Masz już 5 minutników. Zatrzymać najstarszy?” | — | kod + limit | 🆕 W3 |

## 2. Błędy usług

| usługa | błąd | zachowanie |
|---|---|---|
| Hermes | brak połączenia | ✅ stan `down`, polecenia przez parser; 🆕 W2 jedno ponowienie po 2 s |
| Hermes | 401 / zły klucz | ✅ komunikat w Ustawieniach; 🆕 powiadomienie raz na sesję |
| Hermes | zerwany strumień w połowie | ✅ `RECOVERING`, zachowana część odpowiedzi + „(przerwane)” |
| Jev | 3 błędy z rzędu | ✅ bezpiecznik, działanie bez Jeva, powiadomienie raz |
| Jev | budżet wyczerpany | ✅ pauza do końca miesiąca / zmiany limitu |
| pogoda / krypto | brak odpowiedzi | ✅ komunikat / symulacja z oznaczeniem; 🆕 ostatnie dane z datą |
| File System Access | brak zgody / cofnięta zgoda | ✅ „Odśwież dostęp”; 🆕 stan `denied` w oknie Pliki |
| zapis danych | brak miejsca (localStorage pełny) | ✅ ostrzeżenie; 🆕 wskazanie największych danych w Ustawieniach → Dane |
| IndexedDB | niedostępna (tryb prywatny Firefox) | 🆕 tryb awaryjny w pamięci + ostrzeżenie „dane z tej sesji nie zostaną zapisane” |

## 3. Przypadki brzegowe (wszystkie z rozwiązaniem)

| przypadek | rozwiązanie |
|---|---|
| użytkownik przeciąga okno, agent je przesuwa | wygrywa użytkownik, `CONFLICT` dla agenta ([04](04-okna.md) §10) |
| polecenie głosem i tekstem naraz | ✅ kolejka `pending` (maks. 3), sygnały/rutyny nie wchodzą do kolejki |
| okno zamknięte w trakcie tury Hermesa | polecenia na nim zwracają `NOT_FOUND`; kontekst odświeżany przed każdym narzędziem (🆕 W1 — dziś raz na turę) |
| cofanie po późniejszej ręcznej zmianie | pytanie ([11](11-agent.md) §2) |
| dwie karty przeglądarki z Jarvisem | D-14: druga karta w trybie „tylko podgląd” z przyciskiem „Przejmij” (BroadcastChannel `jarvis-os`) — 🆕 W2 |
| uszkodzony stan w localStorage (błędny JSON) | ✅ start z domyślnymi; 🆕 kopia uszkodzonego stanu do `jarvis-os:broken:<ts>` i komunikat z przyciskiem „Pobierz uszkodzone dane” |
| nowa wersja aplikacji, stary stan | ✅ migracje przy starcie (`look`, stare klucze); 🆕 numer wersji stanu `stateVersion` i lista migracji w `core.js` |
| nowa wersja service workera | ✅ komunikat o aktualizacji; 🆕 „Odśwież teraz” nie przerywa trwającego zadania (czeka na koniec) |
| zmiana daty (północ) przy otwartym Harmonogramie | 🆕 zdarzenie `day-changed` → odświeżenie „dziś”, reset licznika proaktywności |
| zmiana strefy czasowej / czas letni | zadania trzymają lokalną datę i godzinę (bez stref) — przypomnienie o tej samej godzinie ściennej ✅ |
| bardzo długie zdanie (> 2 000 znaków) | 🆕 przycięte do 500 znaków dla parsera i Jeva (dziś Jev dostaje całe zdanie — 🆕 W1), całość do Hermesa |
| wklejony tekst z instrukcjami | ✅ heurystyka wstrzyknięć tylko dla treści z zewnątrz; zdanie użytkownika to polecenie (jego prawo) |
| brak mikrofonu / odmowa zgody | ✅ komunikat, rdzeń bez fali |
| przeglądarka bez Web Speech | ✅ klik w rdzeń otwiera czat |
| offline przy starcie | ✅ działa z cache service workera; usługi w stanie `offline` |

## 4. Kolejność działania `Esc`

✅ (`js/main.js`), od pierwszego pasującego:
1. menu kontekstowe → zamknij,
2. paleta → zamknij,
3. Process Log (gdy nic nie trwa) → zamknij,
4. powiadomienia → zamknij,
5. pytanie Jarvisa → anuluj (= „Nie”),
6. trwające zadanie → przerwij,
7. Jarvis mówi → ucisz,
8. nasłuch → zatrzymaj,
9. najwyższe okno (nie widget) → zamknij.

🆕 W1: w polu tekstowym `Esc` najpierw zdejmuje fokus z pola (drugi `Esc` idzie dalej); w trybie `focus` podwójny `Esc` wychodzi z trybu; dyktowanie → koniec dyktowania (przed punktem 6).

## 5. Komunikaty — zasady pisania

1. Co się stało, prostym słowem („Nie udało się pobrać pogody”).
2. Co teraz („Spróbuj ponownie” / „Sprawdź internet” / „Wybierz folder w Ustawieniach”).
3. Bez kodów, adresów, stosu wywołań — to idzie do Process Log.
4. Rodzaj gramatyczny zgodny z nazwą aplikacji (🆕 `APP_GENDER`: „Notatnik nie jest otwarty”, „Pogoda nie jest otwarta”).
5. Maks. 140 znaków w toaście.
