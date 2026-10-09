# Wygląd „Neon Holo-Glass” — przewodnik

Jak jest zbudowany neonowy pulpit Jarvis OS, jak dodać do niego efekt i jak sprawdzić, że nie kosztuje płynności.
Kontrakt (poziomy efektów, tabela zdarzeń) jest w [specyfikacji 09](../spec/09-wyglad-stany.md), decyzja w [ADR 0008](../adr/0008-wyglad-neon-holo-glass.md),
narzędzia pomiarowe w [tools/perf](../../tools/perf/README.md).

## 1. Zasady

1. **Nic „na niby”.** Dekoracja (tło, mgła, ziarno, siatka) jest dozwolona. Efekt, który coś *komunikuje*, ma realne zdarzenie
   (`J.emit`, `J.ev.emit`, API przeglądarki) wpisane do tabeli „zdarzenie → efekt” w [09 §7](../spec/09-wyglad-stany.md) i test, który to sprawdza.
2. **Rusza się tylko `transform` i `opacity`** na własnej warstwie. Zakaz animowania `box-shadow`, `filter`, `background-position`,
   `top/left/width/height` i `@property` w nowym kodzie — egzekwuje to `tests/unit/css-lint.test.js` (zapadka z allow-listą, która może tylko malić).
3. **`will-change` tylko na tym, co właśnie się animuje**, zdejmowany po zakończeniu; nigdy na pełnoekranowych warstwach.
4. **Nad animowanym tłem nie ma `backdrop-filter` ani `filter`** (wyjątek: pasek górny i dok). Szkło jest „fałszywe”: tło okien i paneli ma
   nieprzezroczystość ≥ .96 (test statyczny `css-static.test.js`).
5. **Brak odczytów layoutu w pętli rAF** i po zapisie do DOM w tej samej klatce.

## 2. Paleta i tokeny

Bazy: `#020a14` / `#061428`. Neon cyjan `#4df3ff`, magenta `#ff2bd6` **tylko w motywie „neon”** (shader i CSS czytają `accent`/`accent2` z ustawień,
nie ma zakodowanej magenty — wygląd działa też w motywach złotym, czerwonym, zielonym). Lód `#e8fbff`, thinking fiolet `#a25cff`,
ostrzeżenie `#ffb020`, błąd `#ff3b5c`, ok `#3dffa0`. Kontrast tokenów na tle ≥ 4,5:1 (`npm run perf:contrast-gate`).

### Stan agenta = kolor światła na całym ekranie

`js/fx-director.js` słucha `J.emit('mode')` (z `setMode` w `js/events.js`) i ustawia na `#app`: `data-mode`, `data-working` i zmienną `--glow-state` (trójka `r,g,b`).
Paleta pochodzi z `events.js rgb()` — jedno źródło prawdy, dyrektor nie dubluje wygasania stanów (COMPLETED 2,6 s, ERROR 3,5 s).

| tryb silnika | światło | uwagi |
|---|---|---|
| IDLE | cyjan | spokój |
| LISTENING | biało-cyjan | pierścień fali z realnego `ear`, equalizer (cinema) |
| THINKING | fiolet | |
| EXECUTING | cyjan + biały rdzeń | pakiety/komety na liniach HUD |
| VERIFYING | jaśniejszy fiolet | |
| APPROVAL_REQUIRED | bursztyn, oddycha | jedyny stan wymagający uwagi użytkownika |
| PAUSED | ciemny bursztyn | bez oddechu |
| RECOVERING | pomarańcz, miga wolno | |
| ERROR | czerwień | 2 pulsy; aberracja chromatyczna (cinema) tylko przy realnej porażce |
| COMPLETED | zieleń | skan przez ekran (cinema) |
| STANDBY | przygaszony cyjan | czuwanie na słowo „Jarvis” |

Stany × motywy: w każdym z 9 motywów odcienie stanów są rozsunięte (test `state-palette.test.js`: THINKING co najmniej 60° od ERROR),
a kolor stanu **nie** zależy od akcentu — akcent (`--accent`, `--accent2`) maluje kontrolki, stan (`--glow-state`) maluje LED rim, krawędzie okien, dok, siatkę.

### Tokeny (css/neon.css, `:root` w css/jarvis.css)

| token | znaczenie |
|---|---|
| `--glow-state` | `r,g,b` koloru stanu (używaj jako `rgba(var(--glow-state), .6)`) |
| `--activity` | 0–1, aktywność silnika próbkowana co 100 ms, kwantyzacja .05, zapis ≤ 10 Hz; steruje jasnością LED rim (przez `opacity`) i prędkością siatki |
| `--neon-text`, `--neon-box`, `--neon-state`, `--neon-line`, `--neon-led`, `--neon-brk` | gotowe, **statyczne** warstwy poświaty (≤ 3 cienie), nawiasy narożne |
| `--accent-rgb`, `--accent2-rgb` | akcenty motywu |

`css/neon.css` obowiązuje tylko przy tapecie `neon` (`#app[data-wall=neon]`) — klasyczny wygląd nie dostaje żadnej z jego reguł.

## 3. Macierz poziomów efektów

`fx_level` w Ustawieniach → Wygląd → Efekty: `off`, `tool`, `standard` (domyślnie), `cinema`. Efektywny poziom = min(ustawienie, systemowe ograniczenie ruchu,
samoczynne obniżenie przez regulator). Pełna tabela: [09 §7](../spec/09-wyglad-stany.md).

| | off | tool | standard | cinema |
|---|:-:|:-:|:-:|:-:|
| kolor stanu na LED rim, obramowaniach, diodach | tak | tak | tak | tak |
| ruch (`.window`: `transition-duration` od `0s`, `animation-name: none`) | brak | ≤ 150 ms | 220–450 ms | do 700 ms |
| LED rim reaktywny (`--activity`), impulsy zdarzeń, rozbłyski diod | — | — | tak | tak |
| obramowania energii, pasek LED pod dokiem, cyfry LED z migającym dwukropkiem | statycznie | statycznie | tak | tak |
| tło WebGL | jedna klatka | jedna klatka | ruch wolny | pełny |
| komety, aberracja, skan, hologram i „duch” okna, equalizer, paralaksa Orba i tła, tilt kart, cząstki GL | — | — | — | tak |

Tryby: **skupienie** (`#app.focus`) — biały rim, przygaszone tło, efekty kinowe milczą; **prezentacja** (`#app.present`) — bez impulsów, diody zadania i koloru toastów;
**≤ 640 px** — lżejszy rim, skala tła ≤ 0,5, bez cząstek; **`forced-colors` / `prefers-contrast`** — bez neonu (rim ukryty, tło statyczne);
**`prefers-reduced-motion`** — poziom `off`.

### Regulator (`js/gov.js`) i wskaźnik ECO

Regulator mierzy czas GPU (`EXT_disjoint_timer_query_webgl2`) albo p85 odstępów klatek względem zmierzonego vsync (30/48/60/120 Hz).
Przy przeciążeniu zmniejsza kolejno: liczbę cząstek (100 → 50 → 25 → 0 %), skalę rozdzielczości tła (1 → .42), dopiero na końcu poziom efektów.
Po obniżeniu blokuje wzrost na ≥ 60 s (histereza). Gdy poziom jest realnie niższy niż wybrany, w pasku świeci dioda **ECO** z podpowiedzią.
Parametry testowe: `?gov=0` wyłącza regulator, `?glcaveat=0` pozwala na tło WebGL w rastrze programowym (SwiftShader) — tylko do testów i pomiarów.

## 4. Tabela zdarzenie → efekt

Źródłem jest [09 §7](../spec/09-wyglad-stany.md#zdarzenie--efekt-wszystko-z-realnych-zdarzeń-nic-na-niby). Każdy wiersz: emiter i odbiornik jako `plik:linia=fragment kodu`,
poziom, efekt. `tests/unit/faza5a.test.js` sprawdza, że fragment istnieje w pliku w pobliżu wskazanej linii (±40) — po przesunięciu kodu popraw numery.

Skrót: zmiana trybu → kolor stanu · `engine.activity` → jasność rim i prędkość siatki · `task.completed/failed`, `tool.failed`, `approval.requested` → impuls krawędzi ·
`tool.started` → tick, segment paska LED, karta prowadząca · pakiet w reduktorze → kometa · `task.failed` → aberracja · `approval.requested {timeout_ms}` → pasy i pierścień odliczania ·
`hermes down`/offline → NO LINK · `plan.created/step` → pierścień planu · `engine.feed` → deszcz danych · `onboundary` → amplituda Orba · `signal task.due` → dioda zadania ·
otwarcie/zamknięcie okna → hologram/duch · `ear.analyser` → equalizer · `pointermove` → paralaksa i tilt · przeciążenie klatki → regulator.

## 5. Jak dodać nowy efekt (checklista)

1. **Zdarzenie.** Znajdź realne zdarzenie (`J.emit('…')`, `J.ev.emit('…')`). Brak? Dodaj emiter w miejscu, gdzie rzecz naprawdę się dzieje — nie wołaj efektu „z góry”.
   Nowe `J.emit('…')` wymaga `node bridge/export-tools.js && node tools/gen-spec.js` (katalog zdarzeń).
2. **Bramka poziomu.** Odbiornik w `js/fx-director.js` (albo `js/fx-cinema.js` dla efektów kinowych) sprawdza `rank()`: standard = 2, cinema = 3. Efekt informacyjny w `off`/`tool` ma wersję statyczną (kolor), nie ruch.
3. **`calm()`.** Efekty kinowe wołają się przez wspólną bramkę `J.fxd.calm()` (`present || focus`); impulsy standardu milczą tylko w prezentacji.
   Powtórki (`replay`) i `prefers-reduced-motion` też milczą. Czas życia wpisz do `D.life` (< 1 s).
4. **CSS.** Tylko `transform`/`opacity`, jeden element, `will-change` na czas efektu. Uruchom lint: `node --test tests/unit/css-lint.test.js tests/unit/css-static.test.js`.
   Dodaj wariant dla `#app[data-fx=off] *`, `forced-colors` i `present`.
5. **Test emit → efekt.** W `tests/unit/` napisz test: emituj zdarzenie na atrapie, sprawdź klasę/atrybut/uniform; osobno poziom poniżej bramki (brak efektu) i `calm()` (brak efektu).
6. **Tabela w spec 09 §7.** Dopisz wiersz `emiter · odbiornik` z numerami linii (test `faza5a.test.js` to sprawdza; próg liczby wierszy w teście zwiększ, jeśli dodajesz).
7. **Powłoka offline.** Nowy plik → `<script defer>` w `index.html`, wpis w `SHELL` w `sw.js`, w `tests/harness.js` (jeśli ładowany w testach). Zmiana pliku z `SHELL` → podbij `CACHE` (`jarvis-os-vNN`)
   i zaktualizuj fixture: `node tools/shell-hash.js --update` (test `shell-offline.test.js` pilnuje).
8. **Pomiar.** A/B względem bazy: `npm run perf:ab` (sekcja 6) — liczba warstw, animacje nie-kompozytorowe, layouty na klatkę, koszt CPU.

## 6. Jak mierzyć wydajność

- **Na żywo:** otwórz `http://localhost:8080/?perf=1` — w rogu p50/p95 czasu klatki i long tasks (bez parametru moduł jest bierny).
- **Skryptowo:** `node tools/perf/ab.js --a <adres bazy> --b <adres zmiany> --reps 5 --instr` (mediana, przeplatane przebiegi), `npm run perf:shots` + `npm run perf:vdiff`
  do różnic obrazu, `npm run perf:contrast-gate` do bramki kontrastu. Szczegóły i zmienne środowiska: [tools/perf/README.md](../../tools/perf/README.md).
- **Cel na laptopie z GPU:** p95 klatki ≤ 16,7 ms w `standard` (1080p), średnio ≥ 55 FPS w `cinema`, regulator nie schodzi poniżej `standard`.
  W kontenerze bez GPU (SwiftShader) liczą się proporcje A/B, liczby warstw/animacji i layouty, nie bezwzględne FPS.

## 7. Powrót do klasycznego wyglądu

Klasyczny wygląd (zdjęcie jeziora, niebieski motyw) to zwykłe ustawienia, niezależne od poziomu efektów:

- Ustawienia → Wygląd → **Tapeta: Jezioro** i **Kolor akcentu: jarvis** (albo polecenia „ustaw tapetę jezioro”, „ustaw motyw jarvis”, narzędzia `set_wallpaper` / `set_theme`).
- Istniejący użytkownicy nie są przełączani: migracja ustawień v3→v4 (`js/core.js`) zostawia im dotychczasową tapetę `photo` i motyw `jarvis`. Nowa instalacja dostaje `neon`.
- Mniej ruchu bez zmiany wyglądu: poziom efektów `tool` albo `off`. Bez WebGL (brak obsługi, renderer programowy, utrata kontekstu) tło neon spada samo do statycznego gradientu CSS.
