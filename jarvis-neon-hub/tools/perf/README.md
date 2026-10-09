# tools/perf — pomiar płynności i siatka bezpieczeństwa wyglądu

Narzędzia do mierzenia Jarvis OS (HUD w przeglądarce) i pilnowania, że zmiany CSS/JS nie psują wyglądu ani wydajności.
Bez nowych zależności npm: używają Playwrighta i Chromium, które już masz (patrz „Konfiguracja”).

## Konfiguracja (zmienne środowiska)

| zmienna | znaczenie |
|---|---|
| `JARVIS_URL` | adres działającej aplikacji, np. `http://localhost:8080` (bez `/index.html`) |
| `PLAYWRIGHT_MODULE` | katalog modułu playwright, np. `/opt/node-tools/node_modules/playwright` (domyślnie `require('playwright')`) |
| `CHROMIUM_PATH` | ścieżka do chrome/chromium (domyślnie przeglądarka Playwrighta) |
| `FONTS_DIR` | opcjonalnie: katalog z `local.css` i plikami woff2 podstawianymi za Google Fonts (pomiar offline) |
| `PERF_SOFTWARE_GL=0` | nie wymuszaj programowego GL (SwiftShader) — na laptopie z GPU ustaw 0 |
| `PERF_LOCK` | ścieżka pliku blokady: `ab.js` uruchamia każdy pomiar pod `flock` (jedna sesja pomiarowa naraz) |

Serwer: dowolny statyczny, np. `python3 -m http.server 8080 --bind 127.0.0.1` w katalogu repo.
Sieć zewnętrzna jest w trakcie pomiarów blokowana (powtarzalność, brak timeoutów); aplikacja startuje z ziarnem
localStorage omijającym boot i onboarding (jak `tests/e2e/smoke.js`).

## Narzędzia

- `lib.js` — wspólna biblioteka: `open` (sesja bez bootu), `forceFx` (wymuszony poziom efektów `off|tool|standard|cinema`
  i wyłączony samoczynny regulator), sceny `idle|hud|work|drag`, stany do zrzutów, metryki (CDP: czas zajętości wątku głównego,
  skrypt/layout/style, liczba layoutów na klatkę; rozkład czasu klatki p50/p95 z pętli rAF; CPU procesów), lista animacji
  (`document.getAnimations()` z flagą `compositorOnly`), warstwy kompozytora (CDP LayerTree: liczba, pełnoekranowe, powierzchnia)
  i opcjonalna instrumentacja **wymuszonych layoutów** (`instr`).
- `measure.js` — jeden pomiar sceny → JSON (`node tools/perf/measure.js --scene work --fx cinema --ms 5000`).
- `loopcost.js` — JS na klatkę pętli rysującej (suma callbacków rAF: mediana/średnia/p95) i alokacje (HeapProfiler sampling, KB/klatkę i KB/s) dla sceny `idle|hud|work`; do porównań A/B kosztu `main.js`/`hud.js`.
- `ab.js` — A/B dwóch adresów: baza vs obecny, przeplatane A,B,A,B…, mediana z ≥3 powtórzeń → `metrics.json` + `metrics.md`.
- `shots.js` — macierz zrzutów stanów (idle, LISTENING, THINKING, EXECUTING+HUD, APPROVAL, ERROR, COMPLETED, 4 okna, czat, Process Log,
  paleta Ctrl+K, tryb skupienia; akcenty; tapety; poziomy efektów) w dwóch rozdzielczościach, nazwy stabilne.
- `vdiff.js` — różnica obrazu dwóch katalogów PNG (liczona na canvasie w przeglądarce) + opcjonalne mapy różnic.
- `contrast.js` — pikselowy kontrast WCAG tekstu (`--text`, `--muted`, `--dim`, `.hc-sub`, `.deck`) na prawdziwym tle scen
  photo/aurora/void/neon (bramka `npm run perf:contrast-gate`; sesje startują z `?glcaveat=0`, żeby tło WebGL tapety neon działało też na SwiftShaderze).
- `tests/e2e/smoke.js` i `tests/e2e/gl.js` (korzystają z `lib.js`) — e2e pulpitu i tła WebGL.
- Nakładka `?perf=1` w samej aplikacji (`js/perf.js`): p50/p95 czasu klatki i long tasks na żywo, bez żadnych skutków bez parametru.

## Jak zrobić pomiar na własnym laptopie (z GPU)

```bash
python3 -m http.server 8080 --bind 127.0.0.1 &           # w katalogu repo
export JARVIS_URL=http://localhost:8080 PERF_SOFTWARE_GL=0
# 1) na żywo: otwórz http://localhost:8080/?perf=1 — w rogu p50/p95 klatki
# 2) skryptowo (potrzebny Playwright: npm i -D playwright && npx playwright install chromium):
node tools/perf/ab.js --a http://localhost:8080 --reps 3 --out perf-out      # sam „A” (baseline)
# A/B: druga kopia repo (np. git worktree add /tmp/baza <commit>) na innym porcie
node tools/perf/ab.js --a http://localhost:8090 --b http://localhost:8080 --reps 5 --instr --out perf-ab
npm run perf:shots -- --out shots-now ; node tools/perf/vdiff.js shots-baza shots-now --diff-dir diff
npm run perf:contrast
```

Wskazówki: zamknij inne programy, podłącz zasilanie, ustaw to samo okno i DPI; porównuj tylko pomiary z jednej sesji.
W kontenerze bez GPU (SwiftShader) bezwzględne FPS są zaniżone o rzędy wielkości — liczą się proporcje A/B,
liczby warstw/animacji, layouty na klatkę i czasy CPU.

## Bramki (co musi być zielone przed zatwierdzeniem zmiany wyglądu lub wydajności)

| bramka | komenda | próg |
|---|---|---|
| testy jednostkowe (w tym lint CSS, kontrakt selektorów, hash powłoki) | `npm test` | wszystko zielone |
| kontrast tekstu na prawdziwym tle scen | `npm run perf:contrast-gate` | każda próbka ≥ 4,5:1 (stany idle/thinking/executing/error/completed × tapety photo/aurora/void/neon) |
| e2e pulpitu | `npm run test:e2e` (przeglądarka, serwer na :8090) | zielone: m.in. brak nachodzenia HUD na pasek/dok, `fx off` bez ruchu |
| e2e tła WebGL | `npm run test:e2e:gl` | zielone w obu trybach przeglądarki |
| A/B wydajności względem bazy | `node tools/perf/ab.js --a <baza> --b <zmiana> --reps 3 --instr` | warstwy w idle nie więcej niż dziś (31–33 przy 56–58 w bazie); 0 animacji nie-kompozytorowych; 0 wymuszonych layoutów w rAF; brak regresji kosztu CPU/klatkę |

Parametry testowe w adresie (tylko pomiary i e2e): `?perf=1` nakładka, `?gov=0` wyłącza regulator klatki, `?glcaveat=0` pozwala na tło WebGL w rastrze programowym (SwiftShader).

## Wyniki bazowe (commit ddd992a, przed przebudową)

Środowisko: kontener 4 CPU bez GPU (SwiftShader), 1600×900, `cinema`, mediana z 3. Bezwzględne FPS (0,3–1,2) nic nie znaczą — proces GPU zużywał ~3,4 rdzenia w każdej scenie.

| scena | warstwy (pełnoekranowe) | animacje (nie-kompozytorowe) | layouty / klatkę | wymuszone layouty w rAF |
|---|---|---|---|---|
| idle | 56 (13) | 9 (1) | 4,6 | 9 |
| hud | 74 (15) | 17 (1) | 5,5 | 6 |
| work | 83 (13) | 17 (1) | 12,5 | 4 |
| drag | 65 (13) | 10 (2) | 7,8 | 4 |

Pełne tabele i pozostałe metryki: raport bazowy w katalogu pracy analizy (`metrics.md`). Wyniki po przebudowie i porównanie A/B: patrz commity „Faza 1–6” i opis w [docs/adr/0008-wyglad-neon-holo-glass.md](../../docs/adr/0008-wyglad-neon-holo-glass.md).

## Siatka bezpieczeństwa w testach jednostkowych

- `tests/unit/css-lint.test.js` + `tools/css-lint.js` — „zapadka” zakazanych animacji (box-shadow, filter, background-position,
  top/left/width/…, `@property`, skrót `transition:<czas>` bez właściwości). Porównanie z `tests/fixtures/css-anim-allowlist.json`:
  pada przy nowym naruszeniu **i** gdy wpis z listy już nie jest naruszeniem (lista ma tylko malić).
- `tests/unit/contract-selectors.test.js` — ID/klasy z asercji `tests/e2e/smoke.js` nadal istnieją w `index.html`/`js/*.js`.
- `tests/unit/perf-overlay.test.js` — `js/perf.js` jest bierny bez `?perf=1`.
