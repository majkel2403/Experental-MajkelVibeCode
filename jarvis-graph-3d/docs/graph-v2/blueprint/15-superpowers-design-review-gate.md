# 15 — Superpowers Design Review Gate: Jarvis Graph OS v2.0

**Phase:** architecture/spec review; **not** writing-plans execution.  
**Status:** DRAFT FOR USER REVIEW — no decisions approved on user's behalf.  
**Date:** 2026-10-10. **Scope:** docs-only on branch `docs/jarvis-graph-v2-mission-brain-motion` in experimental repository.

## 1. The product promise (plain language)

Jarvis Graph is an observatory for an AI operating system. A user can see which project, task and agent is involved; whether Hermes/Jev/Bridge actually reported an event; why a decision was taken and whether source evidence supports that claim. The user can explore the same information in a living 3D Galaxy, an operational Mission Control, a memory/provenance Second Brain and a 2D G6 workflow graph. Animation follows evidence; it never substitutes for it.

This document is the **approval gate** for the written architecture, NOT permission to code, install dependencies, start services, deploy or modify `main`.

## 2. Review the chosen architecture

**Recommended:** one canonical Graph Store and versioned Event Log, with three contextual lenses and two view renderers. This choice is described in [14 Unified System Design](14-unified-system-design-review.md).

**Other approaches considered:** three separate stores needing synchronization (unnecessary inconsistency), or a giant all-purpose 3D graph rendering everything (complex, hard to audit, not scalable). Neither meets trustworthy-evidence and LOD goals as well.

### Logical boundaries (review)

```text
AUTHENTIC SOURCES
Hermes / Jev optional / Bridge tool receipts / authorized memory source
     |
     v
SOURCE AUTH + SCHEMA + DURABLE EVENT LOG
     |
     v
CANONICAL GRAPH PROJECTOR -> GraphSnapshot / GraphPatch
     |
     v
AUTHORIZED VIEWER SCOPE (filter all nodes, edges, counts)
     |
     +----> SYSTEM / AGENTS / PROJECTS / MEMORY / LIVE
                 |
                 +---- Mission Control lens
                 +---- Second Brain lens
                 +---- Timeline / Evidence inspector
                 +---- Galaxy 3D renderer
                 +---- G6 2D workspace
                 +---- Cinematic Director reads accepted event cues
```

## 3. Design decisions for approval

| ID | Concrete question | Proposed default | Why | Blocker? |
|---|---|---|---|---|
| DR-01 | One Graph Store or separate stores? | **ONE**, views are projections | prevent contradictory status/IDs | **Yes** |
| DR-02 | Canonical model names | `GraphEntity / GraphRelation / GraphSnapshot / GraphPatch` | align Blueprint 02 | **Yes** |
| DR-03 | Do scene roles `core/hub/traffic` belong in domain? | **No**; presentation only | scene should not corrupt memory | **Yes** |
| DR-04 | How reliable is an event? | verified `(source,id)`, source-local sequence + durable cursor, retry/replay | no silent lost outcomes | **Yes** |
| DR-05 | When show SUCCEEDED? | real authoritative tool/Bridge outcome, not assistant text | no fake work completion | **Yes** |
| DR-06 | How show persisted memory? | explicit source-confirmed write; new typed persistence metadata pending contract review | avoid phantom memories | **Yes** |
| DR-07 | How mark AI-suggested relations? | visibly tentative, source-labelled and separate from verified relations | prevent invented knowledge | **Yes** |
| DR-08 | Five primary modes vs Mission/Brain/Timeline? | five primary nav modes, contextual lenses within them | preserve existing product IA | No |
| DR-09 | Camera driven by events? | only explicit user FOLLOW LIVE; manual override always wins | avoid disorientation | No |
| DR-10 | What is L3? | Inspector/evidence + localized graph focus, not mandatory full 3D scene | readable and accessible | No |
| DR-11 | Hosted Vercel Preview access to real data? | **No** by default; synthetic protected DEMO | protect local files/credentials | **Yes** |
| DR-12 | Should clicking a node perform an action? | **No** in read-only v2 | separate command auth & approvals | **Yes** |
| DR-13 | Can PAUSE drop critical events? | **No**; pause visual cues, resync replay cursor | durability independent of playback | **Yes** |
| DR-14 | Should 120-agent demonstration reflect live runtimes? | **No**; labeled synthetic stress fixture | avoid invented agent activity | No |

## 4. What is supported by inspected code vs still unknown

**Previously inspected from the experimental prototype:** React/Vite 3D Force Graph scene, seeded DEMO with six clusters, renderer-centric node types, and older Jarvis event producer/reducer paths. These establish the design baseline but do not prove the live connection works.

**NOT VERIFIED and must not be presented as fact:** current running Bridge/agent gateway configuration and authorization, actual Jev event producer schema, durable event storage and replay, real tool success receipt format, approved memory index or Obsidian source, protected mobile remote access and real benchmark performance.

Until verified, any event spec is a proposed compatibility contract; reviewer must mark dependencies as unknown, not pass them by assumption.

## 5. Cross-document consistency review

| Requirement | Where defined | Current review verdict | Remaining action |
|---|---|---|---|
| One canonical node and relation model | 02, 08, 14 | **Aligned as proposal** | user approves DR-01/02/03 |
| Event identity/order and durable cursor | 03, 08, 14 | **Aligned as proposal** | inspect source semantics and decide storage |
| Mission/Task/Run/Tool outcome separation | 11, 14 | **Aligned as proposal** | choose authoritative result per tool class |
| Memory persistence and suggested links | 12, 14 | **Flagged extension** | approve typed verification metadata, schema migration |
| 3D cues, camera, PAUSE/replay | 04, 05, 13, 14 | **Aligned as proposal** | approve replay cue policy and UX defaults |
| Five top-level modes | Master Spec, 11, 14 | **Resolved in proposed IA** | user approves modes vs subviews |
| Browser authorization | 06, 08, 12, 14 | **Aligned as rule** | inspect real auth topology before implementation |
| L0–L3 semantics | 04, 11, 12, 14 | **Aligned as proposal** | UX reviewer checks screen-level examples |
| Complete acceptance evidence | 10 plus 11–13 | **Test cases designed, NOT RUN** | future test suite and browser proof |
| Old Master Spec's `GraphNode/core` and older plans | 2026-10-08 spec/plans | **Known conflict: not yet harmonized** | upon approval, documentation-only amendment first |

**Important:** Adding design-review notes to documents 11–13 does not mean all previous design contracts are ratified. Approved ADR must become a new versioned source-of-truth, and earlier master spec should cite it.

## 6. Five review examples the architecture must explain

1. **The agent says "done" but the tool failed.** Mission shows failed tool run and evidence; Brain may reference failed attempt; Director plays warning, never green success.
2. **A memory is proposed but never persisted.** No trusted new permanent memory node and no memory birth pulse. UI may show pending proposal separately.
3. **Two different producers share the same sequence number.** Ordering is source-scoped, no invented global event order. Durable cursor is independent.
4. **Viewer loses permission while LIVE stream is open.** Authorized scope resets; denied node/edge/count disappear from all lenses; client requests fresh scoped snapshot.
5. **The browser disconnects during a 1000-event burst.** No fake live traffic; graph marked STALE; critical outcomes remain in durable source log; resume through replay/resync; avoid repeated celebration animations.

Each example should have both **DEMO test fixture** and **source-verified acceptance gate** once an actual runtime read-only audit is approved. See [10 Acceptance Scenarios](10-acceptance-scenarios-and-evidence.md).

## 7. Unresolved architectural questions — do not guess

- The exact format and producer identity of Jev events.
- Which process owns durable outbox/log/projector in the present deployed Hermes/Bridge architecture.
- Whether any existing browser SSE replay supports authenticated Last-Event-ID.
- Where stable memory/file IDs and write confirmations can come from.
- Whether the user wants secure **remote/mobile LIVE**, which is out of scope by default.
- How retention, source revocation and historical views interact with privacy.
- Which machine profiles and budgets are realistic for Galaxy 3D/G6, especially mobile.

These are explicit evidence tasks in [09 Read-only Source Verification Plan](09-read-only-source-verification-plan.md), not authorizations to start invasive diagnostics.

## 8. Stage gate and next permitted artifact

- [x] Existing design docs 01–13 reviewed for naming, domain ownership, status, event, UI and security contradictions.
- [x] Written candidate unified design added as Doc 14.
- [x] Proposed review/sign-off checklist added as Doc 15.
- [ ] User reviews and **approves or requests amendments** to Doc 14 / this design gate.
- [ ] If approved, **documentation-only** update old master spec and document 02/03/11–13 contracts where necessary.
- [ ] Only after sign-off, create a Superpowers `writing-plans` implementation plan **as a document** with tasks, exact files, test commands, expectations and commit gates.
- [ ] Actual implementation requires a later separate explicit permission. No amount of chat “continue” from this planning phase is permission to code.

## 9. Suggested sign-off language

**Design sign-off only:** “Akceptuję projekt architektury Jarvis Graph v2 z dokumentu 14 i decyzje DR-01–DR-14. Kontynuuj wyłącznie ujednolicanie dokumentacji i planowanie, bez kodowania i wdrożeń.”

A request to adjust any particular DR-XX means rework the written spec first, then present it for another review. Silence or merely visiting the file is not an approval.

## 10. Final scope statement

This work is planning documentation held on a dedicated experimental docs branch. No source files, dependencies, runtime services, configuration, previews, production deployments or `main` branches are changed by this design-review step.

**References:** [01 Architecture](01-system-architecture.md) · [02 Ontology](02-graph-ontology-contracts.md) · [03 Event Bus](03-event-bus-protocol.md) · [06 Security](06-security-quality-deployment.md) · [08 ADR](08-architecture-decisions-candidate.md) · [09 Source Verification](09-read-only-source-verification-plan.md) · [10 Acceptance](10-acceptance-scenarios-and-evidence.md) · [14 Unified Design](14-unified-system-design-review.md).
