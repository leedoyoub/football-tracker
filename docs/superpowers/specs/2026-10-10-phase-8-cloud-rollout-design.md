# Football Tracker v2.5.4 — 8차 Cloud Rollout 사전 검증 설계

작성일: 2026-10-10
범위: 운영 적용 전 읽기 전용 감사와 격리된 staging 검증 설계

## 목표와 제한

1~7차에서 만든 revision 기반 Cloud Sync를 실제 사용자 데이터가 있는 Supabase에 적용하기 전에 스키마 차이, 이전 데이터 초기화, RLS/RPC/CAS, 여러 기기 전환을 검증한다. 이번 단계에서는 운영 Supabase에 쓰기·DDL·migration history 변경을 하지 않는다. 배포, commit, push도 하지 않는다.

v2.5.4, Rating REV13, 대회 규칙, 저장 키, 기존 화면과 기능을 유지한다. 운영에 영향을 주는 코드나 SQL 수정은 staging 재현으로 결함이 증명된 경우에만 별도 검토 대상으로 남긴다.

## 확인한 기준 상태

- Git `main`, 시작 HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`; 기존 수정과 미추적 파일이 다수 있어 모두 보존한다.
- 패키지/앱 버전은 2.5.4이고 Rating REV13이다.
- 로컬 migration 파일은 6개이며, 마지막 `20261010120000_add_revisioned_cloud_sync.sql`은 미추적 파일이다.
- 이 여섯 파일을 현재 순서 그대로 production/staging 대상에 push하면 안 된다. remote history가 비어 있는 상태에서 과거 초기 migration부터 모두 pending으로 취급되며, 초기 migration은 이미 있는 legacy 테이블을 다시 생성하려 한다. 반대로 과거 migration을 모두 적용된 것으로 history에 기록해도 실제 운영에는 없는 `player_teams`/`competition_states` 등과 스키마 차이가 남는다. 현재 저장소에는 운영 schema를 나타내는 검증된 baseline이 없다.
- 프로젝트 폴더에 `supabase/config.toml`이 없고, 환경에 Supabase CLI, Docker/Podman, `psql`, PostgreSQL 서버가 없다. MCP 프로젝트 목록에서는 로컬 `.env.local`의 호스트와 일치하는 프로젝트만 보였으며 staging 프로젝트는 확인되지 않았다. `.env.local` 값은 출력하지 않았다.
- 운영 DB에는 `teams` 14행/사용자 1명, `players` 5행/사용자 1명, `matches` 0행이 있다. 이 보고서에는 사용자 ID나 레코드 값을 싣지 않는다.
- `competition_states`, `cloud_sync_state`, `cloud_sync_entities`, `player_teams`는 운영 DB에서 확인되지 않았다. `initialize_cloud_sync`, `commit_cloud_sync` RPC도 없다.
- Supabase migration 조회 결과가 비어 있고, 읽기 전용 SQL에서 `supabase_migrations.schema_migrations`도 존재하지 않았다. 이는 기존 테이블이 수동 생성되었거나 다른 관리 경로를 썼을 가능성을 남기며, migration 파일만으로 실제 DB 이력을 역산할 수 없다는 뜻이다.
- 세 legacy 테이블 모두 RLS가 켜져 있고 `user_id = auth.uid()` 정책이 있다. 조회된 기존 역할 권한에는 `anon`의 legacy 테이블 DML grant도 포함됐다. 현재 정책은 `auth.uid()` 기준으로 제한하지만, 실제 익명/인증 세션 요청은 격리 환경에서 별도로 검증해야 한다.
- 읽기 전용 관계 검사에서 players 5명 중 2명은 `teamId`가 현재 소유자의 `teams` 행을 가리키지 않는다. 이는 삭제/이동/외부 선수와 같은 도메인 사례일 수 있어 자동 수정하지 않는다. 경기와 appearance는 0건이라 경기 참조 무결성을 운영 데이터로 검증할 수 없다.
- Supabase 보안 Advisor는 기존 `public.set_updated_at`의 mutable search_path, Auth leaked password protection 비활성 상태를 알렸다. 성능 Advisor는 legacy RLS 정책에서 `auth.uid()` 재평가 경고 12건과 미사용 인덱스 3건을 알렸다. 이번 Cloud migration의 신규 함수 경고라는 증거는 없으며, 운영 변경 없이 별도 후속 항목으로 둔다.

## 설계상 핵심 위험

### Migration baseline

운영 migration history가 없으므로 현재 폴더의 전체 로컬 migration을 일반 적용하거나 `db push`로 history를 맞추면 안 된다. 초기 migration은 실제 DB와 컬럼·키 구성이 다르고, 이미 존재하는 `teams`, `players`, `matches`를 다시 만들려 하며 `player_teams` 및 `match_events` 등 로컬 정의와 운영 실제 구성이 다를 수 있다. 기존 각 migration timestamp를 근거 없이 applied로 등록하는 것도 실제 schema를 표현하지 않으므로 금지한다. `migration repair`는 schema를 만들지 않고 history만 바꾼다.

Staging에서는 운영 스키마 덤프/관찰 결과를 기준선으로 고정하고, 적용 전후 스키마 diff를 검토한다. 현재 기존 migration을 바꾸거나 삭제하지 않고, 별도 rollout bundle에 검증된 schema baseline과 Cloud migration만 포함하는 방식을 설계한다. baseline이 정확히 기존 상태를 표현하는지 clone staging에서 확인한 뒤 baseline history 등록과 신규 Cloud migration을 staging에서 시험한다. 운영용 bundle/baseline은 staging 증명 뒤 별도 산출·승인 대상으로 둔다.

### 기존 앱에서 v2.5.4로 전환

기존 앱은 legacy 테이블에 직접 읽고 쓴다. v2.5.4는 ledger가 없으면 legacy 데이터를 읽어 초기화한 다음 `cloud_sync_state`/`cloud_sync_entities`를 동기화 원본으로 사용한다. v2.5.4가 legacy 테이블로 변경 내용을 되돌려 쓰는 동작은 확인되지 않았다. 따라서 초기화 후 구버전이 legacy 테이블에 계속 기록하면 ledger가 그 변경을 보지 못한다. 구버전의 오프라인 브라우저가 뒤늦게 돌아오는 경우도 포함해, 쓰기 경계 또는 호환 브리지 없이 혼합 버전을 허용할 수 없다.

릴리스 전에 아래 중 한 경로를 staging에서 증명해야 한다.

1. 짧은 쓰기 중단 구간과 구버전 클라이언트 배제 절차를 둔 뒤 전체 사용자를 새 버전으로 전환한다. 오프라인 기기의 저장 데이터는 JSON Export로 별도 보존하고, 재접속 시 자동 병합/업로드를 막는 UX·버전 게이트를 확인한다.
2. 또는 구버전 쓰기를 새 ledger에 반영하는 임시 호환 경로를 설계하고, 중복 적용·삭제·CAS·사용자 분리를 staging에서 검증한다. 운영 migration 및 배포 승인은 별도 단계다.

현재 구현으로는 1번도 아직 검증되지 않았으므로 rollout 준비 완료로 판정하지 않는다.

### Legacy 데이터 bootstrap과 검증

`readLegacyEntities`는 teams/players/matches/competition_states를 전부 페이지 조회하고, canonical state 검증에 실패하면 로컬 교체나 초기화를 중단한다. 운영 DB에는 `competition_states`가 없다. 현재 코드의 조회는 빈 배열에 해당할 것으로 예상되나 PostgREST의 미존재 테이블 응답을 실제 staging에서 확인해야 한다. migration 적용 후에는 이 테이블의 스키마가 기존 migration 정의 및 신규 Cloud migration 기대와 맞는지 확인한다.

초기화 입력은 기존 ID와 JSON payload를 보존한다. 빈 경기 데이터에서는 경기 이벤트·appearance·Opponent SOT 보존 여부를 실증할 수 없으므로, synthetic fixture에 기존 경기 데이터를 포함해 확인한다. 누락 Player ID가 있는 역사 경기는 `validateState`가 bootstrap을 막을 수 있으며, 실패 시 local data와 queue가 남는지 확인한다. 누락 ID를 추정 생성하거나 레코드를 지우지 않는다.

## 신규 migration 정적 검토

`20261010120000_add_revisioned_cloud_sync.sql`은 ledger 두 테이블, `competition_states` 생성 보강, initialize RPC, CAS commit RPC를 정의한다.

- 상태 revision은 user 단위로 보관하며 transaction advisory lock과 `FOR UPDATE`로 계정별 commit 경합을 직렬화한다.
- `commit_cloud_sync`는 예상 revision이 일치할 때 mutation batch를 한 트랜잭션에서 기록하고 revision을 올린다. 불일치는 적용하지 않고 재시도를 유도한다.
- entity 삭제는 payload 제거 대신 tombstone으로 남긴다. 오래된 기기의 재업로드와 삭제 tombstone 보존 정책을 staging에서 검증한다.
- 테이블은 RLS를 켜고 사용자 소유 조건을 둔다. 함수는 기본 `SECURITY INVOKER`로 두며 `search_path`를 고정하고 public/anon 실행을 취소한 뒤 authenticated 실행 권한을 준다.
- `CREATE TABLE IF NOT EXISTS competition_states`는 기존 테이블을 필요한 컬럼/제약으로 자동 변환하지 않는다. 같은 이름의 legacy 테이블이 다른 모양이면 이 migration만으로 호환되지 않는다. 운영 DB에는 현재 테이블이 없지만, staging baseline과 전체 migration 적용 순서로 분기 검증이 필요하다.
- 신규 함수의 실제 실행 권한, 노출 schema/API grant, RLS는 PostgreSQL staging의 anon/authenticated 세션으로 검증해야 한다. catalog 상 권한만으로 HTTP Data API의 노출 설정까지 확정하지 않는다.
- Supabase changelog에는 2026-10-30부터 새 `public` 테이블의 Data API 노출 기본 동작이 바뀐다고 공지되어 있다. rollout이 이 날짜 이후라면 Cloud 테이블과 RPC가 API exposed schema에 포함되는지 별도 확인해야 한다. SQL GRANT와 RLS만으로 Data API 노출 여부를 대신 판정하지 않는다.
- 현재 확인한 migration에는 `competition_states`에 `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`가 이미 있다. 8차 최종 보고서가 grant 누락을 결함으로 판정한 것은 잘못이었다. 여기서 SQL을 추가하지 않고 staging에서 이 권한과 RLS를 실제 확인한다. 2026-10-30 이후 Data API 설정도 확인해야 한다.

## 검증 합격 조건

1. 적용 전 legacy schema와 baseline이 정확히 일치하고, 새 migration 적용 후 예상 컬럼·PK·FK·check·index·RLS·정책·grant·RPC 정의가 일치한다.
2. 계정 A/B 각각 초기화되고 교차 조회/쓰기/삭제/RPC가 모두 거부된다.
3. 동시 CAS 요청 한 건만 동일 revision에서 성공하고 나머지는 revision conflict로 끝나며, 부분 적용은 없다.
4. initialize 반복·동시 실행이 중복 entity를 만들지 않고 기존 최신 이력을 보존한다.
5. tombstone 삭제 후 오래된 장치의 upsert가 되살리지 못하고, 명시적인 최신 Import만 설계된 조건에서 복구한다.
6. legacy backup과 합성 fixture에 있던 IDs, matches, events, appearances, competition metadata, SOT 필드가 초기화 전후 동등하다.
7. bootstrap/commit/RLS/local persistence 실패 시 local snapshot과 queue가 보존되고, 재시도 후 한 번만 반영된다.
8. 구버전 쓰기와 새 버전 ledger 동작이 공존할 때 데이터가 조용히 갈라지지 않음이 증명된다. 그렇지 않으면 혼합 버전 경로를 차단한다.
9. 앱 재시작, 두 브라우저, 오프라인 큐, 계정 전환, Draft, 확정 경기, Import 경계를 통과한다.

## 이번 단계 판정

운영 스키마와 데이터는 읽기 전용으로 확인했다. 격리된 PostgreSQL/Supabase staging이 없고 실행 도구도 설치되어 있지 않으므로 SQL 적용, 실제 RPC/CAS, 실제 RLS, backup restore, 다중 브라우저 시나리오는 미실행이다. 기존 fake DB 테스트는 PostgreSQL의 SQL/RLS 의미를 증명하지 않는다. rollout은 차단 상태이며 아래 계획의 staging 게이트가 끝난 뒤에만 운영 전환 계획을 별도로 승인할 수 있다.
