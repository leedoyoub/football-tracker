# Competition Identity and Derived Records Design

## Goal

Make every recorded match resolve to one structurally valid competition identity, prevent fresh-editor autosave from becoming schedule authority, and derive requested rankings and goal records from that identity without changing rating or raw football data.

## Canonical identity

`CompetitionIdentity` is a validated read model containing `competitionType`, `season`, `teamId`, `stage`, `matchDay`, optional `pairingId`, `seriesGame`, and `opponentTeamId`. A saved assignment is preferred only after format validation: a Cup Stage 1 assignment with ordinal 4 is not valid. Legacy top-level values are used only when no valid assignment exists. If a deterministic repair is available (currently Cup stage ordinal implied directly by its stage), normalization synchronizes identity metadata only; events, appearances, kickoff lineup, date, score, ratings, substitutions, and saves are never changed. Ambiguous records are interpreted at read time and not persistently guessed.

## Editor lifecycle

The editor owns one of three modes. `fresh` has no source match and derives its full proposal from live selector state; its checkpoint cannot become authority after rerender. `resume` restores the accepted draft identity. `edit` restores and locks a durable match identity, including an eventless 0-0 match. A competition switch in fresh mode replaces the complete identity atomically, including opponent and schedule ordinal. Continue freezes the proposal; final save rejects an identity that differs from the active canonical assignment.

## Scheduling and persistence

League remains MD1--MD30. Cup schedule ordinal is its deterministic stage ordinal, so Stage 1 is always 1. Champions uses the existing R16/QF/SF three-game and Final two-game progression; its ordinal is derived from the stage plus series game rather than historical raw maximum. Hydration, import/export, and cloud deserialization normalize safely; `football-tracker-v1` remains the only storage key.

## Consumers and chronology

Competition filtering, progression, revisions, caches, stats, rankings, records, screens, awards, match changes, cloud boundaries, and lifecycle code share canonical accessors. Actual chronology uses `oldestMatches`/`newestMatches`; only League MD history continues to use League matchDay intentionally. Player match history is based on actual appearances, not current team membership.

## Derived product behavior

The ranking labels are Global/League/Cup/Champions/Team Ranking and main metrics insert 7.2+ Matches after MOM. Per-90 equations and rating revision 9 are unchanged. Goal types are replayed from ordered raw events: five exclusive base classes plus three overlapping special tags. Records expose only the five requested goal-type leaderboards. Match Changes retains grouping/fallback behavior while applying Team Top-3 and Global/competition Top-10 movement policies with explicit scope labels.

## Compatibility and validation

All competition totals must partition every canonical match exactly once. Base goal type totals must equal official credited goals; own goals affect score replay but never credited player goals. Tests cover lifecycle A--L, repair idempotency, aggregate/per-90 identities, chronology, historical player appearances, cache/revision scopes, and presentation policies. Release version is 2.2.13; no rating, Champions-format, League-format, navigation, typography, density, or storage-key change is permitted.
