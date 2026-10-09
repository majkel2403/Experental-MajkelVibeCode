# JARVIS Cinematic Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zbudować samodzielną filmową aplikację demonstracyjną z trzema scenami, 10 warstwami, Cinematic Director, AUTO SHOWCASE/INTERACTIVE i deterministycznym Replay, bez zależności od obecnego Jarvis OS.

**Architecture:** Samodzielny projekt Vite w `apps/cinematic-engine/` z izolowanym React UI i jednym renderem Three.js/R3F; zdarzenia symulatora przechodzą przez walidator, reducer oraz Cinematic Director do wspólnego zegara, sceny 3D, HUD i audio. Odtwarzanie polega na projekcji logu i seeda, a błędy GPU nie blokują sterowania HTML/SVG.

**Tech Stack:** Node.js >= 22; npm; React + TypeScript; Vite; Three.js + React Three Fiber; GSAP; shader GLSL; selective WebGL postprocessing; SVG/CSS/DOM; Web Audio API; Vitest; React Testing Library; Playwright. Instalacja i wersje pakietów zostaną zapisane w lokalnym lockfile podczas realizacji Task 01.

**Spec:** `docs/superpowers/specs/2026-10-08-cinematic-engine-design.md` (zatwierdzona 2026-10-08).

**Scope boundary:** Dokument planu jest zapisywany jedynie w gałęzi `docs/cinematic-engine-spec`; wykonawca musi użyć **osobnej gałęzi implementacyjnej/worktree** po zatwierdzeniu planu. Żaden krok poniżej nie został jeszcze wykonany.

## Global Constraints

- Niezależność: **bez integracji z Hermes, Jev, Bridge, Jarvis OS, backendem i kluczami API** w V1.
- Wydanie V1 zawiera dokładnie **3 sceny**, **2 tryby**, **10 warstw logicznych L0–L9** oraz **8 modułów HUD**.
- Czas BOOT: **4200 ms** przy prędkości 1×; AUTO: **4200 + 16000 + 12000 + 2000 + 800 = 35000 ms** czasu wirtualnego.
- Prędkości playback: **0.5, 1, 1.5**; renderer ma **jeden główny canvas WebGL** z device pixel ratio maksymalnie **2**.
- Wszystkie pomiary agentów i wyniki oznaczone **DEMO / SYMULACJA**; jedynie pomiary renderera jawnie mogą być realne.
- Render 3D i postprocessing **nie filtrują tekstu DOM**, tooltipów ani focus outline.
- Kontrolki dostępne bez audio, za pomocą klawiatury i dotyku; mobile referencyjnie **390×844** (również 320–430 px); reduced motion od pierwszej klatki.
- Po utracie WebGL automatyczny fallback do **SAFE 2D** z zachowanymi funkcjami.
- Zdarzenia są nieufnym tekstem; żadnego `dangerouslySetInnerHTML`, ewaluacji kodu ani wykonywania komend systemowych z event payload.
- Odtwarzanie deterministyczne dotyczy seeda, domeny, checkpointów i pozycji obiektów w ramach profilu, nie identyczności pikseli między GPU.
- Izolacja builda: tylko `apps/cinematic-engine/`, bez modyfikowania root `package.json`, `index.html`, istniejących `js/`, `css/`, `bridge/`, `tests/` oraz workflow publikującego Jarvis.
- Każde zadanie: test RED → minimalna implementacja GREEN → testy lokalne → commit. Nie wprowadzać niesprawdzonych zmian do `main`.
- Żadnego deploy, instalacji pakietów, scaffoldu ani tworzenia plików produktu, zanim użytkownik zatwierdzi ten plan i metodę wykonania.

## Review Focus

Pięć przypadków o największym ryzyku nieujętym dosłownie jako odrębny scenariusz wejściowy w specyfikacji; należy dopisać testy w zadaniach właścicielskich:

1. **Szybkie AUTO → INTERACTIVE → AUTO podczas transition:** nie może wywołać podwójnego przejścia ani pozostawić callbacków starszej generacji (Task 07).
2. **SEEK poniżej 0 i poza długość run:** clamp do poprawnego zakresu, a stan i audio bez efektów ubocznych (Task 06).
3. **Ten sam eventId w różnych runId:** deduplikacja ograniczona do jednego run, a nie globalnie (Task 02).
4. **Utrata WebGL w połowie AI PROCESSING:** SAFE 2D przejmuje bieżący snapshot, można kontynuować, pauzować i resetować (Task 15).
5. **Niejednoznaczne visibilitychange podczas pauzy i wznowienia:** bez skoku czasu, bez nadrabiania cues lub audio po powrocie (Task 04 i Task 14).

---

## 1. Struktura docelowa plików

Wszystkie poniższe ścieżki są **projektowanymi ścieżkami przyszłej implementacji**, nie już istniejącymi plikami.

```text
apps/cinematic-engine/
  package.json
  package-lock.json
  index.html
  vite.config.ts
  tsconfig.json
  playwright.config.ts
  src/
    main.tsx
    App.tsx
    styles/
      tokens.css
      layout.css
    domain/
      types.ts
      eventSchemas.ts
      normalizeEvent.ts
      reducer.ts
      simulator.ts
      scenario.ts
      replay.ts
    engine/
      virtualClock.ts
      sceneSchedule.ts
      director.ts
      cues.ts
      motionDirector.ts
      audioDirector.ts
      qualityGovernor.ts
    scene/
      SceneHost.tsx
      SafeCore2D.tsx
      CameraRig.tsx
      layers/
        VoidLayer.tsx
        AtmosphereLayer.tsx
        ReactorLayer.tsx
        OrbitalMeshLayer.tsx
        EnergyLayer.tsx
        ParticleLayer.tsx
        ScannerLayer.tsx
        HologramLayer.tsx
        CinematicEffects.tsx
        sceneTypes.ts
    hud/
      HudShell.tsx
      modules/
        ReactorInspector.tsx
        RadarScanner.tsx
        AgentGraph.tsx
        Telemetry.tsx
        ProcessLog.tsx
        SignalDiagnostics.tsx
        MotionControls.tsx
        TimelineReplay.tsx
    hooks/
      useDirectorSnapshot.ts
      useReducedMotion.ts
    tests/
      domain/
        normalizeEvent.test.ts
        reducer.test.ts
        simulator.test.ts
        replay.test.ts
      engine/
        virtualClock.test.ts
        director.test.ts
        cues.test.ts
        motionDirector.test.ts
        audioDirector.test.ts
        qualityGovernor.test.ts
      components/
        App.test.tsx
        HudShell.test.tsx
        SceneHost.test.tsx
        accessibility.test.tsx
      e2e/
        showcase.spec.ts
        interactive.spec.ts
        mobile.spec.ts
        recovery.spec.ts
  README.md
```

Granice modułów:
- `domain/` jest czystym TypeScript bez React/Three/GSAP/DOM i posiada deterministyczne testy.
- `engine/` steruje czasem, stanem i efektami, ale nie posiada elementów JSX.
- `scene/` tylko renderuje snapshot. Każda warstwa ma jedną rolę i dostęp do ustalonego czasu sceny.
- `hud/` wyświetla stan i emituje komendy. Nie nadpisuje stanu procesu lokalnie.
- `tests/` są wewnątrz aplikacji; istniejące root testy Jarvisa nie są dotykane.

## 2. Etapy i ich niezależne dostarczane wyniki

- **Milestone A — Domain Core** (Tasks 01–04): uruchamialna pusta aplikacja, typy, walidacja, state reducer, testowany zegar. Można zweryfikować bez GPU.
- **Milestone B — Deterministic Playback** (Tasks 05–07): scenariusz demo, Replay i Director; można uruchamiać headless bez WebGL.
- **Milestone C — Visible Cinematic Core** (Tasks 08–11): działający shell, pojedynczy canvas, warstwy L0–L7, cue i kamera; wczesny rezultat demonstracyjny.
- **Milestone D — Interactive Experience** (Tasks 12–14): osiem modułów HUD, sekwencje trzech scen i audio.
- **Milestone E — Production-grade Demo** (Tasks 15–17): profile jakości, SAFE 2D, dostępność, wydajność i E2E.

Każdy milestone kończy się działającym i testowalnym przyrostem. Przejście do następnego wymaga pozytywnego wyniku testów, nie wyłącznie oceny wyglądu.

---

### Task 01: Izolowana aplikacja i runner testów

**Files:**
- Create: `apps/cinematic-engine/package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, `tsconfig.json`
- Create: `apps/cinematic-engine/src/main.tsx`, `src/App.tsx`, `src/styles/tokens.css`
- Create: `apps/cinematic-engine/tests/components/App.test.tsx`
- Create: `apps/cinematic-engine/README.md`

**Interfaces:**
- Consumes: brak.
- Produces: renderowanie `<App />` z etykietą `JARVIS CINEMATIC ENGINE` i widocznym `DEMO / SYMULACJA`.

- [ ] **Step 1: Write failing test** — przygotuj minimalną konfigurację test runnera i zainstaluj zależności wyłącznie w nowym katalogu aplikacji (bez tworzenia App), po czym w `tests/components/App.test.tsx` napisz `renders_engine_title_and_demo_label`: po renderowaniu App oczekuj obu napisów i semantycznego `main`.
- [ ] **Step 2: Verify RED** — `cd apps/cinematic-engine && npm test -- --run tests/components/App.test.tsx`; spodziewany FAIL przed utworzeniem App.
- [ ] **Step 3: Implement** — dokończ izolowany Vite React TS; w `package.json` zapewnij skrypty `dev`, `build` (= `tsc --noEmit && vite build`), `test` (= `vitest`), `test:run` (= `vitest run`), `test:e2e` (= `playwright test`); zależności react/react-dom/three/@react-three/fiber/gsap/@react-three/postprocessing i testy pozostają lokalne. Zapisz `package-lock.json`. Użyj systemu ESM i lokalnych ścieżek.
- [ ] **Step 4: Verify GREEN** — `npm run test:run -- tests/components/App.test.tsx` i `npm run build`; oczekuj PASS i folderu `dist/`.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine && git commit -m "feat(cinematic): scaffold isolated demo app"`.

### Task 02: Domain contracts, event payloads i deduplikacja

**Files:**
- Create: `src/domain/types.ts`, `src/domain/eventSchemas.ts`, `src/domain/normalizeEvent.ts`
- Test: `tests/domain/normalizeEvent.test.ts`

**Interfaces:**
- Produces: `type Mode = 'AUTO_SHOWCASE' | 'INTERACTIVE'`; `type SceneId = 'BOOT' | 'PROCESSING' | 'COMMAND'`; `type Playback = 'PLAYING' | 'PAUSED' | 'STOPPED'`; `type ProcessPhase = 'IDLE' | 'SIGNAL' | 'ANALYZING' | 'DELEGATING' | 'EXECUTING' | 'VERIFYING' | 'SUCCESS' | 'ERROR'`; `type QualityPreset = 'ULTRA' | 'BALANCED' | 'LOW' | 'SAFE_2D'` (wspólna definicja już tutaj, zanim użyją jej Tasks 05/09/15).
- Produces: `type DemoEvent` z `schemaVersion: 1`, `eventId: string`, `runId: string`, `sequence: number`, `timeMs: number`, `source: 'demo-simulator'`, `kind: EventKind`, `correlationId?: string` i typowanym `payload`.
- Produces: `normalizeEvent(input: unknown, cursor: EventCursor): NormalizeResult`, gdzie `EventCursor = { runId: string; lastSequence: number; lastTimeMs: number; seenIds: ReadonlySet<string> }`, `NormalizeResult = { ok: true; event: DemoEvent; cursor: EventCursor } | { ok: false; code: 'INVALID_SCHEMA' | 'INVALID_PAYLOAD' | 'DUPLICATE' | 'OUT_OF_ORDER'; cursor: EventCursor }`; odrzucone wejście nie zmienia cursor.

Payload minimum: `signal.detected: { signalId: string }`, `agent.delegated: { agentId: string }`, `tool.started/tool.completed: { toolId: string }`, `verification.started: { checkId: string }`, `task.succeeded: { result: string }`, `task.failed: { reason: string }`; pozostałe kind mają pusty payload. Zdarzenia procesu muszą zawierać niepusty correlationId. W każdym rodzaju ignoruj nieznane pola payload po walidacji lub odrzucaj je — decyzja V1: **odrzucaj**, aby Replay zachował jeden kanoniczny format.

- [ ] **Step 1: Write failing test** — `accepts_valid_event_and_rejects_duplicate_within_run`: pierwszy event jest accepted, ten sam eventId w tym run jest rejected; `accepts_same_event_id_in_new_run`: ten sam eventId w nowym run przechodzi; `rejects_unknown_schema_invalid_payload_and_nonmonotonic_sequence`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/domain/normalizeEvent.test.ts`; oczekuj FAIL dla brakującego API.
- [ ] **Step 3: Implement** — walidator bez efektów ubocznych; stempel błędu z kodem `INVALID_SCHEMA | INVALID_PAYLOAD | DUPLICATE | OUT_OF_ORDER`; input typu unknown, nieufne stringi nie są interpretowane jako HTML.
- [ ] **Step 4: Verify GREEN** — uruchom wskazany test; dodatkowo `npm run build`.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/domain apps/cinematic-engine/tests/domain && git commit -m "feat(cinematic): validate typed demo events"`.

### Task 03: Czysta maszyna stanów procesu i sceny

**Files:**
- Create: `src/domain/reducer.ts`
- Test: `tests/domain/reducer.test.ts`

**Interfaces:**
- Consumes: `DemoEvent`, `Mode`, `SceneId` i `ProcessPhase` z Task 02.
- Produces: `createInitialState(): DomainState`; `reduceEvent(state: DomainState, event: DemoEvent): DomainState`; `applyCommand(state: DomainState, command: DomainCommand): DomainState`.
- `DomainCommand` jest unią dokładnie komend ze specyfikacji z payloadami: `SELECT_SCENE { scene: SceneId }`, `SET_MODE { mode: Mode }`, `START_DEMO_TASK {}`, `TRIGGER_DEMO_FAILURE {}`, `SELECT_AGENT { agentId: string }`, `SET_PLAYBACK_RATE { rate: 0.5 | 1 | 1.5 }`, `PAUSE {}`, `RESUME {}`, `SEEK { timeMs: number }`, `RESET {}`, `REPLAY {}`, `SKIP_INTRO {}`, `SET_QUALITY { quality: QualityPreset }`, `SET_AUDIO_ENABLED { enabled: boolean }`. `DomainState` zawiera `mode`, `scene`, `playback`, `process`, `bootPhase`, `selectedAgentId`, `sceneGeneration` i `lastResult`; preferencje audio/jakości pozostają w DirectorSnapshot. `sceneGeneration` wzrasta przy zmianie sceny/trybu/reset. Niedozwolone przejście pozostawia state bez zmian; diagnostyka jest oddzielna, bez mutacji DomainState.

- [ ] **Step 1: Write failing test** — `follows_processing_fsm`: signal → analysis → delegation → execution → verification → success; `rejects_success_before_verification`; `sets_error_and_allows_reset`; `skip_intro_sets_online_atomically`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/domain/reducer.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — jawna tabela przejść, statyczne stany BOOT (DARK/FORMING/ASSEMBLING/HUD_REVEAL/ONLINE), niezmienne snapshoty i jednoznaczny RESET. Rozdziel domenowy state od parametrów kamery.
- [ ] **Step 4: Verify GREEN** — wskazany test, `npm run build`; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/domain/reducer.ts apps/cinematic-engine/tests/domain/reducer.test.ts && git commit -m "feat(cinematic): model scene and process state machine"`.

### Task 04: Virtual Clock i lifecycle strony

**Files:**
- Create: `src/engine/virtualClock.ts`
- Test: `tests/engine/virtualClock.test.ts`

**Interfaces:**
- Produces: `createVirtualClock(startMs = 0): VirtualClock` z metodami `advance(realDeltaMs: number): number`, `pause(): void`, `resume(): void`, `seek(targetMs: number, maxMs: number): void`, `setRate(rate: 0.5 | 1 | 1.5): void`, `setVisible(visible: boolean): void`, `getTime(): number` oraz `subscribe(listener: () => void): () => void`.
- W V1 `setVisible(false)` zatrzymuje wirtualny czas bez nadrabiania czasu ściennego; `setVisible(true)` resetuje baseline delty. To rozstrzyga zachowanie zakrytej karty, bez ukrytego przeskoku.

- [ ] **Step 1: Write failing test** — `advances_exact_virtual_time_at_each_rate`, `pauses_without_drift`, `visibility_roundtrip_does_not_fast_forward`, `resumes_from_paused_hidden_state_without_catching_up`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/engine/virtualClock.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — walidacja nieujemnych delta, brak bezpośrednich `setTimeout` w warstwach rendererów i izolowany zegar z możliwością podstawienia kontrolowanego źródła czasu.
- [ ] **Step 4: Verify GREEN** — wskazany test; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/engine/virtualClock.ts apps/cinematic-engine/tests/engine/virtualClock.test.ts && git commit -m "feat(cinematic): add synchronized virtual clock"`.

### Task 05: Deterministyczny symulator zdarzeń

**Files:**
- Create: `src/domain/simulator.ts`, `src/domain/scenario.ts`, `src/engine/sceneSchedule.ts`
- Test: `tests/domain/simulator.test.ts`

**Interfaces:**
- Consumes: `DemoEvent`, `Mode`.
- Produces: `buildScenario(options: { runId: string; seed: number; outcome: 'SUCCESS' | 'ERROR' }): RunRecord` (RunRecord to `{ runId, seed, schemaVersion: 1, quality: QualityPreset, events: DemoEvent[] }`).
- Produces: `getAutoSceneAt(timeMs: number): { scene: SceneId; localTimeMs: number; phase: 'SCENE' | 'OUTRO' | 'RESET' }`; granice: 0, 4200, 20200, 32200, 34200, 35000 ms; na 35000 następuje początek nowego run.

- [ ] **Step 1: Write failing test** — `same_seed_produces_same_ordered_events`; `error_outcome_contains_task_failed_but_not_succeeded`; `auto_schedule_totals_35000ms`; `process_events_have_correlation_id`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/domain/simulator.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — generator liczb pseudolosowych zależny od seeda i stabilny scenariusz; nie generuj metryk realnego systemu; eventy procesu mieszczą się w przedziale sceny PROCESSING. Przewidź wyłącznie jeden run aktywny.
- [ ] **Step 4: Verify GREEN** — wskazany test, `npm run build`; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/domain/simulator.ts apps/cinematic-engine/src/domain/scenario.ts apps/cinematic-engine/src/engine/sceneSchedule.ts apps/cinematic-engine/tests/domain/simulator.test.ts && git commit -m "feat(cinematic): generate reproducible demo scenarios"`.

### Task 06: Replay Store, projektowanie do czasu T i seek

**Files:**
- Create: `src/domain/replay.ts`
- Test: `tests/domain/replay.test.ts`

**Interfaces:**
- Consumes: `RunRecord` z Task 05, `DomainState` z Task 03.
- Produces: `projectRun(record: RunRecord, targetTimeMs: number): DomainState`; `createReplayStore(record: RunRecord): ReplayStore` z metodami `seek(timeMs: number): DomainState`, `getEvents(): readonly DemoEvent[]` i `getSeed(): number`.
- Dokładna decyzja: `targetTimeMs` poniżej 0 clamp do 0, powyżej długości run clamp do 35000 dla AUTO lub do końca zapisanych zdarzeń dla INTERACTIVE; obsługuj empty events.

- [ ] **Step 1: Write failing test** — `replay_same_record_has_same_checkpoints`; `seek_outside_bounds_clamps`; `seek_does_not_append_event_or_retrigger_audio`; `empty_log_returns_initial_state`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/domain/replay.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — czysta projekcja od checkpointu/reducera, frozen log, brak renderera i innych skutków ubocznych; seed do późniejszego pozycjonowania cząstek; rewind do dowolnej fazy.
- [ ] **Step 4: Verify GREEN** — wskazany test, `npm run build`; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/domain/replay.ts apps/cinematic-engine/tests/domain/replay.test.ts && git commit -m "feat(cinematic): add deterministic replay and seek"`.

### Task 07: Cinematic Director i cancellation generation

**Files:**
- Create: `src/engine/director.ts`
- Test: `tests/engine/director.test.ts`

**Interfaces:**
- Consumes: `VirtualClock`, `DomainState`, `RunRecord`, `NormalizeResult` i `projectRun`.
- Produces: `createCinematicDirector(deps: { clock: VirtualClock; createRun: typeof buildScenario }): CinematicDirector` z metodami `dispatch(command: DomainCommand): void`, `ingest(input: unknown): void`, `getSnapshot(): DirectorSnapshot`, `subscribe(listener: () => void): () => void` i `dispose(): void`.
- `DirectorSnapshot` zawiera `domain`, `clockMs`, `mode`, `scene`, `sceneGeneration`, `activeRun`, `diagnostics`, `quality` oraz `reducedMotion`; to jedyne źródło prawdy dla renderów.
- Każdy callback o generacji starszej niż current sceneGeneration musi być ignorowany.

- [ ] **Step 1: Write failing test** — `switching_auto_to_interactive_cancels_pending_sequence`; `rapid_auto_interactive_auto_has_one_active_generation`; `invalid_events_only_add_diagnostics`; `skip_intro_is_atomic`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/engine/director.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — Director scala komendy, log i zegar; obsługuje switch, reset i cleanup; przejścia domenowe i pakiety cue (z Task 11) są publikowane przez subskrypcję bez podwójnych źródeł stanu.
- [ ] **Step 4: Verify GREEN** — wskazany test + pełne testy domain; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/engine/director.ts apps/cinematic-engine/tests/engine/director.test.ts && git commit -m "feat(cinematic): orchestrate scenes with cancellation"`.

### Task 08: React shell, controller hook i kontrolki stanu

**Files:**
- Modify: `src/App.tsx`
- Create: `src/hooks/useDirectorSnapshot.ts`, `src/styles/layout.css`
- Test: `tests/components/App.test.tsx`

**Interfaces:**
- Consumes: `CinematicDirector` z Task 07.
- Produces: `useDirectorSnapshot(director: CinematicDirector): DirectorSnapshot`, oparty o `useSyncExternalStore`; `<App />` z widocznym przełącznikiem scen/trybu, START, PAUSE, RESET, SKIP INTRO, presetem jakości i etykietą DEMO.

- [ ] **Step 1: Write failing test** — `scene_controls_dispatch_valid_commands`, `shows_current_mode_scene_and_demo_badge`, `changing_modes_updates_app_without_stale_ui`, `keyboard_controls_have_names`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/components/App.test.tsx`; oczekuj FAIL.
- [ ] **Step 3: Implement** — mount/dispose Director w pojedynczym komponencie głównym, semantyczne button/aria, bez dekoracyjnych fałszywych przycisków; w tym kroku renderer może pozostać prostym wizualnym placeholderem 2D, ale wszystkie kontrolki działają.
- [ ] **Step 4: Verify GREEN** — test komponentu, `npm run build`; oczekuj PASS.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/App.tsx apps/cinematic-engine/src/hooks/useDirectorSnapshot.ts apps/cinematic-engine/src/styles/layout.css apps/cinematic-engine/tests/components/App.test.tsx && git commit -m "feat(cinematic): add reactive app shell and controls"`.

### Task 09: Jedno WebGL canvas i podstawowe warstwy L0–L3

**Files:**
- Create: `src/scene/SceneHost.tsx`, `src/scene/SafeCore2D.tsx`
- Create: `src/scene/layers/VoidLayer.tsx`, `AtmosphereLayer.tsx`, `ReactorLayer.tsx`, `OrbitalMeshLayer.tsx`
- Test: `tests/components/SceneHost.test.tsx`

**Interfaces:**
- Produces: `<SceneHost snapshot={DirectorSnapshot} quality={QualityPreset} onContextLost={(): void} />`; `<SafeCore2D snapshot={DirectorSnapshot} />`, `<ReactorLayer phase={ProcessPhase} timeMs={number} />`.
- Warstwa L0 renderowana w CSS poza Canvas; L1–L3 wewnątrz jedynego R3F Canvas. Cztery pierścienie geometryczne o odrębnych rotacjach są komponentem L3; do finalnego wyglądu dopracować geometryczne segmenty i radial ticks.

- [ ] **Step 1: Write failing test** — `shows_safe_2d_when_renderer_unavailable`; `only_creates_one_canvas` (komponentowy stub R3F); `safe_core_shows_current_state`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/components/SceneHost.test.tsx`; oczekuj FAIL.
- [ ] **Step 3: Implement** — jeden R3F renderer, czyste światło emisyjne rdzenia, radialne obręcze i kontrolowane poziomy intensywności; nie dodawaj postprocessingu do HUD ani drugiego kontekstu GL.
- [ ] **Step 4: Verify GREEN** — test + `npm run build`; ręczny podgląd sceny w przeglądarce jako uzupełnienie, nie zamiast testów.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/scene apps/cinematic-engine/tests/components/SceneHost.test.tsx && git commit -m "feat(cinematic): create layered 3D reactor stage"`.

### Task 10: Warstwy sygnałów L4–L7 i efekt L9

**Files:**
- Create: `src/scene/layers/EnergyLayer.tsx`, `ParticleLayer.tsx`, `ScannerLayer.tsx`, `HologramLayer.tsx`, `CinematicEffects.tsx`, `sceneTypes.ts`
- Test: `tests/components/SceneHost.test.tsx` (rozszerzyć)

**Interfaces:**
- Consumes: `DirectorSnapshot`, `timeMs`, `seed`, `quality`.
- Produces: semantyczne rendering props: `<EnergyLayer signals={readonly VisualSignal[]} timeMs={number} />`, `<ParticleLayer seed={number} timeMs={number} count={number} />`, `<ScannerLayer scanState={ScanState} timeMs={number} />`, `<HologramLayer agents={readonly DemoAgent[]} selectedAgentId={string | null} />`, `<CinematicEffects enabled={boolean} />`.
- `VisualSignal = { id: string; sourceAgentId: string; targetAgentId: string; startMs: number; endMs: number }` i `DemoAgent = { id: string; label: string; linkedAgentIds: readonly string[] }` są typami prezentacyjnymi zadeklarowanymi w `src/scene/layers/sceneTypes.ts`, wyliczanymi deterministycznie ze zdarzeń bez mutacji domeny.

- [ ] **Step 1: Write failing test** — `signal_event_enables_energy_trace_and_scan_cue`; `same_seed_has_same_particle_positions` (test generatora danych cząstek); `selected_agent_only_highlights_related_edges`; `postprocessing_is_not_applied_to_dom`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/components/SceneHost.test.tsx`; oczekuj FAIL.
- [ ] **Step 3: Implement** — instancing i bufory dla cząstek; kontrolowany bloom selektywny (tylko obiekty 3D); fallback prostych shaderów przy LOW; ograniczona liczba cząstek określona przez Task 15.
- [ ] **Step 4: Verify GREEN** — test komponentu, `npm run build`; w przeglądarce potwierdź, że L8 nie jest rozmyte.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/scene/layers apps/cinematic-engine/tests/components/SceneHost.test.tsx && git commit -m "feat(cinematic): render signals particles holograms and effects"`.

### Task 11: Choreografia Motion Engine i CameraRig

**Files:**
- Create: `src/engine/cues.ts`, `src/engine/motionDirector.ts`, `src/scene/CameraRig.tsx`
- Test: `tests/engine/cues.test.ts`, `tests/engine/motionDirector.test.ts`

**Interfaces:**
- Produces: `deriveMotionCues(prev: DirectorSnapshot, next: DirectorSnapshot): readonly MotionCue[]`; `createMotionDirector(adapter: MotionAdapter): MotionDirector` z `seek(timeMs: number): void`, `setPaused(paused: boolean): void`, `setRate(rate: 0.5 | 1 | 1.5): void`, `cancelGeneration(sceneGeneration: number): void`.
- `MotionCue` ma `id, sceneGeneration, startMs, durationMs, layer, token` i serializowalne parametry. Typ `MotionAdapter` umożliwia przetestowanie bez prawdziwego GSAP.
- Tokeny i czasy z sekcji 11 specyfikacji, m.in. micro.confirm 120–200 ms, hud.materialize 300–550 ms, line.trace 350–650 ms, radar.ping 500–900 ms, energy.charge 800–1400 ms, scene.transition 900–1500 ms.

- [ ] **Step 1: Write failing test** — `one_signal_event_maps_to_radar_and_core_cues`; `pause_freezes_camera_shader_and_timeline`; `cancel_generation_disposes_old_cues`; `reduced_motion_replaces_zoom_glitch_and_bursts`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/engine/cues.test.ts tests/engine/motionDirector.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — GSAP jako adapter odtwarzający parametry z Virtual Clock, kamera używa czasu scenicznego; żadnych lokalnych timerów w R3F i widgetach. Kulminacja to zsynchronizowane zgranie orbit, konwergencja, światło, impuls HUD i cisza końcowa.
- [ ] **Step 4: Verify GREEN** — wskazane testy, `npm run build`; ręcznie potwierdź miękki ruch, brak ciągłego glitchu.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/engine/cues.ts apps/cinematic-engine/src/engine/motionDirector.ts apps/cinematic-engine/src/scene/CameraRig.tsx apps/cinematic-engine/tests/engine && git commit -m "feat(cinematic): synchronize camera and motion choreography"`.

### Task 12: L8 — osiem modułów HUD, Agent Graph i telemetria DEMO

**Files:**
- Create: `src/hud/HudShell.tsx`
- Create: `src/hud/modules/ReactorInspector.tsx`, `RadarScanner.tsx`, `AgentGraph.tsx`, `Telemetry.tsx`, `ProcessLog.tsx`, `SignalDiagnostics.tsx`, `MotionControls.tsx`, `TimelineReplay.tsx`
- Test: `tests/components/HudShell.test.tsx`

**Interfaces:**
- Produces: `<HudShell snapshot={DirectorSnapshot} dispatch={(command: DomainCommand): void => void} />`.
- Wspólny contract: moduł może pokazywać snapshot i wywoływać `dispatch`, ale nie zmienia stanu procesu bezpośrednio. Agent Graph otrzymuje demo agents i relacje z rekordów `agent.delegated`. Process Log wyświetla wpisy z activeRun, Replay używa `SEEK` i `REPLAY`.

- [ ] **Step 1: Write failing test** — `renders_eight_named_modules`; `all_simulated_metrics_are_labeled_demo`; `real_fps_is_separate`; `agent_click_dispatches_select_agent`; `timeline_seek_dispatches_seek`; `log_displays_failure_reason_as_text`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/components/HudShell.test.tsx`; oczekuj FAIL.
- [ ] **Step 3: Implement** — osiem paneli o jednym stylu; typografia liczbowa, aria labels, intuicyjne show/hide, wykresy odtwarzane z event logu. Zakaz prezentowania fikcyjnego CPU, tokenów lub ceny jako prawdziwe dane.
- [ ] **Step 4: Verify GREEN** — test komponentu, `npm run build`; ręczne sprawdzenie czytelności paneli i braku nałożenia glow na tekst.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/hud apps/cinematic-engine/tests/components/HudShell.test.tsx && git commit -m "feat(cinematic): add eight responsive demo HUD modules"`.

### Task 13: Sceny i AUTO SHOWCASE / INTERACTIVE end to end

**Files:**
- Modify: `src/App.tsx`, `src/engine/sceneSchedule.ts`, `src/engine/director.ts`
- Create: `tests/e2e/showcase.spec.ts`, `tests/e2e/interactive.spec.ts`, `playwright.config.ts`
- Modify: `package.json` (`test:e2e` już z Task 01)

**Interfaces:**
- Consumes: `SceneHost`, `HudShell`, `getAutoSceneAt`, `CinematicDirector`.
- Produces: pełny przebieg BOOT → PROCESSING → COMMAND → OUTRO → RESET oraz nawigację ręczną w INTERACTIVE. Stage oznaczony w DOM przez `data-scene`, `data-mode`, `data-phase` i napis statusu, testowalny bez porównywania pikseli.

- [ ] **Step 1: Write failing E2E tests** — `showcase_reaches_online_at_4200ms` (AC-01), `auto_runs_all_sections_in_35000ms` (AC-03), `skip_intro_does_not_leave_stale_cues` (AC-02), `interactive_switch_stops_auto_schedule` (AC-04), `success_and_error_paths_are_visible` (AC-05/06).
- [ ] **Step 2: Verify RED** — `npm run test:e2e -- tests/e2e/showcase.spec.ts tests/e2e/interactive.spec.ts`; oczekuj FAIL, a runner korzysta ze skonfigurowanego Playwright webServer Vite.
- [ ] **Step 3: Implement** — obsługa własnych checkpointów czasu, odtwarzania i przejść, keyboard/touch UI. Przy testach kontroluj Virtual Clock przez jawny test harness; nie opieraj stabilności E2E na rzeczywistym czekaniu 35 sekund. Test harness tylko w trybie testowym, bez publicznego API produkcyjnego.
- [ ] **Step 4: Verify GREEN** — wskazane E2E oraz `npm run build`; sprawdź terminalne kadry każdej sceny, w tym OUTRO.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine && git commit -m "feat(cinematic): connect three demo scenes and showcase mode"`.

### Task 14: Audio Director

**Files:**
- Create: `src/engine/audioDirector.ts`
- Test: `tests/engine/audioDirector.test.ts`

**Interfaces:**
- Produces: `createAudioDirector(adapter: AudioAdapter): AudioDirector` z `enableFromGesture(): Promise<boolean>`, `setMuted(muted: boolean): void`, `sync(timeMs: number, paused: boolean, sceneGeneration: number): void`, `seek(timeMs: number): void` i `dispose(): void`.
- AudioAdapter ukrywa Web Audio; testy używają fake adapter, więc nie wymagają urządzenia dźwiękowego.

- [ ] **Step 1: Write failing test** — `defaults_to_muted`; `autoplay_denial_does_not_throw_or_block`; `pause_mutes_scheduled_cues`; `seek_does_not_replay_past_success_chime`; `hidden_tab_resume_does_not_play_stale_cue`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/engine/audioDirector.test.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — jedynie krótkie lokalne cue + ambient; synchronizacja z Clock, gesture-gated audio, cisza przy błędzie. Brak nowych komunikatów domenowych generowanych przez audio.
- [ ] **Step 4: Verify GREEN** — test, `npm run build`; ręcznie przetestuj mute, pauzę i odblokowanie audio.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/engine/audioDirector.ts apps/cinematic-engine/tests/engine/audioDirector.test.ts && git commit -m "feat(cinematic): add optional synchronized audio"`.

### Task 15: Quality Governor i awaryjne SAFE 2D

**Files:**
- Create: `src/engine/qualityGovernor.ts`
- Modify: `src/scene/SceneHost.tsx`, `src/scene/SafeCore2D.tsx`
- Test: `tests/engine/qualityGovernor.test.ts`, `tests/e2e/recovery.spec.ts`

**Interfaces:**
- Consumes: `QualityPreset` z `src/domain/types.ts` (Task 02).
- Produces: `createQualityGovernor(): QualityGovernor` z `ingestFrameTime(frameMs: number): QualityPreset`, `setManualPreset(preset: QualityPreset): void`, `onContextLost(): void`, `getPreset(): QualityPreset`.
- Przykładowe domyślne budżety do walidacji na urządzeniu: ULTRA ~15k, BALANCED ~5k, LOW ~1k cząstek; typowe wartości orientacyjne, w realizacji utrwala je stała `PARTICLE_BUDGET`. Semantyka sygnałów nie zależy od budżetu.

- [ ] **Step 1: Write failing tests** — `single_long_frame_does_not_downgrade`; `sustained_low_fps_downgrades`; `quality_change_preserves_state`; E2E `webgl_context_loss_while_processing_falls_back_to_2d_and_keeps_pause_reset_working`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/engine/qualityGovernor.test.ts` i `npm run test:e2e -- tests/e2e/recovery.spec.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — hysteresis i uśrednianie klatek, DPR <= 2, pojedynczy renderer, bezwzględny fallback po nieudanym utworzeniu lub utracie WebGL; stabilny stan UI i nadal działające komendy.
- [ ] **Step 4: Verify GREEN** — wskazane testy + `npm run build`; potwierdź SAFE 2D na symulowanej awarii.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src/engine/qualityGovernor.ts apps/cinematic-engine/src/scene apps/cinematic-engine/tests && git commit -m "feat(cinematic): adapt visual quality and recover from GPU failure"`.

### Task 16: Responsywność, reduced motion i dostępność

**Files:**
- Create: `src/hooks/useReducedMotion.ts`, `tests/components/accessibility.test.tsx`, `tests/e2e/mobile.spec.ts`
- Modify: `src/styles/layout.css`, `src/styles/tokens.css`, `src/hud/HudShell.tsx`, `src/App.tsx`

**Interfaces:**
- Produces: `useReducedMotion(): boolean` respektujący `matchMedia('(prefers-reduced-motion: reduce)')` od pierwszego renderu, możliwość jawnej zmiany w Motion Controls; layout paneli jeden rozwinięty na mobile, pełna funkcjonalność sterowania.
- Aplikacja zapewnia semantyczne nazwy, fokus widoczny, status w tekście, pointer-safe dekoracje i odpowiedniki dla hover.

- [ ] **Step 1: Write failing tests** — `reduced_motion_starts_without_camera_swoop`; `controls_have_accessible_names_and_focus`; E2E `mobile_390_has_no_document_horizontal_overflow`; `mobile_320_has_all_primary_controls`; `touch_can_select_agent_without_hover`.
- [ ] **Step 2: Verify RED** — `npm run test:run -- tests/components/accessibility.test.tsx` i `npm run test:e2e -- tests/e2e/mobile.spec.ts`; oczekuj FAIL.
- [ ] **Step 3: Implement** — mobile bottom sheet / tabs, min-width 320, obszary dotyku, accessible live status; usunięcie ciężkich efektów dla reduced motion przed pierwszą klatką, ograniczenie dekoracji spod klikalnych elementów.
- [ ] **Step 4: Verify GREEN** — wskazane testy + `npm run build`; ręczna kontrola klawiaturą, dotykiem i screenreader-friendly struktury.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine/src apps/cinematic-engine/tests && git commit -m "feat(cinematic): ensure mobile and accessible cinematic controls"`.

### Task 17: Final QA, kompletna walidacja AC-01…AC-20 i instrukcja demo

**Files:**
- Modify: `README.md`, `playwright.config.ts`, `tests/e2e/showcase.spec.ts`, `interactive.spec.ts`, `mobile.spec.ts`, `recovery.spec.ts`
- Modify: `package.json` (tylko lokalny projekt aplikacji)

**Interfaces:**
- Produces: gotowa demonstracja uruchamiana z katalogu `apps/cinematic-engine` przez `npm ci && npm run dev`; testy przez `npm run test:run`, `npm run test:e2e` i `npm run build`.

- [ ] **Step 1: Write failing QA tests** — `app_has_no_jarvis_api_dependency` (AC-20, użyj wyłączonej sieci w E2E), `all_modes_scenes_have_demo_labels` (AC-17), `hidden_tab_stops_render_and_does_not_catch_up` (AC-18), `replay_controls_work_by_keyboard` (AC-19), `error_logs_are_safe_text`.
- [ ] **Step 2: Verify RED** — `npm run test:e2e`; oczekuj FAIL tylko dla nowych wymagań zanim poprawisz brakujące zachowania.
- [ ] **Step 3: Implement QA fixes + docs** — napraw realne luki wykazane testami, uzupełnij README o wymagania, uruchomienie, klawisze, tryby jakości, tryb demo, ograniczenia braku integracji oraz listę AC; nie zmieniaj funkcjonalności poza zatwierdzoną specyfikacją.
- [ ] **Step 4: Verify GREEN** — `npm ci && npm run test:run && npm run build && npm run test:e2e`; oczekuj PASS wszystkich komend. Dodatkowo ręcznie potwierdź wygląd i działanie na desktopie 1440×900 oraz telefonie 390×844, z reduced motion i wymuszonym SAFE 2D. Jeżeli test nie przechodzi, nie deklaruj ukończenia.
- [ ] **Step 5: Commit** — `git add apps/cinematic-engine && git commit -m "test(cinematic): complete cinematic demo acceptance coverage"`.

## 3. Matryca wymagań specyfikacji ↔ zadania

| Wymagania | Zadania | Dowód |
|---|---|---|
| Niezależna aplikacja / AC-20 | 01, 17 | build offline, brak API |
| Event schema / AC-07, AC-08 | 02 | normalizeEvent tests |
| Proces sukces/błąd / AC-05, AC-06 | 03, 05, 12, 13 | reducer + E2E |
| Spójny czas / AC-10, AC-18 | 04, 11, 14, 17 | clock + motion + visibility tests |
| 35s AUTO / AC-03 | 05, 13 | sceneSchedule + E2E |
| Replay / AC-09, AC-11 | 06, 12, 13 | seeded projection + seek tests |
| Przełączenia / AC-02, AC-04, AC-12 | 07, 11, 13 | Director cancellation + E2E |
| L0–L3, Core i render | 09 | render + shader smoke |
| L4–L7, L9, hologramy | 10 | visual state tests |
| L8 / 8 HUD modułów / AC-17 | 12 | HUD test + real/simulated label |
| BOOT + 3 sceny / AC-01 | 11, 13 | timeline E2E |
| Audio / AC-14 | 14 | denied autoplay test |
| Performance i SAFE 2D / AC-15 | 15 | recovery E2E |
| Mobile/reduced motion/keyboard / AC-13,16,19 | 16, 17 | tests + manual review |

## 4. Procedura realizacji i review gates

1. Po zatwierdzeniu planu wybierz **Subagent-driven** lub **Native**. Na start wykonania utwórz osobną gałąź `experiment/cinematic-engine` z odizolowanym worktree (Superpowers using-git-worktrees); nie rozwijaj aplikacji na gałęzi dokumentacji ani na main.
2. Realizuj kolejno Tasks 01–17. Nie łącz bez testu kilku niezależnych zmian w jeden commit.
3. Po każdym zadaniu zachowaj dowód RED i GREEN, zapis commit SHA oraz wynik `npm run build` tam, gdzie wskazano.
4. Po milestone A/B zweryfikuj reducer, zegar i Replay bez przeglądarki. Po C/D porównaj obraz z referencjami i odbierz decyzję wizualną, ale nie pomijaj testów.
5. Przy każdym błędzie logiki wykonawca zatrzymuje kolejny task i przeprowadza systematic-debugging zamiast maskowania błędów.
6. Przed uznaniem ukończenia poproś o code review (superpowers requesting-code-review) i uruchom verification-before-completion. Nie deklaruj PASS z samego planu.
7. Finalny wynik: osobna, uruchamialna aplikacja, testy, README, brak zmian w obecnym Jarvis main. Integracja z Jarvis OS to późniejszy, odrębnie projektowany etap.

## 5. Self-review planu (stan dokumentu, nie status implementacji)

- **Pokrycie:** wszystkie 20 kryteriów AC powiązano z właścicielskimi zadaniami; 10 warstw, 3 sceny, 8 modułów, 2 tryby i Replay mają osobne punkty realizacji.
- **Kontrakty:** Event → Reducer → Replay/Director → Snapshot → Cue → Renderer/HUD/Audio. Te same nazwy i wymiary stanu występują w kolejnych zadaniach.
- **Granularność:** każde zadanie ma konkretny plik testu, przykładowe asercje, polecenie RED, ścieżki implementacyjne, GREEN i commit.
- **Five review risks:** są przypisane do Task 02, 04, 06, 07, 14 i 15.
- **Izolacja:** brak modyfikacji dotychczasowego Jarvis OS oraz plików jego builda/deploy.
- **Ryzyko:** wydajność rzeczywistych shaderów, GPU context loss i jakości artystycznej wymagają także ręcznego, wizualnego review; sam Vitest nie dowodzi jakości filmowej.

**Status:** PLAN DO PRZEGLĄDU I ZATWIERDZENIA UŻYTKOWNIKA. **ŻADNE ZADANIE IMPLEMENTACYJNE NIE ZOSTAŁO ROZPOCZĘTE.**
