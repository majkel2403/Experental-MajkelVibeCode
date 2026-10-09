# Jarvis Graph v2 — Live Knowledge and Agent Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace simulated graph activity with trustworthy, authorization-safe data about Hermes, Jev, Bridge, projects, tasks, agent actions and long-term memory, while preserving DEMO mode and making execution verifiable.

**Architecture:** An authenticated adapter/gateway normalizes local source events to the common GraphSnapshot/EventEnvelope contract from Foundation track. A deterministic graph reducer feeds both rendering engines. The UI never calls local Hermes, Jev or Bridge endpoints directly from an exposed browser or stores secrets in client-side code.

**Tech Stack:** TypeScript, normalized Event Bus contract, WebSocket or SSE as discovered from actual sources, React, Vitest, Playwright; minimal gateway only if deployment topology requires it.

**Spec:** `docs/superpowers/specs/2026-10-08-jarvis-graph-v2-master-design.md`.

## Global Constraints

- Gate A domain contract must exist before starting. Gate B is not required; live state and cinematic rendering can progress independently.
- Adapters MUST be grounded in actual inspected schemas/endpoints, not guessed service IDs, profiles or ports.
- No raw secrets, Bridge tokens, private file bodies or unredacted environment variables leave the local trust boundary.
- No publication of a live local API, network tunnel or auth key without separate approval.
- Keep DEMO / REPLAY / LIVE visually distinct; LIVE only when authenticated, connected and synced.
- Untrusted source data is validated, normalized and de-duplicated before touching graph state.
- Maintain last good snapshot during disconnect; do not invent success/evidence.
- Only feature-branch development; no automatic production release.

## Review Focus

1. Out-of-order event/reconnect: no double-apply or stale overwrite; show gap + resync — Tasks 2 and 4.
2. Unauthorized or spoofed event / untrusted labels: reject, redact and never render as HTML — Tasks 2 and 3.
3. Hermes offline / Bridge not paired / local source unreachable: retain last graph and show stale timestamp, no fake LIVE badge — Tasks 3 and 4.
4. Memory contains private text/tokens: only allowed metadata is present in browser payload — Task 5.
5. Event storms of thousands per minute: bounded buffers/batch updates, CPU and backpressure controls — Task 4.

## Files / Ownership

- Create `graph-3d/src/live/{sourceDiscovery,adapterContract,eventNormalize,ingest,streamStore,reconnect,replay,provenance,redact}.ts`
- Create `graph-3d/src/live/*.test.ts`
- Create `graph-3d/src/live/adapters/{hermes,jev,bridge,memory}.ts`
- Create `graph-3d/src/live/transport/{types,sseClient,websocketClient}.ts`
- Create `graph-3d/src/live/components/{SourceStatus,LiveTimeline,EvidenceInspector,ConnectionPanel}.tsx`
- Modify `graph-3d/src/App.tsx`, `src/galaxy/GalaxyScene.tsx`
- Add `graph-3d/e2e/live.spec.ts`
- Create `docs/superpowers/reports/2026-10-08-graph-v2-source-inventory.md` and `...-live-verification.md`
- Add gateway files ONLY following verified transport/auth discovery and separate network exposure approval (conditional).

---

### Task 1: Discover real services, schemas and privacy boundaries

**Files:**
- Create: `docs/superpowers/reports/2026-10-08-graph-v2-source-inventory.md`
- Create: `graph-3d/src/live/sourceDiscovery.ts`
- Create: `graph-3d/src/live/sourceDiscovery.test.ts`

**Interfaces:**
- Produces:
  - `interface SourceDescriptor { id: 'hermes'|'jev'|'bridge'|'memory'; transport:'sse'|'ws'|'file'|'poll'|'none'; authMode:string; schemaSamplePath?:string; dataClasses:string[]; connectivity:'verified'|'unknown'|'offline' }`
  - `getAvailableSources(discovery: ReadonlyArray<SourceDescriptor>): SourceDescriptor[]`

- [ ] Inspect actual linked project docs and authorized runtime for source shapes: agent start/finish, tool calls, decision class, task transitions, memory writes, file links. Store only sanitized non-secret samples and redact paths/IDs before report.
- [ ] Write RED tests: unknown/unavailable source is not advertised as connected; safe descriptors contain no credentials.
- [ ] Verify RED; implement source descriptor registry and capability discovery; never infer connectivity from historical ports.
- [ ] Record exact observed transport/auth details, format versions and gaps; explicitly mark absent sources as NOT VERIFIED.
- [ ] Review source inventory before implementing network gateway; commit `docs(graph-v2): inventory real source contracts`.

### Task 2: Validation and canonical event mapping

**Files:**
- Create: `graph-3d/src/live/{adapterContract,eventNormalize,provenance,redact}.ts`
- Create: `graph-3d/src/live/{eventNormalize,redact}.test.ts`
- Create: `graph-3d/src/live/adapters/{hermes,jev,bridge,memory}.ts`

**Interfaces:**
- Consumes: `GraphEventEnvelope`, `GraphSnapshot` from Gate A, verified schemas from Task 1.
- Produces:
  - `interface SourceAdapter { source: GraphEventEnvelope['sourceSystem']; normalize(raw:unknown):GraphEventEnvelope | null }`
  - `normalizeSourceEvent(adapter: SourceAdapter, raw: unknown): GraphEventEnvelope | null`
  - `sanitizeEventForBrowser(event: GraphEventEnvelope): GraphEventEnvelope | null`
  - `getEventEvidence(event: GraphEventEnvelope): { source:string; correlationId?:string; timestamp:string; proofRef?:string }`

- [ ] Write RED tests for benign agent/tool/status examples, unexpected schema version, oversized payload, XSS string, prototype pollution, secret-bearing headers and missing correlation ID.
- [ ] Verify RED; implement adapters ONLY for verified source fields; no free-form model-generated action statements treated as proof of execution.
- [ ] Sanitize and bound text, metadata and labels; redact known token/key/password patterns and deny source blobs/large file content.
- [ ] Attach source provenance and correlation IDs to actions; test typed routing: Hermes orchestration, Jev classification, Bridge tool result, memory write.
- [ ] Pass synthetic source fixtures through canonical reducer; commit `feat(graph-v2): normalize provenanced runtime events`.

### Task 3: Authenticated transport and consent gate

**Files:**
- Create: `graph-3d/src/live/transport/{types,sseClient,websocketClient}.ts`
- Create: `graph-3d/src/live/transport/*.test.ts`
- Create: `graph-3d/src/live/components/ConnectionPanel.tsx`
- Modify: `graph-3d/src/App.tsx`
- Conditional gateway: `graph-3d/server/**` only with verified auth/network topology and explicit approval.

**Interfaces:**
- Produces:
  - `type SourceConnectionStatus = 'offline'|'connecting'|'connected'|'stale'|'error'|'unauthorized'`
  - `interface LiveTransport { connect():Promise<void>; close():void; subscribe(fn:(event:unknown)=>void):()=>void; getStatus():SourceConnectionStatus }`
  - `createLiveTransport(config: SafeConnectionConfig): LiveTransport` (config contains no browser-visible secrets).

- [ ] RED tests for authorization denied, reconnect closure, duplicate listeners, browser offline and origin restrictions.
- [ ] Verify RED. Implement transport selection based on source inventory, and injection of already authorized fetch/connectors.
- [ ] For Vercel previews use DEMO by default. Do NOT connect hosted browser to localhost, embed Bridge token, disable CORS, or create a public tunnel.
- [ ] Add explicit connection panel showing source identity, consent scope and ACTIVE/UNAVAILABLE state.
- [ ] E2E simulated unauthorized transport and disconnect. Commit `feat(graph-v2): secure opt-in live transport`.

### Task 4: Durable in-memory snapshot, resync and replay

**Files:**
- Create: `graph-3d/src/live/{streamStore,ingest,reconnect,replay}.ts`
- Create: `graph-3d/src/live/{streamStore,ingest,reconnect,replay}.test.ts`
- Modify: `graph-3d/src/App.tsx`

**Interfaces:**
- Produces:
  - `applyInboundBatch(store: LiveGraphStore, input: unknown[]): { accepted:number; rejected:number; requiresResync:boolean }`
  - `createStreamStore(initial: GraphSnapshot, opts:{ maxEvents:number; maxBatch:number }): LiveGraphStore`
  - `replayToSequence(snapshot: GraphSnapshot, events: GraphEventEnvelope[], sequence:number): GraphSnapshot`
  - `getFreshnessState(nowMs:number,lastEventMs:number,thresholdMs:number): 'fresh'|'stale'|'disconnected'`

- [ ] RED tests for 1000 buffered events, duplicate `eventId`, replay determinism, sequence gaps, delayed arrival, interruption mid-snapshot, parallel source order.
- [ ] Verify RED; create bounded queues and per-source sequence cursors; on gap request snapshot resync, never silently apply potentially wrong state.
- [ ] Batch UI updates at controlled cadence; only structural events restart D3 simulation.
- [ ] Implement Replay timeline, selection/event correlation and last-good-snapshot preservation.
- [ ] E2E pause stream, reconnect, replay and verify graph/inspector remain coherent; commit `feat(graph-v2): replayable event graph state`.

### Task 5: Memory/file/task ingestion and evidence

**Files:**
- Create: `graph-3d/src/live/adapters/memory.ts` (if not yet implemented)
- Create: `graph-3d/src/live/components/{LiveTimeline,EvidenceInspector,SourceStatus}.tsx`
- Create: `graph-3d/src/live/memoryProjection.ts`
- Create: `graph-3d/src/live/memoryProjection.test.ts`
- Modify: `graph-3d/src/App.tsx`
- Modify: `graph-3d/src/galaxy/GalaxyScene.tsx`

**Interfaces:**
- Produces:
  - `projectMemoryIndex(records: ReadonlyArray<SafeMemoryRecord>): { nodes: GraphNode[]; edges: GraphEdge[] }`
  - `getProofChain(correlationId:string, events: GraphEventEnvelope[]): GraphEventEnvelope[]`

- [ ] RED tests: one memory with 2 references, unknown person/file, removed project, secret-bearing content, corrupted source, no-authorization records. Validate only safe metadata leaves process.
- [ ] Verify RED; implement memory ingestion from an explicitly authorized, verified source (file snapshot adapter first, stream optional).
- [ ] Render memory write only after source reports successful persistence, not when Hermes merely intends to save.
- [ ] Add evidence inspector: tool call, actor, outcome, timestamp, source and proof reference. Distinguish PENDING / COMPLETED / FAILED.
- [ ] E2E trace Hermes task -> Bridge result -> memory entry using sanitized fixture; commit `feat(graph-v2): show verified memories and execution evidence`.

### Task 6: Real event acceptance and release safety

**Files:**
- Create: `docs/superpowers/reports/2026-10-08-graph-v2-live-verification.md`
- Modify: `graph-3d/README.md`
- Modify: `graph-3d/e2e/live.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: Gate C approval evidence.

- [ ] Local-only connected E2E: capture source event from real authorized emitter -> normalized envelope -> reducer -> visible node/edge change -> event/evidence trail. If source unavailable, mark gate NOT VERIFIED and do not claim real LIVE.
- [ ] Denied-auth and source-drop scenarios show status, retain snapshot, avoid leaked keys.
- [ ] Run unit/build/typecheck/E2E and security fuzz/fixture suite; record SHA, counts and failure logs.
- [ ] Deploy Preview with DEMO default, live connection disabled unless explicitly authorized and secure; never replace production or expose local services.
- [ ] Commit verified report; defer unobserved adapters without fabricated support.

## Acceptance

- Verified source-to-graph evidence for at least one actual authorized source, with no secret material.
- Correct duplicate/out-of-order handling and deterministic replay.
- Offline/stale state unambiguously indicated, last graph remains visible.
- DEMO remains independently usable on hosted Preview.
- No real tool invocation or write is triggered by clicking a graph node.
