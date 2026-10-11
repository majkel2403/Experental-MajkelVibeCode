# 16 — Superpowers: finalny przegląd architektury (propozycja do zatwierdzenia)

**Data:** 2026-10-11. **Status:** REVIEW COMPLETE AS DOCUMENTATION, **DESIGN NOT APPROVED**.  
**Repo/branch:** `majkel2403/Experental-MajkelVibeCode` → `docs/jarvis-graph-v2-mission-brain-motion`.  
**Scope:** Only design audit and written corrections. No code, runtime audit, new services, dependencies, deployment or merge.

## 1. Jaki problem naprawdę rozwiązujemy?

One Jarvis Graph, not three disconnected applications. The user wants to see what Hermes and agents are doing, what was genuinely completed, how decisions relate to memory and source evidence, and an attractive event-driven 3D interface. The most important property is **semantic truth**: do not mistake LLM prose for a tool result or a DEMO pulse for real activity.

Current prototype (historical baseline) supports a synthetic 3D Galaxy. Actual Hermes → Bridge → durable log → graph projection remains unverified/not implemented by these docs.

## 2. Zastosowana metoda @Superpowers

- **Architectural path:** inspect design docs 02, 03, 08, 09, 11–15 and reconciled Master Spec; compare vocabulary, data ownership, lifecycle, privacy, execution assumptions.
- Choose the **shared canonical graph + event log with read-only contextual lenses** approach; alternatives (three stores, one giant force graph owning domain state) remain rejected as proposed in Doc 14.
- Fix contradictions **in the documentation only**. Do not mark proposals accepted or contract frozen without user review.
- The resulting acceptance decision is *a human sign-off on documented rules*, not authorization to implement.

## 3. Reconciliation matrix (what is decided on paper)

| Issue | Prior conflict | Recommended uniform rule | Status |
|---|---|---|---|
| Domain vocabulary | Master old `GraphNode/core` vs Blueprint `GraphEntity/system` | Canonical `GraphEntity` + `GraphRelation`; `core/hub/traffic` = render DTO/cue | **PROPOSED, docs aligned** |
| Single truth | Scene 3D, G6, Mission, Brain could store own data | One trusted projector/GraphStore; presentation projections and ViewState separate | **PROPOSED, docs aligned** |
| Source of execution outcome | LLM text interpreted as task/tool success | Separate task, run, tool, connection states; successful side effects require authoritative receipt | **PROPOSED, source evidence pending** |
| Optional Jev | Some stories imply mandatory judge | Jev is optional; graph remains functional without its producer | **PROPOSED, docs aligned** |
| Memory saved vs suggested | `persisted` not in EntityStatus; `suggested` not a verified edge | Source-confirmed persistence is separate metadata; model-suggested links live in tentative overlay | **PROPOSED, typed schema pending** |
| Semantic zoom vs views | SYSTEM/AGENTS/PROJECTS/MEMORY/LIVE vs Mission/Team/Trace | Five top-level modes, contextual lenses and shared semantic L0–L3; L3 evidence panel | **PROPOSED, docs aligned** |
| Animation cues | Some specs require nonempty GraphPatch before every cue | An accepted, authorized, deduplicated event + compatible projected state may produce a cue; do not animate duplicate retries or hidden entities | **PROPOSED, docs aligned** |
| Connection down | Disconnected conflated with task cancelled | STALE transport is separate; last good viewer-scoped graph stays with timestamp and no fake new LIVE activity | **PROPOSED, docs aligned** |
| PAUSE / FREEZE / REPLAY | Stop subscription vs visual pause vs freeze physics | PAUSE VISUAL stops *new cues*, not durable delivery; FREEZE SCENE affects renderer only; REPLAY is read-only historical playback | **PROPOSED, see precise rule below** |
| Hierarchical link direction | Some diagrams use arbitrary task containment | `contains` is ownership/hierarchy; `depends_on` is directed dependency; source and target from authenticated facts | **PROPOSED, docs aligned** |
| Old roadmap labels | historical feature branch and old contracts remain in plan | Historical location explicitly named; older A/B/C/D plans have cross-references, future M/K/V plans are docs only | **DOCUMENTED, not executed** |

## 4. Three important contract holes requiring explicit ADR

### F1 — Authorization-scoped graph versions and cursors (P0)

**Discovered gap:** Doc 02 defines one `GraphSnapshot.graphVersion` and Doc 03 demands contiguous `GraphPatch.baseVersion`. If the server hides an update to a restricted entity from the viewer, a raw global version can advance without sending a corresponding authorized patch. The viewer then sees a version gap. Sending empty patches for every private change could reveal the rate of hidden activity.

**Proposed resolution:** distinguish the trusted **canonical store revision** from a **viewer-scoped projection revision**. The browser's `graphVersion` and opaque replay `cursor` should be scoped to that viewer's permissions and stream session; increment them only for a materialized authorized view transaction. On scope/permission change, invalidate the old cursor and require a new authorized snapshot. Do not expose canonical hidden-object counts or raw global log positions.

**Specification impact:** either amend `GraphSnapshot/GraphPatch` to explicitly define `graphVersion` as *viewer projection version* and keep canonical revision server-side, or add a distinct, versioned `viewGraphVersion`. Choose one in ADR before serialization. **DO NOT silently change wire schema now.**

**Paper tests:** hidden update cannot cause visible gap or leak counts; permitted patch applies atomically; permission revocation forces new snapshot; cursor from prior access is invalid.

### F2 — What PAUSE actually pauses (P0 UX + reliability)

**Proposed behavior:** `PAUSE EVENTS` in the user interface means **pause new *visual cues*** while the trusted event log and authorized snapshot stream continue processing. Show an explicit indicator such as “EFEKTY WSTRZYMANE — DANE NADAL SIĘ AKTUALIZUJĄ”. On resume, keep current graph state and do **not** replay buffered old particles as if they are new LIVE events. If user wants historical animation, enter an explicit separate **REPLAY** mode. If the network itself pauses/disconnects, mark STALE and resync from the authorized cursor; never silently claim LIVE.

`FREEZE SCENE` means visual physics/camera motion freeze, not backend pause. Normal keyboard/inspector navigation should remain available through accessible DOM controls even if the WebGL renderer cannot handle interaction while paused. `DEMO PAUSE` may independently stop the synthetic event generator.

**Paper tests:** P0 receipts continue arriving during pause; pause does not suppress user selection; resume gives no duplicate success pulse; REPLAY creates no real tool calls; freeze does not pause Hermes.

### F3 — Event category vs transport connection state (P1)

**Observed inconsistency:** `source.disconnected`, `stream.disconnected` appear in catalogues as if durable producer event names, but often disconnect is a **client-derived connection state**. `task.assigned` and `memory.written` are also candidates, not proven current producer types.

**Proposed resolution:**
- Maintain **producer-sourced, validated domain events** (task/run/tool/memory/decision) separately from **client/server-derived transport state** (`CONNECTED/STale/RECONNECTING/UNAUTHORIZED`).
- If source emits a documented authoritative availability event, map it explicitly; otherwise no fabricated durable `source.disconnected` record.
- Publish a versioned event-name compatibility matrix only after read-only producer inventory. No unverified event types become required build inputs.

**Paper tests:** disconnect does not cancel a task, transport resume does not create new work, and unsupported Jev type is safely ignored without inventing a decision.

## 5. Unknowns we cannot resolve by reading design docs

| Unknown | Why it blocks REAL-LIVE | How to verify later (read-only) |
|---|---|---|
| Actual Hermes hook identity and tool receipts | Cannot tell plan/attempt from confirmed result | Inspect current hook and Bridge result adapters and safe samples |
| Actual Bridge ingest auth and ACK/persistence order | Cannot promise durable retry/replay | Inspect current endpoint handler, DB and SSE |
| Jev actual decision emitter | Cannot map invented fields as real | Read current Jev source and samples |
| Memory source stable IDs and write receipts | Cannot show permanent verified memory or rename semantics | Inspect allowed memory index/storage metadata |
| Remote viewer and credential policy | Cannot safely enable Vercel LIVE | Separate auth/network decision and owner approval |
| Event retention / history coverage | Cannot guarantee yesterday's timeline | Inventory the actual log/snapshot policy |
| WebGL performance and 390×844 | Cannot claim FPS or responsive result | Future browser E2E and hardware benchmarks |

Until these checks are performed, **Gate C = BLOCKED/NOT VERIFIED**. A visually working DEMO is not REAL-LIVE proof.

## 6. Design-only acceptance examples

- **Tool failed while assistant wrote “done”:** Mission displays failed attempt and verified receipt, Second Brain shows only real evidence, Director shows warning and no success pulse.
- **Memory proposed without write receipt:** no confirmed permanent memory; optional pending proposal is clearly separate.
- **Hidden private node updated:** other viewers receive no revealing delta and no version gap. Their viewer cursor and graph version follow allowed updates only.
- **Pause during 1000 events:** trusted log receives all P0/P1; UI can coalesce optional cues, displays still-current graph with effects paused.
- **Camera override:** user drag cancels FOLLOW LIVE. No old tween reclaims camera.
- **Reconnect after retention expires:** browser fetches fresh authorized snapshot; old cursor never replays unauthorized data.
- **Jev absent:** Mission works without a judge entity. Synthetic lab may show Jev fixture explicitly DEMO.
- **G6 and Galaxy:** same entity ID and current authorized relation set, no second source-of-truth state.

## 7. What the user is being asked to approve (not approval yet)

1. **Architecture A**: one canonical GraphStore, independent read-only views.
2. **Domain/event naming**: `GraphEntity/GraphRelation/GraphSnapshot/GraphPatch/JarvisEventV1` proposals.
3. **P0 policies**: separate verified outcomes, viewer-scoped graphVersion and cursor, and precise PAUSE/REPLAY behavior.
4. **Data permissions**: local/private by default, hosted Vercel DEMO, no graph-based automatic tool execution.
5. **Experience**: five top-level modes, Mission/Brain/Trace as contextual views, L0–L3 semantic detail, manual camera as default.

Approval of this design **only** permits further spec/implementation-plan maintenance. A later explicit instruction must authorize coding and runtime tests. No merge or production deployment is authorized by design approval.

## 8. Next actions, in strict order

- [x] Read current design docs and historic Master Spec for conflicts (documentation review, not runtime test).
- [x] Produce proposed reconciliation + gaps F1/F2/F3 and demo-vs-live evidence requirements.
- [ ] User reviews Doc 14 and this Doc 16; accepts or asks for corrections.
- [ ] On approval, ratify ADR-101..107 and F1–F3, then pin one canonical wire contract in 02/03.
- [ ] Under separately permitted **read-only** Hermes/Bridge/Jev memory audit, collect sanitized current source evidence (Doc 09).
- [ ] Re-review existing A/B/C/D and M/K/V implementation plans against ratified contract.
- [ ] Only with an explicit later instruction, begin implementation on an isolated feature branch with tests. No automatic merge to `main`.

## 9. Documents referenced

[02 Ontology](02-graph-ontology-contracts.md) · [03 Event Bus](03-event-bus-protocol.md) · [08 ADR Candidates](08-architecture-decisions-candidate.md) · [09 Source Audit Plan](09-read-only-source-verification-plan.md) · [11 Mission](11-mission-control-design.md) · [12 Brain](12-second-brain-graph-design.md) · [13 Director](13-cinematic-event-director-design.md) · [14 Unified Design](14-unified-system-design-review.md) · [15 Superpowers Sign-off](15-superpowers-design-review-gate.md).

**Verification note:** This file documents a design review. It does **not** establish that a real event stream is durable, that the application builds, or that any browser E2E test has passed.
