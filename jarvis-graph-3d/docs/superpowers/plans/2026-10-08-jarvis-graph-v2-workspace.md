# Jarvis Graph v2 — G6 Workspace and Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a precise, fast 2D/G6 operational workspace alongside the 3D galaxy, sharing the same graph state, event provenance and selection, with verified performance for large datasets.

**Architecture:** G6 has its own canvas and layout controller, never layered into the ForceGraph3D canvas. A view adapter projects canonical GraphSnapshot into G6 nodes/edges; cross-view selection, filters, event replay and evidence remain in the shared application state. Separate layout algorithms support DAG workflows, radial/entity relations and clustered memory subgraphs.

**Tech Stack:** TypeScript, React, AntV G6 (review exact v5 API at implementation), Vitest, Playwright; React Force Graph 3D remains the spatial engine.

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md`.

## Global Constraints

- Gate A renderer-neutral graph model required; live Gate C necessary only for true live evidence, not standalone G6 DEMO implementation.
- Do not force a cyclic knowledge graph into DAG layout without explicit cycle policy.
- No two renderers in one canvas; renderers cannot mutate canonical state directly.
- No DOM XSS in custom node labels/tooltips; validate IDs and event payload.
- Prefer lazy loading G6 so 3D-only users do not pay initial bundle cost.
- Never replace or merge `main`; validate in branch preview.

## Review Focus

1. A DAG includes cycles: indicate those edges and fall back to network layout instead of crashing/lying — Task 2.
2. A 3D node is selected then 2D opens: same canonical ID and inspector selection — Task 3.
3. An entity is deleted while one renderer is hidden: stale selection and edges are safely removed — Task 3.
4. Memory graph with 2000+ nodes: reduce detail and avoid UI freeze on mode switch — Task 4.
5. 2D interaction with keyboard/touch or no WebGL: G6 stays usable, no accessibility dead end — Task 5.

## Files / Ownership

- Create `graph-3d/src/workspace/{g6Adapter,g6Layout,graphMode,selectionSync,perfPolicy}.ts` + `*.test.ts`
- Create `graph-3d/src/workspace/{G6Workspace,LayoutControls,RelationshipTable,GraphModeSwitch}.tsx`
- Modify `graph-3d/src/App.tsx`, `graph-3d/src/styles/app.css`, `graph-3d/package.json`
- Add `graph-3d/e2e/{workspace,switching,scale}.spec.ts`
- Create `docs/superpowers/reports/2026-10-08-graph-v2-workspace-verification.md`

---

### Task 1: Shared renderer adapter and lazy workspace loading

**Files:**
- Create: `graph-3d/src/workspace/{g6Adapter,graphMode}.ts`
- Create: `graph-3d/src/workspace/{g6Adapter,graphMode}.test.ts`
- Create: `graph-3d/src/workspace/{G6Workspace,GraphModeSwitch}.tsx`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/package.json`

**Interfaces:**
- Consumes: `GraphSnapshot`, `GraphNode` and `GraphEdge` from Gate A domain.
- Produces:
  - `type GraphRendererMode = 'GALAXY_3D'|'WORKSPACE_G6'`
  - `toG6Data(snapshot: GraphSnapshot): { nodes: { id:string; data: Record<string,unknown> }[]; edges: { id:string; source:string; target:string; data:Record<string,unknown> }[] }`
  - `setRendererMode(current: GraphRendererMode, next: GraphRendererMode): GraphRendererMode`

- [ ] RED test exact node/edge counts, ID preservation, empty snapshot, deleted references and unsafe labels.
- [ ] Verify RED, implement pure adapter, keeping graph state and model IDs outside renderers.
- [ ] Add lazy-loaded `G6Workspace` React boundary via `React.lazy` and Suspense; keep existing 3D graph independent.
- [ ] Show 3D / G6 toggle, preserve last selected entity through switching.
- [ ] E2E that G6 loads only when requested and switching doesn't lose inspector; commit `feat(graph-v2): introduce separate G6 workspace`.

### Task 2: Correct relationship and DAG layouts

**Files:**
- Create: `graph-3d/src/workspace/g6Layout.ts`
- Create: `graph-3d/src/workspace/g6Layout.test.ts`
- Create: `graph-3d/src/workspace/LayoutControls.tsx`
- Modify: `graph-3d/src/workspace/G6Workspace.tsx`

**Interfaces:**
- Produces:
  - `type GraphLayoutMode = 'dag'|'radial'|'force'|'cluster'`
  - `analyzeDag(snapshot: GraphSnapshot): { acyclic:boolean; cycleEdgeIds:string[]; order:string[] }`
  - `chooseG6Layout(snapshot: GraphSnapshot, requested: GraphLayoutMode): { type:GraphLayoutMode; warning?:string }`

- [ ] RED test linear DAG, diamond workflow, self-loop, multiple cycles, disconnected components and isolated nodes.
- [ ] Verify RED; implement graph traversal/topological sort and explicit cycle warning.
- [ ] Configure G6 v5 layout for DAG (acyclic only), radial entity context, force network and combo/cluster groups; choose fallback to force for cycles.
- [ ] Add edge semantics (direction, type, status) and accessibility labels; avoid misleading DAG arrows for undirected relationships.
- [ ] E2E switch layouts with self-cycle and 100-node graph without exception; commit `feat(graph-v2): operational graph layouts`.

### Task 3: Cross-view inspector, history and evidence

**Files:**
- Create: `graph-3d/src/workspace/selectionSync.ts`
- Create: `graph-3d/src/workspace/selectionSync.test.ts`
- Create: `graph-3d/src/workspace/RelationshipTable.tsx`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/src/workspace/G6Workspace.tsx`

**Interfaces:**
- Consumes: canonical selection and event store from tracks A/C.
- Produces:
  - `resolveCrossViewSelection(snapshot: GraphSnapshot, selectedId: string|null): string|null`
  - `getRelationRows(snapshot: GraphSnapshot, selectedId:string): { id:string; otherId:string; kind:string; direction:'in'|'out'|'undirected' }[]`

- [ ] RED tests: selected node in either renderer; deletion while other renderer hidden; incoming vs outgoing directed link; evidence event with no mapped entity.
- [ ] Verify RED; implement a single canonical `selectedNodeId` and `selectedEdgeIds` state in application domain; scene adapters only issue selection actions.
- [ ] Add relationship table with filter/sort and evidence inspector reference, and graph-to-table focus without changing route on click.
- [ ] E2E selected node survives switching to G6 and back, related table updates after simulated node removal; commit `feat(graph-v2): synchronize 3D and 2D selections`.

### Task 4: Huge graphs, progressive rendering and benchmarking

**Files:**
- Create: `graph-3d/src/workspace/perfPolicy.ts`
- Create: `graph-3d/src/workspace/perfPolicy.test.ts`
- Modify: `graph-3d/src/workspace/G6Workspace.tsx`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`
- Create: `graph-3d/e2e/scale.spec.ts`

**Interfaces:**
- Produces:
  - `getScalePolicy(input: { nodeCount:number; edgeCount:number; viewportWidth:number }): { clustering:boolean; renderLabels:boolean; animations:boolean; layoutWorker:boolean }`
  - `createGraphFixture({nodes,edges,seed}:{nodes:number;edges:number;seed:number}): GraphSnapshot`

- [ ] RED tests for 0, 1, 500/1500 and 2000/4000 node/edge cases, including disconnected/dense subsets.
- [ ] Verify RED. Generate seeded fixtures with stable graph IDs and no dangling edges; no random non-reproducible QA.
- [ ] Implement progressive labels, collapsed combos and optional worker-based layout if supported by verified G6 version; otherwise use async/chunked layout and document limitation.
- [ ] Benchmark 3D/2D p50 FPS, p95 frame time, memory, pointer interaction, layout delay, mobile. Record actual hardware/browser; add automatic budget warnings, not unsupported "60 FPS guaranteed" claims.
- [ ] E2E verify view remains interactive under load and switch completes without stale selection; commit `perf(graph-v2): progressive large-graph rendering`.

### Task 5: Accessibility, responsive and recovery

**Files:**
- Modify: `graph-3d/src/workspace/{G6Workspace,RelationshipTable}.tsx`
- Modify: `graph-3d/src/styles/app.css`
- Create: `graph-3d/e2e/workspace.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: accessible 2D workspace and equivalent non-WebGL navigation path.

- [ ] RED E2E cases: keyboard selection, focus visibility, screen-reader-readable relation list, narrow screen 390x844, large zoom, unsupported WebGL.
- [ ] Verify RED; add role, accessible label, keyboard traversal and mobile table-first layout.
- [ ] Make 2D workspace available when WebGL is unsupported; don't route users back to a broken 3D canvas.
- [ ] Verify contrast and reduced-motion; commit `fix(graph-v2): accessible resilient G6 workspace`.

### Task 6: Gate D deployment, scale QA and documentation

**Files:**
- Create: `docs/superpowers/reports/2026-10-08-graph-v2-workspace-verification.md`
- Modify: `graph-3d/README.md`
- Modify: `.github/workflows/graph-3d-validation.yml`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: Gate D acceptance evidence.

- [ ] Run `npm test && npm run typecheck && npm run build && npm run test:e2e`; verify chunk splitting and absence of critical browser warnings.
- [ ] Compare exact interaction same node in 3D/2D, DAG cycle, mobile, WebGL fallback and replayed event selection.
- [ ] Record measured performance for 500/1500 and 2000/4000; if targets fail document and block high-density default.
- [ ] Capture real desktop/mobile screenshots, Vercel Preview status, commit SHA and scope diff vs `main`.
- [ ] Commit report; do not merge to `main` or release Production without separate user approval.

## Acceptance

- True separate G6 canvas with DAG/radial/cluster/force layouts and explicit cycle behavior.
- Single shared graph state, selection, filters, provenance and relation inspector across 2D and 3D.
- Keyboard/mobile/fallback behavior verified in actual browser.
- Performance report with real numbers; no regression to standalone 3D DEMO.
- Lazy G6 loading and smaller 3D-first bundle where feasible.
