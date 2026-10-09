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

✅ Zdefiniowane w `css/jarvis.css` (`:root`): `--accent` (#33d6ff) i `--accent2` (#a25cff) z wariantami `-rgb`, `--bg` #03060f, `--bg2`, `--text` #eaf6ff, `--muted`, `--dim` (kontrast ≥ 5:1), `--ok` #3ef0a3, `--warn` #ffb84d, `--err` #ff5d7a, czcionki `--font` (Inter), `--hud` (Rajdhani), `--mono` (JetBrains Mono). Motywy (`J.THEMES`): jarvis, cyjan, niebieski, fiolet, zielony, złoty, czerwony, różowy, **neon** (cyjan + magenta, jedyny z magentą). Tapety: **neon** (domyślna dla nowych użytkowników: nocna scena WebGL z siatką-podłogą; bez WebGL gradient CSS), photo („Jezioro” — klasyczna), aurora, void. Nowy język wizualny: [przewodnik](../guide/wyglad-neon.md), decyzja: [ADR 0008](../adr/0008-wyglad-neon-holo-glass.md), tokeny `--glow-state`, `--activity`, `--neon-*` w `css/neon.css`.

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

> **Zmiana znaczenia `standard` (D-08):** z „obecny wygląd” na „nowy, tani wygląd” (Neon Holo-Glass: LED rim, kolory stanów, diody, Orb reagujący na mowę). **Klasyczny wygląd = tapeta `photo` + motyw `jarvis`** — pozostaje dostępny jako zwykłe ustawienia (tapeta, motyw), niezależnie od poziomu efektów. Struktura kontraktu bez zmian: 4 poziomy, domyślnie `standard`, `prefers-reduced-motion` → `off`.

| poziom | co działa |
|---|---|
| `off` | statyczny neon i LED rim w kolorze stanu, **zero ruchu** (`.window`: `transition-duration` od `0s`, `animation-name: none`); zmiany koloru stanu nadal działają; bez impulsów i rozbłysków diod |
| `tool` | jw. + krótkie przejścia (≤ 150 ms, limit 200 ms), bez cząsteczek i orbit w rdzeniu; LED rim nadal statyczny |
| `standard` (⚑ domyślnie) | nowy, tani wygląd: LED rim **reaktywny** (jasność z `--activity`), impulsy zdarzeń (< 1 s), rozbłyski diod statusu, przejścia 220–450 ms, cząsteczki, orbity, Orb z amplitudą z mowy; statyczne scanlines/obramowania |
| `cinema` | + dłuższe przejścia trybów (700 ms), „duch” okna przed otwarciem przez agenta, komety na liniach obwodów, aberracja chromatyczna 200 ms po realnej porażce, skan sukcesu, pasy ostrzegawcze w ruchu przy zgodzie, segmentowy pierścień planu, pasek skanu NO LINK, hologramowe okna i „duch” przy każdym otwarciu, equalizer mikrofonu (z realnym analyserem), paralaksa Orba i tła od kursora, tilt kart HUD, cząstki GL (deszcz danych, pył, iskry; 6 tys. punktów, regulator zmniejsza ich liczbę przed skalą), prędkość siatki = realna aktywność agenta (każdy z realnego zdarzenia — tabela niżej) |

Tryby: **skupienie** (`#app.focus`) = biały LED rim, przygaszone tło i zwężona (ciemniejsza) winieta, tylko przez opacity warstw; **prezentacja** (`#app.present`) = LED rim, impulsy i dioda zadania w doku ukryte, toasty bez koloru rodzaju (`data-k`), efekty kinowe milczą (`calm()`); w skupieniu efekty kinowe też milczą; **≤ 640 px** = lżejszy rim (dwie linie + dolna poświata), skala tła GL ≤ 0,5 i bez cząstek GL; `forced-colors` = rim ukryty.

✅ `prefers-reduced-motion` w CSS skraca animacje do 0,01 ms. 🆕 `fx_level` = min(ustawienie, systemowe ograniczenie, samoczynne obniżenie). Budżet: efekty są projektowane tak, by `standard` mieścił się w budżecie klatki zwykłego laptopa bez GPU (animuje się wyłącznie `transform`/`opacity`, bez `box-shadow`/`filter`/`backdrop-filter` nad ruchomym tłem); przy FPS < 30 przez 5 s regulator (`main.js adapt`) obniża poziom o jeden i mówi o tym w logu (nie w powiadomieniu), a po 8 s FPS ≥ 55 przywraca poziom.

**Ekran 30 Hz (regulator, `js/gov.js`).** Klatki stałe ≥ 25 ms regulator uznaje za vsync ekranu 30 Hz dopiero po ≥ 60 s bez ani jednej szybszej klatki; wcześniej nie da się ich odróżnić od ekranu 60 Hz z ciężką sceną (dt kwantuje się do 33,3 ms). Skutek: **przez pierwsze ~60 s sesji, bez zapamiętanego dowodu, regulator może obniżyć poziom efektów (lub skalę tła) na ekranie 30 Hz**, bo widzi przeciążenie. Potem się uspokaja: dowód „wolny ekran” trafia do `sessionStorage` (`jarvis-vs`, na czas sesji karty), a po przeładowaniu pomiar nie zaczyna od zera. Dowód „szybki” (≥ 30 klatek < 25 ms) zakazuje uznania ekranu za wolny. To **świadomy kompromis „w razie wątpliwości = 60 Hz”**: lepiej na chwilę niepotrzebnie obniżyć efekty na ekranie 30 Hz niż uznać ciężką scenę 60 Hz za ekran 30 Hz i nie reagować na realne przeciążenie. Obniżenie jest widoczne (wskaźnik ECO, wpis w logu) i odwracalne po stabilnej poprawie.

### Zdarzenie → efekt (wszystko z realnych zdarzeń, nic „na niby”)

Każdy wiersz podaje emiter i odbiornik jako `plik:linia=fragment kodu`; test `tests/unit/faza5a.test.js` sprawdza, że fragment istnieje w pliku w pobliżu (±40 linii) wskazanej linii — po przesunięciu kodu zaktualizuj numery. Efekt informacyjny bez zdarzenia w tej tabeli jest błędem. Poziom = najniższy `fx_level`, od którego efekt działa; wszystkie efekty kinowe (aberracja, skan, błysk paska, iskry, hologram i „duch” okna, komety, segmentowy pierścień planu) dodatkowo milczą w trybie prezentacji ORAZ skupienia — jedna bramka `J.fxd.calm()` = `present || focus` (impulsy standardu `ok`/`err`/`warn` milczą tylko w prezentacji), przy `prefers-reduced-motion` (poziom `off`) i dla powtórek (`replay`); najdłuższy z nich trwa < 1 s (`J.fxd.life`).

| zdarzenie | emiter → odbiór (`plik:linia=fragment kodu`) | efekt | poziom |
|---|---|---|---|
| zmiana trybu agenta | `js/events.js:141=J.emit('mode', {` · `js/fx-director.js:142=J.on('mode', applyMode)` | `#app[data-mode]`, kolor `--glow-state` = kolor stanu (paleta w `events.js rgb()`: THINKING akcent2, LISTENING biały-cyjan, VERIFYING fiolet, APPROVAL bursztyn, PAUSED ciemny bursztyn, RECOVERING pomarańcz, COMPLETED zieleń 2,6 s, ERROR czerwień 3,5 s) → kolor LED rim, obramowań i Orba | off+ |
| aktywność silnika (`engine.activity`, próbkowana co 100 ms) | `js/fx-director.js:97=D.tick = () =>` · `js/bg-gl.js:196=B.gridSpeed(act, rk)` | `--activity` 0–1 (kwantyzacja 0,05) → jasność LED rim (standard+; off/tool: stała) oraz prędkość siatki-podłogi (w spoczynku prawie stoi, `gridSpeed`: dryf .04 + aktywność ponad .1) | standard+ |
| `task.completed` / `task.failed` / `tool.failed` / `approval.requested` | `js/fx-director.js:150=J.ev.on('approval.requested', () => pulse('warn'))` | jednorazowy impuls krawędzi < 1 s: zielony / czerwony / czerwony / bursztynowy; wraz z nim fala po siatce GL (`pulseAt`) | standard+ |
| `tool.started` (najwyżej raz na 150 ms) | `js/ai.js:233=J.ev.emit('tool.started', { tool: name, args: input })` · `js/fx-director.js:138=J.ev.on('tool.started', e => { const t = Date.now()` | dźwięk `tick` i segment paska LED pod dokiem (`ledSync`: zakończone / nieudane / w toku z `engine.tools*`) | standard+ (off/tool: statycznie) |
| `tool.started` / `tool.completed` / `tool.failed` / `model.started` / `model.completed` / `model.failed` (pakiet w reduktorze) | `js/events.js:151=const packet = (id, dir, src, bad)` · `js/main.js:507=const cin = J.fx.rank() >= 3 && !J.fxd?.calm?.();` | pakiet na linii obwodu: w cinema kometa (głowa + 6-punktowy ogon w tonie karty, czerwona przy porażce) z mini-rozbłyskiem po dojściu do karty; niżej pojedyncza kropka | cinema |
| `tool.started` → karta prowadząca HUD | `js/hud.js:216=const markLead = () =>` | obramowanie energii (`.lead`, `conic-gradient` + `transform:rotate`) na jednej karcie, do której trafił ostatni pakiet | standard+ |
| `task.completed` (zadanie z ≥ 1 narzędziem dla skanu) | `js/ai.js:616=J.ev.emit(status === 'ok' ? 'task.completed'` · `js/fx-director.js:173=burst('tb', 2)` | błysk zielonej linii topbara 700 ms (`.fx-tb`); w cinema zielona linia skanu przecina ekran 600 ms (`.fx-scan`, jedna warstwa `#app:before`) | standard+ / cinema |
| realna porażka: `task.failed` bez degradacji (`ai.js` catch, `bridge.js`), `tool.failed`, `model.failed`, `security.injection` | `js/ai.js:420=J.ev.emit('model.failed'` · `js/ai.js:348=J.ev.emit('security.injection'` · `js/fx-director.js:68=D.ca = () =>` · `js/bg-gl.js:199=ce < 200` | aberracja chromatyczna 200 ms: shader (osobny przebieg z FBO, `uK` od `caAt`) albo `.fx-ca` (drgnięcie Orba i marki paska, transform); NIE przy degradacji do trybu lokalnego („⚠ Hermes offline” kończy się `task.completed` z `degraded`) | cinema |
| `approval.requested { question, timeout_ms, risk }` | `js/main.js:1065=J.ev.emit('approval.requested', { question, timeout_ms: ms, risk: !!o.risk })` · `js/fx-director.js:163=D.ringMount = chip =>` | pasy ostrzegawcze (bursztyn) na krawędzi chipa (w cinema przesuwane transformem), oddychający rim, pierścień 24 segmentów gasnący do realnego limitu `timeout_ms`; impuls bursztynowy ekranu | standard+ (pasy w ruchu: cinema); pasy ostrzegawcze i bursztyn tylko przy zgodzie na ryzykowne działanie (`risk`), zwykłe pytania w kolorze akcentu |
| `J.emit('hermes')` (status `down`) lub `online`/`offline` przeglądarki | `js/ai.js:38=J.emit('hermes')` · `js/fx-director.js:94=addEventListener('offline', nlSync)` | NO LINK (Hermes „down” dopiero po 15 s ciągłej awarii; brak sieci od razu): cienka bursztynowa linia pod paskiem, mała etykieta i miganie diody sieci — bez przyciemniania sceny i okien |
| `plan.created` (tylko ścieżka Hermesa) / `plan.step` | `js/ai.js:402=J.ev.emit('plan.created'` · `js/process.js:247=J.ev.emit('plan.step'` · `js/main.js:379=J.planSegs(eg.plan)` | segmentowy pierścień wokół Orba: N segmentów = kroki planu, ukończone świecą, bieżący pulsuje; bez planu brak pierścienia | cinema |
| strumień znaków modelu `engine.feed` | `js/ai.js:409=J.engine.feed(acc.length - lastLen)` · `js/main.js:279=eg.rain > 0 ? Math.ceil(RAIN.length * eg.rain) : 0` | fala w karcie Model AI i „deszcz danych” w wiązce Orba (liczba i tempo kropli ∝ `engine.rain`; bez strumienia wiązka pusta) | off+ (karta) / wszystkie poziomy |
| `J.emit('hermes')` (`js/ai.js:38`), `J.emit('bridge')` | `js/ai.js:38=J.emit('hermes')` · `js/bridge.js:16=J.emit('bridge')` · `js/dash.js:42=J.on('hermes', syncAi)` | dioda Hermesa: kolor wg stanu (up/down/local/unknown) i rozbłysk przy zmianie stanu | off+ |
| `J.emit('judge')` | `js/judge.js:40=J.emit('judge')` · `js/dash.js:46=J.on('judge', syncJev)` | dioda Jeva: kolor i rozbłysk przy zmianie stanu | off+ |
| `J.fps` (pomiar co 1 s) | `js/main.js:198=J.fps = Math.round(frames * 1000 / (now - last))` | kropka FPS: zielona ≥ 55, bursztynowa 30–54, czerwona < 30 (progi regulatora) | off+ |
| `SpeechSynthesisUtterance.onboundary` | `js/core.js:298=u.onboundary = () =>` | amplituda Orba: impuls na granicę słowa, opadający; bez zdarzeń boundary — stała spokojna wartość (nie losowa) | off+ |
| `J.emit('signal')` `task.due` / `task.overdue` | `js/context.js:47=J.emit('signal', sig)` · `js/fx-director.js:128=const taskDiode =` | bursztynowa dioda zadania w doku (gaśnie po sfokusowaniu Harmonogramu) | off+ |
| `market-alert` | `js/apps.js:708=sub(ctx, 'market-alert'` | puls karty monety (klasa na ~1,6 s) | off+ |
| otwarcie okna (`J.wm.open`) / polecenie agenta z `ui.highlight` | `js/core.js:643=J.fx?.ghost?.(id)` · `js/registry.js:274=J.emit('agent-ui'` · `js/main.js:123=ghost(id) {` | hologramowe otwarcie okna ~400 ms (`.window.holo`: skan od góry `clip-path`, szum RGB ~120 ms, błysk górnej krawędzi; jeden element, tylko transform/opacity/clip-path), „duch” zarysu okna 900 ms przy każdym otwarciu (powtórka z `agent-ui` w < 0,9 s pomijana, bez ducha przy przywracaniu układu przed bootem) | cinema |
| zamknięcie okna (`J.wm.close`) | `js/core.js:656=w.el.classList.add('closing')` · `js/core.js:657=J.fx?.rank?.() >= 3 ? 300 : 220` | okno zwija się do linii (`winHoloOut` 280 ms) i dopiero potem znika z DOM | cinema |
| nasłuch mikrofonu: `J.orb.set('listening')` + realny `J.ear.analyser` | `js/core.js:340=api.analyser = an` · `js/fx-cinema.js:28=C.eqWanted = i =>` | equalizer: jeden canvas 640×24 nad dokiem (`#eqBars`), 32 słupki z `getByteFrequencyData` przy 24 Hz, gasną po 1 s ciszy, element usuwany po nasłuchu; bez analysera nie powstaje | cinema |
| ruch kursora (`pointermove`) | `js/fx-cinema.js:49=addEventListener('pointermove'` · `js/main.js:210=J.cin?.frame(now)` | paralaksa: Orb (≤ 5 px), sieć `#fx` oraz — w shaderze tła — niebo/miasto/mgła (karty HUD nie jadą: pomiar A/B −45 % FPS w rastrze programowym); właściwość `translate`, jedna aktualizacja na klatkę, po ~0,4 s bezruchu powrót do zera (rekty kart w spoczynku bez zmian); nie na dotyku, w skupieniu i prezentacji | cinema |
| kursor nad kartą HUD (`pointerover`) | `js/fx-cinema.js:55=addEventListener('pointerover'` · `js/fx-cinema.js:124=C.frame = now =>` | tilt karty ≤ 3° (`rotate` wokół osi w płaszczyźnie karty, perspektywa na `#hud` tylko na czas ruchu); spoczynek `rotate: none` | cinema |
| `tool.started` / `task.completed` | `js/ai.js:233=J.ev.emit('tool.started'` · `js/fx-director.js:71=D.spark = k =>` · `js/bg-gl.js:245=sparkAt` | iskry GL z Orba: fx-director ustawia tylko czas i siłę (`uAge`/`uK`), wektory liczy vertex shader, życie 900 ms, najwyżej raz na 250 ms | cinema |
| strumień znaków modelu `engine.feed` | `js/ai.js:409=J.engine.feed(acc.length - lastLen)` · `js/bg-gl.js:248=gl.uniform1f(pu.uRain` | deszcz danych GL: widoczna część z 6 tys. punktów ∝ `engine.rain` (bez strumienia 0); pył atmosferyczny zawsze w minimalnej ilości, rośnie z aktywnością | cinema |
| przeciążenie klatki (czas GPU / `dt` w `J.gov.frame`) | `js/main.js:202=J.gov.frame(now, now - prevT)` · `js/gov.js:69=h.shed?.()` | regulator najpierw zmniejsza liczbę cząstek (100 → 50 → 25 → 0 %), dopiero potem skalę rozdzielczości i poziom efektów; wraca w odwrotnej kolejności z histerezą | cinema |
| zmiana poziomu efektów — `J.emit('fx')` | `js/main.js:114=J.emit('fx', lv)` · `js/fx-director.js:145=J.on('fx', () =>` | przy `off`/`tool` wygaszenie impulsów i `--activity` = 0, LED rim statyczny; poniżej cinema kasowane efekty kinowe (aberracja, skan, błysk paska) | off+ |

## 8. Dźwięki

✅ `J.sfx`: open, close, snap, click, notify, error, ask, confirm, tick… (syntezowane, bez plików), przełącznik `sound`.
🆕 W5: głośność (0–100 %), dźwięki per rodzaj powiadomienia (kanały), wyciszenie w ciszy nocnej i trybie `present`.

🆕 Faza 4 (neon): dźwięki stanu grają z jednego miejsca — `js/fx-director.js` słucha zdarzeń silnika (nie ma ich już rozsianych po `ai.js`), a wyciszenie (przełącznik `sound`, cisza nocna, `present`) i głośność zostają w `J.sfx`. Powtórka (`replay`) i przerwanie zadania milczą. Każdy dźwięk ma odpowiednik wizualny w tym samym zdarzeniu (praca bez dźwięku, §9):

| zdarzenie | dźwięk (`J.sfx`) | odpowiednik wizualny |
|---|---|---|
| `tool.started` (najwyżej raz na 150 ms) | `tick` | segment paska LED pod dokiem, pierścień energii na karcie prowadzącej |
| `task.completed` | `success` („gotowe”) | zielony impuls ekranu, kolor stanu COMPLETED, karta „Zakończenie” |
| `task.failed` | `error` („błąd”) | czerwony impuls, kolor ERROR, czerwony segment paska LED |
| pytanie o zgodę (`J.ask`, przy `approval.requested`) | `ask` | oddychający bursztyn: rim ekranu, karta „Zakończenie” (ask), chip pytania |
| `timer-ended` / powiadomienia | `signal` / `notify` | dymek z krawędzią LED wg rodzaju, dioda w centrum powiadomień, dioda zadania w doku |

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
