# Competition Identity and Derived Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove stale fresh-draft competition identity, normalize deterministic historic metadata, and deliver consistent competition-derived stats, records, and presentation.

**Architecture:** Add validated competition identity and lifecycle read models before changing consumers. Make schedule proposals atomic, use them to construct persisted matches, and migrate screens/derived engines to the shared accessors. Replay goal types from canonical timeline events; layer records and movement presentation over existing read models.

**Tech Stack:** React 19, TypeScript, Node built-in test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-09-23-competition-identity-design.md`

## Global Constraints

- Keep `RATING_ENGINE_REVISION = 9`, rating semantics, `STORAGE_KEY = football-tracker-v1`, Champions format, League 30-match limit, navigation behavior, density, and typography.
- Do not mutate raw event, appearance, lineup, date, result, save, or rating data in repair.
- Do not commit or push.
- Bump package/config/lock versions from 2.2.12 to 2.2.13 only.

## Review Focus

- Invalid frozen assignment must not silently outrank valid legacy identity; test Cup S1 ordinal 4 repair.
- A fresh autosave must remain a checkpoint after rerender and must not leak opponent or schedule identity on switch.
- A replacement match with the same array length must invalidate the affected competition scope.
- Own goals and same-minute goals must preserve stable score replay while excluding own-goal players from goal totals.
- Match-change labels must never publish a Team ranking decline or duplicate #1 takeover.

---

### Task 1: Validated competition identity and deterministic repair

**Files:**
- Modify: `src/engine/competitionContext.ts`, `src/engine/competition.ts`, `src/engine/competitionRevision.ts`, `src/engine/match.ts`
- Test: `tests/v2213-competition-identity.test.cjs`

**Produces:** `competitionIdentityForMatch`, `matchCompetitionType`, `matchCompetitionStage`, `normalizeMatchCompetitionIdentity`, canonical schedule ordinal helpers.

- [ ] Write fixtures for valid assignment precedence, invalid Cup S1 assignment repair, idempotency, scoped filtering, and revision invalidation.
- [ ] Run `node --test tests/v2213-competition-identity.test.cjs`; expect missing-accessor assertions to fail.
- [ ] Implement validated accessors, non-destructive repair, accessor-based scope/revision logic, chronology-safe `getTeamMatches`, and deterministic Cup/Champions ordinal derivation.
- [ ] Re-run the focused test; expect pass.

### Task 2: Explicit fresh/resume/edit editor lifecycle

**Files:**
- Modify: `src/lib/draftLifecycle.ts`, `src/screens/NewMatchScreen.tsx`, `src/store.tsx`
- Test: `tests/v2213-draft-identity.test.cjs`

**Consumes:** Task 1 identity/proposal helpers.

- [ ] Write pure-transition tests for A--F: fresh League autosave then Cup/Champions switch, Cup Final opponent, resume, locked edit, and repair.
- [ ] Run focused lifecycle test; expect missing mode/proposal behavior to fail.
- [ ] Extract lifecycle mode/proposal helpers; use no source record in fresh mode; atomically replace identity on switch; freeze on Continue; verify identity before save.
- [ ] Re-run focused test; expect pass.

### Task 3: Hydration, consumers, cache, and historical appearance scopes

**Files:**
- Modify: `src/lib/repository.ts`, `src/lib/cloudMatch.ts`, `src/engine/stats.ts`, `src/engine/playerDerived.ts`, `src/engine/seasonAnalytics.ts`, `src/engine/seasonInsights.ts`, `src/screens/PlayerDetailScreen.tsx`, relevant competition/ranking screens
- Test: `tests/v2213-competition-consumers.test.cjs`

**Consumes:** Task 1 accessors and repair.

- [ ] Write failing tests for conflicting valid assignment interpretation, aggregate partitions, per-90 invariant, hydration repair, and transfer-history appearances.
- [ ] Run focused consumers test; expect raw-field filtering to fail.
- [ ] Apply accessors at every audited consumer, normalize hydration/cloud/import boundaries, and fix player history to filter appearances.
- [ ] Re-run focused consumers test; expect pass.

### Task 4: Goal replay model and requested records

**Files:**
- Modify: `src/engine/goalTypes.ts`, `src/engine/playerDerived.ts`, `src/engine/playerRecords.ts`, `src/screens/PlayerDetailScreen.tsx`, `src/screens/RecordsScreen.tsx`
- Test: `tests/v2213-goal-types.test.cjs`

**Consumes:** canonical ordered events and player derived read model.

- [ ] Write failing exhaustive base/special goal fixtures including own, same-minute, stoppage-time, reordering, and zero leaderboard cases.
- [ ] Run focused goal-type test; expect old six-tag assertions to fail.
- [ ] Implement five exclusive base tags and three special tags from replay; add requested record groups and grouped UI.
- [ ] Re-run focused goal-type test; expect pass.

### Task 5: Ranking terminology, 7.2 metric, and Match Changes policy

**Files:**
- Modify: `src/lib/rankingMetrics.ts`, `src/screens/HomeScreen.tsx`, `src/screens/GlobalRankingScreen.tsx`, `src/screens/CompetitionScreen.tsx`, `src/engine/matchChanges.ts`, `src/lib/matchChangePresentation.ts`
- Test: `tests/v2213-ranking-changes.test.cjs`

- [ ] Write failing tests for metric ordering, visible naming, Team Top-3 movement, labels, takeover de-duplication, and record movement.
- [ ] Run focused ranking test; expect existing generic movement to fail.
- [ ] Implement presentation-only labels and policy over canonical before/after rows while preserving Global/competition Top-10 behavior and grouped fallback cards.
- [ ] Re-run focused ranking test; expect pass.

### Task 6: Release metadata and whole-system verification

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/config.ts`
- Test: all tests

- [ ] Write/update metadata assertions for 2.2.13 while pinning revision 9 and storage key.
- [ ] Run the metadata test; expect current version failure.
- [ ] Apply exactly the allowed version bump.
- [ ] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; inspect every output and the final diff.
