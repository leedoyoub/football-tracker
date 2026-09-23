# v2.3.3 Champions, Team Titles, and Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver live display-only Champions bracket slots, historical player team-title awards, the exact team catalog order, and milestone-only What Changed without altering authoritative football data or rating behavior.

**Architecture:** Keep `competition.ts` as the sole authoritative competition model, with a pure downstream display projection consumed only by `CompetitionScreen`. Add a cached history read model for champion-title membership and simplify the existing cached MatchChangeIndex to canonical structured milestones only. UI reads remain lazy and derived data remains memory-only.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, Tailwind utility classes.

**Spec:** `docs/superpowers/specs/2026-09-24-v233-champions-titles-milestones-design.md`

## Global Constraints

- Version is `2.3.3`; `RATING_ENGINE_REVISION = 10`; `STORAGE_KEY = football-tracker-v1`.
- Retain all v2.3.2 rating semantics and coefficients, including ST/SS assist `.55`.
- Persist no projection/cache and do not migrate or alter historical raw football data, identities, or existing draw order.
- Projected Champions slots cannot enable assignment, record matches, advance a season, generate awards, or generate News.
- Do not commit or push; implement in the user-authorized current worktree.
- Every behavioral change begins with a focused test observed failing.

## Review Focus

- Corrupt, gapped, duplicate, or only-one-side Champions game identity remains fail-closed rather than selecting a guessed winner.
- A full canonical round replaces a projected slot with the same ordered IDs, with neither duplication nor a temporary `TBD` flicker.
- A player transferred after a title season remains credited only where that season's appearance membership proves champion-team membership.
- A match that crosses several canonical thresholds returns every milestone with stable IDs, while equal/previously crossed thresholds do not recur.
- News still includes approved rare, personal-record, ranking, competition, awards, and milestone events after MatchChangeIndex loses those non-milestone computations.

### Task 1: Champions partial rows and display projection

**Files:**
- Modify: `src/engine/competition.ts`, `src/screens/CompetitionScreen.tsx`, `src/screens/HomeScreen.tsx` or its existing recent-results helper
- Test: `tests/v233-champions-live-bracket.test.cjs`

**Interfaces:**
- Produces `ChampionsPairing.rowWinners`, canonical `winnerId`, and a pure `projectChampionsRounds(rounds)` display-slot helper.
- Consumes `compareChampionsSeriesRow`, `championsSeriesIntegrity`, immutable draw IDs, and existing `competitionAssignment` authority checks.

- [ ] Write fixtures with independent A/B series games 1–3 and assert: rows resolve only after matching game numbers, `winnerId` remains absent before all three rows, full rows resolve the canonical pairing winner, and invalid series identity remains unresolved.
- [ ] Run `node --test tests/v233-champions-live-bracket.test.cjs` and confirm it fails against the all-or-nothing current row implementation.
- [ ] Change `makeSeriesRound` to index valid games by `competitionSeriesGame`, calculate only same-number completed rows, and gate non-final `winnerId` on complete valid three-game history; preserve the Final/replay path.
- [ ] Add a side-effect-free projection that maps pairing 0/1, 2/3, and onward winners to the next bracket slots without altering round construction or assignment APIs.
- [ ] Render projected IDs/TBD only in the bracket; keep prior-round cards, give score cells shared win/loss/neutral classes from `rowWinners`, and give icons result classes only from a pairing's resolved `winnerId`.
- [ ] Assert projection A/TBD then A/B, canonical transition equality, neutral projected icons, previous-round persistence, shared palette tokens, and that projected IDs do not make `competitionAssignment` available.
- [ ] Run the focused suite and `npm.cmd test`.

### Task 2: Canonical team catalog order and release invariants

**Files:**
- Modify: `src/data/teams.ts`, `package.json`, `package-lock.json`, `src/config.ts`
- Test: `tests/v233-team-order-release.test.cjs`

**Interfaces:**
- Produces `STATIC_TEAMS.map(team => team.id)` in the exact 16-ID order and version-aligned release metadata.
- Consumes existing identity-preserving `withStaticTeams`, `currentStaticTeams`, and stored Champions draw state unchanged.

- [ ] Write an exact-array assertion for the requested 16 IDs, an identity-field equality assertion for Inter Miami, and a stored `champions-draw.teamIds` assertion demonstrating catalog order does not mutate draw history.
- [ ] Run `node --test tests/v233-team-order-release.test.cjs` and confirm it fails on the old order/version.
- [ ] Reorder only the declarations in `STATIC_TEAMS`; update the three version sources to `2.3.3`; do not change rating revision, storage key, IDs, external IDs, names, logos, or draw handling.
- [ ] Assert release invariants, including the retained rating constants, then run the focused suite and `npm.cmd test`.

### Task 3: Historical player team-title read model and Awards integration

**Files:**
- Modify: `src/engine/historyReadModels.ts`, `src/screens/PlayerDetailScreen.tsx`
- Test: `tests/v233-player-team-titles.test.cjs`

**Interfaces:**
- Produces `playerTeamTitles(teams, players, matches, states, playerId, season): string[]` with labels `Season N League|Cup|Champions`.
- Consumes canonical `competitionSeasonStatus` and season/team membership indexed from `Appearance.teamId`.

- [ ] Write fixtures for league/cup/champions titles, a treble, incomplete competitions, duplicate prevention, season separation, historical transfer membership, and current-team false attribution.
- [ ] Run `node --test tests/v233-player-team-titles.test.cjs` and confirm it fails because no team-title read model exists.
- [ ] Add one cache keyed by source-array identities/revision that computes season champion IDs once and builds a `season:teamId -> playerId set` appearance membership index once; expose a cheap per-player lookup.
- [ ] Append title labels to the selected-season Player Detail awards while retaining individual/monthly awards and using the combined list for the visible count and empty state.
- [ ] Assert a champion-team appearance in any competition grants the season title, post-season transfers do not alter it, and nonmembers never receive it; run focused and full tests.

### Task 4: Milestone-only MatchChangeIndex and lazy UI

**Files:**
- Modify: `src/engine/matchChangeIndex.ts`, `src/engine/matchChanges.ts`, `src/lib/matchChangePresentation.ts`, `src/screens/MatchDetailScreen.tsx`
- Test: `tests/v233-milestones-only.test.cjs`

**Interfaces:**
- Produces `lookupMatchChanges(...)` containing only structured `kind: 'milestone'` items and all same-match canonical crossings.
- Consumes the existing chronology/caching inputs and milestone helpers; does not call ranking/personal-record/rare event derivation.

- [ ] Write tests that include goal, assist, MOM, and multiple same-match milestone crossings; then assert ranking #1, strict personal-best, and rare-only fixtures yield no What Changed items while their News items remain available.
- [ ] Run `node --test tests/v233-milestones-only.test.cjs` and confirm it fails because the current index emits ranking, record, and performance kinds.
- [ ] Delete the index-local ranking accumulator/takeover logic, strict personal-best tracking, and rare/non-milestone emission; retain only structured milestone add operations and canonical crossing identity.
- [ ] Narrow grouping/presentation to milestone categories without title matching, retain revision-aware WeakMap cache behavior, and render `No milestones reached in this match.` when the lazy expanded panel gets an empty lookup.
- [ ] Add structure assertions that Match Detail avoids an eager index build and the index has no prefix-ranking rebuild; run focused, existing News, and full test suites.

### Task 5: Release-wide regression and audit

**Files:**
- Modify: only release tests/docs required by discovered coverage gaps
- Test: all `tests/*.test.cjs`

**Interfaces:**
- Verifies no changed source modifies persistence schema, rating coefficients, or non-What-Changed Ranking/Records/News semantics.

- [ ] Run `npm.cmd test`; repair only defects exposed by the regression suite.
- [ ] Run `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`; repair only release-scoped failures.
- [ ] Inspect `git status --short`, `git diff --stat`, and the full `git diff`; compare every changed line to the spec and list unresolved ambiguity/blockers rather than guessing.

### Task 5A: Competition ranking preview and full-screen filtering

**Files:** `src/screens/CompetitionScreen.tsx`, `src/screens/GlobalRankingScreen.tsx`, ranking regression tests.

- [ ] Write failing coverage for Cup/Champions View All routes, removed compact-preview controls, and the Global Ranking source-level team filter.
- [ ] Simplify the non-League `CompetitionRankings` component to one scoped ranking dataset, metric tabs, Top 10, and a scoped Global Ranking View All route.
- [ ] Add a full-screen Team selector that passes selected IDs into `buildGlobalRankingData`; retain the scope and position controls and League-only movement behavior.
- [ ] Verify preview/full-screen ranking equivalence without filters; preserve League-specific panels.
