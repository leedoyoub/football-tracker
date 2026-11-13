# Football Tracker v2.6.9 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent domains and test-driven-development; integrate and verify centrally. The user explicitly requests autonomous implementation through deployment without approval questions.

**Goal:** Improve Player Detail and add multi-select position/team presentation filters while preserving official results and improving measured derived calculations.

**Architecture:** Preserve React/TypeScript and existing immutable-source caches. Rank the union of selected position families before applying historical-team membership as a display filter. Keep team-internal and combination semantics intact. Extend screen state compatibly without changing football storage.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node test runner, existing Chromium/CDP fixtures.

**Spec:** User attachment `d1d0c4f0-e260-48b8-8605-751b91d23c7c/Pasted text.txt`, sections 0–14.

**Execution record:** The clean local/main baseline matched GitHub `6be9bf45`. Tasks 1–4 implementation and targeted verification are complete. Final full suite passed 1,371/1,371; TypeScript, lint (43 warnings, exit 0), production build, 16 ranking UI combinations, 36 existing UI cases, 71 swipe cases, four-width Player interactions, native storage quota and real PWA offline checks passed. Independent review found and verified fixes for tied-date streak chronology, unused-bench membership and facts-cache rating revision; final review has no Critical/Important finding. Derived benchmarks finished with exact phase hashes; remaining Records, Global, general CPU/SSR and startup measurements run serially before release commit/push.

## Global Constraints

- Preserve Rating REV13, award policy revision 3, MOM selection, official ties, saved data, PWA, draft storage and import/export.
- No new dependencies, speculative Store redesign or wholesale cache/virtualization replacement.
- Benchmark independent v2.6.8 source against current using unchanged 2/6-season fixtures; report median/p95 and exact result equivalence.
- Work in the clean current checkout as requested; preserve any subsequently appearing unrelated changes. Commit/push main and verify Pages only after checks pass.

## Review Focus

- Transfers and released players: use historical appearance team IDs in the season/competition scope.
- Legacy state: normalize scalar position/team values, fb alias, duplicates and invalid IDs on restore.
- Team toggles: retain official rank gaps, score and representative position without rerunning ratings.
- Graph scrolling: pointer drags must not navigate; keyboard activation must use the correct match ID.
- Historical edits: invalidate relevant cache results; compare every unchanged official result to independent source.

### Task 1: Ranking/filter foundation and navigation (primary)

Files: `src/components/{CompactFilterMenu,PositionFilter,TeamFilter}.tsx`, `src/engine/{positionScope,awardRacePresentation}.ts`, `src/screens/{GlobalRankingScreen,AwardRaceScreen}.tsx`, `src/{types.ts,lib/navigation.ts,lib/lastRoute.ts}`, new `src/engine/rankingPresentation.ts`, tests `v269-ranking.test.cjs` and `v269-route.test.cjs`.

- [x] Add failing union/rank-gap/historical-team and scalar migration tests, run them and confirm intended failures.
- [x] Add reusable multi-select compact menu with menuitemcheckbox roles, persistent popup and existing focus/escape/outside behavior; preserve single-select API.
- [x] Add optional positionFilters/teamIds screen fields with scalar fallback; normalize restore. Position union precedes rank; team membership follows rank.
- [x] Audit Home/competition player leaderboards and retain their existing official ordering and team-internal semantics.
- [x] Run targeted tests and TypeScript; review rendered mobile filter layout and persistence.

### Task 2: Player Detail (independent worker)

Files: `src/screens/PlayerDetailScreen.tsx`, graph component if extracted, new `tests/v269-player.test.cjs`.

- [x] Test MOM match rating blue/star and normal rating preservation, graph match identity/keyboard behavior and removal of duplicate five buttons; observe failures.
- [x] Reuse getMatchManOfTheMatch cache, preserve Rating Details and graph statistics, make graph points/labels accessible with drag suppression.
- [x] Run targeted tests; inspect Matches DOM cost without speculative virtualization.

### Task 3: Records engine (independent worker)

Files: `src/engine/{playerRecords,unitRecords}.ts`, `src/screens/recordsLeaderboards.ts`, tests/helper/benchmark files prefixed v269-records.

- [x] Reproduce eager player/combination costs; add failing selection/presentation tests.
- [x] Support optional `positionFilters: PositionFilterKey[]` in RecordsScope; preserve scalar fallback. Rank player positions before display-only team selection, including awards. Keep team and combination semantics.
- [x] Avoid unrequested leaderboard generation and reuse existing per-match facts where profiling supports it.
- [x] Compare complete unfiltered results and combination groups against independent v2.6.8; report measured wins and unchanged paths.

### Task 4: News/Latest Changes/Recap audit (independent worker)

Files: minimal confirmed bottlenecks in `src/engine/{news,latestChanges,seasonInsights}.ts` and dependencies; tests/benchmarks prefixed v269-derived.

- [x] Profile existing unchanged 2/6-season fixtures and identify duplicate computations.
- [x] Add regression/equivalence checks before minimal targeted optimization, preserving all event fields/order and official insights.
- [x] Measure cold/warm/revisit/edit median and p95 against independent v2.6.8; remove ineffective changes.

### Task 5: Integration, full verification and release (primary)

Files: Records screens, version metadata, `docs/v2.6.9-release.md`, `docs/performance/v2.6.9-*.json`, new browser tests.

- [x] Wire multi-select Records screens and leaderboard route forwarding to the shared components/engine fields.
- [x] Run complete tests, TypeScript, lint, production build, diff check and official-result comparisons.
- [x] Run browser UI at 320/375/390px and desktop, graph navigation/drag/back, filters/keyboard/persistence, runtime error collection. Reuse production fixture; do not bypass 6-season quota limitations.
- [x] Audit Home/Matches with existing browser harness; only optimize observed rendering bottlenecks.
- [x] Obtain fresh code review, fix meaningful findings, record limitations and performance evidence.
- [ ] Update 2.6.9 metadata and version assertions; commit verified changes, push main, inspect Pages workflow and actual deployed version.

## Recovery verification (2026-11-13)

All existing work preserved; no new feature source changes were necessary. Fresh suite 1,371/1,371; TypeScript, lint (0 errors, 44 warnings), build, ranking UI 16, Player 4 widths, existing UI 36, swipe 71, native storage and actual offline reload passed. Independent audit: Critical/Important/Minor/declined all zero. Global, CPU/SSR, restored-combination and serial startup benchmarks complete. Evidence and limitations are in docs/v2.6.9-release.md and docs/performance/v2.6.9-verification.json. The external push/deployment checkbox remains pending in this pre-commit document; actual results are verified in the matching Actions run and final task report, without creating a duplicate release commit.
