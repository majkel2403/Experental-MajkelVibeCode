# Agentspace — Hermes · Neural Workflow

Przebieg pracy Hermesa i jego agentów pokazany tak, jak [Gource](https://github.com/acaudwell/Gource) pokazuje historię
repozytorium: **drzewo to przestrzeń robocza** (pliki repo, strony WWW, pamięć, wywołania MCP, testy, wyniki), a **Hermes i
agenci to awatary**, które podlatują do tego, co czytają lub zmieniają, i strzelają w to promieniami.
Zasada: **zero fałszywej animacji** — każdy plik, promień i błysk pochodzi z prawdziwego zdarzenia w logu przebiegu;
ruch układu to fizyka Gource (gałęzie odpychają się, pliki układają w pierścienie), a nie dekoracja.

Renderer jest napisany od zera (JS + WebGL, bez bibliotek) według zachowania Gource 0.54: drzewo katalogów, które rozgałęzia
się tylko tam, gdzie ścieżki się rozchodzą; pliki w pierścieniach (6, 9, 12 … na pierścień) kolorowane hashem rozszerzenia;
krawędzie jako krzywe z opóźnionym punktem kontrolnym; poświata (bloom) wokół katalogów; awatary z siłami przyciągania do plików;
promienie akcji; kamera, która sama obejmuje całe drzewo; klucz rozszerzeń i data jak w Gource. Kod Gource nie jest
kopiowany ani dołączany — prawdziwy Gource służy tylko jako wzorzec do porównania (`tools/compare-gource.mjs`).

| Promień | Znaczenie |
| --- | --- |
| zielony | utworzenie pliku (jak w Gource) |
| pomarańczowy | zmiana pliku (jak w Gource) |
| czerwony | usunięcie (jak w Gource) |
| niebieski | odczyt (dodatek: agenci dużo czytają) |
| jasnozielony / czerwony błysk | test zaliczony / nieudany |
| cienki promień między awatarami | wiadomość między agentami (kolor = ton) |

Pod awatarem widać narzędzie, którego agent właśnie używa (np. `edit`, `terminal`).

### Studio: co robi zespół

Nad sceną działa warstwa „studia” (`packages/core/gource/story.js` + `cards.js`), liczona wyłącznie z logu, więc
przewija się dokładnie tak jak scena:

- **tablica zespołu** — Hermes i drzewko agentów, które powołał (kto kogo stworzył, np. Coder → Tester), rola,
  bieżące zadanie i status (pracuje · narzędzie / czeka / gotowe / błąd), nad nią zlecenie, pod nią **plan** z
  odhaczanymi krokami;
- **powołanie agenta** — złota nić od twórcy, pierścień i podpis „NOWY AGENT” z rolą; awatar pojawia się obok twórcy;
- **rozmowy i przydział zadań** — dymki z wpisywanym tekstem (myśli Hermesa przerywaną ramką), paczka lecąca od
  nadawcy do odbiorcy, przy przydziale złota etykieta ZADANIE, a zadanie trafia na tablicę zespołu;
- **pisanie kodu** — okno edytora połączone linią z plikiem: kod z `content` (nowy plik) albo `patch` (diff +/−)
  jest wpisywany znak po znaku z kolorowaniem składni i numerami linii; nowy folder dostaje etykietę „+ folder”;
- **terminal** — komenda z `command` wpisywana w oknie, a wynik (`output` zdarzeń testów i narzędzia) spływa
  linia po linii, porażki na czerwono.

Tempo pisania jest dobrane do czytania, tekst jest dokładnie tym, co zapisał producent. Na szerokim ekranie studio
zajmuje prawą kolumnę, na telefonie pasek z zespołem u góry i jedno okno na dole. Kamera domyślnie **śledzi pracę**
(agenci, ich pliki i świeżo zmienione katalogi), a gdy drzewo wyrasta ze skanu albo nikt nie pracuje — pokazuje całość.
`createViewer({ studio: false })` / `{ focus: false }` wyłącza studio / śledzenie.

```
Hermes / Jarvis ──► Event Bus ──► server (Workflow Recorder) ──► Event Store (data/runs/<run>.jsonl)
                                        │
                                        └─► WebSocket /live ──► viewer (akcje → symulacja Gource → WebGL)
```

## Uruchomienie

Wymaga Node 20+.

```bash
npm install
npm start                 # http://127.0.0.1:4777  (PORT, HOST w zmiennych środowiskowych)
```

W przeglądarce: wybór przebiegu, oś czasu (0.25× / 1× / 4× / 10×, dokładne przewijanie w obie strony — symulacja ma
punkty kontrolne: co sekundę dla ostatnich 30 s, rzadziej dla starszych, więc pamięć nie rośnie bez końca), Process Log, inspektor po kliknięciu w plik lub awatar (co dokładnie robił), przeciąganie
przesuwa widok, kółko przybliża, „Wczytaj log (.jsonl)” odtwarza własny przebieg. `/?chrome=0` pokazuje samą scenę,
`/?compat=1` rysuje tylko to, co umie pokazać prawdziwy Gource (do porównań).

Przebieg na żywo z zapisanego logu (symulacja producenta):

```bash
npm run demo:emit -- demo/runs/repo-fix.jsonl --speed 2 --run live-demo
```

Viewer pokaże przebieg `live-demo` z plakietką **LIVE** i będzie podążał za zdarzeniami.

## Podłączenie Hermesa / Jarvisa

Producent wysyła zdarzenia jednym z trzech kanałów — serwer zapisuje je do Event Store i rozsyła widzom:

| Kanał | Jak |
| --- | --- |
| HTTP | `POST /events` — jeden obiekt JSON, tablica albo JSONL w treści |
| WebSocket | `ws://127.0.0.1:4777/ingest` — jedno zdarzenie JSON na wiadomość |
| STDIN | `node server/server.mjs --stdin` — linie JSONL, np. `jarvis … \| node server/server.mjs --stdin` |

Odczyt: `GET /api/runs` (lista), `GET /api/runs/:run` (pełny log JSONL do REPLAY), `ws://…/live?run=<id|*>` (na żywo).

Zapis jest domyślnie otwarty, bo serwer słucha tylko na `127.0.0.1`. Przy `HOST=0.0.0.0` ustaw `INGEST_TOKEN=<sekret>`:
wtedy `POST /events` i `ws /ingest` wymagają nagłówka `Authorization: Bearer <sekret>` (albo `?token=`).
Przebieg bez `task.completed`/`task.failed`, który od 10 minut nic nie wysłał, jest na liście oznaczony jako przerwany
zamiast LIVE.

Przykład:

```bash
curl -X POST http://127.0.0.1:4777/events -H 'content-type: application/json' \
  -d '{"ts":1791280800000,"run":"r1","type":"task.started","text":"Przeanalizuj repo"}'
```

## Schemat zdarzenia

Jedna linia JSONL = jedno zdarzenie (walidacja: `packages/core/events.js`).

| Pole | Opis |
| --- | --- |
| `ts` | czas (ms od epoki lub ISO) — wymagane |
| `run` | identyfikator przebiegu — wymagane |
| `type` | typ zdarzenia (poniżej) — wymagane |
| `agent` | agent (`research`, `coder`, …); `hermes` = rdzeń |
| `tool` | narzędzie (`web_search`, `edit`, `terminal`, …) |
| `resource` | ścieżka / URL / klucz zasobu |
| `to` | odbiorca wiadomości (`message.sent`) |
| `parent` | agent-rodzic (`agent.spawned`) |
| `name` | nazwa testu / bramki MCP-API |
| `text` | opis dla człowieka (log, inspektor) |
| `paths` | lista ścieżek (`workspace.scanned`, np. wynik `git ls-files`) |
| `content` | `file.created`: treść nowego pliku (wpisywana w edytorze studia) |
| `patch`, `line` | `file.modified`: zmienione linie w stylu unified diff (`+` dodane, `-` usunięte, ` ` kontekst) i numer pierwszej linii |
| `command` | `tool.started`: komenda wpisana w terminalu (np. `npm test`) |
| `output` | `tool.completed` / `tool.failed` / `test.*`: linie wypisane w tym terminalu |
| `tone`, `task` | `message.sent`: ton (`assign`, `question`, `answer`, `handoff`, `critique`, `revision`, `approve`, `result`) i krótki tytuł zadania przy `assign` |
| `steps`, `step` | `planner.step`: plan jako lista kroków; dowolne zdarzenie: numer bieżącego kroku (od 0) |
| `latencyMs`, `tokens`, `confidence` | metryki (inspektor) |

Typy: `task.started|completed|failed`, `hermes.reasoning`, `planner.step`,
`agent.spawned|waiting|completed|failed`, `tool.started|completed|failed`, `resource.read|written`,
`file.read|created|modified|deleted`, `memory.read|write`, `gateway.call`, `test.started|passed|failed`,
`message.sent`, `result.returned`, `error`, `workspace.scanned`.

Jak zdarzenia stają się drzewem: zasób bez schematu → `<przestrzeń>/<ścieżka>` (nazwa przestrzeni z ostatniego
`workspace.scanned`, domyślnie `projekt`), URL → `web/<host>/…`, pamięć → `pamięć/…`, MCP → `mcp/<nazwa>/…`,
testy → `testy/<nazwa>`, zadanie → `zadanie/opis.md`, plan i rozumowanie Hermesa → `hermes/…`, zespół → `zespol/<agent>.md`,
wynik → `wynik/raport.md`. `workspace.scanned` pokazuje całe prawdziwe drzewo repozytorium przez jedno zdarzenie:
pliki z listingu nie dostają promienia każdy z osobna, tylko wyrastają stopniowo z kolejki (20–90 plików/s, gałąź po
gałęzi, mały zestaw rośnie najwyżej ~60%/s), a agent skanujący przelatuje przez drzewo z jednym promieniem co 0,35 s.

Ruch i kadr (odstępstwa od Gource dla czytelności): kamera obejmuje drzewo i pracujące awatary, wyprzedza wzrost o ~1,5 s,
oddala się płynnie (≤ 30% odległości/s), przybliża dopiero gdy drzewo wyraźnie zmalało, i działa tak samo w poziomie
i w pionie (telefon). Promienie startują równo co 0,12–0,5 s i trwają 0,25–0,8 s; awatary mają ograniczone przyspieszenie
i tarcie, bezczynny agent blednie zamiast znikać, nowy pojawia się obok rodzica. Automatyczny obrót o 90° (jak w Gource)
najwyżej raz i nie w trakcie wzrostu; opcja `autoRotate: false` go wyłącza (artefakt).
`node tools/motion-report.mjs [przebieg]` mierzy płynność (wzrost na sekundę, zoom, skoki prędkości, salwy promieni,
kadr w poziomie i na telefonie) i kończy się błędem, gdy któreś kryterium nie jest spełnione.

## Prawdziwy Gource (wzorzec i prototyp)

Adapter zapisuje ten sam strumień akcji co viewer jako log Gource (`timestamp|user|A/M/D|ścieżka`, odczyty i testy jako M):

```bash
node adapters/to-gource.mjs demo/runs/repo-fix.jsonl > repo-fix.gource.log      # czas ×100
gource --log-format custom --seconds-per-day 864 --key repo-fix.gource.log
# na żywo:
tail -n +1 -f data/runs/<run>.jsonl | node adapters/to-gource.mjs --stream | gource --log-format custom --realtime -
```

Porównanie klatka w klatkę (wymaga `gource`, `xvfb-run`, `ffmpeg`, Playwright i `npm start`):

```bash
node tools/compare-gource.mjs repo-fix 6,12,20,30,44 /tmp/porownanie
```

Zapisuje pary obrazów (Gource po lewej, nasz renderer po prawej) i miarę SSIM rozmytych klatek.

## Struktura

- `packages/core/` — schemat zdarzeń, oś czasu, `gource/` (kolory, zdarzenia → akcje, deterministyczna symulacja,
  odtwarzacz z punktami kontrolnymi, opis klatki, WebGL + awaryjny Canvas 2D, napisy, inspektor), `render/viewer.js`.
  `manifest.json` podaje kolejność plików do budowy bez modułów (artefakt).
- `server/` — ingest (HTTP / WS / STDIN), Event Store, LIVE fan-out, REPLAY.
- `packages/ui/` — interfejs Hermes („pokład dowodzenia”) jako jeden system: `hermes.css` (tokeny, siatka, trzy układy
  `xl | m | s`), `hermes.markup.mjs` (jeden szablon), `hermes.logic.js` (jedna logika). Scena zajmuje cały ekran, a
  interfejs jest szklaną warstwą nad nią: pasek poleceń z fazami, szyna zespołu (zlecenie, agenci, plan), szuflada
  robocza (kod i terminal, rozmowy, pliki, dziennik, inspektor) i dok z narratorem („Coder zleca Tester …”) oraz osią
  czasu z torem dla każdego agenta. Tryb Auto sam przełącza szufladę na to, co dzieje się teraz. Kamera kadruje drzewo
  w wolnej komórce środkowej, więc nic go nie zasłania. Nowe zlecenie i raport to karty nad sceną.
- `web/` — podłącza ten interfejs do serwera (`app.js`: lista przebiegów, odczyt, LIVE przez WebSocket) i renderuje
  szablon (`dc-lite.js`). Te same pliki z `packages/ui` osadza `artifact/build-app.mjs` w tablicach kanwy.
- `tools/layout-check.mjs` — test układu: 6 rozmiarów okna × 5 stanów, bez nakładania paneli, bez wyjścia poza
  ekran, bez tekstu poniżej 12 px (wymaga `npm start` i Playwright).
- `demo/` — zapisane przebiegi (`runs/*.jsonl`, generowane przez `npm run demo:build`), lista plików prawdziwego
  repozytorium socket.io (`workspaces/socket.io.txt`) i emiter na żywo. `npm run demo:build -- --workspace <katalog>`
  buduje przebieg „napraw repo” na drzewie dowolnego repozytorium git (np. własnego).
- `web/fonts/` — FreeSans (GNU FreeFont, GPL z wyjątkiem dla czcionek), ta sama czcionka co w Gource.
- `test/` — `npm test` (schemat, przewijanie, układ, kadr, długie przebiegi, adapter Gource, serwer);
  `npm run motion` — pomiar płynności; `npm run check` — oba. CI (`.github/workflows/ci.yml`) uruchamia je i sprawdza,
  że `demo/runs` i tablice artefaktu są zbudowane z aktualnego kodu.
- `artifact/` — źródła kanwy Design (generator tablic, walidator, tablice, `canvas.json`); opis w `artifact/README.md`.

Przebiegi w `demo/runs` są wygenerowanymi scenariuszami, nie zapisem prawdziwego Jarvisa. W „napraw repo” drzewo plików
jest prawdziwe (socket.io), ale błąd i poprawka w historii są demonstracyjne. Po podłączeniu producenta jego przebiegi
trafiają do `data/runs/`.
