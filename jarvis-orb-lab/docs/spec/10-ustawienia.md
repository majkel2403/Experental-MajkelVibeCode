# 10 · Ustawienia

Pełna lista istniejących kluczy z wartościami domyślnymi: [katalog-ustawien.md](katalog-ustawien.md) (generowana z kodu). Tu: układ okna, zasady zmian, nowe ustawienia.

## 1. Układ okna Ustawień

✅ Dziś jedna długa kolumna z sekcjami (kolejność w oknie): OpenRouter · Kolor akcentu · Tapeta · Interfejs · Głos · Użytkownik · Hermes · Agent i proaktywność · Sędzia Jev · Pamięć Jarvisa · Folder roboczy · Dane. Skok do sekcji: `settings_open` (✅ W F4).

🆕 W2 — okno z **menu sekcji po lewej** (przy szerokości ≥ 520 px; węziej — lista rozwijana na górze) i **wyszukiwaniem pól** (pole „Szukaj w ustawieniach”, podświetla pole i przewija):

| sekcja | co zawiera | klucze / polecenia |
|---|---|---|
| **Konto AI** | klucz OpenRouter (dla mózgu i sędziego), test | `openrouterKey` |
| **Wygląd** | kolor, tapeta, 🆕 skala, 🆕 efekty, cząsteczki, 🆕 tryb startowy przestrzeni | `accent`, `accent2`, `wall`, `particles`, 🆕 `uiScale`, 🆕 `fxLevel`, 🆕 `startMode` |
| **Głos i dźwięk** | głos syntezatora, mówienie odpowiedzi, cichy głos, słowo „Jarvis”, dźwięki, 🆕 głośność, 🆕 tempo mowy, 🆕 język rozpoznawania | `voiceName`, `speech`, `silentVoice`, `wakeWord`, `sound`, 🆕 `volume`, 🆕 `speechRate`, 🆕 `sttLang` |
| **Użytkownik** | inicjały, miasto (+ lokalizacja), 🆕 jednostki | `user`, `city`, `lat`, `lon`, 🆕 `units` |
| **Hermes (mózg)** | dostawca, adres, klucz, model, lżejszy model, format narzędzi, test | `hermes*`, `toolFormat` |
| **Agent i proaktywność** | tryb (cichy/aktywny), limit na godzinę, cisza nocna, briefing, podsumowanie, „zawsze dozwolone”, 🆕 rutyny | `proactive*`, `quiet*`, `briefingTime`, `summaryTime`, `ui.allowAlways`, 🆕 `routines` |
| **Sędzia Jev** | ✅ wszystko z F0–F5 (prywatność, samodzielność, progi, budżet, tryb cienia, dziennik, statystyki) | `jev*` |
| 🆕 **Powiadomienia** | kanały (zadania, minutnik, rynek, sieć, agent, pliki, Hermes): wł./wył., dźwięk, limit na godzinę; powiadomienia systemowe (zgoda przeglądarki) | 🆕 `notif.<kanał>.{on,sound,perHour}` |
| 🆕 **Skróty klawiszowe** | tabela z [03](03-nawigacja.md) §9, zmiana, konflikty, „Przywróć domyślne” | 🆕 `keys` |
| 🆕 **Układy okien** | edytor układów, układ startowy | `layouts`, 🆕 `layoutStartup` |
| **Pamięć** | fakty (edycja 🆕), zakresy | IndexedDB `memory.facts` |
| **Pliki** | folder roboczy, dostęp | IndexedDB `files.dir` |
| **Dane i prywatność** | eksport, import, reset, 🆕 spis danych („co jest zapisane”), 🆕 miejsce zajęte, 🆕 czyszczenie wybranych danych | — |
| 🆕 **O programie** | wersja, zmiany, skróty (`?`), testy diagnostyczne (sieć, Hermes, Jev, mikrofon, zapis), „Pokaż samouczek”, Eksperymenty (flagi funkcji), nakładka diagnostyczna (`Alt Shift D`: pakiet kontekstu, ostatnia decyzja Jeva, FPS, stos „Cofnij”) | `flags` |

## 2. Zasady zmian ustawień

1. **Zapis natychmiastowy** (bez przycisku „Zapisz”), poza polami kluczy (zapis po wyjściu z pola / „Zapisz i testuj”) ✅.
2. **Walidacja** przy zapisie: liczby przycinane do zakresu (✅ dla Jeva), adresy URL muszą mieć `http(s)://`, godziny `HH:MM`, puste = wyłączone.
3. **Kto może zmienić** (✅ `settings_set` z ochroną):
   | rodzaj | przez UI | przez polecenie od modelu/głosu |
   |---|---|---|
   | wygląd, miasto, inicjały | tak | A1 (pytanie „Chodzi o…?” przy niepewności) |
   | proaktywność, nasłuch, cisza nocna, autonomia Jeva, prywatność Jeva, budżet | tak | **A0** (zawsze zgoda) |
   | klucze API, adres Hermesa | tak | **nigdy** (odmowa `DENIED`) |
4. **Cofanie**: każda zmiana przez polecenie ma „Cofnij” (🆕 W2 — dziś tylko motyw/tapeta/dźwięk). Zmiana w oknie Ustawień — cofanie przez `Ctrl Z` poza polem (🆕).
5. **Przywracanie domyślnych** per sekcja (`settings_reset`, A0) — klucze API zostają.
6. **Zdarzenie** `J.emit('settings')` po każdej zmianie (✅); moduły same się odświeżają (Jev resetuje bezpiecznik przy zmianie klucza ✅).

## 3. Nowe klucze (🆕)

| klucz | typ | domyślnie | zakres | fala |
|---|---|---|---|---|
| `uiScale` | number | 100 | 80–130 | W2 |
| `fxLevel` | string | `standard` | off, tool, standard, cinema | W5 |
| `startMode` | string | `work` | work, clean, focus | W2 |
| `volume` | number | 60 | 0–100 | W5 |
| `speechRate` | number | 1 | 0,7–1,5 | W2 |
| `sttLang` | string | `pl-PL` | pl-PL, en-US | W2 |
| `units` | object | `{temp:'C', wind:'kmh'}` | C/F, kmh/ms | W3 |
| `notif` | object | wszystkie kanały wł., dźwięk wł., `perHour` 20 | patrz §1 | W2 |
| `keys` | object | mapa z [03](03-nawigacja.md) §9 | — | W2 |
| `layoutStartup` | string | `none` | none, last, nazwa | W2 |
| `watchlist` | string[] | `['BTC','ETH','SOL','BNB']` | ≤ 12 | W3 |
| `favCities` | string[] | `[]` | ≤ 5 | W3 |
| `dockOrder` | string[] | kolejność domyślna | — | W3 |
| `hermesPreset` | string | `balanced` | `cheap` (lżejszy model zawsze, krótkie odpowiedzi), `balanced` (lżejszy tylko do rozmowy — ✅ `hermesModelLite`), `max` (zawsze model główny, weryfikacja D6 zawsze) | W2 |
| `hermesDailyBudget` | number | 0 (bez limitu) | USD/dzień dla Hermesa przez OpenRouter; po przekroczeniu — parser lokalny + powiadomienie raz; licznik z pola `usage` odpowiedzi | W2 |
| `offlineMode` | boolean | false | „tryb samolotowy”: żadnych wywołań sieci (Hermes, Jev, pogoda, krypto); działa parser i dane lokalne; znacznik w topbarze | W2 |
| `flags` | object | `{}` | flagi funkcji z [17](17-wdrozenie.md) (włączanie fal na próbę) | W1 |

Nowe klucze dopisujemy do `DEFAULTS()` w `js/core.js` (katalog ustawień zaktualizuje się sam) i — jeśli mogą być w adresie — do `ALLOW`.

## 4. Samouczek pierwszego uruchomienia

✅ Onboarding (`ui.onboarded`): pierwsze uruchomienie prowadzi przez klucz OpenRouter/Hermesa. 🆕 W2 — krótki samouczek (5 kroków, każdy z „Dalej / Pomiń”): 1) rdzeń i mówienie, 2) czat i przykładowe polecenia, 3) okna (przeciąganie, `Alt ←→`), 4) paleta `Ctrl K`, 5) „Cofnij” i „wróć”. Każdy krok podświetla element (`ui_highlight` ✅). Powtórzenie: Ustawienia → O programie → „Pokaż samouczek” albo „Jarvis, pokaż samouczek”. Po każdej fali 1 ekran „Co nowego” (raz).

## 5. Eksport, import, reset

✅ Eksport: plik JSON ze stanem (bez kluczy API), import z pliku, „Resetuj wszystko” (z pytaniem).
🆕 W2:
- Eksport zawiera też dane z IndexedDB (pamięć, historia czatu, wersje notatek, dziennik Jeva — każde do odznaczenia) i numer wersji formatu (`exportVersion: 2`).
- Import: podgląd („12 notatek, 30 zadań, 5 widgetów — scalić czy zastąpić?”), scalanie po `id`, migracja starszych formatów.
- Reset: wybór, co wyczyścić (wszystko / tylko czat / tylko dziennik Jeva / tylko pozycje okien).
- „Co jest zapisane”: tabela magazynów (localStorage `jarvis-os:v2`, IndexedDB: `chat.*`, `memory.facts`, `proc.history`, `files.dir`, `jev.log`, 🆕 `notes.versions.*`, `widgets.cache`) z rozmiarem i przyciskiem „wyczyść”.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
