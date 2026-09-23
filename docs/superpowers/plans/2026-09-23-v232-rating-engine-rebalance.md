# v2.3.2 Rating Engine Rebalance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` to execute this plan task-by-task.

**Goal:** Apply the approved revision-10 midfield rating rebalance and verify that every existing rating-derived consumer recomputes from raw match data.

**Architecture:** `ratePlayerMatch` remains the sole rating formula. Existing aggregators and selectors consume its `RatingBreakdown`; no new rating read model, screen-local formula, migration, or persisted derived cache is introduced.

**Tech Stack:** TypeScript, React 19, Vite, Node test runner, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-23-v232-rating-engine-rebalance-design.md`

## Global constraints

- Release version is `2.3.2`; `src/engine/ratingRevision.ts` alone exports `RATING_ENGINE_REVISION = 10`; storage remains `football-tracker-v1`.
- Change only LM/RM to `.06/.25`, CM/LCM/RCM to `.08/.30`, CDM/LDM/RDM to `.06/.80`, ordered as `teamGoal/suppressionMax`.
- Preserve all other coefficients, SOT curve/proxy, goal eligibility, thresholds, chronology, tie-breaks, formation rules, milestone/streak semantics and performance architecture.
- Current and historical values must derive from raw Match/Event data. `player.rating` and snapshots are non-authoritative; raw history is neither migrated nor mutated.
- Do not reset, stash, discard changes, commit, or push. Begin each behavior change with a focused test.

## Review focus

- A legacy stored player rating must not affect a revision-10 match value or Player Detail summary.
- A history identity replacement must rebuild each affected memory cache without broad cache clearing.
- A raw-rating tie must retain the MOM and ranking tie-break order.
- Match Detail must remain lazy for Match Changes and separate from News.
- Best XI/award tests must change candidate input only, not formation, position-family, or eligibility rules.

## Task 1: Release metadata and canonical rating-table change

**Files:** Modify `package.json`, `package-lock.json`, `src/config.ts`, `src/engine/ratingRevision.ts`, `src/engine/rating.ts`, and `tests/v221-release.test.cjs`; create `tests/v232-rating-rebalance.test.cjs`.

**Produces:** Existing `ratePlayerMatch(match, player, revision?)`, `sotMultiplier(sot)`, and `POSITION_RULES` interfaces, with imported revision `10`.

- [ ] Write failing assertions that `APP_VERSION` and package version equal `2.3.2`, the imported revision equals `10`, and this exact map holds: LM/RM `[.06,.25]`; CM/LCM/RCM `[.08,.30]`; CDM/LDM/RDM `[.06,.80]`.
- [ ] In the same fixture, assert unchanged sentinels `ST.goal === .9`, `CB.suppressionMax === 1.3`, `GK.assist === 1`; assert SOT multipliers `0=1`, `3=.62`, `10=.20`; and use 90-minute LM/CM/CDM fixtures to assert suppression at SOT 0 and `max * .62` at SOT 3.
- [ ] Run `node --test tests/v232-rating-rebalance.test.cjs`; expect it to fail on v2.3.1/revision-9 data before implementation.
- [ ] Set only `RATING_ENGINE_REVISION = 10`, release metadata to `2.3.2`, and the nine table groups to the approved values. Leave all other table lines and the storage key intact.
- [ ] Add team-goal tests for LM `.06`, CM `.08`, CDM `.06`: an on-pitch non-scorer/non-assister receives the value, while scorer and assister receive zero for the same goal.
- [ ] Run `node --test tests/v232-rating-rebalance.test.cjs tests/v221-release.test.cjs tests/rating-correctness.test.cjs`; expect PASS.

## Task 2: Historical recomputation, threshold, consistency-equivalent and streak paths

**Files:** Modify `tests/rating-correctness.test.cjs`; create `tests/v232-derived-propagation.test.cjs`; inspect `rating.ts`, `playerDerived.ts`, `stats.ts`, `seasonInsights.ts`, `playerRecords.ts`, and `PlayerDetailScreen.tsx`.

**Consumes:** `ratePlayerMatch`, `derivePlayerScope`, `aggregatePlayerStats`, `buildGlobalRankingData`, `playerStreaks`, and `buildPlayerRecordLeaderboards`. **Produces:** regression tests only.

- [ ] Write a raw historical LM fixture whose v9 value is below 7.2 and v10 value is at least 7.2. Serialize it before rating, rate it with a player containing `rating: 1`, then assert raw JSON is unchanged and the canonical result is at least `GOOD_RATING_THRESHOLD`.
- [ ] Assert `derivePlayerScope` returns that exact rating object in `appearances`, one good match, and a 100% `goodMatchRate`. Run `node --test tests/v232-derived-propagation.test.cjs` before Task 1 and expect the threshold assertion to fail.
- [ ] For a multi-match fixture, assert `derivePlayerScope.averageRating`, `aggregatePlayerStats.avgRating`, and `buildGlobalRankingData(..., 'rating')[0].avgRating` equal the same canonical average; also assert good-match counts agree. Render the existing Player Detail fixture and assert displayed match/average values do not equal the stored player field.
- [ ] Use chronological ratings `[7.2, 7.2, 7.2]` to assert good-rating current/best streak `[3,3]`; use `[7.2, 7.1, 7.2]` to assert `[1,1]`. Use `[8.0, 7.9]` to assert the existing `eight` Records group count is one. Do not add an 8.0 streak because no such consumer exists.
- [ ] Treat existing `PlayerDerived.goodMatchRate` as the 7.2+ consistency-equivalent, preserving its numerator, denominator and no-app behavior. Run `node --test tests/v232-derived-propagation.test.cjs tests/rating-correctness.test.cjs tests/position-timeline.test.cjs tests/presentation-ux.test.cjs`; expect PASS.

## Task 3: MOM, rankings, Best XI, ToW/ToY, awards and Records propagation

**Files:** Create `tests/v232-ranking-awards-propagation.test.cjs`; inspect `rating.ts`, `stats.ts`, `seasonAnalytics.ts`, `seasonInsights.ts`, `awards.ts`, `historyReadModels.ts`, and `playerRecords.ts`.

**Consumes:** `getMatchManOfTheMatch`, `buildGlobalRankingData`, `rankGlobalRankingRows`, `unifiedBestEleven`, `monthlyAwardForBlock`, `awardsForCompetition`, `seasonAwards`, `historyTimelineForSeason`, and record builders. **Produces:** regression tests only.

- [ ] Write a near-rating LM/ST fixture that has a v10 MOM winner different from its v9 winner. Assert `getMatchManOfTheMatch` returns the v10 player, the `'mom'` row in `buildGlobalRankingData` has count one for that player, and the `mom` Records group is led by that player.
- [ ] Include an unchanged exact-tie fixture that asserts the established MOM ordering: raw rating, position priority, goals, assists, minutes, final deterministic selection. Run `node --test tests/v232-ranking-awards-propagation.test.cjs` before Task 1 and expect the v10 winner assertion to fail.
- [ ] With real league/cup/champions match types, assert each rating leaderboard's `rankGlobalRankingRows(buildGlobalRankingData(..., 'rating'), ...)` leader matches its fixture expectation. Also assert a team-filtered rating leaderboard and a MOM leaderboard; retain existing comparator tie assertions.
- [ ] Use an eligible 4-3-3 fixture to assert: `unifiedBestEleven` selects the v10 candidate in its family, the current/recent Best XI path covers Team of the Week, the season selector covers Team of the Year, and unchanged formation/position-family semantics remain.
- [ ] Assert `monthlyAwardForBlock(...).bestPlayerId`, `awardsForCompetition('league', ...).mvp`, `seasonAwards(...).ballon`, `historyTimelineForSeason(...).rating`, highest-rating Records, good-streak Records, and MOM Records all receive the expected v10-derived winner/value. This covers monthly/block/season/competition awards and Records History.
- [ ] Run `node --test tests/v232-ranking-awards-propagation.test.cjs tests/global-rankings.test.cjs tests/mom-tiebreak.test.cjs tests/mom-aggregation-fix.test.cjs`; expect PASS with no selector or tie-rule production changes.

## Task 4: News, milestones, strict personal-best and Match Changes propagation

**Files:** Create `tests/v232-events-cache.test.cjs`; inspect `news.ts`, `matchChangeIndex.ts`, `matchChanges.ts`, and `MatchDetailScreen.tsx`.

**Consumes:** `deriveNews`, `buildMatchChangeIndex`, `lookupMatchChanges`, and existing Match Changes presentation. **Produces:** regression tests only.

- [ ] Write a chronological fixture whose v10 raw rating strictly exceeds the player's prior raw maximum. Assert its `buildMatchChangeIndex(...).get(matchId)` items include the existing rating personal-best label, and `deriveNews` includes the expected existing rating-related item for the same match.
- [ ] Write an equal-v10-rating fixture and assert it emits no rating personal-best item, preserving strict `>` semantics. Create an existing-threshold MOM/ranking fixture and assert the index emits an existing MOM milestone if crossed and an existing `TAKES #1` Rating or MOM event after canonical `compareCoreLeaderboardRows` ordering changes.
- [ ] Run `node --test tests/v232-events-cache.test.cjs` before Task 1 and expect a v10 event assertion to fail.
- [ ] Add source-structure tests that `matchChangeIndex.ts` neither imports News nor calls `buildGlobalRankingData`, does reference `compareCoreLeaderboardRows`, and Match Detail invokes/presents Match Changes only through its opened details panel. Preserve the one-pass loop and DEV cold/cached measurement labels.
- [ ] Add a News check covering a rating/MOM-derived item and a Player Detail milestone source check through `deriveNews`; retain all existing milestone IDs, thresholds, deduplication and occurrence rules.
- [ ] Run `node --test tests/v232-events-cache.test.cjs tests/v231-match-changes.test.cjs tests/news.test.cjs tests/milestone-news.test.cjs tests/milestone-expansion.test.cjs`; expect PASS with News/Match Changes still separate.

## Task 5: Cache audit, dependency closure and release verification

**Files:** Create/extend `tests/v232-events-cache.test.cjs`; modify only release assertions that explicitly expect v2.3.1/revision 9; inspect all `src/engine`, `src/screens`, `src/components`, and `tests` rating references.

**Consumes:** Existing cache behavior in `rating.ts`, `timeline.ts`, `stats.ts`, `playerDerived.ts`, `playerRecords.ts`, `seasonAnalytics.ts`, `historyReadModels.ts`, `news.ts`, `matchChangeIndex.ts`, and React `useMemo` callers. **Produces:** audit/test evidence only.

- [ ] Add a cache test that calls `ratePlayerMatch(match, player)` then `ratePlayerMatch(match, player, RATING_ENGINE_REVISION + 1)` and asserts different cached objects, followed by a same-revision call that returns the second object. This proves the canonical rating cache distinguishes revisions.
- [ ] Replace a match array with a new identity containing an event edit/date/order change, then assert distinct/recomputed outputs from `buildGlobalRankingData`, `deriveNews`, `derivePlayerScope`/Records, history read models, and `buildMatchChangeIndex`. Never mutate an existing raw match in place or clear every cache.
- [ ] Audit each named cache: rating timeline entry revision; stats filter key; Player Derived scope key; Records scope key; Season Analytics key; History Timeline/Award/Monthly keys; News entry revision; MatchChangeIndex entry revision; Best XI through ranking/analytics keys; React `useMemo` collection/filter dependencies. If a focused failure proves a missing key, prefix only that cache key with imported `RATING_ENGINE_REVISION`; do not add persistence or a global purge.
- [ ] Run repository-wide closure search: `rg -n --glob '!node_modules/**' 'ratePlayerMatch|rateMatch|RatingBreakdown|raw|rating|avgRating|averageRating|RATING_ENGINE_REVISION|7\.2|8\.0|streak|MOM|Best XI|award|record|milestone|News|Match Changes|WeakMap|Map|cache|memo|useMemo|player\.rating|legacy rating' src tests`. For each previously unlisted output, trace imports/consumers to a terminal UI/cache/persistence boundary; add it to the final report and add a test if it uses a rating-derived output.
- [ ] Confirm no current screen treats `player.rating` as authoritative, no duplicate `POSITION_RULES` or old formula exists, no raw data changed, and MatchChangeIndex still avoids prefix ranking rebuilds while News remains independent.
- [ ] Run the full gate in order: `npm.cmd test`; `npm.cmd run lint`; `npm.cmd run build`; `git diff --check`; `git status --short`; `git diff --stat`; `git diff`. Expect zero failures, zero lint errors/warnings, build success, a clean diff check, scoped changes only, no commit and no push.

## Regression coverage map

- Exact `POSITION_RULES`, SOT 0/SOT 3, team-goal behavior, version and revision: Task 1.
- Historical revision-10 recomputation, Player Detail/form/graph inputs, 7.2 count/rate/consistency-equivalent, current/longest streak, and actual 8.0 record: Task 2.
- MOM winner/count/ranking, avgRating rankings (Global/League/Cup/Champions/Team), Team Detail Best Players, Best XI/ToW/ToY, awards, Records and Records History: Task 3.
- Player Detail milestone input, strict personal-best events, MOM milestones, ranking #1 takeover, News and Match Changes: Task 4.
- Revision-aware rating/stats/player/records/awards/Best-XI/News/history/MatchChange cache invalidation and remaining transitive consumers: Task 5.

## Execution handoff

The user explicitly authorized documentation and planning only. Do not implement this plan until an explicit implementation request is received; at that time ask the user to select the execution method. No commit or push is permitted.
