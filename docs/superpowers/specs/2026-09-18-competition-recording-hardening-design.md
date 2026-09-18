# Competition Recording Hardening Design

## Goal

Make Cup and Champions identity immutable after lineup commitment, while preserving the existing competition formats and the approved Champions same-row comparison-series semantics.

## Source of truth

`CompetitionAssignmentSnapshot` is the durable identity for an accepted match slot. It records the season, tracked team, competition type, stage, pairing id, Champions series game, logical opponent, and schedule identity. A new editor may show a live proposal before kickoff. Once kickoff is committed, the snapshot is frozen into the draft and all subsequent save/restore operations use it verbatim. An edited match always derives its snapshot from the saved match, never from live tournament state.

The competition engine remains the only authority for *proposing* a new slot and for deriving progression. It receives the same teams, matches, players, season, and Champions draw for Competition UI, team progress, season completion, and Log Match availability. This prevents rating/SOT tiebreak resolution from varying by caller.

## Integrity and mutation safety

Champions series identity is validated per season, stage, pairing, and tracked team. Valid rows are 1–3 for R16/QF/SF and 1–2 for the Final. Missing, duplicate, out-of-range, or mixed ambiguous rows fail closed; they do not create a new assignment or advance a pairing.

Before a Cup or Champions edit/delete is applied, a dependency check compares tournament progression before and after the proposed mutation. It blocks only when a later saved stage/round would become impossible under the replacement result. Corrections that retain the same advancement remain allowed. No downstream records are deleted automatically.

Season-complete metadata is normalized conservatively during match mutations: a marker is retained only if the underlying League, Cup, and Champions status remains complete. Historical valid completions are unchanged.

## Presentation and persistence

A single competition-context formatter produces full and compact labels for Log Match, Match Detail, Team history, and Result cards. Internal stage keys are never displayed. Lineup-preview statistics use the selected season and competition scope.

Cloud serialization uses `competition_series_game` and an idempotent migration. Local persistence keeps the complete snapshot naturally as part of `Match`; auth, storage authority, queue epochs, and service-worker behavior are unchanged.

## Invariants

- Champions uses the existing same-row comparison logic and all current tiebreak behavior.
- R16, QF, and SF require three independently recorded games per team; Final requires two.
- Cup Final remains one match, with one Final Replay only under the existing rule.
- `RATING_ENGINE_REVISION` remains `8`, storage remains `football-tracker-v1`, and release version remains `2.2.8`.
- Existing v2.2.8 awards, News, records, Best XI, and scroll control work remains intact.

## Cup Final audit boundary

The current one-team recording model will be regression-tested for whether the other registered finalist receives player-level facts. A compatible minimal repair may be made only if it does not change the one-Final-match rule or require a two-team editor. Otherwise the limitation remains documented rather than silently redesigning the data model.
