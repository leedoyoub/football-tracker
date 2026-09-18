# Competition Recording Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Cup and Champions match identity across entry, draft recovery, editing, progression, display, cloud sync, and downstream mutation safety.

**Architecture:** A frozen assignment snapshot becomes the match-level source of truth after kickoff. The competition engine proposes new assignments and validates progression using one canonical input set. Shared formatters render the durable match context everywhere, while store-level mutation guards prevent impossible downstream brackets.

**Tech Stack:** React, TypeScript, Node built-in test runner, Supabase client and SQL migrations.

**Spec:** `docs/superpowers/specs/2026-09-18-competition-recording-hardening-design.md`

## Global Constraints

- Preserve approved Champions same-row comparison semantics, three games per team in R16/QF/SF, and two games per team in the Final.
- Preserve Cup Final one-match and existing Final Replay behavior.
- Keep release version `2.2.8`, `RATING_ENGINE_REVISION = 8`, and storage key `football-tracker-v1`.
- Preserve all existing v2.2.8 behavior; do not commit or push.

---

### Task 1: Canonical competition identity and context formatting

**Files:**
- Create: `src/engine/competitionContext.ts`
- Modify: `src/types.ts`, `src/engine/competition.ts`
- Test: `tests/v228-competition-recording.test.cjs`

**Interfaces:**
- Produces `CompetitionAssignmentSnapshot`, `freezeCompetitionAssignment`, `formatCompetitionContext`, and compact context labels.
- Consumes canonical new-match assignment output.

- [ ] Write failing behavior tests for Cup, Champions, and compact/full context labels.
- [ ] Run the focused test and confirm the missing export failure.
- [ ] Implement the snapshot type, snapshot conversion, and shared formatter.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Canonical assignment and Champions integrity

**Files:**
- Modify: `src/engine/competition.ts`, `src/engine/match.ts`
- Test: `tests/v228-competition-recording.test.cjs`

**Interfaces:**
- `competitionAssignment` receives `players` wherever rating/SOT tiebreaks matter.
- Produces truthful availability messages and a fail-closed `seriesGame` proposal.

- [ ] Write failing tests for player-aware Cup consistency, truthful availability, target-season numbering, and corrupt Champions rows.
- [ ] Run the focused test and confirm the current behavior fails.
- [ ] Implement canonical input propagation, valid-series-number detection, and fail-closed assignments.
- [ ] Re-run focused and existing competition tests.

### Task 3: Freeze new/editor/draft match identity

**Files:**
- Modify: `src/screens/NewMatchScreen.tsx`, `src/types.ts`, `src/App.tsx`
- Test: `tests/v228-competition-recording.test.cjs`

**Interfaces:**
- New route may contain an initial `competitionType`; it is not the domain source of truth.
- Draft and save payloads use the frozen assignment snapshot after kickoff.

- [ ] Write failing tests for kickoff freeze, Cup/Champions draft recovery, edit identity preservation, scoped preview statistics, and route initialization.
- [ ] Run the focused test and confirm it fails.
- [ ] Implement snapshot lifecycle, saved-match edit identity, and competition-scoped previews.
- [ ] Re-run focused tests.

### Task 4: Competition-aware display and entry points

**Files:**
- Modify: `src/screens/NewMatchScreen.tsx`, `src/screens/MatchDetailScreen.tsx`, `src/screens/TeamDetailScreen.tsx`, `src/screens/ResultsScreen.tsx`, `src/components/ResultCard.tsx`, `src/screens/CompetitionScreen.tsx`
- Test: `tests/v228-competition-recording.test.cjs`

**Interfaces:**
- Every consumer uses `formatCompetitionContext`.
- Active Cup/Champions contexts may navigate directly to a valid assignment.

- [ ] Write failing tests for no raw stage identifiers, no non-League MD labels, and visible Results competition identity.
- [ ] Run the focused test and confirm it fails.
- [ ] Implement shared labels and valid direct Log Match navigation.
- [ ] Re-run focused tests.

### Task 5: Durable cloud round-trip and mutation safety

**Files:**
- Modify: `src/lib/sync.ts`, `supabase/migrations/20260918120000_add_competition_series_game.sql`, `src/store.tsx`, `src/engine/competition.ts`
- Test: `tests/v228-competition-recording.test.cjs`

**Interfaces:**
- Cloud rows serialize/deserialize `competition_series_game`.
- Store refuses unsafe tournament edit/delete with a clear error while allowing safe corrections.

- [ ] Write failing tests for cloud round-trip, Cup/Champions downstream invalidation, safe correction, and stale completion reconciliation.
- [ ] Run the focused test and confirm it fails.
- [ ] Implement migration, conversion, dependency guard, and conservative marker reconciliation.
- [ ] Re-run focused tests and existing persistence/competition tests.

### Task 6: Cup Final audit and full verification

**Files:**
- Test: `tests/v228-competition-recording.test.cjs`
- Review: `src/engine/competition.ts`, `src/engine/stats.ts`, `src/engine/awards.ts`

- [ ] Write a regression proving the current opposing-finalist player-record behavior.
- [ ] Run it, document whether a compatible correction exists, and avoid a two-team entry redesign unless required and approved.
- [ ] Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- [ ] Inspect status and meaningful final diffs; preserve the uncommitted working tree.
