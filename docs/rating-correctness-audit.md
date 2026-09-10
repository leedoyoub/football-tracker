# Rating correctness audit

## Confirmed defects and corrections

- The old on-pitch predicate used `minute < exit`, excluding 90-minute goals at full time for players still on the pitch. This explains a missing second conceded penalty in the Gerard scenario.
- Numeric windows clipped substitutions to the nominal duration, even though the match logger stores duration 90 while accepting events through 99. Read-time normalization now extends the observed match end to recorded event/position-change minutes without changing saved data.
- Position-at-event walked the unsorted raw history, unlike position-minute calculations. Both now use one ordered normalized history.
- Position changes did not record ordering relative to same-minute goals. New live actions share sequence numbers. Historical changes use their same-team substitution as an anchor when available; otherwise a position change applies at the beginning of its minute. The exact historical order cannot be recovered when it was never recorded.
- The old suppression cap applied separately to every position segment and could exceed a total minutes factor of one. The cap now applies once, preserving the actual share of each position.
- Some consumers used the pre-clamp sum, others the capped rating. `preClamp` now retains the component sum; `raw` and the compatibility field `rating` both contain the same full-precision 3–10 result. Average and Best XI calculations no longer round before presentation.
- Live-history reconstruction rejected stoppage-time substitutions and checked all goals after that minute's substitutions. It now accepts through 99 and validates attribution with the shared ordered timeline.
- An older partnership helper excluded final-minute goals and lacked on-pitch checks for assists. It now uses the central event predicate.

## Timeline and historical compatibility

`normalizeMatchTimeline()` prepares ordered events, each player's on/off intervals, and position intervals. Actual minutes are the sum of played segments, excluding bench gaps. Full-time events remain attributable to players who have not been substituted off. An explicit substitution off takes precedence according to event order. There is no minimum-minutes rule suppressing conceded penalties.

Goals, assists, uninvolved bonuses and conceded penalties use the position at that event. SOT suppression sums each position's contribution. Untimed goalkeeper save totals remain untimed; all valid own-team goalkeeper saves contribute to opponent SOT, while each keeper's save-rate denominator uses only conceded goals during that keeper's time on pitch.

Equal-minute events use explicit sequence where present. Unsequenced events preserve saved slots; explicitly sequenced events are sorted within their slots, producing one deterministic total order for mixed histories. Legacy tactical aliases are normalized at read time. New position changes share the event sequence space.

The initial repository schema and subsequent position-history schema were inspected. They already used `sub`, minimal opponent `goal` events, appearance `position`/`matchPosition`, optional save counts/timestamps and later `positionHistory`. No speculative legacy substitution fields were introduced. `Player.rating` and saved `manOfMatchPlayerId` were present, but the audited rating/MOM paths were already recomputing rather than trusting those fields. The defects were in timeline interpretation and derived precision, not reuse of stored player ratings.

## One result and cache behavior

Match Result/Detail, Player Detail/Matches, Recent Form, MOM, Rankings, Best XI, Records, competition tie-break averages, Awards and History use the current central rating output. Cached results are shared by Match object revision and player ID. Match replacements invalidate that match's timeline/rating; unchanged Match objects keep their cached results. The repository's immutable array replacements invalidate affected aggregate projections.

`RATING_ENGINE_REVISION = 3` is part of timeline, rating, Player Detail scope, ranking and Best XI cache identity. These caches exist only in memory and are never persisted as football history. Loading the updated application recalculates historical matches automatically; no edit/resave, logout, reinstall or storage wipe is required.

## Gerard Martín regression

The fixture retains an obsolete player rating of 6.50, enters a player registered as LB at 77 as match-position CB, and records a 4–2 win with opposition goals at 89 and 90. Both goals count as CB concessions.

| Component | Value |
| --- | ---: |
| Actual CB time | 13 minutes |
| Field-player base | 6.50 |
| Opponent SOT | 2 |
| SOT multiplier | 0.73 |
| SOT suppression: 1.35 × 0.73 × 13/90 | +0.14235 |
| Conceded: 89 CB, 90 CB | −0.50 |
| Win modifier | +0.10 |
| Goal / assist / uninvolved / responsibility | 0 |
| Pre-clamp and final raw | 6.24235 |
| Single-match display | 6.2 |
| One-match average display | 6.24 |

Assertions verify shared object identity for central, match-list, player-scope and ranking ratings; raw averages, MOM and Best XI agree. Server-rendered Match Detail and Player Detail both show 6.2. This is a regression fixture, not the user's actual saved match.

Browser discovery returned `No browser is available` and an empty browser list. The actual persisted Gerard Martín match and interactive current/historical screens were **not runtime-verified**.

## Verification

- `npm.cmd test`: 228 passed, zero failures (54 new correctness tests).
- `npm.cmd run build`: passed, including `tsc -b` typechecking. No separate typecheck script is configured. Existing bundle-size warning remains.
- `npm.cmd run lint`: passed; existing warnings remain, with no new lint errors.
- `git diff --check`: passed.
- Controlled 624-match × 22-player replay: approximately 79 ms cold and 1.4 ms warm in the isolated run. These are engine timings, not browser responsiveness measurements.
- Existing League cache and finalized-coefficient regressions pass.

## Files changed in this correctness pass

- `src/engine/timeline.ts`
- `src/engine/rating.ts`
- `src/engine/ratingRevision.ts` (new)
- `src/engine/playerDerived.ts`
- `src/engine/stats.ts`
- `src/engine/substituteImpact.ts`
- `src/engine/integrity.ts`
- `src/screens/NewMatchScreen.tsx`
- `src/screens/PlayerDetailScreen.tsx` (Rating Details)
- `src/screens/matchLineup.ts`
- `src/screens/liveHistory.ts`
- `src/types.ts`
- `tests/rating-correctness.test.cjs` (new)
- `tests/critical-bugfix.test.cjs`
- `tests/position-timeline.test.cjs`
- `tests/stats-saves.test.cjs`
- `docs/rating-correctness-audit.md` (this report)

The existing uncommitted v2.1.1 refinements were preserved. No finalized rating coefficients, the 7.2 Good Rating threshold, display colors, general average-rating eligibility, or special award eligibility rules were changed. No historical football data, legacy fields, IDs, substitutions, position timelines or storage were deleted/reset or migrated destructively. No deployment was performed.
