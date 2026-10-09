# Jarvis Graph 3D — Design Spec

Date: 2026-10-08
Branch: `feat/jarvis-graph-3d`

## 1. Goal

Build a real-time 3D knowledge and agent graph for Jarvis OS that visualizes the actual state of projects, agents, memory, files, tools, decisions, tasks, and runtime events.

The graph must not be decorative. Every visible activity should be driven by real graph data or Event Bus events.

Primary outcome:
- explore Jarvis as a spatial "galaxy"
- understand what is active now
- drill from system -> cluster -> node -> relations
- observe live events moving through the graph
- preserve a path to a precise 2D/structured G6 workspace

## 2. Architecture choice

### 2.1 3D exploration layer

Use:
- `react-force-graph-3d` as the primary interactive 3D graph component
- `three` for custom node visuals and scene-level effects
- `d3-force-3d` through the force-graph API for simulation tuning

Why:
- React integration
- WebGL rendering
- camera access
- custom Three.js node objects
- dynamic graph updates
- particle/link effects
- force simulation controls

### 2.2 Structured graph layer

Use AntV G6 separately for:
- DAG/process views
- exact relationship inspection
- workflow analysis
- dense 2D operational views
- deterministic layouts

G6 is not the primary 3D galaxy renderer.

### 2.3 Shared graph model

Both renderers consume the same normalized graph state.

```ts
type JarvisNodeKind =
  | 'core'
  | 'project'
  | 'agent'
  | 'memory'
  | 'task'
  | 'decision'
  | 'file'
  | 'tool'
  | 'person'
  | 'event';

interface JarvisGraphNode {
  id: string;
  kind: JarvisNodeKind;
  label: string;
  status?: string;
  health?: number;
  importance?: number;
  parentId?: string;
  projectId?: string;
  agentId?: string;
  metadata?: Record<string, unknown>;
}

interface JarvisGraphLink {
  id: string;
  source: string;
  target: string;
  kind: string;
  weight?: number;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

interface JarvisGraphState {
  nodes: JarvisGraphNode[];
  links: JarvisGraphLink[];
  version: number;
}
```

## 3. Existing repository constraints

The current repository is primarily plain HTML/CSS/JS and does not currently use a React application build pipeline.

Do not rewrite the existing Jarvis desktop for this feature.

Create an isolated app under:

`graph-3d/`

This app may use Vite + React + TypeScript.

The existing desktop remains operational and can later embed or open the graph surface.

## 4. Proposed folder structure

```text
graph-3d/
  package.json
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.tsx
    App.tsx

    graph/
      types.ts
      demoGraph.ts
      graphStore.ts
      graphSelectors.ts
      graphTransforms.ts

    events/
      eventTypes.ts
      eventReducer.ts
      demoEventStream.ts

    components/
      JarvisGalaxy.tsx
      GraphToolbar.tsx
      GraphInspector.tsx
      GraphLegend.tsx
      LiveEventLog.tsx

    rendering/
      nodeFactory.ts
      linkParticles.ts
      cameraController.ts
      forceConfig.ts

    styles/
      app.css

    tests/
      eventReducer.test.ts
      graphSelectors.test.ts
      graphTransforms.test.ts
```

## 5. Visual model

Node semantics:

- Jarvis core: central luminous orb
- Hermes: orchestration orb
- Jev: fast decision orb
- Project: large planetary cluster anchor
- Agent: medium orb
- Memory: small star
- Task: pulsing activity node
- Decision: diamond-like or distinct hot node
- File: compact artifact node
- Tool: utility satellite
- Event: transient particle, not permanent node unless persisted

The visual hierarchy must remain readable at different zoom levels.

At distance:
- show only major clusters and anchors

At medium zoom:
- show agents, projects, task groups

At close zoom:
- show individual memories, decisions, files, and labels

## 6. Interaction loop

Primary loop:

1. User sees the whole Jarvis universe.
2. User selects a cluster or node.
3. Camera moves toward the selection.
4. Unrelated graph content de-emphasizes.
5. Inspector opens with real metadata and relations.
6. User can expand connected nodes or switch to a structured G6 view.
7. Live Event Bus activity continues updating the scene.

Required controls:
- orbit/rotate
- zoom
- click node
- focus selected node
- reset camera
- filter by node kind
- filter by project
- switch SYSTEM / PROJECTS / AGENTS / MEMORY / LIVE
- pause live motion
- toggle labels

## 7. Live Event Bus contract

The graph UI must consume normalized events rather than coupling directly to Hermes internals.

```ts
type JarvisGraphEvent =
  | { type: 'node.created'; node: JarvisGraphNode }
  | { type: 'node.updated'; id: string; patch: Partial<JarvisGraphNode> }
  | { type: 'node.removed'; id: string }
  | { type: 'link.created'; link: JarvisGraphLink }
  | { type: 'link.updated'; id: string; patch: Partial<JarvisGraphLink> }
  | { type: 'link.removed'; id: string }
  | { type: 'activity.started'; source: string; target?: string; activityKind: string }
  | { type: 'activity.completed'; source: string; target?: string; activityKind: string }
  | { type: 'snapshot.loaded'; graph: JarvisGraphState };
```

The first implementation uses a deterministic demo event stream.

Later adapters can translate Hermes/Jev/Bridge events into this contract.

## 8. Live visual activity

Real event -> visual behavior:

- `node.created`: spawn and settle node
- `node.updated`: short pulse
- `link.created`: animate new line in
- `activity.started`: emit particle from source toward target
- `activity.completed`: destination pulse
- agent busy: stronger emissive effect
- failed action: brief red ring
- memory written: new memory star appears near parent cluster

No fake random activity in production mode.

Demo mode may simulate events but must be clearly identified as DEMO.

## 9. Force configuration

Start with `d3-force-3d` through the renderer's exposed force controls.

Goals:
- strong separation between major clusters
- tighter grouping inside a project/team
- stable central core
- avoid excessive graph vibration
- reheat only when graph topology changes

Major anchors can use soft positional constraints rather than hard pinning.

## 10. State management

Keep graph logic framework-light.

The initial version does not need Redux.

Use:
- React state/store module
- pure reducer for graph events
- memoized selectors where useful

Core rule:
rendering is a projection of graph state, not the owner of graph state.

## 11. G6 integration boundary

Do not attempt to render G6 and ForceGraph in the same canvas.

Provide a renderer boundary:

```ts
interface GraphViewAdapter {
  setGraph(graph: JarvisGraphState): void;
  focusNode(id: string): void;
  destroy(): void;
}
```

The 3D renderer is implemented first.

G6 integration comes after the shared graph model and Event Bus reducer are stable.

## 12. Performance targets

MVP target:
- 500 nodes / 1,500 links smoothly on a normal desktop
- dynamic updates without full app reload
- stable interaction while live events arrive

Stretch target:
- 2,000+ nodes with label reduction and lower-detail node rendering

Performance techniques:
- avoid React-rendering one component per 3D node
- use Three.js objects through the force-graph callbacks
- hide labels at distance
- throttle non-critical UI updates
- batch Event Bus updates
- reheat simulation only when necessary

## 13. Mobile behavior

Mobile is a secondary view, not full parity.

Requirements:
- touch rotation and zoom
- inspector as bottom sheet
- reduced particle count
- reduced labels
- lower pixel ratio / rendering detail where needed
- default to focused cluster rather than full huge graph

## 14. Failure handling

If WebGL is unavailable:
- show a clear fallback message
- offer the structured 2D graph view

If event stream disconnects:
- retain last graph snapshot
- mark LIVE state as disconnected
- do not clear the graph

Malformed events:
- reject at normalization boundary
- record them in debug log
- never mutate graph state partially

## 15. Testing

Unit tests:
- event reducer
- node/link normalization
- graph filtering
- cluster selectors
- update batching

Integration tests:
- load initial snapshot
- apply node.created
- apply node.updated
- apply activity event
- change view filter
- selected node remains valid when graph changes

Manual visual verification:
- orbit/zoom
- focus node
- particle flow
- label visibility
- mobile layout
- graph stability after repeated live updates

## 16. MVP acceptance criteria

The feature is MVP-complete when:

1. A Vite React TypeScript app runs under `graph-3d/`.
2. It renders a true WebGL 3D graph using `react-force-graph-3d`.
3. Data is represented by the shared graph model.
4. SYSTEM / PROJECTS / AGENTS / MEMORY / LIVE filters work.
5. Clicking a node updates the inspector.
6. Camera focus works.
7. A deterministic demo Event Bus updates nodes/links live.
8. Activity events generate directional particles.
9. Tests for reducer/selectors/transforms pass.
10. Existing Jarvis desktop is not broken.

## 17. Non-goals for the first implementation

Not in MVP:
- complete Obsidian ingestion
- real Hermes socket integration
- production persistence
- collaborative editing
- full G6 implementation
- VR/AR
- thousands of custom 3D models
- complex shader system

These remain future extensions.

## 18. Implementation order

1. Scaffold isolated React/Vite/TS app.
2. Define graph types and reducer.
3. Add deterministic fixture graph.
4. Add tests for graph state/event handling.
5. Render first 3D graph.
6. Add custom node styles.
7. Add filters and inspector.
8. Add camera focus.
9. Add demo Event Bus.
10. Add particles and activity visuals.
11. Add responsive/mobile behavior.
12. Verify build/tests and protect existing Jarvis behavior.
