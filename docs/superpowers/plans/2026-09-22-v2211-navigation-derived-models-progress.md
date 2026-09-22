# SDD ledger — plan: docs/superpowers/plans/2026-09-22-v2211-navigation-derived-models.md

Setup: user explicitly approved native execution in the current local working tree on main; no worktree and no commits are permitted.
Setup ruling: bundled sdd-workspace/task scripts require Bash, which is unavailable; maintain this equivalent ledger manually and verify each stage with direct npm commands. Cost if wrong: workflow metadata differs, application behavior is unaffected.
Pre-flight: Task 3 PositionFamily feeds Tasks 4/6/8; Task 5 rating revision feeds Tasks 4/8/10; Tasks 1/2 screen state feeds Tasks 4/7/9; Task 6 Player Records feeds Task 8; Task 8 event model feeds Task 9. Revised spec resolves all interface ordering conflicts via mandatory sequence 3 → 5 → 1 → 2 → 4 → 6 → 7 → 8 → 9 → 10 → 11.
Ruling: user prohibition on commits overrides executing-plans commit/task-done mechanics; stage completion is recorded with fresh test commands and uncommitted diffs. Cost if wrong: no per-stage git commit rollback points.

## Stage 1 - Task 3 historical position groundwork

Status: complete.

- Added canonical credited-minute `PositionFamily` and award-family derivation for a season/team scope.
- Normalized LAM/RAM to CAM and fullback variants to the shared FB filter family.
- Global ranking position filters now select the historical eligible pool before ranking rather than reading current registration.
- Focused verification: 16/16 passing across global rankings, position timeline, and new v2.2.11 position-scope tests.
- Integration check: `npm.cmd run build` passed (existing bundle-size warning only).

## Stage 2 - Task 5 rating revision 9 and Match Detail rating behavior

Status: complete.

- Bumped app/package metadata to 2.2.11 and `RATING_ENGINE_REVISION` to 9; `football-tracker-v1` remains untouched.
- Applied only the approved v9 `POSITION_RULES` coefficient changes.
- Added canonical one-pass Match Detail appearance ordering: rated first, exact raw descending, player-ID tie-break, unused last.
- Wired real historical Starting XI Pitch slots to Player Detail; empty slots remain inert.
- Updated legacy rating expectations only where revision 9 intentionally supersedes revision 8.
- Focused rating/Match Detail and integration build passed.
- Full checkpoint: `npm.cmd test` passed 390/390.

## Stage 3 - Task 1 root navigation primitives

Status: complete.

- Replaced root `View[]` plus separate scroll storage with typed `NavigationEntry[]` (`view`, `screenState`, `scrollTop`).
- Added immutable create/push/snapshot/pop/replace/reset helpers and complete BACK TO TEAM pop/replace target semantics.
- Added centralized defaults covering Match, League, Global Ranking, Records, History, comparison, and Team Detail restoration fields.
- Last-route persistence still serializes only `View`; navigation state remains ephemeral.
- State is rendered before scroll is restored in a layout effect.
- Focused navigation/last-route verification: 8/8 passing; build passed.

## Stage 4 - Task 2 controlled screen state and navigation semantics

Status: complete.

- Migrated Home, Competition, Global Ranking, Records/History, Team Detail, Players, Player Detail, and Match Detail drill-down state into the active `NavigationEntry.screenState`.
- Removed the prior route-shaped Home/League/Team memory maps; Back now restores exact entry state and scroll without per-screen fallback maps.
- Converted visible Back controls to stack pop semantics and durable editor completion to replace semantics.
- Implemented exact BACK TO TEAM behavior: pop only when the immediately previous entry is the same Team Detail, otherwise replace the current Match entry.
- Focused navigation and screen integration verification passed 98/98; four stale source-contract assertions found by the full checkpoint were updated to the approved controlled/replace semantics and passed 37/37 on rerun.
- Integration build passed; the full suite reached 391/395 before those four expectation-only corrections.

## Stage 5 - Task 4 active/finalized monthly awards and historical Best XI

Status: complete.

- Added `activeMonthlyAwards`, selected from the block containing the highest recorded League matchday; finalized `monthlyAwards` remains history/News-only.
- Monthly and competition award Best XI selection now uses canonical credited historical position families, while slot team identity remains the appearance-time team.
- Season/historical Best XI selection no longer reads current registration position.
- Made `AwardBestXI` permanently expanded and reused it in Records History with Player Detail navigation.
- Added rating revision to History read-model cache keys.
- Focused award/rating/presentation verification passed 85/85; build passed.

## Stage 6 - Task 6 Cup rows and canonical Player Records

Status: complete.

- Cup rows now show current-stage totals for survivors and immutable cumulative-at-elimination snapshots for eliminated teams.
- Added the engine-level `buildPlayerRecordLeaderboards` catalog with stable IDs and shared occurrence semantics, including Matches Scored In, Braces (2+), Hat-tricks (3+), rating thresholds, clean sheets, saves, streaks, and single-match records.
- Records UI now projects the canonical engine rows and no longer recomputes player record formulas.
- Zero-value occurrence rows are omitted, expanded player leaderboards are uncapped, and team GA-per-match excludes teams with no qualifying games and follows Clean Sheets.
- Focused Cup/Records/competition verification passed 46/46; build passed.

## Stage 7 - Task 7 active View All scroll behavior

Status: complete.

- Floating controls now mount only for an active long Records leaderboard, a full Global Ranking list, or an expanded Competition ranking.
- The control observes its active section and returns to that section heading rather than resetting the whole app container; unrelated News scrolling retains its existing app-surface behavior.
- Competition expanded rankings now render the complete prepared list rather than retaining a 50-row cap.
- Focused verification: 2/2 passing in `tests/v2211-scroll-view-all.test.cjs`; existing scroll regression coverage remains targeted for the final suite.
- Integration check: `npm.cmd run build` passed (existing bundle-size warning only).

## Stage 8 - Task 8 canonical News and Match Changes

Status: complete.

- Added ephemeral `EventSurface` and Match Change payload contracts, `deriveFootballEvents`, explicit major-News projection, and identity/revision-safe `matchChangesForMatch` grouping. No raw Match history, durable storage, or News cache persistence changed.
- Major Home News is an explicit event-surface projection; detailed ordinary player contributions are Match Changes. Existing canonical award, title, milestone, rare-performance, and streak derivations remain source data for the projection.
- The transition index now calculates participant-only before/after movement for Rating, Goals, Assists, G+A, and MOM across global and team Player Ranking identities, plus the canonical non-duplicative Player Records identities. It emits Top 10 entry/re-entry, every upward movement, and #1 takeover only; unchanged, downward, and nonparticipant movement is omitted.
- Focused Task 8 verification: 23/23 passing across Match Changes, surface, milestone, and existing News suites.

## Stage 9 - Task 9 projection UI wiring

Status: complete with the available canonical event model.

- Home uses `majorNewsEvents(..., season).slice(0, 4)`; View All uses the same selected-season projection with no row cap.
- Match Detail consumes cached grouped Match Changes and no longer slices a broad News feed to six rows.
- Focused News UI and event-surface tests passed; build passed.

## Stage 10 - Task 10 cross-cutting scope/cache audit

Status: complete.

- Team-scoped Global Ranking now suppresses overall-league movement rather than displaying an invalid delta.
- Existing identity/revision cache contracts remain in place; Match Changes adds its own identity-keyed cache and new-match collection identities invalidate it naturally.
- Focused Task 10 verification: 14/14 passing across performance, navigation, Match Changes, history-cache, and rating-cache regressions; build passed.

## Stage 11 - Release verification checkpoint

Status: complete.

- Final `npm.cmd test` passed; `npm.cmd run lint` completed with existing warnings only; `npm.cmd run build` passed with the existing bundle-size warning; `git diff --check` passed.
