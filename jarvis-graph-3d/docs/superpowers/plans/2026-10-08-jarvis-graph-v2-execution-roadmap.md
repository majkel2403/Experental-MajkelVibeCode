# Jarvis Graph OS v2.0 — Execution Roadmap and Release Gates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (Native, previously selected by the user) or superpowers:subagent-driven-development if user changes execution mode. The four 2026-10-08 tracks are retained as historical plans; the newer Blueprint 02/03/14 contract proposals and the 2026-10-10 lens plans govern their future alignment **after design sign-off**. This file is the ordering and acceptance gate, not permission to execute.

**Goal:** Evolve an isolated graph DEMO into a trustworthy, cinematic Jarvis knowledge-and-agent operating surface.

**Architecture:** One normalized graph + event store projects onto two renderer adapters: React Force Graph 3D and G6. Local runtime adapters must remain opt-in and safely authenticated.

**Tech Stack:** React, Vite, TS, react-force-graph-3d, Three.js, d3-force-3d, G6, Vitest, Playwright, secure streaming transport as supported by verified runtime.

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md`.

> **2026-10-10 documentation-only reconciliation.** The experiment and its plans are now stored inside `majkel2403/Experental-MajkelVibeCode/jarvis-graph-3d`; new documents are on branch `docs/jarvis-graph-v2-mission-brain-motion`, not `main`. Never execute an older plan's `GraphNode/core` model or browser-only `durable in-memory` transport as a production contract: read Blueprint 02, 03, 08, 14 and 15 first. No step is authorized to run in this document-review phase.

## Project State at Planning Time

- Working branch: `feat/jarvis-graph-3d`.
- `main` differs by no changes from this work; all feature diffs restricted to `graph-3d/**`, docs and feature CI.
- Current React app in remote GitHub is seeded DEMO, not a reliable production live bridge.
- Vercel Preview `dpl_HWC8amTbLXgsHpMW5SLrqfo4Wmui` was READY at inspection. There is no independent browser-render verification of the current release at planning time.
- Previous local-only test success must not be asserted as verification of newer pushed commits.

## Canonical Execution Order

```text
Gate 0: Reproduce actual current branch
             │
             ▼
A Foundation (6 tasks) ─── Gate A ───┬── B Galaxy Experience (6 tasks) ── Gate B ─┐
                                     │                                              │
                                     └── C Live Brain (6 tasks) ──────── Gate C ────┤
                                                                                    ▼
                              D G6 Workspace + Scale (6 tasks) ─── Gate D ── Release Candidate
```

The D 2D engine may be prototyped after Gate A using fixture data, but evidence/live integration requires Gate C. Never let D implementation block safe completion of B.

## Plan Index

| Track | Detailed plan | Tasks | Verification |
| --- | --- | ---: | --- |
| A | `2026-10-08-jarvis-graph-v2-foundation.md` | 6 | unit + typecheck + build + browser + 390x844 |
| B | `2026-10-08-jarvis-graph-v2-galaxy.md` | 6 | hierarchy + selection + camera + visual QA + FPS |
| C | `2026-10-08-jarvis-graph-v2-live.md` | 6 | normalized verified event + trace + reconnect + privacy |
| D | `2026-10-08-jarvis-graph-v2-workspace.md` | 6 | G6 DAG + identity synchronization + 2D mobile + scale |
| M | `2026-10-10-jarvis-graph-v2-mission-control.md` | 5 | team/task views, verified outcome, dependency impact, mobile |
| K | `2026-10-10-jarvis-graph-v2-second-brain.md` | 6 | provenance, verified memory, suggestions, history, privacy |
| V | `2026-10-10-jarvis-graph-v2-cinematic-event-director.md` | 6 | event cues, priority queue, camera control, pause/replay, accessible motion |

**Sequencing of additional lens plans:** M (Mission) requires Gate A canonical selectors; V (Director) requires Gate B visual adapter and Gate C accepted event contract for REAL-LIVE; K (Second Brain) requires Gate A ontology and approved Gate C memory/evidence source. All may be demonstrated with synthetic authorized DEMO fixtures before real source verification. The M/K/V plans are **future instructions**, NOT started tasks.

Each track has independent RED/GREEN tests and git commits. Treat each as separately reviewable.

## Acceptance Gates (binary)

### Gate 0 — Baseline
- [ ] Record exact branch SHA, Vercel deployment SHA, Node version, package versions.
- [ ] Run existing `npm test`, `npm run typecheck`, `npm run build` from `graph-3d/`; record actual failures.
- [ ] Capture real desktop 1440x900 and mobile 390x844 or explicitly label unavailable verification.
- [ ] Confirm demo events are simulated, not live Hermes results.

### Gate A — Reliable Renderer
- [ ] Pause EVENTS leaves camera interaction alive and stops traffic.
- [ ] RESET/FOCUS finite and correct for empty, one-node and dense views.
- [ ] Inspector/filter/search never select a hidden node without explanation.
- [ ] WebGL loss fallback works and repeated scene lifecycle does not leak.
- [ ] TDD tests + browser smoke green at same exact commit; branch Preview only.

### Gate B — Cinematic 3D Experience
- [ ] L0 -> L1 -> L2 -> L3 semantics demonstrably alter topology/content, not just zoom.
- [ ] Hover highlights 1/2-hop relationships, multiselect and expand/collapse function.
- [ ] Animated camera navigates rapidly without race conditions.
- [ ] Directional edges only for directed semantics; event particles tied to events in DEMO.
- [ ] Desktop/mobile/reduced-motion and performance baselines captured.

### Gate C — Real Trustworthy System
- [ ] Authorized source schema actually observed.
- [ ] One real event from Hermes/Jev/Bridge/memory produces a matching visual state and provenance.
- [ ] No Bridge token/secret/private file body in browser or logs.
- [ ] Network down -> stale state and preserved snapshot; replay/resync deterministic.
- [ ] Hosted Preview remains DEMO unless live connection explicitly secured and authorized.

### Gate D — Complete Graph Workspace
- [ ] 3D and G6 use same entity IDs and canonical selection.
- [ ] DAG cycles detected; fallback explained.
- [ ] Selectors and evidence view synchronized after mutations.
- [ ] 500/1500 and 2000/4000 benchmarks recorded for actual hardware.
- [ ] Browser E2E, accessibility and touch navigation verified.

## Mandatory Release Evidence

Every track report includes:
1. Git commit SHA and comparison vs `main`.
2. Exact commands and actual test counts/results; failures not omitted.
3. Screenshot of real browser 1440x900 and mobile 390x844 (or honest blocker).
4. Security review, network/data-access changes and unimplemented known gaps.
5. Whether feature Preview is READY and whether render interaction was independently verified.
6. Explicit result: PASS, BLOCKED or DEFERRED.

## Risk Register

| Risk | Severity | Mitigation | Owner track |
| --- | --- | --- | --- |
| 3D UI compiles but renders blank | P0 | Chromium/Edge E2E smoke with canvas + screenshot | A |
| False “LIVE” while data is simulated | P0 | DEMO labels, provenance-aware source status | A/C |
| Leaking credentials through runtime state | P0 | Redaction and browser payload testing; no public local bridge | C |
| Stale camera after filtering and async focus | P1 | Pure selection + camera policies and tests | A/B |
| WebGL memory and perf regression | P1 | shared pools, mobile budget, measured frame time | A/B/D |
| Disconnected/missing Event Bus transport | P1 | last snapshot, reconnect/resync, source discovery | C |
| G6 and 3D disagree on graph identity | P1 | one canonical graph state and adapter tests | D |
| Unverified local snapshot diverges from GitHub | P1 | compare branch SHA, never infer from prior local build | A |

## Minimum Launch Sequence

1. Review master spec and four plans.
2. Start Gate 0 baseline on dedicated feature worktree.
3. Execute A tasks sequentially in Native TDD mode; stop on unresolved P0.
4. Verify Gate A and capture evidence.
5. Execute B and C independently when source access permits.
6. Execute D after stable graph model; full sync with C only after Gate C.
7. Hold Release Candidate review. Never merge to `main` or replace Production without explicit user confirmation.

## Explicit Non-Goals

- No rewrites of Jarvis OS main shell.
- No public direct access to local Hermes/Jev/Bridge.
- No automatic runtime-control actions from graph clicks.
- No promises of specific FPS without measurements.
- No production deployment authorized by this planning document.
