# Jarvis Graph 3D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated React/TypeScript 3D Jarvis knowledge-and-agent galaxy under `graph-3d/` using `react-force-graph-3d`, with deterministic live Event Bus simulation, inspection, filtering, camera focus, particles, and a stable shared graph model.

**Architecture:** The existing plain HTML/CSS/JS Jarvis desktop remains untouched. A new Vite React TypeScript application lives entirely under `graph-3d/`. Graph state is framework-independent and updated only through normalized events; the 3D renderer consumes that state and can later be paired with a separate G6 adapter.

**Tech Stack:** React, TypeScript, Vite, Vitest, `react-force-graph-3d`, Three.js, d3-force-3d (via force-graph API)

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-3d-design.md`

## Global Constraints

- All product code for this feature lives under `graph-3d/`; do not rewrite the existing Jarvis desktop.
- `react-force-graph-3d` is the primary 3D renderer.
- Graph state is the source of truth; rendering must never own graph state.
- Production visual activity must be driven by graph/Event Bus events, not random decorative animation.
- Demo mode may simulate events but must be visibly identified as DEMO.
- WebGL failure must preserve a useful fallback path.
- Event-stream disconnect must preserve the last valid graph snapshot.
- Malformed events must be rejected at the normalization boundary without partial graph mutation.
- MVP target is 500 nodes / 1,500 links on a normal desktop.
- Existing root-level Jarvis tests/build behavior must remain unchanged.

## Review Focus

1. **WebGL unavailable:** app must show a readable fallback state instead of a blank/failed canvas; covered in Task 5 fallback-state test.
2. **Malformed graph event:** reducer must reject it without partially mutating state; covered in Task 2 invalid-event test.
3. **Selected node removed by live update:** inspector selection must safely clear or move to a valid fallback; covered in Task 4 selection-validity test.
4. **Burst of live events:** batching must apply all events deterministically without repeatedly reheating the simulation; covered in Task 5 batch-event test.
5. **Very small viewport / touch device:** UI must reduce labels/effects and switch inspector to compact mobile presentation; covered in Task 6 responsive-policy test.

---

## File Structure

```text
graph-3d/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  index.html
  src/
    main.tsx
    App.tsx
    graph/
      types.ts
      demoGraph.ts
      graphReducer.ts
      graphSelectors.ts
      graphView.ts
    events/
      eventTypes.ts
      normalizeEvent.ts
      demoEventStream.ts
      eventBatcher.ts
    rendering/
      nodeFactory.ts
      forceConfig.ts
      cameraController.ts
      renderPolicy.ts
    components/
      JarvisGalaxy.tsx
      GraphToolbar.tsx
      GraphInspector.tsx
      GraphLegend.tsx
      LiveEventLog.tsx
      WebGLFallback.tsx
    styles/
      app.css
    tests/
      graphReducer.test.ts
      graphSelectors.test.ts
      normalizeEvent.test.ts
      graphView.test.ts
      eventBatcher.test.ts
      renderPolicy.test.ts
  README.md
```

---

### Task 1: Isolated React/Vite/TypeScript foundation

**Files:**
- Create: `graph-3d/package.json`
- Create: `graph-3d/vite.config.ts`
- Create: `graph-3d/tsconfig.json`
- Create: `graph-3d/tsconfig.node.json`
- Create: `graph-3d/index.html`
- Create: `graph-3d/src/main.tsx`
- Create: `graph-3d/src/App.tsx`
- Create: `graph-3d/src/styles/app.css`
- Create: `graph-3d/README.md`

**Interfaces:**
- Consumes: none.
- Produces: runnable `graph-3d` app with scripts `dev`, `build`, `test`, and `typecheck`; React root mounted from `src/main.tsx`.

- [ ] **Step 1: Create the isolated package manifest and TypeScript/Vite config**

Dependencies must include React, React DOM, `react-force-graph-3d`, and `three`. Dev dependencies must include Vite, TypeScript, React Vite plugin, Vitest, and React/Three type packages.

- [ ] **Step 2: Create a minimal app shell**

`App.tsx` renders the title “Jarvis Graph 3D” and a visible “DEMO” status chip. No graph logic yet.

- [ ] **Step 3: Install dependencies in `graph-3d/`**

Run: `npm install`

Expected: exit 0 and lockfile created under `graph-3d/`.

- [ ] **Step 4: Verify isolated TypeScript build**

Run: `npm run build`

Expected: exit 0 with Vite build output under `graph-3d/dist/`.

- [ ] **Step 5: Verify root project is unchanged**

Run from repository root: `git diff -- package.json index.html`

Expected: no changes.

- [ ] **Step 6: Commit**

```bash
git add graph-3d
git commit -m "feat(graph-3d): scaffold isolated React app"
```

---

### Task 2: Shared graph model, event normalization, and reducer

**Files:**
- Create: `graph-3d/src/graph/types.ts`
- Create: `graph-3d/src/events/eventTypes.ts`
- Create: `graph-3d/src/events/normalizeEvent.ts`
- Create: `graph-3d/src/graph/graphReducer.ts`
- Create: `graph-3d/src/graph/demoGraph.ts`
- Test: `graph-3d/src/tests/graphReducer.test.ts`
- Test: `graph-3d/src/tests/normalizeEvent.test.ts`

**Interfaces:**
- Consumes: Task 1 Vitest setup.
- Produces:
  - `JarvisGraphNode`, `JarvisGraphLink`, `JarvisGraphState`, `JarvisNodeKind`
  - `JarvisGraphEvent`
  - `normalizeGraphEvent(input: unknown): JarvisGraphEvent | null`
  - `graphReducer(state: JarvisGraphState, event: JarvisGraphEvent): JarvisGraphState`
  - `createDemoGraph(): JarvisGraphState`

- [ ] **Step 1: Write failing reducer tests**

Tests must assert:
- `node.created` adds one node and increments version.
- `node.updated` patches only the addressed node.
- `node.removed` removes links attached to that node.
- `link.created` adds one valid link.
- `snapshot.loaded` replaces graph atomically.

Run: `npm test -- src/tests/graphReducer.test.ts`

Expected: FAIL because reducer/types do not exist.

- [ ] **Step 2: Write failing normalization tests**

Tests must assert:
- a valid `node.created` event is returned unchanged in meaning.
- unknown event types return `null`.
- a malformed event missing required IDs returns `null`.
- malformed events do not invoke the reducer.

Run: `npm test -- src/tests/normalizeEvent.test.ts`

Expected: FAIL because normalizer does not exist.

- [ ] **Step 3: Implement graph types and normalized event union**

Use the exact node kinds and Event Bus event families from the spec.

- [ ] **Step 4: Implement `normalizeGraphEvent(input: unknown)`**

Validation must be total and side-effect free. Invalid input returns `null`.

- [ ] **Step 5: Implement `graphReducer(state, event)`**

Reducer must be pure and never mutate its input state.

- [ ] **Step 6: Implement deterministic `createDemoGraph()`**

Fixture includes at minimum Jarvis, Hermes, Jev, Event Bus, one project, three agents, memory nodes, one task, one decision, one file, and one tool.

- [ ] **Step 7: Run Task 2 tests**

Run: `npm test -- src/tests/graphReducer.test.ts src/tests/normalizeEvent.test.ts`

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add graph-3d/src/graph graph-3d/src/events graph-3d/src/tests
git commit -m "feat(graph-3d): add graph state and event reducer"
```

---

### Task 3: Graph selectors, view filters, and force configuration

**Files:**
- Create: `graph-3d/src/graph/graphSelectors.ts`
- Create: `graph-3d/src/graph/graphView.ts`
- Create: `graph-3d/src/rendering/forceConfig.ts`
- Test: `graph-3d/src/tests/graphSelectors.test.ts`
- Test: `graph-3d/src/tests/graphView.test.ts`

**Interfaces:**
- Consumes: `JarvisGraphState` and node kinds from Task 2.
- Produces:
  - `GraphViewMode = 'SYSTEM' | 'PROJECTS' | 'AGENTS' | 'MEMORY' | 'LIVE'`
  - `selectGraphForView(state, mode): JarvisGraphState`
  - `selectRelations(state, nodeId): { nodes: JarvisGraphNode[]; links: JarvisGraphLink[] }`
  - `selectNodeById(state, id): JarvisGraphNode | null`
  - `createForceConfig(nodeCount: number)`

- [ ] **Step 1: Write failing selector tests**

Tests must prove relation selection returns only directly connected nodes/links and missing IDs return an empty relation result.

- [ ] **Step 2: Write failing view tests**

Tests must prove each view mode filters the expected semantic classes while keeping links whose endpoints both remain.

- [ ] **Step 3: Implement selectors and view filter**

View filtering must not mutate the original graph.

- [ ] **Step 4: Implement `createForceConfig(nodeCount)`**

Return force values for:
- small graph: stronger detail separation
- 500-node graph: lower charge magnitude and label density hints
- topology changes reheat the simulation; ordinary metadata updates do not.

- [ ] **Step 5: Run Task 3 tests**

Run: `npm test -- src/tests/graphSelectors.test.ts src/tests/graphView.test.ts`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add graph-3d/src/graph graph-3d/src/rendering/forceConfig.ts graph-3d/src/tests
git commit -m "feat(graph-3d): add graph views and selectors"
```

---

### Task 4: True WebGL 3D galaxy, inspector, filters, and camera focus

**Files:**
- Create: `graph-3d/src/rendering/nodeFactory.ts`
- Create: `graph-3d/src/rendering/cameraController.ts`
- Create: `graph-3d/src/components/JarvisGalaxy.tsx`
- Create: `graph-3d/src/components/GraphToolbar.tsx`
- Create: `graph-3d/src/components/GraphInspector.tsx`
- Create: `graph-3d/src/components/GraphLegend.tsx`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/src/styles/app.css`
- Test: `graph-3d/src/tests/graphView.test.ts`

**Interfaces:**
- Consumes: selectors/view modes from Task 3; graph state from Task 2.
- Produces:
  - `createNodeObject(node: JarvisGraphNode): THREE.Object3D`
  - `focusNodePosition(nodePosition, distance): { position: {x:number;y:number;z:number}; lookAt: {x:number;y:number;z:number} }`
  - `JarvisGalaxy` component supporting selection, view filtering, camera focus, labels toggle, and reset.

- [ ] **Step 1: Add failing selection-validity test**

Extend graph view tests: when the selected node is removed from the active graph state, selection resolver returns `null`; it must never return a stale object.

Run: `npm test -- src/tests/graphView.test.ts`

Expected: FAIL on the new selection behavior.

- [ ] **Step 2: Implement selection resolver**

Add `resolveSelectedNode(state, selectedId): JarvisGraphNode | null`.

- [ ] **Step 3: Implement custom Three.js node factory**

Visual semantics:
- core = largest luminous sphere
- project = large anchor sphere
- agent = medium orb
- memory = small star-like sphere
- task = pulsing-capable activity node
- decision = visually distinct hot node
- file/tool = smaller satellite objects

Avoid one React component per rendered graph node.

- [ ] **Step 4: Implement `JarvisGalaxy` using `ForceGraph3D`**

Must support:
- `graphData`
- node click
- orbit/zoom
- custom `nodeThreeObject`
- directional particle configuration for active links
- force tuning through exposed d3 force controls.

- [ ] **Step 5: Implement camera focus and reset**

Clicking a node updates inspector and moves camera toward that node without teleporting through the node.

- [ ] **Step 6: Implement toolbar and inspector**

Controls:
- SYSTEM / PROJECTS / AGENTS / MEMORY / LIVE
- toggle labels
- pause/resume motion
- reset camera

Inspector shows label, kind, status, metadata summary, and relation count.

- [ ] **Step 7: Run unit tests and production build**

Run:
```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests PASS; typecheck and build exit 0.

- [ ] **Step 8: Commit**

```bash
git add graph-3d
git commit -m "feat(graph-3d): render interactive Jarvis galaxy"
```

---

### Task 5: Deterministic demo Event Bus, batching, particles, and WebGL fallback

**Files:**
- Create: `graph-3d/src/events/demoEventStream.ts`
- Create: `graph-3d/src/events/eventBatcher.ts`
- Create: `graph-3d/src/components/LiveEventLog.tsx`
- Create: `graph-3d/src/components/WebGLFallback.tsx`
- Modify: `graph-3d/src/components/JarvisGalaxy.tsx`
- Modify: `graph-3d/src/App.tsx`
- Test: `graph-3d/src/tests/eventBatcher.test.ts`
- Test: `graph-3d/src/tests/graphReducer.test.ts`

**Interfaces:**
- Consumes: normalized events/reducer from Task 2 and galaxy component from Task 4.
- Produces:
  - `createDemoEventStream(seed?: number)`
  - `applyEventBatch(state, inputs): { state: JarvisGraphState; accepted: JarvisGraphEvent[]; rejected: unknown[]; topologyChanged: boolean }`
  - live event log model
  - WebGL fallback state.

- [ ] **Step 1: Write failing event-batch tests**

Tests must prove:
- 20 valid events produce one deterministic final state.
- malformed events are returned under `rejected`.
- metadata-only updates return `topologyChanged: false`.
- node/link add/remove returns `topologyChanged: true`.

Run: `npm test -- src/tests/eventBatcher.test.ts`

Expected: FAIL because batcher does not exist.

- [ ] **Step 2: Implement deterministic demo stream**

Same seed must emit the same event sequence. UI labels the stream as DEMO.

- [ ] **Step 3: Implement event batching**

Normalize first, then reduce accepted events in order. Invalid events never reach the reducer.

- [ ] **Step 4: Connect live activity to visual particles**

`activity.started` marks the corresponding link active long enough to emit directional particles. `activity.completed` briefly emphasizes destination state.

- [ ] **Step 5: Add failing WebGL fallback-state test**

Test a pure helper `getRendererAvailability({ webglAvailable }): '3d' | 'fallback'`.

Expected: FAIL before helper exists.

- [ ] **Step 6: Implement fallback UI**

If WebGL is unavailable, show a readable explanation and preserve graph metadata/inspector information instead of a blank canvas.

- [ ] **Step 7: Run Task 5 tests**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 8: Commit**

```bash
git add graph-3d
git commit -m "feat(graph-3d): add live event stream and particles"
```

---

### Task 6: Responsive rendering policy, performance guardrails, and final verification

**Files:**
- Create: `graph-3d/src/rendering/renderPolicy.ts`
- Modify: `graph-3d/src/components/JarvisGalaxy.tsx`
- Modify: `graph-3d/src/components/GraphInspector.tsx`
- Modify: `graph-3d/src/styles/app.css`
- Modify: `graph-3d/README.md`
- Test: `graph-3d/src/tests/renderPolicy.test.ts`

**Interfaces:**
- Consumes: complete UI from Tasks 4–5.
- Produces:
  - `getRenderPolicy(input: { width: number; nodeCount: number; reducedMotion: boolean }): RenderPolicy`
  - documented run/test/build instructions
  - final verified isolated feature.

- [ ] **Step 1: Write failing responsive-policy tests**

Tests must assert:
- width <= 480 uses mobile mode.
- mobile mode lowers particle count and label density.
- nodeCount >= 500 reduces label density.
- reduced-motion disables continuous decorative animation while preserving interaction.

Run: `npm test -- src/tests/renderPolicy.test.ts`

Expected: FAIL because policy does not exist.

- [ ] **Step 2: Implement `getRenderPolicy`**

Policy returns explicit values for label density, particle multiplier, pixel ratio cap, inspector presentation, and motion level.

- [ ] **Step 3: Apply render policy to UI**

Desktop inspector stays side-panel. Mobile inspector becomes compact/bottom presentation. Full graph interaction remains available by touch.

- [ ] **Step 4: Document demo vs production event modes**

README must state that the MVP stream is deterministic demo data and identify the future adapter boundary for Hermes/Jev/Bridge events.

- [ ] **Step 5: Run full graph-3d verification**

Run:
```bash
npm test
npm run typecheck
npm run build
```

Expected: 0 failed tests; typecheck exit 0; build exit 0.

- [ ] **Step 6: Run existing root unit suite**

Run from repository root:
```bash
npm test
```

Expected: record the actual result. Any pre-existing failures must be identified separately; no new root failures may be introduced by `graph-3d/`.

- [ ] **Step 7: Verify scope isolation**

Run:
```bash
git diff main...HEAD --name-only
```

Expected: changes limited to:
- `graph-3d/**`
- `docs/superpowers/specs/2026-10-08-jarvis-graph-3d-design.md`
- `docs/superpowers/plans/2026-10-08-jarvis-graph-3d.md`

- [ ] **Step 8: Commit**

```bash
git add graph-3d
git commit -m "feat(graph-3d): finish responsive 3D graph MVP"
```

---

## Final whole-branch review

After all tasks are complete:

1. Review diff from merge-base with `main` through current HEAD.
2. Check the five Review Focus failure modes explicitly.
3. Re-grade every finding by user impact.
4. Fix Critical/Important findings with RED -> GREEN tests.
5. Defer only genuinely Minor findings and report them.
6. Do not merge to `main` without explicit user approval.

## Explicitly deferred beyond this plan

- Real Hermes WebSocket/SSE adapter
- Real Jev event adapter
- Real Bridge event adapter
- Obsidian ingestion
- G6 renderer implementation
- persistence/server storage
- VR/AR
- shader-heavy custom effects
