# v2.3.3 Champions, Team Titles, and Milestones Design

## Goal

Release v2.3.3 without changing persisted football history, rating semantics, or authoritative competition progression. Champions gains live, display-only downstream bracket slots; Player Detail gains transfer-safe historical team titles; and Match Detail's What Changed surface becomes a lazy canonical-milestone projection only.

## Release invariants

- Set `package.json`, `package-lock.json`, and `src/config.ts` to `2.3.3`.
- Retain `RATING_ENGINE_REVISION = 10` and `STORAGE_KEY = football-tracker-v1`.
- Retain every v2.3.2 rating coefficient, including LM/RM `.06`/`.25`, CM-family `.08`/`.30`, CDM-family `.06`/`.80`, and ST/SS assists `.55`.
- Do not migrate or rewrite storage, team IDs, players, matches, competition states, or existing `champions-draw.teamIds`.
- Do not commit or push.

## Champions canonical model and presentation

`makeSeriesRound` remains the authoritative owner of series integrity, row comparison, and pairing completion. It will group each team's matches by the canonical `competitionSeriesGame` identity, reject missing/duplicate/out-of-range/gapped or ambiguous history, and compare only a row for which both sides have the same game number.

For round of 16, quarter-final, and semi-final pairings, `rowWinners[n]` is calculated as soon as both same-number matches exist. It may therefore contain a resolved prefix while later rows are absent. `winnerId` remains undefined until both teams have all three valid series rows; it is then calculated from the three canonical row winners with the existing aggregate tie-break. Final uses its existing two-match and legacy replay behavior unchanged, while exposing its completed available row comparison.

`championsCompetition` will expose a tiny pure projection that maps resolved pairing winners into the next round's fixed slots. `CompetitionScreen` renders this projection only when that canonical next round does not yet exist. Projected IDs never feed `competitionAssignment`, New Match opponent selection, match identity, season completion, awards, or News. The canonical round still replaces exactly the same slot values once the preceding round is fully authoritative. Prior round cards are never removed.

The bracket score palette is factored into a small shared result-class helper used by Home recent matches and Champions: win is emerald, loss is red, unresolved is neutral. Row scores use a resolved `rowWinner`; round TeamIcon wrappers use only a resolved pairing `winnerId`, so downstream projected icons remain neutral. Unresolved slots render `TBD` as presentation text rather than a fabricated team.

## Team catalog order

Only the `STATIC_TEAMS` declaration order changes to:

`real-madrid`, `barcelona`, `atletico-madrid`, `inter-miami`, `arsenal`, `manchester-city`, `manchester-united`, `liverpool`, `chelsea`, `tottenham-hotspur`, `bayern-munich`, `borussia-dortmund`, `ac-milan`, `inter-milan`, `juventus`, `paris-saint-germain`.

`withStaticTeams` and `currentStaticTeams` continue identity matching by ID/external ID, so saved teams and historical fixtures survive. No selector may reorder an already persisted Champions draw.

## Historical player team-title read model

Add a memory-only, revision-aware read model that derives one title record per `(season, competition, player)`. Its champions come from `competitionSeasonStatus`: League, Cup, and Champions `championId` fields are the only title sources. An incomplete competition has no title.

Membership is collected per season/team from recorded `Appearance.teamId`; this is the available historical roster source. A player who appeared for the champion in the season receives the title even if their appearance was in another competition. The lookup never uses the player's present `teamId`, so later transfers retain correct past titles and cannot create false attribution. Player Detail appends `Season N League`, `Season N Cup`, and `Season N Champions` to the existing monthly/individual Awards list, including in its count. The read model does not persist the result.

## Milestone-only What Changed

`MatchChangeIndex` retains its memory-only cache, revision-aware invalidation, one chronological pass, lazy Match Detail lookup, and no persisted data. Its builder will retain only canonical structured `kind: 'milestone'` emissions and will eliminate ranking accumulators/takeovers, strict personal-best state, and rare/non-milestone performance derivation from this pipeline. Existing milestone rules and identity/crossing behavior remain the source of truth; no UI title matching or second threshold list is introduced.

What Changed remains titled exactly `What Changed`. It shows every milestone emitted for a match, and presents `No milestones reached in this match.` when there are none. News keeps its independent full-event derivation, including personal-record, rare-performance, ranking, award, and competition stories. Ranking, Records, Player Personal Records, and Awards data paths are untouched.

## Competition ranking UX

League remains the reference Top 10 experience. Cup and Champions use the same canonical scoped `buildGlobalRankingData` then `rankGlobalRankingRows` pipeline, but their compact previews no longer host comparison, ranking-filter, or inline expansion state. Each exposes only metric tabs, the first ten canonical rows, and a View All navigation to `global-ranking` with its current competition scope and metric.

`GlobalRankingScreen` owns the real team filter alongside scope, position, and metric controls. The selected team ID enters `buildGlobalRankingData` as its `teams` filter (not a post-ranking row filter), so eligibility and rank semantics stay canonical. An unfiltered Cup/Champions preview and the corresponding Global Ranking screen therefore share the same first ten rows. League-specific Race History, Table, Form, History, Best XI, and monthly awards remain in LeagueView.

## Verification

Add regression tests for partial Champions rows, full completion gates, projection/canonical slot continuity, assignment separation, palette/icon state, exact team order, historical draw preservation, all player-title cases, milestone inclusion/exclusion, multiple crossings, cache/lazy structure, News non-regression, Cup/Champions View All navigation, preview/full-ranking equivalence, and Global Ranking's source-level team filter. The release gate is `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
