# JARVIS CINEMATIC ENGINE — Specyfikacja projektowa

**Wersja:** 1.0 · **Data:** 2026-10-08  
**Status:** projekt koncepcyjny zatwierdzony; pisemna specyfikacja do przeglądu użytkownika  
**Metoda:** Superpowers — architectural brainstorming  
**Produkt:** samodzielna demonstracyjna aplikacja webowa  
**Lokalizacja dokumentacji:** majkel2403/Jarvis-, tylko gałąź docs/cinematic-engine-spec  
**Zasada nadrzędna:** niniejszy dokument nie autoryzuje rozpoczęcia implementacji.

---

## 1. Cel, rezultaty i granice

Cinematic Engine prezentuje filmowy, interaktywny interfejs dowodzenia AI. Jest samodzielną aplikacją demonstracyjną, nie kolejnym widokiem obecnego Jarvis OS. Powinna wywoływać wrażenie profesjonalnego interfejsu science fiction dzięki skoordynowanemu ruchowi, światłu, geometrii, HUD-om, typografii, dźwiękowi i czytelnej informacji o stanie.

Główna obietnica: użytkownik może obejrzeć kompletny, spójny spektakl lub przejąć sterowanie i sprawdzić przyczynę każdego istotnego zdarzenia. Celem nie jest przypadkowy ruch elementów dekoracyjnych. Motion powinien przekazywać, co robi symulowany system.

**Kryteria sukcesu:**
1. Działają trzy wyraźnie odrębne sceny: BOOT SEQUENCE, AI PROCESSING i COMMAND CENTER.
2. AUTO SHOWCASE odtwarza sekwencję w sposób przewidywalny, a INTERACTIVE pozwala użytkownikowi sterować scenami i efektami.
3. Obraz 3D, HUD, kamera i audio synchronizują się na podstawie jednego zegara i jednej maszyny stanów.
4. Każde prezentowane działanie agentów oraz ich wyniki są jawnie oznaczone jako DEMO / SYMULACJA.
5. Replay odtwarza tę samą sekwencję logiczną z zapisanych zdarzeń i seeda.
6. Aplikacja nie zależy od Hermesa, Jev, Bridge, obecnego Jarvisa, backendu ani klucza API.
7. Aplikacja pozostaje sterowalna na ekranach mobilnych, przy ograniczonym ruchu i przy awarii WebGL.

### 1.1. Zakres wersji 1.0

- Trzy sceny, dwa tryby sterowania i animowane intro/outro.
- Dziesięć warstw L0–L9 — logicznie wyodrębnionych, niekoniecznie dziesięć canvasów.
- Centralny Cinematic Director, Scene State Machine i Timeline/Clock.
- Deterministyczny Demo Event Simulator, Event Normalizer oraz Replay.
- Centralny reaktor 3D, orbity, sygnały, skanery, cząstki, hologramy i ograniczony postprocessing.
- Osiem modułów HUD: Reactor Inspector, Radar/Scanner, Agent Graph, Telemetry, Process Log, Signal Diagnostics, Motion Controls i Timeline/Replay.
- Użytkowe interakcje, responsywność, sterowanie jakością, reduced motion i tryb awaryjny 2D.
- Audio jako opcjonalna warstwa, niewymagana do obsługi.

### 1.2. Świadomie poza zakresem

- Integracja z prawdziwymi agentami, usługami AI, narzędziami, siecią Jarvisa i danymi użytkownika.
- Wykonywanie prawdziwych zadań, łączenie z API i przechowywanie kont/sekretów.
- Edytor filmów, pełny edytor scen, VR, multi-user i eksport wideo.
- Setki widgetów i efektów w pierwszym wydaniu. Architektura ma wspierać rozszerzenia, a pierwsza wersja dostarczyć dopracowany, zamknięty zestaw.
- Kopiowanie cudzego filmowego projektu 1:1 lub używanie chronionych znaków czy zasobów bez licencji.

### 1.3. Izolacja

Wersja 1.0 jest osobnym produktem. Ten dokument trafia wyłącznie na odizolowaną gałąź dokumentacyjną istniejącego repozytorium. Nie zmieniamy gałęzi main, plików aplikacji, konfiguracji, zależności ani wdrożenia Jarvis OS. Kod przyszłej aplikacji nie jest tworzony na etapie specyfikacji.

## 2. Kierunek estetyczny

Estetyka: high-end cinematic FUI, inspirowana referencjami z ciemnym centrum dowodzenia, centralną tarczą reaktora, radialnymi indeksami, radarami i holograficznymi wykresami. Efekty nie mogą maskować treści.

**Przykładowe tokeny:** VOID #030A13, NAVY #071B2B, CYAN #18CFE4, TURQUOISE #21E4C0, ICE #DDFBFF, WARNING #FFAF50, ERROR #FF556A. Są punktem wyjścia do design systemu, a nie obowiązkiem używania każdej barwy równocześnie.

**Zasady wizualne:**
- Jeden punkt dominujący: centralny reaktor; pomocnicze informacje tworzą przestrzenny kontekst.
- Nie używać pełnego bloom na tekście i kontrolkach.
- Na większości kadru zachować ciszę wizualną. Szczyty energii są rzadkie, krótkie i znaczące.
- Materiały quasi-holograficzne, cienkie obrysy, precyzyjna geometria, czytelne liczby tabularne.
- Panel otwiera się tam, gdzie użytkownik oczekuje informacji; nie zasłania bez potrzeby orbity ani najważniejszych kontrolek.
- Komunikat sukcesu i błędu ma równocześnie kolor, tekst i jednoznaczną zmianę kształtu/ruchu.

## 3. Architektura systemu

Jednokierunkowy przepływ:

Demo Event Simulator / User Commands
→ Event Normalizer
→ Cinematic Director
→ Scene State Machine + Virtual Clock
→ Motion Timeline
→ Scene 3D / HUD 2D / Audio
→ kompozycja sceny.

### 3.1. Odpowiedzialności modułów

| Moduł | Jedna odpowiedzialność | Nie może |
|---|---|---|
| App Shell | inicjalizacja, wybór widoku, ustawienia, fallback | generować zdarzeń agentów |
| Demo Event Simulator | deterministyczne scenariusze i błędy demo | udawać połączenia z prawdziwym AI |
| Event Normalizer | walidacja wejścia i duplikatów | uruchamiać animacji |
| Cinematic Director | rozstrzygać komendy, orkiestrację i generacje sceny | renderować własnych widgetów |
| Scene State Machine | przechowywać dozwolone przejścia i stany terminalne | czytać bezpośrednio DOM |
| Virtual Clock / Timeline | kontrolować czas, play/pause/seek/rate/cancel | podejmować decyzji domenowych |
| Scene Renderer | renderować L1–L7 według stanu | zmieniać domenowy log |
| HUD Renderer | czytelnie pokazywać i obsługiwać stan | generować fikcyjne zdarzenia |
| Audio Director | synchronizować cues ze wspólnym czasem | blokować scenę, gdy audio nie działa |
| Replay Store | utrzymywać niezmienny log, seed, checkpointy | losować nowych zdarzeń przy replay |
| Quality Governor | dostosowywać koszt efektów | zmieniać wynik zadania demo |
| Error Recovery | wykrywać awarie, dawać UI awaryjne i reset | ukrywać przyczyn błędów |

Kontrakt: widget wywołuje komendę, Director aktualizuje stan, a renderery jedynie go obserwują. Nie wolno robić drugiej maszyny stanów w obiekcie Orba lub w panelu HUD.

### 3.2. Technologie wybrane na poziomie projektu

React + TypeScript jako UI, Three.js / React Three Fiber jako renderer 3D, GSAP jako system choreografii, CSS/SVG/HTML dla ostrego HUD, shadery dla światła i cząstek, selektywny postprocessing, przeglądarkowe Audio API. Dobór konkretnych wersji i zależności należy do późniejszego planu. Nie potrzebujemy backendu.

## 4. Warstwy L0–L9

| Warstwa | Nazwa | Zawartość | Zasada degradacji |
|---|---|---|---|
| L0 | VOID | prawie czarne tło, winieta, lekki gradient | zawsze dostępna |
| L1 | ATMOSPHERE | mgła, siatka głębi, digital dust, parallax | mniej pyłu, brak wolumetrii |
| L2 | REACTOR | rdzeń energetyczny, aura, puls, reakcja na stan | uproszczony shader |
| L3 | ORBITAL MESH | 3D rings, radial ticks, segmenty, indeksy | mniej geometrii |
| L4 | ENERGY | energy arcs, line trace, transfer impulsów | bez nieistotnych łuków |
| L5 | PARTICLES | konwergencja, emisja i trajektorie punktów | mniej cząstek |
| L6 | SCANNER | radar ping, laser sweep, target lock | uproszczony skaner |
| L7 | HOLOGRAMS | projekcje agentów, graf relacji, pomocnicze sfery | wariant 2D |
| L8 | HUD | panele, wykresy, napisy, sterowanie, Process Log | responsywne układy |
| L9 | CINEMATIC FX | bloom, światło, film grain, ostrożna aberracja | wyłączane priorytetowo |

**Kompozycja:** L0 → przestrzeń WebGL L1–L7 → L9 postprocess obrazu WebGL → L8 jako oddzielna warstwa DOM nad obrazem 3D. L9 nie filtruje tekstu, tooltipów ani focus outline. Dziesięć warstw to model odpowiedzialności, nie dziesięć osobnych kontekstów GPU.

**Przykład reakcji:** zdarzenie wykrycia sygnału wzmacnia rdzeń L2, wyzwala ping L6 i dodaje wpis w L8. Dodatkowy łuk L4 pojawia się dopiero, jeśli nastąpi transfer zdarzenia. Przypadkowy dekoracyjny błysk nie może sugerować fikcyjnego działania systemu.

## 5. BOOT SEQUENCE — scena pierwsza

Referencyjnie 4 200 ms czasu wirtualnego przy 1×.

| Przedział | Akt obrazu | Wspólny checkpoint |
|---|---|---|
| 0–500 ms | niemal ciemno, niewielkie światło i mgła | DARK |
| 500–1 200 ms | cząstki zbiegają się do rdzenia | FORMING |
| 1 200–2 200 ms | pierścienie montują się przestrzennie | ASSEMBLING |
| 2 200–3 300 ms | rysowanie ścieżek HUD i materializacja paneli | HUD_REVEAL |
| 3 300–4 200 ms | fala synchronizacji, napis SYSTEM ONLINE | ONLINE |

Ruch kamery: delikatny dolly-in i łuk orbitalny, nie agresywny zoom. Efekty audio są przypięte do checkpointów. Po SKIP_INTRO cały system atomowo trafia do ONLINE; nie zostają uruchomione dotychczasowe animacje, spóźnione callbacki ani cząstki z fazy FORMING.

Przy reduced motion zamiast pięciu dynamicznych etapów wyświetlamy krótki fade i statyczny, czytelny stan ONLINE.

## 6. AI PROCESSING — scena druga

Scena wizualizuje **symulowany** proces pracy agentów. Kolejne fazy domenowe:

IDLE → SIGNAL → ANALYZING → DELEGATING → EXECUTING → VERIFYING → SUCCESS albo ERROR.

Sześć operacyjnych momentów dramaturgicznych:

1. SIGNAL DETECTED: target brackets, radar ping, chwilowe skupienie kamery i etykieta wykrycia.
2. ANALYSIS: zagęszczenie orbit, skaner, wykres sygnału i podświetlenie Core.
3. DELEGATION: pojawienie się klastrów agentów i wyraźna trasa transferu sygnału.
4. TOOL EXECUTION: impuls wychodzący i stan pracy; bez zmyślonych pomiarów zasobów sprzętowych.
5. VERIFICATION: impuls zwrotny, synchronizacja stanu i Process Log z wynikiem sprawdzenia.
6. RESULT: konwergencja, krótki energy release, zmiana światła, cisza po kulminacji i etykieta DEMO RESULT.

**Ścieżka porażki:** czerwony akcent tylko w obrębie lokalnego wskaźnika, krótkie zaburzenie pierścienia, czytelny powód w logu oraz kontrolki RESET i RETRY. System nie symuluje awarii przeglądarki przy błędzie zadania.

Cel sceny: opowieść przez wydarzenia. Jeżeli wynik przychodzi wcześniej niż oczekiwano, Director skraca lub kończy animację w kontrolowany sposób; nie zwleka z informacją o stanie tylko po to, by skończyć dekoracyjną pętlę.

## 7. COMMAND CENTER — scena trzecia

Scena jest trybem eksperymentowania i inspekcji. Core ma spokojniejszą pracę, kamera jest stabilna, a obiekty rozkładają przestrzeń pod panele. Osiem modułów:

1. **Reactor Inspector:** stan rdzenia, aktywne warstwy i ustawienia intensywności.
2. **Radar / Scanner:** kierunek sygnału, target lock i przełączanie próbnego skanu.
3. **Agent Graph:** klastry agentów, krawędzie, wybór, skupienie na relacji.
4. **Telemetry:** oznaczone symulowane dane systemu i oddzielna realna metryka renderowania.
5. **Process Log:** chronologiczny log zdarzeń, filtrowanie według aktualnego run.
6. **Signal Diagnostics:** widok pakietu zdarzenia i przebiegu transferu.
7. **Motion Controls:** intensywność, tryb reduced motion, efekty i preset jakości.
8. **Timeline / Replay:** scrub, prędkość, pause, restart i odtwarzanie logu.

Wybór agenta rozświetla jego relacje i powiązane etapy procesu. Użytkownik może zamknąć moduły, a dane i kontrolki pozostają dostępne przez nawigację.

**Mobile:** rdzeń i status główny zawsze priorytetowe. Panele przechodzą do kart/dolnego arkusza, maksymalnie jeden rozwinięty naraz. Nie skalujemy całego desktopu do mikroskopijnej wersji.

## 8. Dwa tryby prezentacji

### 8.1. AUTO SHOWCASE

Pełna referencyjna długość: **35 000 ms** wirtualnego czasu 1×.

BOOT 4 200 ms → AI PROCESSING 16 000 ms → COMMAND CENTER 12 000 ms → OUTRO 2 000 ms → reset neutralny 800 ms. Możliwa pętla. Wejście do AUTO z INTERACTIVE natychmiast anuluje poprzednią generację sceny.

OUTRO: panele i linie zwijają się w stronę rdzenia, cząstki wygasają, pierścienie zwalniają i kadr wraca do ciemnego ujęcia. Bez pełnoekranowego błysku.

### 8.2. INTERACTIVE

Użytkownik może wybrać scenę, uruchomić analizę, wymusić scenariusz błędu, wybrać agenta, sterować efektami, zatrzymać i przewijać czas. Prędkości V1: 0,5×, 1×, 1,5×.

Każda interakcja ma widoczny feedback również bez audio. Wejście w INTERACTIVE nie pozostawia oczekujących timerów AUTO. Aplikacja pokazuje aktywny tryb w sposób jednoznaczny.

## 9. Event contract

Każde zdarzenie symulatora posiada:

| Pole | Typ i reguła |
|---|---|
| schemaVersion | integer równy 1 |
| eventId | unikatowy string dla jednego uruchomienia |
| runId | identyfikator jednego wykonania demonstracji |
| sequence | integer > 0, ściśle rosnący w run |
| timeMs | integer >= 0, czas wirtualny od startu run |
| source | stała demo-simulator |
| kind | jeden z jawnie obsługiwanych typów |
| correlationId | identyfikator zadania dla zdarzeń zadaniowych |
| payload | obiekt zwalidowany według kind |

Dopuszczalne rodzaje V1: system.boot.started, system.boot.completed, signal.detected, analysis.started, agent.delegated, tool.started, tool.completed, verification.started, task.succeeded, task.failed, scene.outro.started.

Dopuszczalne komendy użytkownika: SELECT_SCENE, SET_MODE, START_DEMO_TASK, TRIGGER_DEMO_FAILURE, SELECT_AGENT, SET_PLAYBACK_RATE, PAUSE, RESUME, SEEK, RESET, REPLAY, SKIP_INTRO, SET_QUALITY, SET_AUDIO_ENABLED.

**Rozróżnienie:** event stwierdza, co wydarzyło się w symulacji; command wyraża intencję użytkownika; animation cue opisuje wizualną konsekwencję. Obecność animacji nie jest dowodem, że istnieje prawdziwe wywołanie narzędzia.

**Walidacja i deduplikacja:**
- Event Normalizer sprawdza wersję, identyfikatory, payload, numery sekwencji i monotoniczność czasu.
- Ten sam eventId w jednym run nie wywołuje ponownej animacji.
- Nieznany kind lub schemaVersion nie zmienia stanu; pojawia się wpis diagnostyczny.
- Strumień spóźniony nie może cofnąć bieżącego stanu; Replay waliduje cały zapis przed odtwarzaniem.
- Event procesowy z pustym correlationId zostaje odrzucony.
- Błędne wejście nie może spowodować wykonania kodu, HTML ani wywołania sieciowego.

## 10. Scene State Machine

Stan nadrzędny:
- mode = AUTO_SHOWCASE lub INTERACTIVE;
- scene = BOOT, PROCESSING lub COMMAND;
- playback = PLAYING, PAUSED lub STOPPED;
- process = IDLE, SIGNAL, ANALYZING, DELEGATING, EXECUTING, VERIFYING, SUCCESS lub ERROR.

Przejścia muszą być jawnie dozwolone. Nielegalne zdarzenie jest ignorowane i oznaczane w diagnostyce. Z SUCCESS/ERROR można wykonać RESET lub uruchomić nowy run. Przejście sceny zwiększa sceneGeneration, anuluje poprzednie harmonogramy i publikuje spójny snapshot do renderera, HUD i audio.

W BOOT odrębny zestaw checkpointów: DARK, FORMING, ASSEMBLING, HUD_REVEAL, ONLINE. SKIP_INTRO wymusza komplet ONLINE, a nie samo przewinięcie kamery.

## 11. Motion Engine: słownik i zachowanie

| Token | Zdarzenie / znaczenie | Zakres 1× |
|---|---|---|
| micro.confirm | klik i wybór | 120–200 ms |
| hud.materialize | otwarcie panelu | 300–550 ms |
| line.trace | przepływ informacji | 350–650 ms |
| radar.ping | wykrycie sygnału | 500–900 ms |
| ring.acquire | target lock | 500–900 ms |
| orb.analyze | analiza trwa | podtrzymywane w fazie |
| energy.charge | narastanie napięcia | 800–1400 ms |
| energy.release | kulminacja | 180–420 ms |
| scene.transition | zmiana sceny | 900–1500 ms |
| boot.sequence | intro | 4200 ms |
| scene.outro | wygaszenie | 2000 ms |

**Motion policy:** jedna dominująca akcja w kadrze. Większość HUD-ów działa dyskretnie. Krótki glitch oznacza destabilizację lub błędny wynik, nie jest stałą dekoracją. Animacja sukcesu ma kulminację: zgranie rotacji, zmiana geometrii, konwergencja cząstek, impuls do panelu i krótka pauza, nie tylko powiększenie rdzenia.

**Choreography clock:** kamera, shadery, ruch GSAP, log, HUD i audio otrzymują ten sam czas wirtualny. Widget nie może lokalnie planować oddzielnej osi czasowej. RESET, SEEK lub zmiana trybu anulują stare cue i renderują oczekiwany snapshot.

**Reduced motion:** wyłączyć długie obroty kamery, gwałtowne zbliżenia, glitch i eksplozje punktów; pozostawić krótkie fade i pełne informacje o stanie. Funkcje nie mogą znikać tylko dlatego, że animacja jest wyłączona.

## 12. Kamera, interakcja przestrzenna i UX

Kamera BOOT: spokojny dolly-in, lekki ruch orbitalny. PROCESSING: fokus na reaktor i klastry; HUD pozostaje przyklejony do ekranu. COMMAND: stabilna perspektywa ułatwiająca czytanie paneli.

Parallax podąża za kursorem z niską amplitudą i może zostać wyłączony. Interakcje DOM zawsze mają priorytet nad gestami 3D. Touch nie wymaga hover. Elementy krytyczne nie mogą znajdować się w stale poruszającej się płaszczyźnie.

Przestrzenne połączenia mogą być widoczne za panelami, ale nie mogą przechwytywać pointer-events i ukrywać ważnego tekstu.

## 13. Replay: powtarzalność i Seek

Replay zapisuje runId, schemaVersion, seed, uporządkowane zdarzenia, checkpointy i snapshot ustawień sceny. Nie jest nagraniem wideo. Odtworzenie tych samych danych ma generować identyczne stany logiczne, wyniki i deterministyczne pozycje obiektów przy tym samym profilu jakości.

- Losowość musi pochodzić z ustalonego seeda, a nie z niekontrolowanego źródła używanego podczas renderowania.
- Każdy event trafia do niezmiennej listy.
- Stan w czasie T jest projekcją eventów do T oraz checkpointu.
- SEEK rekonstruuje stan bez dodatkowych skutków ubocznych i odtwarzania kolejnych dźwięków potwierdzenia.
- PAUSE zamraża logikę, animację i audio, nie tylko postęp wizualnego paska.
- REPLAY nie generuje nowych domenowych zdarzeń, a tworzy nową instancję wykonania z utrwalonego logu.
- Zmiana jakości może zmienić liczbę cząstek, lecz nie semantykę zdarzeń ani checkpointy.

Deterministyczność nie oznacza identycznych pikseli na dwóch różnych GPU lub silnikach przeglądarki. Historia V1 jest przechowywana w pamięci bieżącej sesji. Import/eksport nagrań to osobny etap produktu.

## 14. Audio Director

Dźwięk składa się z ambientu i krótkich cue: boot, scan, acquire, signal-transfer, success, error, outro. Każdy cue posiada checkpoint timeline. Audio może działać z Web Audio API i/lub lokalnymi zasobami.

Przed świadomą interakcją użytkownika dźwięk jest wyłączony. Niepowodzenie odblokowania autoplay nie jest błędem krytycznym. Mute musi uciszyć aktywne źródła. PAUSE, SEEK i RESET zachowują synchronizację; przy SEEK nie odtwarzamy historycznych cues z przeszłości.

Wszystkie istotne zdarzenia muszą być zrozumiałe na wyciszeniu.

## 15. Quality Governor, rendering i mobile

Presety:
- ULTRA: pełne cząstki, selektywny bloom, bardziej złożone projekcje.
- BALANCED: mniej cząstek i efektów, uproszczone projekcje.
- MOBILE / LOW: brak ciężkiej wolumetrii, mniejsze koszty GPU, jeden aktywny panel.
- SAFE 2D: awaryjny statyczny/lekki Core w SVG/CSS, pełny HUD i możliwość sterowania bez WebGL.

Referencyjne rozdzielczości: desktop 1440×900, telefon 390×844; obsługa także zakresu 320–430 px. Cel: płynna praca i dążenie do 60 FPS na odpowiednim sprzęcie, bez deklaracji gwarantowanego FPS na każdej maszynie. Domyślny device pixel ratio dla renderera maksymalnie 2. Jeden główny canvas WebGL; bez niezależnego kontekstu GPU dla każdego panelu.

Adaptive quality: wieloklatkowy pomiar stabilności zamiast reakcji na pojedynczy spadek FPS. Zmniejszenie jakości nie wpływa na wyniki zdarzeń ani kontrolek; podniesienie jakości wymaga stabilnego okresu, żeby uniknąć oscylacji. Zakryta karta ogranicza renderowanie; po wznowieniu nie następuje lawina callbacków.

Przy błędzie WebGL/context-lost natychmiast dostępny jest SAFE 2D; start, pause, reset i log działają nadal. Na mobile nie wolno uzyskać poziomego przewijania całej strony tylko przez szerokość HUD.

## 16. Dostępność i bezpieczeństwo

- Wszystkie działania muszą być dostępne z klawiatury; fokus jest widoczny, a nazwy kontrolek zrozumiałe.
- Przestrzeń dekoracyjna nie przejmuje fokusu, nie blokuje przewijania paneli ani aktywacji.
- Kolor nie jest jedynym sygnałem stanu; tekst ma kontrast docelowo zgodny z WCAG 2.2 AA.
- Preferencja systemowa reduced motion działa od pierwszej klatki; nie po przejściu intro.
- Dostatecznie duże cele dotykowe i alternatywy dla precyzyjnych gestów/hover.
- Każda liczba lub analiza pochodząca z symulatora posiada kontekst DEMO/SYMULACJA; rzeczywisty FPS ma osobne oznaczenie.
- V1 nie zawiera kluczy API, logowania ani serwera aplikacyjnego; zawartość eventów jest nieufnym tekstem, nie aktywnym HTML.
- Nie używać bezprawnie redystrybuowanych fontów, modeli, tekstur, dźwięków ani identyfikacji marek filmowych.

## 17. Testy akceptacyjne

AC-01 — BOOT przy prędkości 1× dochodzi do ONLINE po 4 200 ms wirtualnego czasu, a wszystkie warstwy kończą montaż.

AC-02 — SKIP_INTRO na dowolnym etapie ustawia kompletnego ONLINE i anuluje animacje starej fazy.

AC-03 — AUTO SHOWCASE składa się z BOOT 4 200 + PROCESSING 16 000 + COMMAND 12 000 + OUTRO 2 000 + RESET 800 = 35 000 ms.

AC-04 — Zmiana AUTO na INTERACTIVE zatrzymuje harmonogram AUTO bez zaległych zmian paneli.

AC-05 — task.succeeded powoduje zgodny stan Core, HUD, logu i opcjonalnego audio.

AC-06 — task.failed pokazuje powód, lokalny alert i pozwala wykonać RESET bez restartu strony.

AC-07 — Podwójne podanie eventId wyzwala efekt tylko raz.

AC-08 — Błędny event payload i nieznana wersja schematu nie powodują mutacji stanu; wpis diagnostyczny jest czytelny.

AC-09 — Ten sam seed i ordered events zapewniają ten sam logiczny przebieg Replay i ten sam zestaw checkpointów.

AC-10 — PAUSE zatrzymuje logikę, shadery, GSAP i audio, a RESUME nie gubi synchronizacji.

AC-11 — SEEK do wskazanego czasu daje zgodny stan bez ponownego wywoływania historycznych skutków ubocznych.

AC-12 — Zmiana sceny podczas transition nie zostawia paneli ani cue poprzedniej sceneGeneration.

AC-13 — Reduced motion przed uruchomieniem zapobiega ostrym błyskom, glitchowi i zbliżeniom przy zachowaniu pełnej funkcjonalności.

AC-14 — Zablokowane autoplay nie uniemożliwia używania demo.

AC-15 — Wyłączenie lub utrata WebGL uruchamia SAFE 2D z działającym panelem kontrolnym.

AC-16 — Na 390 px szerokości podstawowe kontrolki są dostępne, a cała strona nie przewija się poziomo.

AC-17 — Wszystkie symulowane liczby są rozpoznawalnie opisane, a realne metryki renderowania odseparowane.

AC-18 — Ukryta karta nie obciąża GPU pełnym renderem; przy powrocie czas jest spójny, bez lawiny przeterminowanych zdarzeń.

AC-19 — Użytkownik bez myszy może przełączyć scenę, pauzować, uruchomić Replay, zresetować i przeczytać log.

AC-20 — Aplikacja działa bez Hermesa, Jev, Bridge, konta użytkownika oraz klucza API.

## 18. Ryzyka, kompromisy i kontrola zakresu

| Ryzyko | Konsekwencja | Decyzja |
|---|---|---|
| Przesyt efektów | brak hierarchii | jeden hero-motion i spokojne tło |
| Rozdzielone zegary | desynchronizacja | jeden Virtual Clock |
| Zbyt wiele kontekstów | koszt GPU | jeden główny renderer WebGL |
| Zbyt długi boot | frustracja | SKIP_INTRO i reduced motion |
| Niespójny replay | utrata zaufania | log + seed + checkpointy |
| Nieoznaczone symulacje | pozór prawdziwych danych | etykiety DEMO przy danych |
| Słaby telefon | puste lub wolne UI | LOW i SAFE 2D |
| Zatrzymanie w połowie cue | osierocony HUD | sceneGeneration i cancel |
| Audio autoplay | cisza lub błąd | domyślny mute i odblokowanie gestem |
| Zbyt duży pierwszy etap | brak ukończonego demo | dokładnie 3 sceny i 8 modułów |

## 19. Granica formalnego procesu Superpowers

Zatwierdzony kierunek koncepcyjny został przełożony na ten dokument. Dokument jest podstawą **przyszłego** planu Superpowers writing-plans, ale sam nie jest planem wykonawczym. Zmiany typu komenda → reducer → cue → renderer będą dopiero mapowane na pliki, testy jednostkowe i zadania w osobnym etapie.

Przed rozpoczęciem implementacji użytkownik musi (1) przejrzeć i zatwierdzić tę **pisemną specyfikację**, (2) przejrzeć i zatwierdzić osobny plan implementacji oraz (3) wybrać metodę realizacji. Żaden z tych kroków nie jest domyślnie przyjęty.

## 20. Wynik wewnętrznego przeglądu (self-review)

- **Kompletność:** opisano 3 sceny, 2 tryby, 10 warstw, Director, Simulator i Replay.
- **Spójność:** logika zdarzeń jest odseparowana od animacji, a dane demo od rzeczywistych pomiarów.
- **Dostępność błędów:** uwzględniono błędny event, duplikat, context loss, brak audio, pause/seek, słaby GPU.
- **Granice zakresu:** nie wymaga realnego AI, serwera ani zmian w obecnym Jarvis OS.
- **Akceptacja:** 20 scenariuszy AC opisuje sprawdzalne zachowanie.
- **Status:** do przeglądu przez użytkownika, bez zgody na implementację.
