# Phase 4A Award Selection Design

## Purpose

Phase 4A consolidates the derived selection rules for Best XI and Best Player
awards. It changes only award selection; match ratings, MOM, rankings,
persistence, navigation, and Phase 4B–D presentation work remain unchanged.

## Canonical candidates

Award candidates are derived from the existing canonical rating, MOM,
chronology, event, and credited-position sources. A candidate is scoped by
both player and the team recorded on each appearance. This preserves historic
team, position, minutes, and team-match denominators across transfers. A
single player may have multiple historical team-context candidates, but a Best
XI may select that player only once.

Every scored candidate exposes raw average rating, appearances, MOM count,
minutes, latest raw rating in canonical chronology, G+A, historical team ID,
and optional selection-only achievement bonus. Selection score is
`rawAverage + achievementBonus`; the bonus never changes displayed average,
ratings, MOM, Global Ranking, or persisted football data.

## Eligibility and ordering

Cumulative award scopes require `ceil(teamScopedMatches * .40)` qualifying
appearances, where the denominator is the exact number of recorded matches
the candidate's historical team played in that exact scope. The shared
cumulative comparator is, in order: selection score descending, appearances
descending, MOM descending, minutes descending, latest raw rating descending,
G+A descending, then `playerId` ascending. It uses full precision and never
uses a display name.

Team of the Week is a separate recent-window selector: a player must have the
three newest relevant appearance-time team participations and three qualifying
ratings. Its comparator is recent average, recent MOM, latest rating, recent
minutes, recent G+A, then `playerId`. Monthly, Stage, Round, and Final scopes
also use the 40% cumulative eligibility gate, but are performance-only:
they receive no achievement bonus.

## Achievement bonuses

Competition Best XI and Best Player share these direct, selection-only
bonuses:

| Competition | Reached result | Bonus |
| --- | --- | --- |
| League | 1 / 2 / 3 / 4 / 5–8 / 9–16 | .20 / .08 / .035 / .025 / .015 / 0 |
| Champions | Champion / runner-up / semi-final / quarter-final / R16 | .20 / .08 / .035 / .020 / 0 |
| Cup | Champion / runner-up / S7 / S6 / S5 / S4 / S1–3 | .20 / .08 / .035 / .030 / .025 / .015 / 0 |

All-competition season selection sums the reached bonuses without a cap:

| Competition | Reached result | Bonus |
| --- | --- | --- |
| League | Champion / runner-up / 3 / 4 / 5–6 / 7–8 / 9–12 / 13–16 | .26 / .12 / .06 / .05 / .04 / .03 / .015 / 0 |
| Champions | Champion / runner-up / semi-final / quarter-final / R16 | .24 / .11 / .05 / .03 / 0 |
| Cup | Champion / runner-up / S7 / S6 / S5 / S4 / S1–3 | .12 / .06 / .035 / .030 / .025 / .020 / 0 |

A league, Champions, and Cup treble therefore totals exactly `.62`.
In-progress competitions read only canonical present standings, elimination,
and reached-bracket progress; they never infer a future champion or runner-up.

## Shared award results and publication

Best Player and Best XI for a scope consume the same ordered scored candidate
list. Competition and season award results may expose live selections while
in progress. Official award/history/news publication continues to require
completion, so a live preview never becomes a finalized award story.

The season domain result exposes score-bearing Best Player and Best XI fields
for future presentation work, but Phase 4A adds no UI, route, label, or
navigation change.

## Constraints and verification

- Keep app version `2.4.1` and `RATING_ENGINE_REVISION = 11`.
- Do not alter Phase 1–3 SOT, rating, import, draft, persistence, or
  navigation semantics.
- Do not implement Phase 4B, 4C, or 4D UI/navigation work.
- Award derivations remain non-persistent and revision-aware through existing
  source identities and rating-revision keys.
- Tests cover exact thresholds, all comparator fields, bonus tables,
  in-progress progress, historical transfer context, no duplicate slots,
  publication gating, and non-mutation.
