# Phase 4A Award Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all Best XI and Best Player award selectors consume one
historical-context-aware, deterministic, scored candidate source.

**Architecture:** Extend the existing award and canonical-stat modules rather
than creating another event or rating engine. Candidate aggregation retains
appearance-time team/position context, selection applies the specified scope
policy and score, and existing award read models consume the shared result.

**Tech Stack:** React 19, TypeScript, Node test runner, existing canonical
ratings/MOM/chronology/competition engines.

**Spec:** `docs/superpowers/specs/2026-09-28-phase-4a-award-selection-design.md`

## Global Constraints

- Keep `APP_VERSION = '2.4.1'` and `RATING_ENGINE_REVISION = 11`.
- Do not persist award candidates or selection bonuses.
- Do not change rating, MOM, Global Ranking, import, draft, or Phase 4B–D
  UI/navigation behavior.
- Do not commit, push, deploy, reset, stash, or discard unrelated work.

## Review Focus

- A transferred player must keep appearance-time team denominator, position,
  and selected slot identity; Task 1 tests this.
- Exact `.40` rounding boundaries for every cumulative scope and the
  recent-three Team of Week exception must not drift; Task 1 tests both.
- An in-progress final must not receive champion/runner-up credit; Task 2
  tests only confirmed progress.
- Best Player and Best XI must share one sorted candidate source; Task 3 tests
  a comparator case where independent selectors would disagree.
- Existing finalized News must stay completion-gated despite live candidates;
  Task 3 tests the publication boundary.

---

### Task 1: Historical award candidate and eligibility policy

**Files:**
- Modify: `src/engine/awardRules.ts`, `src/engine/stats.ts`
- Test: `tests/phase4a-award-selection.test.cjs`

**Interfaces:**
- Produces a reusable historical candidate row and cumulative/recent ordering
  helpers consumed by award and Best XI selectors.

- [ ] Write failing tests for 40% rounding, historical transfer context,
  full cumulative comparator, recent-three Team of Week comparator, and no
  duplicate player selection.
- [ ] Run the focused test and verify the current 50%/name-based behavior
  fails.
- [ ] Implement the minimal candidate aggregation and policy helpers using
  existing canonical ratings, MOM, chronology, positions, and events.
- [ ] Re-run the focused test and verify it passes.

### Task 2: Exact achievement-bonus policy and live progress

**Files:**
- Modify: `src/engine/awards.ts`
- Test: `tests/phase4a-award-selection.test.cjs`

**Interfaces:**
- Consumes Task 1 candidate rows and canonical competition models.
- Produces scored competition and season selection results with raw display
  values and selection-only scores.

- [ ] Write failing tests for every exact league, Champions, Cup, and season
  bonus threshold, treble `.62`, and in-progress current-progress behavior.
- [ ] Run the focused test and verify it fails against the legacy tables and
  participation-scaled score.
- [ ] Implement direct bonuses, current-progress mapping, and shared
  competition/season selection without future outcomes.
- [ ] Re-run the focused test and verify it passes.

### Task 3: Shared consumers and completion boundary

**Files:**
- Modify: `src/engine/awards.ts`, `src/engine/seasonAnalytics.ts`,
  `src/engine/news.ts` only if needed to preserve publication gating
- Test: `tests/phase4a-award-selection.test.cjs`

**Interfaces:**
- Consumes Tasks 1–2 shared selection output.
- Produces identical Best Player/Best XI candidate ordering for a scope while
  retaining finalized News/history publication rules.

- [ ] Write failing tests proving monthly performance-only ordering, shared
  Best Player/Best XI source, non-mutation, and in-progress no-News behavior.
- [ ] Run the focused test and verify it fails.
- [ ] Wire existing competition, season, monthly, and Best XI consumers to
  their appropriate shared policy without any UI change.
- [ ] Re-run the focused test and affected existing award/news tests.

### Task 4: Verification and semantic audit

**Files:**
- Modify: plan task boxes only, if useful for the implementation record.

- [ ] Run the focused Phase 4A tests, full test suite, lint, production build,
  and `git diff --check`.
- [ ] Audit the full diff and repository references to verify bonuses remain
  selection-only, no Phase 4B–D UI files changed, version/revision stayed
  fixed, and only approved files are modified.
