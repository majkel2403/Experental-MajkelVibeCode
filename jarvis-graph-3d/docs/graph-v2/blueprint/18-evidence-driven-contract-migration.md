# 18 — Source-first contract alignment and minimal migration roadmap

**Status:** PROPOSAL — architecture still awaiting sign-off. **Date:** 2026-10-11.  
**Grounding:** [Doc 17 — verified source-code inventory](17-read-only-code-evidence-inventory.md) + [Doc 16 — design review](16-final-architecture-review.md).  
**Constraint:** Documentation/decision design only. No product code, configuration, dependency, service, branch merge or deployment changes.

## 1. Strategy — repair reality before adding new effects

There are two plausible routes:

**A. Source-first incremental migration — RECOMMENDED.** Keep current Hermes observer, Bridge endpoint, desktop Event Bus and JSONL task summary. Build an approved compatibility boundary around them, then add durable event delivery and only afterwards connect the standalone Graph 3D, Mission Control, memory and G6. This reduces duplication and allows each stage to be checked independently.

**B. Rewrite all producers and renderer together — REJECT for v2.** It would break existing Jarvis consumers, create parallel systems, and make it hard to prove whether a green outcome is genuine.

**C. Browser-only event adapter to old SSE — DEMO/PROTOTYPE ONLY.** Useful for temporary observation, but it cannot guarantee event delivery through restart; do not call it the production v2 Event Bus.

One authorized source-of-truth per piece: producer lifecycle, Bridge ingress, event log, canonical Graph Store, viewer-scoped projection, renderer cues.

## 2. Proposed semantic correction: plan, attempt, outcome

Current source demonstrates `pre_llm_call` and `post_llm_call` events, with `task.completed` for non-empty assistant text. We must disentangle:

| Logical concept | Meaning | Example | Can be marked verified? |
|---|---|---|---|
| `llm_turn` (or model run) | Model finished generating text | `post_llm_call` has a response | verified that a response hook ran; **not** tool success |
| `task` | User goal / work item | make an app | only when trusted task owner records closure |
| `run` | Particular attempt to execute part of task | agent invocation #3 | lifecycle from actual producer |
| `tool_attempt` | Tool call started, then returned a status | `call_id` and `post_tool_call` | hook-reported result, not necessarily committed external side effect |
| `effect_evidence` | Authorized actual result observed | saved file exists / test result / API transaction response | source-specific receipt with trace and scope |
| `transport_connection` | Viewer reachable or STALE | SSE disconnect | derived UI state, independent of task status |
| `visual_cue` | Permitted display signal for an event | short particle | never itself a source of truth |

**No new event type becomes a confirmed real producer contract by appearing in this table.** Exact mapping of hook semantics requires read-only runtime check later.

**Important edge cases for mapping:**
- Tool starts but never posts completion: keep attempt `unknown/running/stale`, not automatically succeeded.
- Hook reports `status='ok'` while external write fails asynchronously: mark **hook-completed**, external effect remains **unverified**.
- A tool returns partial results: preserve `partial` state/evidence, no universal `succeeded`.
- Multiple `pre_llm_call` on one session could overwrite the in-memory `_sessions[session_id]` mapping; confirm actual session/hook lifecycle before using `task_id` as immutable global task ID.
- `tool_call_id` may be absent; use a stable fallback only after source semantics are known, not arbitrary IDs regenerated upon retry.
- Nonempty assistant text should map to an **LLM turn ending event**, not force project task to successful state. Preserve legacy desktop visual signal where needed via compatibility layer.

## 3. Canonical ID and source identity contract (candidate)

| Source | Recommended stable identity | What not to use |
|---|---|---|
| Producer event | authenticated `source` + producer-generated stable `id` | Bridge arrival timestamp alone |
| User task | source-scoped durable task ID | LLM turn number as whole goal ID |
| Run | source session + durable run/attempt ID | selected visual node ID |
| Tool attempt | owner/source + `call_id` + attempt no. | tool name alone |
| Entity | `kind:opaque-stable-id` with tenant/workspace scope | local filesystem path / Three.js object identity |
| Relation | stable relation ID or deterministic source-scoped relation key | transient animation link ID |
| View/snapshot | viewer projection revision + viewer-authorized opaque cursor | raw global event log position readable to a lower-privileged viewer |

The current `GraphEntity/GraphRelation/GraphSnapshot/GraphPatch` proposal from Blueprint 02 is the starting point. F1 remains an **unratified contract refinement**: browser-visible graph version/cursor must be scoped to allowed projection and permissions.

## 4. Keep, adapt and eventually add — no duplication

| Existing component | Preserve | Adapt only when authorized | New component only if proven necessary |
|---|---|---|---|
| Hermes observer hooks | pre/post LLM and tool hooks, non-blocking behavior | event IDs, lifecycle distinction, durable outbox | no second Hermes observer |
| Bridge `/bridge/agent-event` | endpoint for compatibility, allowlist validation and auth | durable ingest acknowledgment, dedupe and checkpoint behind endpoint | no parallel competing Bridge gateway |
| Bridge `agent-history.jsonl` | existing compressed task-summary history | keep for “Film dnia” compatibility; mark summary, not full tool trace | separate full event log/outbox for P0 receipts |
| Old `js/events.js` | desktop reducer and local replay | adapter for accepted canonical event names, no duplicate mutations | no second competing reducer in original desktop |
| `graph-3d/src/App.tsx` | five top-level modes and DEMO | viewer-scoped GraphStore and single cue adapter after contract freeze | no rewrite of React/Three scene |
| Existing `react-force-graph-3d` | renderer and current visual asset work | physical DTO to canonical IDs, GPU pooling, camera fixes | G6 as separate lazy renderer only after base contract |
| Jev | optional judge/decision layer | adapter only if source schema is verified | no invented Jev transport |
| Memory/Obsidian/Hermes DB | approved original index and write receipts | read-only projection of IDs/provenance | avoid blind full-disk scanner or competing memory DB |

## 5. Precise gate ordering (documentation now, execution later)

```text
DESIGN: user review/sign-off of Docs 14/16/18
  ↓
R0 READ-ONLY: inspect current installed Hermes/Bridge/Jev source versions
  ↓
R1: Freeze canonical source lifecycle, event identity and trust boundaries
  ↓
A: Existing Foundation renderer/contract tests against deterministic DEMO
  ↓
C0: Producer outbox + Bridge durable log and authorization (approved local storage)
  ↓
C1: Projector, viewer-scoped snapshot, patch, cursor and safe reconnect
  ↓
C2: First verified tool result through full end-to-end chain
  ↓
B: Mission Control/Second Brain/Director on actual data, after DEMO QA
  ↓
D: G6 cross-view projection, browser + mobile + performance/release review
```

**Dependency nuance:** Galaxy visual improvements (B) can proceed independently on DEMO after Foundation A, while full LIVE event cues and trusted Second Brain knowledge must wait for C gates. G6 can be prototyped with synthetic data after A but cannot claim verified provenance until C2.

**Execution is not authorized by this document.** Even the read-only local runtime audit is a separate stage; this document inspects GitHub source only.

## 6. Paper fixture matrix — future tests and expected results

| Fixture | Source input | Expected canonical behavior | Expected scene |
|---|---|---|---|
| ID-01 | same producer event delivered twice | dedupe once, same ACK/cursor after persisted ingest | one cue only |
| ID-02 | task text "zrobione", tool error | task lifecycle distinct; failed tool attempt/evidence recorded | no green success wave |
| ID-03 | `post_llm_call` with nonempty text and no tools | model turn ended; external action unknown | no verified tool-effect marker |
| ID-04 | tool succeeded at hook but later external effect missing | hook completion separate from effect proof | no false persisted evidence |
| ID-05 | queue of 500 and Bridge offline | P0 retained in future durable outbox; P2 may coalesce | STALE; no fake animation |
| ID-06 | Bridge persists event, ACK lost | idempotent retry returns original event ID/ACK | no repeated node/particle |
| ID-07 | connection resumes after cursor expired | new authorized snapshot and compatible view revision | no leaked graph difference |
| ID-08 | private entity updated, other viewer receives nothing | no private IDs or counts, no visible version gap | unchanged viewer graph |
| ID-09 | user pauses visual cues during LIVE | GraphSnapshot may continue refreshing, effects paused | "EFEKTY WSTRZYMANE" label |
| ID-10 | browser `replay` of task history | no tool calls, no writes to original memory | clearly REPLAY / DEMO where relevant |
| ID-11 | Jev missing | optional judge node absent, no fabricated decision | rest of graph stays functional |
| ID-12 | memory note proposed but no storage receipt | no permanent verified memory node | pending proposal only |
| ID-13 | authorized memory reference revoked | filtered from nodes, edges, search and aggregates | resync scoped snapshot |
| ID-14 | old client consumes legacy task events | no duplicate reducers and no broken Process Log | old desktop functional |

These fixtures belong to **future test specifications**; NOT RUN.

## 7. P0 risk decisions and owners

| Decision | Why | Recommended policy | Blocking evidence |
|---|---|---|---|
| D-01 Which persistence store? | Avoid duplicate databases, assure restart recovery | inspect existing Bridge/local store; prefer smallest durable option with explicit backup/retention | local runtime inventory |
| D-02 Confirm tool result meaning | Prevent unearned `succeeded` | per-tool receipt category and evidenceRef | actual tool statuses and post-conditions |
| D-03 What does `task.completed` mean? | Current plugin uses non-empty model output | map to LLM turn closure; user-task success is separate | source-run semantics |
| D-04 Viewer scope/version/cursor | Prevent privacy leak and version gaps | viewer-scoped projection version + opaque cursor | authorization topology |
| D-05 SSE auth | Existing query token is high-value privilege | split privileged operator auth from read-only viewer auth; avoid query tokens in hosted demo | Bridge auth audit |
| D-06 Jev and memory integration | Source shapes unknown | optional adapters only, restricted viewer projections | source index/schema read-only |

**Recommendations are not approvals.** Preserve a documented fallback: synthetic Graph DEMO with truthful badge, old Jarvis Event Bus unaffected, and no remote LIVE exposure.

## 8. First small meaningful acceptance milestone

**Milestone:** independently verifiable graph navigation in DEMO with one stable canonical ID and consistent L0→L3 inspector.

Definition:
1. A seeded `project` contains a seeded `task` assigned to one seeded `agent`.
2. Clicking the task in Galaxy 3D, Mission and G6 yields the same canonical ID and identical authorized related IDs.
3. An injected synthetic tool-failed event changes only the tool attempt status and triggers one warning, not a verified success.
4. Switching filters does not leave a hidden node as a camera target.
5. 390×844 and WebGL-disabled fallback remain navigable.
6. All checks are recorded against one exact future Git SHA.

This creates a useful milestone **without requiring a LIVE Bridge connection**. It must still be **explicitly authorized before coding**.

## 9. Source pointers and traceability

- [17 — Verified static code inventory](17-read-only-code-evidence-inventory.md)
- [16 — Final architecture review](16-final-architecture-review.md)
- [02 — Domain ontology](02-graph-ontology-contracts.md)
- [03 — Event Bus protocol](03-event-bus-protocol.md)
- [09 — Read-only source verification plan](09-read-only-source-verification-plan.md)
- [10 — Acceptance](10-acceptance-scenarios-and-evidence.md)
- [14 — Unified System Design](14-unified-system-design-review.md)

**No tests, installations or actual runtime changes are performed by producing this planning document.**
