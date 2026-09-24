# v2.3.4 Competition Hub UX and Performance Design

## Goal

Ship a focused UX and performance release: Global Ranking's Team filter uses
the same compact popup control as Position; Competition type changes reset the
real app-content scroll surface; and unchanged Cup/Champions revisits reuse
runtime canonical read models.

## Constraints

- Version is `2.3.4` in `package.json`, `package-lock.json`, and `src/config.ts`.
- `RATING_ENGINE_REVISION` remains `10` and `STORAGE_KEY` remains
  `football-tracker-v1`.
- Canonical football engines and all v2.3.3 competition, ranking, awards,
  news, records, milestone, and persistence semantics remain unchanged.
- New caches are runtime-only and never stored in AppState, LocalRepository,
  Supabase, or football entities.
- No commit or push is part of this release work.

## Audited Causes

`GlobalRankingScreen` renders Position with `PositionFilter`, a custom
button/menu, but renders Team with a native select. The native control owns its
own visual and popup behavior, producing the mismatch.

`CompetitionScreen` changes only the current navigation entry's screen state.
The actual scroll owner is App's `scrollRef` on `.app-content`; because no
route transition occurs, that element keeps its scrollTop.

League already reads through `selectLeagueCompetition`, keyed by the stable
`competitionCacheOwner` and mutation-time revisions. Cup and Champions call
`cupCompetition` and `championsCompetition` directly on their hot type-switch
path. Deferred completion calls `isCompetitionSeasonComplete`, and awards call
`competitionSeasonStatus` plus another type-specific derivation, so the same
season models can be derived again after the visible model is ready. Best XI
also repeatedly filters the same scoped tournament matches by stage.

## Filter Menu Design

Create a narrowly scoped generic `CompactFilterMenu<T>` presentation component.
It owns only popup state and presentation: a compact trigger, selected versus
neutral styling, chevron, menu-radio options, click-outside close, Escape
close, and a configurable bounded menu body. It accepts visible and accessible
labels so the all-state may have compact copy without losing meaning.

`PositionFilter` supplies the existing position options and continues to use
`'all'`; Global Ranking adds a Team wrapper supplying Team short-name options
and retaining `null` for all teams. Default controls read `Position | Team`;
the accessible all-state labels are `All positions` and `All teams`.

## Scroll Reset Design

App passes `onCompetitionTypeChange` to `CompetitionScreen`. That callback
uses `scrollRef.current` directly to set `scrollTop = 0` immediately, then
updates the competition screen state. `CompetitionScreen` uses this callback
only for League/Cup/Champions tab presses. Metric, filters, League inner tabs,
Best XI mode, and local controls retain ordinary state updates. No window
scrolling, DOM lookup, or additional scroll state is used; navigation/back
continues to use existing restoration.

## Competition Selector Design

Extend `competitionSelectors.ts` with Cup and Champions selectors beside the
League selector. Their WeakMap cache remains owned by `competitionCacheOwner`;
each per-season, per-type entry stores the canonical engine result and O(1)
identity/revision keys.

- Cup cache key: Cup mutation revision, team catalog revision, and player-array
  identity. These cover Cup match changes, static tournament/catalog identity,
  and rating-derived tie breaks.
- Champions cache key: Champions mutation revision, player-array identity, and
  the current Champions draw object reference. The store preserves an unchanged
  draw reference on hydration/sync; replacing a draw creates a new reference,
  which invalidates in O(1) without a persisted draw revision.
- League keeps its existing key and behavior.

Selectors never inspect or serialize raw Match/Event data before a hit. On a
miss they invoke only `leagueCompetition`, `cupCompetition`, or
`championsCompetition`; they do not reproduce rules.

## Consumer Reuse and Deferred Work

CompetitionScreen reads the selected type through its selector. It passes a
small cache-backed competition-model reader to deferred completion and awards,
so those consumers reuse the same selector entries rather than rebuilding
equivalent models. This remains demand-driven: displaying Cup does not warm
Champions, and vice versa. Deferred panels retain staged idle turns and their
type/season reset key because primary content should still paint before lower
analytics.

For Cup/Champions Best XI snapshots, build a component-local single-pass map
from stage to already-scoped matches and look up each snapshot group from that
map. This removes repeated scoped-array filtering without creating a new
global cache.

## Verification

Focused regression tests cover menu rendering and semantics, type-change scroll
wiring, selector hit/miss/invalidation behavior, canonical model reuse, and
stage grouping. Existing semantic tests protect League/Cup/Champions and award
rules. Full release validation is `npm.cmd test`, `npm.cmd run lint`,
`npm.cmd run build`, and `git diff --check`, followed by full diff review.
