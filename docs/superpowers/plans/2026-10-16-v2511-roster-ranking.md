# Football Tracker v2.5.11 implementation plan

Baseline: c278609c65660a6aa915aa1b7210461994512992. The user's supplied v2.5.11 request is the specification and authorizes implementation, independent review, commit, main push and Pages deployment.

## Global constraints

Keep REV13, canonical statistics, competition and award rules, durable storage, IDs and sync policy unchanged. Use existing `.app-content` scrolling. Never read or modify real browser user data during measurements. Record Node/SSR measurements as CPU evidence, not mobile FPS or browser input latency.

## Task 1 — Positions Played

- Add screen regressions for positive minutes below 10%, below 1%, rounding below 0.1%, zero-minute exclusion, empty scope, normalization and season/competition scope.
- In `PlayerDetailScreen.tsx`, filter on minutes > 0, sort descending minutes and format shares with one decimal or `<0.1%`. Retain `derivePlayerScope` and timeline rules.
- Share competition options with Team Detail in `lib/competitionOptions.ts`.
- Run focused tests; record red and green evidence.

## Task 2 — Team Players competition

- Add `playersCompetition: CompetitionType | 'all'` to team screen state, default and last-route normalization. Invalid/missing legacy values restore to All.
- Reuse `RankingMetricTabs` above Latest XI. Keep Overview and Matches scopes independent.
- Filter only competition before `teamBestEleven`; retain its season, team and kickoff selection. Calculate statistics with `playerSeasonStats(..., activeSeason, teamId, competition)` for the union of current roster and historical starters.
- Bench is the current roster minus selected XI. Empty competitions still show the entire current roster. Preserve historical starter IDs and tactical coordinates.
- Move existing Roster Management section below Bench. Preserve actions and style.
- Test each scope, unequal match counts, transfers/releases, opponent matches, empty competition, state persistence and Back.

## Task 3 — Global Ranking rendering

- Measure independent baseline/current engines and full screen SSR with synthetic 367-player histories; include first and repeated metric selection, League movement and filtered scopes.
- Add a small viewport window component driven by `.app-content`, with measured row height, viewport dimensions, overscan and full-height spacers. Stable player IDs and absolute ranks; all results remain in canonical rows.
- Read scroll geometry on mount, passive scroll and resize, with cleanup. Recompute after result changes and browser scroll clamping. Preserve Back restoration and avoid scroll resets.
- Add pure range tests and simulated DOM lifecycle tests for top/middle/end, fast scrolling, short/empty results, resize, cleanup and navigation. Extend independent full-object ranking equivalence to v2.5.10 across all metrics and scopes.
- Memoize App season derivation on matches and competitionStates. Audit horizontal tab visibility and League analytics; change only measured bottlenecks.
- Re-measure identical workloads and DOM structure; report browser limitations explicitly.

## Task 4 — Release

- Request an independent code review of the full diff and resolve material findings with regression tests.
- Run full tests, lint, build and diff check; compare warnings with baseline.
- Update package/lock/config and version assertions to 2.5.11, retain REV13.
- Write `docs/releases/v2.5.11-report.md`, including measurements, bundle sizes, review, verification and deployment status.
- Commit, push origin/main without force, inspect Actions build and Pages deployment, verify public 2.5.11 assets and local/remote HEAD, ensure clean working tree.

## Review focus

1. Missing historical players must not inherit another competition's kickoff rating.
2. Row geometry and restored bottom scroll must stay valid when metric result counts shrink.
3. Empty competition must keep the current Bench roster.
4. Navigation state must survive tabs, Player Detail Back and legacy route restoration.
5. Every canonical ranking row must remain reachable despite bounded rendered rows.

## Progress

- Context: baseline clean; no repository AGENTS.md found. Baseline full suite and lint started.
- Execution: inline implementation; independent reviewer at final audit, as requested.
- Task 1: complete. Positive positions/one-decimal shares and shared options; focused red/green tests passed.
- Task 2: complete. Competition state, canonical kickoff and all starter/Bench stats; empty roster scope, route restore/Back, weighted individual-match average and recorded-team regressions passed.
- Task 3: complete. Viewport-based windowing, measured row geometry and cleanup, App season memo, filtered League analytics skip. Independent full ranking equivalence passed. Production benchmark final isolated run follows all other CPU work.
- Task 4: verification passed: 1,050/1,050 tests, lint 43 existing warnings/0 new, TypeScript/build success, diff check success. Independent reviewer examined full diff and final deltas: no critical/important findings. Browser inventory empty; actual device/React commit/paint and native scroll clamp remain unverified.
- Release code commit: 4132542aa1c41dd017de09dd18ffc0c70481f55d pushed to origin/main. Actions run 38861567876 build/deploy succeeded. Public HTML/entry JS HTTP 200 and 2.5.11 confirmed. Deployment evidence is saved in docs/performance and the release report; follow-up documentation commit preserves this evidence.
