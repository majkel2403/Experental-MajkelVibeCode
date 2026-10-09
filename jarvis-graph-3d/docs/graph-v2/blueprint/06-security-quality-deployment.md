# 06 — Security, Quality and Deployment

**Status:** planned requirements, not verified controls. **Date:** 2026-10-09.
**Target:** Jarvis Graph OS v2, local Hermes/Bridge and separate hosted DEMO.

## 1. Trust boundaries and threat model

The owner's computer controls agents, actions, private memory, tools and Bridge credentials. A hosted Vercel Preview contains only sanitized mock data unless a separately reviewed, authenticated live access path exists. A browser is not a trusted secret store.

| ID | Risk | Priority | Required protection | Acceptance test |
| --- | --- | --- | --- | --- |
| SEC-01 | Bridge token or private path included in browser output | P0 | server-side field allowlist, redaction, no privileged Vite environment | no secrets in responses or built assets |
| SEC-02 | Spoofed Hermes/Jev event appears as verified result | P0 | authenticated producer identity and authorized source claim | unauthorized producer rejected |
| SEC-03 | Duplicate event mutates graph multiple times | P0 | durable uniqueness on producer source plus event ID | 100 retries produce 1 state transition |
| SEC-04 | Failed send / queue full loses critical approval/outcome | P0 | durable outbox, bounded retry, no false ACK | outage and restart preserve P0 |
| SEC-05 | Untrusted title injects HTML/JS | P0 | escape/render as text, validated fields, restrictive CSP | malicious labels remain inert |
| SEC-06 | Oversized event causes DoS | P0 | byte/depth/count limits before parsing | reject payload, preserve service |
| SEC-07 | Unauthorized memory/person/file metadata disclosure | P0 | resource-level access control, restrictive default | denied snapshot and replay |
| SEC-08 | Clicking node executes a dangerous tool | P0 | read-only view; separately authenticated command API | navigation never triggers command |
| SEC-09 | Cross-site / localhost Bridge requests | P0 | verify host/origin, CSRF/session checks, CORS, loopback binding | foreign origin rejected |
| SEC-10 | WS hijack (if added later) | P1 | origin allowlist, per-message authorization, rate limits | unauthorized WS denied |
| SEC-11 | UI shows LIVE during disconnect | P1 | real status and last-sync timestamp | stale state explicitly visible |
| SEC-12 | Screenshots/logs reveal personal or project details | P1 | synthetic fixtures and export consent | evidence review |
| SEC-13 | Supply-chain compromise | P1 | reviewed pins, lockfile, npm ci and scans | reproducible CI install |
| SEC-14 | Bad production push | P1 | gated Preview, approval and tested rollback | incident simulation |

Existing Hermes plugin masks some labels, but this is NOT a comprehensive privacy policy. Do not forward arbitrary tool arguments or model prompt text.

## 2. Privacy and provenance policy

- Classify data as public, internal, confidential or restricted. Memory, files and people default to restricted pending explicit policy.
- Graph entity labels can reveal personal information. Sanitize and authorize the field set before serialization; do not rely on UI filtering.
- Use opaque source references instead of local file paths or browser-readable secrets.
- Distinguish agent intent, tool started, tool completed, failed, denied, timed out and verified external side effect.
- A persisted memory node should appear only after verified write acknowledgment.
- Telemetry must avoid raw event payloads, user labels, file paths and personal IDs.
- Retention, export and deletion policies for local event logs require explicit design and user-controlled enforcement.

## 3. Quality and acceptance matrix

| Track / Gate | Test class | Fixture | PASS evidence |
| --- | --- | --- | --- |
| Gate 0 | existing feature branch build/tests | exact SHA, npm versions | actual exit codes, browser screenshot |
| A | validator and GraphPatch | bad IDs, dangling edges, stale versions | atomic rejection and stable snapshot |
| A | camera and focus | empty, 1-node, filtered, dense | finite camera and valid inspector |
| A | pause and motion | mid-flight tool event, reduced-motion | no false particles; interactions work |
| A | WebGL fallback | WebGL disabled, context lost | usable read-only DOM/2D alternative |
| A | resource lifecycle | 50 filters and 20 mounts | GPU counters stabilize |
| B | semantic zoom | L0, L1, L2, L3 | actual change in visible semantic scope |
| B | interaction | click, hover, edge, Expand, Shift, Esc | deterministic 3D + inspector behavior |
| B | responsive | 1440x900, 390x844, 320px wide | accessible controls and bottom sheet |
| B | performance | 289, 500/1500, 2000/4000, 10k aggregated | recorded FPS, frame time, memory indicators |
| C | authentication | spoofed producer and wrong token | reject without mutating graph |
| C | idempotency | 100 identical events | one event and one projector effect |
| C | retry/reconnect | process restart, Bridge unavailable | preserved P0 and safe resync |
| C | event ordering | sequence gap and cross-source events | no stale overwrite, replay/snapshot |
| C | evidence | task/tool start/outcome chain | attributable completed/failed state |
| D | cross-view sync | same entity 3D/G6 | same canonical ID and selection |
| D | DAG cycles | graph with A->B->A | explicit warning or fallback |
| Release | Preview and rollback | exact reviewed commit | READY plus actual browser E2E, verified recovery |

**Warning:** Vercel READY means the deployment build reached READY, not that WebGL or live connections were visually tested.

## 4. Required test tooling

Design candidate package scripts (implement later, don't claim available):

~~~json
{
  "test": "vitest run",
  "typecheck": "tsc -b --pretty false",
  "build": "tsc -b && vite build",
  "test:e2e": "playwright test",
  "perf:graph": "node scripts/benchmark-graph.mjs",
  "audit:deps": "npm audit --audit-level=high"
}
~~~

Pin actual package versions and commit a lockfile before introducing npm ci. Record run SHA and browser/OS/GPU. Do not reuse old test totals for a newly pushed commit.

## 5. Performance benchmarking protocol

Use deterministic fixtures (including 500 nodes/1500 edges and 2000 nodes/4000 edges). After a measured warm-up, orbit and interact for 10–30 seconds. Record p50 FPS, p95 frame time, time to first interactive, input-to-highlight lag, JS heap if available, render calls, triangle counts, geometry and texture counts. Compare at same GPU, DPR, browser version and power mode.

**Initial proposed quality gates**, not library guarantees:
- Desktop 500/1500: p50 >= 45 FPS and p95 frame <= 28 ms.
- Mobile 200 nodes: p50 >= 25 FPS with quality reduction.
- Large 2000/4000: UI remains interactive and supports semantic aggregation.
- Repeated mount/filter: no unbounded growth in Three.js resources.

Three.js renderer.info reports useful counters, not perfect GPU memory totals.

## 6. Protected Preview and release checklist

1. Confirm branch, exact commit SHA, intended Vercel team/project, build root graph-3d, environment and intended audience.
2. Build and test exact commit, scan resulting bundle for secrets and verify no local API or tokens are embedded.
3. Deploy **Preview**, not production; record URL, deployment ID, READY/ERROR state and protection policy.
4. Run authenticated browser E2E and capture real desktop/mobile screenshots. Do not weaken Vercel Deployment Protection just to test.
5. Verify no accidental network requests from hosted JS to localhost Bridge.
6. Review P0/P1 security, regression and performance status; block any unverified real LIVE connection.
7. Require separate user approval for PR merge/main/prod and any change to local Bridge exposure.
8. For a production issue, perform approved rollback to known good deployment, verify health and record incident. Claim a rollback drill only if actually performed.

## 7. Observability and incident response

Monitor (no personal payloads): graph version, event ingestion rate, duplicate count, pending P0 age, outbox depth, delivery lag, projection gap, replay count, SSE reconnect, last snapshot age, renderer FPS/frame p95, draw calls, geometry/texture count, browser errors and WebGL context loss.

| Symptom | Diagnosis | Safe recovery |
| --- | --- | --- |
| Blank canvas | browser console, WebGL capability and context loss | fallback and retain graph |
| Outdated graph | cursor, stale timestamp, auth and transport | show STALE, reconnect/resync |
| Missing task event | durable outbox, log ACK, producer error | replay and preserve evidence |
| Duplicated agent | source+event dedupe and entity mapping | reconcile idempotently |
| Browser freezes | force layout, draw calls, excessive textures | lower fidelity/aggregate |
| Secret appears client-side | breach response, revoke credential, investigate logs | disable unsafe connection |

## 8. Open security questions before LIVE

Exact Bridge POST/SSE authentication, Host/Origin/CSRF behavior, source-scoped event IDs, authoritative local storage, remote access policy, memory classification, approved local file metadata and whether tool hook completion is sufficient evidence must be verified against a running authorized instance.

## Sources

- https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- https://threejs.org/manual/en/how-to-dispose-of-objects.html
- https://vercel.com/docs/deployment-protection
- https://vercel.com/docs/deployments
