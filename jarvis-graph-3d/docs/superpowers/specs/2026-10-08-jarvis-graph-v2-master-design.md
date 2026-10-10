# Jarvis Graph OS v2.0 — Master Design Specification

Date: 2026-10-08
Status: Proposed / planning only. No implementation authorized by this document.
Historical baseline: `Jarvis-` branch `feat/jarvis-graph-3d` (later moved to `majkel2403/Experental-MajkelVibeCode/jarvis-graph-3d`).
Current docs-only branch: `docs/jarvis-graph-v2-mission-brain-motion` in the experimental repository.
Review status: unified design 14/15 proposed; future execution plans below are NOT authorized to run.
Existing independent app: `graph-3d/`
Existing preview deployment: `dpl_HWC8amTbLXgsHpMW5SLrqfo4Wmui`, READY. Visual/browser verification of this build is NOT established.
Root `main` must not be changed, merged, or deployed.

## Product promise

Jarvis Graph OS is an evidence-backed spatial interface to the AI operating system: exploration from whole universe -> cluster -> team/agent/project -> task/decision/memory/event. It shows true relationships and activity, not random animation passed off as live execution.

The experience has two distinct instruments:
1. `react-force-graph-3d` + Three.js + d3-force-3d: exploratory living galaxy, camera and cinematic movement.
2. AntV G6 in a separate 2D canvas: deterministic dependency/DAG/workflow analysis. Neither should independently own the graph state.

## Verified baseline and limitations

Repository currently contains a standalone React/Vite prototype under `graph-3d/`. Important modules:
- `src/App.tsx` (view, inspector, generated demo activity; ~279 lines)
- `src/galaxy/GalaxyScene.tsx` (ForceGraph3D, camera, scene effects, physics; ~193 lines)
- `src/galaxy/data.ts` (seeded graph, 6 clusters and view filters)
- `src/galaxy/objects.ts` (custom meshes, sprites, starfield)
- `src/galaxy/types.ts` (simple demo graph types)
- `src/styles/app.css`
- `src/galaxy/data.test.ts` (limited unit tests)

The repository branch does not yet contain an operational normalized persistent graph state and a Hermes/Jev/Bridge adapter. Previous discussion of a richer local implementation does not establish that code exists on the remote feature branch.

Current defects / risks to resolve:
- PAUSE stops scheduled demo messages but does not consistently stop link particle animation; force simulation, orbit, particles, and event streams have different lifecycles.
- Inspector can point to a filtered-out node; camera focus then cannot find that node.
- RESET uses a hard-coded camera coordinate instead of computing the bounds of the actual visible 3D nodes.
- Starfield mount sizing uses initial width and does not respond adequately to small viewports.
- Custom Three.js mesh/sprite/material/texture allocations lack explicit pool/disposal ownership.
- Node hover does not highlight immediate relationships; collapse/expand, multiselect, directional arrows, collision force and DAG workspace are missing.
- `LIVE` is a fixed, rotating demo-event sequence, not actual runtime events.
- Rendering/browser performance for 500/1500 and 2000/4000 is not benchmarked; no validated latest preview E2E report.
- Graph sources and UI share demo-only IDs, no real authorization/redaction scheme.
- G6 companion is not present.

## User experience and semantics

Five top-level modes remain: SYSTEM, AGENTS, PROJECTS, MEMORY, LIVE.
Full graph view defaults to semantic landmarks. Clusters can expand/collapse; camera transition preserves orientation. Levels of detail:
- L0 Universe: Jarvis core and 6 clusters, traffic summaries (no thousands of labels).
- L1 Cluster: teams, projects, top memory topics, counts and activity indicators.
- L2 Entity: selected agent/project and 1-hop relations, relevant tasks/memories.
- L3 Evidence: event timeline, file references, decision rationale and action proofs.

Controls: orbit/zoom, focus, dynamic fit-to-view, hover neighborhood and dim unrelated content, search, filters, multi-select, breadcrumbs/back, cluster expand/collapse, quality/density, toggle labels/glow, pause demo/live event stream, independent freeze renderer.

PAUSE EVENTS (reconciled): suspends visual event playback/cues in the UI but never drops durable P0/P1 delivery; reconnect/resume uses cursor replay or resync. DEMO playback may pause its fixture generator independently. Camera/graph interactions remain available.
FREEZE SCENE (explicit advanced action): may call graph `pauseAnimation()` and disables interaction; `resumeAnimation()` restores it.
Reduced-motion: no autoplay cinematic orbit, continuous particles, or ambient pulsation by default.

## Normalized graph contract — reconciled proposal (2026-10-10)

> **Documentation-only alignment, not code approval.** The illustrative 2026-10-08 `GraphNode` / `GraphEdge` / `GraphEventEnvelope` interfaces, their `core` semantic type and `version/capturedAt` naming have been superseded **for planning purposes** by the more detailed 2026-10-09/10 candidate contracts. See [Blueprint 02 — Graph Ontology](../../graph-v2/blueprint/02-graph-ontology-contracts.md), [Blueprint 03 — Event Bus](../../graph-v2/blueprint/03-event-bus-protocol.md), [Blueprint 08 — ADR Candidates](../../graph-v2/blueprint/08-architecture-decisions-candidate.md) and [Blueprint 14 — Unified Design](../../graph-v2/blueprint/14-unified-system-design-review.md). The precise contracts still require documented sign-off before any implementation.

There is **one canonical graph**, shared by Galaxy 3D, G6, Mission Control and Second Brain:

- `GraphEntity`: durable domain object, immutable namespaced ID, `kind`, typed status, `classification`, provenance and monotonic `revision`.
- `GraphRelation`: semantic relationship between stable IDs; directed when applicable. `hub`, `core` and `traffic` do **not** belong to durable domain enums.
- `GraphSnapshot`: `schemaVersion: '2.0'`, `graphVersion`, opaque `cursor`, `generatedAt`, nodes and edges.
- `GraphPatch`: `baseVersion`, next `graphVersion`, validated atomic upserts/deletions, cursor.
- `JarvisEventV1`: CloudEvents-like event envelope with identity `(source,id)`, per-source `sequence`, server-assigned replay cursor, correlation/causation and source-bound authentication.
- `GraphStore` / `GraphProjector`: own *semantic state*, never 3D positions, effects or camera. Authorized client mirror contains only already-filtered data.
- `VisualCue` and renderer DTO: short-lived presentation effects, not proof of work or source-of-truth events.

**Ordering is not global:** `sequence` is source-scoped; `partitionkey` alone does not grant task-scoped order. `graphVersion` and event-log `cursor` measure different things. Task end-of-response text is not proof of tool execution. Verified external action success requires an authoritative receipt. Memory persistence requires confirmation from the authorized memory source.

**Ownership:** local trusted ingest/log and Graph Projector remain authoritative; the browser receives a redacted viewer-scoped graph. Hosted Preview stays synthetic DEMO by default. The precise Bridge, Jev and memory source contracts remain UNKNOWN until the read-only inventory specified in [Blueprint 09](../../graph-v2/blueprint/09-read-only-source-verification-plan.md).

**Unified navigation:** the top-level product modes are SYSTEM, AGENTS, PROJECTS, MEMORY, LIVE; Mission Control, Second Brain and Trace/Timeline are lenses *inside* those modes, not new competing application shells. Semantic levels L0–L3 describe progressive detail in any relevant lens; L3 is an evidence inspector, not mandatory new 3D scene.

**Proposed extension requiring separate ratification:** memory `persistenceVerification` (pending/confirmed/failed/unknown) and relationship `verification` (verified/suggested/contradicted/stale) are not currently defined as fields of Blueprint 02's stable interfaces. Their meanings and authorized projection must be agreed and versioned before a developer adds them.

---

## Event to visualization policy

- `node.created` -> new spatial node appears under correct parent.
- `node.updated` -> apply status / metadata, brief highlight only.
- `edge.created` -> new relation rendered, adjust simulation.
- `activity.started` -> non-cyclical emitted particle on source->target if edge exists.
- `activity.completed` -> destination pulse + associated evidence.
- `activity.failed` -> short error signal + readable event record.
- `snapshot.loaded` -> replace graph atomically, keep camera and selection if still valid.
- `stream.disconnected` -> show stale-data timestamp and reconnect state. Never wipe old data or pretend LIVE remains connected.

No random animation masquerading as live. Simulated mode must display DEMO prominently and use seeded reproducible fixtures.

## Rendering and performance policy

- Use shared geometry and material pools where possible; safely release Three.js owned resources on replacement/unmount; benchmark sprite/texture cache.
- Stable positioning across filtering, expanding and data updates, no wholesale random re-layout on metadata events.
- `forceCollide` sized by node category, cluster-oriented constraints, repulsion and link forces tuned from tests.
- Compare node counts of ~300 current demo, 500 nodes / 1500 links, and 2000 nodes / 4000 links; record p50 FPS, p95 frame time, WebGL memory, heap and interaction latency on specified actual devices. Targets (provisional, not claimed): desktop >=45 fps p50 for 500/1500; mobile >=25 fps p50 for 200 nodes; heavier graphs must reduce detail without hanging UI.
- Mobile: one-third-size rendering budget relative to desktop, 1-step level-of-detail below desktop default, touch gestures and bottom-sheet inspector; keyboard still accessible on desktop.
- Camera fit uses visible-node AABB/sphere, aspect ratio and padding; handles 0/1-node views.
- WebGL unavailable/context loss -> usable read-only fallback including inspector.
- Browser visibility/reduced-motion -> reduce unnecessary rendering without breaking state.

## Security / provenance

All external event and file data untrusted. Normalize/validate, bound counts and text lengths, redact credentials and sensitive settings, text-only for external labels, no unsafe HTML injection. Never send Bridge tokens, raw environment secrets, or private files to hosted demo. Remote live access needs explicit authenticated and authorized route; no unprotected Hermes API exposure.

## Roadmap with independent shippable tracks

A. Reliability Foundation: tests, semantic pause, camera/filter correctness, render fallback/resource lifecycle, CI + preview evidence. Shippable alone.
B. Galaxy Experience: hover, expand/collapse, semantic zoom, force collision, directional edges, richer FX and mobile/performance tier. Shippable with seeded DEMO.
C. Live Knowledge Graph: discover real event transport, normalized store, adapters, snapshot/reconnect/replay, safe memory ingestion, verified activity. Deploy behind explicit LIVE connection configuration; DEMO remains default.
D. Graph Workspace + Scale: G6 separate 2D DAG/process view, cross-view navigation, evidence views, larger graphs and performance gates. Shippable independently after normalized model is ready.

Plans:
- `docs/superpowers/plans/2026-10-08-jarvis-graph-v2-foundation.md`
- `docs/superpowers/plans/2026-10-08-jarvis-graph-v2-galaxy.md`
- `docs/superpowers/plans/2026-10-08-jarvis-graph-v2-live.md`
- `docs/superpowers/plans/2026-10-08-jarvis-graph-v2-workspace.md`
- `docs/superpowers/plans/2026-10-10-jarvis-graph-v2-mission-control.md` (new Mission lens; planning only)
- `docs/superpowers/plans/2026-10-10-jarvis-graph-v2-second-brain.md` (new knowledge lens; planning only)
- `docs/superpowers/plans/2026-10-10-jarvis-graph-v2-cinematic-event-director.md` (new motion orchestration; planning only)

Dependencies: A -> B; A domain contract -> C; C data contract -> D. B and C may proceed in parallel after A, with independent merge gates.

## Release gates

Gate 0: current deployed commit/build/browser snapshot and failing baseline documented.
Gate A: reliable interaction, isolated tests and browser smoke, no runtime errors; branch-only preview.
Gate B: L0->L3 navigation in DEMO, camera, selection, highlight, animation and mobile QA.
Gate C: demonstrated actual source event -> normalized store -> node/edge update -> visible evidence, with no secrets and correct disconnect state.
Gate D: synchronized 3D and G6 view with DAG cycle handling; performance results saved.

Every gate includes test pass proof, current git SHA, screenshots/video from actual runtime, 390x844 mobile QA, and explicit human signoff. Never merge to `main` nor promote Preview to Production without separate user authorization.

## Deliberately deferred

- Autonomous creation/deletion of remote agents from UI.
- Writes to production Hermes, Bridge, Obsidian or GitHub without separate permission.
- Multi-user collaboration, remote graph editing, VR/AR, AI-generated labels without provenance.
- Arbitrary shader postprocessing pipelines before performance baselines.
