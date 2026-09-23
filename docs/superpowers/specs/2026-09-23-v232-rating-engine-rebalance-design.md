# v2.3.2 Rating Engine Rebalance and Derived-Data Closure Design

## Goal

Ship v2.3.2 by changing only the approved midfield `POSITION_RULES` values and moving the canonical rating semantic revision from 9 to 10. Every current and historical rating-derived value must then be read-time derived from the existing canonical rating path, without raw-history migration, persisted derived state, a new rating read model, or screen-local rating formulas.

## Baseline and non-negotiable invariants

- The current source of truth is the checked-out worktree at release `2.3.1` and `RATING_ENGINE_REVISION = 9`.
- `src/engine/ratingRevision.ts` remains the sole rating-revision authority and changes to `10`. No consumer may hardcode `10` as a cache or behavior key.
- Package metadata, lockfile metadata, and `src/config.ts` change to `2.3.2`. `STORAGE_KEY` remains exactly `football-tracker-v1`.
- The only coefficient changes are LM/RM `teamGoal .06`, `suppressionMax .25`; CM/LCM/RCM `teamGoal .08`, `suppressionMax .30`; CDM/LDM/RDM `teamGoal .06`, `suppressionMax .80`.
- Goal/assist/conceded/result coefficients, SOT proxy and multiplier curve, chronology, credited minutes, position segments, competition identity, threshold values, MOM/ranking ties, Best XI formation/position rules, and all milestone identities and thresholds remain unchanged.
- `Player.rating`, historical snapshots, and any persisted legacy rating are diagnostic/compatibility-only. They are never authoritative for a current value. Raw matches/events/history are not migrated or mutated.
- Retain v2.3.1's memory-only cache policy, one-pass MatchChangeIndex, lazy What Changed panel, News/Match Changes separation, and DEV performance measurements. Do not commit or push.

## Canonical rating source and historical behavior

`ratePlayerMatch(match, player, revision = RATING_ENGINE_REVISION)` in `src/engine/rating.ts` remains the only match-rating calculation. It reads an immutable match timeline, applies `POSITION_RULES`, creates `RatingBreakdown`, clamps it, and caches by normalized timeline plus the imported revision. `rateMatch()` is the match-wide projection; `getMatchManOfTheMatch()` consumes those exact `raw` values and existing tie-breakers.

Revision 10 therefore invalidates the rating cache and all revision-keyed derived caches on their next read. Historical matches need no rewrite: the default revision import means the next read of the original raw match routes through revision-10 coefficients. `tracePlayerMatchRating()` remains diagnostic evidence that a persisted `player.rating` is not used.

## Approved table

| Positions | teamGoal v9 -> v10 | suppressionMax v9 -> v10 |
| --- | ---: | ---: |
| LM, RM | .05 -> .06 | .15 -> .25 |
| CM, LCM, RCM | .07 -> .08 | .25 -> .30 |
| CDM, LDM, RDM | .06 -> .06 | .50 -> .80 |

All other entries in `POSITION_RULES` are byte-for-byte semantic baselines. The existing SOT curve remains 0=`1`, 1=`.86`, 2=`.73`, 3=`.62`, 4=`.53`, 5=`.45`, 6=`.38`, 7=`.32`, 8=`.27`, 9=`.23`, 10+=`.20`. Team-goal eligibility continues to exclude a goal's scorer and assister.

## Dependency-closure inventory

The audit follows exports and imports, then repeats at every derived output. These are semantic paths, not a screen-name-only list.

### Direct rating consumers

```text
raw Match/Event + Player
  -> normalizeMatchTimeline / ratePlayerMatch
  -> rateMatch -> MatchDetailScreen derived.ratings / sortedRatings / display
  -> getMatchManOfTheMatch
  -> stats.aggregatePlayerStats / buildGlobalRankingData / unifiedBestEleven
  -> playerDerived.derivePlayerScope
  -> seasonAnalytics.buildPlayerSnapshots
  -> playerRecords.buildFacts
  -> seasonInsights.playerStreaks / playerForm / startingXIs
  -> competition.teamAverageRating
  -> analytics position/role/combination metrics, substituteImpact, matchStory
  -> news.deriveNewsUncached
  -> matchChangeIndex.uncached
```

- `MatchDetailScreen` calls `rateMatch` once for match ratings and calls canonical MOM; match slots only display those rows.
- `derivePlayerScope` supplies Player Detail's season/competition/career average, recent form, match list/chart source, good-match count and rate, role averages, and personal highest rating. `PlayerDetailScreen` reads it rather than `player.rating`.
- `buildGlobalRankingData` supplies Global, League, Cup, Champions, Team, Home, Comparison, Player Detail and Team Detail ranking rows. Its rating average, good-match count, ratings array, MOM count and ranking tie path are assembled from canonical ratings/MOM.
- `playerStreaks` applies `GOOD_RATING_THRESHOLD` (`7.2`) to canonical rating values in canonical chronology. Its `goodRating` result is consumed by Player Detail, Comparison, season insights, and Records facts.
- `playerRecords.buildFacts` uses canonical raw values for `7.2+`, `8.0+`, `9.0+`, `10.0`, highest-rating and longest-good-streak records. Thus 8.0 consumers do exist: counts and the `eight` Records leaderboard. No separate 8.0 streak consumer exists and none will be introduced.
- `seasonAnalytics.buildPlayerSnapshots` derives rating average, 7.2+ count, MOM, ranking snapshots, monthly Player of the Month and monthly Best XI from canonical rating/MOM results.

### Second-order consumers

```text
ratePlayerMatch -> getMatchManOfTheMatch
  -> stats aggregate / ranking `mom`
  -> playerDerived.mom, playerRecords.mom, seasonAnalytics snapshots
  -> awards / history read models / Records History
  -> news stories and MatchChangeIndex MOM milestones / #1 takeovers

ratePlayerMatch -> buildGlobalRankingData / playerDerived / playerStreaks
  -> rankGlobalRankingRows and scopedMetricRanks
  -> unifiedBestEleven / teamBestEleven
  -> awardsForCompetition / seasonAwards / monthlyAwardForBlock
  -> historyTimelineForSeason / historyAwardsForSeason / historyMonthlyAward
  -> Player Detail, Team Detail, Global Ranking, Competition, Home, Records screens
```

- `rankGlobalRankingRows` preserves rating and MOM ordering/tie-breaks; all Global/League/Cup/Champions/Team Rating Rankings, Team Detail Best Players, and Player Detail rank positions consume it.
- `unifiedBestEleven`, `teamBestEleven`, and `buildAwardBestXI` consume canonical averages while preserving existing 4-3-3 and historical position-family selection. They drive Best XI, Team of the Week/current-recent selection, Team of the Year/season selection, competition and team variants.
- `awardsForCompetition`, `seasonAwards`, and `monthlyAwardForBlock` consume the same ranking/snapshot rows for monthly/block, season, league, cup, champions MVP and Best XI outcomes.
- `historyReadModels` caches and exposes prior-season rating leader, MOM leader, Best XI, competition awards, and finalized monthly awards for Records History.
- `news.deriveNewsUncached` uses canonical ratings/MOM directly for high-rating stories and through awards/history/rankings for award and record stories. It remains a separate full-history projection.
- `matchChangeIndex.uncached` uses canonical raw rating/MOM for strict rating personal bests, rare high-rating events, rating/MOM accumulation, and global/competition #1 takeover comparisons; `matchChangesForMatch` is only its lazy presentation wrapper.

### Third-order and terminal consumers

```text
ranking / Best XI / awards / records / milestones
  -> historyReadModels -> RecordsHistory and RecordsScreen
  -> deriveNews -> Home milestone feed and Player Detail milestone list
  -> matchChangeIndex -> matchChangesForMatch -> lazy MatchDetail What Changed panel
  -> seasonInsights -> SeasonRecap / SeasonHighlight / Competition presentation
```

- Rating-related milestones are not duplicated: News owns its existing milestone catalog and MatchChangeIndex owns its documented strict personal-best/MOM/ranking occurrence projection. Threshold/identity/dedup remain unchanged.
- Strict personal best is still `value > previous maximum`; equal values never emit a new event. Revision 10 may naturally change whether this comparison succeeds because both values are recomputed through the same engine.
- `RecordsScreen` and `RecordsHistory` consume history read models, award helpers, ranking rows, and Best XI selectors; no persisted rating snapshot is authoritative.
- `PlayerDetailScreen` consumes Player Derived, ranking rows, `playerStreaks`, `playerPersonalRecords`, and News milestones, so rating/form/average/highest-rating/streak/MOM/rank/milestone values share the closure.

The final implementation audit must repeat repository-wide searches for rating, avg/average rating, raw, thresholds, streak/form, MOM, Best XI, award, record, milestone, News, Match Changes, cache/memo and legacy/persisted terms; inspect each new import/reference until no unlisted consumer remains.

## Threshold, streak, consistency, and 8.0 policy

`GOOD_RATING_THRESHOLD` remains `7.2`. `isGoodRating`, `derivePlayerScope.goodMatches/goodMatchRate`, `aggregatePlayerStats.goodMatches`, `buildGlobalRankingData.goodMatches`, `playerStreaks.goodRating`, `playerRecords.goodRatings/goodStreak`, and `seasonAnalytics.goodMatches` all receive revision-10 `raw` values.

There is no separately named `Rating Consistency` model in the current source; the existing equivalent is the 7.2+ rate (`goodMatchRate`) in Player Derived plus the canonical good-match counts/facts. The release must preserve its denominator/eligibility semantics and demonstrate that its result changes only as the recomputed 7.2 classification changes. Do not invent a new consistency threshold or UI.

8.0 consumers exist only as canonical record counts/leaderboard facts (`eightRatings`, `eight`) and should be covered by a boundary test. There is no 8.0 streak implementation to alter or add.

## Cache and memoization audit

| Cache / memo boundary | Revision protection and invalidation |
| --- | --- |
| `rating.ts` `ratingCache` | Entry stores `revision`; `ratePlayerMatch` replaces it when imported revision differs. Timeline identity keeps raw inputs immutable. |
| `timeline` normalization | Receives the imported revision and is upstream of rating; no persisted result. |
| `stats.ts` global ranking cache | Filter key begins with `RATING_ENGINE_REVISION`; match/player collection identities create a new branch after history changes. |
| `playerDerived.ts` | Scope key prefixes revision; match/player identity branches handle edits/deletes. |
| `playerRecords.ts` | Scope key prefixes revision; match/player identity branches handle history changes. |
| `seasonAnalytics.ts` | Season key prefixes revision and lives beneath match/player/team identities. Its snapshots drive monthly awards/ToW/ToY paths. |
| `historyReadModels.ts` | Timeline, award, and monthly keys prefix revision; identities include matches, players, teams and states as appropriate. |
| `news.ts` | Cache entry stores revision under match/player/team/state WeakMap identities. |
| `matchChangeIndex.ts` | Cache entry stores revision under match/player/team/state identities; v10 causes an indexed one-pass rebuild, not prefix ranking reconstruction. |
| React `useMemo` | Screen memos depend on store collection identities/filter inputs and call revision-aware engines; they do not retain a persisted v9 rating. |

Implementation must verify the table rather than add broad cache clearing. It must retain collection-identity invalidation for historical edit/delete/date/order changes and avoid new persisted derived caches.

## Test design

Use deterministic raw-match fixtures and direct engine/read-model calls, not UI snapshots alone. Add release alignment and position-table tests; SOT 0/3 and team-goal tests; a historical fixture proving unchanged raw match data yields a v10 result; a threshold-crossing fixture; chronology fixtures for current/longest good-rating streak; an 8.0 record fixture; and propagation fixtures that intentionally flip canonical outcomes for MOM, rating/MOM rankings, Best XI, monthly/season/competition awards, Records, News, and Match Changes. Cache tests must mutate only the exported revision test seam or create distinct identities as existing tests do, then assert v10 recomputation and retained one-pass/lazy structural boundaries.

## Verification and final audit

Run `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`. Then inspect `git status --short`, `git diff --stat`, and the complete `git diff`. Report the direct, second-order and third-order inventories; canonical paths; 7.2/8.0/streak/consistency status; cache evidence; performance-boundary evidence; exact test counts; and confirm no blocker, commit, push, storage migration, raw-data mutation, or unrelated UI change.
