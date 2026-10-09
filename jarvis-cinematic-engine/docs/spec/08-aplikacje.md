# 08 · Pozostałe aplikacje

Notatnik i Harmonogram mają osobne dokumenty ([06](06-notatki.md), [07](07-zadania.md)). Tu wszystkie pozostałe. Dla każdej: co jest (✅), czego brakuje (🆕 z falą), jakie widoki ([03](03-nawigacja.md) §3), polecenia, stany ([09](09-wyglad-stany.md) §1).

---

## 1. Czat (`chat`, panel po lewej)

✅ Jest: strumień odpowiedzi, dymki akcji („⚙ narzędzie → wynik”), podpowiedzi pod polem, mikrofon, `↑` przywraca ostatnią wiadomość, „Nowa rozmowa” (czyści historię i streszczenie), przypinanie wyniku jako widget, szybkie odpowiedzi (chipy) przy pytaniach Jarvisa, historia w IndexedDB (`chat.history`, `chat.items`, `chat.summary`), streszczenie kroczące długich rozmów.

🆕 W2:
| funkcja | szczegóły |
|---|---|
| wątki (`chat_thread`) | lista w nagłówku (rozwijana): nazwa, data ostatniej wiadomości; każdy wątek ma własne `history/items/summary` w IndexedDB (`chat.thread.<id>.*`); ⚑ domyślny wątek „Ogólny”; maks. 50 wątków |
| szukanie (`chat_search`) | lupa w nagłówku → pole; wyniki z fragmentem i datą; klik przewija do wiadomości i ją podświetla |
| eksport (`chat_export`) | Markdown: `## Ty` / `## Jarvis`, akcje jako cytaty; zakres: bieżący wątek / wszystkie |
| wyczyść (`chat_clear`) | A0; dziś przycisk ⟳ czyści bez pytania → ✅ pyta i daje „Cofnij” 10 min (kopia w pamięci) |
| pole wielowierszowe | `Shift Enter` nowa linia, auto-wysokość do 6 linii |
| edycja ostatniej wiadomości | „✎” → wiadomość wraca do pola, odpowiedź Jarvisa (i skutki odwracalne — przez „Cofnij”) zostaje oznaczona „zastąpiona” |
| ponów odpowiedź | „↻” wysyła tę samą wiadomość jeszcze raz (bez ponownego wykonywania narzędzi, jeśli wynik zapisał się w historii) |
| załączniki | ⚑ W5, tylko tekst z pliku i notatki („dołącz notatkę zakupy”), bez obrazów (D-16) |
| cytowanie z Process Log | 🆕 w logu „Wstaw do czatu” przy kroku |

Zasady: limit historii dla modelu (✅ `trimHistory`); retencja lokalna ⚑ 5 000 wiadomości na wątek (starsze do pliku przy eksporcie, potem usuwane z pytaniem).

## 2. Monitor rynku (`market`)

✅ 4 waluty (BTC, ETH, SOL, BNB), cena, zmiana 24h, wykres z ostatnich punktów, dane na żywo z Binance (WebSocket) lub CoinGecko, symulacja offline (`live:false`, napis źródła), alerty progowe `market_watch`, wstrzymanie pobierania, gdy nikt nie patrzy.

🆕 W3:
- **Lista obserwowanych** (`market_watchlist`): do 12 symboli; dodawanie z listy CoinGecko (wyszukiwanie po nazwie); ⚑ Binance tylko dla par `<SYM>USDT`, reszta z CoinGecko co 60 s.
- **Alerty** (`market_alerts`): lista z progiem, kierunkiem, czasem utworzenia, liczbą wyzwoleń; usuwanie; historia wyzwoleń (50 ostatnich).
- **Widok waluty** (`app_view market coin`): przewinięcie, podświetlenie, większy wykres (24h / 7d).
- **Flaga źródła** na każdej karcie: „na żywo” / „co minutę” / „symulacja” (D: nigdy nie pokazujemy symulacji bez oznaczenia).
- **Dźwięk alertu** — osobny kanał powiadomień `market` ([10](10-ustawienia.md)).
- **Zakaz**: żadnych przycisków „kup/sprzedaj”, żadnych kluczy giełdowych (D-07).

## 3. Pogoda (`weather`)

✅ Miasto (wyszukiwanie), geolokalizacja („Moja lokalizacja” + nazwa z Nominatim), bieżące warunki, odczuwalna, wiatr, wilgotność, 5 dni, wschód/zachód, pamięć podręczna, `onArg(city)`.

🆕 W1/W3:
- `app_view weather city` (W1).
- Prognoza godzinowa na 12 h (pasek) + dane `hours[]` w `get_weather` (W3, potrzebne do wykresów).
- Jednostki: °C/°F, km/h / m/s (Ustawienia → Użytkownik) (W3).
- Ostatnie znane dane offline z datą („dane z 8:40”) zamiast pustego komunikatu (W3).
- Ulubione miasta (do 5) jako chipy nad polem (W3).

## 4. Monitor systemu (`monitor`)

✅ FPS z wykresem, pamięć JS, opóźnienie pętli, czas pracy, rdzenie CPU, sieć, bateria, okna/akcje, dane lokalne (rozmiar).

🆕 W3: sekcja „Jarvis” (liczba poleceń dziś, wywołania Jeva/Hermesa, koszt dziś, stan bezpiecznika), „Kopiuj diagnostykę” (JSON bez kluczy i treści), alert przy FPS < 20 przez 10 s (tylko w logu, bez powiadomienia).

## 5. Terminal (`terminal`)

✅ Polecenia wewnętrzne (`help, ls/apps, open, close, note, task, calc, timer, weather, crypto, theme, say, ask, neofetch, date, whoami, matrix, clear, reboot`), historia strzałkami, polecenia zmieniające stan wykonane przez model wymagają zgody (L2 — `terminal_run`).

🆕 W3: podpowiadanie `Tab` (nazwy poleceń i aplikacji), kolorowanie wyniku (OK zielony, błąd czerwony — już częściowo), `help <polecenie>`, polecenie `run <id rejestru> {json}` dla zaawansowanych (przez rejestr, ze zgodami). ⚑ To **nie** jest powłoka systemu — nigdy nie uruchamia programów komputera.

## 6. Kalkulator (`calc`)

✅ Przyciski, klawiatura, wyrażenia z nawiasami, procenty, `J.calc` (bez `eval`).

🆕 W3: historia 20 wyników (klik = wstaw), „Kopiuj wynik”, `app_view calc expr` wstawia wyrażenie, tryb naukowy (sin, cos, log, pierwiastek — funkcje są już w `J.calc`).

## 7. Minutnik i stoper (`timer`)

✅ Jeden minutnik globalny (działa przy zamkniętym oknie), chipy 1–60 min, etykieta, start/stop, pauza i dodawanie czasu (`timer_control`), dźwięk + mowa + powiadomienie na koniec, Wake Lock; zakładka Stoper z okrążeniami.

🆕 W3:
- **Kilka minutników** (do 5, `label` odróżnia; `timer_list`); karta HUD i dok pokazują najbliższy koniec.
- **Pomodoro** (`preset`): 25 min pracy / 5 przerwy × 4, potem 15; licznik rund; tryb skupienia włącza się na czas pracy (jeśli użytkownik zgodzi się raz — ⚑ pytanie przy pierwszym użyciu).
- **Na wierzchu** (`wm_pin`), mały widok (tylko cyfry) przy rozmiarze S.
- `app_view timer stopwatch` (W1).

## 8. Biblioteka (`library`)

✅ Siatka aplikacji, formularz skrótu (nazwa + aplikacja albo adres).

🆕 W3: edycja skrótów (`shortcut_edit`) w oknie zamiast okienek `prompt()`, wybór ikony (z listy ikon), kolejność w doku (`dock_order`, przeciąganie), foldery skrótów ⚑ nie (prostota), import/eksport skrótów w pliku danych (już jest w eksporcie całości).

## 9. Ustawienia (`settings`)

Osobny dokument: [10-ustawienia.md](10-ustawienia.md).

## 10. Pliki (`files`) — nowa aplikacja (🆕 W3)

Dziś pliki obsługują tylko polecenia (`files_list/read/write`, `files_export_note`) i wybór folderu w Ustawieniach (File System Access, Chrome/Edge).

Aplikacja:
```
┌ Folder: ~/Jarvis  [Zmień] [Odśwież dostęp] ─────────────┐
│ ▸ raporty/                                              │
│   todo.md          2 KB   dziś 12:04                    │
│   dane.json        8 KB   wczoraj                       │
├──────────────── podgląd ────────────────────────────────┤
│ (tekst / Markdown / JSON sformatowany / obraz)          │
│ [Otwórz jako notatkę] [Wstaw do czatu] [Pobierz]        │
└─────────────────────────────────────────────────────────┘
```
- Drzewo katalogów (rozwijanie na żądanie), sortowanie po nazwie/dacie, filtr.
- Podgląd: `.txt .md .json .csv .log` (do 1 MB), obrazy `png jpg webp svg` (svg jako obraz, nie jako kod).
- Zapis tylko przez polecenia (A0 dla nadpisania; nowy plik A1).
- **Bez File System Access** (Firefox, Safari): tryb „przeglądarkowy” — pliki wybierane ręcznie (`<input type=file>`), zapis = pobranie. Jasny komunikat, czego brakuje.
- Treść plików to dane obce (heurystyka wstrzyknięć, ostrzeżenie do modelu — ✅ D10).

## 11. Pamięć (Ustawienia → Pamięć Jarvisa)

✅ Lista faktów z zakresem, „zapomnij” (×), zapamiętywanie z oceną poufności i trwałości (D12), fakty w kontekście rozmowy.

🆕 W3: edycja faktu (`memory_edit`), zakresy jako filtry (osoba, praca, dom, preferencje, inne), „Co o mnie wiesz?” jako czytelna karta, eksport faktów, data dodania i źródło („powiedziałeś 12.09”), fakt tymczasowy z datą ważności (⚑ `ttl` w dniach, domyślnie brak).

## 12. Centrum powiadomień

✅ Lista (do 100), rodzaje (task, timer, market, routine, agent, hermes, network, files), nieprzeczytane z licznikiem, klik prowadzi do aplikacji, „Wyczyść”, ranking ważności przez Jeva (D14) — ważne na górze.

🆕 W2: przyciski akcji w powiadomieniu (zadanie: Zrobione / +15 min / Jutro; alert kursu: Pokaż / Usuń alert; minutnik: +5 min), grupowanie po rodzaju, kanały i limity (`notif_channel`), „Nie przeszkadzać” w trybie skupienia (pilne przechodzą).

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
