# Jarvis Graph v2 — Cinematic Galaxy Experience Implementation Plan

> **2026-10-10 documentation alignment — HOLD FOR CONTRACT REVIEW.** This older execution plan is retained for historical task decomposition, but MUST be read together with [Unified Design 14](../../graph-v2/blueprint/14-unified-system-design-review.md), [ADR 08](../../graph-v2/blueprint/08-architecture-decisions-candidate.md), and the reconciled Master Spec. Galaxy only projects already-authorized canonical graph entities; `core/hub/traffic` are visual roles, not persisted relationships. Semantic L0–L3, FOLLOW LIVE and `PAUSE EVENTS` follow Blueprint 04/13/14. Event cues must be source-backed or explicitly DEMO, and manual camera always wins. **Planning only; no execution authorized.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Jarvis graph from a static cluster overview into an explorable spatial system with meaningful context, fluid navigation and polished visual feedback.

**Architecture:** Use existing ForceGraph3D and neutral domain model from Gate A. Keep hierarchy/LOD, camera motion, highlighting, physics and effects as pure policies around a small Three.js renderer adapter. DEMO source and real source both pass through identical graph store/view selectors.

**Tech Stack:** React, TypeScript, react-force-graph-3d, Three.js, d3-force-3d, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md`.

## Global Constraints

- Foundation Gate A is a prerequisite. Do not rewrite or patch root Jarvis OS.
- Visual hierarchy: L0 universe, L1 cluster, L2 entity, L3 evidence. A camera zoom alone is not a level-of-detail transition.
- Prefer data-driven motion over random decorative activity; demo ambience must remain labeled DEMO.
- Preserve current camera/navigation behavior on dynamic topology changes.
- Explicit reduced-motion and mobile lower-quality paths; frame-time metrics recorded.
- Only preview deploy from `feat/jarvis-graph-3d`; no merge/promotion.

## Review Focus

1. A cluster contains hundreds of children: opening/closing it preserves stable positions and does not stall or duplicate nodes — Task 1.
2. A node is deleted while focused: breadcrumb, hover state and inspector remain safe — Tasks 1–2.
3. A dense group receives hover: dimming never permanently hides graph, restore on leave and filter changes — Task 2.
4. A user navigates three times rapidly: latest camera target wins; do not snap back when earlier tween ends — Task 3.
5. Reduced-motion or mobile large graph: expensive effects/labels scale down without losing selection and accessibility — Tasks 4–5.

## Files / Ownership

- Create `graph-3d/src/galaxy/{hierarchy,hoverPolicy,selectionSet,cameraDirector,physicsProfile,effectsPolicy,renderBudget}.ts` and respective `*.test.ts`
- Create `graph-3d/src/galaxy/{GalaxyBreadcrumbs,ContextLinks,GalaxyQualityControls}.tsx`
- Modify `graph-3d/src/galaxy/{GalaxyScene.tsx,objects.ts}`
- Modify `graph-3d/src/App.tsx` and `graph-3d/src/styles/app.css`
- Expand `graph-3d/e2e/{interactions,mobile}.spec.ts`
- Add `graph-3d/e2e/galaxy-visual.spec.ts` and performance capture helpers `graph-3d/e2e/helpers/perf.ts`

---

### Task 1: Expand/collapse and semantic LOD

**Files:**
- Create: `graph-3d/src/galaxy/hierarchy.ts`
- Create: `graph-3d/src/galaxy/hierarchy.test.ts`
- Create: `graph-3d/src/galaxy/GalaxyBreadcrumbs.tsx`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`

**Interfaces:**
- Consumes: Gate A neutral graph domain and `GraphSnapshot`.
- Produces:
  - `type DetailLevel = 0|1|2|3`
  - `getVisibleGraph(snapshot: GraphSnapshot, state: { level: DetailLevel; clusterId?: string; nodeId?: string; expanded: ReadonlySet<string> }): GraphSnapshot`
  - `getNavigationPath(snapshot: GraphSnapshot, nodeId: string): string[]`
  - `toggleExpandedNode(expanded: ReadonlySet<string>, id: string): Set<string>`

- [ ] RED tests: L0 includes only Jarvis and cluster anchors; L1 includes team/project children, L2 selected node + first-hop relations; L3 includes evidence metadata; all links point to retained nodes.
- [ ] RED tests for collapsed groups with 0 children, 1 child, cycles in parent tree, and deleted ancestor.
- [ ] Run `npm test -- src/galaxy/hierarchy.test.ts` to confirm RED.
- [ ] Implement selectors with stable IDs and deterministic positions; do not randomly respawn unaffected nodes.
- [ ] Add breadcrumb navigation and expand affordance to inspector and cluster selection.
- [ ] E2E navigate L0 -> L1 -> L2 -> L3 -> back, assert visible-node count, breadcrumb, camera destination; commit `feat(graph-v2): semantic graph expansion`.

### Task 2: Hover relationships, multi-selection and directed edges

**Files:**
- Create: `graph-3d/src/galaxy/{hoverPolicy,selectionSet}.ts`
- Create: `graph-3d/src/galaxy/{hoverPolicy,selectionSet}.test.ts`
- Create: `graph-3d/src/galaxy/ContextLinks.tsx`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Modify: `graph-3d/src/App.tsx`

**Interfaces:**
- Produces:
  - `getNeighborhood(snapshot: GraphSnapshot, rootIds: ReadonlySet<string>, hops: 0|1|2): { nodeIds: Set<string>; edgeIds: Set<string> }`
  - `toggleMultiSelection(selected: ReadonlySet<string>, nodeId: string, additive: boolean): Set<string>`
  - `linkAppearance(edge: GraphEdge, highlighted: boolean): { color:string; width:number; opacity:number; arrowLength:number }`

- [ ] RED tests: 1-hop/2-hop highlighting, cyclic edges, links between selected nodes, multiselect clear and shift-click additive behavior.
- [ ] Verify RED. Implement adjacency index memoized per graph version and hover restore policy.
- [ ] Bind `onNodeHover` and `onNodeClick`, dim unrelated nodes/edges without mutating their data; implement shift-click multi-select and inspector relation list.
- [ ] Configure `linkDirectionalArrowLength` and `linkDirectionalArrowRelPos` only for directed relationships; do not imply direction for undirected edges.
- [ ] E2E select/hover/multiselect on a dense cluster, check inspector and screenshots; commit `feat(graph-v2): inspect directional relationships`.

### Task 3: Camera Director and animated navigation

**Files:**
- Create: `graph-3d/src/galaxy/cameraDirector.ts`
- Create: `graph-3d/src/galaxy/cameraDirector.test.ts`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Create: `graph-3d/src/galaxy/GalaxyBreadcrumbs.tsx` (if not in Task 1)

**Interfaces:**
- Produces:
  - `createCameraDirector(api: { move(position: [number,number,number], target: [number,number,number], durationMs: number): void }): { focus(...): void; fit(...): void; cancel(): void }`
  - `getFocusTransition(node: GraphNode, level: DetailLevel, bounds: { radius:number; center:[number,number,number] }): { position:[number,number,number]; target:[number,number,number]; durationMs:number }`

- [ ] RED tests: focus cluster, fit visible selection, navigation cancellation, change filter mid-flight, reduced motion duration=0.
- [ ] Verify RED; implement latest-request-wins model and restore previously focused node only if still visible.
- [ ] Fit to visible nodes using Gate A bounding camera policy; never hardcode a single 930-unit reset.
- [ ] E2E rapid cluster switches and back navigation; assert inspector/camera target convergence; commit `feat(graph-v2): cinematic camera director`.

### Task 4: Collision-aware physics and visual effects

**Files:**
- Create: `graph-3d/src/galaxy/{physicsProfile,effectsPolicy}.ts`
- Create: `graph-3d/src/galaxy/{physicsProfile,effectsPolicy}.test.ts`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Modify: `graph-3d/src/galaxy/objects.ts`

**Interfaces:**
- Produces:
  - `getPhysicsProfile(level: DetailLevel, nodeCount: number): { charge:number; linkLength:number; collisionPadding:number; velocityDecay:number }`
  - `getEffectsPolicy(input: { budget: 'mobile'|'desktop'|'low'; reducedMotion: boolean; selectedCount:number }): { bloom:boolean; starCount:number; particleCap:number; haloDetail:number }`

- [ ] RED tests for overlapping entities, fixed cluster anchors, low-power settings, motion disabled and long linked chains.
- [ ] Verify RED; register `forceCollide` and cluster-aware force via `d3Force`; avoid reheating graph on hover or activity metadata changes.
- [ ] Separate meaningful activity particles from ambient decoration; use `emitParticle` per event where possible; implement edge-arrow visibility according to semantics.
- [ ] Make Bloom default subtle and editable; do not increase glow at cost of unreadable text or mobile frame rate.
- [ ] Snapshot tests/visual QA for desktop L0–L3; commit `feat(graph-v2): tuned galaxy forces and effects`.

### Task 5: Adaptive LOD, performance and mobile

**Files:**
- Create: `graph-3d/src/galaxy/renderBudget.ts`
- Create: `graph-3d/src/galaxy/renderBudget.test.ts`
- Create: `graph-3d/src/galaxy/GalaxyQualityControls.tsx`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Modify: `graph-3d/src/styles/app.css`
- Create: `graph-3d/e2e/helpers/perf.ts`
- Modify: `graph-3d/e2e/mobile.spec.ts`

**Interfaces:**
- Produces:
  - `getRenderBudget(args: { width:number; nodeCount:number; edgeCount:number; reducedMotion:boolean; quality:'auto'|'high'|'low' }): { pixelRatioCap:number; starCount:number; labels:'major'|'focused'|'all'; bloom:boolean; particles:number }`
  - `measureGraphFrameStats(...): Promise<{ p50Fps:number; p95FrameMs:number; sampleCount:number }>`

- [ ] RED tests for 390x844, 320px width, 500/1500, 2000/4000, reduced motion, user low quality override.
- [ ] Verify RED; implement quality policy, progressive labels, pooled texture/geometry, mobile inspector sheet and control touch targets.
- [ ] Instrument camera/frame telemetry without uploading private graph data.
- [ ] Benchmark desktop 500/1500 and mobile 200 nodes, record actual machine/browser and FPS; if goals unmet, lower detail and retest.
- [ ] Run `npm test && npm run typecheck && npm run build && npm run test:e2e`; commit `perf(graph-v2): adaptive galaxy fidelity`.

### Task 6: Visual comparison to library gallery and Gate B

**Files:**
- Create: `docs/superpowers/reports/2026-10-08-graph-v2-galaxy-qa.md`
- Update: `graph-3d/README.md`
- Update: `graph-3d/e2e/galaxy-visual.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: Gate B report and preview URL.

- [ ] Capture actual app desktop and mobile screenshots at multiple zoom levels; compare against selected official examples: highlight, expandable nodes, collision, emitted particles, Bloom and DAG (DAG belongs to track D).
- [ ] Check keyboard, mouse and touch routes; inspect frame stats, no WebGL context leaks or browser errors.
- [ ] Verify DEMO labels and motion controls; no false “real live” status.
- [ ] Execute all unit/build/E2E tests; commit report with measured values, known gaps and accepted/rejected outcomes.
- [ ] Produce feature-branch Preview only; do not change `main` or production.

## Acceptance

- Semantic L0–L3 navigation with correct breadcrumbs, filters, inspector and camera.
- Highlight, multi-select, expand/collapse, direction arrows and event particles function in real browser.
- No graph/scene resource leak during repeated navigation and viewport changes.
- Measured benchmarks, no invented FPS, mobile 390x844 legible and clickable.
- Gate B screenshot evidence reviewed before proceeding to live adapters.
