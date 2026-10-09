# 03 · Nawigacja — poruszanie się po Jarvisie

Nawigacja = zmiana tego, **co widać**, bez zmiany danych. Dlatego wszystkie polecenia nawigacji mają poziom **A3** (Jev może je wykonać sam) i dają się cofnąć przez „wróć”.

## 1. Stałe elementy ekranu

| element | gdzie | co robi | stan |
|---|---|---|---|
| Topbar | góra | zegar, stan sieci, stan mózgu (Hermes/Jev), powiadomienia (dzwonek), awatar (Ustawienia), pole wyszukiwania (paleta) | ✅ |
| Pasek ikon | lewa krawędź | szybki start aplikacji, czat (`Alt 1`), log (`Alt 2`) | ✅ |
| Dok | dół | aplikacje + skróty, kropka = otwarte okno | ✅ (✅ kolejność `dock_order`, liczniki na ikonach W3) |
| Rdzeń (orb) | środek | stan Jarvisa; klik = mów / czat | ✅ |
| Karty HUD (10) | wokół rdzenia | co robi agent (model, narzędzia, dane…) | ✅ |
| Panel czatu | lewa strona | rozmowa | ✅ |
| Process Log | prawa strona | kroki zadania | ✅ |
| Centrum powiadomień | spod dzwonka | lista powiadomień | ✅ |

⚑ W trybie `present` (D-01) ukryte są: panel czatu, Process Log, powiadomienia, tytuły notatek w kartach HUD; widoczne okna aplikacji i rdzeń.

## 2. Aplikacje (identyfikatory)

`chat` Czat · `notes` Notatnik · `market` Monitor rynku · `schedule` Harmonogram · `monitor` Monitor systemu · `weather` Pogoda · `terminal` Terminal · `calc` Kalkulator · `timer` Minutnik · `settings` Ustawienia · `library` Biblioteka · 🆕 `files` Pliki (W3, [08-aplikacje.md](08-aplikacje.md) §10). Widgety mają identyfikatory `w:<id>`.

## 3. Widoki w aplikacjach (dla `app_view`)

Każda aplikacja dostaje metodę `onArg(arg, ctx)` i `state(ctx)` (✅ jest w Notatniku, Harmonogramie, Ustawieniach). `app_view {app, view, target}` otwiera aplikację i przekazuje `{view, target}`. Nieznany widok ⇒ aplikacja otwiera się normalnie i Jarvis mówi, jakie widoki są dostępne.

| aplikacja | widok (`view`) | cel (`target`) | przykład zdania | stan |
|---|---|---|---|---|
| notes | `note` | id / fragment tytułu | „otwórz notatkę zakupy” | ✅ (przez `notes_read show`) → ✅ `app_view` |
| notes | `search` | tekst | „pokaż notatki z mlekiem” | 🆕 |
| notes | `trash` | — | „pokaż kosz” | 🆕 W3 |
| notes | `folder` / `tag` | nazwa | „notatki z folderu praca” | 🆕 W3 |
| schedule | `day` | data (YYYY-MM-DD, jutro, piątek) | „pokaż piątek” | ✅ `schedule_day` |
| schedule | `week` | data w tygodniu | „pokaż cały tydzień” | 🆕 W3 (widok tygodnia) |
| schedule | `overdue` | — | „pokaż zaległe” | 🆕 W3 |
| timer | `timer` / `stopwatch` | — | „pokaż stoper” | 🟡 zakładki są, brak `onArg` → 🆕 W1 |
| market | `coin` | BTC/ETH/SOL/BNB (+ obserwowane) | „pokaż ethereum w rynku” | 🆕 W1 (przewinięcie i podświetlenie karty) |
| market | `alerts` | — | „pokaż alerty” | 🆕 W3 |
| weather | `city` | nazwa miasta | „pogoda w Gdańsku” | ✅ `onArg` jest (`J.wm.open('weather','Gdańsk')`) → ✅ podpięcie pod `app_view` W1 |
| settings | `section` | openrouter, akcent, tapeta, interfejs, glos, uzytkownik, hermes, agent, jev, pamiec, pliki, dane (+✅ skroty, powiadomienia, uklady, rutyny) | „otwórz ustawienia jev” | ✅ `settings_open` |
| terminal | `run` | polecenie terminala (tylko wpisuje, nie wykonuje) | „otwórz terminal z neofetch” | 🆕 W1 |
| calc | `expr` | wyrażenie (wpisuje) | „otwórz kalkulator z 2+2” | 🆕 W1 |
| library | `apps` / `shortcut` | — / nazwa skrótu | „pokaż skróty” | 🆕 W1 |
| monitor | `section` | fps, pamiec, siec, dane | — | 🆕 W1 (przewinięcie) |
| chat | `thread` / `message` | nazwa wątku / id wiadomości | „przejdź do wątku praca” | 🆕 W2 |
| files | `path` | ścieżka | „pokaż plik raport.md” | 🆕 W3 |

Każdy widok ma **stan do zapamiętania** (`state()` zwraca `{view, target}`) — dzięki temu działa „wróć”, „otwórz ponownie zamknięte” i adresy (§5).

## 4. Historia: „wróć” i „dalej”

✅ `J.nav` zapisuje migawkę (aktywne okno + lista otwartych) po każdej zmianie okien, stos 30 wpisów, bez duplikatów kolejnych identycznych stanów. `nav_back` przywraca poprzednią migawkę (otwiera zamknięte okno, jeśli trzeba).

🆕 W1:
- **Widoki w historii**: migawka zapisuje też `state()` aktywnego okna, więc „wróć” po „pokaż piątek” wraca do poprzedniego dnia, a nie tylko do okna.
- **`nav_forward`**: drugi stos „dalej”, czyszczony przy każdej nowej nawigacji (jak w przeglądarce).
- **Klawisze** `Alt ←` / `Alt →` (poza polami tekstowymi) i przyciski myszy „wstecz/dalej” (`mouse button 3/4`).
- **Historia przeglądarki**: ⚑ nie podpinamy `history.pushState` — przycisk „wstecz” przeglądarki nie może zamykać Jarvisa ani wychodzić ze strony przez przypadek. Zamiast tego `beforeunload` nic nie blokuje, a nawigacja zostaje wewnątrz.
- **Granice**: „wróć” nie cofa zmian danych (od tego jest „cofnij”). Jeśli w odpowiedzi użytkownik mówi „cofnij” po nawigacji, stos cofania nie ma wpisu nawigacji → Jarvis mówi „Nie mam nic do cofnięcia. Chcesz wrócić do poprzedniego okna?” z chipem „Wróć”.

## 5. Adresy (link do miejsca w Jarvisie)

🆕 W2. Część adresu po `#` (nie trafia do serwera):

```
index.html#go=notes/note/<id>
index.html#go=schedule/day/2026-10-02
index.html#go=settings/section/jev
index.html#go=market/coin/ETH
```

- Format: `go=<app>/<view>/<target>` (target zakodowany `encodeURIComponent`). Łączy się z konfiguracją (`#jevOn=1&go=…`).
- Po otwarciu adresu Jarvis wykonuje `app_view` jako źródło `ui` i czyści `go` z adresu (`history.replaceState`), żeby odświeżenie nie otwierało okna drugi raz.
- „Kopiuj link do tego widoku”: 🆕 pozycja w menu nagłówka okna.
- Klucze API w adresie działają jak dotąd (patrz [15-bezpieczenstwo.md](15-bezpieczenstwo.md)), ale link kopiowany z menu **nigdy** ich nie zawiera.

## 6. Paleta poleceń i wyszukiwanie wszędzie

✅ Dziś: `Ctrl K` lub `/` otwiera paletę z grupami (Akcje, Aplikacje, Polecenia z rejestru), filtr po nazwie.

🆕 W2 — paleta = jedno miejsce do szukania i działania (`search_all`):

| grupa wyników | źródło | akcja po `Enter` | akcja po `Ctrl Enter` |
|---|---|---|---|
| Polecenia | rejestr (etykieta, opis, przykłady) | wykonaj (brakujące argumenty → pytanie) | wstaw do czatu |
| Aplikacje i widoki | §2–3 | otwórz | otwórz obok (przyciągnij w prawo) |
| Notatki | tytuł, treść, tagi | otwórz notatkę | wstaw treść do czatu |
| Zadania | treść, dzień | pokaż dzień zadania | odhacz |
| Widgety | tytuł | aktywuj widget | — |
| Skróty | nazwa, adres | otwórz | edytuj |
| Pamięć | fakty | pokaż w Ustawieniach | — |
| Czat | historia rozmów | przewiń czat do wiadomości | — |
| Ustawienia | nazwy pól i sekcji | otwórz sekcję i podświetl pole | — |
| Pliki | nazwy w folderze roboczym | podgląd | — |

Zasady:
- **Dopasowanie**: bez polskich znaków i wielkości liter (`J.norm`), fragmenty słów, literówki do 1 znaku przy słowach ≥ 5 liter; wynik: dokładne > początek słowa > fragment > literówka; w obrębie — ostatnio używane wyżej.
- **Kolejność grup**: gdy zapytanie wygląda jak polecenie (parser znajduje dopasowanie) → Polecenia najpierw; inaczej → Notatki, Zadania, reszta.
- **Puste pole**: „Ostatnie” (8 pozycji z `recent_list`), „Przypięte” (🆕 gwiazdka przy wyniku), podpowiedzi 3 przykładowych zdań.
- **Prefiksy**: `>` tylko polecenia, `#` tylko notatki z tagiem, `@` tylko ustawienia, `?` pomoc.
- **Limit**: 50 wyników, 8 na grupę z „pokaż więcej”.
- **Klawiatura**: `↑↓` wybór, `Tab` następna grupa, `Esc` zamknij, `Ctrl K` ponownie = zamknij.
- **Czas**: wyniki ≤ 50 ms dla 1000 notatek (indeks w pamięci budowany przy starcie i aktualizowany po zdarzeniach `notes`/`tasks`).
- Paleta **nie wysyła** zapytania do Jeva ani Hermesa. Przycisk „Zapytaj Jarvisa: …” na dole wysyła tekst do czatu.

## 7. Ostatnio otwierane i przypięte

🆕 W2. `J.state.ui.recent` (✅ pole istnieje) przechowuje 20 ostatnich `{app, view, target, title, ts}`. Przypięte (🆕 `ui.pinned`, maks. 12) widać w palecie i w menu pulpitu „Przypięte ›”.

## 8. Tryby przestrzeni (`ui_mode`)

🆕 W2 (D-01). Maszyna stanów:

```
            użytkownik                          agent (automatycznie)
  work ⇄ clean ⇄ focus ⇄ present          idle → thinking → idle
```

| tryb | co widać | kto włącza | wyjście |
|---|---|---|---|
| `work` (domyślny) | okna, dok, karty HUD przy pracy agenta | użytkownik | — |
| `clean` | tylko rdzeń i tapeta (okna zminimalizowane, nie zamknięte) | „posprzątaj pulpit” | „tryb pracy” albo otwarcie okna |
| `focus` | jedno okno na środku + tryb skupienia (cisza powiadomień poza pilnymi) | „tryb skupienia”, `focus_mode` | „koniec skupienia”, `Esc` 2× |
| `present` | okna, bez czatu, logu, powiadomień, prywatnych tytułów | „tryb prezentacji” | ponowne polecenie, `Alt P` |
| `idle` / `thinking` | stan rdzenia i kart (ustawia silnik zdarzeń) | agent | automatycznie |

Przejście trwa 450–700 ms (zależnie od `fx_level`), przy `off` — natychmiast. Tryb zapisuje się w `ui.mode` i wraca po odświeżeniu (poza `present`, który po odświeżeniu wraca do `work`).

## 9. Mapa skrótów klawiszowych

Obowiązuje poza polami tekstowymi, chyba że napisano inaczej. 🆕 = nowy (W1/W2). Wszystkie zmienialne w Ustawieniach → Skróty (🆕 `keys_set`, W2), z wykrywaniem konfliktów.

| skrót | działanie | stan |
|---|---|---|
| `Ctrl K`, `/` | paleta / wyszukiwanie | ✅ |
| `Ctrl Spacja` | mów do Jarvisa | ✅ |
| `Alt J` | czuwanie (słowo „Jarvis”) | ✅ |
| `Alt 1` / `Alt 2` / `Alt 3` | czat / Process Log / telemetria | ✅ |
| `Alt N` | powiadomienia | ✅ |
| `Alt W` | następne okno | ✅ |
| `Alt Shift W` | poprzednie okno | 🆕 |
| `Alt ←→↑↓` | przyciągnij okno do krawędzi | ✅ |
| `Alt Enter` | maksymalizuj | ✅ |
| `Esc` | kolejność w [13-bledy.md](13-bledy.md) §4 | ✅ |
| `Alt ←` / `Alt →` z `Ctrl` | wróć / dalej | 🆕 (⚑ `Ctrl Alt ←/→`, bo `Alt ←` przyciąga okno) |
| `Alt Shift ←→↑↓` | przesuń okno o 40 px (z `Ctrl` o 8 px) | 🆕 |
| `Alt Ctrl Shift ←→↑↓` | zmień rozmiar o 40 px | 🆕 |
| `Alt D` | pokaż pulpit / przywróć | 🆕 |
| `Alt T` | ułóż w kafelki | 🆕 |
| `Alt P` | tryb prezentacji | 🆕 |
| `Alt Spacja` | menu aktywnego okna | 🆕 |
| `Ctrl Shift T` | otwórz ponownie zamknięte okno | 🆕 |
| `Ctrl Z` | cofnij ostatnią akcję Jarvisa/UI (poza polem tekstowym) | 🆕 |
| `Ctrl Alt N` | nowa notatka | 🆕 |
| `F2` | zmień nazwę zaznaczonego (notatka, widget, skrót) | 🆕 |
| `Del` | usuń zaznaczone (z pytaniem) | 🆕 |
| `?` | ściąga skrótów (okienko z tą tabelą) | 🆕 |

Konflikty z przeglądarką: nie przejmujemy `Ctrl T/W/N/L/R/Tab`, `F5`, `F11`, `Alt F4`. `Alt` + litera na Macu to `Option` — ⚑ na Macu wszystkie skróty `Alt` działają też z `Ctrl` (np. `Ctrl 1`).

## 10. Fokus i klawiatura (dostępność)

🆕 W2:
- **Kolejność Tab**: topbar → pasek ikon → pulpit (skróty) → okna od najwyższego → dok → panel czatu.
- **Dok i pasek ikon**: jedno miejsce w kolejności Tab, strzałki przesuwają się między ikonami (roving tabindex), `Enter` otwiera, `Shift F10` = menu kontekstowe.
- **Okna**: `role="dialog"` ✅, 🆕 `aria-labelledby` na tytuł, po otwarciu fokus na pierwszy element okna, po zamknięciu wraca do elementu, który je otworzył.
- **Pytania i zgody** (chip przy rdzeniu): 🆕 pułapka fokusa — Tab krąży po przyciskach chipa, `Esc` = „Nie”/anuluj.
- **Widoczny fokus**: obwódka w kolorze akcentu 2 px + poświata; nigdy `outline: none` bez zamiennika.

## 11. Nawigacja na małym ekranie

🆕 W2 (D-15), poniżej 640 px:
- Jedno okno naraz na cały ekran; nagłówek okna ma „‹ Wróć” (= `nav_back`) zamiast przycisków okna.
- Dok = dolny pasek z 5 ulubionymi + „Więcej”.
- Czat = pełny ekran, przełączany ikoną.
- Gest przesunięcia od lewej krawędzi = „wróć”.
- Karty HUD zwinięte do jednego paska stanu nad dokiem.

## 12. Co mówi Jarvis przy nawigacji (odpowiedzi)

- Otwarcie: „Otwarto: Notatnik.” (A3 — po cichu, gdy wykonał Jev z pewnością ≥ 0,8: bez dymka, tylko podświetlenie okna).
- Widok: „Harmonogram: piątek 2 października — 3 zadania.”
- Brak widoku: „Minutnik nie ma widoku „X”. Są: minutnik, stoper.”
- Brak historii: „Nie ma dokąd wrócić.”

## 13. Testy (skrót — pełna lista w [16-testy.md](16-testy.md))

- Każdy wiersz tabeli §3: `app_view` otwiera aplikację i `state()` zwraca `{view, target}`.
- „wróć” po zmianie widoku wraca do poprzedniego widoku; „dalej” po „wróć” wraca; nowa nawigacja czyści „dalej”.
- Adres `#go=…` otwiera widok i znika z paska adresu.
- Paleta: 1000 notatek, wynik ≤ 50 ms; zapytanie bez polskich znaków znajduje „Zażółć”.
- Żaden skrót nie działa w polu tekstowym (poza `Esc`, `Ctrl K`).

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
