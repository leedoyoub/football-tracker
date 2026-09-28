# Phase 3 Records and Latest Changes Design

## Goal

Keep Records compact through dedicated full leaderboards, and replace Home News with a deterministic, meaningful Latest Changes feed. Release metadata remains `2.4.1`.

## Baseline and protection

- Baseline: `cecf169` (Phase 2).
- Keep `APP_VERSION` at `2.4.1` and `RATING_ENGINE_REVISION` at `11`.
- Do not alter Phase 1 canonical Opponent SOT, rating rules, import fencing, draft restoration, persistence, chronology rules, or competition rules.
- Preserve Phase 2 catalog order, Player/Team Detail summaries, Home Global Ranking Top 10, shared entity actions, and editor/picker exclusions.
- Latest Changes is derived and non-persistent. No commit or push is part of this phase.

## Records leaderboard architecture

### Compact Records page

Ranking-style Player, Team, and Combination sections display only their first three canonical rows. `View All` pushes a new root-owned `{ name: 'records-leaderboard', ... }` view; it never inserts more rows into Records.

`expandedLeaderboardId` and combination-local expansion are removed only after all Records leaderboard expansion users have migrated. History, Awards, Insights, Integrity, and other non-ranking Records content retain their existing state and behavior.

### One full-leaderboard shell

`RecordsLeaderboardScreen` owns a shared header, Back action, carried scope summary, and uncapped rows. It dispatches to one of three row renderers:

- player: `RankingRow` with Phase 2 player and team actions;
- team: a team-specific renderer with a team action and metric value;
- combination: a combination renderer with independently actionable resolved player identities.

The shell never recomputes ratings, standings, combinations, or historical positions. It consumes the same canonical Records group/read-model selection used for the preview. Missing/legacy IDs render passive content. No interactive element may nest inside another.

### Scope contract and filters

The leaderboard view carries `category`, `leaderboardId`, `seasonIds`, `competition`, `teamIds`, and `positionFilter` from the Records entry. The existing root navigation entry snapshots Records state and scroll before the push, so Back restores tab, all filters, and scroll automatically.

Records reuses `PositionFilter` and `TeamFilter`; the existing season selector can remain the established Records control. Filters are applied before canonical ranking. Position filtering continues through `buildPlayerRecordLeaderboards` historical position semantics. A renderer hides a control when its selected group cannot consume that scope; it does not display an ignored active filter.

## Latest Changes architecture

### Canonical projection

Add `deriveLatestChanges(players, teams, matches, states, season?)`. It is a deterministic, cached, non-persistent projection over `deriveFootballEvents`, canonical match chronology, and the existing ranking, records, milestone, award, and competition transition sources. Its cache identity includes the source array identities, competition states, selected season, and `RATING_ENGINE_REVISION`.

It does not calculate ratings, SOT, standings, tournament outcomes, or record values itself. Match edit, deletion, and date changes replace source identities or chronology and therefore rebuild/reorder the projection.

### Selection, suppression, and grouping

The projection includes meaningful existing events: #1 takeovers, Top 3 entries or material movement, strict leader/record changes, existing milestones and streaks, and canonical competition advancement, elimination, and champion transitions. It excludes ordinary goal/assist contribution entries, ordinary wins, unchanged leaders, minor low-rank movement, and tied non-improvements.

Eligible events retain their canonical IDs. Presentation groups related eligible events by match using a stable match-derived group ID and deterministic importance/category/ID order. A group retains all source event IDs and exposes optional player, team, and match targets; independently meaningful events are not discarded.

One newest-first sorted projection serves both consumers. Home renders exactly `latestChanges.slice(0, 4)`; View All renders the same projection without an arbitrary cap.

### Home and full screen

Home replaces only its News section with `Latest Changes`, a newest-four preview and `View All`. Recent Matches, Global Ranking Top 10, and other Home sections remain unchanged.

`LatestChangesScreen` is a root-owned dedicated view with title `Latest Changes`, full newest-first rows, valid Phase 2 entity actions, and a sibling Match Detail action where a match target exists. Back uses the existing root stack and restores Home state and scroll. The old News domain remains while any other consumer needs it; only the obsolete Home News presentation and News-specific View All path are retired after consumer audit.

## Testing and verification

Test first for Records Top 3 previews; non-inline View All navigation; uncapped player/team/combination variants; filter-before-ranking; carried scope; Back state and scroll restoration; entity actions and unresolved targets.

Test first for Latest Changes newest-first ordering, exact Home-four/View-All-prefix equality, uncapped View All, edit/delete/date invalidation, meaningful #1/Top 3/leader/record/milestone/streak/progression/elimination/champion cases, low-value suppression, deterministic grouping, entity/match navigation, and non-persistence.

Final verification requires focused Phase 3 tests, the full suite, lint exit 0, production build, `git diff --check`, and a complete final diff audit.
