# Jarvis Graph Engineering Blueprint

**Research-to-design package for Jarvis Graph OS v2.0.**

Prepared: **2026-10-09**; extended: **2026-10-10**. Current location: **`Experental-MajkelVibeCode/jarvis-graph-3d`**, docs branch **`docs/jarvis-graph-v2-mission-brain-motion`**. Former `Jarvis-` feature branch was moved into this experimental repository.  
**Status: DRAFT / SPECIFICATIONS ONLY.** No runtime feature, live connection, test-suite implementation, security control or deployment is created by this documentation package. Do not merge to main without explicit authorization.

## Start here

Read **01**, **02**, **03** in order before implementation. The most important distinction is a *real* event-driven knowledge graph versus a colorful but synthetic force-graph view.

| ID | Document | Key deliverable | Priority |
| --- | --- | --- | --- |
| 01 | [System Architecture](01-system-architecture.md) | Local trust boundary, event ingest, projector, authoritative graph, 3D + G6 projection, ADRs | P0 |
| 02 | [Graph Ontology and Contracts](02-graph-ontology-contracts.md) | Stable entity/relation IDs, classification, provenance, GraphSnapshot and GraphPatch, shared store | P0 |
| 03 | [Event Bus Protocol](03-event-bus-protocol.md) | CloudEvents-like envelope, durability, source-scoped sequence, dedupe, replay, backpressure, SSE | P0 |
| 04 | [Interaction and Semantic Zoom](04-interaction-semantic-zoom.md) | L0–L3 navigation, camera FSM, hover, expand/collapse, manual override, mobile/reduced motion | P1 |
| 05 | [Visual and Performance Bible](05-visual-performance-bible.md) | Geometry, material/status grammar, effects, upstream demo mapping, LOD, GPU lifecycle, FPS gates | P1 |
| 06 | [Security, Quality and Deployment](06-security-quality-deployment.md) | Threat model, E2E/benchmark/security matrix, protected Preview, rollback and monitoring | P0 |
| 07 | [Graph Playground Laboratory](07-graph-playground-spec.md) | 12 graph scene types, controllable physics/FX, benchmark fixtures, A/B presets and export | P2 |
| 08 | [ADRs — Contract Freeze Candidate](08-architecture-decisions-candidate.md) | Reconcile domain naming, graph/event versions, trust boundary and one-store rule; proposals pending review | P0 |
| 09 | [Read-only Source Verification Plan](09-read-only-source-verification-plan.md) | What to inspect in actual Hermes, Jev, Bridge, memory and desktop without altering runtime | P0 |
| 10 | [Acceptance Scenarios and Evidence](10-acceptance-scenarios-and-evidence.md) | Explicit future Given–When–Then cases, demo vs real-source evidence and release stop conditions | P0 |
| 11 | [Mission Control](11-mission-control-design.md) | Mapa misji, agentów, delegacji, statusów i dowodów wykonania | P1 |
| 12 | [Second Brain Graph](12-second-brain-graph-design.md) | Pamięć, źródła, powiązania, weryfikacja wiedzy i historia zmian | P1 |
| 13 | [Cinematic Event Director](13-cinematic-event-director-design.md) | Reguły efektów, kamery i animacji wynikających z rzeczywistych eventów | P1 |

## Documentation gate — only plans, no implementation

Files **08–13** are planning deliverables, not code. ADRs are **proposed**, source audits are **not executed**, and all test cases are **NOT RUN**. The project remains in documentation/review mode. No code changes, installation, service startup, deployment or Git merge are authorized by these documents.

Recommended review order: **08 (decisions)** → **09 (read-only evidence plan)** → **10 (acceptance cases)** → **11–13 (three new product-design specs)**. Only after explicit review should the older master spec and detailed plans be harmonized in documentation. Do not start implementation without a separate, clear instruction.

## What was directly inspected

On GitHub feature branch:
- `graph-3d/src/App.tsx` — currently uses a seeded demo and rotates fixed events every 2500ms; must not be represented as real LIVE.
- `graph-3d/src/galaxy/types.ts` — mixes physical/visual concepts `core`, `hub` and `traffic` with domain concepts.
- `graph-3d/src/galaxy/GalaxyScene.tsx` — renders using React Force Graph 3D and Three.js; preserve and harden rather than replace.
- `graph-3d/package.json` — no current G6 workspace dependency and no end-to-end browser test script in the inspected version.
- `js/events.js` — real browser-local reducer/events API with bounded task histories, not durable log.
- `hermes/plugins/jarvis-events/__init__.py` — existing Bridge event delivery is lossy (500 queue, no retry).
- Existing master spec and execution roadmap under `docs/superpowers/`.

What was **not independently verified here**: running Bridge SSE auth/replay, actual current Jev event schema, persistent local storage, current user's runtime health, latest 3D preview browser rendering, actual performance benchmarks, owner-authorized remote live connection. External sources referenced in the supplied research report are evidence leads; implementation must verify precise current APIs and licences at dependency pin time.

## Decisions that need ratification BEFORE contract freeze

1. Canonical naming: existing master spec uses `GraphNode` / `EntityKind`, research proposes `GraphEntity`, and README 02 chooses `GraphEntity`. Do not implement two incompatible domain models. Update master spec/plans after ratification.
2. Canonical kinds: add durable `system/component/team/run/evidence` where supported; keep `core/hub` as presentation roles.
3. Event semantics: CloudEvents source-scoped sequence versus custom partitionkey. Do not claim a partitionkey alone gives ordering.
4. Source of truth: where authoritative event log and graph store persist; inspect existing Bridge/DB before selecting SQLite or new infrastructure.
5. Exactly what constitutes verified tool completion and persisted memory write.
6. Local-only LIVE versus optional secure remote viewer; default hosted Vercel Preview remains demo.
7. Whether browser selection remains when filters hide an entity, or explicitly clears with explanation.
8. What the user actually authorizes for remote tool command execution (not included in read-only v2).

## Suggested execution, aligned with existing Superpowers plan

~~~text
Research package
    |
    v
GATE 0: confirm real repo SHA, packages, smoke/browser screenshots and source schemas
    |
    v
A. Reliability, canonical IDs/contracts, safe client mirror
    |
    +-------- B. Galaxy semantic zoom, camera, graphics, performance
    |
    +-------- C. Durable live transport, provenance and replay (local after consent)
    |
    v
D. Separate G6 2D workspace (can prototype earlier on fixtures)
    |
    v
QA: contract tests + Chromium E2E + mobile + security + benchmarks
    |
    v
Unmerged Vercel PREVIEW -> explicit human release approval
~~~

Follow the already-written detailed plans:
- [Master design](../../superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md)
- [Execution roadmap](../../superpowers/plans/2026-10-08-jarvis-graph-v2-execution-roadmap.md)
- [A foundation](../../superpowers/plans/2026-10-08-jarvis-graph-v2-foundation.md)
- [B galaxy](../../superpowers/plans/2026-10-08-jarvis-graph-v2-galaxy.md)
- [C live](../../superpowers/plans/2026-10-08-jarvis-graph-v2-live.md)
- [D G6](../../superpowers/plans/2026-10-08-jarvis-graph-v2-workspace.md)

## External reference index

| Topic | Primary reference |
| --- | --- |
| React 3D renderer and examples | https://github.com/vasturiano/react-force-graph |
| Standalone 3D force graph | https://github.com/vasturiano/3d-force-graph |
| 3D simulation and forces | https://github.com/vasturiano/d3-force-3d |
| AntV G6 examples | https://g6.antv.antgroup.com/en/examples |
| Three.js instancing | https://threejs.org/docs/pages/InstancedMesh.html |
| Three.js GPU resource disposal | https://threejs.org/manual/en/how-to-dispose-of-objects.html |
| CloudEvents core | https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md |
| CloudEvents sequence extension | https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/sequence.md |
| OWASP validation | https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html |
| OWASP XSS prevention | https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html |
| Vercel Preview/protection | https://vercel.com/docs/deployments |

## Acceptance rule

An implemented feature is accepted only with recorded passing test results from its exact commit, browser evidence for interactive WebGL behavior, error/security checks and measured performance if claimed. Documentation, Git commits or Vercel READY alone do **not** prove feature completion.

This package is documentation only. These new docs are committed only to the dedicated documentation branch of the experimental repository. Neither `majkel2403/Jarvis-` `main` nor `majkel2403/Experental-MajkelVibeCode` `main`, runtime plugins, or deployments were changed by these edits.
