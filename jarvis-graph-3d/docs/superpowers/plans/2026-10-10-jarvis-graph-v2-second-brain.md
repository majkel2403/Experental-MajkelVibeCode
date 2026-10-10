# Jarvis Graph v2 — Second Brain Knowledge and Evidence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a read-only spatial index of persisted memory, decisions, artifacts and provenance that clearly separates verified records from AI-proposed associations.

**Architecture:** Second Brain is a viewer-scoped selector and source/evidence inspector over the canonical Graph Store; it is not another memory database. It relies on separately authorized trusted-side memory/receipt adapters and does not accept unsourced model suggestions as durable facts. A 3D projection and optional G6 2D view share entity IDs and source references, while private source bodies never leave the trusted boundary by default.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 3, Vite 7, existing Three.js/ForceGraph3D; G6 adapter after Workspace phase; Playwright for browser acceptance after Foundation has installed/pinned it.

**Spec:** `docs/graph-v2/blueprint/12-second-brain-graph-design.md`, `02-graph-ontology-contracts.md`, `06-security-quality-deployment.md`, `14-unified-system-design-review.md` and `09-read-only-source-verification-plan.md`.

## Global Constraints

- **Planning only — not permission** to code, install, scan local disks, connect Obsidian/Hermes, access private notes, deploy or modify either `main`.
- Paths are relative to `jarvis-graph-3d/`. The imported canonical ontology must be ratified first; do not create a competing `MemoryGraphStore`.
- Assume `GraphSnapshot` is already filtered by trusted read authorization before reaching browser. Client filters are usability, never access control.
- No server/private source adapter can be implemented before the future read-only source inventory establishes actual stable IDs, permissions, write receipts and trusted process placement. If unknown, mark the step **BLOCKED**; do not guess endpoints.
- `GraphEntity.status` does NOT contain `persisted`. Persistence verification is a separate candidate typed attribute requiring ADR approval and migration.
- Suggested similarity links are neither verified relations nor proof of causality; they require visibly tentative overlay and provenance.
- In private Memory views, never expose raw file paths, full note bodies, keys, private prompt texts or unauthorized aggregate counts.
- Historical reconstruction is possible only for periods covered by authorized retained snapshots/events. No invented “yesterday” history.
- Separate DEMO fixture from real source. No automatic edits, saves, deletes or tool commands from graph selection.

## Review Focus

1. **The agent proposes a memory that was not saved:** never show permanent verified node/pulse; pinned by Task 3.
2. **A note moved or renamed:** stable identity if source supports it, without assuming path=identity; pinned by Task 3.
3. **Private node absent but relation/aggregate remains:** no metadata leak; pinned by Task 2 and Task 6.
4. **Suggested link conflicts with a verified relation:** keep suggestion visibly separate; pinned by Task 4.
5. **Historical snapshot gap or stale memory index:** show incompleteness/staleness instead of fabricating facts; pinned by Task 5.

## Planned file map

| File (planned) | Responsibility |
|---|---|
| `graph-3d/src/graph/domain/claimTypes.ts` | Approved versioned provenance and persistence/suggestion metadata |
| `graph-3d/src/brain/types.ts` | BrainQuery, BrainProjection, MemoryEvidence, optional CandidateRelation |
| `graph-3d/src/brain/selectKnowledge.ts` | L0–L3 projection from authorized graph with stable IDs |
| `graph-3d/src/brain/sourceState.ts` | Pure verified/pending/stale source and write semantics |
| `graph-3d/src/brain/suggestionOverlay.ts` | Distinct non-authoritative suggested relation presentation |
| `graph-3d/src/brain/historyPolicy.ts` | Authorized time coverage and snapshot-gap handling |
| `graph-3d/src/brain/SecondBrainPanel.tsx` | Memory lens, source trail, search/filter |
| `graph-3d/src/brain/EvidencePathPanel.tsx` | Decision → evidence → allowed sources |
| `graph-3d/src/brain/*.test.ts`, `graph-3d/e2e/second-brain.spec.ts` | Proof of safety and usability |
| `graph-3d/src/App.tsx` | Shared selection and contextual MEMORY mode integration |

Candidate shared interfaces — do not implement before contract ratification:
```ts
type PersistenceVerification = 'unknown'|'pending'|'confirmed'|'failed'|'stale';
type ClaimVerification = 'verified'|'suggested'|'contradicted'|'stale';
interface MemoryEvidence {
  entityId: string; evidenceRef?: string;
  sourceSystem: string; sourceId?: string; observedAt: string;
  state: PersistenceVerification;
}
interface CandidateRelation {
  id: string; sourceId: string; targetId: string; kind: string;
  verification: ClaimVerification; provenanceRef: string;
  confidence?: number;  // only if actually supplied by a named source
}
interface BrainQuery {
  rootId?: string; selectedId?: string;
  level: 'universe'|'cluster'|'neighborhood'|'evidence';
  maxVisible: number;
}
interface BrainProjection {
  nodes: readonly GraphEntity[];
  edges: readonly GraphRelation[];
  suggestions: readonly CandidateRelation[];
  selectedId: string | null;
  sourceCoverage: 'complete'|'partial'|'unknown';
}
```

---

### Task 1: Ratified claim/provenance extensions and fixtures

**Files:**
- Create: `graph-3d/src/graph/domain/claimTypes.ts`, `graph-3d/src/brain/types.ts`.
- Test: `graph-3d/src/brain/claimTypes.test.ts`.
- Consumes: approved `GraphEntity/GraphRelation/Provenance` from Foundation.
- Produces: `MemoryEvidence` and `CandidateRelation` validation boundaries (functions below), never a new graph store.

- [ ] **Step 1: Write failing tests** `rejects_persisted_as_graph_entity_status`, `requires_source_for_confirmed_persistence`, `accepts_suggestion_as_separate_overlay` and `rejects_confidence_without_source`. Example: a fabricated confidence number with no provenance fails validation.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/brain/claimTypes.test.ts`.
- [ ] **Step 3: Implement** `validateMemoryEvidence(input: unknown): MemoryEvidence | null` and `validateCandidateRelation(input: unknown): CandidateRelation | null`, using exact approved values/length limits. If ADR extensions remain unapproved, STOP here; keep only written fixtures.
- [ ] **Step 4: Confirm GREEN:** rerun the test and require PASS.
- [ ] **Step 5: Commit** only the new approved types/tests: `git add graph-3d/src/graph/domain/claimTypes.ts graph-3d/src/brain/types.ts graph-3d/src/brain/claimTypes.test.ts` then `git commit -m "feat(graph): specify typed memory provenance"`.

### Task 2: Authorized Second Brain L0–L3 selectors

**Files:**
- Create: `graph-3d/src/brain/selectKnowledge.ts`.
- Test: `graph-3d/src/brain/selectKnowledge.test.ts`.
- Consumes: server-filtered `GraphSnapshot`, optional authorized candidate relations.
- Produces: `selectKnowledge(snapshot: Readonly<GraphSnapshot>, query: BrainQuery, candidates?: readonly CandidateRelation[]): BrainProjection`.

- [ ] **Step 1: Write failing tests** `selects_knowledge_neighborhood_without_creating_ids`, `shows_verified_links_only_in_main_edges`, `does_not_count_unauthorized_entities`, `preserves_search_selection_through_lod`. Use an already-authorized fixture; assert no hidden-node IDs or counts appear in the projection.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/brain/selectKnowledge.test.ts`.
- [ ] **Step 3: Implement** stable limited selection using `references/derived_from/decided_by/produced/contains` relations and deterministic sort; suggested links remain separate overlay, never appended to canonical edges.
- [ ] **Step 4: Confirm GREEN:** rerun same test; expected PASS.
- [ ] **Step 5: Commit** `selectKnowledge.ts` and test as `feat(graph): add authorized knowledge selectors`.

### Task 3: Source-confirmed memory persistence and rename mapping

**Files:**
- Create: `graph-3d/src/brain/sourceState.ts`.
- Test: `graph-3d/src/brain/sourceState.test.ts`.
- Consumes: trusted, **verified** source receipts (defined after read-only source discovery). No filesystem scanner.
- Produces: `resolveMemoryWrite(entityId: string, receipts: readonly MemoryEvidence[]): PersistenceVerification` and `resolveSourceIdentity(previousId: string, observedOpaqueId: string): string`, subject to approved source-ID policy.

- [ ] **Step 1: Write failing tests** `proposal_without_write_receipt_is_pending`, `confirmed_source_write_is_persisted`, `failed_receipt_never_generates_birth_pulse` and `renamed_file_retains_identity_when_opaque_id_matches`. Do not use file path as canonical identity.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/brain/sourceState.test.ts` only after the exact authenticated memory provider/source identity is documented.
- [ ] **Step 3: Implement** receipt-based state, consistent source ID mapping and explicit `stale/unknown`; no hidden inferred writes. If actual source lacks stable IDs/receipts, STOP and raise an ADR rather than faking confirmation.
- [ ] **Step 4: Confirm GREEN:** rerun, with synthetic fixture and later *separate* authorized source-verified evidence.
- [ ] **Step 5: Commit** `sourceState.ts` and test as `feat(graph): verify memory source persistence` only after approved gate.

### Task 4: Suggested and conflicting relations

**Files:**
- Create: `graph-3d/src/brain/suggestionOverlay.ts`.
- Test: `graph-3d/src/brain/suggestionOverlay.test.ts`.
- Consumes: authorized confirmed graph relations, typed `CandidateRelation[]`.
- Produces: `selectSuggestions(snapshot: Readonly<GraphSnapshot>, candidates: readonly CandidateRelation[]): readonly CandidateRelation[]`.

- [ ] **Step 1: Write failing tests** `keeps_suggestions_separate_from_confirmed_relations`, `drops_suggestions_to_missing_authorized_nodes`, `reports_conflict_without_silent_overwrite` and `preserves_source_provenance`.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/brain/suggestionOverlay.test.ts`.
- [ ] **Step 3: Implement** bounded source-identified tentative overlays; a conflict produces an explicit label/state and never mutates canonical `GraphRelation`.
- [ ] **Step 4: Confirm GREEN:** rerun, PASS required.
- [ ] **Step 5: Commit** overlay and tests as `feat(graph): distinguish suggested memory links`.

### Task 5: Evidence Inspector, incomplete history and mobile

**Files:**
- Create: `graph-3d/src/brain/historyPolicy.ts`, `graph-3d/src/brain/SecondBrainPanel.tsx`, `graph-3d/src/brain/EvidencePathPanel.tsx`.
- Modify: `graph-3d/src/App.tsx`, `graph-3d/src/styles/app.css`.
- Test: `graph-3d/src/brain/historyPolicy.test.ts`, `graph-3d/e2e/second-brain.spec.ts`.
- Consumes: `BrainProjection`, authorized source/evidence refs and shared ViewStore.
- Produces: `resolveHistoryCoverage(requestedFrom: string, requestedTo: string, retainedFrom?: string, retainedTo?: string): 'complete'|'partial'|'unknown'`; read-only view.

- [ ] **Step 1: Write failing tests** `history_gap_is_visibly_partial`, `unavailable_evidence_is_not_fabricated`, `mobile_source_inspector_remains_reachable` and `keyboard_navigates_to_allowed_source`.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/brain/historyPolicy.test.ts`; future Playwright `npx playwright test e2e/second-brain.spec.ts`.
- [ ] **Step 3: Implement** source trail, time coverage label, selected memory/decision inspector and search, respecting canonical IDs. Open only authorized references; no auto file writes/exports.
- [ ] **Step 4: Confirm GREEN:** unit test and browser tests at 1440×900/390×844 with reduced-motion on/off.
- [ ] **Step 5: Commit** UI/tests as `feat(graph): add read-only second brain evidence lens`.

### Task 6: Second Brain privacy/performance acceptance

**Files:**
- Modify: `graph-3d/e2e/second-brain.spec.ts`.
- Create: `docs/superpowers/reports/2026-10-10-graph-v2-second-brain-verification.md` (ONLY at future implementation).
- Consumes: fixture seeds 289/500/2000 and approved source scope; privacy test matrix from Blueprint 06/10.
- Produces: a DEMO browser acceptance report and a separately marked REAL-LIVE BLOCKED/PASS table.

- [ ] **Step 1: Write failing acceptance cases** `revoked_source_absent_from_aggregates`, `2k_memory_records_use_selective_lod`, `stale_index_does_not_pretend_fresh`, `no_unapproved_file_url_or_token` and `replay_cannot_write_memory`.
- [ ] **Step 2: Confirm RED:** `npx playwright test e2e/second-brain.spec.ts`, only after test runner is available.
- [ ] **Step 3: Implement** only minimal gaps in selectors, UI or viewer-scoped gateway defined in the separately approved live architecture; do not modify the user's actual memory without explicit consent.
- [ ] **Step 4: Confirm GREEN:** `npm test`, `npm run typecheck`, `npm run build`, plus browser suite. Record exact SHA and non-private benchmark evidence; source-verified memory write remains BLOCKED until proof is available.
- [ ] **Step 5: Commit** tests/report as `test(graph): verify knowledge provenance privacy and mobile UX`.

## Stop conditions and acceptance

A source without stable IDs, verified write receipt, authorized viewer scope or privacy-safe projection blocks REAL-LIVE. Graph cards may be delivered as synthetic DEMO, but do not call them actual memory. Full acceptance requires matched canonical IDs in 3D/G6/Inspector, distinction between verified and suggested links, no unapproved private references, honest history coverage, responsive mobile and verifiable source write semantics.

**Plan status:** Not executed; do not infer any test result or source connection from the existence of this document.
