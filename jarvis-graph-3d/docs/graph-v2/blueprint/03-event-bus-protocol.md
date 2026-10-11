# 03 — Event Bus Protocol v2 and Reliable Replay

**Status:** Proposed event envelope v1 / graph schema v2; no endpoint changed. **2026-10-09.**

> **2026-10-11 Superpowers review:** [Doc 16 — Architecture Review](16-final-architecture-review.md) documents **F1–F3**. A global log cursor should not be exposed to viewers if it reveals hidden activity; use a viewer-scoped opaque replay cursor and reconcile it with an authorized projection version. `PAUSE EVENTS` means pause visual cues, not the durable source log or graph updates, with an explicit UI label; on resume do not replay past cues as fresh LIVE activity. `source.disconnected` may be a derived transport status, not a verified source-emitted event. These are proposals requiring ADR/sign-off; no real Bridge SSE/replay behavior has been confirmed.
**Scope:** Hermes/Jev/Bridge inputs, acknowledgement, durable ordering, authoritative projection and read-only browser stream.

## 1. What currently exists

Verified from feature branch:
- `hermes/plugins/jarvis-events/__init__.py`: daemon thread, queue max=500, `POST /bridge/agent-event`, `X-Bridge-Token`, drops on queue.Full and network error, no retry.
- `js/events.js`: a browser-local reducer emitting `{event_id,task_id,timestamp,type,source,payload}` and retaining at most 400/task events for a limited set of tasks. Its replay re-emits UI events, not durable ledger replay.
- Bridge endpoint auth implementation and persistence/replay contract have NOT been inspected. No claim that already-current transport is at-least-once or SSE supports Last-Event-ID.
- Legacy event names such as `task.created`, `tool.started` and `tool.completed` should be mapped, not abruptly replaced across all consumers.

## 2. Wire envelope (candidate)

CloudEvents 1.0 common fields and extensions; version each event payload separately from graph snapshot version.

```ts
export type JarvisEventV1<T> = {
  specversion: '1.0';
  id: string;                         // stable across retries
  source: string;                     // distinct logical stream (URI-reference)
  type: string;                       // e.g. pl.jarvis.tool.completed.v1
  subject?: string;                   // resource ID, never secret
  time: string;                       // RFC3339/ISO-8601
  datacontenttype: 'application/json';
  dataschema: string;                 // URI for payload version
  correlationid?: string;             // workflow/task trace
  causationid?: string;               // earlier event identity
  sequence: string;                   // lexicographic in one source
  partitionkey?: string;              // routing/grouping, does NOT grant order
  dataclassification: 'public'|'internal'|'confidential'|'restricted';
  data: T;                            // strict validated per type
};
```

**Correctness warning:** official CloudEvents `sequence` extension scopes comparison to `source`. A `partitionkey` by itself does NOT redefine that scope. If per-task independent sequences are desired, choose distinct stream-scoped `source` values or a separate versioned `tasksequence` extension with explicit rules. Use a monotonically padded source-local sequence and persist its next value. The cross-source order is partial, not global.

```json
{
  "specversion":"1.0",
  "id":"01900000-0000-7000-8000-000000000001",
  "source":"jarvis://hermes/session-opaque-01",
  "type":"pl.jarvis.tool.completed.v1",
  "subject":"task:opaque-01",
  "time":"2026-10-09T10:31:04.218Z",
  "datacontenttype":"application/json",
  "dataschema":"urn:jarvis:event:tool-completed:v1",
  "correlationid":"task:opaque-01",
  "causationid":"01900000-0000-7000-8000-000000000000",
  "sequence":"0000000000000042",
  "partitionkey":"task:opaque-01",
  "dataclassification":"internal",
  "data":{"callId":"call:opaque-01","tool":"files.read","outcome":"succeeded","durationMs":84,"evidenceRef":"evidence:opaque-01"}
}
```

This is a **synthetic example**, not an observed Hermes event. Never embed real file content/arguments/API keys in this payload.

## 3. Producer and ingest protocol

**Producer obligations**
- Stable `(source,id)` generated before enqueue; same on every retry, including process restart.
- Serialize validated limited allowlisted metadata; log only opaque references where sensitive.
- Persist into a bounded *durable* outbox (SQLite WAL or other already-approved local store), then enqueue for sender. Need durable retries for P0/P1; never accept silent queue loss as successful delivery.
- Sender uses timeouts, exponential backoff + jitter, max in-flight and rate limits; retry 429/5xx/network and decide policy for deterministic 4xx schema invalid.
- Crash/restart restores pending outbox rows; insert and producer-ID allocation transactional.

**Ingest obligations**
1. Authenticate source/service identity; enforce origin/Host and resource-level authorization independently.
2. Reject payload above byte limit **before** JSON parse; validate depth, arrays, strings, required enums and fields.
3. Sanitize/redact and enforce classification/allowed fields. Bind authenticated producer identity to `source`; never trust arbitrary caller-supplied source names.
4. Transactionally append event with unique index `(source,id)`, assign **server cursor**. ACK only after durable commit. Duplicate -> same ACK/cursor, not a second graph effect.
5. Project accepted event to graph state; store projected graphVersion/snapshot with reliable checkpoint, then publish to authorized subscribers. On projection error enter retry/DLQ status without losing original event.
6. Non-persistable P0 error: explicitly fail/return retryable response; do not report delivery success.

## 4. QoS tiers

| Tier | Examples | Delivery policy |
|---|---|---|
| P0 control/evidence | approvals, security incidents, terminal task/tool outcome, credential policy | durable before ACK, never deliberately coalesce/drop |
| P1 state | task/model started, assignment/decision/memory metadata write | durable, replayable and deduplicated |
| P2 visual telemetry | mouse hover, redundant progress pulses, decorative ambient signals | coalesce/bound, may skip without semantic loss |

Classify `tool.started` and `tool.completed` by their impact: a failed/succeeded tool outcome is evidence (P0), not disposable visual progress. Never let P0 be evicted by P2 during overload.

## 5. Client stream and resync

Use a **read-only authenticated snapshot API plus event/patch SSE** where feasible. Transport is not durability; durability is event log + cursor. SSE Last-Event-ID can be used for reconnect only when gateway explicitly implements replay and auth checks. Browser `EventSource` has no custom authorization headers. Protect with same-origin session/Cookie+CSRF controls or a vetted authenticated `fetch` stream; never leak privileged Bridge token into public frontend.

```text
CONNECTING → SYNCING snapshot(N,cursor)
    → CONNECTED: apply patch base=N, commit N+1
    → STALE: timer exceeds freshness threshold (not a fake live status)
    → DISCONNECTED: preserve last good redacted graph + lastSyncAt
    → RECONNECTING: backoff + session reauthorization
      → replay from cursor if retained, else request new snapshot
    → UNAUTHORIZED: no data, no retry storm
    → ERROR: safe diagnostics without payload/secret
```

**Client algorithm**
- Receive snapshot atomically, store cursor and graphVersion.
- Accept patch only if `baseVersion===current.graphVersion`, otherwise buffer a bounded short window.
- Detect gaps by server cursor/graphVersion; request replay or fresh snapshot. Source-local `sequence` alone cannot prove global cross-source completeness.
- Drop duplicates by `(source,id)` within retention; durable server log remains ultimate dedupe source.
- Projector must be deterministic, idempotent, guard stale per-entity revisions.
- A stream disconnect does NOT mean task cancelled; graph is marked stale until proof of task terminal state.
- Replay mode is read-only/time-travel. It MUST NOT submit live commands or write production task states.

## 6. Legacy compatibility mapping

| Legacy producer shape | Canonical event | Required check |
|---|---|---|
| `task.created` | `pl.jarvis.task.created.v1` | taskId and allowed summary |
| `tool.started` | `pl.jarvis.tool.started.v1` | toolCallId, attempt and source |
| `tool.completed` | `pl.jarvis.tool.completed.v1` | actual outcome from hook (not success assumed from model text) |
| `tool.failed` | `pl.jarvis.tool.failed.v1` | failed/denied/timeout distinguished |
| `task.completed` | `pl.jarvis.task.completed.v1` | whether hook semantically proves task closure |
| `approval.requested` | `pl.jarvis.approval.requested.v1` | source actor, scope and expiry |
| `model.*` | `pl.jarvis.model.*.v1` | metadata only; no raw prompt |
| `judge.*` / Jev | `pl.jarvis.judge.*.v1` | inspect actual Jev emitter before implementing |

**Important observed limitation:** current Hermes `post_llm_call` maps nonempty assistant response to `task.completed`. This does *not* by itself prove that an external file write, desktop action or dependent task succeeded. Evidence projection must require authoritative Bridge/tool results.

## 7. Sequence and idempotency tests

1. Same stable `source+id` delivered 100 times: one log record, one effect, repeat ACK.
2. Producer restart during unsent P0: pending event remains in outbox and is eventually retried.
3. Ingest persists then connection breaks before ACK: retry returns original cursor.
4. 1→3 arrives before 2 within one source: gap detected; no stale overwrite; replay or resync.
5. Different sources emit sequence=42: they are not comparable; no false global ordering.
6. Gap in client GraphPatch baseVersion: reject patch, sync new snapshot.
7. P2 flood while P0 approval arrives: approval persists and is visible.
8. Malformed JSON, oversized payload, wrong source, spoofing, XSS, unknown version: rejected and safe error response.
9. User intentionally pauses live display: transport cursor/resync semantics documented; never silently advance projected state from unshown events without explicit UI status.
10. Full process restart + replay: graph IDs, statuses and provenance match expected deterministic fixture.

## 8. Suggested storage schema (conditional ADR)

```sql
CREATE TABLE event_log (
  cursor INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  source_sequence TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  classification TEXT NOT NULL,
  sanitized_payload TEXT NOT NULL,
  UNIQUE (source, event_id)
);
CREATE TABLE projection_checkpoint (
  name TEXT PRIMARY KEY,
  last_cursor INTEGER NOT NULL,
  graph_version INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL
);
CREATE TABLE producer_outbox (
  local_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  UNIQUE (source, event_id)
);
```

**Caution:** This is a design sketch, NOT production-ready DB DDL. Scope, retention, encryption, migrations, disk quota, file permissions, transactions and existing DB must be inspected. Durable outbox may live with Hermes, while log/checkpoint live with Bridge. Never imply SQLite automatically handles cross-process authorization.

## 9. Security and operational minimum

- Separate read access from command access. Validate resource permission per event and per command, not just shared bridge token.
- No secret, raw local path, sensitive model prompt or unredacted user message in public analytics/metadata.
- Auth required for replay endpoints, snapshots and event stream; restrict Origin, Host, CORS, CSRF as appropriate.
- Metrics: outbox depth, old P0 age, retries, DLQ, event lag, duplicate rate, projection checkpoint/cursor, sequence gaps, SSE reconnect/resync.
- Retention: configure P0/P1 local retention and user-controlled data removal. Sanitized historical events must not be accidentally public.
- Review error category instead of swallowing exceptions in `_sender`.

## 10. References

- [CloudEvents core](https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md)
- [CloudEvents sequence — scoped by source](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/sequence.md)
- [CloudEvents partitioning](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/partitioning.md)
- [CloudEvents classification](https://github.com/cloudevents/spec/blob/main/cloudevents/extensions/data-classification.md)
- [OWASP input validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [Hermes current plugin](https://github.com/majkel2403/Jarvis-/blob/feat/jarvis-graph-3d/hermes/plugins/jarvis-events/__init__.py)

**Approval:** Planning only. Changes to Hermes/Bridge retry and storage require Gate A contract freeze and separate validated runtime rollout, not this document alone.
