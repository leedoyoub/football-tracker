# v2.3.1 Match Changes and Performance Design

## Goal

Make Match Detail fast without weakening persistence or changing football-domain semantics. Match Changes becomes an in-memory, source-of-truth read model rather than a UI filter; News remains an independent full-history product surface.

## Baseline and invariants

- Base: `main` at `c6fc8cb` with a clean worktree.
- Release version is `2.3.1` in package metadata, `src/config.ts`, and the existing app footer.
- `STORAGE_KEY` remains `football-tracker-v1`; `RATING_ENGINE_REVISION` remains `9`.
- No persisted derived cache, migration, data deletion, rating/competition/tie-break/chronology/navigation semantic change, commit, or push.

## Current-flow audit

`matchChangesForMatch()` currently calls `deriveFootballEvents()`, which calls the full News derivation. That derivation includes season analytics, awards, and competition history. Match Changes then separately runs `rankingChanges()`, which constructs before/after chronological prefixes for every match and rebuilds Global, competition, team, and record leaderboards for five metrics.

`MatchDetailScreen` calls this path in its immediate derived `useMemo`, alongside ratings, story, and lineup. The save flow already awaits `saveMatchDurably()` before clearing the draft or navigating, but `NewMatchScreen` adds a fixed 350 ms timeout after success. `LocalRepository.saveAppState()` validates, serializes, writes, checks exact read-back equality, then parses and validates that identical string again.

## Existing milestone inventory

The inventory below is the canonical pre-change behavior in `news.ts`; thresholds are retained exactly and are not duplicated by the new read model.

- Attacking milestones at season, each competition (League/Cup/Champions), and career scope: goals every 10; assists every 10; G+A every 20; balanced goals-and-assists at 10 then every 5.
- Season MOM every 10; career appearances every 100; career MOM every 50.
- Goalkeeper milestones: season clean sheets at 10 and 20; career clean sheets every 50; career saves at 100, 250, 500, 750, 1,000, then every 250 from 1,250.
- Team milestones: season goals at 50, 100, 150, then every 50 from 200; season clean sheets at 10 and 20.
- Streak milestones: individual five scoring appearances and five contributing appearances; team five/ten winning streak, ten/fifteen unbeaten run, and five consecutive clean sheets.
- Existing special performance rules: four or more goals, four or more G+A, hat-trick, three or more assists, goalkeeper five or more saves with a clean sheet, substitute two or more goals, defender two or more G+A with a clean sheet, and raw match rating at least 9.0.

## Personal-best audit and policy

There is no existing Match Changes personal-best projection. The current `deriveFootballEvents()` instead adds ordinary per-match contribution messages, including 1G, 1A, and 1G1A. v2.3.1 replaces those Match Changes-only ordinary messages with strict personal-best events: raw rating, goals, assists, and G+A must exceed that player's prior single-match maximum. Equal values do not qualify. No other personal-best category is introduced.

## MatchChangeIndex

`buildMatchChangeIndex(players, teams, matches, competitionStates)` will be a memory-only `Map<string, MatchChange[]>`. It traverses `oldestMatches(matches)` once and incrementally updates player, team, streak, personal-best, and ranking state. Historical create/edit/delete/date changes rebuild the index from the supplied arrays, so chronology is authoritative.

The index cache is keyed by the identities of `matches`, `players`, `teams`, and `competitionStates`, plus `RATING_ENGINE_REVISION`. It never serializes into AppState. A cache miss builds the complete map; a cached Match Detail lookup is only `index.get(matchId)`.

Milestone and rare/streak rule helpers are extracted from News so News and Match Changes use the same rules and thresholds without copying threshold lists. News continues to use its existing full derivation and continues to expose approved News-only ranking/record/team stories. Match Changes receives only the inventory above, strict personal bests, rare/special events, and ranking takeovers.

## #1 takeover semantics

For Rating, Goals, Assists, G+A, and MOM, Global and League/Cup/Champions leader state must use the same ranking-row source and sorting/tie/eligibility/historical-team semantics as the Ranking screen: `buildGlobalRankingData()` plus `rankGlobalRankingRows()`. The incremental index may reuse cached state or build only the necessary scope snapshot, but may not compare independent totals or invent tie rules. A player gets an event only when the prior eligible leader differs and the current eligible leader is that player; first snapshots and Team rankings never qualify.

## Consumers and performance measurements

`MatchDetailScreen` keeps its base read model (rating, story, lineup, facts) separate from the MatchChangeIndex lookup and never invokes `deriveFootballEvents()` on entry. Development-only measurements report validation, stringify, local-storage write/read-back, `saveAppState` total, `saveMatchDurably` total, Match Detail base read model, MatchChangeIndex cold build, and cached lookup. Measurements use console/performance APIs only and do not render production UI.

Home selects the canonical newest five matches before using a shared single-result projection. Results View All retains the full projection. Team Records retains Best Goal Difference and Lowest Goals Conceded per Match, and adds signed two-decimal Best Goal Difference per Match for teams with games. Records combination presentation alone uses `displayName`; IDs, calculations, sorting, ranks, and ties remain untouched.

## Persistence behavior

The durable success invariant is unchanged: validate state, serialize, primary localStorage write, exact read-back equality, then success. Because AppState is plain JSON-serializable data and equality proves the stored bytes are the validated serialized payload, the redundant parse/deep-validation is removed after regression coverage. IndexedDB and cloud remain best effort; failures cannot turn verified primary success into failure. Draft persistence remains in the existing AppState and storage key.

## Verification

Behavior tests cover all inventory classes, multiple events on one match, strict personal-best wins/ties, every Global/competition #1 scope and core metric, removal of ordinary/Top10/team/record movement from Match Changes, News separation, durable-save success/failure behavior, five-result selection, team records, combination presentation, and cache invalidation. The release gate is `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
