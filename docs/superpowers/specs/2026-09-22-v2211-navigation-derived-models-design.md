# Football Tracker v2.2.11 Navigation and Derived Models Design

## Purpose

Deliver a coherent, historical-data-safe upgrade to Football Tracker. The update must make drill-down/back navigation restore the exact prior screen state, separate major Home News from detailed per-match changes, and use shared, revision-aware domain read models for rankings, awards, records, and standings. Raw football history and the `football-tracker-v1` storage namespace remain unchanged.

## Current-state audit

The audited worktree is clean on `main` at package/app version `2.2.10` and `RATING_ENGINE_REVISION = 8`. The baseline test suite passes (383 tests).

- `App.tsx` stores only `View[]`; scroll offsets live separately, and screen state is mounted locally. Back restores an old offset into a new default screen instance.
- `MatchDetailScreen` computes raw `sortedRatings`, but its Ratings tab renders `[...starters, ...bench]`; its Lineup `Pitch` has no slot click callback and its Back button pushes Home.
- `AwardBestXI` is a shared collapsible `details` presentation. League monthly UI consumes finalized-only `latestMonthlyAwards`; history renders its Best XI as a plain list.
- `deriveNews()` feeds both Home and Match Detail; Match Detail filters it by match and truncates the result. No event-surface type distinguishes major News from detailed match changes.
- ratings, season analytics, history read models, and News already use revision-aware caches, but new read models must include the rating revision and every collection that affects their semantics.
- Cup active rows use current-stage rank but cumulative visible totals. Records have occurrence and zero-value eligibility gaps; ranking screens cap some View All paths at 50 and use a large apply-dialog position filter.

## Non-goals and invariants

- Do not clear, migrate, or rewrite football history; do not call `localStorage.clear()`.
- Do not synchronize the browser History API in this release.
- Do not persist navigation state, match changes, recomputed ratings, or award derivations to football storage.
- Preserve the 30-match league limit, current Champions comparison-series rules, MOM tie-breaks, regulation credited-minutes cap, draft durability, and existing Supabase/local recovery behavior.
- Do not commit or push during this task.

## Navigation design

`App` owns one typed stack of `NavigationEntry` objects:

```ts
type NavigationEntry = {
  view: View
  scrollTop: number
  screenState: ScreenState
}
```

`ScreenState` is a discriminated union keyed by screen family. It contains only ephemeral, serializable UI choices relevant to Back restoration: Match Detail tab; League Players/Table/Form/History tab, player ranking metric/filter, Season Best XI versus Team of the Month mode, League History selected matchday and compared teams, and competition ranking metric/filter/View All/compare selections; Global Ranking metric/scope/position/expanded leaderboard identity; Records category/competition/position/expanded leaderboard identity/history panel/season/block; and Team Detail tab, scopes, selected season, and expanded context. Screens receive a state value and one `onStateChange` callback; they must not create new module-level state maps for these values. Competition type is taken from the `View` when already encoded there; otherwise it is part of `ScreenState`.

`push(view, initialState?)` first snapshots the active container scroll onto the current entry, then appends a fresh entry. `pop()` removes exactly one entry. `replace(view, state?)` replaces the top entry for terminal save/cancel transitions. Before a pop paints, App supplies the prior entry's state; a layout effect then restores its saved scroll position. Tab navigation intentionally starts a new root entry and resets scroll. `BACK TO TEAM` has exactly two outcomes: if the immediately previous entry is the same Team Detail, pop to it; otherwise replace the current Match entry with that Team Detail. It never pushes a second Team Detail entry, so Team -> Match -> Team -> Back loops cannot be created.

## Shared read models

### Historical position classification

Introduce one `scopedPositionFamilyByPlayer(players, matches, scope)` helper returning `Map<string, PositionFamily>`, where `PositionFamily` is the normalized domain/filter-family type rather than an arbitrary raw `Position`. For each eligible player it sums credited minutes from timeline position segments in the supplied historical scope, normalizes aliases (including LAM/RAM to CAM), and uses deterministic family/name ordering for ties. Ranking surfaces filter the player pool with this map *before* ranking. A player with no historical minutes in scope is excluded instead of being classified from a future current registration. The same helper is used by Records, Global Ranking, Home, and award selection.

### Active monthly award

Keep `monthlyAwards` and `monthlyAwardForBlock` finalized-only. Extend `SeasonAnalytics` with `activeMonthlyAwards`, derived by the existing canonical monthly selection function for the block containing the highest recorded League matchday. It is `undefined` when that block has no match. No active award emits award News or enters historical award records. Finalized blocks retain their historical snapshot/result and are the only input to Records History.

Award Best XI selection must itself be historical. When position eligibility affects a Best XI, `monthlyAwardsFor`, competition awards, and historical Best XI read models use `scopedPositionFamilyByPlayer` over the relevant matches and credited historical position participation. They must not read the player's current registered `position` or current `teamId` to reinterpret an old award. Changing a player's current registration after the season therefore cannot change a finalized historical result when the raw matches and historical roster facts are unchanged.

### Events, News, and match changes

Replace the implicit shared `NewsItem[]` contract with one canonical derived event model:

```ts
type EventSurface = 'news' | 'match-change' | 'both'
type DerivedFootballEvent = NewsItem & {
  surface: EventSurface
  matchChange?: MatchChangePayload
}
```

Projection helpers are the only consumers. `majorNewsEvents(...)` returns deterministic newest-first major News items for Home and View All and admits only `news`/`both` events. `matchChangesForMatch(...)` returns detailed grouped changes for Match Detail and admits only `match-change`/`both` events anchored to that match.

Major News classification is an explicit whitelist. Finalized awards, major competition transitions, major all-time/season records, major career thresholds (Goals 50/100/150..., Assists 50/100/150..., Appearances 100/200..., MOM 50/100..., and similarly large supported clean-sheet thresholds), rare hat-trick/4+ goal or 4+ G+A performances, a genuinely exceptional raw-rating threshold already supported by canonical rating semantics, meaningful long streaks, and a newly taken #1 in exactly Rating, Goals, Assists, G+A, or MOM can be major News. Existing broad `rare` classifications do not automatically become Home News. Ranking Top-10 entry/re-entry/upward movement, routine personal bests, first competition goals, early milestone thresholds, and smaller clean-sheet/hat-trick counts are Match Change only. Classification is explicit data, never title-string filtering. Home renders exactly `majorNewsEvents(...).slice(0, 4)`; View All renders the complete same-season projection with no row limit.

Home and View All use the same filtered major-News projection and therefore the Home four are exactly the first four items a user sees in View All for that season. Home never receives Top-10 movement, routine personal-best changes, first competition goals, early hat-trick/clean-sheet thresholds, or other ordinary per-match changes. A canonical event can be `news`, `match-change`, or `both`; ranking movement is never `news`, while finalized official awards remain News. All projections are derived on demand from raw matches/events, have stable IDs, and rebuild after edits/deletes without persisted stale rows. News ordering is one canonical comparator: newest event date first, then newest canonical match chronology for events anchored to matches, then stable event ID. Home and View All call that same comparator.

### Match-change index

Create a revision-aware `matchChanges` read model keyed by matches, players, teams, competition state, and `RATING_ENGINE_REVISION`. Build once from `oldestMatches()` canonical chronology. It accumulates player aggregate state and occurrence-record counters as each match is applied. For each match, it compares only before/after state for the five core ranking metrics—Rating, Goals, Assists, G+A, and MOM—and the canonical individual Records and Team Player Ranking leaderboard identities. Different UI surfaces representing the same leaderboard identity are deduplicated. Ranking-change events are emitted only for players who actually participated in the match, unless a separately documented canonical domain event is not player-performance based. It emits strict personal-record and milestone events, then groups ranking rows by player. It does not call a full global-ranking build once per rendered Match Detail. Historical edit/delete/date changes replace collection identity and naturally rebuild the index.

Create one engine-level Player Records leaderboard model, in `playerRecords.ts` or a focused engine companion, consumed by both Records UI and Match Changes. Its canonical leaderboard IDs and occurrence rules cover Matches Scored In, Braces, Hat-tricks, 7.2+, 8.0+, 9.0+, 10.0, Clean Sheets, Saves, and every other approved individual event/count leaderboard. Records UI must not reimplement these definitions, and Match Changes must compare the same prepared rows. Team Player Ranking is included when it represents a real ranked individual leaderboard; team standings, pair/duo combinations, and decorative summaries are excluded. Preserve outside Top 10 -> Top 10, Top 10 re-entry, every upward movement within Top 10 including +1, and taking #1. Never emit unchanged, downward, or movement entirely outside Top 10.

## Required domain changes

- Rate Match Detail rows by canonical raw rating descending, exact player-ID tie-break, then unused/unrated bench. Keep MOM presentation unchanged.
- Use `Pitch`'s existing slot click contract for real historical starters only.
- Always render `AwardBestXI` expanded; retain its pitch, scoped stats, blue best-player highlight, and click callback.
- Reuse `AwardBestXI` in Records History for finalized monthly blocks.
- First goal milestones are keyed player/season/competition. Hat-trick events are occurrences (one per 3+ goal match), with 1, 3, 5, 10 then every five; clean sheets use canonical goalkeeper appearances and five-step thresholds; Link Goals use an order-independent scorer/assister key.
- Personal records use strict before/after comparisons on raw rating, goals, assists, and G+A. Ties do not emit an event.
- Update v8 `POSITION_RULES` exactly to the approved v9 table: ST .90/.55; team-goal bonuses LW/RW/CAM/LM/RM .05, CM .07, CDM .06, FB .04; suppression CB 1.30, FB 1.00, CDM .50, LM/RM .15; concessions CDM -.15, CM -.10, LM/RM -.10. Preserve all other stated rating semantics and set revision 9.
- For Cup rows, use current-stage standings for living teams and cumulative standings frozen at elimination for eliminated teams; change explanatory copy.
- Add Matches Scored In; braces count 2+; hat-tricks count 3+ once per match. Exclude zero-valued occurrence rows. Put `Lowest Goals Conceded per Match` after clean sheets and exclude zero-game teams.
- Replace the filter dialog with one anchored compact position selector used by Records player rows, Global Ranking, and Home Season Leaders. It applies immediately and supports the approved group mapping.
- Remove all user-facing View All 50-row caps. Records' floating control exists only for an active long expanded leaderboard and scrolls to that section's header, not global page top.
- Team-scoped movement is recalculated in its team-scoped population or omitted; never display overall League movement as team movement.

## Cache and invalidation policy

Existing rating/timeline cache semantics remain. New or extended caches use identity layers for matches, players, teams, and competition states plus a `RATING_ENGINE_REVISION` key when output consumes ratings. No cache writes derived values into persistence. UI memoization consumes prepared rows and only reorders/filter rows; it does not rate each visible row. Full lists may render all rows but must reuse the prepared read model and lightweight row components.

## Test strategy

Tests use the existing Node test runner and production source imports. Add behavioral tests for each requested navigation route, raw-rating order and starter click, active/finalized monthly separation, award pitch history, surface exclusivity/order/caps, strict personal and grouped ranking changes, milestone occurrence semantics, v9 rule values/cache invalidation, Cup two-stage rows, Records eligibility, position filtering before rank with historical classification, and View All row 51+. Keep source assertions only where React rendering cannot be exercised; they do not replace domain tests.

## Release and rollout

1. Land pure shared types/read models and their tests.
2. Move navigation to controlled entries and migrate screen state consumers.
3. Wire shared UI presentation and position filtering.
4. Apply rating/cup/records domain behavior, then surface it through read models.
5. Wire News and Match Detail projections only after derivation is tested.
6. Update app/package version to `2.2.11`, run the complete validation set, and inspect the final diff without committing.
