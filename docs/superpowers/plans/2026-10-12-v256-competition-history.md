# Football Tracker v2.5.6 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session. Steps use checkbox syntax for tracking.

**Goal:** Unify competition menus and make recorded matches and historical Cup tables available without changing official competition rules.

**Architecture:** NavigationEntry owns independent competition menus and filters. Read-only match and Cup presentation models reuse canonical identities, chronology, result derivation and official engine rankings. Players panels mount only in Players; existing selectors and caches remain authoritative.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner; no additional dependencies.

**Spec:** ../specs/2026-10-12-v256-competition-history-design.md (user's final specification and authorization to implement, verify, commit, push and deploy).

## Global Constraints

- Preserve Rating REV13, official standings, elimination and Champions rules, awards and Best XI.
- Preserve football-tracker-v1, Match schema, Draft, Import, disabled Cloud Sync and v2.5.5 caches.
- League Form intentionally changes from 3 to 5 matches. Every other engine output remains equivalent.
- Home's existing compact five cards remain visually unchanged.
- Work in the clean main checkout; push origin/main only after all checks pass.

## Review Focus

- Old form and cupViewAll routes migrate safely; malformed nested states use defaults.
- A logical opponent must not become a recorded-team filter result; historical transfers remain visible.
- Completed Cup stages retain stage-only participant statistics and no future elimination information.
- Final ties and replays reuse official decisions, including completed historical Final views.
- Back, season switches, edited/deleted matches and position-chart focus preserve or reset the correct state.

### Task 1: Read-only models and navigation

**Files:** src/lib/competitionScreenState.ts, src/types.ts, src/lib/navigation.ts, src/lib/lastRoute.ts, src/App.tsx, src/lib/competitionResults.ts, src/lib/cupTable.ts, src/engine/competition.ts, src/engine/seasonAnalytics.ts; tests/v256-competition-history.test.cjs.

**Interfaces:** competitionMenu(state), normalizeCompetitionScreenState(saved, base), resetCompetitionSeasonState(state); competitionResults(matches, teams, season, type, filters), leagueMatchdayResults(matches, teams, season, day); cupTableModel(teams, matches, season, players, cup, selection).

- [x] Add failing tests for menu defaults/migration, independent filters, recording ownership, canonical stages, newest order and stable MD insertion order.
- [x] Add failing Cup tests using official generated stages: 16 rows, stage-only participant stats, frozen previous eliminations, completed-stage statuses, no future leakage, cumulative Total and replay.
- [x] Add Last 5 assertions with six League matches, fewer than five, foreign competitions and seasons.
- [x] Run the focused tests and inspect the expected failures.
- [x] Implement models and navigation defaults/restoration; expose existing stageRanking without modifying its implementation; update Form's limit.
- [x] Run the focused tests. Preserve full-object engine equivalence except independently assert the intentional Form change.

### Task 2: Competition and result UI

**Files:** src/screens/CompetitionScreen.tsx, src/components/CompetitionMatches.tsx, src/components/ResultCard.tsx; tests/v256-competition-ui.test.cjs, existing UI expectation tests affected by removed controls.

**Interfaces:** CompetitionMatches receives season/type, independent filters and onNavigate; ResultCard remains shared by ResultsScreen and CompetitionMatches.

- [x] Add rendering checks for shared ResultCard metadata, independent team/match actions, long-name layout and no opponent icon.
- [x] Implement independent Players/Table/History/Matches or Players/Bracket/Matches menus with the specified defaults.
- [x] Mount ranking/award/Best XI only in Players. Render Overall/Form Last 5 under Table, MD Results as four compact columns, and persist chart focus.
- [x] Render Cup Stage/Total selector (Total fixed), full 16 rows, official historical status and normal Total rows.
- [x] Render common Matches filters and shared full ResultCard. Preserve Home and Champions bracket markup.
- [x] Update obsolete preview/UI tests to assert the new specified behavior; run focused tests and build.

### Task 3: Release verification and deployment

**Files:** package.json, package-lock.json, src/config.ts, release metadata tests, docs/performance/v2.5.6-report.md.

- [x] Bump synchronized metadata to 2.5.6 and update metadata expectations without weakening invariants.
- [x] Run npm.cmd test, npm.cmd run lint, npm.cmd run build and git diff --check; inspect outputs.
- [x] Re-run the v2.5.5 benchmark on its 16-team, 23-player, two-season fixture; compare unchanged engine paths and cached revisits.
- [x] Review the entire diff and obtain the final independent review required by executing-plans.
- [x] Commit the verified changes, push origin/main, inspect Actions/Pages and verify the deployed version from public assets.
- [x] Record commit, deployment evidence, test count, benchmark results and any unresolved limitation.

## Execution Record

- Initial state: main, HEAD 7d076a6a6cae8e86b503b5de357c496c3ae96b3c, clean working tree, version 2.5.5.
- Baseline suite started with npm.cmd because PowerShell blocks npm.ps1.
- User supplied a final design and explicitly requested the complete implementation/deployment workflow; additional design approvals are unnecessary within that scope.

- Tasks 1 and 2 complete: RED/GREEN tests for models and ResultCard; baseline 848/848, full implementation 869/869 before metadata bump; independent equivalence passed.
- Final review complete: no Critical/Important findings; automatic History focus reload finding fixed with RED/GREEN regression. Rating-revision cache invalidation restored with RED/GREEN regression.
- Benchmark complete: 7 alternating samples on all20 v2.5.5 paths; raw evidence in docs/performance/v2.5.6-benchmark.json. Lint baseline/current45 each; new0.
- Browser unavailable: empty inventory, IAB creation unsupported; rendering/handler tests used, real mobile/touch/PWA checks remain unverified.

- Task3 complete: final2.5.6 suite871/871 (new23), lint exit0/existing45/new0, build exit0, git diff --check exit0. Code commit12018202de0ab407f2c32f61094b60379b5c59ef pushed to origin/main. Actions38210720520 success; public HTML and index-DDdeoQON.js HTTP200/version2.5.6 verified2026-10-12 15:05KST. Follow-up records commit contains documentation/evidence only.
