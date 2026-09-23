# v2.3.1 Match Change Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v2.3.1 with a memory-only MatchChangeIndex, durable-save latency removal, efficient Home results, and scoped Records presentation changes.

**Architecture:** Keep News as its existing full-history projection. Introduce MatchChangeIndex as a separately cached, chronology-driven source-of-truth read model that shares canonical event-rule helpers with News and uses ranking-screen row semantics only for player #1 takeovers.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, browser localStorage and IndexedDB.

**Spec:** `docs/superpowers/specs/2026-09-23-v231-match-change-performance-design.md`

## Global Constraints

- Version: `2.3.1`; `RATING_ENGINE_REVISION = 9`; `STORAGE_KEY = football-tracker-v1`.
- Derived data is memory-only; retain all raw user data and existing domain semantics.
- Do not alter ranking-screen behavior, rating formula, competition identity, or tie rules.
- Do not commit or push; work on the user-authorized current `main` worktree.
- Every behavioral change starts with a test that is observed failing.

## Review Focus

- Historical same-date reorder/edit must rebuild the index with date-first/insertion-order chronology.
- Tied leaders must not generate a takeover without the Ranking source reporting a different leader.
- Mirror/cloud failure after primary success must preserve navigation eligibility and draft-clearing behavior.
- A player missing from the rankings must not get a takeover event merely from raw totals.
- Combination names must change only on Records pair surfaces, not ordinary player presentation.

### Task 1: Canonical Match Changes read model

**Files:**
- Create: `src/engine/matchChangeIndex.ts`
- Modify: `src/engine/news.ts`, `src/engine/matchChanges.ts`, `src/screens/MatchDetailScreen.tsx`
- Test: `tests/v231-match-changes.test.cjs`

**Interfaces:**
- Produces `buildMatchChangeIndex(players, teams, matches, states): Map<string, GroupedMatchChange[]>` and `matchChangesForMatch(...)` backed solely by it.
- Consumes `oldestMatches`, rating APIs, and the Ranking screen's `buildGlobalRankingData`/`rankGlobalRankingRows`.

- [ ] Write tests for the complete pre-change milestone inventory, multiple same-match milestones, rare/streak retention, strict personal bests, no ordinary contribution, and #1 takeovers for every supported scope.
- [ ] Run `node --test tests/v231-match-changes.test.cjs` and confirm it fails because the index/helper behavior is absent.
- [ ] Extract shared milestone/special event-rule helpers; build the cacheable chronological index and change Match Detail to lookup it without calling News.
- [ ] Run the focused test, then `npm.cmd test`; record outputs without committing.

### Task 2: Match Detail and measurement boundaries

**Files:**
- Create: `src/lib/developmentMeasurement.ts`
- Modify: `src/screens/MatchDetailScreen.tsx`, `src/store.tsx`
- Test: `tests/v231-performance-structure.test.cjs`

**Interfaces:**
- Consumes `buildMatchChangeIndex` and exports DEV-only `measureInDevelopment(label, callback)`.
- Produces separately measured Match Detail base-read and MatchChangeIndex cold/cache lookup paths.

- [ ] Write tests demonstrating Match Detail does not import/call full News for What Changed and the measurement helper remains non-UI diagnostics.
- [ ] Run the focused test and observe its expected structural/behavioral failure.
- [ ] Add measurements around the named boundaries and separate base read model from the indexed change lookup.
- [ ] Run focused and full tests without committing.

### Task 3: Durable save contract

**Files:**
- Modify: `src/lib/repository.ts`, `src/store.tsx`, `src/screens/NewMatchScreen.tsx`
- Test: `tests/v231-save-performance.test.cjs`, `tests/p0-durability.test.cjs`

**Interfaces:**
- Preserves `saveAppState(state): Promise<DurableSaveResult>` and `saveMatchDurably(match): Promise<DurableSaveResult>`.

- [ ] Write tests proving validation, serialization, primary write, exact read-back, immediate navigation after durable success, and recovery on write failure.
- [ ] Run focused tests and observe expected failures due to the second parse/validation and 350 ms delay.
- [ ] Remove only the redundant post-equality parse/validation and timeout; add DEV timing around required persistence stages.
- [ ] Run focused, durability, and full tests without committing.

### Task 4: Recent results and Records presentation

**Files:**
- Modify: `src/lib/results.ts`, `src/screens/HomeScreen.tsx`, `src/screens/RecordsScreen.tsx`
- Test: `tests/v231-recent-records.test.cjs`

**Interfaces:**
- Produces `recentDerivedResults(matches, teams, limit)` based on canonical newest-first selection and shared single-match projection.

- [ ] Write failing tests for exact newest five, Results full ordering, signed GD/game with zero-game exclusion, retained total GD/GA records, and displayName-only combination rows.
- [ ] Run the focused test and observe expected failure.
- [ ] Implement shared single-result projection, bounded Home selection, new record group, and presentation-only pair names.
- [ ] Run focused and full tests without committing.

### Task 5: Release alignment and audit

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/config.ts`, existing v2.2.13 release tests
- Test: release and v2.3.1 behavior suites

- [ ] Write/update behavioral release assertions for version alignment and invariants.
- [ ] Run them and observe the version mismatch failure.
- [ ] Set version to 2.3.1 without changing storage/rating constants.
- [ ] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; perform the final whole-diff and performance-structure audit without committing.
