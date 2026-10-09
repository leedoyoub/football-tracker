# 4차 Log Match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 신규 경기, Draft, 과거 경기 편집에서 player ID 및 roster 이동을 보존하고 안전한 경기만 최신 Store state에 확정한다.

**Architecture:** 작은 순수 lineup-domain helper가 현재 roster와 편집 그룹 불변조건을 관리한다. `NewMatchScreen`은 이를 표시하고, restore 경계는 partial Draft 및 historical references를 보존한다. 마지막 경기 저장은 최신 coordinator snapshot에서 League slot 중복을 원자적으로 거부한다.

**Tech Stack:** React 19, TypeScript 6, existing Store transactions, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-4-log-match-design.md`

## Global Constraints

- 기존 경기 ID, 선수 ID, `football-tracker-v1`, Rating REV13, League·Cup·Champions 규칙, GK 제약 및 90분 상한을 유지한다.
- 2차 transaction coordinator, Import 원자성, Draft generation fence 및 3차 cloud protocol을 유지한다.
- 최근 선발에서 현재 소속이 아닌 선수는 신규 경기에서 제외하고, 기존 경기 기록에서는 제거하거나 다른 ID로 치환하지 않는다.
- Draft는 incomplete XI를 허용하고, kickoff/final match만 exact XI validation을 적용한다.
- Supabase DB/migration, 배포, commit/push, 5차 이후 범위는 건드리지 않는다.
- 테스트를 삭제하거나 기존 회귀 조건을 약화하지 않는다.

## Review Focus

- 최근 XI의 이적/방출 ID는 과거 Match를 바꾸지 않고 새 경기의 해당 slot만 비운다.
- 빈 slot, Available, Bench 교환이 중복·누락 없이 고정 point-in-time roster partition을 만든다.
- 10명 Draft와 벤치/대기 상태는 restart 후 보존되지만 Continue는 11명·GK 검증을 지킨다.
- 킥오프 확정 뒤 Back, 재시작, 0 event 상태에서도 lineup 잠금이 유지된다.
- 과거 팀에서 이탈한 참가자와 dangling legacy ID의 출전/이벤트/history는 편집·저장 중 보존된다.
- 두 연속 저장이 같은 League 팀/시즌/MatchDay면 두 번째만 거부되고, 같은 ID 편집과 다른 팀 슬롯은 정상 동작한다.
- 90+5 이벤트, 90분 credited time, save/GK/tactical history와 cloud validation 경계가 유지된다.

---

### Task 1: Matchday lineup domain invariants

**Files:**
- Create: `src/lib/matchdayLineup.ts`
- Modify: `src/screens/matchLineup.ts`
- Modify: `src/engine/recentLineup.ts` if the existing call boundary benefits from an explicit partial projection.
- Test: `tests/matchday-lineup.test.cjs`, `tests/new-match.test.cjs`, `tests/audit/phase1-risk-repros.test.cjs`

**Interfaces:**
- `matchdayGroups(roster: Player[], lineup: Lineup): { starters: string[]; bench: string[]; available: Player[] }` returns stable unique, eligible IDs and does not mutate the input.
- `sanitizeRecentAssignments(assignments: Record<string,string>, roster: Player[]): Record<string,string>` preserves only known tactical slots and current roster IDs, with at most one assignment per player and at most eleven slots.
- `moveLineup` rejects a result with more than eleven starters, more than twelve bench players, duplicate IDs, or unknown tactical slot IDs; failure returns the same input reference.

- [x] Write failing tests for the 23-player scenario (remove one of 11 starters, add replacement; expect 10/12/1), bench promotion (11/11/1), available-to-bench, starter/bench swap, starter-slot exchange, duplicate move, and a twelfth starter.
- [x] Write failing test that recent XI filtering leaves a released/transferred player’s slot empty without mutating the saved match and allows a newly registered player to remain Available.
- [x] Run `node --test tests/matchday-lineup.test.cjs tests/new-match.test.cjs tests/audit/phase1-risk-repros.test.cjs`; confirm only the intended lineup regressions fail.
- [x] Implement the smallest pure group/sanitize helpers and atomic move guards; use existing `currentTeamIds` and tactical slot catalogue.
- [x] Re-run focused tests; verify move sequences conserve each eligible roster ID exactly once across starting/bench/available.

### Task 2: Partial Draft restore and kickoff boundary

**Files:**
- Modify: `src/types.ts`
- Modify: `src/engine/kickoffLineup.ts`
- Modify: `src/lib/editorRestore.ts`
- Modify: `src/lib/draftLifecycle.ts`
- Modify: `src/store.tsx`
- Modify: `tests/phase1-resume-safety.test.cjs`, `tests/v229-draft-lifecycle.test.cjs`, `tests/store-transactions.test.cjs`

**Interfaces:**
- `kickoffLineupForMatch(match, teamId, exact = true)` keeps all existing readers exact by default; Draft restore opts into partial mode.
- `Match.kickoffConfirmed?: boolean` is optional and Draft-only. Final persisted Match strips this editor flag. `RestoredDraft` returns `kickoffConfirmed` and `missingPlayerIds`.
- `saveDraftMatch(match, { flush: true })` durably commits the current checkpoint and rejects on primary storage failure; the no-options autosave path retains existing generation-fenced debounce behavior.

- [x] Write tests for 10-starter/11-slot Draft restore, bench IDs, empty tactical slot, complete record preservation, and exact-11 save gating.
- [x] Write tests for kickoff confirmation surviving Back and restore; immediate checkpoint failure must not advance the live step, and a retry must persist the latest checkpoint.
- [x] Verify the new tests fail against current restore/lock behavior.
- [x] Implement partial-only recovery and optional explicit kickoff confirmation without weakening finalized Match validation or the phase2 generation fence.
- [x] Run Draft, Store transaction, match save, and phase1 resume tests.

### Task 3: Historical match edits and missing-player presentation

**Files:**
- Modify: `src/lib/validation.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/editorRestore.ts`
- Modify: `src/screens/NewMatchScreen.tsx`
- Modify: `src/components/Pitch.tsx` only if an explicit missing-player marker requires a narrow rendering prop.
- Test: `tests/phase1-resume-safety.test.cjs`, `tests/tactical-history.test.cjs`, new historical-editor tests.

**Interfaces:**
- `validateState(state, { allowMissingHistoricalPlayers?: boolean } = {})` remains strict by default; tolerant mode applies only to old Match references that are still structurally present in appearances/events.
- `LocalRepository` read/write and import preparation opt into tolerant local preservation; Cloud Sync calls the strict default and never receives dangling IDs as valid cloud state.
- Past edit candidates are current players plus players already present in the source match; no current-only player is auto-assigned. Missing entities render as explicit `Missing player · <id>` placeholders and keep the original ID/events.

- [x] Write failing tests for transfer after recorded appearance, edit restoration preserving kickoff/bench/events/position histories, and a dangling historical ID surfaced without automatic substitution.
- [x] Write failing test that local save/restart preserves the dangling reference while strict cloud validation still rejects it.
- [x] Run those tests and confirm failures arise from current-player filtering/strict local validation.
- [x] Add the scoped tolerant validation option and historical editor projection; preserve all original IDs and event data unless the user explicitly edits them.
- [x] Run local repository, cloud fail-closed, tactical-history, and edit-match tests.

### Task 4: Latest-state League slot guard

**Files:**
- Modify: `src/engine/competition.ts`
- Modify: `src/store.tsx`
- Test: `tests/new-match.test.cjs`, `tests/competition.test.cjs`, new Store save-boundary regression.

**Interfaces:**
- `leagueSlotConflict(matches: Match[], candidate: Match, excludingMatchId?: string): Match | undefined` uses canonical competition identity and `leagueSlotTeamIds` only for League; it does not alter Cup/Champions slot rules.
- `saveMatchDurably` checks this conflict inside its transaction reducer against `current.data.matches`, excluding only the candidate’s same ID. Reject before publishing/persisting a duplicate.

- [x] Write failing tests for identical team/season/MD rejection, MD/season/team separation, same-ID edit allowance, and deleting then registering the slot again.
- [x] Confirm the existing `phase1-risk-repros.test.cjs` duplicate League slot case fails.
- [x] Implement the canonical conflict helper and current-snapshot save guard.
- [x] Re-run Store/competition and duplicate slot tests, ensuring failures preserve the prior verified durable state.

### Task 5: Log Match integration and full verification

**Files:**
- Modify: `src/screens/NewMatchScreen.tsx`
- Modify: `tests/audit/phase1-risk-repros.test.cjs` only by strengthening assertions or marking fixed cases (never remove cases).
- Modify: `tests/new-match.test.cjs` and targeted integration test files.

- [x] Connect canonical lineup groups to the existing tap UI and keep GK/formation behavior unchanged.
- [x] Add/verify scenario coverage for event substitution uniqueness, player movement position history, +5 event with 90-minute credit cap, autosave restart, and save failure retry.
- [x] Run Log Match focused tests and both phase1 audit files; expected: all in-scope phase1 cases pass; unrelated cache and Best Attack Trio audit cases remain reported failures.
- [x] Run Store durability, cloud protocol and Import/Draft regressions.
- [x] Run `npm.cmd test`, `npx.cmd tsc -b --pretty false`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- [x] Review `git status` and diff; confirm original dirty files remain, no migration or DB change, and no commit/push/deploy.
- [x] Report A–E in Korean, including the unrelated 5차/6차 audit failures and the remaining cloud rollout limitation.
