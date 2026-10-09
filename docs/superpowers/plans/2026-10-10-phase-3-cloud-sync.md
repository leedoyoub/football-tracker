# 3차 클라우드 동기화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server revision, CAS, tombstone과 Store transaction adapter를 사용해 계정 간 격리와 기기 간 cloud sync를 안전하게 만든다.

**Architecture:** 기존 테이블을 첫 초기화의 호환 입력으로 유지하고, 사용자별 단조 증가 revision을 보유하는 새 JSONB entity 원장을 추가한다. SyncManager 단일 flight가 최신 Store snapshot과 CAS RPC를 조정하고, 충돌 시 다시 읽어 재병합한다. Store transaction coordinator를 통해서만 원격 state를 저장·게시한다.

**Tech Stack:** React 19, TypeScript, Supabase JS v2/Postgres, IndexedDB, Node `node:test`.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-3-cloud-sync-design.md`

## Global Constraints

- 기존 localStorage `football-tracker-v1`, data ID, match history, Rating REV13, competition rules, UI, import atomicity, Draft local-only generation fence를 유지한다.
- React state updater 안에서 동기화 side effect를 실행하지 않는다.
- migration 파일만 준비하고 실제 Supabase migration, production data write, deploy, commit/push는 하지 않는다.
- 기존 사용자 작업 변경사항을 보존한다. 운영 클라우드의 새 원장은 기존 entity rows에서 첫 동기화 때만 initialize한다.

## Review Focus

- sync 중 local mutation 발생 → coordinator revision을 읽어 오래된 snapshot writeback 방지.
- CAS mismatch → stale entity queue는 revision 기준으로 거절하고 다른 entity 변경은 remerge 후 유지.
- remote tombstone → stale device upsert로 복원되지 않음.
- cloud empty/local empty 계정 및 local empty/cloud populated 새 기기 → seed/restore가 정확함.
- commit 실패/계정 전환/strict single-flight → 성공 오표시·다른 계정 업로드·중복 side effect 없음.

---

### Task 1: Cloud protocol helper와 실패 재현 테스트

**Files:**
- Create: `src/lib/cloudSyncProtocol.ts`
- Create: `tests/cloud-sync-protocol.test.cjs`
- Modify: `tests/audit/phase1-sync-risk-repros.test.cjs`

**Interfaces:**
- `CloudEntityRecord`: entity type/id, integer revision, deleted flag, nullable entity payload.
- 순수 helper: AppState entity를 원장 row로 변환, 원장 rows를 local AppState/tombstone lookup으로 변환, local state와 queued mutations의 revision conflict를 결정한다.

- [x] helper 기대 API로 round-trip 및 stale tombstone tests 작성.
- [x] targeted tests를 실행해 새 동작에서 예상대로 실패하는지 확인.
- [x] 테스트를 통과시키는 최소 helper 구현.
- [x] targeted tests 재실행.

### Task 2: Revision 원장 migration

**Files:**
- Create: `supabase/migrations/20261010120000_add_revisioned_cloud_sync.sql`
- Modify: `docs/superpowers/specs/2026-10-10-phase-3-cloud-sync-design.md`
- Exercise: `tests/cloud-sync-protocol.test.cjs` and `tests/audit/phase1-sync-risk-repros.test.cjs`

**Interfaces:**
- `initialize_cloud_sync(p_entities jsonb)`: 인증 계정의 기존 데이터로 최초 원장을 원자 초기화하고 현재 revision 반환.
- `commit_cloud_sync(p_expected_revision bigint, p_mutations jsonb)`: expected revision 일치 시 전체 batch를 하나의 revision으로 반영, 불일치면 아무것도 쓰지 않고 current revision 반환.
- SQL tables: `cloud_sync_state`, `cloud_sync_entities`, 복합 사용자/entity PK, RLS, authenticated 권한.

- [x] migration table/key/RLS/RPC, composite key와 물리 삭제 방지 계약 검토. `competition_states`는 기존 `team_ids` 필드 호환을 위해 추가.
- [x] 실제 DB 확인 결과를 반영한 additive migration 작성. 구 테이블 변경/삭제/운영 적용 금지.
- [x] 가짜 PostgREST harness에서 initialize/commit protocol 계약 검증.
- [x] SQL 수동 검토. Supabase CLI/PostgreSQL/Docker가 없어 DDL 실행은 못 했고, 빈 원격 history와 기존 테이블 충돌 때문에 일반 push도 안전하지 않음을 문서화.

### Task 3: SyncManager CAS, bootstrap, single-flight, retry

**Files:**
- Modify: `src/lib/sync.ts`
- Create: `src/lib/cloudSyncProtocol.ts`
- Modify: `tests/cloud-sync-protocol.test.cjs`
- Modify: `tests/p0-durability.test.cjs`
- Modify: `tests/audit/phase1-sync-risk-repros.test.cjs`

**Interfaces:**
- queue rows gain `baseRevision`; coalescing preserves first base revision while keeping latest intended payload.
- `syncNow()` captures one user and uses `initialize_cloud_sync` only for an uninitialized account; afterward it uses only revision rows and `commit_cloud_sync`.
- Existing phase-2 queue rows without `baseRevision` default to revision 0; explicit Import rows are rebased to the latest fetched entity revision and cover the full imported snapshot.
- CAS conflict retries by refetching state and latest local snapshot up to a bounded attempt count; failures keep queue and are reported as pending.
- concurrent calls share one Promise; queue writes during a flight mark one rerun. User/session is rechecked before and after RPC and before local application.
- Explicit Import queues the entire replacement and compares against the latest fetched remote revision; stale ordinary queue rows cannot resurrect tombstones.

- [x] deterministic fake-client tests for bootstrap, single-flight, delayed reads, CAS conflict, retry/error, account switch, restart, and complete record serialization.
- [x] run new helper tests red before implementing the helper.
- [x] implement protocol while preserving legacy table reads only for initial bootstrap.
- [x] run protocol and phase1 repro suites.

### Task 4: Store transaction bridge

**Files:**
- Modify: `src/store.tsx`
- Modify: `src/lib/sync.ts`
- Test: `tests/audit/phase1-sync-risk-repros.test.cjs`

**Interfaces:**
- SyncManager adapter reads `{revision, snapshot}` from `transactions.read()` and applies remote state only if expected revision still matches; remote apply uses durable transaction commit.
- Adapter does not include `draftMatch` in cloud snapshot and uses existing Store reconcile/Draft fence logic.

- [x] Add tests for delayed cloud reads, durable local failure after accepted cloud state, and StrictMode adapter setup/cleanup.
- [x] Verify protocol/helper tests fail before implementation; adapter regression passes after bridge.
- [x] implement adapter registration/cleanup with provider lifecycle safe under StrictMode and preserve final-match Draft fence.
- [x] run cloud protocol, Store transaction, import, match save, Draft tests.

### Task 5: Full regression and final review

**Files:** no additional production files expected.

- [x] Run `npm.cmd test` and record exact totals: 816 passed, 0 failed.
- [x] Run `npx.cmd tsc -b --pretty false` (0 diagnostics, exit 0) and `npm.cmd run lint` (exit 0; existing warnings remain).
- [x] Run `npm.cmd run build` (exit 0) and `git diff --check` (exit 0; Git reports existing LF/CRLF normalization warnings).
- [x] Review git status/diff to ensure prior user changes retained and no commit/push/deploy/DB write.
- [x] Run `tests/audit/phase1-risk-repros.test.cjs`: 1/6 passed; five unrelated tactical lineup, Draft restore, competition cache, duplicate slot validation, and Best Attack Trio repros still fail and remain outside this cloud-sync scope.
- [x] Report migration impact, initialization compatibility boundary, verified vs unverified cloud behavior, and staging/production rollout prerequisites in Korean.
