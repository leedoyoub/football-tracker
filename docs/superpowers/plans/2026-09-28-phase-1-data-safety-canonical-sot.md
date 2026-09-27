# Phase 1 Data Safety and Canonical SOT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely resume and import match data while deriving every SOT/rating result from one current, historical-data-safe domain model.

**Architecture:** Add `engine/opponentSot.ts` as the sole manual-or-legacy SOT interpreter and feed its match and position-segment outputs to ratings, rankings, records, combinations, analytics, and competition tie-breaks. Make editor restoration a pre-mount result, and move import into a Store replacement transaction guarded by a persistence generation.

**Tech Stack:** React 19, TypeScript 6, Vite, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-28-phase-1-data-safety-and-canonical-sot-design.md`

## Global Constraints

- Preserve raw historical events and existing absent SOT values; never persist a redundant second-half field.
- Missing/incomplete manual SOT uses only the canonical legacy fallback; complete invalid pairs are rejected.
- Use current 45+/90+ timeline and credited-minute semantics; do not implement Phase 2 UI changes.
- Do not reset, revert, stash, discard unrelated work, commit, or push.

## Review Focus

- A complete pair with malformed types must reject rather than accidentally behave as incomplete legacy data (Task 1).
- A failed resume must not run any editor initialization/autosave path (Task 2).
- A stale draft timer or queued state during import must be skipped after the generation changes (Task 3).
- A team that is not the recorded-match owner must retain legacy SOT behavior (Task 4).
- Stoppage events must remain attributable while exposure and credited minutes stay within regulation (Task 1).

---

### Task 1: Canonical Opponent SOT domain and schema

**Files:**
- Create: `src/engine/opponentSot.ts`
- Modify: `src/types.ts`, `src/lib/validation.ts`
- Test: `tests/phase1-opponent-sot.test.cjs`

**Interfaces:**
- Produces `validateManualOpponentSot(match, teamId)`, `opponentSot(match, teamId)`, `firstHalfOpponentSot(match, teamId)`, `secondHalfOpponentSot(match, teamId)`, and `opponentSotExposure(match, teamId, start, end)`.
- Consumes canonical timeline and scored-goal helpers; only this module owns `valid GK saves + conceded goals` fallback.

- [ ] Write failing behavior tests for manual HT/FT totals, incomplete fallback, invalid complete pairs, half conceded-goal checks, legacy compatibility, no goal double-count, segment values 0–60/70–90, substitutions/position boundaries, and stoppage clipping.
- [ ] Run `npm.cmd test -- tests/phase1-opponent-sot.test.cjs` and verify failures are missing-domain behavior.
- [ ] Add optional HT/FT fields and implement the canonical domain using regulation-clipped overlap and current event ordering.
- [ ] Extend persisted-state validation to reject complete invalid manual pairs without rejecting old fields that are absent.
- [ ] Re-run the focused test file and verify it passes.

### Task 2: Fail-closed editor restoration and SOT input

**Files:**
- Modify: `src/screens/NewMatchScreen.tsx`, `src/lib/draftLifecycle.ts`
- Test: `tests/phase1-resume-safety.test.cjs`

**Interfaces:**
- Consumes Task 1 validation and `Match` HT/FT fields.
- Produces an explicit editor-source restoration result before `MatchEditor` can mount.

- [ ] Write failing tests proving a complete draft restores authoritative events/substitution/positions/kickoff/appearances/HT/FT SOT and a forced failure cannot mount/default-save under its original ID.
- [ ] Run the focused test file and verify the safety case fails against current mount flow.
- [ ] Block resume/edit mounting on unsuccessful restoration; preserve the raw draft unchanged and keep autosave disabled until success.
- [ ] Add only HT/FT Opponent SOT editor controls and save-time validation feedback needed to persist valid values.
- [ ] Re-run focused tests and verify they pass.

### Task 3: Atomic Store import and persistence fencing

**Files:**
- Modify: `src/lib/repository.ts`, `src/lib/persistenceQueue.ts`, `src/store.tsx`, `src/screens/DataManagementScreen.tsx`
- Test: `tests/phase1-import-atomicity.test.cjs`

**Interfaces:**
- Produces `prepareImportData(json): AppState` and Store `importAppState(json): Promise<void>`.
- Extends the persistence queue with generation-aware invalidation while preserving serialized durable writes.

- [ ] Write failing tests for successful live replacement, stale queued/draft persistence skipping, invalid import preserving memory/storage, and importable compatible recovery data.
- [ ] Run the focused test file and verify it fails because import only persists and asks for refresh.
- [ ] Implement pure import preparation, pre-import backup, epoch fence/timer cancellation, serialized import persistence, live snapshot replacement, derived-cache clearing, and immediate success UI.
- [ ] Re-run focused tests and verify they pass.

### Task 4: Rating engine, ranking, analytics, and competition migration

**Files:**
- Modify: `src/engine/rating.ts`, `src/engine/ratingRevision.ts`, `src/engine/stats.ts`, `src/engine/analytics.ts`, `src/engine/competition.ts`
- Test: `tests/phase1-rating-and-consumers.test.cjs`

**Interfaces:**
- Consumes Task 1 SOT totals/exposure.
- Retains `ratePlayerMatch`, ranking, combination, and competition public APIs.

- [ ] Write failing tests for exact conceded/team-goal/suppression values, manual SOT suppression/exposure, independent GK saves, player SOT ranking, combinations, and League/Cup/Champions SOT/rating tie-breaks.
- [ ] Run the focused test file and verify the pre-change coefficients and duplicate formulas fail it.
- [ ] Replace local SOT formulas with Task 1 APIs; use segment exposure in suppression; apply all approved coefficient values and increment the rating revision.
- [ ] Re-run focused tests and verify they pass.

### Task 5: Historical derived propagation and cache safety

**Files:**
- Modify as required: `src/engine/historyReadModels.ts`, `src/engine/seasonAnalytics.ts`, `src/engine/playerDerived.ts`, `src/engine/playerRecords.ts`, `src/engine/news.ts`, `src/engine/matchChangeIndex.ts`
- Test: `tests/phase1-derived-propagation.test.cjs`

**Interfaces:**
- Consumes current `ratePlayerMatch`, MOM, canonical ranking, award, record, and competition results.
- Produces no stored rating; all values remain raw-history-derived and revision/identity-safe.

- [ ] Write failing historical fixture tests for Match Detail ordering/MOM, Player Detail/form, Global Ranking/Team Best Players, Best XI/ToW/ToY, competition player rankings and average-rating tie-breaks, Records/combinations/analytics, trends/history/change projections, and stale cache invalidation.
- [ ] Run the focused test file and verify old revision/cache or duplicated SOT behavior fails it.
- [ ] Update cache identities/clear paths and consumers necessary to guarantee all use the canonical raw-data engine.
- [ ] Re-run focused tests and verify they pass.

### Task 6: Regression verification

**Files:**
- Modify: focused Phase 1 tests only as needed for honest behavioral coverage.

- [ ] Run all Phase 1 focused tests together and correct any cross-module failure with a new minimal regression test first.
- [ ] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- [ ] Inspect `git status --short` and `git diff` to confirm only Phase 1 source, test, and approved design/plan files changed; do not commit.
