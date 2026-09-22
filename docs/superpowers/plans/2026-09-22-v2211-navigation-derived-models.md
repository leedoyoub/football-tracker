# Football Tracker v2.2.11 Navigation and Derived Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native inline execution) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the approved v2.2.11 update with root-owned Back restoration, deterministic shared read models, separated major News and Match Changes, rating revision 9, and the requested records/standings/Best XI behavior.

**Architecture:** `App` owns a stack of typed `NavigationEntry` values containing the route, saved scrollTop, and ephemeral screen state. Domain modules expose canonical historical position, active/finalized awards, records, and grouped match-change projections; screens only select or render those models. Derived caches are identity- and revision-aware and never enter durable football storage.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node's built-in test runner (`tests/*.test.cjs`), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-22-v2211-navigation-derived-models-design.md`

## Global Constraints

- Preserve `STORAGE_KEY = football-tracker-v1`; never clear or migrate saved football history.
- Do not add Browser History API synchronization.
- Do not persist navigation state, ratings, awards, News, or Match Changes.
- Preserve 30 League matchdays, Champions same-row comparison, MOM tie-breaks, 90-minute credited-minutes cap, draft durability, Supabase/local recovery, and Recent Matches ordering.
- Version `package.json` and `src/config.ts` from `2.2.10` to `2.2.11`.
- Bump `RATING_ENGINE_REVISION` from 8 to 9 exactly once for the approved semantic table.
- Do not commit or push.
- All ranking filters must filter the eligible pool before ranking; all historical position classification must use the canonical timeline, not only `Player.position`.
- `scopedPositionFamilyByPlayer` returns normalized `PositionFamily` values, never arbitrary raw registration positions.
- The exact five #1 News metrics are Rating, Goals, Assists, G+A, and MOM.
- “View All” means all prepared rows; no user-facing 50-row cap remains.

## Review Focus

- A same-date historical edit must rebuild chronology and Match Changes deterministically; test in `tests/v2211-match-changes.test.cjs`.
- A player changing registration position after an old season must remain classified by old credited match positions; test in `tests/v2211-position-filters.test.cjs`.
- A partial new monthly block must show the active block without entering finalized history or News; test in `tests/v2211-monthly-awards.test.cjs`.
- A terminal editor save must replace the editor entry and leave no stale draft behind; test in `tests/v2211-navigation.test.cjs`.
- An eliminated Cup team must retain its frozen cumulative row while survivors reset to current-stage totals; test in `tests/v2211-cup-standings.test.cjs`.

## File Map and Shared Interfaces

Create or modify only the following responsibilities:

- `src/types.ts`: `ScreenState`, `NavigationEntry`, `EventSurface`, derived-event and Match Change payload types, and any filter/state unions.
- `src/lib/navigation.ts`: pure `pushEntry`, `popEntry`, `replaceEntry`, `snapshotScroll`, and same-team Back decision helpers.
- `src/App.tsx`: root stack ownership, state update dispatch, restore-before-scroll effect, and push/pop/replace semantics.
- `src/engine/positionScope.ts`: `scopedPositionFamilyByPlayer(players, matches, scope)` returning the normalized `PositionFamily` contract and shared family mapping.
- `src/screens/RankingFilters.tsx` plus `src/components/PositionFilter.tsx`: immediate compact anchored position selection.
- `src/engine/seasonAnalytics.ts` and `src/engine/historyReadModels.ts`: `activeMonthlyAwards`, finalized-only historical reads, and revision-aware cache keys.
- `src/components/AwardBestXI.tsx` and `src/screens/RecordsHistory.tsx`: one always-expanded Best XI presentation.
- `src/engine/playerRecords.ts`: one canonical Player Records leaderboard model consumed by Records UI and Match Changes for occurrence, threshold, clean-sheet, save, and other individual leaderboards.
- `src/engine/news.ts` and new `src/engine/matchChanges.ts`: canonical event derivation, explicit surfaces, major-News projection, and cached grouped Match Changes.
- `src/engine/rating.ts`, `src/engine/ratingRevision.ts`, `src/config.ts`, `package.json`: approved rating table and version.
- `src/engine/competition.ts` and `src/screens/CompetitionScreen.tsx`: mixed Cup row semantics and copy.
- `src/screens/MatchDetailScreen.tsx`, `CompetitionScreen.tsx`, `GlobalRankingScreen.tsx`, `HomeScreen.tsx`, `RecordsScreen.tsx`, `TeamDetailScreen.tsx`, `PlayerDetailScreen.tsx`, and editor screens: consume controlled state and shared models.
- Tests are added as focused `tests/v2211-*.test.cjs` files and existing tests are updated only when their v8/v2.2.10 expectations intentionally change.

The key contracts are:

```ts
type NavigationEntry = { view: View; scrollTop: number; screenState: ScreenState }

type ScreenState =
  | { screen: 'match'; tab: 'facts' | 'lineup' | 'ratings' }
  | { screen: 'competition'; competitionType: CompetitionType; tab: 'players' | 'table' | 'form' | 'history'; playerMetric: RankingDisplayMetric; playerFilter: RankingFilters; bestXiMode: 'season' | 'monthly'; historyMatchday: number; comparedTeamIds: string[]; rankingViewAll: boolean; compareMode: boolean; selectedPlayerIds: string[] }
  | { screen: 'global-ranking'; metric: LeaderboardMetric; scope: CompetitionScope; position: PositionFilterKey; expandedLeaderboardId: string | null; compareMode: boolean; selectedPlayerIds: string[] }
  | { screen: 'records'; category: Category; competition: CompetitionType | 'all'; position: PositionFilterKey; expandedLeaderboardId: string | null; historySeason: string | null; historyBlock: number | null; historyPanel: 'timeline' | 'awards' }
  | { screen: 'team'; tab: 'overview' | 'matches' | 'players'; bestSeason: string; bestCompetition: CompetitionType | 'all'; matchesCompetition: CompetitionType | 'all'; expandedContext: string | null }
  | { screen: 'players'; filters: RankingFilters }
  | { screen: 'home'; metric: RankingDisplayMetric; position: PositionFilterKey }
  | { screen: 'default' }

type EventSurface = 'news' | 'match-change' | 'both'
type PositionFamily = 'ST' | 'SS' | 'LW' | 'RW' | 'CAM' | 'LM' | 'RM' | 'CM' | 'CDM' | 'FB' | 'CB' | 'GK'
```

### Mandatory execution sequence

The numbered sections describe ownership, but implementation must follow this dependency order: Task 3 historical-position groundwork first; Task 5 rating revision 9 and rating consumers second; Task 1 root navigation primitives; Task 2 controlled screen-state migration; Task 4 active/finalized monthly awards and Best XI; Task 6 Cup and canonical Player Records; Task 7 scroll behavior; Task 8 canonical News/Match Changes; Task 9 News and Match Detail UI; Task 10 cross-cutting cache/team-scope audit; Task 11 release verification. No rating-dependent award or Best XI read model is finalized before Task 5 passes.

### Task 1: Add pure navigation entry model and migrate App ownership

**Files:**
- Create: `src/lib/navigation.ts`
- Modify: `src/types.ts`, `src/App.tsx`
- Test: `tests/v2211-navigation.test.cjs`

**Interfaces:** `createNavigationEntry(view, screenState?)`, `snapshotScroll(entries, index, scrollTop)`, `popNavigationEntry(entries)`, `replaceNavigationEntry(entries, view, screenState?)`, and `sameTeamBackTarget(entries, teamId)` are pure helpers. `sameTeamBackTarget` returns `pop` only when the immediately previous entry is the same Team Detail; otherwise it returns `replace` with the Team Detail destination. Screens receive a `screenState` value and `onStateChange` callback.

- [ ] **Step 1: Write failing reducer/helper tests.** Cover push snapshots the prior scroll; pop returns the exact prior route/state/scroll; replace removes a terminal editor; same-team Match → Team Back pops instead of pushing; root tab navigation resets to one entry.
- [ ] **Step 1a: Extend the navigation regression cases.** Cover same-team Match → Team Back popping, a different prior route replacing the Match with Team, and exact restoration of every `ScreenState` field including expanded leaderboard identity.
- [ ] **Step 2: Run the focused test.** Run `npm.cmd test -- tests/v2211-navigation.test.cjs`; expect failures for the missing helpers/entry behavior.
- [ ] **Step 3: Implement the pure navigation helpers and typed unions.** Keep defaults in one `defaultScreenState(view)` function; do not create screen-specific module maps.
- [ ] **Step 4: Move `App` from `View[]` and `scrollPositions` to `NavigationEntry[]`.** Snapshot scroll before push, restore state before scroll in a layout/effect sequence, and keep persistent last-route data limited to the existing route shape.
- [ ] **Step 5: Run the focused tests and the existing navigation tests.** Expect all focused tests and `tests/last-route.test.cjs` to pass.
- [ ] **Step 6: Record the task result in the plan ledger.** No commit is made because the user explicitly prohibited commits.

### Task 2: Convert screen-local state to controlled entry state and fix navigation semantics

**Files:**
- Modify: `src/screens/MatchDetailScreen.tsx`, `CompetitionScreen.tsx`, `GlobalRankingScreen.tsx`, `RecordsScreen.tsx`, `RecordsHistory.tsx`, `TeamDetailScreen.tsx`, `HomeScreen.tsx`, `PlayersScreen.tsx`, `PlayerDetailScreen.tsx`, `ChemistryScreen.tsx`, `DataManagementScreen.tsx`, `NewMatchScreen.tsx`, `EditMatchScreen.tsx`, `NewPlayerScreen.tsx`, `EditPlayerScreen.tsx`
- Test: `tests/v2211-navigation.test.cjs`

**Interfaces:** Each migrated screen accepts `screenState` and `onStateChange`; genuine Back buttons call `onBack`; drill-down calls `onNavigate`; successful saves call `onReplace` or a terminal callback.

- [ ] **Step 1: Add failing source/render behavior tests.** Assert Match Detail Back calls pop, Chemistry/Data Management Back does not push Home, starting editor save replaces the editor, and Match → BACK TO TEAM uses the same-team helper.
- [ ] **Step 2: Run the focused tests and observe the current failures.** Run `npm.cmd test -- tests/v2211-navigation.test.cjs`.
- [ ] **Step 3: Replace local `useState` for required restoration fields with entry state.** Preserve unrelated transient dialog/input state locally. Remove `teamTabMemory` and equivalent route-memory maps.
- [ ] **Step 4: Thread callbacks through League, Global Ranking, Records, Team Detail, and Player Detail drills.** Ensure the entry state is updated before a player push so Back restores the exact tab/filter/view-all state.
- [ ] **Step 5: Implement editor push/pop/replace rules.** New Match save replaces `new-match` with `match`; Edit Match save replaces with `match`; cancel pops; New/Edit Player uses the existing draft durability and `dismissPlayerEdit` semantics without leaving stale editor entries.
- [ ] **Step 6: Run all navigation tests and `npm.cmd run build`.** Fix TypeScript mismatches before continuing.

### Task 3: Add historical position scope and compact immediate position filter

**Files:**
- Create: `src/engine/positionScope.ts`, `src/components/PositionFilter.tsx`
- Modify: `src/screens/RankingFilters.tsx`, `src/screens/RecordsScreen.tsx`, `src/screens/GlobalRankingScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/engine/stats.ts`
- Test: `tests/v2211-position-filters.test.cjs`

**Interfaces:** `type PositionFilterKey = 'all' | 'st-ss' | 'lw-rw' | 'cam' | 'lm-rm' | 'cm' | 'cdm' | 'fb' | 'cb' | 'gk'`; `type PositionFamily = 'ST' | 'SS' | 'LW' | 'RW' | 'CAM' | 'LM' | 'RM' | 'CM' | 'CDM' | 'FB' | 'CB' | 'GK'`; `positionFilterPositions(key)` returns normalized eligible positions; `scopedPositionFamilyByPlayer(players, matches, scope)` returns `Map<string, PositionFamily>`.

- [ ] **Step 1: Write failing domain tests.** Cover every approved family, filter-before-rank (#11 becomes #1 after excluding others), LAM/RAM→CAM, and a player whose current registration changed after historical matches.
- [ ] **Step 2: Run the focused test and confirm failure.** Run `npm.cmd test -- tests/v2211-position-filters.test.cjs`.
- [ ] **Step 3: Implement the timeline-minute accumulator.** Use `creditedPositionSegments`, normalize with `normalizePositionFamily`, sum minutes per player/family, and tie-break by minutes then family label. Exclude players with no scoped credited appearance.
- [ ] **Step 3a: Expose the same historical family map to awards.** Award selection must use credited historical position participation and historical team context for the relevant scope; it must not read current `player.position` or current `player.teamId` when rebuilding a finalized award.
- [ ] **Step 4: Implement the anchored compact selector.** It renders the selected pill and a small popover; selection applies immediately and has no Apply button or bottom sheet.
- [ ] **Step 5: Feed the eligible player pool into Records, Global Ranking, and Home before their ranking derivation.** Keep team-only Records unaffected.
- [ ] **Step 6: Run focused tests, `tests/global-rankings.test.cjs`, and `npm.cmd run build`.**

### Task 4: Separate active monthly awards from finalized history and share Best XI presentation

**Files:**
- Modify: `src/engine/seasonAnalytics.ts`, `src/engine/historyReadModels.ts`, `src/components/AwardBestXI.tsx`, `src/screens/CompetitionScreen.tsx`, `src/screens/RecordsHistory.tsx`, `src/screens/RecordsScreen.tsx`, `src/screens/PlayerDetailScreen.tsx`
- Test: `tests/v2211-monthly-awards.test.cjs`

**Interfaces:** `SeasonAnalytics.activeMonthlyAwards?: MonthlyAwards`; `historyMonthlyAward` remains finalized-only; `AwardBestXI` no longer accepts/uses `open` and always renders its Pitch.

- [ ] **Step 1: Write failing tests.** Cover MD1 active block 1, finalized block 1, first MD4 match immediately selecting block 2, empty block state, finalized map exclusion, and no News for an unfinished block. Render Records History and assert it uses `AwardBestXI` with player click callbacks. Also change a player's current team and registration position after a finalized block and assert the historical Best XI remains identical.
- [ ] **Step 2: Run the focused test and observe failure.** Run `npm.cmd test -- tests/v2211-monthly-awards.test.cjs`.
- [ ] **Step 3: Extend analytics.** Choose the block containing the highest recorded League matchday; return an in-progress canonical `monthlyAwardsFor` result only when that block has a match. Keep `monthlyAwards` and `monthlyAwardForBlock` finalized-only and add revision to cache keys. Ensure the award selector consumes the historical `PositionFamily` map rather than current registration fields.
- [ ] **Step 4: Make `AwardBestXI` always expanded.** Remove `<details>`, `open`, and summary state while preserving layout, stats, blue best-player, and Pitch click behavior.
- [ ] **Step 5: Render finalized Records History monthly blocks through the shared component.** Pass `onPlayerOpen` through `RecordsScreen` and maintain the selected season/block in `ScreenState`.
- [ ] **Step 6: Run monthly, award, and presentation tests; then build.**

### Task 5: Apply rating revision 9 and Match Detail lineup/rating behavior

**Files:**
- Modify: `src/engine/rating.ts`, `src/engine/ratingRevision.ts`, `src/config.ts`, `package.json`, `src/screens/MatchDetailScreen.tsx`, `src/components/Pitch.tsx`
- Test: `tests/v2211-rating.test.cjs`, `tests/v2211-match-detail.test.cjs`

**Interfaces:** Keep `rateMatch(match, players)` as the canonical single calculation; Match Detail derives `sortedRatings` from that result and uses `Pitch.onSlotClick` only for non-null slots.

- [ ] **Step 1: Write failing tests.** Assert exact raw 8.44 > 8.41 despite one-decimal display, deterministic raw ties, unused bench last, MOM marker unchanged, starting player click callback, and all exact v9 POSITION_RULES values.
- [ ] **Step 2: Run the focused tests and confirm v8/order/click failures.** Run `npm.cmd test -- tests/v2211-rating.test.cjs tests/v2211-match-detail.test.cjs`.
- [ ] **Step 3: Update only the approved rule table and revision.** Preserve normalization, on-pitch intervals, scorer/assister exclusions, stoppage events, MOM tie-break, and credited-minute cap.
- [ ] **Step 4: Sort Match Detail ratings by rated first, raw descending, player ID tie-break; place unrated bench at the end.** Reuse the existing `rateMatch` map; do not invoke a second rating calculation.
- [ ] **Step 5: Add `onSlotClick` to historical Starting XI Pitch and keep empty slots inert.** Fix Back to call the root pop callback.
- [ ] **Step 6: Run focused rating/match tests plus all existing rating tests; update only intentional v8 expectation tests to v9.**

### Task 6: Correct Cup stage rows and Records occurrence semantics

**Files:**
- Modify: `src/engine/competition.ts`, `src/screens/CompetitionScreen.tsx`, `src/screens/RecordsScreen.tsx`, `src/engine/playerRecords.ts`
- Test: `tests/v2211-cup-standings.test.cjs`, `tests/v2211-records.test.cjs`

**Interfaces:** `cupRows` returns active survivors with current-stage totals and eliminated teams with frozen cumulative-at-elimination totals. `buildPlayerRecordLeaderboards(players, matches, scope)` returns canonical leaderboard rows keyed by stable `PlayerRecordLeaderboardId`; player occurrence rows expose Matches Scored In, Braces (2+), and Hat-tricks (3+) alongside 7.2+, 8.0+, 9.0+, 10.0, Clean Sheets, Saves, and other approved individual records. Both Records UI and Match Changes consume this model.

- [ ] **Step 1: Write failing two-stage Cup tests and Records tests.** Include survivor reset, eliminated frozen 3-match 2W-1L row, zero-game GA/match exclusion, one/two/three-goal occurrence contributions, zero occurrence empty state, and a 51st View All row.
- [ ] **Step 2: Run focused tests and observe failures.** Run `npm.cmd test -- tests/v2211-cup-standings.test.cjs tests/v2211-records.test.cjs`.
- [ ] **Step 3: Track elimination snapshots while building Cup stages.** Use current-stage standings for living teams and snapshot cumulative totals at the exact elimination stage for eliminated teams; preserve canonical ordering and Champions logic.
- [ ] **Step 4: Update the canonical Player Records model and labels.** Put Matches Scored In before Braces and Hat-tricks; exclude zero occurrence rows; define every approved individual leaderboard once in `playerRecords.ts`; rename/place `Lowest Goals Conceded per Match` after clean sheets and exclude zero qualifying matches. RecordsScreen renders these prepared rows without duplicating the formulas.
- [ ] **Step 5: Remove relevant `slice(0, 50)` caps.** Keep preview slices, use prepared full arrays for expanded View All, and avoid per-row rating recomputation.
- [ ] **Step 6: Update Cup explanatory copy and run focused plus existing competition/records tests.**

### Task 7: Scope floating scroll-to-top to active View All sections

**Files:**
- Modify: `src/components/FloatingScrollToTop.tsx`, `src/components/scrollToTop.ts`, `src/screens/RecordsScreen.tsx`, `src/screens/GlobalRankingScreen.tsx`, `src/screens/CompetitionScreen.tsx`
- Test: `tests/v2211-scroll-view-all.test.cjs`

- [ ] **Step 1: Write failing tests.** Records button is absent until an expanded long leaderboard exists, hides immediately on category/filter/View All close, appears only after meaningful scroll, and scrolls the active section header.
- [ ] **Step 2: Run focused test and observe current always-on Records control.** Run `npm.cmd test -- tests/v2211-scroll-view-all.test.cjs`.
- [ ] **Step 3: Give the component an explicit `active` section ref/id and preserve the existing safe IntersectionObserver controller.**
- [ ] **Step 4: Render it only from active expanded sections.** Do not alter unrelated `<details>` or global app scrolling.
- [ ] **Step 5: Run focused and existing scroll tests.**

### Task 8: Build explicit News surfaces, milestones, and cached Match Changes

**Files:**
- Modify: `src/engine/news.ts`
- Create: `src/engine/matchChanges.ts`
- Modify: `src/types.ts`, `src/engine/awards.ts`, `src/engine/seasonAnalytics.ts`
- Test: `tests/v2211-match-changes.test.cjs`, `tests/v2211-news-surfaces.test.cjs`, `tests/v2211-milestones.test.cjs`

**Interfaces:** `deriveFootballEvents(players, teams, matches, states): DerivedFootballEvent[]`; `majorNewsEvents(..., season): NewsItem[]`; `matchChangesForMatch(..., matchId): GroupedMatchChange[]`. All return deterministic IDs and reuse one comparator that orders newest date, newest canonical match chronology, then stable event ID. Ranking identities include the five core metrics, canonical Player Records IDs, and canonical individual Team Player Ranking IDs; duplicate UI presentations of one identity emit one event.

- [ ] **Step 1: Write failing tests.** Cover first goal per season/competition, one occurrence for a four-goal hat-trick, thresholds 1/3/5/10/15, goalkeeper clean sheets every five, order-independent Link Goals, strict personal records, Top-10 entry/re-entry/upward movement/#1, no unchanged/downward/outside-Top-10 events, grouping, and historical edit rebuild.
- [ ] **Step 2: Run the focused tests and observe current News leakage/truncation.** Run `npm.cmd test -- tests/v2211-match-changes.test.cjs tests/v2211-news-surfaces.test.cjs tests/v2211-milestones.test.cjs`.
- [ ] **Step 3: Extract one canonical event derivation pass.** Use `oldestMatches`; compare before/after counters; retain existing valid News stories and finalized award News; assign explicit `surface` and `importance`. Major News is an explicit whitelist: large Goals/Assists/Appearances/MOM/Clean Sheets thresholds, finalized awards, major competition transitions, newly taken #1 in exactly Rating/Goals/Assists/G+A/MOM, and explicitly whitelisted rare performances. Do not pass every existing `rare` item through to Home News.
- [ ] **Step 4: Implement occurrence and personal-record rules.** Own goals excluded; pair key sorted; strict raw rating comparisons; use canonical GK appearance semantics.
- [ ] **Step 5: Implement core, Player Records, and Team Player Ranking transitions.** Track only Rating, Goals, Assists, G+A, MOM for core ranking events; consume the canonical Player Records model for records; include canonical individual Team Player Ranking where applicable; deduplicate by leaderboard identity; group all per-player rows by match; emit ranking changes only for players who participated in that match; never emit team standings, pair/duo, or decorative movements. Preserve outside Top 10 entry, re-entry, upward movement including +1, and taking #1; omit unchanged, downward, and outside-Top-10-only movement.
- [ ] **Step 6: Add the revision-aware identity cache.** Key by matches, players, teams, states, season scope, and `RATING_ENGINE_REVISION`; cache grouped match IDs; no persistent writes.
- [ ] **Step 7: Run all focused News/milestone tests and existing News tests.**

### Task 9: Wire Home News, View All News, and Match Detail What’s Changed

**Files:**
- Modify: `src/screens/HomeScreen.tsx`, `src/screens/SeasonHighlightScreen.tsx`, `src/screens/MatchDetailScreen.tsx`
- Test: `tests/v2211-news-ui.test.cjs`, `tests/v2211-match-detail.test.cjs`

- [ ] **Step 1: Write failing UI/source tests.** Home shows exactly the first four qualifying major News items; View All shows every qualifying selected-season item; ranking/personal routine changes never appear there; Match Detail renders all grouped meaningful changes without `.slice(0, 6)`.
- [ ] **Step 2: Run focused tests and observe failures.** Run `npm.cmd test -- tests/v2211-news-ui.test.cjs tests/v2211-match-detail.test.cjs`.
- [ ] **Step 3: Replace Home's broad `homeMilestoneNews` slice with `majorNewsEvents(..., season).slice(0, 4)`.** Keep canonical order and stable same-date tie-break.
- [ ] **Step 4: Make View All use the same projection with no arbitrary cap.** Keep the selected season scope and lightweight prepared rows.
- [ ] **Step 5: Consume `matchChangesForMatch` in the collapsible Match Detail panel.** Render compact grouped player rows and retain all meaningful rows.
- [ ] **Step 6: Run focused and existing News/presentation tests.**

### Task 10: Finish ranking scopes, team movement, editor routes, and performance invalidation

**Files:**
- Modify: `src/screens/CompetitionScreen.tsx`, `src/screens/GlobalRankingScreen.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/TeamDetailScreen.tsx`, `src/engine/seasonAnalytics.ts`, `src/engine/historyReadModels.ts`, `src/engine/stats.ts`, `src/lib/lastRoute.ts`
- Test: `tests/v2211-performance.test.cjs`, `tests/v2211-navigation.test.cjs`

- [ ] **Step 1: Write failing tests.** Team-scoped rankings do not show global movement arrows; position changes recalculate only the eligible scoped population; repeated Match Detail/analytics reads hit shared caches; edit/delete/date changes invalidate derived results.
- [ ] **Step 2: Run focused tests and observe current behavior.** Run `npm.cmd test -- tests/v2211-performance.test.cjs tests/v2211-navigation.test.cjs`.
- [ ] **Step 3: Suppress or calculate movement within the same team-scoped population.** Do not pass overall League snapshot movement into a team-filtered row.
- [ ] **Step 4: Add revision and collection identities to every extended read-model cache.** Ensure no mixed v8/v9 data is retained; preserve raw match object identity safety already used by existing caches.
- [ ] **Step 5: Audit terminal save/cancel transitions and persistent last-route serialization.** Persist only the compatible route destination; transient screen state remains in memory.
- [ ] **Step 6: Run focused performance/navigation tests and inspect no synchronous per-row full-ranking loops.**

### Task 11: Final release metadata and full verification

**Files:**
- Modify: `src/config.ts`, `package.json`, affected existing v8/v2.2.10 expectation tests
- Test: all `tests/*.test.cjs`

- [ ] **Step 1: Update version assertions to `2.2.11` and revision assertions to 9 where the semantic change is intentional.** Keep `football-tracker-v1` assertions unchanged.
- [ ] **Step 2: Run `npm.cmd test`.** Read the full summary and resolve every failure.
- [ ] **Step 3: Run `npm.cmd run lint`.** Introduce no new lint errors; distinguish any pre-existing warning explicitly.
- [ ] **Step 4: Run `npm.cmd run build`.** Read the TypeScript/Vite output and resolve all errors.
- [ ] **Step 5: Run `git diff --check`.** Resolve whitespace errors.
- [ ] **Step 6: Inspect `git status`, `git diff --stat`, and `git diff`.** Confirm no raw history migration, storage-key change, generated artifact, or accidental app-code edit outside the plan.
- [ ] **Step 7: Report root causes, files, architecture, visible behavior, version/revision, caching, tests, verification, risks, and final git status.** Do not commit or push.

## Dependency Order and Rollout

The mandatory execution sequence below supersedes the original task-number summary in this section.

Tasks 1–2 establish the navigation contract. Task 3 is independent domain groundwork but must land before ranking UI state migration. Task 4 can proceed after the new state contract and feeds both Competition and Records History. Task 5 must precede all rating-dependent derivation changes. Task 6 is independent of News but shares competition/records UI. Task 7 depends on expanded-state ownership from Tasks 1–3. Tasks 8–9 are strictly ordered because UI projections must consume the tested event model. Task 10 audits cross-cutting cache and team-scope behavior after all read models exist. Task 11 is the release gate.

### Mandatory execution sequence

Execute the tasks in this order: 3 (historical position and filter groundwork), 5 (rating revision 9 and rating consumers), 1 (navigation primitives), 2 (controlled screen state and Back semantics), 4 (active/finalized monthly awards and shared Best XI), 6 (Cup rows and canonical Player Records), 7 (View All scroll behavior), 8 (canonical News/Match Changes), 9 (surface UI), 10 (cache/team-scope audit), and 11 (release gate). This order ensures historical position semantics exist before awards and rating revision 9 exists before any rating-dependent monthly award or Best XI read model is finalized.

Task 3 is the shared classification source for ranking and awards. Task 5 invalidates all rating-dependent caches before Task 4 consumes them. Tasks 1–2 then make every state-bearing screen restore exact fields, including `expandedLeaderboardId`, before UI wiring. Tasks 8–9 are strictly ordered because UI projections consume the tested event model. Task 10 audits cross-cutting caches and team-scoped movement after all read models exist. Task 11 runs the complete validation set and inspects the final diff without committing.

## Self-Review Checklist

- Spec coverage: navigation, monthly awards, Best XI, News surfaces, Match Changes, milestones, rating v9, Cup rows, Records semantics, View All, floating scroll, position filters, historical positions, team movement, performance, versioning, persistence, and tests each have an owning task.
- Placeholder scan: no task relies on TBD/TODO or unspecified edge-case work; every step names files, commands, and expected behavior.
- Type consistency: `ScreenState`, `NavigationEntry`, `EventSurface`, `PositionFilterKey`, `PositionFamily`, `expandedLeaderboardId`, canonical Player Records IDs, and shared function names are defined before consumers.
- Review focus: same-date edit, historical position change, partial monthly block, terminal editor replacement, and eliminated Cup snapshots each have explicit tests in their owning tasks.
