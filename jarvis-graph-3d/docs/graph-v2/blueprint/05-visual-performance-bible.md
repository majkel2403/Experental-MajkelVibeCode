# 05 — Visual and Performance Bible

**Status:** Design specification / proposed visual budgets, not observed benchmark results. **2026-10-09.**
**Renderers:** `react-force-graph-3d` / Three.js for 3D; separate G6 for 2D workflow. **Dependency:** interaction spec 04 and domain spec 02.

## 1. Identity: purpose before cinema

The galaxy must communicate something *true* at every scale: WHO exists, WHAT relates, WHICH task is active, WHY an outcome is claimed and WHERE its evidence can be found. Hollywood-level rendering cannot replace semantic honesty. Never create activity packets that a user could mistake for verified Hermes execution.

Visual pillars:
- **Spatial clarity:** strong 6-cluster silhouette at L0, readable local networks at L1–L2.
- **Semantic continuity:** selected entity uses same canonical ID/color across Galaxy, Inspector, G6.
- **Calm default:** motion does not steal focus; events animate locally, not global fireworks.
- **Contrast by meaning:** group color identifies a domain, ring/shape/labels communicate status; do not encode critical state using color alone.
- **Progressive fidelity:** render detail depends on device, visible graph, semantic level, viewport and user preference.

## 2. Domain palette (current DEMO preserved)

| Domain | Base color | Display intent |
|---|---|---|
| Hermes agents/teams | `#B386FF` | orchestration, work ownership |
| Jev decisions | `#FF6CB8` | classification/judgment |
| Projects/tasks | `#628BFF` | organization and delivery |
| Memory/knowledge | `#55EBBB` | references/facts/history |
| Tools/skills/files | `#FFD075` | execution affordances |
| Event Bus | `#61E7FF` | transport activity |

These colors are visible in existing `graph-3d/src/galaxy/data.ts`, though **real domain membership will be assigned by selectors**, not a persisted visual `cluster` field. Status palettes:
- idle = domain material without motion
- running = domain material + rhythmic ring / subtle pulse
- blocked = amber outer ring plus textual status
- failed = red warning outline plus textual explanation
- succeeded = single completion flash then return to base color
- selected = high-contrast white rim, structural relations emphasized
- unauthorized/stale = distinct icon and label, NEVER arbitrary 'connected' badge

## 3. Node hierarchy and geometry

| Semantic element | L0/L1 representation | L2/L3 representation | Rendering |
|---|---|---|---|
| Jarvis system | central luminous core + 1–2 rings | stable navigation anchor | one custom Three.Group |
| Cluster aggregate | larger colored orb + count halo | expand into owned members | custom mesh only for hubs |
| Team | composite orb/cluster envelope | bounded agent satellites | dynamic geometry group |
| Agent | medium glowing sphere | status ring, labels, relations | individual mesh if active |
| Project | faceted sphere/planet | progress/tasks | shared low-poly mesh |
| Task | compact node, only active tasks visible at distance | status edge/milestone | instanced or pooled node |
| Memory/file | constellation dust and aggregate count | star/dot with name if focused | Points / InstancedMesh |
| Decision | diamond/octahedron + proof count | reason and source | shared geometry |
| Tool | satellite, directional action flow | verified tool outcome | shared mesh |
| Event | not default persistent node | optional evidence/timeline reference | directional particle and timeline |

All underlying geometry sizes use semantic importance but cap radius to avoid giant nodes masking neighbors. Do not allocate unique ShaderMaterial per memory node.

## 4. Material/shading recipe

**Profiles are hypotheses for A/B visual benchmarking**, not claims about best hardware settings.

| Feature | Desktop high | Desktop medium | Mobile/low |
|---|---|---|---|
| Bloom strength | 0.55 | 0.32 | off |
| Bloom radius | 0.45 | 0.35 | off |
| Bloom threshold | 0.72 | 0.78 | off |
| Starfield points | 2200 | 1100 | 300–600 |
| Particle hard budget | 128 | 64 | 16–32 |
| Labels | major + focus neighborhood | selected + hubs | selected only |
| Main hub geometry | 24–32 segments | 12–20 | low-poly |
| Pixel ratio cap | 1.5–2.0 | 1.25–1.5 | 1.0–1.25 |

Existing code uses UnrealBloomPass parameters ~`strength=0.58`, `radius=0.6`, `threshold=0.26`: lower threshold admits much more of the scene into Bloom. Selective highlights may look cleaner at higher threshold, but compare **actual screenshots and readability** before adopting values.

Shaders may be reserved for Jarvis core, selected focus, a small number of explicit cinematic transitions. Domain nodes should rely on shared palettes and instance transforms.

## 5. Official example mapping to Jarvis

| Upstream primitive / demo | Target Jarvis feature | Built-in API (approx. from upstream) | Custom logic |
|---|---|---|---|
| Click-to-focus | select/focus node | `cameraPosition`, `onNodeClick` | Camera FSM, cancel/revision |
| Fit to canvas | overview/reset | `zoomToFit` / bounds helpers | content padding, LOD, hidden nodes |
| Node highlight | investigate relationship | `onNodeHover`, `nodeColor`/`linkColor` | adjacency index, selection, dimming |
| Expand/collapse | clusters/subteams | dynamic `graphData` | stable hierarchical projection |
| Emit particles | verified tool/task events | `emitParticle(link)` | authenticated event ID mapping |
| Directional links | visualize delegation/dependency | `linkDirectionalArrowLength`/`RelPos` | edge directed semantics |
| Collision detection | separate dense entities | `d3Force` combined with collision | per-kind radii/tuning |
| Pin after dragging | manual spatial annotation | node `fx/fy/fz` + drag callbacks | persistence opt-in, user control |
| Bloom | emissive highlight | `postProcessingComposer` + UnrealBloomPass | selective Bloom and lifecycle |
| Dynamic graph | live agent/task changes | `graphData` updates | projector, version, stable IDs |
| Large graph | 2k+ elements | base GPU renderer | batching, LOD, instancing, culling |
| DAG layouts | dependencies/workflows | graph DAG options or G6 | cycle detection, correct semantics |

Reference starting points:
- https://github.com/vasturiano/react-force-graph
- https://github.com/vasturiano/3d-force-graph
- https://github.com/vasturiano/d3-force-3d
- https://g6.antv.antgroup.com/en/examples
- https://threejs.org/docs/pages/InstancedMesh.html
- https://threejs.org/docs/pages/UnrealBloomPass.html

**API verification gate:** Check the locked installed dependency versions before coding each adapter; broad upstream feature lists do not prove exact typings are compatible with the installed version.

## 6. Cinematic motion score

| Act | Trigger | Duration proposal | Camera | Node/link effects | Non-visual evidence |
|---|---|---|---|---|---|
| Init reveal | first authorized snapshot | <=1600ms (reduced: 0) | slow overview pullback | clusters appear from low opacity | snapshot timestamp/version |
| Enter cluster | explicit click | 500–1200ms | curved transition preserving orientation | progressive child reveal | cluster count / labels |
| Activity | verified `tool.started` | 250–600ms | no movement | one particle, tool ring | event correlationId |
| Outcome | verified `tool.completed` | 350–800ms | no movement | destination pulse once | call result/evidenceRef |
| Failure | verified failed outcome | 450–900ms | no forced cut | short warning outline, then steady error state | durable timeline item |
| Memory write | confirmed source write | 500–900ms | no movement | memory star birth on owning cluster | memory ID/provenance |
| Cinematic follow | FOLLOW LIVE opt-in | user adjustable | focus current correlated task | event sequence | source status, lastSync |
| Outro/replay | explicit replay end | <=900ms | optional return | fade transient traffic | reproducible event sequence |

Durations are **design starting points**, not measured accessibility/performance winners. Cancel any motion immediately on pointer drag/wheel/Esc.

## 7. Force-directed layout profile

- Domain cluster anchors pinned or softly restrained via layout state only. `fx/fy/fz` are not domain fields.
- Link distance based on semantic edge kind and level, not a blanket number for every relation.
- `forceCollide` radius tied to visual radius plus spacing, with different profile per LOD/tier.
- Simulations warm up when topology changes; metadata-only updates must not replace entire `graphData` arrays or trigger big reheats.
- Large/mostly static graphs may precompute positions in a Worker; never run an unbounded expensive force simulation on the main thread.
- Seed initial new nodes close to parent to prevent cross-scene teleportation, preserve existing positions during updates.

## 8. GPU resources and lifecycle

- Share geometry per type and LOD; use resource-owner refcounts or stable scene-lifetime assets.
- Share material per palette/status where possible; do not mutate shared material state in a way that changes unrelated nodes.
- Cached text texture atlas / canvas text only for selected or major labels; cache size bounded, eviction safe when references drop.
- Dispose `geometry`, `material`, `texture`, `render targets`, `bloom pass` on owner destruction/context reset. A sprite texture cache needs explicit ownership, not a global unbounded Map.
- Track `renderer.info.render.calls`, triangles, `renderer.info.memory.geometries`, textures.
- 50 repeated expand/collapse cycles and 20 mount/unmount cycles should not produce continuing upward resource growth after settling.
- Reduced motion and hidden document may suspend ambient animation, but do not lose cursor/state.

## 9. Performance budget and quality tier

Initial **release criteria to calibrate with real hardware**:

| Scenario | Proposed target | Instrument |
|---|---|---|
| 500 nodes / 1500 links desktop | p50 ≥45 FPS while orbiting; p95 frame ≤28ms | frame callback + PerformanceObserver |
| 200-node mobile viewport | p50 ≥25 FPS with reduced effects | mobile device/browser run |
| hover on medium graph | p95 response <120ms | browser input-to-render telemetry |
| 2000/4000 high density | remains interactive, no >2s freeze | E2E performance harness |
| asset switching | bounded GPU resources after settling | renderer.info |
| startup | actual time-to-interactive recorded | Navigation Timing + first canvas visible |

Do NOT claim these are library guarantees. Record machine GPU, OS, browser, viewport, DPR, package SHA and seeded dataset with every benchmark. `renderer.info` memory counters are indicators; not exact allocated GPU bytes.

**Render strategy by size:**
- ≤500: custom hubs + pooled satellites, selective Bloom/labels.
- 500–2000: grouped meshes/InstancedMesh, label LOD, topology clustering.
- 2000–10000: selective visibility and dense aggregation; optional Points.
- >10000: query/progressive expansion, no attempt to show all at once as separate full mesh nodes.

Tradeoff: library callbacks that assume independent per-node Three.Object3D do not automatically convert to efficient shared InstancedMesh. Prototype hit-testing and update integration separately in Playground before production adapter migration.

## 10. Readability and accessibility acceptance

1. System clusters recognizable within 2 seconds without reading all labels.
2. Colorblind/reduced-motion mode conveys state via shapes/rings/text.
3. In small viewport, controls remain reachable and Inspector does not cover selected node permanently.
4. Bloom does not obscure agent/project names; focus rim must be visually distinct from completion pulse.
5. Tiny memory nodes become searchable in list even if not individually visible.
6. No ungrounded “live packets”: animation log must associate with an observed event/provenance or be marked DEMO.
7. Performance tier switch must not reset canonical selection or node IDs.

## 11. Graph Playground outputs

One sandbox route with: dataset profiles 289/500/2000/10000, topology generators (tree/DAG/galaxy/network/tunnel), graph physics panel, camera choreography, link animation styles, Bloom/pass knobs, quality tier, mobile simulation, reduced motion, screenshots, metrics, JSON presets, deterministic replay. See `07-graph-playground-spec.md`.

All parameters exported as **presentation config**. Production Graph Store unaffected.

## 12. Decision log

- Adopt selective Bloom; exact values subject to screenshots.
- Keep color grouping consistent with present DEMO and expand with status layer.
- Do not write complex shader per node before InstancedMesh/LOD benchmarking.
- Semantic zoom determines visibility first; physics and labels derive from it.
- Any design that depends on ambient movement must have reduced-motion equivalent.
