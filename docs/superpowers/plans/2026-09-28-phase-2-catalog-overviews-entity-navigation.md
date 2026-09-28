# Phase 2 Catalog, Overview, and Entity Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver 2.4.1 catalog/order, canonical overview, Top 10 preview, and browse-surface identity navigation without changing Phase 1 behavior.

**Architecture:** `STATIC_TEAMS` supplies display sequence while `currentStaticTeams` preserves saved records; `PlayerDerived` supplies Apps; and `teamCompetitionOverview` supplies every Team Detail competition field. Shared entity action components compose current visual primitives and mixed-destination UI is split into sibling buttons.

**Tech Stack:** React, TypeScript, Vite, Node test runner, Tailwind utility classes.

**Spec:** `docs/superpowers/specs/2026-09-28-phase-2-catalog-overviews-entity-navigation-design.md`

## Global Constraints

- Baseline `7268d2c`: do not alter Phase 1 SOT, rating, import, draft, cache, persistence, chronology, or competition progression behavior.
- Set only application/package release versions to `2.4.1`; `RATING_ENGINE_REVISION` remains `11`; do not change schema or storage values.
- `STATIC_TEAMS`/`currentStaticTeams(teams)` must yield the exact approved 16-team order; never mutate persisted arrays, IDs, historical matches, draws, or competition history.
- `teamCompetitionOverview` is the only Champions/Cup progress, W-D-L, and GF-GA data source consumed by Team Detail.
- Apps is `PlayerDerived.apps`; Top 10 is applied only after canonical filtering/ranking of the selected lazy metric.
- Entity actions are browse/display-only and canonical-ID-only. Editors, lineup/draft/squad pickers, swaps, and API candidates retain selection behavior.
- No nested interactive elements; preserve native keyboard/focus semantics and root navigation/back/scroll behavior.
- Do not begin Phase 3 Records or Latest Changes work. Do not commit or push.

## Review Focus

- Saved teams in a non-catalog order still display in catalog order without changing saved properties, IDs, or match references.
- A completed Champions/Cup state retains its champion/elimination outcome while gaining W-D-L presentation.
- An unused substitute remains excluded from scoped Player Detail Apps.
- Position filtering occurs before the selected metric is limited to ten; fewer qualifying rows are not padded.
- Legacy, missing, and API-only entities do not create focusable navigation actions or guessed IDs.

---

## File Structure

- `src/data/teams.ts` and `src/screens/TeamsScreen.tsx`: catalog order and display-only rendering.
- `src/engine/competition.ts` and `src/screens/TeamDetailScreen.tsx`: canonical competition overview fields and presentation.
- `src/screens/PlayerDetailScreen.tsx` and `src/screens/HomeScreen.tsx`: canonical Apps and final Top 10 limit.
- `src/components/EntityActions.tsx` (new): accessible team/player identity actions over visual primitives.
- `src/components/RankingRow.tsx`, `ResultCard.tsx`, `TeamLink.tsx`, `StandingsTable.tsx`: shared valid sibling interactive regions.
- Browse surfaces with direct identity visuals: pass root `onNavigate` only for registered browse targets.
- `tests/v241-phase2-release.test.cjs` and `tests/v241-entity-navigation.test.cjs` (new): behavioral coverage; update only superseded existing expectations.

### Task 1: Release metadata and canonical catalog display

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/config.ts`, `src/data/teams.ts`, `src/screens/TeamsScreen.tsx`
- Modify: existing release/order assertions found by `rg '2\\.3\\.4|STATIC_TEAMS' tests`
- Test: `tests/v241-phase2-release.test.cjs`, `tests/team-identity.test.cjs`, `tests/v233-team-order-release.test.cjs`, `tests/v212-team-cards.test.cjs`

**Interfaces:** Produces exact approved `STATIC_TEAMS`/`currentStaticTeams` order and a Teams grid mapping `catalogTeams`, not persisted order. Current-catalog consumers in Competition, history/awards/news models, New Match assignment, Records history, Store seed/reconciliation, and Teams consume this order.

- [ ] **Step 1: Write failing release/catalog tests**

Assert all release sources equal `2.4.1`, revision equals `11`, and the sixteen approved IDs/names are ordered. Use a shuffled saved array with a custom saved Real Madrid record and a historical match; assert `currentStaticTeams` resolves that record in catalog position without mutating inputs or references.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm.cmd test -- v241-phase2-release`

Expected: FAIL because release metadata/order/grid still reflect the pre-Phase-2 state.

- [ ] **Step 3: Implement release and display-only catalog changes**

Update only the three release sources. Reorder only `STATIC_TEAMS`, retaining each stable/upstream ID and property; keep `withStaticTeams` reconciliation unchanged. Render Teams and its progress map from `catalogTeams`, without writing or sorting the Store array. Audit every `currentStaticTeams` consumer: it is acceptable for current official-catalog/tournament read models, but no persisted chronology, draw, or history logic may become array-order dependent.

- [ ] **Step 4: Update superseded expectations and rerun focused tests**

Run: `npm.cmd test -- v241-phase2-release team-identity v233-team-order-release v212-team-cards results-random`

Expected: PASS; exact catalog, saved-record preservation, four-column grid, and non-mutation coverage are green.

### Task 2: Canonical competition overview record and compact progress

**Files:**
- Modify: `src/engine/competition.ts`, `src/screens/TeamDetailScreen.tsx`
- Test: `tests/v241-phase2-release.test.cjs`, `tests/competition.test.cjs`, `tests/competition-refinement.test.cjs`, `tests/recent-matches.test.cjs`

**Interfaces:** Produces `TeamCompetitionOverview.champions` and `.cup` with `status`, `wins`, `draws`, `losses`, `goalsFor`, and `goalsAgainst`; Team Detail Overview is the sole consumer.

- [ ] **Step 1: Write failing read-model and layout tests**

Use representative Cup/Champions matches to assert canonical W-D-L and GF-GA. Assert Team Detail reads overview W-D-L fields, renders `col-span-2` plus two single columns for both rows, and shows `Round of 16 (2/3)`/`Final (1/2)` without `Game`.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm.cmd test -- v241-phase2-release competition competition-refinement recent-matches`

Expected: FAIL because overview omits W-D-L and status/layout remain pre-Phase-2.

- [ ] **Step 3: Extend only `teamCompetitionOverview`**

Derive each record from existing canonical competition-scoped models/matches inside the read model. Preserve champion, elimination, replay, required-game, and GF-GA semantics. Format compact stage progress from canonical labels/required-game data, with parenthesized counts and no `Game` word.

- [ ] **Step 4: Present canonical fields and rerun tests**

Render `Progress col-span-2 | W-D-L | GF-GA` for Cup and Champions; leave League alone. Run: `npm.cmd test -- v241-phase2-release competition competition-refinement recent-matches`

Expected: PASS; Team Detail performs no local competition calculation.

### Task 3: Player Detail Apps and Home selected-metric Top 10

**Files:**
- Modify: `src/screens/PlayerDetailScreen.tsx`, `src/screens/HomeScreen.tsx`
- Modify: existing Home-preview assertions that deliberately expect five rows
- Test: `tests/v241-phase2-release.test.cjs`, `tests/presentation-ux.test.cjs`, `tests/rating-correctness.test.cjs`, `tests/global-rankings.test.cjs`, `tests/v2211-ranking-position-filter.test.cjs`

**Interfaces:** Consumes scoped `PlayerDerived` and `buildGlobalRankingData`/`rankGlobalRankingRows`; produces two three-column Player Detail rows and selected-metric Home results capped at ten.

- [ ] **Step 1: Write failing layout and behavior tests**

Assert unchanged `Avg Rating | Goals | Assists`, then `Apps | Minutes | MOM`, both three columns and using `data.apps`, `data.minutes`, and `data.mom`. Create a starter plus unused-bench fixture and assert canonical Apps equals one. Assert Home filters/ranks first, then uses `.slice(0, 10)`, returns ten/fewer eligible rows, and retains View All navigation.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm.cmd test -- v241-phase2-release presentation-ux rating-correctness global-rankings v2211-ranking-position-filter`

Expected: FAIL because the second row has two fields and Home caps at five.

- [ ] **Step 3: Implement presentation-only changes**

Add only `data.apps` to the second Player Detail row; do not change `playerDerived`. Change only the final selected-metric Home list/render limit to ten, retaining the filtered memoized index, lazy selected metric, tabs, and View All payload.

- [ ] **Step 4: Update superseded expectations and rerun tests**

Run: `npm.cmd test -- v241-phase2-release presentation-ux rating-correctness global-rankings v2211-ranking-position-filter`

Expected: PASS; canonical Apps and filter-before-limit behavior are demonstrated.

### Task 4: Shared identity actions and valid shared rows/cards

**Files:**
- Create: `src/components/EntityActions.tsx`
- Modify: `src/components/RankingRow.tsx`, `src/components/ResultCard.tsx`, `src/components/TeamLink.tsx`, `src/components/StandingsTable.tsx`
- Test: `tests/v241-entity-navigation.test.cjs`, `tests/player-search-navigation.test.cjs`, `tests/presentation-ux.test.cjs`

**Interfaces:** Produces `TeamIdentityAction` and `PlayerIdentityAction`, accepting resolved entities and root navigation callbacks; missing targets render passive visual fallback. RankingRow gains independent player/team callbacks and ResultCard independent match/team callbacks in sibling regions.

- [ ] **Step 1: Write failing interaction tests**

Assert valid entity actions produce expected team/player views with accessible labels; missing entities have no button. Assert RankingRow has independent player/team targets without button nesting. Assert ResultCard has two team targets plus a separate Match Detail region and no `stopPropagation` workaround.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `npm.cmd test -- v241-entity-navigation player-search-navigation presentation-ux`

Expected: FAIL because the action module does not exist and current shared controls use passive crests/one outer button.

- [ ] **Step 3: Implement visual/action composition**

Keep `TeamIcon`/`PlayerAvatar` visual. Add native action wrappers only when a resolved entity and callback exist. Refactor TeamLink to compose the team action; refactor RankingRow/ResultCard to non-interactive layout containers with sibling buttons; route Standings through the shared Team action. Preserve compact sizing and focus/tap styling.

- [ ] **Step 4: Rerun shared-component tests**

Run: `npm.cmd test -- v241-entity-navigation player-search-navigation presentation-ux`

Expected: PASS; valid targets navigate, unknown targets stay passive, and modified shared components contain no nested buttons.

### Task 5: Wire only browse surfaces to root navigation

**Files:**
- Modify: `src/screens/HomeScreen.tsx`, `ResultsScreen.tsx`, `GlobalRankingScreen.tsx`, `CompetitionScreen.tsx`, `TeamDetailScreen.tsx`, `PlayerDetailScreen.tsx`
- Modify: only applicable browse-display consumers found by final `rg '<(TeamIcon|PlayerAvatar|PlayerIcon|RankingRow|ResultCard)' src --glob '*.tsx'` audit
- Test: `tests/v241-entity-navigation.test.cjs`, `tests/v2211-navigation.test.cjs`, `tests/navigation-stack.test.cjs`, `tests/recent-matches.test.cjs`

**Interfaces:** Consumes Task 4 actions and existing root `onNavigate(view: View)`; produces canonical-ID actions for registered browse entities and unchanged editor/picker actions.

- [ ] **Step 1: Write failing end-to-end navigation tests**

Cover simple team crest, player avatar, team crest versus Match Detail region in a result card, and RankingRow player versus team crest. Assert real `team`, `player`, and `match` views, Back stack restoration, non-interactive invalid targets, and no navigation props added to editor/picker components.

- [ ] **Step 2: Run focused navigation tests to verify they fail**

Run: `npm.cmd test -- v241-entity-navigation v2211-navigation navigation-stack recent-matches`

Expected: FAIL because browse identities/mixed cards lack independent destinations.

- [ ] **Step 3: Apply actions to browse/display surfaces only**

Pass root navigation through Home recent cards/leaders, Results, Global Ranking, Competition rankings/header/bracket/draw display where appropriate, Team Detail ranking/header/match display, Player Detail display context, and every other browse identity found in the final audit. Use Store lookup maps so only registered IDs become actions. Preserve a single action if the outer action already targets that entity. Do not touch New Match, Pitch editing, squad import/selection, API search, swaps, or draft controls.

- [ ] **Step 4: Complete surface audit and rerun focused tests**

Classify each remaining visual as browse action, same-destination action, unresolved passive visual, or editor/picker exclusion in test comments/implementation notes. Run: `npm.cmd test -- v241-entity-navigation v2211-navigation navigation-stack recent-matches`

Expected: PASS; no registered browse identity is inert, mixed controls are siblings, and Back restoration stays green.

### Task 6: Regression, scope, and release verification

**Files:**
- Modify only test expectations proven superseded by this plan.
- Test: complete existing suite plus new Phase 2 tests.

- [ ] **Step 1: Run focused Phase 2 suites**

Run: `npm.cmd test -- v241-phase2-release v241-entity-navigation`

Expected: PASS. Diagnose unexpected failures before changing implementation.

- [ ] **Step 2: Run complete verification**

Run each command in order: `npm.cmd test`; `npm.cmd run lint`; `npm.cmd run build`; `git diff --check`; `git status --short`; `git diff --stat`; `git diff --no-ext-diff`.

Expected: full suite green, lint exit 0, production build succeeds, `git diff --check` has no errors, and the final diff is limited to Phase 2/version/test/spec work. Do not commit or push.

- [ ] **Step 3: Audit protected boundaries before handoff**

Verify revision `11`; compare Phase 1 SOT/rating/import/draft/cache/persistence files against `7268d2c`; confirm unchanged. Confirm no Records or Latest Changes implementation changed. Include catalog-consumer and browse-surface audits in the final report.
