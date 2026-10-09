# Football Tracker 3차 클라우드 동기화 설계

## 목적과 제한

1·2차의 로컬 `STORAGE_KEY`, `createStoreTransactions`, Draft 세대 fence 및 경기 확정 안전장치를 유지하면서 클라우드 데이터 손실·삭제 부활·기기 간 경쟁 상태를 해결한다. 기존 Match/Player/Team ID, 저장된 기록, Rating REV13, 대회 규칙, 화면과 기능을 유지한다. 클라우드 병합 결정은 서버 revision으로 정하며 새 동기화 원장과 필요한 migration만 추가한다. 실제 운영 DB 변경, 배포, commit/push는 하지 않는다.

## 조사 결과

- 작업 기준: branch `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`. 1·2차 변경은 모두 기존 working tree에 미커밋 상태로 존재하며 보존한다.
- 2차 전체 테스트 기준은 812개 통과였고 이번 작업 시작 시에도 `npm.cmd test` 812/812 통과를 재확인했다. 1차의 세 클라우드 재현 테스트는 현재 `src/lib/sync.ts`의 지연 조회 후 오래된 localStorage writeback, 물리 삭제로 인한 부활, 로컬 데이터가 없는 복원 실패를 재현한다.
- Store는 `createStoreTransactions`가 최신 메모리 snapshot과 저장 직렬화를 소유한다. 현재 SyncManager는 이를 우회해 LocalRepository를 읽고 저장하며 네 테이블 조회·기존 큐 업로드를 겹쳐 수행한다.
- 로컬 migration은 `.env.local`의 Supabase project와 연결된 실제 DB와 다르다. 읽기 전용 스키마 확인 결과 기존 `teams`, `players`, `matches`는 RLS 활성화, `(user_id,id)` 복합 PK, camelCase 앱 필드를 사용하고 `updated_at` 갱신 트리거가 있다. 실제 테이블은 teams 14행, players 5행, matches 0행이며 `competition_states`는 없다. 실제 스키마에는 migration 파일에 없는 필드도 있다. 원격 migration history는 비어 있어 로컬 migration history와도 차이가 난다. 본 설계는 기존 값을 migration에서 변환·삭제하지 않고 첫 신규 동기화 시 RLS를 거친 기존 행 조회 결과로 revision 0 원장을 초기화한다.
- 새 migration은 누락된 `competition_states`와 별도 `cloud_sync_state` 및 `cloud_sync_entities` 원장, RLS/RPC를 추가한다. 기존 테이블을 바꾸거나 제거하지 않는다. RPC의 사용자별 단조 증가 revision은 모든 변경 batch를 CAS로 검증하고, 삭제도 entity row의 tombstone으로 남긴다. migration history가 비어 있으므로 Supabase CLI의 일반적인 전체 pending migration 적용은 기존 `teams` 등과 충돌한다. migration 적용 전에 remote migration history를 로컬 파일에 맞춰 추측으로 표시하지 말고, 실제 DB drift를 기준으로 배포 이력을 별도로 정리해야 한다.

## 데이터와 충돌 정책

`cloud_sync_state`는 계정당 현재 server revision을 보관한다. `cloud_sync_entities`는 `(user_id, entity_type, entity_id)`별 revision, 삭제 여부, JSONB payload를 보관한다. 삭제 row는 물리 제거하지 않는다. 첫 사용자는 기존 cloud 테이블의 전체 행을 타입별 deserialize 후 한 트랜잭션의 initialize RPC로 seed한다. 이미 초기화된 계정은 seed payload를 무시하고 원장을 반환한다.

클라이언트는 server revision을 읽고 local 최신 snapshot과 durable queue를 합친 후 expected revision을 보내 원자 commit을 요청한다. 버전 불일치는 어떤 mutation도 적용하지 않고 최신 server state를 반환한다. 클라이언트는 다시 읽고 병합한다. 특정 entity의 remote revision이 queue 생성 시 저장된 base revision보다 높으면 remote가 이긴다. remote tombstone은 오래된 local upsert/삭제 큐보다 우선하고 로컬에서 다시 나타나지 않는다. base revision이 일치할 때만 local 변경을 commit한다. 서로 다른 entity 수정은 최신 snapshot에서 다시 병합해 함께 보존한다.

각 브라우저는 계정 ID가 일치할 때만 local queue를 읽고 RPC를 호출한다. 계정 전환 시 기존 queue/state를 다른 계정에 보내지 않는다. 초기 cloud 상태는 기존 테이블이 아닌 원장부터 읽고, 원장이 없을 때만 기존 테이블을 조회한다. cloud 반영은 Store adapter의 현재 transaction revision과 snapshot을 확인한 다음 coordinator를 통해 저장 후 publish한다. 읽기/저장/RPC 실패는 성공으로 보고하지 않고 queue를 유지하며 retry한다. 단일 flight와 dirty rerun으로 중복 동기화를 직렬화한다. Match draft는 cloud serializer에 넣지 않는다.

## 테스트 기준

네트워크 지연, CAS 경쟁, mutation 원자 실패, queue coalescing 중 새 큐 보존, tombstone 부활 차단, 신규 계정·새 기기 cloud 복원, 전체 Match/Player/Team/CompetitionState 직렬화 round-trip, 계정 전환, retry, Store commit 중 sync, 재시작, 기존 phase1 재현과 phase2 transaction/import/Draft 테스트를 결정적 harness로 확인한다. SQL migration은 파일 검토와 가능한 로컬 정적 검증만 수행한다. 운영 DB 연결 테스트나 migration 적용은 하지 않는다.

## Migration 준비와 적용 조건

새 원장 테이블은 RLS를 활성화하고 `auth.uid()` 기준으로 사용자 행만 노출한다. initialize/commit RPC는 호출자 ID를 DB에서 얻고 payload의 타입·id·개수를 검증한다. 공개 schema의 새 테이블 권한은 authenticated에 한정한다. Supabase CLI와 로컬 PostgreSQL/Docker가 현재 작업 환경에 없어 migration 파일을 staging DB에서 실행할 수 없었다. 운영 migration history가 비어 있고 기존 로컬 첫 migration은 이미 존재하는 `teams`를 다시 생성하므로 일반 `supabase db push` 실행은 안전하지 않다. 적용 전에는 현재 운영 스키마와 migration history를 재확인하고 staging에서 먼저 SQL 실행/정책/RPC를 검증한 뒤, 명시적 baseline/repair 절차와 백업/복구 지점을 승인받아야 한다. 본 작업에서는 이 migration을 운영에 적용하지 않는다.

## 잔여 위험

동기화 중인 계정의 첫 initialize 시점에 기존 cloud 데이터를 가져오는 도중 **이전 앱 버전이 기존 테이블에 계속 쓰는 경우**, 신규 원장에는 그 후속 구버전 변경이 자동 반영되지 않는다. 원장 전환 배포 순서에서 구버전 동기화 중지/호환 기간 정책이 필요하다. Tombstone은 오래된 기기 부활 방지를 위해 자동 정리하지 않으므로 삭제 entity가 늘수록 원장 크기가 증가한다. 새 코드가 원장으로 전환된 뒤 구버전 앱으로 rollback하면 새 변경은 구버전 테이블에 자동 복제되지 않는다. 실제 migration/PostgREST RPC 동작과 두 실제 기기 검증은 별도 staging 및 운영 승인 후에만 검증할 수 있다.
