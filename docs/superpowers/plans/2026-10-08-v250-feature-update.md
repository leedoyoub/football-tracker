# v2.5.0 Feature Update plan

## Goal

Add four compact, runtime-derived views that explain player and team progress without changing existing rating, competition, ranking, award, persistence, or navigation semantics.

## Implementation

1. Add focused failing tests for scoped player form, chronological rank history, career milestones, team momentum, and provisional award presentation.
2. Derive Player Form from `derivePlayerScope` appearances and raw REV12 ratings. Render Last 5, season average, difference, and a compact ten-appearance SVG plot in Player Detail.
3. Derive rank snapshots only for the player's latest ten appearances. Accumulate raw ratings once, then use the canonical ranking comparator, `scopedMetricRanks`, and scoped position families at each snapshot. Cache by raw collection identity and compute this in deferred Player Detail content.
4. Derive career milestones from the unfiltered career scope. Show the three closest targets beside Career Timeline and Records.
5. Derive Team Form from canonical match chronology, team result perspective, and raw player ratings. Share Team Detail's existing season and competition selections.
6. Extend the existing canonical award result with its official candidate list and completion state. Show the Award Race beside existing Competition Best XI without a second award computation.
7. Run focused tests, full tests, lint, build, diff checks, and inspect the semantic diff. Bump all existing version sources only after validation and rerun checks.

No commit, push, deploy, persisted schema, or release side effect is part of this plan.
