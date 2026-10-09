# Phase 7 performance results

## Method

Run `npm run benchmark:engine -- 100 500 1000` from the repository root. The script runs with Node's exposed garbage collector, Node 24.19.0, and produces separate cold and warm measurements. It builds deterministic league schedules for 16 teams across 30 matchdays (240 fixtures per season); no team is assigned more than 30 recorded matches in a season. The generated matches use 11 starters, team scoped appearances, goals, and opponent shot totals.

`phase-7-baseline.json` records the initial measurements. `phase-7-reference.json` and `phase-7-optimized.json` run the final three-sample harness against the pre-optimization and optimized algorithms on the same generated data. The reference uses the original per-lookup interval calculation. The benchmark hashes the derived results to check that the optimization preserves output. Heap delta is retained heap after forced GC and is sensitive to runtime and cache state; use it as a diagnostic, not as an allocation or browser-memory claim.

## Main measured change

Combination analytics repeatedly searched the same team's appearances and recalculated player position intervals while enumerating pairs, trios, and back fours. The function now builds a call-local appearance and interval index once per match/team. It is discarded when the calculation ends, so it cannot become stale if imported or edited match data changes.

| Matches | Six combination kinds, baseline | Optimized | Change |
| ---: | ---: | ---: | ---: |
| 100 | 79.39 ms | 99.39 ms | +25.2% |
| 500 | 619.51 ms | 606.46 ms | -2.1% |
| 1,000 | 1,366.07 ms | 1,169.04 ms | -14.4% |

Every benchmark output hash matched its reference value. The call-local index adds overhead on the 100-match workload, so the implementation keeps the original lookup path below 200 scoped matches. The 500- and 1,000-match median changes are modest in the three-sample run and benefit from more repeats on the target device before rollout. Other functions did not show a consistent enough improvement to justify additional caching or algorithm changes. Their run-to-run variation is visible in the raw files.

## Initial JavaScript and screen loading

The production build changed from one 930.94 kB minified / 262.68 kB gzip JavaScript entry to a 548.62 kB / 159.02 kB gzip entry with 23 route screens loaded through dynamic imports. The initial entry is 41% smaller minified and 39% smaller gzip. All emitted JavaScript chunks total 952.44 kB across 58 files, about 2.3% above the former single bundle because shared modules are emitted separately. The largest route chunks include New Match at 52.47 kB / 15.04 kB gzip and Pitch at 44.33 kB / 14.81 kB gzip. The existing `StartupBoundary` handles lazy chunk render/import failures through the app recovery screen and reload action. GitHub Pages base path remains `/football-tracker/`.

The main entry remains above Vite's 500 kB warning threshold. Route splitting reduces first-load JavaScript by about 41% minified and 39% gzip, but does not remove the shared startup dependencies. Further changes to startup/auth/store dependencies need a separate measurement and regression pass.

## Quality findings

The `NewMatchScreen` manual memoization warning is tied to `finalMatchData` retaining mutable array references. The arrays and position-history entries are now copied into the memoized match value. Oxlint still reports the warning because it cannot establish immutability across those dependencies. The memo is needed because `draftCheckpoint` drives an autosave effect; removing it would schedule draft writes on unrelated renders.

The Store `snapshotRef.current` warning is on the synchronous snapshot publisher. That write keeps transaction reads current before React effects run and is required by the store's ordering guarantees. Moving it to an effect would reintroduce a stale-snapshot window. No behavior change was made to that publisher.

Rating REV13, competition rules, persisted data keys, local/cloud protocol versions, and cloud/database code were left unchanged. No Supabase schema or database operation was performed.
