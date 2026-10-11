# 09 — Read-only verification plan: Hermes, Jev, Bridge, memory

**Status:** the code-only GitHub inventory is partially completed in [Doc 17](17-read-only-code-evidence-inventory.md); the runtime audit described below is still NOT PERFORMED. **Do not re-run known source inspection unless revisions changed.** **Date:** 2026-10-09. **Restriction:** do not modify running services, their configuration, tokens, databases, or main branch. Do not make external service calls or enable remote live access while collecting this plan.

## Goal

Before designing a real live Graph client, determine what already exists, what data is trustworthy, and where a safe adapter can sit. A ready deployment or historical port number is **not** evidence of active service connectivity.

## Expected deliverable after a future authorized read-only audit

One versioned `source-inventory.md` containing **sanitized** event samples, data lineage diagram, auth boundary, available replay semantics, unknowns, impact estimate and evidence links (commit SHAs / code sections / non-sensitive status). Never include keys, full local paths with personal names, prompt bodies or raw private memory.

## Evidence classification

- **VERIFIED CODE**: explicit current source file and exact commit/hash support behavior as implemented.
- **VERIFIED RUNTIME**: authorized live run or test observed and recorded, with machine/OS/port redacted as appropriate.
- **INFERRED**: code suggests behavior but no executed proof.
- **UNKNOWN**: no evidence; stay out of mandatory implementation contract.
- **CONFLICT**: sources disagree, version drift or missing state — flag and block the affected change.

## Audit lane A — Hermes event producer

**Existing code lead:** `hermes/plugins/jarvis-events/__init__.py` on the isolated feature branch.

Read-only questions:
- Which hooks run for session/task/tool started, completed, failed, cancelled, retry, approval and model output?
- Which event names and required fields are actually produced for each hook? Is an event timestamp from source or ingestion?
- Does `post_llm_call` fire after text generation but before tool effects are confirmed? If yes, never map directly to VERIFIED task success.
- How are event IDs generated? Are they stable over retries/restarts? Is there a per-source counter?
- What happens on queue full (currently implementation appears to drop) and Bridge timeout? Which event categories are vulnerable?
- Does payload sanitization include API keys, Bridge token, raw arguments, file paths, model prompts? Are errors logged safely?
- Could durable local outbox reuse existing Hermes state DB without blocking the agent loop? Needs a separate architecture decision, NOT a code change today.

Required sanitized evidence: producer schema matrix, sample `tool.started` / `tool.completed` / `tool.failed` pairs if available, retry failure model, privacy-sensitive fields inventory.

## Audit lane B — Bridge ingest and SSE

**Known lead:** producer sends `POST /bridge/agent-event` with `X-Bridge-Token`; exact gateway code, authorization behavior and SSE replay MUST be inspected before claiming reliability.

Read-only questions:
- Which handler accepts agent events, and does it bind producer identity to authenticated client?
- Is Host/Origin/CORS/CSRF behavior correct when called from browser or local pages? Never assume loopback binding alone is sufficient.
- Is event accepted, persisted and ACKed in what order? Are there any retries, buffers, drop paths and size limits?
- Does SSE send IDs, durable cursors, Last-Event-ID replay or only best-effort broadcast?
- How does Bridge reconnect, shut down, handle client queue overflow, and recover after process restart?
- Can a read-only graph snapshot be served without exposing operator privileges? What auth scope would a hosted viewer need?
- What exactly is the source of a true tool completion receipt?

Required sanitized evidence: request/response/event fields (no secrets), state sequence diagram, storage/retention note, security boundary diagram, list of possible graceful degradation paths.

## Audit lane C — Jev decisions and classifications

Read-only questions:
- What component emits Jev outcome? Is Jev always present or optional?
- What are the actual event kinds, confidence fields, model/rule/source versions, and decision status semantics?
- Does a decision represent suggestion, selected action, approval, or real execution? Keep them distinct.
- Does the decision include a stable ID and causal task/action ID to link to Hermes/Bridge?
- Which data can appear in graph without exposing private text/policy internals?
- Is there any actual webhook/stream? Do not invent Jev HTTP endpoints or schemas.

Required sanitized evidence: actual schema source or minimal sanitized sample, runtime feature flags, safe semantic mapping proposal.

## Audit lane D — Existing Jarvis browser event bus

**Known lead:** `js/events.js` contains in-memory `J.ev` and reducers; it is not automatically a persistent authoritative log.

Read-only questions:
- Full supported event name catalogue and payload expectations?
- Are reducer state changes strictly task-scoped? What happens on missing task IDs / duplicate ID / malformed input?
- Which other parts of Jarvis consume the event bus; how much legacy behavior must remain untouched?
- How does task-history truncation work, and would adding a projector change its behavior?
- Can a read-only compatibility bridge mirror events without running two competing reducers?

Required sanitized evidence: event catalogue, existing consumers, migration compatibility risks with protected root tests.

## Audit lane E — Memory, Obsidian, files, projects and agents

Read-only questions:
- What data source has durable IDs for agent/team/project/task/memory? Which indices are authoritative vs cached views?
- What proves a memory item was actually saved — file/database write ACK, not assistant intent?
- What classification/default privacy rules apply to memory, person and file metadata?
- Can user-facing graph edges point to opaque file IDs instead of full local paths?
- How to handle renamed files, deleted memories, project movement, partial sync and permission changes?
- Are source timestamps meaningful and stable? How is stale memory index indicated?
- What deletion/retention/sync rules apply to historical relationships?

Required sanitized evidence: candidate canonical ID mapping, permission matrix, update/delete semantics, privacy threat review.

## Audit lane F — Browser, local vs hosted topology

- Desktop Jarvis tab/localhost and Vercel Preview may have different auth/network reachability.
- Inspect actual deployment protection and source SHA before assuming accessible render or current graph code.
- Browser `EventSource` does not accept arbitrary custom headers; selecting SSE transport is not deciding authentication.
- Explicit architecture choice needed for read-only local viewer vs any authenticated remote viewer; never embed Bridge token or silently expose a port/tunnel.
- Record whether operators need cross-device mobile access; if so, plan auth/delegation separately, not within graph renderer.

## Proposed report format

| Source | Code revision | Event names | Identity | Outcome meaning | Transport | Persistence | Retry/replay | Privacy fields | Confidence |
|---|---|---|---|---|---|---|---|---|---|
| Hermes | to inspect | to inspect | to inspect | intent vs confirmed | current POST lead | unknown | lossy suspected in code | redact | CODE/UNKNOWN |
| Bridge | to inspect | agent events | authenticated? | tool receipt? | HTTP/SSE lead | unknown | unknown | restrict | UNKNOWN |
| Jev | to inspect | to inspect | to inspect | decision only | unknown | unknown | unknown | restrict | UNKNOWN |
| Jarvis Browser | to inspect | task/model/tool | per task | UI reducer | in-memory Event Bus | bounded memory | no proven durable replay | UI-scoped | CODE |
| Memory | to inspect | write/update/delete | source IDs? | persisted only after ACK | unknown | unknown | unknown | restricted | UNKNOWN |

Do not fill unknown cells with guesswork. Historical observations from earlier conversations must be revalidated on current revisions.

## Evidence-based stop/go gates

**Gate V0 — source inventory complete:** real handlers, schemas, consumers, auth and privacy boundaries enumerated; ambiguities flagged.

**Gate V1 — event contract review:** 10 synthetic fixtures model observed fields: task creation, tool start, tool result, failure, approval, Jev decision, memory write, disconnect, duplicate, replay gap.

**Gate V2 — storage/security ADR:** select durable outbox/log/checkpoint based on actual existing stores and permissions, not architecture enthusiasm.

**Gate V3 — implementation authorization:** separate explicit approval required before touching Hermes/Bridge/config or creating a live connection.

## Action checklist — planning ONLY

- [ ] Map current source file locations and code hashes.
- [ ] Specify permitted *read-only* scope for any future runtime audit.
- [ ] Prepare a sanitized evidence template and field/classification examples.
- [ ] Prepare event mapping matrix with confidence levels.
- [ ] Review security boundary and identify open decisions that block contract freeze.
- [ ] Obtain explicit sign-off before any runtime writes or network exposure.

No task in this document has been performed merely by creating this file.

## Companion documents

[Architecture](01-system-architecture.md) · [Ontology](02-graph-ontology-contracts.md) · [Event protocol](03-event-bus-protocol.md) · [ADRs](08-architecture-decisions-candidate.md) · [Security](06-security-quality-deployment.md)
