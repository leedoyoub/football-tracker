# 8차 Cloud Rollout 사전 검증 실행 계획

작성일: 2026-10-10
연결 설계: `docs/superpowers/specs/2026-10-10-phase-8-cloud-rollout-design.md`

## 상태

**사전 감사 완료, staging 검증 및 운영 전환은 차단됨.** 운영 DB를 변경하지 않았다. 이 계획은 이후 격리 환경에서 수행할 순서와 운영 적용 전 승인 항목을 기록한다.

## 작업 단계

### 1. 재현 가능한 격리 환경 준비

- 별도 Supabase staging 프로젝트 또는 격리 PostgreSQL을 준비한다. 현재 계정에서 staging은 발견되지 않았고 CLI/Docker/psql이 없다.
- 비용이 생기거나 기존 staging 데이터가 초기화되는 경우에는 별도 사용자 승인을 받는다.
- 운영 데이터를 staging에 복사해야 한다면 개인정보·사용자 ID를 제거한 구조와 합성 fixture를 우선 사용한다. 운영 dump를 쓸 경우 별도 승인과 접근 통제가 선행되어야 한다.
- staging은 운영과 별도 URL/키/프로젝트 ref임을 두 사람이 확인하고, 테스트 로그에 비밀 키를 남기지 않는다.

### 2. 운영 스키마 baseline 산출

- 운영 DB에 대해 승인된 read-only schema export 또는 catalog snapshot을 만든다. 데이터 전체 dump는 필요하지 않다.
- 각 migration 파일과 catalog의 테이블, 컬럼, 타입, nullability/default, PK/unique/FK/check/index, RLS/policy, grants/functions를 비교한다.
- 현재 migration history 부재를 분명히 기록한다. 모든 과거 파일을 운영에 재실행하지 않는다.
- 현재 폴더의 legacy 5개와 Cloud migration 1개를 그대로 push하지 않는다. 과거 migration도 pending으로 잡혀 기존 테이블 재생성 충돌이 날 수 있고, legacy 전부를 applied로 repair하면 실제 schema와 차이가 남는다.
- baseline migration은 관찰한 현재 schema를 표현하는 staging 전용 초안으로 만들고, staging clone 또는 빈 DB에서 snapshot과 동등한지 diff한다.
- baseline history 등록은 스키마를 생성하지 않는 bookkeeping 작업이다. staging에서 정확성을 증명하기 전에는 수행하지 않으며, 운영 이력 보정은 별도 승인 후 별도 계획으로 한다.
- 원본 migration 파일은 보존하고, 별도 rollout bundle에는 검증된 current-schema baseline과 Cloud migration만 순서대로 포함한다. bundle의 Supabase 설정과 CLI migration 탐색 결과를 먼저 검토한다.

### 3. Cloud migration PostgreSQL 검증

- staging에서 legacy schema fixture에 migration을 적용한다.
- 예상 객체·정책·권한을 catalog에서 검사한다.
- 실제 `anon`과 두 `authenticated` 사용자 세션으로 테이블 접근 및 RPC 권한을 확인한다.
- Dashboard/API 설정에서 `public` schema exposure도 확인한다. 2026-10-30 이후 신규 public table 노출 기본값 변경 공지가 있으므로 GRANT/RLS 검사와 분리해 검증한다.
- 현재 Cloud migration에 `competition_states`의 authenticated CRUD GRANT가 이미 있음을 재확인했다. 8차에서 누락으로 기록한 내용은 오판이므로 grant를 중복 추가하지 않는다. staging에서 `anon` 차단, authenticated 사용자별 RLS, 실제 bootstrap 조회를 확인한다.
- initialize 정상/반복/경합, CAS 성공/불일치/동시 commit, transaction rollback, tombstone 삭제/오래된 재업로드, 사용자 A/B 격리를 테스트한다.
- 기존 `competition_states` 테이블이 없는 경우와 로컬 과거 migration 모양으로 이미 있는 경우를 각각 시험한다. 후자에서 column mismatch가 있으면 migration 보강안을 작성하되 운영에는 적용하지 않는다.
- 전체 결과는 raw 사용자 값 없이 재현 명령, schema checksum, 테스트 리포트로 남긴다.

### 4. 백업 및 legacy 데이터 이전 검증

- 기존 JSON Export를 앱에서 생성해 parse, count, ID 보존, 재-import를 확인한다.
- staging 합성 fixture에 teams, players, matches, events, appearances, lineup, SOT, competition state와 누락 Player 참조를 포함한다.
- initialize 전후 entity 수와 원본 ID, payload의 정규화 비교를 한다. 경기 데이터 손실/중복, 임의 ID 생성, ownership 누락은 실패다.
- 누락 Player ID 때문에 validation이 실패할 때 로컬 snapshot/queue가 남는지, 보수적 복구 방법을 안내하는지 확인한다.
- 실제 backup 복구가 staging에서 성공하기 전에는 백업 완료 또는 복구 가능을 주장하지 않는다.

### 5. 구버전 → v2.5.4 전환 검증

- 격리된 v2.5.3 또는 실제 직전 빌드와 v2.5.4 빌드를 각각 실행한다.
- 구버전 저장 → v2.5.4 첫 bootstrap → 구버전 온라인 저장 → v2.5.4 재동기화 순서를 재현한다.
- 구버전 offline cache가 나중에 재접속하는 경우도 검사한다.
- ledger가 legacy 직접 변경을 감지하지 않는 현재 구조를 전제로, 다음 둘 중 하나를 검증해야 한다.
  - 전체 구버전 쓰기를 중지하는 호환 경계, 오프라인 기기 재접속 차단/백업/지원 절차
  - 임시 구버전 write bridge와 중복/삭제/CAS 안전성
- 이 전환 검증 전에는 롤아웃하지 않는다. 즉시 복귀가 데이터까지 안전하다고 가정하지 않는다.

### 6. 다중 기기와 UI 회귀

- 독립된 브라우저 프로필 2개와 사용자 2개를 사용한다.
- 서로 다른 entity 추가, 같은 entity 수정, 한쪽 삭제/한쪽 수정, 오프라인 후 재연결, network 지연/중단, 로컬 저장 실패, 앱 재시작, 계정 전환을 실행한다.
- Draft 세대, 확정 경기, Import 원자성, 경기 편집/선수 이동 시나리오를 포함한다.
- Login, cloud restore, 경기 저장, 선수/팀 편집, Import, Draft restore, League/Cup/Champions, Records/Awards/Best XI, history, navigation을 확인한다.
- 가짜 DB 테스트 결과와 staging 결과를 별도 표기한다. staging이 없으면 staging 항목은 미실행이다.

### 7. 운영 전환 준비서와 승인 게이트

운영 변경이 필요해지는 경우에만 별도 문서에 다음을 작성하고 검토한다.

1. 검증 완료된 최종 migration hash와 적용 순서
2. schema-only backup 생성, 백업 식별자, staging restore 증거
3. 사용자 쓰기 동결과 기존 앱 버전 차단 시각/책임자/검증 방법
4. migration 적용 후 객체·RLS·RPC smoke test
5. v2.5.4 배포 및 일부 계정 canary 절차
6. 중단 기준: 데이터 count/ID/payload 불일치, RLS 교차 접근, RPC/CAS 불일치, queue 손실, 초기화 실패, 이전 앱 write 확인
7. 롤백 경계: 코드 롤백만으로 ledger에서 legacy table로 데이터가 역반영되지 않음을 고려한다. 복구는 검증된 backup/명시적 역동기화 절차 없이 실행하지 않는다.
8. 운영 SQL과 앱 배포 각각의 별도 승인

이 계획 작성 단계에서는 위 항목을 실행하지 않는다.

### 실행 가능한 명령 순서 초안 (격리 staging 전용)

아래 명령은 CLI 설치와 staging 준비가 끝난 뒤 사람이 프로젝트 ref를 확인해 실행할 운영 준비 초안이다. `<ROLLOUT_BUNDLE>`, `<STAGING_REF>`, `<BASELINE_TIMESTAMP>`를 실제 값으로 바꾸기 전에는 실행하지 않는다. 이 repo에는 현재 Supabase CLI 프로젝트 설정이 없고 CLI도 설치되어 있지 않아 명령을 시험하지 못했다. staging과 production의 프로젝트 ref가 다른지 확인하고 staging 자격 증명만 사용한다.

```powershell
# ROLLOUT_BUNDLE에는 검증된 baseline + Cloud migration만 둔다.
# 현재 repo의 supabase/migrations 폴더를 그대로 push하지 않는다.

# 1) 지정된 격리 staging 프로젝트만 링크
supabase --workdir <ROLLOUT_BUNDLE> link --project-ref <STAGING_REF>

# 2) history와 대상 프로젝트를 확인
supabase --workdir <ROLLOUT_BUNDLE> migration list --linked

# 3) staging schema-only snapshot을 확보하고 별도 검토
supabase --workdir <ROLLOUT_BUNDLE> db dump --linked -f staging-before.sql

# 4) 운영 스키마 clone staging에 baseline이 이미 반영되어 있고
#    snapshot과 동등함을 확인한 뒤, baseline history를 staging에서만 기록
supabase --workdir <ROLLOUT_BUNDLE> migration repair <BASELINE_TIMESTAMP> --status applied --linked

# 5) 다음 pending 항목을 먼저 미리보기
supabase --workdir <ROLLOUT_BUNDLE> db push --dry-run --linked

# 6) migration SQL/hash, 예상 객체, snapshot을 검토한 후 staging에서만 적용
supabase --workdir <ROLLOUT_BUNDLE> db push --linked

# 7) 사후 history와 schema를 확인
supabase --workdir <ROLLOUT_BUNDLE> migration list --linked
supabase --workdir <ROLLOUT_BUNDLE> db dump --linked -f staging-after.sql
```

명령은 CLI가 staging에서만 연결된 상태인지 작업자가 먼저 확인한 후 실행한다. 명령 4는 baseline SQL을 적용하지 않는다. staging 실제 schema가 baseline이 표현하는 상태와 동등하다는 증거가 있을 때만 history에 기록한다. 깨끗한 빈 staging DB를 쓰면 repair하지 않고 baseline과 Cloud migration을 순서대로 적용한다. 검증 완료 뒤에도 production 대상 `link`, `migration repair`, `db push` 명령은 여기서 실행하지 않는다. Supabase 문서는 `migration repair`가 history만 바꾸고 schema를 적용/되돌리지 않는다고 명시한다.

실제 운영 SQL 적용이 추후 별도 승인되면 계획상 순서는 다음과 같으며, 이번에는 실행하지 않는다.

1. 승인된 백업과 staging restore 증거를 확인한다.
2. 사용자 쓰기를 동결하고 구버전/오프라인 기기 경계를 확인한다.
3. production project ref를 사람이 재확인한 변경 창에서만 승인된 baseline/history 절차를 진행한다.
4. staging에서 검증한 Cloud migration을 한 번 적용한다.
5. catalog, authenticated 사용자 smoke test, RPC/CAS, bootstrap counts를 검증한다.
6. canary 계정을 허용하고 모니터링한다. 중단 기준 충족 시 신규 쓰기와 rollout을 중단하고, 검증된 복구 절차만 사용한다.
7. 앱 배포는 DB 단계와 별도 승인 후 진행한다. 코드 롤백만으로 legacy 테이블에 돌아간 데이터가 복구된다고 가정하지 않는다.

승인 후 운영 명령은 격리 staging에서 검증한 bundle과 backup 증거를 고정한 뒤 아래 순서로만 준비한다. 현재 production ref를 명령에 채우거나 실행하지 않는다.

```powershell
supabase --workdir <ROLLOUT_BUNDLE> link --project-ref <PRODUCTION_REF>
supabase --workdir <ROLLOUT_BUNDLE> migration list --linked
supabase --workdir <ROLLOUT_BUNDLE> db dump --linked -f production-before.sql
# 변경 책임자가 schema snapshot과 project ref를 재검토한 뒤 별도 승인 시에만:
supabase --workdir <ROLLOUT_BUNDLE> migration repair <BASELINE_TIMESTAMP> --status applied --linked
supabase --workdir <ROLLOUT_BUNDLE> db push --dry-run --linked
# dry-run에 승인된 Cloud migration만 보이는지 확인한 뒤 별도 승인 시에만:
supabase --workdir <ROLLOUT_BUNDLE> db push --linked
supabase --workdir <ROLLOUT_BUNDLE> migration list --linked
```

여기서 `db dump`는 schema-only audit artifact를 대상으로 하며 사용자 데이터 backup을 대신하지 않는다. 별도 복구 가능한 backup도 확인해야 한다. 기존 운영 migration history가 없으므로 baseline `repair` 직전에도 실제 schema hash와 bundle의 baseline 동등성을 다시 확인한다. 어떤 과거 migration 파일도 production에 일괄 적용하지 않는다.

## 현재 막힌 항목

- 격리 staging 환경 및 실제 PostgreSQL 실행 도구 없음
- 운영 migration history relation 없음, local migration 이력과 production schema가 일치하지 않음
- v2.5.4와 구버전이 동시에 쓰는 전환 경계 미검증
- 운영 matches가 0건이어서 실제 경기/event/appearance/SOT 이전 검증 불가
- 백업 restore, RLS, RPC/CAS, 두 브라우저, 계정 교차 테스트 미실행

위 blocker는 staging 확보 후에 해소한다. 운영 DB를 staging 대신 사용할 수 없다.
