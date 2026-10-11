# 02 — Graph Ontology and Canonical Contracts

**Status:** Proposed version 2.0 schema — MUST be ratified before implementation. **2026-10-09.**

> **2026-10-11 Superpowers review:** [Doc 16 — Architecture Review](16-final-architecture-review.md) identifies **F1**, a blocking ambiguity in `graphVersion` and the replay `cursor` when the server filters private graph changes. Do not implement a global graphVersion as the browser-visible version without a viewer-scope policy. Recommendation pending approval: the snapshot's `graphVersion` represents the per-viewer authorized projection version, with canonical/store revision kept server-side. Cursor is opaque and scoped to the viewer authorization/session. On scope change, require a fresh snapshot. The wire contract is **not frozen**.
**Authority:** domain objects, not physics/screen objects. **Dependencies:** Blueprint 01 and 03.

## 1. Problem and contract freeze

Feature branch `graph-3d/src/galaxy/types.ts` currently uses `NodeKind` and `GalaxyLink.kind` for a mixed visual/domain model: `core` and `hub` describe the scene, `traffic` describes animation, and `agent`/`task` describe entities. We must not keep promoting those fields into persistent memory.
The 2026-10-08 master spec proposed `GraphNode` kinds that differ from the research report's `GraphEntity` vocabulary. **Contract freeze required:** this file recommends a superset; reconcile/update master spec and plans before writing runtime serializers. All example interfaces here are pseudocode proposals, not compiled TypeScript.

## 2. Normalized ontology

| Entity kind | Meaning and identity | Example | Primary source of truth |
|---|---|---|---|
| system | one logical Jarvis OS | `system:jarvis` | Jarvis configuration |
| component | runtime subsystem | `component:bridge` | verified service registry |
| agent | durable AI agent identity | `agent:hermes` | agents registry |
| team | collection of agents | `team:research` | team registry |
| person | human collaborator | `person:<opaque-id>` | authorized contacts |
| project | long-lived effort | `project:jarvis-os` | projects index |
| task | verifiable work item | `task:<stable-id>` | tasks/workflows |
| workflow | defined process | `workflow:deploy` | workflow registry |
| run | single workflow/task execution | `run:<stable-id>` | runtime/event source |
| decision | decision with reason/evidence | `decision:<stable-id>` | Jev/Hermes verified decisions |
| memory | addressable persistent fact/reference | `memory:<stable-id>` | approved memory index |
| file | local file pointer (NOT raw contents) | `file:<opaque-id>` | authorized index |
| artifact | output or document | `artifact:<stable-id>` | artifact registry |
| skill | agent capability definition | `skill:<id>` | verified skill registry |
| tool | executable capability | `tool:<id>` | tool registry |
| event | optional materialized event *reference* | `event:<id>` | durable Event Log |
| evidence | verified result/reference | `evidence:<id>` | Bridge/tool outcome store |

**Rule:** category is domain meaning, not renderer icon. `hub/core/satellite` are visual roles and never replace semantic entity type. `traffic` is not a domain edge.

## 3. Relation taxonomy

| Edge | Direction semantics | Example | Constraint |
|---|---|---|---|
| contains | parent → child | project → task | zero/one designated parent for hierarchy projection |
| owns | owner → resource | team → project | may be many-to-many |
| member_of | agent → team | agent → team | hierarchical team cycle forbidden |
| assigned_to | task → agent | task → Hermes | can change over time |
| delegated_to | agent → agent | manager → specialist | may form cycles if historical; detect |
| depends_on | task → prerequisite | task A → B | DAG view must detect cycles |
| uses | actor/run → tool/skill | run → tool | evidence not implied |
| produced | run → artifact | run → file | only after confirmed result |
| references | item → target | memory → project | may be cyclic |
| derived_from | item → source | decision → evidence | maintain source ID |
| decided_by | decision → actor | decision → Jev | explicit provenance |
| triggered | event/run → downstream | event → run | causal, not chronological guess |
| communicates_with | agent ↔ agent | A ↔ B | undirected or explicit pair |
| related_to | item ↔ item | topic ↔ topic | undirected |

Implement explicit `directed` and optional `validFrom/validTo` rather than representing every link as a task arrow. `contains` for a visual tree must not be used to hide actual cross-project relationships.

## 4. Candidate TypeScript contracts

```ts
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type EntityId = string;
export type RelationId = string;
export type EntityKind =
  | 'system' | 'component' | 'agent' | 'team' | 'person' | 'project'
  | 'task' | 'workflow' | 'run' | 'decision' | 'memory'
  | 'file' | 'artifact' | 'skill' | 'tool' | 'event' | 'evidence';
export type EntityStatus = 'unknown' | 'idle' | 'queued' | 'running' |
  'blocked' | 'succeeded' | 'failed' | 'cancelled' | 'archived';
export type Classification = 'public' | 'internal' | 'confidential' | 'restricted';

export interface Provenance {
  sourceSystem: string;              // trusted allowlist, not raw event text
  sourceRef?: string;                // opaque internal ref
  originEventId?: string;            // source+event id pair preferred
  observedAt: string;                // ISO timestamp: when accepted
  evidenceRef?: string;              // only confirmed outcomes
}

export interface GraphEntity {
  schemaVersion: '2.0';
  id: EntityId;                      // stable namespace:id
  kind: EntityKind;
  label: string;                     // safe display text, not HTML
  status: EntityStatus;
  parentId?: EntityId;              // designated display hierarchy, optional
  scope?: { projectId?: EntityId; taskId?: EntityId; workspaceId?: string };
  provenance: Provenance;
  classification: Classification;
  createdAt: string;
  updatedAt: string;
  revision: number;                  // strictly increasing per entity
  attributes: Record<string, JsonValue>; // allowlisted by kind!
}

export type RelationKind =
  'contains' | 'owns' | 'member_of' | 'assigned_to' | 'delegated_to' |
  'depends_on' | 'uses' | 'produced' | 'references' | 'derived_from' |
  'decided_by' | 'triggered' | 'communicates_with' | 'related_to';

export interface GraphRelation {
  id: RelationId;
  kind: RelationKind;
  sourceId: EntityId;
  targetId: EntityId;
  directed: boolean;
  revision: number;
  provenance: Provenance;
  classification: Classification;
  updatedAt: string;
  attributes?: Record<string, JsonValue>;
}

export interface GraphSnapshot {
  schemaVersion: '2.0';
  graphVersion: number;
  generatedAt: string;
  cursor: string;                    // opaque server-issued replay cursor
  nodes: GraphEntity[];
  edges: GraphRelation[];
}

export interface GraphPatch {
  schemaVersion: '2.0';
  baseVersion: number;
  graphVersion: number;
  upsertNodes: GraphEntity[];
  removeNodeIds: EntityId[];
  upsertEdges: GraphRelation[];
  removeEdgeIds: RelationId[];
  cursor: string;
}
```

**IMPORTANT:** A patch must be applied atomically. `graphVersion=baseVersion+1` is the initial recommended invariant (unless batching is explicitly versioned). A patch missing intermediate versions is rejected and triggers resync. An entity update with stale `revision` must not overwrite a newer one. Node deletion must cascade/resolve incident edges in projector. Reference checks happen on final committed state.

## 5. Invariants and validation policy

- IDs are immutable, nonempty, length-capped, namespaced and unique; source ID collision must not create an entity with another identity. Opaque file/person IDs are preferred to raw paths/emails.
- `edges[].sourceId` and `targetId` refer to existing entities in the materialized resulting graph (except documented pending-reference staging not exposed to UI).
- Entity `kind`, relation `kind`, status and classification use allowlisted enums and versioning, unknown enum triggers rejection/migration.
- Default classification is **restricted on absent/unknown policy** for local memory, file or person data, until explicit allowed scope.
- Do not confuse model output with verified action. `succeeded` requires authoritative successful tool result; task completion event may not prove every tool side effect.
- User secrets/private bodies never placed in `label` or generic `attributes`. Field-level allowlists and redaction apply before browser serialization, NOT only after delivery.
- Graph projector is deterministic for same ordered inputs, including retained provenance.
- Force-directed simulation mutates cloned layout DTOs; it never mutates authoritative GraphEntity records.

## 6. Shared GraphStore API

```ts
interface GraphStore {
  getSnapshot(): Readonly<GraphSnapshot>;
  getNode(id: EntityId): Readonly<GraphEntity> | undefined;
  getNeighbors(id: EntityId, maxHops: 0|1|2): ReadonlySet<EntityId>;
  applyPatch(patch: GraphPatch): { ok: true; version: number } |
    { ok: false; reason: 'VERSION_GAP'|'INVALID_PATCH'|'UNAUTHORIZED' };
  subscribe(listener: (version: number) => void): () => void;
}
type SemanticLevel = 'universe'|'cluster'|'neighborhood'|'evidence';
interface GraphViewQuery {
  level: SemanticLevel;
  clusterId?: EntityId;
  selectedId?: EntityId;
  search?: string;
  limit?: number;
}
```

Store's index: `Map<EntityId,Entity>`, `Map<RelationId,Relation>`, adjacency `Map<EntityId,Set<RelationId>>`; materialized arrays only in immutable selectors. Maintain separate `ViewStore` for selection, focus, filters and camera so UI state does not become a fake domain fact.

## 7. Projection into 3D and G6

```text
GraphSnapshot (security-filtered) ──> GalaxySelector → GalaxyNodeDTO{x,y,z,fx,fy,fz,visualRole,visible,...}
                                 └─> G6Selector     → {nodes:[{id,data,style}],
                                                        edges:[{id,source,target,data}],
                                                        combos:[]}
```

Rules:
- Keep entity ID identical in both.
- `GalaxyLink` `source/target` can be replaced/mutated by force-graph; never reuse these mutable objects as authoritative domain links.
- Directed event flow visuals can use transient routing info; do not save `traffic` as semantic relation.
- Positions, color, Bloom, glyph, force, label, hover/highlight and LOD are separate presentation policies keyed by ID.
- G6 combos model selected containment/grouping, not every edge. Guard cycles and consult G6 docs regarding Combo incompatibility in tree layouts.
- Hidden/filtered selected item: keep selection in ViewStore with a not-visible notice OR explicitly clear on navigation according to Interaction spec; never teleport camera to missing node.

## 8. Migrations: old to new

| Existing | New mapping | Status |
|---|---|---|
| GalaxyNode.kind=core | system:jarvis + visualRole=core | deterministic fixture |
| GalaxyNode.kind=hub | component/team/project aggregate + visualRole=hub | depends on source |
| GalaxyNode.kind=file | kind=file | preserve only allowed metadata |
| GalaxyLink.kind=traffic | event animation cue | never persist as edge |
| GalaxyLink.kind=relates | related_to | directed=false |
| `js/events.js` event ID `evt_<seq>` | transport-scoped dedupe, new producer-generated stable id | do NOT assume survives restart |
| `hermes...` task IDs | canonical mapped task IDs | verify collisions, scope and lifecycle |
| historical/unknown entities | unverified placeholder or omitted | no fake provenance |

**Compatibility:** Keep `buildGalaxy(seed,density)` fixture adapter for DEMO; never promote synthetic labels into LIVE.

## 9. Tests needed to freeze contract

- Entity schema, unicode labels, 0/1/10k elements, invalid and duplicated IDs; unknown types/status; forbidden attributes.
- Dangling edges, self-links, many-to-many, cyclic team hierarchy, DAG dependency cycle, deletions.
- Out-of-order revision, patch base mismatch, deterministic replay, consistent neighbor lookup.
- Sensitive file paths and tokens are absent after browser projection.
- 3D and G6 both produce the same canonical IDs and relation counts for the same filters.
- Migrating existing seeded DEMO has fixed IDs/counts independent of renderer.

## 10. Open decisions (BLOCKING contract freeze)

1. Should `run` and `evidence` be actual nodes or references-only? This blueprint proposes nodes for deep inspection and event references for high-volume streams.
2. How much historical graph state is retained vs event log only?
3. Are people/workspaces shared or personal-only? That changes ACL.
4. What is authoritative for memory: Obsidian index vs existing Hermes memory DB?
5. How is task status mapped when a hook produces assistant text but tools have partial failure?
6. Rename master specification to `EntityKind`/`GraphEntity` or preserve `GraphNode` alias? One canonical choice needed.

## References

- [G6 data and separation of business attributes](https://g6.antv.antgroup.com/en/manual/data/)
- [G6 Combo](https://g6.antv.antgroup.com/en/manual/element/combo/overview)
- [D3 force 3D](https://github.com/vasturiano/d3-force-3d)
- [Existing mixed renderer types](https://github.com/majkel2403/Jarvis-/blob/feat/jarvis-graph-3d/graph-3d/src/galaxy/types.ts)
