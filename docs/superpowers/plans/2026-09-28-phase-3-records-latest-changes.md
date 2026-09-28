# Phase 3 Records and Latest Changes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace inline Records expansion with scoped dedicated leaderboards and Home News with canonical Latest Changes.

**Architecture:** Centralize Records group selection so compact previews and a shared full-leaderboard shell consume identical canonical rows. Adapt the existing cached football-event projection into one deterministic Latest Changes projection; Home takes its first four prepared groups and the dedicated screen takes all of them.

**Tech Stack:** React, TypeScript, Vite, Node test runner, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-28-phase-3-records-latest-changes-design.md`

## Global Constraints

- Baseline `cecf169`; preserve Phase 1 SOT/rating/import/draft/persistence and Phase 2 UI/entity-navigation behavior.
- Keep version `2.4.1` and `RATING_ENGINE_REVISION` exactly `11`.
- Reuse canonical Records models, chronology, `deriveFootballEvents`, shared filters, root navigation entries, and Phase 2 entity actions; never persist a derived feed.
- Records ranking previews are Top 3 only; View All pushes a separate view and never expands inline.
- Apply Records filters before ranking, retain historical position semantics, and intentionally hide inapplicable filters.
- Latest Changes is newest-first, deterministic, low-noise, grouped by match where appropriate; Home is exactly `slice(0, 4)` of the View All projection.
- Do not commit or push; task commit steps are intentionally omitted by explicit user instruction.

## Review Focus

- Historical player position and team scopes must narrow inputs before ranking rather than hide already-ranked rows (Task 1 tests).
- A Records push must preserve the prior Records entry and scroll, including a non-default category and every active filter (Task 3 tests).
- Deleted, legacy, and API-only IDs must remain passive rather than creating guessed navigation targets (Tasks 2–3 tests).
- A match edit/delete/date change must invalidate/reorder Latest Changes without persisting feed state (Task 4 tests).
- Multiple eligible events from one latest match must retain meaningful source identities without flooding Home’s four-card preview (Task 4 tests).

---

## File Structure

- `src/screens/recordsLeaderboards.ts`: one pure adapter from existing player/team/combination Records calculations to typed scoped groups.
- `src/screens/RecordsScreen.tsx`: compact Top 3 previews, shared filters, and route pushes only.
- `src/screens/RecordsLeaderboardScreen.tsx`: one full-list shell with player/team/combination renderers.
- `src/types.ts`, `src/lib/navigation.ts`, `src/App.tsx`: dedicated Records leaderboard and Latest Changes views plus entry-scoped state defaults.
- `src/engine/latestChanges.ts`: cached canonical Latest Changes selection, ordering, and presentation grouping over existing event sources.
- `src/screens/HomeScreen.tsx`, `src/screens/LatestChangesScreen.tsx`: preview and uncapped full presentation.
- `tests/v31-records-leaderboards.test.cjs`, `tests/v31-latest-changes.test.cjs`: Phase 3 behavioral coverage; update only explicitly superseded News/Records assertions.

### Task 1: Extract canonical Records leaderboard groups and compact previews

**Files:**
- Create: `src/screens/recordsLeaderboards.ts`
- Modify: `src/screens/RecordsScreen.tsx`, `src/screens/RankingFilters.tsx`
- Test: `tests/v31-records-leaderboards.test.cjs`, existing Records/filter tests

**Interfaces:** Produces `recordsLeaderboardGroups({ category, players, teams, matches, scope }): RecordsLeaderboardGroup[]`, where each group has stable `id`, `title`, `kind`, canonical ranked `rows`, and `applicableFilters`. It consumes existing player record, team metric, and combination functions.

- [ ] **Step 1: Write failing canonical-group tests**

Assert player, team, and combination groups preserve their existing ordering/calculation; season/team/competition/position scope is applied before ranks; and each preview is exactly three rows.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v31-records-leaderboards.test.cjs`

Expected: FAIL because no shared group adapter exists and Records owns inline expansion.

- [ ] **Step 3: Implement the pure adapter and compact Records renderer**

Move only presentation-adjacent group construction into `recordsLeaderboardGroups`. Keep domain functions unchanged. Replace `RankingFilterButton` team selection with `TeamFilter`; retain existing season selection behavior and `PositionFilter`. Render `rows.slice(0, 3)` for migrated groups.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v2211-records.test.cjs tests/v2211-ranking-position-filter.test.cjs`

Expected: PASS.

### Task 2: Add the shared dedicated Records leaderboard route and shell

**Files:**
- Create: `src/screens/RecordsLeaderboardScreen.tsx`
- Modify: `src/types.ts`, `src/lib/navigation.ts`, `src/App.tsx`, `src/screens/RecordsScreen.tsx`
- Test: `tests/v31-records-leaderboards.test.cjs`, `tests/v2211-navigation.test.cjs`

**Interfaces:** Adds `View { name: 'records-leaderboard'; category; leaderboardId }` and entry state containing the carried Records scope. `RecordsLeaderboardScreen` consumes the Task 1 adapter and root `onNavigate`/`onBack`.

- [ ] **Step 1: Write failing route and Back tests**

Assert View All pushes `records-leaderboard`, adds no rows to Records, and a pop restores a Records entry with non-default category, season/team/competition/position filters, and saved scroll.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v2211-navigation.test.cjs`

Expected: FAIL because the view and entry state do not exist.

- [ ] **Step 3: Implement root-owned view/state wiring**

Add the view/default state and App dispatch. On View All pass the current Records scope; do not use local storage or local navigation memory. Delete `expandedLeaderboardId` only after all ranking previews use route pushes and no non-ranking consumer references it.

- [ ] **Step 4: Implement shell renderers and Phase 2 actions**

Use `RankingRow` for player rows; implement team and combination sibling-action rows. Render every eligible row with no cap. Hide position/team controls when `applicableFilters` says they do not apply.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v2211-navigation.test.cjs tests/v241-entity-navigation.test.cjs`

Expected: PASS for all variants, valid actions, passive unresolved targets, no nested buttons, and restored scroll/state.

### Task 3: Remove obsolete inline ranking expansion and audit Records consumers

**Files:**
- Modify: `src/screens/RecordsScreen.tsx`, `src/types.ts`, `src/lib/navigation.ts`
- Modify: superseded Records assertions only
- Test: `tests/v31-records-leaderboards.test.cjs`, existing Records tests

**Interfaces:** Consumes Task 2 route push. Produces Records state without ranking-specific inline expansion.

- [ ] **Step 1: Write failing no-inline-expansion tests**

Assert no `expandedLeaderboardId`, no ranking-specific floating scroll target, Records previews remain Top 3 after View All, and non-ranking History/Insights/Integrity state remains reachable.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v2211-records.test.cjs`

Expected: FAIL until obsolete state and render paths are removed.

- [ ] **Step 3: Remove migrated expansion state only**

Delete controlled/local leaderboard expansion and dead scroll handling. Preserve legitimate non-ranking expansion controls and all existing read models.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v2211-records.test.cjs tests/v228-scroll-records.test.cjs`

Expected: PASS.

### Task 4: Build canonical cached Latest Changes projection

**Files:**
- Create: `src/engine/latestChanges.ts`
- Modify: only existing event-domain exports if a typed adapter is required
- Test: `tests/v31-latest-changes.test.cjs`, `tests/news.test.cjs`, `tests/v2211-match-changes.test.cjs`

**Interfaces:** Produces `deriveLatestChanges(players, teams, matches, states, season?): LatestChangeGroup[]`. Each group has stable `id`, `matchId?`, `date`, ordered `items`, optional resolved `playerIds`/`teamIds`, and summary fields. It consumes `deriveFootballEvents` and canonical chronology; never persists output.

- [ ] **Step 1: Write failing projection tests**

Use chronological fixtures to assert newest-first ordering; #1 takeover, Top 3 entry, strict record, existing milestone/streak, advancement/elimination/champion inclusion; routine contribution and unchanged/minor rank suppression; stable same-match grouping; no persistence writes.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v31-latest-changes.test.cjs`

Expected: FAIL because the projection is absent.

- [ ] **Step 3: Implement selection, grouping, ordering, and cache**

Filter existing event categories by their canonical IDs/payloads and importance rather than deriving football state again. Group eligible same-match items with stable IDs and within-match category/importance/ID ordering. Cache by source identities, states, season, and rating revision.

- [ ] **Step 4: Add invalidation tests and verify GREEN**

Assert edit replacement changes affected groups, deletion removes them, and chronology/date changes reorder them deterministically. Run: `node --test tests/v31-latest-changes.test.cjs tests/news.test.cjs tests/v231-match-changes.test.cjs`

Expected: PASS.

### Task 5: Replace Home News and add uncapped Latest Changes screen

**Files:**
- Create: `src/screens/LatestChangesScreen.tsx`
- Modify: `src/screens/HomeScreen.tsx`, `src/types.ts`, `src/lib/navigation.ts`, `src/App.tsx`, `src/screens/SeasonHighlightScreen.tsx` only if the News route has no remaining consumer
- Test: `tests/v31-latest-changes.test.cjs`, existing Home/navigation/News UI tests

**Interfaces:** Adds `View { name: 'latest-changes'; season?: string }`; both Home and full screen consume Task 4’s exact projection.

- [ ] **Step 1: Write failing Home/full-screen parity tests**

Assert Home title is `Latest Changes`, exactly four groups render when available, Home IDs equal `deriveLatestChanges(...).slice(0, 4)`, View All is uncapped and newest-first, and Back restores Home scroll/state.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/v31-latest-changes.test.cjs tests/v2211-news-ui.test.cjs`

Expected: FAIL because Home still renders News.

- [ ] **Step 3: Implement only presentation and route wiring**

Replace Home’s News block; preserve Recent Matches and Global Ranking. Build full rows with shared entity actions and a sibling Match action. Keep the underlying News domain and only retire obsolete Home-specific News routing after consumer search proves it unused.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/v31-latest-changes.test.cjs tests/v2211-navigation.test.cjs tests/v241-entity-navigation.test.cjs tests/v2211-news-surfaces.test.cjs`

Expected: PASS.

### Task 6: Phase 3 regression and protected-boundary verification

**Files:**
- Modify only expectations superseded by approved Phase 3 behavior.
- Test: all focused Phase 3 tests and complete suite.

- [ ] **Step 1: Run focused Phase 3 suites**

Run: `node --test tests/v31-records-leaderboards.test.cjs tests/v31-latest-changes.test.cjs`

Expected: PASS.

- [ ] **Step 2: Run full verification**

Run in order: `npm.cmd test`; `npm.cmd run lint`; `npm.cmd run build`; `git diff --check`; `git status --short`; `git diff --stat`; `git diff --no-ext-diff`.

Expected: full suite green, lint exit 0, production build succeeds, whitespace check clean, and diff limited to Phase 3/spec/plan/test work.

- [ ] **Step 3: Audit protections**

Compare Phase 1 SOT/rating/import/draft/persistence paths and Phase 2 catalog/detail/Home/entity action paths with `cecf169`; verify no behavior change. Confirm version `2.4.1`, revision `11`, no derived persistence, and no commit/push.
