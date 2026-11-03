# v2.6.6 Competition Awards UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans and test-driven-development. This is the user's already specified and authorized two-change patch.

**Goal:** Remove Cup stage XI analysis and let one League Awards selector control both Race and XI.

**Architecture:** Preserve v2.6.5 award evaluation, event publication, Race sorting and pitch components. Change only the Competition presentation, the existing League scope default/normalization and obsolete Cup XI state/helper. Keep generic stage/replay helpers that have other consumers.

**Tech Stack:** Existing React/TypeScript/Vite, node:test and isolated Chromium probe; no dependencies.

**Spec:** User attachment `eef5efff-116f-4446-93bb-0bdf455ee3ba/Pasted text.txt` (2026-11-03).

## Global Constraints

- Base/local/remote main: 5347394, v2.6.5; initially clean.
- Do not change award formulas, AWARD_POLICY_REVISION=3, RATING_ENGINE_REVISION=13, Team History, MOM, match/roster/storage/sync or competition rules.
- Reuse AwardRacePanel, AwardBestXI, SegmentedControl and existing navigation.
- No new persisted state field; old Cup XI fields are ignored on read. Valid stored half selections survive; absent/invalid scopes fall back to League.
- Increase PATCH exactly once, after implementation verification, to 2.6.6; commit/push main without force; verify Pages workflow and public assets separately from browser UI.

## Audit

LeaguePlayers currently renders full League Race unconditionally and a second half Race inside its XI section. Both use shared existing evaluation but are controlled differently. Retain full League individual stat awards and use one selected canonical result for the unified Race/XI. Review caught that the general League table model can include retained legacy teams: it is not interchangeable with the official scope model. Preserve the existing scope evaluator for all three tabs and share its result between Race and XI.

Cup stage-specific work resides in CompetitionBestElevens, AwardScopeSelector, bestXiMode/cupAwardStage state and startedCupAwardStages. performanceAwardResult remains used by lazy analytical compatibility paths in seasonAnalytics and rating regression tests, so it stays unchanged. matchesForAwardPeriod is a shared stage/final-replay utility and stays. Cup progression/table/filter stage fields stay.

## Review Focus

- Missing/invalid old selectors must produce League; explicit v2.6.5 First/Second Half values must survive old bestXiMode fields.
- Season reset and player/Race round trips must retain a valid selected scope.
- Race and XI must receive the same canonical object/candidates, including empty and provisional periods.
- Restoring old Cup period/stage choices must never trigger hidden performanceAwardResult work or hide official Cup/stat awards.
- All evaluation, publication and pitch sources must remain identical to v2.6.5; responsive controls must retain their existing treatment.

## Tasks

### 1. Pin requirements

- [x] Add failing regression cases for one League Awards section/Race, three scopes, default/restoration/reset/navigation, Top 5/View All and Cup no-stage-computation.
- [x] Add a protected-source check against 5347394 for official scoring/events, Team History and shared pitch/race implementations.

### 2. Minimal implementation

Files: CompetitionScreen.tsx, competitionScreenState.ts, lastRoute.ts, types.ts, awardScopes.ts; affected UI tests only.

- [x] Remove Cup XI period UI, state and exclusive started-stage helper; keep shared analytics and general Cup stages.
- [x] Consolidate League Race/XI under one First Half / Second Half / League selector, default League, preserving full League stat awards.
- [x] Normalize missing/invalid scope to League and preserve valid values through navigation/season changes.
- [x] Update only superseded presentation/state assertions and run focused regression.

### 3. Verify and release

- [x] Run full tests, lint, build, diff/source audit and isolated Chromium rendering at 320/375/390px where available.
- [x] Bump PATCH once, align exact version assertions; rerun final full checks after the review fix and add release notes.
- [ ] Stage only this task, commit/push main, verify Pages workflow and HTTP assets; report actual validation limits in Korean.
