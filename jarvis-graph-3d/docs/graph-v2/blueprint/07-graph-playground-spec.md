# 07 — Graph Playground Laboratory Specification

**Status:** preimplementation design, not a running app. **2026-10-09.**
**Mission:** A controlled sandbox for discovering beautiful and performant 3D structures *before* they become Jarvis Graph product defaults.

## 1. Distinguish Playground from Jarvis live

The Playground is not production Jarvis, not a gateway and not a write client for Hermes/Bridge. It runs **synthetic deterministic fixtures** and exports only renderer/interaction configurations. Live event fixtures are simulated and conspicuously marked DEMO.

It should be an isolated route under graph-3d (e.g. /lab), code-split from the normal Galaxy, with a shared read-only graph domain projection but independent camera/render parameter state. Nothing in the lab can send a command to a local tool.

## 2. Laboratory layout

Desktop design:
- Left: Scene Library — graph layouts, hierarchy samples, dataset size and seed.
- Center: true Three.js / ForceGraph3D canvas, camera presets, 3D gizmo, screenshot/replay.
- Right: tabs Physics, Camera, Visuals, Links/Particles, Nodes, Performance, Accessibility.
- Bottom: active parameters, renderer stats, recent deterministic demo events, FPS/frame chart, “A/B Compare”.
Mobile: single preview with drawer controls; no compulsory side-by-side 3D canvases.

## 3. Scene library (12 variants)

| ID | Variant | Purpose | Topology |
| --- | --- | --- | --- |
| 01 | Galaxy overview | six Jarvis domains | central hub + 6 colored clusters |
| 02 | Brain network | memory association | modular dense graph with long-range links |
| 03 | Team hierarchy | 20 managers / subteams | tree with explicit cross-links |
| 04 | Project solar system | project/task ownership | planet moons / grouped hierarchy |
| 05 | Workflow DAG | dependency direction | acyclic directed phases |
| 06 | Agent conversation | multi-agent messages | sequence and source/timestamp paths |
| 07 | Neural tunnel | cinematic navigation | layered directed network |
| 08 | Event constellation | ongoing tasks | time-sliced dynamic snapshot |
| 09 | Memory knowledge web | entities, files, decisions | large heterogeneous clustered graph |
| 10 | Risk/dependency map | blockers and impact | directed mixed graph |
| 11 | Dynamic growth | entity creation/deletion | deterministic timed event patches |
| 12 | Stress arena | benchmarks | reproducible synthetic 289/500/2000/10000 nodes |

Graph datasets should be stable with seed, connectedness parameter, duplicate/cycle controls, and fixed ID scheme. For memory or a large graph, avoid accidental inclusion of real private data.

## 4. Adjustable controls and ranges (proposed)

| Panel | Parameter | Starter range | Result |
| --- | --- | --- | --- |
| Physics | charge strength | -5 to -300 | node repulsion |
| Physics | link distance | 15 to 200 | spacing |
| Physics | collision padding | 0 to 24 | overlap separation |
| Physics | velocity decay | 0.05 to 0.9 | damping |
| Physics | alpha decay | 0.005 to 0.12 | time to settle |
| Camera | perspective FOV | 25 to 80 degrees | depth/composition |
| Camera | orbit speed | 0 to 1.5 | automatic slow rotation |
| Camera | transition duration | 0 to 1500 ms | navigation movement |
| Camera | fit padding | 1.0 to 2.5 factor | reset framing |
| Visual | Bloom strength | 0 to 1.2 | selective glow |
| Visual | Bloom threshold | 0 to 1.0 | luminance inclusion |
| Visual | Bloom radius | 0 to 1.0 | halo spread |
| Visual | starfield count | 0 to 2500 | atmospheric detail |
| Node | label tier | selected / hubs / semantic / all | density of text |
| Node | detail level | 0–3 | mesh/instancing |
| Links | arrow length | 0 to 12 | semantic direction |
| Links | width | 0.1 to 3 | visual prominence |
| Links | particle budget | 0 to 128 | allowed transient activity |
| Performance | DPR max | 0.75 to 2.0 | fill-rate tradeoff |
| Accessibility | reduced-motion | off/on | disable ambient movement |

Initial ranges are UI/testing limits, **not validated optimal settings**. Cap unreasonable combinations and show a warning for expensive stress profiles.

## 5. Interaction tests within Playground

- Hover: neighbors 1-hop / 2-hop, dim unrelated, restore on pointer exit.
- Click: node inspector, camera focus, stable selection.
- Shift-click multi-select, expand/collapse, breadcrumb back.
- Pin/unpin after drag, layout reheat and reset.
- Discrete event particle on selected edge versus continuous ambient particles.
- LOD switch L0→L1→L2→L3 without losing selected entity ID.
- Toggle Bloom, force profile and labels at runtime; verify GPU object lifecycle.
- Reconnect/replay simulation: gap, duplicate, stale snapshot, delayed events.
- Explicitly indicate unsupported combos (e.g. canvas labels at huge node count).

## 6. Deterministic demo event timeline

Example fixture (synthetic):
1. Task created by Hermes.
2. Jev assigns decision outcome.
3. Hermes invokes a tool.
4. Bridge reports succeeded/failed.
5. Memory index emits persisted write.
6. Activity ends.
7. Optional negative variant: Bridge disconnects, replay reorders 2/3 and fails outcome.

Timeline can pause, step frame/event, jump to a cursor, change speed (0.25×–4×), and save a trace. Replaying simulation changes the local demo graph only, never any real process state.

## 7. A/B visual comparison

Compare two configurations on the **same seed/dataset/camera/viewport**, sequentially by default on constrained devices. Export:
- config A and B as JSON (no secrets/source blobs);
- browser screenshots captured from actual running WebGL scenes;
- camera coordinates/zoom, renderer package versions and git SHA;
- p50 FPS, p95 frame time, draw calls, triangles, geometry/texture counts;
- human choice and rationale (readability, effect, perceived focus).

One setting can be promoted into a *reviewable JSON preset*, not automatically applied to Jarvis product settings.

## 8. Suggested validated config shape

~~~ts
export interface GalaxyPresetV1 {
  schemaVersion: '1';
  name: string;
  fixture: { id: string; seed: number; nodeCount: number; edgeCount: number };
  physics: { charge: number; linkDistance: number; collisionPadding: number; velocityDecay: number; alphaDecay: number };
  camera: { fov: number; orbitSpeed: number; transitionMs: number; fitPadding: number };
  visuals: { bloom: boolean; strength: number; radius: number; threshold: number; stars: number };
  links: { width: number; arrowLength: number; particleBudget: number };
  quality: { dprMax: number; labelTier: 'selected'|'hubs'|'semantic'|'all'; reducedMotion: boolean };
}
~~~

All values require strict import validation; incompatible future versions must show a migration warning, not silently apply unknown shader code. Do not support arbitrary JavaScript in preset fields.

## 9. Performance and mobile test matrix

| Profile | Nodes / links | Desktop | Mobile | Evidence |
| --- | --- | --- | --- | --- |
| Default | 289 / generated | screenshot, orbit, bloom | reduced effects | measured FPS and render stats |
| Medium | 500 / 1500 | collision, hover, camera | 200/400 mobile subset | p50, p95, memory |
| High | 2000 / 4000 | aggregation / InstancedMesh | selected context only | interaction responsiveness |
| Extreme | 10000 / scaled | aggregated and bounded | don't show all nodes | crash-free and timeout rules |

Under large load, the lab must show FPS/warning and provide one-click low-quality fallback. It must never intentionally stress a device without informing the user.

## 10. Suggested folder structure

~~~text
graph-3d/src/playground/
  PlaygroundPage.tsx
  controls/
    PhysicsPanel.tsx
    VisualPanel.tsx
    CameraPanel.tsx
    EventsPanel.tsx
  scenes/
    sceneRegistry.ts
    sceneGenerators.ts
    stressFixtures.ts
  engine/
    presetSchema.ts
    presetReducer.ts
    replayController.ts
    benchmarkHarness.ts
  tests/
    presetSchema.test.ts
    sceneGenerators.test.ts
    replayController.test.ts
    benchmarkHarness.test.ts
graph-3d/e2e/playground.spec.ts
~~~

Use the same underlying ForceGraph3D APIs as Jarvis, but never mutate the authoritative Graph Store. Load the laboratory page lazily and make screenshot/export browser-first.

## 11. Acceptance gate for Playground

- 12 distinct scene templates render true 3D and can be changed without refresh.
- At least physics, camera, Bloom, particles, labels and quality can be adjusted and reset.
- Import/export of validated preset produces identical seeded results for a fixed package/browser configuration within known graphics limits.
- Recorded benchmark includes input fixture, git SHA, device/viewport and quantitative metrics.
- Touch 390×844, reduced-motion and WebGL fallback tested.
- No external runtime Bridge credentials or private data in lab requests/output.
- A/B comparison yields a reviewable preset suitable for deliberate adoption in Galaxy UI.

## Sources

- https://github.com/vasturiano/3d-force-graph
- https://github.com/vasturiano/react-force-graph
- https://github.com/vasturiano/d3-force-3d
- https://threejs.org/docs/pages/InstancedMesh.html
- https://g6.antv.antgroup.com/en/examples
