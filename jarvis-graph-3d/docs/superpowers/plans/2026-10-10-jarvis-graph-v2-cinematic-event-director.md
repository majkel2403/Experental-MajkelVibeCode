# Jarvis Graph v2 — Cinematic Event Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visualize verified Jarvis activity as deduplicated, bounded, accessible 3D cues without stealing camera control, losing important state or mistaking decorative DEMO motion for live work.

**Architecture:** A pure VisualCue mapper reads authenticated, authorized, deduplicated events together with the committed viewer GraphSnapshot and produces ephemeral effects. A budgeted cue scheduler and separate CameraDirector feed the existing ForceGraph3D/Three.js presentation layer; neither can mutate Graph Store, ingest events or perform Bridge commands.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 3, react-force-graph-3d 1.29 range (verify locked version), Three.js 0.180 range, Vite 7; future Playwright browser tests after Foundation. Avoid new shader/dependency until benchmark evidence.

**Spec:** `docs/graph-v2/blueprint/13-cinematic-event-director-design.md`, `04-interaction-semantic-zoom.md`, `05-visual-performance-bible.md`, `03-event-bus-protocol.md`, `14-unified-system-design-review.md`.

## Global Constraints

- This is **PLAN DOCUMENTATION ONLY**. Not permission to modify any source, install dependencies, run runtime tools, connect Hermes/Jev/Bridge, deploy or merge into `main`.
- This plan depends on an approved canonical `JarvisEventV1` and authorized `GraphSnapshot`, plus the existing Galaxy Foundation/Galaxy phase.
- Event stream is not the scene state: Director can only animate accepted event identity once per configured playback scope. It never fabricates activity or authoritative status.
- `LIVE` status requires a real authenticated transport and non-stale snapshot, not a looping route in `App.tsx`. DEMO fixtures must have a persistent visible label.
- No forced camera takeover for background events. User drag/wheel/Esc overrides FOLLOW LIVE and animations immediately.
- Separate `PAUSE EVENTS`, `FREEZE SCENE` and `REPLAY` semantics. Pausing cue playback must not discard P0/P1 durable delivery.
- Reduced motion is an information-equivalent static state: warnings, progress and evidence remain readable.
- Cues target only entities/relations allowed by viewer scope. Do not animate hidden unauthorized nodes, paths or aggregates.
- Visual profiles and durations are proposed, must be measured; GPU resource cleanup and hard particle budget mandatory.

## Review Focus

1. **Duplicate tool event after reconnect:** one LIVE particle, not a repeated successful action; Task 2/Task 5.
2. **Accepted event with no graph topology change:** still may show one permitted status cue; Task 2.
3. **Approval alert arrives during 1000 decorative updates:** warning visible, queue bounded; Task 3.
4. **User interrupts FOLLOW LIVE while animation callback is pending:** never snap back to old target; Task 4.
5. **Reduced-motion/mobile/hidden document:** equivalent static cues, no uncontrolled GPU growth; Task 6.

## Planned source ownership

| Planned file | Responsibility |
|---|---|
| `graph-3d/src/cinematic/types.ts` | VisualCue, CueMode, DirectorProfile, playback and priority types |
| `graph-3d/src/cinematic/mapEventToCue.ts` | Accepted event → permitted semantic cue; no graph writes |
| `graph-3d/src/cinematic/cueScheduler.ts` | Event ID dedupe, bounded scheduling and coalescing |
| `graph-3d/src/cinematic/cameraPolicy.ts` | User override / FOLLOW LIVE state machine |
| `graph-3d/src/cinematic/playbackPolicy.ts` | Pause, freeze, replay and cursor semantics |
| `graph-3d/src/cinematic/CinematicDirector.tsx` | Integration with event stream, ViewStore and Galaxy props |
| `graph-3d/src/galaxy/GalaxyScene.tsx` | Only visualization of accepted cues / particles |
| `graph-3d/src/galaxy/objects.ts` | Shared resources if required by validated profile |
| `graph-3d/src/cinematic/*.test.ts` | RED/GREEN source and scheduling tests |
| `graph-3d/e2e/cinematic-director.spec.ts` | Camera, pause, accessibility and screenshot acceptance |

Future interface candidates (ratify in contract review):
```ts
type CueMode = 'DEMO'|'LIVE'|'REPLAY';
type CueKind = 'node-appear'|'pulse'|'edge-travel'|'warning'|'success'|'stale'|'none';
type CuePriority = 'critical'|'meaningful'|'ambient';
interface VisualCue {
  cueId: string; kind: CueKind; priority: CuePriority; mode: CueMode;
  eventSource: string; eventId: string; entityIds: readonly string[];
  edgeId?: string; evidenceRef?: string;
  durationMs: number; occurredAt: string;
}
interface DirectorProfile {
  maxParticles: number; maxConcurrentCues: number;
  reducedMotion: boolean; visualTier: 'high'|'medium'|'low';
}
type PlaybackState = 'PLAYING'|'PAUSED'|'FROZEN'|'REPLAYING'|'STALE';
```

`VisualCue.cueId` should be derived from `source+id+cueKind` (plus authorized replay mode/epoch when relevant) rather than random object creation; network retries don't change event ID.

---

### Task 1: VisualCue contracts, event identity and scene fixtures

**Files:**
- Create: `graph-3d/src/cinematic/types.ts`, `graph-3d/src/cinematic/fixtureEvents.ts`.
- Test: `graph-3d/src/cinematic/types.test.ts`.
- Consumes: approved `JarvisEventV1` and `GraphSnapshot`.
- Produces: `VisualCue` and `DirectorProfile` contracts plus deterministic DEMO trace.

- [ ] **Step 1: Write failing tests** `cue_contract_rejects_unknown_event_source`, `cue_identity_is_stable_for_same_event`, `demo_event_labels_cannot_be_live`, `missing_timestamp_is_rejected`. Assert that the same `(source,id,kind)` produces the same cue ID and fixture has no privileged payload.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/cinematic/types.test.ts` from `graph-3d/`.
- [ ] **Step 3: Implement** `makeCueId(source: string, eventId: string, kind: CueKind): string` and bounded validation of `VisualCue`. Keep visual state separate from event schema.
- [ ] **Step 4: Confirm GREEN:** rerun tests, expected PASS.
- [ ] **Step 5: Commit** types, fixtures and tests as `feat(graph): define event-driven cinematic cues`.

### Task 2: Accepted-event-to-cue mapping with evidence and authorization

**Files:**
- Create: `graph-3d/src/cinematic/mapEventToCue.ts`.
- Test: `graph-3d/src/cinematic/mapEventToCue.test.ts`.
- Consumes: authenticated/deduplicated viewer-safe `JarvisEventV1`, snapshot/version, authorized entity IDs and an explicit trusted receipt classification.
- Produces: `mapEventToCues(event: JarvisEventV1, snapshot: Readonly<GraphSnapshot>, mode: CueMode): readonly VisualCue[]`.

- [ ] **Step 1: Write failing tests** `task_created_emits_node_appear`, `tool_started_emits_one_edge_travel_only_if_allowed`, `success_requires_authoritative_tool_receipt`, `accepted_status_event_with_no_graph_patch_can_pulse`, `hidden_entity_does_not_emit_ghost_node` and `unknown_event_type_is_no_op`. Use synthetic trusted/rejected input fixtures with verified source flags.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/cinematic/mapEventToCue.test.ts`.
- [ ] **Step 3: Implement** pure mapping. It MUST NOT treat incoming unverified `data.outcome='succeeded'` as a trusted receipt. Normalize producer meaning upstream, and only react to accepted authorized evidence. No graph mutations or layout reheat for mere pulse.
- [ ] **Step 4: Confirm GREEN:** same test command, expected PASS.
- [ ] **Step 5: Commit** mapper and tests as `feat(graph): map real semantic events to visual cues`.

### Task 3: Bounded scheduler, priority and backpressure

**Files:**
- Create: `graph-3d/src/cinematic/cueScheduler.ts`.
- Test: `graph-3d/src/cinematic/cueScheduler.test.ts`.
- Consumes: `VisualCue` and `DirectorProfile`.
- Produces: `createCueScheduler(profile: DirectorProfile): { enqueue(cue: VisualCue): boolean; drain(nowMs: number): VisualCue[]; clear(): void }`.

- [ ] **Step 1: Write failing tests** `dedupes_100_identical_event_cues`, `approval_warning_survives_1000_ambient_updates`, `particle_budget_never_exceeded`, `expired_cue_never_resurfaces_as_live`. Example: profile `maxParticles=32` never yields more than 32 simultaneous `edge-travel` animations, while critical warning remains readable.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/cinematic/cueScheduler.test.ts`.
- [ ] **Step 3: Implement** bounded queues separated by priority, deterministic dedupe and optional coalescing for ambient; keep domain event durability in Event Log, not cue queue. Return visible warning state when animations are dropped.
- [ ] **Step 4: Confirm GREEN:** rerun tests and verify stable memory for a 1000-cue fixture.
- [ ] **Step 5: Commit** scheduler/test as `feat(graph): bound cinematic event scheduling`.

### Task 4: Camera policy and interruption

**Files:**
- Create: `graph-3d/src/cinematic/cameraPolicy.ts`.
- Test: `graph-3d/src/cinematic/cameraPolicy.test.ts`.
- Consumes: ViewStore camera focus/selection, explicit FOLLOW LIVE toggle, correlated event target.
- Produces: `reduceCameraIntent(state: CameraDirectorState, input: CameraIntent): CameraDirectorState` with monotonically increasing request ID.

- [ ] **Step 1: Write failing tests** `background_events_never_move_manual_camera`, `follow_moves_only_for_selected_correlation`, `manual_wheel_aborts_pending_flight`, `late_completion_callback_cannot_reassert_old_focus` and `reduced_motion_focus_is_instant`.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/cinematic/cameraPolicy.test.ts`.
- [ ] **Step 3: Implement** explicit overview/manual/focusing/follow states, cancel-safe request revisions and timeout-independent completion checks. Do not override manual drag, pinch or Esc.
- [ ] **Step 4: Confirm GREEN:** same command, PASS required.
- [ ] **Step 5: Commit** camera policy and tests as `feat(graph): protect camera from unsolicited cinematic takeover`.

### Task 5: PAUSE, FREEZE, REPLAY and cursor policy

**Files:**
- Create: `graph-3d/src/cinematic/playbackPolicy.ts`.
- Test: `graph-3d/src/cinematic/playbackPolicy.test.ts`.
- Consumes: `PlaybackState`, authorized replay cursor, event mode, viewer snapshot freshness.
- Produces: `reducePlayback(state: PlaybackStateData, action: PlaybackAction): PlaybackStateData`, with explicit resume/resync instruction.

- [ ] **Step 1: Write failing tests** `pause_stops_cues_not_graph_selection`, `freeze_is_not_disconnect`, `replay_is_read_only`, `resume_from_expired_cursor_requires_snapshot`, `live_duplicate_not_reanimated_after_reconnect`.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/cinematic/playbackPolicy.test.ts`.
- [ ] **Step 3: Implement** independent transport/cue/rendering state. PAUSE buffers or replays display cues using a documented policy, without dropping critical source events; FREEZE suspends visual physics only; REPLAY never calls live command API.
- [ ] **Step 4: Confirm GREEN:** same test command; assert no duplicate fresh LIVE cues.
- [ ] **Step 5: Commit** playback reducer/test as `feat(graph): separate playback freeze and replay lifecycle`.

### Task 6: Safe renderer integration and cinematic/browser verification

**Files:**
- Create: `graph-3d/src/cinematic/CinematicDirector.tsx`.
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`, `graph-3d/src/App.tsx`, optional `graph-3d/src/galaxy/objects.ts` only if ownership tests justify.
- Test: `graph-3d/e2e/cinematic-director.spec.ts`.
- Report (future only): `docs/superpowers/reports/2026-10-10-graph-v2-cinematic-verification.md`.
- Consumes: Tasks 1–5, approved live or DEMO fixture, GraphSnapshot, VisualCue profile, shared ViewStore.
- Produces: a working, *future* 3D presentation of event cues, responsive and accessible with test evidence.

- [ ] **Step 1: Write failing browser tests** `actual_demonstration_is_labelled_demo`, `one_verified_event_one_particle`, `camera_manual_override_wins`, `pause_keeps_orbit_and_inspector`, `critical_warning_not_hidden_by_ambient`, `reduced_motion_has_textual_equivalent`, `missing_webgl_shows_readable_fallback`, `20_mount_unmount_cycles_release_resources`.
- [ ] **Step 2: Confirm RED:** after Foundation installs and pins browser tooling, `npx playwright test e2e/cinematic-director.spec.ts`.
- [ ] **Step 3: Implement** adapter from cue queue to existing `react-force-graph-3d` `emitParticle(link)` with source-to-visual relation lookup and robust hidden/missing link fallback. Prioritize pooled/shared GPU resources and no force reheat from mere color effects.
- [ ] **Step 4: Confirm GREEN:** `npm test`, `npm run typecheck`, `npm run build` and future Playwright tests with screenshots at desktop 1440×900, mobile 390×844 and reduced-motion. Record frame timings, capped particle count and `renderer.info` trends; never claim tests were run while drafting.
- [ ] **Step 5: Commit** the renderer integration/tests and a truthful verification report as `feat(graph): present verified cinematic activity safely`.

## Graph Playground visual calibration (optional after functional gate)

Use the existing `07-graph-playground-spec.md` design. Benchmarks compare DEMO trace A/B for event delay, particle length, Bloom, label clutter, 289/500/2000 graph sizes and visual quality modes. Adopt a preset only after demonstrating event cue legibility, reduced motion and sustained interaction. No speculative shader rewrite before performance results.

## Acceptance and STOP conditions

PASS for DEMO: deterministic fixture, visible DEMO status, no duplicate cues, stable camera, bounded particles and accessible text. REAL-LIVE PASS requires separately authorized, validated source event + Bridge outcome receipt and compatible viewer GraphSnapshot with fresh cursor. Missing source/receipt, duplicate playback, leak of private relation counts, automatic tool commands, fake LIVE label or uncontrolled camera motion block acceptance. Never merge into either `main` or deploy without separate explicit approval.

**Plan status:** Written planning instructions only, not run. No executable changes follow merely from saving this file.
