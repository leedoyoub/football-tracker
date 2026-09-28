# Phase 2 Catalog, Overview, and Entity Navigation Design

## Goal

Release version 2.4.1 with the canonical Teams display order, clearer Player and Team Detail summaries, a Top 10 Home ranking preview, and consistent accessible navigation from registered identity visuals.

## Baseline and constraints

- `7268d2c` ("Phase 1: data safety and canonical SOT") is the baseline.
- Phase 1 Draft restoration, atomic import replacement/fencing, canonical Opponent SOT, rating recalculation, and all SOT/rating consumers remain behaviorally unchanged.
- `RATING_ENGINE_REVISION` remains exactly `11`. This phase does not change rating coefficients, storage keys/namespaces, schema identifiers, import transactions, draft persistence, chronology, competition advancement, or tie-break order.
- No commits or pushes are part of this work.
- Phase 3 is excluded: Records filters/dedicated View All/Top 3 previews, News removal, Latest Changes, and all related redesign work.

## Release metadata

Update the actual version sources in lockstep to `2.4.1`: `package.json`, `package-lock.json` including its root package entry, and `src/config.ts`. Tests continue to pin the unchanged rating revision and storage invariants.

## Canonical Teams catalog display

`STATIC_TEAMS` is the sole ordered catalog. `currentStaticTeams(teams)` maps each catalog identity to the matching existing saved record, when present. It must produce this display order:

1. Real Madrid (`real-madrid`)
2. Barcelona (`barcelona`)
3. Atl&eacute;tico Madrid (`atletico-madrid`)
4. Inter Miami (`inter-miami`)
5. Manchester United (`manchester-united`)
6. Manchester City (`manchester-city`)
7. Liverpool (`liverpool`)
8. Arsenal (`arsenal`)
9. Chelsea (`chelsea`)
10. Tottenham (`tottenham-hotspur`)
11. Bayern Munich (`bayern-munich`)
12. Borussia Dortmund (`borussia-dortmund`)
13. AC Milan (`ac-milan`)
14. Inter Milan (`inter-milan`)
15. Juventus (`juventus`)
16. Paris Saint-Germain (`paris-saint-germain`)

The Teams screen renders the resolved catalog in its existing four-column grid, not persisted-array order. It does not mutate saved IDs/properties, regenerate teams, reorder persisted history, or rewrite historical match references. Existing competition uses of the current 16-team catalog keep using the same resolved records.

## Canonical overview read models and layouts

### Player Detail

The existing season and competition scope remains. Player Detail consumes `PlayerDerived` and renders two equal three-column rows:

```
Avg Rating | Goals | Assists
Apps       | Minutes | MOM
```

`Apps` is exactly `PlayerDerived.apps`, using existing credited-playing-time/rating semantics; an unused bench listing is not an app. No screen-local appearance calculation is added. Rating formatting/ranks, minutes, MOM, history, and position rules remain unchanged.

### Team Detail competition summary

`teamCompetitionOverview` owns Champions and Cup `wins`, `draws`, and `losses` along with its canonical status and GF/GA. Team Detail only presents this read model and performs no competition aggregation, score derivation, or tournament progression logic.

Both Champions and Cup use this four-column layout:

```
Progress (col-span-2) | W-D-L | GF-GA
```

League is not redesigned. The read model formats canonical Champions labels and compact progress, such as `Round of 16 (2/3)`, `Quarter Final (1/3)`, `Semi Final (3/3)`, and `Final (1/2)`, with no `Game` wording. Champion and eliminated states retain current semantics in compact form, such as `Champion` and `Eliminated · QF` (or its existing canonical equivalent). Cup retains equivalent compact progress based on its current model.

## Home Global Ranking Top 10

Home keeps its selected-metric lazy ranking index. Position filtering and canonical ranking happen before the preview limit, then the selected result uses `slice(0, 10)`. Fewer eligible rows are all shown. Metric tabs, filters, ordering, and the existing View All payload remain unchanged.

## Shared entity interaction contract

`TeamIcon` and `PlayerAvatar` remain visual/fallback primitives. Shared team and player identity action wrappers compose those visuals with root-owned navigation callbacks:

- A registered team crest/icon opens `{ name: 'team', id: team.id }`.
- A registered player photo/avatar/icon opens `{ name: 'player', id: player.id }`.
- Missing, legacy, deleted, unresolved, and API-only entities remain safe non-interactive visuals; IDs are never inferred from text.
- Wrappers use native button semantics, accessible labels, keyboard focus, and subtle existing active/focus styling.
- Existing root navigation entries, screen state, Back behavior, and scroll restoration are used. No router, browser-history synchronization, local stack, or direct location change is added.

Browse/display surfaces adopt this contract wherever they show a registered entity identity: Home/Recent Matches, Results, Global and competition rankings, Team Best Players, standings, competition headers/tables/brackets where appropriate, Team/Player detail contexts, match/result displays, and player/team lists. Controls whose sole existing destination is already that same entity stay one valid action.

Editor/selection surfaces deliberately retain their behavior and are not converted to navigation: squad selection/import, new-player API candidates, lineup editing, live-match draft controls, and other pickers.

## Mixed destinations and valid DOM

No interactive element nests inside another. Mixed-destination UI is split into valid sibling regions:

- Match/result cards expose separate registered-team actions and a Match Detail action for the remaining card region.
- Player ranking rows retain a Player Detail action for the player/row region while the team crest independently opens Team Detail.
- A row/card with one entity destination may remain one button when its contained identity has the same destination.

Event propagation does not conceal invalid markup. All actions retain keyboard reachability and explicit accessible labels.

## Testing and verification

Write tests first for:

- package, lockfile, and config version `2.4.1`; unchanged revision `11`;
- exact catalog order, four-column grid, saved-ID/property preservation, and unchanged historical references;
- unchanged Player Detail first row, exact second row, canonical Apps/Minutes/MOM, and unused-bench exclusion;
- canonical `teamCompetitionOverview` W-D-L/GF-GA; both Team Detail `2 + 1 + 1` rows; compact Champions `2/3` and `1/2` copy without `Game`; preserved terminal states;
- selected-metric Home Top 10, filter-before-limit, fewer-than-ten, and View All behavior;
- team/player navigation, invalid-target non-interactivity, independent match-card/ranking-row destinations, valid non-nested buttons, and root-stack Back restoration;
- existing Phase 1 regression coverage for unchanged SOT/rating/import/draft guarantees.

Final verification runs focused Phase 2 tests, the full test suite, lint, production build, `git diff --check`, and inspection of status/stat/full diff. No Phase 3 tests or UI changes are introduced.
