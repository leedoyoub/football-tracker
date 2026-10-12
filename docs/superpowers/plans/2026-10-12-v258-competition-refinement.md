# Football Tracker v2.5.8 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline and one final independent review.

**Goal:** Implement the four specified UI refinements with moving provisional Cup survival status and unchanged official rules.

**Architecture:** Add a scoped award-size variant to RankingMetricTabs; retain the multi-select League History buttons and change only their size. Project current incomplete Stage 1–7 from cup.standings/cup.rows and credited stageMatches. Keep official engine, historical Stage/Final/Total branches unchanged. Dim only the identity wrapper of a confirmed pairing loser.

**Tech Stack:** React/TypeScript, existing Node test runner, CSS utilities; no dependencies.

**Spec:** ../specs/2026-10-12-v258-competition-refinement-design.md (user's complete implementation and deployment instruction).

## Global Constraints

- Base 53ea649b56741e7f50954e61023a19f65982f2e4; final version 2.5.8, Rating REV13 unchanged.
- No official comparator/advancement/elimination/draw/winner changes; no storage/schema/cloud/PWA/navigation changes.
- Keep 16 Cup teams, previous eliminated ranks/snapshots, completed historical state and neutral Total.
- Reuse existing immutable selector/cache lifecycle; edits/deletes provide new official Cup objects.
- Keep League comparison multi-selection (max 4), focus/plot/Back; graph focus buttons unchanged.
- Existing clean main checkout and origin/main deployment are authorized by the user's final spec and prior workflow.

## Review Focus

- Nonparticipant/other-scope records, duplicate owners and odd credited counts must not fabricate risk teams.
- A played loser must precede an unplayed 0-point team, with consecutive display ranks and no official mutation.
- Engine auto-advancement must make completed Stage history official, not provisional; later elimination must not leak backward.
- Replay/Total and partial Champions series must retain existing styles and decisions.
- Scroll refs measure local offsets; pinned Total never scrolls the page, other variants stay unchanged.

### Task 1: Projection and UI

**Files:** src/lib/cupTable.ts, src/components/RankingRow.tsx, src/screens/CompetitionScreen.tsx; tests/v258-cup-refinement.test.cjs and tests/v258-competition-ui.test.cjs.

**Interfaces:** CupDisplayRow adds 'not-played' state; CupTableModel adds optional provisional boolean only on incomplete regular stages. RankingMetricTabs size accepts 'award' in addition to 'metric'/'navigation'. No engine signatures change.

- [x] Write model tests: P=0,1,2,3,4,5,6/all; played-first official order; sequential rank; 16 rows; previous elimination snapshots; no mutation; scope/legacy/duplicate owners; immutable edit/delete invalidation; cache hits; completed Stage 1/2/7/draw/history; Final/Replay/Total protection.
- [x] Write rendering/handler tests: League 16 small pills/max4/deselect/focus/scroll restoration; award-size Stage labels/IDs/default/history/Total/season reset/local scroll; survival line exactly once for each P and none for Final/Total; confirmed versus pending Champions identities on each round without score/card dimming.
- [x] Run node --test tests/v258-cup-refinement.test.cjs tests/v258-competition-ui.test.cjs. Expected: failing assertions for missing provisional model/size/dimming.
- [x] Implement UI projection from existing official ordering and credited current-stage IDs, risk=min(2,P), Not Played neutral, eliminated snapshots untouched. Suppress provisional eliminationDrawTeamIds.
- [x] Implement scoped award variant, selector-only labels s1–s7/Final/Replay/Total; History sizing only; confirmed loser wrapper opacity-60.
- [x] Run focused tests, update only obsolete existing UI expectations if necessary. Expected: all pass.

### Task 2: Equivalence, release and deployment

**Files:** tests/v258-equivalence.test.cjs, tests/v258-performance.bench.cjs, package.json, package-lock.json, src/config.ts, current release assertions, docs/performance/v2.5.8-*.

- [x] Archive independent v2.5.7 baseline; compare official engines/results/awards/rankings and all unchanged completed/history/final/total projections; assert all inputs unchanged. Run focused equivalence, expected pass.
- [x] Run npm.cmd test (expected all existing 885 tests plus new tests pass), npm.cmd run lint (expected exit 0, no new warnings), npm.cmd run build (expected TypeScript/Vite success), git diff --check (expected exit 0).
- [x] Run existing 20-path benchmark sequentially after test/build against 53ea649, 7 alternating samples; record timing uncertainty, cache/guard evidence and baseline lint comparison.
- [x] Update version metadata/assertions to 2.5.8 and rerun full release commands. Audit product diff and independent review; fix any Important/Critical findings with RED→GREEN and full suite.
- [ ] Commit feat: refine cup survival line and competition UI (v2.5.8); push origin/main; verify Actions build/deploy and public JS version.
- [ ] Record implementation, test count, performance, changed files, SHA/Actions/Pages and actual-browser limitations; commit/push docs and verify clean final remote state.

## Execution Ledger

- User supplies final detailed design and expressly authorizes implementation through deployment; proceed inline without another approval round.
- Windows adaptation: task logs and interim ledger use the already ignored .superpowers/v255/v258 directory; avoid adding unrelated .gitignore configuration for shell-specific workflow scripts.
- Pre-flight shared interface: Task 1 produces optional provisional flag / not-played state, Task 2 compares changed current incomplete projection by specification and unchanged completed/final/total projection exactly to baseline.
- Pre-flight variant: award changes only Cup selector call; metric/navigation and multi-select History functionality stay unchanged.
- Task 1: complete; RED 25 failed assertions / 5 existing protection tests passed, GREEN 30/30; additional cache/nonparticipant protection and independent baseline brought focused total to 36/36. Old affected suites 40/40 passed without assertion changes.
- Baseline 885/885; pre-release full suite 921/921 passed. Product edits confined to 3 files; official engine and storage untouched. Metadata now 2.5.8; final release commands running.
- Build verification adaptation: PowerShell stderr redirection treated existing Vite warning as NativeCommandError; same build through cmd.exe returned exit 0. No product change needed.
- Browser inventory apps/browsers empty; actual mobile/touch/paint remains unverified.
- Final 2.5.8 suite 921/921, lint exit 0 (45 existing / 0 new), TypeScript/Vite build exit 0, git diff --check exit 0.
- Independent final review approved: Critical/Important/Minor all 0. Reviewed 32 directly run UI/model tests plus retained equivalence 4/4 and final suite.
- Benchmark 20 paths x 7 alternating samples completed after test/build/reviewer execution; selected 4 paths x 7 recheck preserved separately. Initial cold Ranking/League and revisit Chemistry increases did not repeat. No absolute zero-regression timing claim.
- Final review limits: no live mobile browser; root verifies timing/deployment; existing lint/bundle warnings retained; immutable cache inputs and existing team-count contract retained as specified.
