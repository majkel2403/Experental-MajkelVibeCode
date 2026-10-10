# Jarvis Graph v2 — Reliability Foundation Implementation Plan

> **2026-10-10 documentation alignment — HOLD FOR CONTRACT REVIEW.** This older execution plan is retained for historical task decomposition, but MUST be read together with [Unified Design 14](../../graph-v2/blueprint/14-unified-system-design-review.md), [ADR 08](../../graph-v2/blueprint/08-architecture-decisions-candidate.md), and the reconciled Master Spec. Contract Task 2 must consume the proposed `GraphEntity`/`GraphRelation`/`GraphSnapshot`/`GraphPatch` schema from Blueprint 02 rather than the obsolete `GraphNode/core` draft. Do not mistake seeded DEMO data for actual Hermes state. Preserve separate viewer scope and renderer DTO. See Blueprint 14. **Planning only; no execution authorized.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn current standalone graph DEMO into a reproducibly tested, stable WebGL explorer with reliable camera, selection, pause, resources, and a renderer-independent graph model.

**Architecture:** Keep `graph-3d/` isolated. Pure normalized graph contracts sit under `graph/domain/`; the existing force-graph renderer is an adapter. Baseline tests and real browser screenshots are required before treating previous build results as verified.

**Tech Stack:** React, TypeScript, Vite, Vitest, Playwright Chromium/Edge, react-force-graph-3d, Three.js.

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md`.

## Global Constraints

- Only `feat/jarvis-graph-3d`; never commit to `main`, merge, or promote production without explicit approval.
- Existing working DEMO must remain available after every commit.
- No claim of browser verification without real captured runtime output.
- Preserve latest snapshot and valid inspector selection on event/view changes.
- Pause EVENTS keeps interactive camera; scene FREEZE is separate.
- Validate untrusted graph/event input; never include credentials or raw private content in browser builds.
- Use test-first RED -> GREEN -> refactor, small commits and documented failure evidence.

## Review Focus

1. Selected node filtered out: inspector should clear/indicate hidden; camera must not jump to unknown node — Task 4.
2. Empty graph / one-node graph: fit camera must return finite coordinates and preserve controls — Task 3.
3. PAUSE with a previously active link: all demo flow emissions cease while orbit and click still work — Task 3.
4. Rapid view changes / starfield unmount: no duplicate scene objects, no leaked resources — Task 5.
5. Browser with WebGL unavailable/context lost: meaningful fallback, no uncaught exception — Task 5.

## Files / Ownership

- Create `graph-3d/src/graph/domain/{types,validate,reducer,select,bridgeDemo}.ts` — pure renderer-neutral state
- Create `graph-3d/src/graph/domain/*.test.ts` — domain unit tests
- Create `graph-3d/src/galaxy/{cameraMath,animationPolicy,selectionPolicy}.ts` — pure UI policies
- Create `graph-3d/src/galaxy/*.test.ts` — policy tests
- Modify `graph-3d/src/galaxy/{GalaxyScene,objects,data}.tsx` / corresponding .ts modules — render integration
- Modify `graph-3d/src/App.tsx` — pause / selected state / view transitions
- Modify `graph-3d/package.json` — Playwright test/dev scripts
- Create `graph-3d/e2e/{smoke,interactions,mobile}.spec.ts` and `graph-3d/playwright.config.ts`
- Modify `.github/workflows/graph-3d-validation.yml` — CI, preview evidence
- Update `graph-3d/README.md` — honest DEMO and testing status

---

### Task 1: Reproduce existing build + browser baseline

**Files:**
- Modify: `graph-3d/package.json`
- Create: `graph-3d/playwright.config.ts`
- Create: `graph-3d/e2e/smoke.spec.ts`
- Modify: `.github/workflows/graph-3d-validation.yml`

**Interfaces:**
- Consumes: standalone Vite app.
- Produces: `npm run test:e2e` and reproducible report for preview and local build.

- [ ] Write smoke E2E test: load app, nonzero WebGL canvas size or explicit fallback, six clusters in sidebar, DEMO indicator; no page errors.
- [ ] Run `npm run test:e2e -- e2e/smoke.spec.ts`, record RED if scene is broken; never fabricate a red failure.
- [ ] Configure Playwright to start local Vite on controlled port; pin Chromium install or use authorized Edge channel. Set timeouts and screenshot only on failure.
- [ ] Run `npm test && npm run typecheck && npm run build && npm run test:e2e`; record actual pass/fail and deployed SHA vs repo HEAD (no assumption they match).
- [ ] Commit `test(graph-v2): establish real browser baseline`.

### Task 2: Renderer-neutral normalized graph domain

**Files:**
- Create: `graph-3d/src/graph/domain/{types,validate,reducer,bridgeDemo}.ts`
- Create: `graph-3d/src/graph/domain/{validate,reducer,bridgeDemo}.test.ts`

**Interfaces:**
- Consumes: `GalaxyData` from `src/galaxy/types.ts` only within `bridgeDemo.ts`.
- Produces:
  - `validateSnapshot(input: unknown): GraphSnapshot | null`
  - `normalizeEvent(input: unknown): GraphEventEnvelope | null`
  - `applyGraphEvent(state: GraphSnapshot, event: GraphEventEnvelope): GraphSnapshot`
  - `convertDemoGalaxy(input: GalaxyData): GraphSnapshot`

- [ ] Write RED tests: duplicate IDs, dangling links, malformed timestamps/sequence, unknown kinds, prototype keys, oversize text, all rejected atomically.
- [ ] Write RED tests: `node.created`, `node.updated`, `edge.created`, `snapshot.loaded` are pure, deterministic; unknown IDs do not mutate original graph.
- [ ] Run `npm test -- src/graph/domain/validate.test.ts src/graph/domain/reducer.test.ts` and confirm expected RED.
- [ ] Implement TS types from master spec and validators with explicit 256-char ID and 512-char label caps, 10,000 nodes and 50,000 edges per snapshot, immutable reducer and duplicate-event protection at ingestion boundary.
- [ ] Implement demo bridge without exposing demo-only `fx/fy/fz` as persistent domain truth; write deterministic conversion tests.
- [ ] Run tests and typecheck; commit `feat(graph-v2): add normalized immutable graph contract`.

### Task 3: Camera bounds + pause semantics

**Files:**
- Create: `graph-3d/src/galaxy/{cameraMath,animationPolicy}.ts`
- Create: `graph-3d/src/galaxy/{cameraMath,animationPolicy}.test.ts`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Modify: `graph-3d/src/App.tsx`

**Interfaces:**
- Produces:
  - `fitCameraToNodes(nodes: ReadonlyArray<Pick<GalaxyNode,'x'|'y'|'z'|'fx'|'fy'|'fz'>>, aspect: number, padding?: number): { position: [number,number,number]; target: [number,number,number] }`
  - `getAnimationPolicy(input: { eventsPaused: boolean; sceneFrozen: boolean; reducedMotion: boolean }): { emitTraffic: boolean; autoOrbit: boolean; frameActive: boolean }`

- [ ] Write RED tests: 0 nodes, 1 node, irregular 3D positions, non-finite values; verify finite camera targets and padding.
- [ ] Write RED tests: eventsPaused => particles off yet frame/camera active; sceneFrozen => whole renderer frozen; reducedMotion => no autoplay.
- [ ] Run `npm test -- src/galaxy/cameraMath.test.ts src/galaxy/animationPolicy.test.ts` to confirm RED.
- [ ] Implement policies; replace fixed reset camera coordinates with computed camera fit; bind event-flow particles to `emitTraffic` and use `emitParticle` for discrete activity.
- [ ] Rename user-facing PAUSE to PAUSE EVENTS; expose FREEZE SCENE only in advanced options with explicit interaction warning.
- [ ] E2E: toggle PAUSE EVENTS while orbit/selection works and particles stop; commit `fix(graph-v2): repair camera fit and event pause`.

### Task 4: Selection/filter/search correctness

**Files:**
- Create: `graph-3d/src/galaxy/selectionPolicy.ts`
- Create: `graph-3d/src/galaxy/selectionPolicy.test.ts`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/src/galaxy/data.ts`
- Modify: `graph-3d/e2e/interactions.spec.ts`

**Interfaces:**
- Produces:
  - `resolveSelection(visibleIds: ReadonlySet<string>, requestedId: string | null, previousId: string | null): string | null`
  - `selectByQuery(graph: GalaxyData, input: { query: string; mode: ViewMode }): GalaxyData`

- [ ] Write RED tests for hidden selected node, a selected cluster outside current filter, empty search, duplicate labels and fast mode switching.
- [ ] Verify RED. Implement explicit behavior: if selected node hidden, clear focus and show unobtrusive “outside current filter” notice; do not focus stale position.
- [ ] Search must be exact-id aware, Unicode-safe and case-insensitive, with parent path retained; do not display a parent whose filter excludes it.
- [ ] E2E test Ctrl/⌘+K, Esc, filters, inspector, focus and reset under all five views.
- [ ] Run unit/E2E/typecheck and commit `fix(graph-v2): keep selection consistent across views`.

### Task 5: WebGL and Three.js lifecycle

**Files:**
- Modify: `graph-3d/src/galaxy/{objects.ts,GalaxyScene.tsx}`
- Create: `graph-3d/src/galaxy/resourcePool.ts`
- Create: `graph-3d/src/galaxy/resourcePool.test.ts`
- Modify: `graph-3d/e2e/{smoke,mobile}.spec.ts`

**Interfaces:**
- Produces:
  - `createResourcePool(): { acquireGeometry(key:string,factory:()=>BufferGeometry):BufferGeometry; releaseGeometry(key:string):void; dispose():void }`
  - `handleWebGLAvailability(webGL: boolean, contextLost: boolean): '3d'|'fallback'`

- [ ] RED resource pool tests: ref counting, shared geometry lifetime, repeated mounts, disposal idempotence, context loss.
- [ ] Verify RED, implement ownership model and texture cache size/eviction. Avoid disposing textures still shared by live scene objects.
- [ ] Recreate starfield policy when viewport tier changes; limit star count on mobile; do not duplicate on rerender.
- [ ] E2E force WebGL off and verify fallback with working inspector; simulate context loss and observe non-crashing state.
- [ ] Run tests/build/browser; commit `fix(graph-v2): harden WebGL fallback and resources`.

### Task 6: Validation gate and safety review

**Files:**
- Modify: `graph-3d/README.md`
- Modify: `.github/workflows/graph-3d-validation.yml`
- Create: `docs/superpowers/reports/2026-10-08-graph-v2-foundation-verification.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: Gate A acceptance evidence.

- [ ] Run `npm test && npm run typecheck && npm run build && npm run test:e2e` in `graph-3d/`; record exact counts / commands / SHA.
- [ ] Capture desktop at 1440x900 and mobile at 390x844; validate orbit, click, pause, reset, resize and WebGL fallback.
- [ ] Run root repo tests only if existing root scripts are present; compare with baseline to separate pre-existing failures.
- [ ] Review security of tooltip text and demo status, verify no secret data in screenshot/client bundle, no unreviewed connection to Hermes.
- [ ] Compare `main...HEAD`; verify only `graph-3d/**`, feature docs and narrowly scoped CI files are changed.
- [ ] Publish only PREVIEW after passing tests; keep feature branch unmerged; commit report `docs(graph-v2): record foundation verification`.

## Acceptance

- No failed tests, TS errors, build failures, browser console errors or dangling links.
- Real browser evidence (not mock screenshots), reproducible SHA, desktop/mobile.
- Graph remains navigable while demo events paused; scene freeze is separate and explicit.
- Camera and inspector remain correct after search/filter/density changes.
- No new regression in `main`; no production promotion.

## Outside this track

Semantic zoom, deep 3D cinematic FX and runtime adapters are in separate plans; do not sneak them into the reliability foundation.
