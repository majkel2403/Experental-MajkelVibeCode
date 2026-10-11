# 17 — Read-only code evidence inventory (Hermes → Bridge → Jarvis → Graph 3D)

**Status:** SOURCE CODE VERIFIED, RUNTIME NOT VERIFIED. **Review date:** 2026-10-11.  
**Repository:** `majkel2403/Experental-MajkelVibeCode`, branch `docs/jarvis-graph-v2-mission-brain-motion`.
**Scope:** GitHub source inspection ONLY — no local files, services, secrets, tests, installs, production endpoints, or `main` changes.
**Rule:** Evidence proves behavior visible in **these checked-in source revisions**. It does **not** prove which version is installed/running on the user's laptop, nor that Vercel Preview works.

## 1. Executive finding

We already have a functioning **conceptual route** from Hermes hooks to Bridge and the old Jarvis desktop, but it is **best-effort**, not a durable, fully verifiable event stream. The standalone Graph 3D app still runs a seeded `setInterval(..., 2500)` DEMO, **not** that route. A limited task-history JSONL exists on the Bridge side, but does not retain all tool outcome events; it is not an authoritative append-only event log.

**Primary architecture recommendation:** preserve the existing producers and compatibility hooks, create an **adapter/projection boundary** only after approval, do not replace the working Jarvis desktop Event Bus wholesale, and never label a live result as verified without a real outcome receipt.

## 2. Evidence matrix — inspected source paths and blob SHAs

| Component | Path relative to experimental package `jarvis-graph-3d/` | Blob SHA (GitHub) | Grounded code evidence | Verification |
|---|---|---|---|---|
| Hermes event hook | `hermes/plugins/jarvis-events/__init__.py` | `5fb8763d8dd1d0316394376f12c09fed000068fd` | queue 500; enqueue and send failures can silently drop; `post_llm_call` maps non-empty response to `task.completed` | **CODE VERIFIED** |
| Bridge handler & SSE | `bridge/jarvis_bridge.py` | `0f18ab6ffbca9ba219d975524270ec5467103bb8` | `/bridge/agent-event` cleans, appends in-memory deque and broadcasts to connected clients; no full source-level durable ACK/cursor implementation shown in handler | **CODE VERIFIED** |
| Limited task history | `bridge/day_history.py` | inspected source in same branch | writes only `task.created` / `task.completed` / `task.failed` to JSONL, 8d/3000 row retention | **CODE VERIFIED** |
| Browser-local Event Bus | `js/events.js` | `c220588ef6705ddaca26ec82ad25da14bb7dd016` | sequential `evt_<n>` ID resets on process lifecycle; 400 events/task and 30 tasks capped in-memory; replay emits synthetic events through reducer | **CODE VERIFIED** |
| Graph 3D demo | `graph-3d/src/App.tsx` | `dfae7a8d9c9cc2e898677a7382d4740b3df42a85` | `buildGalaxy(42,density)`, fixed `ROUTES`, timer advances every 2500 ms when playing; `LIVE` is a synthetic view | **CODE VERIFIED** |
| Galaxy DTO | `graph-3d/src/galaxy/types.ts` | `99e647c5cbc3b45da67022b683b86687aa173208` | presentation kind `core/hub/traffic` mixed with semantic `agent/task/memory`; force-graph mutable source/target endpoints | **CODE VERIFIED** |
| Galaxy renderer | `graph-3d/src/galaxy/GalaxyScene.tsx` | `322e262de65edd1814212c56267aa5c5b4b2b480` | Three.js + React Force Graph 3D, copied nodes/links for simulation, WebGL probing, size observer | **CODE VERIFIED** |
| Package config | `graph-3d/package.json` | `6aeee0f8d13c71728a6bdf89749dd86e8240701a` | React, Three, Vite, Vitest; scripts `dev/build/test/typecheck`; G6 and browser E2E runner not declared in this package | **CODE VERIFIED** |

## 3. Hermes producer — what actually happens

**From** `hermes/plugins/jarvis-events/__init__.py`:
- Lines 24–30: platforms `api_server/subagent/curator/background_review` are excluded; sender queue `maxsize=500`.
- Lines 45–66: sender calls HTTP `POST /bridge/agent-event` with `X-Bridge-Token`; failures are swallowed without retry; when queue is full, event is dropped.
- Lines 101–110: `pre_llm_call` generates `task_id` and emits `task.created`.
- Lines 112–126: `pre_tool_call` and `post_tool_call` emit `tool.started` / `tool.completed` / `tool.failed`. Outcome is interpreted from hook status; determine the actual source semantics and whether a successful return proves external side-effect completion.
- Lines 128–135: `post_llm_call` emits **`task.completed` if assistant_response contains non-whitespace text; otherwise `task.failed`**. This is not a general proof that all tasks/tools succeeded.
- No stable source-generated event ID or persisted source-local sequence is visible in the basic `_emit` envelope (`v/type/ts/payload`), so real dedupe and lossless replay are NOT established by this producer.

**Impact:** **P0** for truthful LIVE provenance. A graphical green success pulse cannot rely on `task.completed` alone.

## 4. Bridge — current ingest, durability and SSE

**From** `bridge/jarvis_bridge.py`:
- Lines 654–660: `authorized` checks the allowed Host and the `X-Bridge-Token` header. For `/bridge/events` it also accepts a token query parameter, documented in source as potentially reaching logs/history. **Security design issue**, not proof of an exploit.
- Lines 829–850: only six `AGENT_TYPES` are permitted, and only a limited field allowlist is retained. Identity `event.id`, correlation ID, causation ID and source-local sequence are not yet part of this accepted handler shape.
- Lines 832–863: `AGENT_LOG = deque(maxlen=300)` and `agent_replay` returns events for the latest in-progress task, within a 600-second age window. This is not full historical replay.
- Lines 866–882: the handler validates authorization/payload, appends an in-memory record, optionally writes a task summary via `day_history.record`, broadcasts via client queues, then returns HTTP `{"ok": true, "clients": ...}`. This success response is **not evidence of durable storage of a full event**.
- Lines 1188–1223: `/bridge/events` serves SSE handshake, in-memory recent task replay, workflow replay, live queued events and ping comments; SSE messages shown have **no durable `id:` and no demonstrated `Last-Event-ID` cursor-based replay.**
- Lines 178–190: connected Browser object uses an `asyncio.Queue`; no persistent SSE replay checkpoint is visible.
- The Bridge also exposes a **separate** task-summary history (`/bridge/agent-history`), which should not be confused with complete event sourcing.

**From** `bridge/day_history.py`:
- Lines 13–15: `KEEP_DAYS=8`, `MAX_LINES=3000`; accepted types are exactly `task.created/task.completed/task.failed`.
- Lines 27–39: JSONL append is best-effort and may return failure; Bridge's agent-event handler does not turn a failed summary write into a rejected full-event delivery.
- Lines 67–80: timeline summary status `done` comes from `task.completed`, which itself may come from non-empty LLM output. This summary status **cannot be treated as a verified tool-effect success**.
- The separate history *does exist*, so claiming "**zero durable data anywhere**" would be wrong. It is simply **not a reliable full-fidelity event log**.

**Impact:** **P0** for at-least-once delivery semantics, dedupe and replay. Choose local durable outbox/log storage only after existing stores and lifecycle are reviewed.

## 5. Legacy browser Event Bus — preserve compatibility

**From** `js/events.js`:
- Lines 17–29: browser `J.ev.emit` creates `evt_1, evt_2, ...` sequence per in-memory runtime. Up to 400 events per task and 30 task keys survive in memory, with no durable restart proof.
- Lines 33–49: replay builds a visual reconstruction and feeds marked `replay:true` events into the existing reducer. This is not cross-restart authoritative Bridge replay and should remain a legacy UI-only mechanism.
- Lines 108–143: reducer handles task/model/tool/approval statuses. A v2 compatibility adapter should map source events into this behavior only where appropriate and not register two simultaneous competing reducers for the same task.

**Impact:** do not rewrite the old desktop's local Event Bus for Graph v2 by default. Keep historical consumers untouched behind a mapping boundary.

## 6. Standalone Graph 3D — what is real and what is not

**From** `graph-3d/src/App.tsx`:
- Lines 6–23: five top-level views and fixed `ROUTES`.
- Lines 73–94: seeded `buildGalaxy`, local tick every `2500` ms and synthetic traffic route selection. The UI's “LIVE” is a **DEMO**.
- Lines 204–215: `SIGNALS ACTIVE` and `PAUSE/PLAY` control synthetic activity; they do not pause Hermes runtime.
- The separate app has no observed direct authenticated Hermes/Bridge event adapter in these inspected code paths.

**From** `graph-3d/src/galaxy/types.ts`:
- `core/hub/traffic` are visual grouping/link types; they must not be treated as persisted authoritative ontology enums.
- Canonical `GraphEntity` IDs must be stable across Galaxy/G6/Mission/Second Brain; 3D positions remain visual DTO.

## 7. Event compatibility candidates — SOURCE CODE vs PROPOSED V2

| Current producer / route (verified) | Possible canonical v2 event | Reliability and meaning | Decision |
|---|---|---|---|
| Hermes `pre_llm_call` → `task.created` | `pl.jarvis.task.created.v1` | source event created; may represent LLM-turn lifecycle rather than whole project task | define mapping after source inventory |
| Hermes `pre_tool_call` → `tool.started` | `pl.jarvis.tool.started.v1` | attempted start, not a completed effect | preserve `call_id` |
| Hermes `post_tool_call` status ok → `tool.completed` | `pl.jarvis.tool.completed.v1` | hook-reported completion; external side effects must be verified per tool class | separate verified outcome |
| Hermes `post_tool_call` failure → `tool.failed` | `pl.jarvis.tool.failed.v1` | attempt failure; classify denied/timeout/cancelled if available | no false task success |
| Hermes `post_llm_call` + nonempty text → `task.completed` | **do not map directly to global task-success** | generation turn finished, not verified tool outcome | rename semantic in adapter, not upstream without plan |
| Bridge SSE disconnect | client transport `STALE/DISCONNECTED` | derived connection state, not an observed durable producer event | maintain separate from task status |
| Legacy `J.ev.emit` | compatibility visual signal | browser event IDs ephemeral | local adapter; no durable replay claim |
| Demo `ROUTES/tick` | `DemoVisualCue` | synthetic periodic traffic | explicit DEMO label, never LIVE |

All v2 event names, guarantees and authorizations remain **PROPOSED**. These rows are a mapping sketch, **not** verified live event schemas.

## 8. Read-only static audit vs runtime audit

### Verified in this pass
- Code paths and constants listed above, from the experimental GitHub repository and branch.
- No install, process launch, browser test, local file read, Bridge POST or secret extraction.
- No code/system configuration change.

### NOT VERIFIED in this pass
- Which files or commits are running on the Windows machine.
- Current Hermes profile/installed plugin hook version and event counts.
- Whether local Bridge gateway on the machine has patches not reflected by the experimental repo.
- Full runtime request/response shapes, transport headers, auth, ephemeral events, actual tool receipts, per-user permissions.
- Jev actual producer schema and memory source stable IDs/receipts.
- Real Graph 3D browser render, WebGL performance, responsive/mobile QA.
- Durability under actual process restart, SSE reconnect or disk failure.

**Do not change VERIFIED CODE into VERIFIED RUNTIME in reports.**

## 9. Proposed next design gates

**Gate R0: Canonical identities/semantics:** keep separate `LLM turn`, `task`, `run` and `tool attempt`. Define exact output truth table. P0.

**Gate R1: Local log choice:** source outbox and authenticated Bridge ingest ACK after durable append, checkpoints, dedupe (`source,id`), viewer-scoped cursor/versions; document compatibility with current day_history summaries (keep them). P0, requires actual storage inventory.

**Gate R2: Source auth:** separate an authorized read-only viewer stream from privileged Bridge command token. Query-token usage for SSE must be reviewed, not blindly carried to hosted Preview. P0.

**Gate R3: Renderer adapter:** existing DEMO seeded data remains untouched until accepted contract; future Graph 3D adapter reads GraphSnapshot/VisualCue and cannot mutate canonical state. P1.

**Gate R4: First REAL-LIVE proof:** one actual `tool.started` / completed-or-failed pair from an authorized environment → durable event log → projector → viewer-scoped snapshot → Inspector source evidence → matching one-time effect, with a recorded commit/runtime report. P1 after R0–R2.

## 10. Review status and safety boundary

**This is a read-only SOURCE CODE inventory, not a patch or live-system health report.** Preserve planning-only status: no code, no dependency, no merge/deploy, no changes to `main`. Architectural proposals must be ratified separately before implementation.

**Relevant older docs:** [09 Source Verification Plan](09-read-only-source-verification-plan.md), [14 Unified System Design](14-unified-system-design-review.md), [16 Final Architecture Review](16-final-architecture-review.md), [03 Event Protocol](03-event-bus-protocol.md).
