# ADR 0008 — Wygląd „Neon Holo-Glass”, tło WebGL z fallbackami i regulator klatki

**Status:** przyjęta 2026-10-06 · **Kontekst:** pulpit wyglądał dobrze w stanie aktywnym (karty HUD, Orb), ale spoczynek był „filmowym pejzażem”
bez związku ze stanem agenta, a płynność była słaba. Pomiar (6 niezależnych analiz, 141 ustaleń) pokazał, że JavaScript jest prawie bezczynny (2–3 % wątku),
a koszt siedzi w rasteryzacji i kompozycji: 57 warstw (12 pełnoekranowych), dwa pełnoekranowe canvasy odrysowywane co klatkę, 30 elementów z `filter`, 6 widocznych
`backdrop-filter` nad animowanym tłem, animacje `top`/`box-shadow`, odczyty layoutu w pętli rAF, 29 synchronicznych skryptów i ~3,1 s sztucznego czekania na starcie.
Użytkownik chciał neonowego, LED-owego, cyberpunkowego pulpitu „jak z kina” i 60 FPS.

**Decyzja:**
- **Kierunek: hybryda „Neon Holo-Glass”** = ewolucja obecnego HUD (zachowuje to, co działa; najlepsza zgodność z zasadą „nic na niby”) + neon i magenta w nowym motywie „neon”
  + siatka-podłoga zamiast kosztownego odbicia w jeziorze + cyfry LED (DSEG7, SIL OFL). Statyczny, wielowarstwowy neon (≤ 3 cienie), animuje się tylko `transform`/`opacity`.
- **Stan agenta świeci na całym ekranie.** Jedna zmienna `--glow-state` (kolor z `events.js rgb()`, wygasanie stanów zostaje w silniku) napędza LED rim, obramowania, dok i siatkę;
  `--activity` (0–1) steruje jasnością rim i prędkością siatki. Dyrektor efektów (`js/fx-director.js`) jest jedynym miejscem tłumaczącym zdarzenia na efekty.
- **Zmiana znaczenia poziomu `standard` (D-08).** Struktura kontraktu bez zmian (4 poziomy, domyślnie `standard`, `prefers-reduced-motion` → `off`), ale `standard` = *nowy, tani wygląd*
  (reaktywny rim, impulsy, diody, Orb z amplitudą z mowy), a `cinema` dodaje efekty kinowe. Klasyczny wygląd = tapeta `photo` + motyw `jarvis` i zostaje zwykłym ustawieniem.
  Spec 09 §7 i `01-decyzje.md` zaktualizowane w tym samym zakresie.
- **Tapeta `neon` jest domyślna dla nowych użytkowników; istniejący zostają przy swoim.** Migracja ustawień v3→v4 (`js/core.js`) wpisuje brakującym polom dotychczasowe wartości
  (`wall: 'photo'`, akcent niebieski). Etykieta zdjęcia w Ustawieniach to „Jezioro”. Cztery tapety: `neon`, `photo`, `aurora`, `void`.
- **Tło WebGL2 (`js/bg-gl.js`) z fallbackami.** Jeden shader proceduralnej nocnej sceny, skala 0,42–1 (cap DPR 1), `powerPreference:'low-power'`, `failIfMajorPerformanceCaveat:true`.
  Brak WebGL2, błąd kompilacji, renderer programowy, `prefers-contrast`, utrata kontekstu → statyczny gradient CSS (`.bg-fb`); `off`/`tool`/reduced-motion/skupienie → jedna klatka;
  pauza przy `document.hidden`; dławienie w bezczynności. Horyzont shadera jest jednym źródłem prawdy z `J.hud.scene.horizon`.
- **Regulator klatki (`js/gov.js`) zastępuje `adapt()`.** Sygnał: czas GPU (`EXT_disjoint_timer_query_webgl2`) albo p85 odstępów klatek względem zmierzonego vsync. Kolejność ustępowania:
  cząstki → skala rozdzielczości → poziom efektów; histereza 60 s; widoczny wskaźnik ECO. Pierwotny regulator reagował po 5 s, globalnie i tylko na FPS.
  **Kompromis na ekranie 30 Hz:** stałe klatki ≥ 25 ms są uznawane za vsync ekranu dopiero po ≥ 60 s bez szybkiej klatki (wcześniej nie do odróżnienia od ekranu 60 Hz z ciężką sceną),
  więc przez pierwsze ~60 s bez zapamiętanego dowodu regulator może obniżyć poziom efektów; potem się uspokaja, a dowód zapisuje w `sessionStorage` (`jarvis-vs`). Świadomie przyjęta zasada
  „w razie wątpliwości = 60 Hz”: koszt to chwilowo uboższe efekty na ekranie 30 Hz, zysk to brak ślepoty na realne przeciążenie na ekranie 60 Hz (spec 09 §7).
- **Rezygnacja z paralaksy kart HUD.** Pomiar A/B w aplikacji: paralaksa kart (przesunięcie kontenera `#hud` albo 9 kart) kosztowała −45 % FPS w scenie `hud` (raster programowy),
  cząstki i tilt nie. Paralaksa zostaje na Orbie i w shaderze tła; karty mają tilt ≤ 3° przy kursorze.
- **Zasada „nic na niby” jest egzekwowana testami:** tabela zdarzenie → efekt w spec 09 §7 z emiterami (`plik:linia=fragment`) i test spójności; usunięto fikcyjny boot log i losową amplitudę Orba.
- **Siatka bezpieczeństwa:** lint CSS (zapadka zakazanych animacji, `backdrop-filter`/`drop-shadow`/`will-change`), test kontraktu selektorów, test hasha powłoki offline,
  harness `tools/perf` (A/B, zrzuty, różnica obrazu, bramka kontrastu ≥ 4,5:1), nakładka `?perf=1`, e2e tła GL.
- **Start:** `defer` na skryptach, własne czcionki woff2 (bez Google Fonts), tapeta AVIF/WebP, ekran „power-up” napędzany realnymi etapami (moduły, stan, service worker, Hermes, efekty, pulpit).

**Konsekwencje:** pulpit reaguje całym ekranem na realne stany, warstw i animacji niekompozytorowych jest wyraźnie mniej, a koszt efektów jest ograniczony regulatorem.
Koszt: nowe pliki do utrzymania (`css/neon.css`, `js/fx-director.js`, `js/fx-cinema.js`, `js/bg-gl.js`, `js/gov.js`, `js/perf.js`, `tools/perf/`, czcionki), shader jako string w JS,
dwie ścieżki rysowania tła (GL i canvas/CSS), numery linii w tabeli spec 09 §7 do aktualizacji po przesunięciach kodu. **Nie zmierzono na realnym GPU** — środowisko pomiarowe to
renderowanie programowe (SwiftShader), więc liczby bezwzględne są tylko proxy; cele na GPU (p95 ≤ 16,7 ms w `standard`) czekają na pomiar na laptopie (`?perf=1`).

**Rozważone alternatywy:**
- **A. „Neon Noir Tokyo”** (magenta/cyjan, deszcz, miasto; efekt 8/10): odrzucona jako całość — wymaga zastąpienia HUD, a deszcz i miasto na pełnym ekranie są najdroższe; wzięliśmy z niej paletę i sylwetkę miasta w shaderze.
- **B. „Holo-Glass Stark”** (ewolucja HUD; 7/10, najtańsza): wzięta jako baza.
- **C. „Synthwave LED Grid”** (siatka, słońce, cyfry 7-seg; 9/10 wizualnie, ryzykowna): wzięliśmy siatkę-podłogę i cyfry LED, bez słońca i pełnej estetyki retro.
- **Zmiana wyglądu dla wszystkich użytkowników:** odrzucona — decyzja użytkownika, klasyczny wygląd zostaje opcją i nie jest narzucany obecnym użytkownikom.
- **Osobny, czwarty poziom efektów zamiast zmiany `standard`:** odrzucona — łamałaby kontrakt D-08 (4 poziomy) i testy; lepiej zmienić treść poziomu niż jego liczbę.

**Do rewizji:** pomiar na realnym GPU (strojenie kroków regulatora i liczby cząstek, decyzja o `backdrop-filter` na pasku i doku); opcjonalna Faza 7 — Orb w WebGL (po pomiarze);
zdjęcie z allow-listy lintu pozostałych wyjątków (`hlPulse`, `.hc` box-shadow).
