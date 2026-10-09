# 09 · Wygląd, stany, wizualizacja, dostępność

## 1. Stany każdego widoku (jeden wzór dla wszystkich)

Każde okno, widget, lista i karta pokazuje jeden z tych stanów. Wspólny komponent 🆕 `J.ui.state(el, kind, opts)` (W2) — dziś każda aplikacja robi to po swojemu (`<div class="empty">…</div>`).

| stan | wygląd | tekst (wzór) | akcja |
|---|---|---|---|
| `loading` | szkielet (2–4 szare paski, pulsowanie 1,2 s; przy `fx_level=off` bez pulsowania) | „Pobieram prognozę…” | — |
| `empty` | ikona + zdanie + podpowiedź | „Brak zadań na ten dzień. Powiedz: „przypomnij mi o 18 trening”.” | przycisk głównej czynności („+ Dodaj”) |
| `error` | czerwona ikona + zdanie po ludzku (bez kodów) | „Nie udało się pobrać pogody.” | „Spróbuj ponownie” |
| `offline` | ikona chmury | „Brak internetu — pokazuję dane z 8:40.” | — (samo wraca po `online`) |
| `denied` | kłódka | „Brak zgody na lokalizację.” / „Brak dostępu do folderu.” | „Nadaj dostęp” |
| `partial` | dane + żółta plakietka | „Część danych nieaktualna (Binance niedostępny).” | — |
| `stale` | dane przygaszone 60 % + znacznik czasu | „nieaktualne · 12:04” | „Odśwież” |
| `mock` | plakietka „symulacja” | „Dane symulowane (brak połączenia z giełdą)” | — |
| `success` | krótki błysk ramki (300 ms) + toast | „Zapisano.” | — |

Zasady tekstów: bez żargonu („Brak połączenia z serwisem pogody”, nie „HTTP 503”); zawsze co się stało + co można zrobić; szczegóły techniczne tylko w Process Log.

## 2. Barwy, czcionki, odstępy (tokeny)

✅ Zdefiniowane w `css/jarvis.css` (`:root`): `--accent` (#33d6ff) i `--accent2` (#a25cff) z wariantami `-rgb`, `--bg` #03060f, `--bg2`, `--text` #eaf6ff, `--muted`, `--dim` (kontrast ≥ 5:1), `--ok` #3ef0a3, `--warn` #ffb84d, `--err` #ff5d7a, czcionki `--font` (Inter), `--hud` (Rajdhani), `--mono` (JetBrains Mono). Motywy (`J.THEMES`): jarvis, cyjan, niebieski, fiolet, zielony, złoty, czerwony, różowy. Tapety: photo, aurora, void.

✅ W2 (tokeny są w `:root`; 🟡 większość komponentów ma jeszcze wartości wpisane ręcznie — nowy kod pisz na tokenach, dokładne wartości komponentów: [18 · handoff pulpitu](18-handoff-pulpit.md)):
- **Skala odstępów**: 4, 8, 12, 16, 24, 32 px jako `--s1…--s6`.
- **Promienie**: `--r-sm` 8, `--r-md` 12, `--r-lg` 16.
- **Warstwy (z-index)** jako tokeny: pulpit 1, karty HUD 20, okna 30–9 999, przypięte 10 000+, panele 20 000, menu 99 000, chipy pytań 99 990+, toasty 99 995, start/boot 100 000.
- **Skala interfejsu** (`ui_scale`, 80–130 %): zmienna `--ui-scale` mnożąca rozmiar czcionki i odstępy; okna przeliczają pozycje proporcjonalnie.
- **Gęstość** (kompaktowo / wygodnie): ⚑ nie jako osobne ustawienie — zastępuje ją skala interfejsu (80 % ≈ kompaktowo, 110 % ≈ wygodnie); jedna regulacja zamiast dwóch.
- **Kontrast**: każdy nowy kolor tekstu ≥ 4,5:1 na tle szkła (test w przeglądarce liczy kontrast dla wszystkich `.muted/.dim`).

## 3. Rdzeń (orb) — stany

✅ `J.orb.set(state)`: `idle` (centrum środowiska), `listening` (słucham), `thinking` (analizuję), `speaking` (mówię), `alert` (uwaga); pasek zadania nad rdzeniem (`banner`). Silnik zdarzeń (`js/events.js`) ma tryby: IDLE, LISTENING, THINKING, EXECUTING, APPROVAL_REQUIRED, PAUSED, RECOVERING, COMPLETED, ERROR.

| tryb silnika | rdzeń | pierścienie | pasek nad rdzeniem | dźwięk |
|---|---|---|---|---|
| IDLE | spokojne pulsowanie | wolny obrót | ukryty po 2,6 s | — |
| LISTENING | fala dźwięku | szybszy obrót | „słucham” | krótki „tik” |
| THINKING | jaśniejszy środek | przyspieszony | tytuł zadania | — |
| EXECUTING | błyski przy każdym narzędziu | pakiety do węzłów | „wykonuję: nazwa” | cichy „tik” na narzędzie |
| APPROVAL_REQUIRED | żółty | zatrzymane | pytanie | „pytanie” (✅ `sfx.ask`) |
| PAUSED | przygaszony | zatrzymane | „wstrzymane” | — |
| RECOVERING | pomarańczowy migający | wolny | „ponawiam…” | — |
| COMPLETED | błysk ukończenia | — | wynik (chip) | „gotowe” |
| ERROR | czerwony puls 2× | — | krótki opis | „błąd” |

🆕 W2: interakcje z rdzeniem — klik = mów (✅) / czat, gdy brak mikrofonu (✅); **przytrzymanie 600 ms** = menu (Mów · Czat · Tryb czuwania · Stop zadania · Process Log); przeciąganie — ⚑ nie (rdzeń ma stałe miejsce).

## 4. Karty HUD — kontrakt „zdarzenie → co pokazuje”

✅ 10 kart wokół rdzenia (`js/hud.js`), zasilane szyną zdarzeń. 🆕 W2 — spisany kontrakt (dziś rozproszony w kodzie) + klik w kartę.

| karta | źródło (zdarzenia) | pokazuje | klik (🆕) |
|---|---|---|---|
| Model AI | `model.started/completed/failed`, strumień znaków | nazwa modelu, fala z liczby znaków, czas do 1. tokenu | Ustawienia → Hermes |
| Analiza polecenia | `judge.*`, `task.created` | intencja Jeva + pewność (pasek), trasa (sam/pytanie/Hermes) | Process Log (krok Jeva) |
| Tool Calls | `tool.started/completed/failed` | licznik rozpoczętych/ukończonych/błędnych, ostatnie narzędzie | Process Log (lista narzędzi) |
| Internet | narzędzia z węzła `internet` | liczba zapytań, ostatnia usługa | — |
| Dane zewnętrzne | węzły `notes/files/memory` | co czytano (bez treści) | — |
| Pliki i dokumenty | węzeł `files` | nazwa pliku | okno Pliki (🆕) |
| Status systemu | sieć, Hermes, Jev, bezpiecznik | kropki stanu | Monitor systemu |
| Wykonywanie zadania | `plan.created/step`, `task.*` | krok N/M planu, pasek | Process Log |
| Logika i decyzje | zgody, weryfikacja (`task.verifying/verified`), `security.injection` | ostatnia decyzja, ostrzeżenia | Process Log |
| Zakończenie | `task.completed/failed/cancelled` | czas, liczba narzędzi, wynik | chip wyniku |

Zasady: karta bez danych jest przygaszona (nie pusta); karty chowają się przy oknie zasłaniającym > 50 %; na niskich ekranach (< 760 px wysokości sceny) karty zmniejszają się (✅ `k`), poniżej 640 px szerokości — jeden pasek stanu.

## 5. Process Log

✅ Kroki (myśli, narzędzia, plan, błędy, Jev), czasy, historia zadań w IndexedDB, eksport, powtórka (Replay) na rdzeniu.

🆕 W2: filtry (Wszystko · Narzędzia · Błędy · Jev · Ta tura), przypięcie kroku, „Kopiuj JSON” przy kroku narzędzia (bez kluczy), „Wstaw do czatu”, porównanie dwóch zadań obok siebie (W5), limit 200 zadań w historii z rotacją (✅ jest limit — spisać wartość w kodzie).

## 6. Wykresy i wizualizacje

✅ `J.spark(canvas, arr, color)` — linia z wypełnieniem (rynek, monitor). 🆕 W4 `J.chart(canvas, {kind, series, labels, …})`:

| rodzaj | użycie | zasady |
|---|---|---|
| `spark` | małe wykresy trendu w kartach i widgetach | bez osi, kolor wg kierunku (ok/err) |
| `line` / `area` | kursy 24h/7d, temperatura 12 h | oś X z 4–6 etykietami (godz./dni), oś Y 3 etykiety, siatka 10 % krycia |
| `bar` | zadania w tygodniu, aktywność, koszt dzienny | słupki z wartością nad słupkiem przy ≤ 12 słupkach |

Wspólne: dymek po najechaniu (wartość + etykieta), dostosowanie do `devicePixelRatio` (✅ w `spark`), animacja wejścia 400 ms (poza `fx_level=off`), opis tekstowy dla czytników (`aria-label` = „Bitcoin, 24 godziny, od 61 200 do 63 150 USD, teraz 63 146”), kolory z tokenów (nie wpisane ręcznie), pusty zbiór → stan `empty`.

Katalog wizualizacji (cel · źródło · odświeżanie · interakcja · eksport):

| wizualizacja | źródło | odświeżanie | interakcja | stan |
|---|---|---|---|---|
| rdzeń i pierścienie | szyna zdarzeń | na żywo | klik / przytrzymanie | ✅ / 🆕 menu |
| karty HUD | szyna zdarzeń | na żywo | 🆕 klik | ✅ |
| oś czasu Process Log | zdarzenia zadania | na żywo | filtry, replay | ✅ / 🆕 filtry |
| aktywność agenta (telemetria) | licznik akcji | co 1 s | — | ✅ |
| kursy krypto | Binance/CoinGecko | na żywo / 60 s | 🆕 widok waluty, 24h/7d | ✅ spark / 🆕 line |
| kalendarz tygodnia | zadania | zdarzenie `tasks` | przeciąganie | 🆕 W3 |
| postęp planu | `plan.*` | na żywo | pauza/pomiń | ✅ / 🆕 sterowanie W4 |
| telemetria systemu | `performance` | 1 s | — | ✅ |
| koszt (Jev + Hermes) | dziennik Jeva, 🆕 licznik tokenów Hermesa | po wywołaniu | wykres dzienny | 🟡 Jev / 🆕 W3 |
| pewność Jeva | dziennik decyzji | po decyzji | lista ostatnich 20 | 🆕 W3 (Ustawienia → Jev) |
| różnice (wersja notatki, układ) | wersje | na żądanie | przełączanie wersji | 🆕 W3 |
| minimapa okien | `J.wm.info()` | zdarzenie `wm` | klik = fokus | ⚑ W5 (opcjonalnie) |
| widgety z opisu | polecenia A3 | `refresh` / zdarzenia | przyciski | 🆕 W4 |

## 7. Ruch i efekty (`fx_level`, D-08)

| poziom | co działa |
|---|---|
| `off` | brak animacji ruchu i cząsteczek; zmiany natychmiastowe; nadal zmiany koloru stanu |
| `tool` | krótkie przejścia (≤ 200 ms), bez cząsteczek, rdzeń bez orbit |
| `standard` (⚑ domyślnie) | obecny wygląd: przejścia 220–450 ms, cząsteczki, orbity |
| `cinema` | + dłuższe przejścia trybów (700 ms), „duch” okna przed otwarciem przez agenta, pakiety na liniach |

✅ `prefers-reduced-motion` w CSS skraca animacje do 0,01 ms. 🆕 `fx_level` = min(ustawienie, systemowe ograniczenie). Budżet: przy FPS < 30 przez 5 s Jarvis sam obniża poziom o jeden i mówi o tym w logu (nie w powiadomieniu).

## 8. Dźwięki

✅ `J.sfx`: open, close, snap, click, notify, error, ask, confirm, tick… (syntezowane, bez plików), przełącznik `sound`.
🆕 W5: głośność (0–100 %), dźwięki per rodzaj powiadomienia (kanały), wyciszenie w ciszy nocnej i trybie `present`.

## 9. Dostępność

| wymaganie | stan |
|---|---|
| kontrast tekstu ≥ 4,5:1 (`--dim` poprawione) | ✅ |
| `prefers-reduced-motion` | ✅ |
| role i etykiety: okna `role=dialog` + `aria-label`; pytanie `aria-labelledby` (treść pytania), bez `aria-modal` — odpowiedź może przyjść z czatu i głosem; schowane chipy `inert` | ✅ |
| obsługa klawiaturą wszystkiego ([03](03-nawigacja.md) §9–10); karty HUD jako przyciski (Enter/Spacja) | 🟡 / 🆕 W2 |
| komunikaty na żywo: chip pytania `aria-live=assertive`, „Cofnij” i toasty `polite` | ✅ |
| cele dotyku ≥ 40 × 40 px (dok, przyciski okna) przy `pointer: coarse`; myszą 28 px (WCAG 2.2 AA: ≥ 24 px) | ✅ |
| czytniki ekranu: wykresy z opisem tekstowym | 🆕 W4 |
| skala interfejsu 80–130 % | 🆕 W2 |
| praca bez dźwięku (każdy sygnał dźwiękowy ma odpowiednik wizualny) | ✅ |

## 10. Rozmiary ekranu

| szerokość | zachowanie |
|---|---|
| ≥ 1280 | pełny układ (karty HUD, czat i log obok pulpitu) |
| 760–1279 | karty HUD mniejsze (✅ `k`), czat nakłada się na pulpit |
| 641–759 | karty jako pasek, okna normalne |
| ≤ 640 | tryb telefonu (D-15, [03](03-nawigacja.md) §11, [04](04-okna.md) §11) |
| wysokość < 700 | ✅ scena zmniejszona, karty nie wchodzą pod dok/pasek (test e2e 1280×720) |

## 11. Tryb prezentacji (`present`)

Ukryte: czat, Process Log, centrum powiadomień (liczba zostaje, treści nie), tytuły notatek w kartach, pamięć w Ustawieniach, klucze (zawsze), podgląd plików. Widoczne: okna, rdzeń, dok. Toasty pokazują tylko „Nowe powiadomienie”. Rozpoznawalny znacznik w topbarze „● Prezentacja”.

<!-- polecenia:start (generuje tools/gen-spec.js) -->

## Planowane polecenia tej części

Wszystkie zaplanowane polecenia tej części są już w rejestrze — zobacz [katalog-polecen.md](katalog-polecen.md).

<!-- polecenia:end -->
