# Jarvis Graph v2 — Mission Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only operational lens for tasks, agents, teams, delegations, blockers and verified action outcomes, all keyed by the canonical Jarvis Graph entity IDs.

**Architecture:** Mission Control is a selector and set of React components reading an already-authorized `GraphSnapshot`, not a second store or task runner. Status and evidence are derived from explicitly verified receipts; relationships are analyzed by pure graph functions and reflected in 3D/G6 via shared selection.

**Tech Stack:** React 19, TypeScript 5.9, Vitest 3, Vite 7, existing ForceGraph3D/Three.js; Playwright only after the Foundation E2E task adds and pins it. No additional state-management library without an ADR.

**Spec:** `docs/graph-v2/blueprint/11-mission-control-design.md` and `docs/graph-v2/blueprint/14-unified-system-design-review.md`. Shared contracts in 02/03; design review Gate 15.

## Global Constraints

- **PLANNING ONLY.** This file is not authorization to write code, run agents/services, install dependencies, deploy or merge into any `main`.
- All example paths below are relative to `jarvis-graph-3d/` in the experimental repository.
- First ratify canonical types and resolve the source inventory (`Blueprint 02/03/08/09/14/15`), then complete the existing Foundation plan. Until then this plan is a future execution blueprint.
- The current `graph-3d/src/galaxy/types.ts` is a visual DTO; no renderer object may become the authoritative graph.
- Preserve top-level SYSTEM/AGENTS/PROJECTS/MEMORY/LIVE; `Mission`, `Team`, `Trace` are contextual lenses.
- A source-generated assistant statement is not a verified tool receipt. Never claim success without the authoritative producer result.
- UI is read-only: selecting nodes never sends tasks, retries, cancellations or approvals.
- The GraphSnapshot arrives already filtered by trusted viewer authorization; client-side CSS/filtering cannot replace server-side protection.
- Hosted Preview uses synthetic DEMO only unless a separate remote-auth design is explicitly authorized. Statuses and animations from fixture must be labelled DEMO.
- Acceptance: same canonical ID in Mission, Galaxy, G6 and Inspector; responsive 390×844, reduced motion, keyboard-equivalent navigation.

## Review Focus

1. **LLM claims done while Bridge reports failure:** outcome remains failed/unverified; pinned by Task 2's test.
2. **Jev is absent:** Mission works with no decision nodes; pinned by Task 1.
3. **Task dependency cycle:** show a cycle warning and avoid recursion/hang; pinned by Task 3.
4. **Entity disappears behind a filter while selected:** readable hidden-selection notice, no bad camera focus; pinned by Task 4.
5. **120 synthetic agents or unpermitted aggregate:** bounded projection and viewer-scoped counts; pinned by Task 1 + Task 5.

## Planned file structure and ownership

| Planned file | Responsibility |
|---|---|
| `graph-3d/src/mission/types.ts` | MissionQuery, MissionProjection, MissionStatus, ReceiptSummary |
| `graph-3d/src/mission/selectMission.ts` | Pure authorized-snapshot selector, bounded grouping and IDs |
| `graph-3d/src/mission/outcomePolicy.ts` | Separate task, run, tool and connection status/evidence semantics |
| `graph-3d/src/mission/dependencyImpact.ts` | Reverse-dependency reachability, cycle reporting, not speculative failure |
| `graph-3d/src/mission/MissionPanel.tsx` | Mission/Team/Trace accessible view |
| `graph-3d/src/mission/MissionInspector.tsx` | Entity/provenance/receipt details; missing evidence visible |
| `graph-3d/src/mission/*.test.ts` | Pure contract tests |
| `graph-3d/e2e/mission-control.spec.ts` | Browser/mobile, cross-view and evidence gate |
| `graph-3d/src/App.tsx` | Integration via shared ViewStore; no new authoritative state |

**Shared interfaces (assumed after contract freeze):**
```ts
type MissionLens = 'mission' | 'team' | 'trace';
interface MissionQuery { lens: MissionLens; rootId?: string; selectedId?: string; maxVisible: number; }
interface MissionProjection {
  nodes: readonly GraphEntity[];
  edges: readonly GraphRelation[];
  selectedId: string | null;
  visibleCount: number;  // based ONLY on already authorized entities
  warnings: readonly ('CYCLE' | 'HIDDEN_SELECTION' | 'NO_EVIDENCE')[];
}
interface ToolReceipt {
  callId: string; runId: string; source: string;
  verified: boolean; outcome: 'succeeded'|'failed'|'denied'|'timeout'|'cancelled';
  evidenceRef?: string; completedAt?: string;
}
type ExecutionOutcome = 'unknown'|'pending'|'verified-success'|'verified-failure'|'denied'|'timeout'|'cancelled';
```

The receipt must be emitted by an authenticated trusted adapter; constructing `verified:true` inside UI is forbidden.

---

### Task 1: Mission selector and deterministic Team/Mission fixture

**Files:**
- Create: `graph-3d/src/mission/types.ts`, `graph-3d/src/mission/selectMission.ts`.
- Test: `graph-3d/src/mission/selectMission.test.ts`.
- Consumes: `GraphSnapshot` from Foundation (`Blueprint 02`), permission-filtered upstream.
- Produces: `selectMission(snapshot: Readonly<GraphSnapshot>, query: MissionQuery): MissionProjection`.

- [ ] **Step 1: Write failing tests** named `selects_project_agents_tasks_with_stable_ids`, `handles_absent_optional_jev`, `aggregates_only_visible_entities`, and `limits_120_agent_fixture`. Assert that project P shows only its authorized task/agent IDs, absent Jev leaves view valid, and `maxVisible=30` truncates presentation without inventing hidden counts.
- [ ] **Step 2: Confirm RED:** run `npx vitest run src/mission/selectMission.test.ts` from `graph-3d/`; expected missing module/function, not an environment failure.
- [ ] **Step 3: Implement** a pure deterministic selector using canonical IDs, relation taxonomy `contains/assigned_to/member_of`, stable sort and bounded grouping. Do not mutate `GraphSnapshot` or Three.js objects. Expose `selectedId` only if target remains in the authorized result.
- [ ] **Step 4: Confirm GREEN:** same test command; expected all Task 1 cases PASS.
- [ ] **Step 5: Commit only Task 1 files** on an explicitly approved future feature branch: `git add graph-3d/src/mission/types.ts graph-3d/src/mission/selectMission.ts graph-3d/src/mission/selectMission.test.ts` then `git commit -m "feat(graph): add mission projection"`.

### Task 2: Evidence-aware status policy

**Files:**
- Create: `graph-3d/src/mission/outcomePolicy.ts`.
- Test: `graph-3d/src/mission/outcomePolicy.test.ts`.
- Consumes: `GraphEntity` task/run statuses and trusted `ToolReceipt[]`.
- Produces: `deriveExecutionOutcome(task: Readonly<GraphEntity>, receipts: readonly ToolReceipt[]): ExecutionOutcome`.

- [ ] **Step 1: Write failing tests** `does_not_mark_assistant_text_as_tool_success`, `uses_verified_failure_even_if_task_text_claims_done`, `distinguishes_denied_timeout_cancelled`, and `uses_latest_authenticated_attempt_only`. Example assertion: tool receipt `verified:false` cannot produce `verified-success` even if task status says `succeeded`.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/mission/outcomePolicy.test.ts`; expected missing implementation.
- [ ] **Step 3: Implement** a narrow outcome reducer. Keep task lifecycle distinct from tool-result outcome; enforce verified source receipt and stable call/run identity. No success inferred from text.
- [ ] **Step 4: Confirm GREEN:** same test command; expected PASS.
- [ ] **Step 5: Commit** `outcomePolicy.ts` and test as `feat(graph): distinguish intent and verified mission outcomes`.

### Task 3: Dependency impact and cycle safety

**Files:**
- Create: `graph-3d/src/mission/dependencyImpact.ts`.
- Test: `graph-3d/src/mission/dependencyImpact.test.ts`.
- Consumes: viewer-scoped `GraphSnapshot`, canonical `depends_on` relations.
- Produces: `traceDownstream(snapshot: Readonly<GraphSnapshot>, blockingTaskId: string): { dependentIds: string[]; cycleIds: string[] }`.

- [ ] **Step 1: Write failing tests** `traces_A_depends_on_B_depends_on_C`, `reports_A_B_cycle_without_loop`, `ignores_non_dependency_edges` and `never_claims_all_dependents_failed`. When B is blocked, A is **potentially impacted**, not automatically failed.
- [ ] **Step 2: Confirm RED:** `npx vitest run src/mission/dependencyImpact.test.ts`.
- [ ] **Step 3: Implement** reverse-edge BFS/DFS using visited sets and deterministic ID order; detect cycles and return explicit warnings instead of invalid DAG.
- [ ] **Step 4: Confirm GREEN:** same command, all cases PASS.
- [ ] **Step 5: Commit** `dependencyImpact.ts` and test as `feat(graph): map mission dependency impact safely`.

### Task 4: Mission/Team/Trace responsive views

**Files:**
- Create: `graph-3d/src/mission/MissionPanel.tsx` and `graph-3d/src/mission/MissionInspector.tsx`.
- Modify: `graph-3d/src/App.tsx` and `graph-3d/src/styles/app.css` (only mission-specific integration).
- Test: `graph-3d/e2e/mission-control.spec.ts`.
- Consumes: `MissionProjection` and shared ViewStore selection; outcome policy.
- Produces: `MissionPanel({projection,selectedId,onSelect}: {projection:MissionProjection;selectedId:string|null;onSelect:(id:string)=>void})`.

- [ ] **Step 1: Write failing browser tests** `mission_selects_same_id_as_galaxy`, `filter_hidden_selection_shows_notice`, `keyboard_opens_agent_inspector` and `mobile_inspector_is_reachable_390x844`. Assert that clicking a row updates one canonical selection, never triggers a Bridge command or navigates to unapproved local URL.
- [ ] **Step 2: Confirm RED:** after Foundation adds Playwright, run `npx playwright test e2e/mission-control.spec.ts`; expected missing UI element, not a failing dependency installation.
- [ ] **Step 3: Implement** the three contextual lenses and evidence panel with explicit empty states, unavailable Jev and no-evidence labels. Use accessible DOM lists/actions; do not clone graph data into component state.
- [ ] **Step 4: Confirm GREEN:** repeat Playwright command at desktop 1440×900 and mobile 390×844; screenshot and console capture.
- [ ] **Step 5: Commit** only mission components, integration and E2E tests as `feat(graph): add read-only mission control lens`.

### Task 5: Mission proof and acceptance gate

**Files:**
- Modify: `graph-3d/e2e/mission-control.spec.ts`.
- Create: `docs/superpowers/reports/2026-10-10-graph-v2-mission-verification.md` (generated *during future implementation*, NOT now).
- Consumes: Tasks 1–4 + accepted synthetic fixture; later optional authorized real-source verification separate.
- Produces: a browser-verifiable DEMO gate and explicit blocked-real-LIVE table.

- [ ] **Step 1: Write failing acceptance cases** for 20 managers + 100 agents, denied metadata/aggregate counts, disconnected STALE, tool success without verified receipt, task with circular dependency and 390×844 responsive panel.
- [ ] **Step 2: Confirm RED:** `npx playwright test e2e/mission-control.spec.ts` with intentionally missing acceptance behavior.
- [ ] **Step 3: Implement only the missing minimal UI/projection behavior**, no runtime Hermes integration or producer token. Ensure lab fixture remains clearly marked DEMO.
- [ ] **Step 4: Confirm GREEN and type/build gates:** `npm test`, `npm run typecheck`, `npm run build`, then Playwright suite. Record exact future SHA, browser, viewport and redacted evidence; DO NOT claim these were run during plan drafting.
- [ ] **Step 5: Commit** tests and a truthful verification report as `test(graph): verify mission control evidence and responsiveness`.

## Acceptance / stop conditions

PASS DEMO requires canonical IDs and shared ViewStore synchronization, explicit pending/failed outcomes, no automatic tool calls, accessible UI and no private data leaked by aggregates. PASS REAL-LIVE requires separate authentic Hermes/Bridge evidence; this plan cannot deliver that until the Live Event Protocol and Source Inventory are approved and implemented. Never promote to main or production without separate explicit authorization.

**Review dependency:** [Unified Design](../../graph-v2/blueprint/14-unified-system-design-review.md) (for context; path from this plan should be checked by reviewer) and [Mission spec](../../graph-v2/blueprint/11-mission-control-design.md).
