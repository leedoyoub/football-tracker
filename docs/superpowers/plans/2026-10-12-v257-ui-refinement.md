# Football Tracker v2.5.7 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with one final independent review.

**Goal:** Apply the user's five UI refinements while preserving v2.5.6 calculations, scopes and storage.

**Architecture:** Extend existing RankingMetricTabs with navigation sizing and an optional fixed item. Team Matches passes an explicit team perspective to the shared result derivation and renders existing ResultCard. Scope and navigation state remain unchanged; the existing range input receives scoped dark-theme CSS.

**Tech Stack:** React, TypeScript, Tailwind/CSS, Node test runner. No dependencies.

**Spec:** ../specs/2026-10-12-v257-ui-refinement-design.md (user's final design and instruction to implement, verify and deploy).

## Global Constraints

- Only the five specified UI areas and Rank Trend's initial selection change.
- Top League/Cup/Champions buttons, existing SegmentedControl, Home cards and Results/Competition result output stay unchanged.
- Keep REV13, official competitions/awards, Last5, scope rules, selectors/caches, football-tracker-v1 and schemas.
- Competition and season selection stay single-select; no new filters or statistics.
- Work in the clean main checkout and push origin/main after verification, as requested.

## Review Focus

- Team viewing a League/Cup opponent must receive its own reversed score; Champions must retain recorded-team ownership.
- Duplicate matches must be removed without changing canonical ordering or mutating records.
- Navigation tabs and metric tabs must share appearance without globally resizing other controls.
- Pinned Total must not trigger scrolling beyond the stage container.
- Player scope must preserve each entry route and Back; changing season/scope still resets the metric to rating.

### Task 1: Shared buttons, Team perspective and player scope

**Files:** src/components/RankingRow.tsx, src/lib/results.ts, src/screens/TeamDetailScreen.tsx, src/screens/CompetitionScreen.tsx, src/screens/PlayerDetailScreen.tsx, src/index.css; tests/v257-ui-refinement.test.cjs and directly affected existing rendering tests.

**Interfaces:** RankingMetricTabs<T> adds optional size='metric'|'navigation' and pinnedOption?:{value:T,label:string}; derivedResults(matches,teams,perspectiveTeamId?) returns the same recorded-team results when the optional parameter is omitted.

- [x] Write tests first for compact/metric size, single selection, horizontal scroll/focus, fixed Total, recorded/default versus explicit home/away perspective and no mutation.
- [x] Add screen tests for Team Results count/order/filter/navigation, menu independence, native MD range value/handler, Player route scope/metric resets and Rank Trend Overall/Position/Team data.
- [x] Run focused tests and inspect expected failures.
- [x] Extend RankingMetricTabs; retain metric styling for all existing callers, add navigation size only to Competition menus, and pin Total outside the scroll area.
- [x] Add explicit team-perspective result derivation, preserving the old default branch and canonical score/ownership. Render ResultCard only in Team Matches and preserve its scope/ordering/empty state.
- [x] Keep the season dropdown, replace Player competition dropdown with four metric pills, and change Rank Trend initial state to overall.
- [x] Scope dark range CSS to League History with WebKit/Firefox track/thumb/focus styles; preserve min/max/value/handlers.
- [x] Update obsolete markup expectations without deleting any existing tests; run focused and full suites.

### Task 2: Verification, version and deployment

**Files:** package.json, package-lock.json, src/config.ts, existing release metadata tests, tests/v257-performance.bench.cjs, docs/performance/v2.5.7-*.

- [x] Bump metadata to2.5.7 after implementation verification.
- [x] Run npm.cmd test, npm.cmd run lint, npm.cmd run build, git diff --check.
- [x] Re-run the v2.5.6 benchmark with7 alternating samples against e4ee68f; compare lint warnings with its baseline.
- [x] Audit all changes and get the single final independent review required by executing-plans/requesting-code-review.
- [x] Commit as style: refine competition navigation and match cards (v2.5.7), push origin/main, verify Actions and public2.5.7 assets.
- [x] Record test count, new tests, files, performance, commits, deployment and actual-browser limitations.

## Execution Record

- Start: clean main at e4ee68f3ab35e2a0d308672b313a149f1d0da0b9, version2.5.6, existing871 tests.
- User supplied the final design and explicitly requested implementation through deployment; proceed within that scope without additional design approvals.

- Completed implementation: initial failing focused tests, shared component changes and obsolete markup expectations updated; final 2.5.7 suite 885/885 passed (existing871 + new14).
- Final lint:45 existing warnings,0 new; TypeScript/Vite build passed; git diff --check passed.
- Baseline results equivalence: archived e4ee68f independent graphs and all16 perspectives passed. Benchmark20 paths ×7 samples, plus idle selected5 paths ×7; timings have noise and Chemistry revisit increase, recorded without claiming zero regression.
- Independent final review approved: Critical0 / Important0 / Minor0, reviewer independently ran14 new tests.
- Browser inventory empty; actual mobile/touch/WebKit/Firefox appearance unverified.
- Implementation committed as0933b8dd9579da55547bafd90b319c20feb0bc7e and pushed origin/main. Actions38230852600 build/deploy completed successfully.
- Public HTML and referenced index-DzRHLyaG.js returned HTTP200, declared2.5.7 at2026-10-12T09:37:37Z. Evidence recorded in docs/performance/v2.5.7-pages.json and report.
