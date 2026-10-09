# Football Tracker v2.5.4 — 9차 Staging 실행 및 검증 기록

작성일: 2026-10-10
판정: **NO-GO for production rollout** — staging SQL gate는 통과했으나 실제 브라우저/Auth 및 복구 검증이 남아 있다.

## 대상과 보호 범위

- Staging: `jpmgxogvoxavoesepikv` (`football-tracker-staging`, ap-northeast-2, PostgreSQL 17.11)
- 운영: `mztsniphpalgwdpvcqor` (ap-southeast-1, PostgreSQL 17.6)
- MCP 프로젝트 상세 조회로 ref를 각각 확인했다. 모든 Staging 쓰기 직전에도 프로젝트 상세의 ref/name을 재검증했다.
- 운영 DB에는 catalog/프로젝트 상세 SELECT만 실행했다. DDL, DML, 권한, migration history 변경은 실행하지 않았다.
- Git 시작 상태는 `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`이며 기존 변경사항을 보존했다. 앱 버전 2.5.4와 Rating REV13을 유지했다.

## Baseline과 migration

- Staging 시작 시 public 테이블과 migration history가 비어 있음을 확인했다.
- 운영의 실제 `teams`, `players`, `matches` 컬럼/default, `(user_id,id)` PK, `auth.users` cascade FK, 인덱스, RLS 정책, grants, `set_updated_at()` 트리거를 읽기 전용 catalog 조회로 확인했다.
- `supabase/staging/phase9_production_schema_baseline.sql`은 확인한 구조만 만들며 운영 데이터나 사용자 ID를 포함하지 않는다. 기존 여섯 migration을 일괄 적용하지 않았다.
- Staging에 baseline과 Cloud migration을 적용했다. 이후 별도 cutover rehearsal와 private schema ACL 보강도 Staging 전용 migration history에 기록했다.
- 합성 사용자 2명과 팀/선수/경기/대회 상태 fixture로 bootstrap을 검증했다. 경기 appearances, events, SOT와 stable IDs가 원장 payload에 보존됐다. 테스트 후 합성 사용자는 삭제한다.
- Baseline은 운영의 현재 schema를 재현한 staging artifact다. 운영에 적용할 baseline이나 migration으로 승인된 것은 아니다.
- 테스트 후 auth 사용자 0명, public synthetic row 0건을 재조회했다. Staging에는 검증된 schema와 4개의 phase9 rehearsal migration history만 남겼다.
- 최종 로컬 SQL SHA-256: baseline `249F0EC51DF37CB607E38D6CEDC6D7821AAA65113FC737501F00FBCA0E2A07A3`, Cloud migration `FE01B7739934EEA68850C803B81C7B1028B613C8E889264915E14210274E7C90`, legacy cutover `11D86577B2BB61F17F05651B9E7CBB3D9A0E14262BB2149D2A691ACEBA2E491E`.

## CAS 우회 취약점과 수정

기존 Cloud migration은 `authenticated`에 원장 테이블 `INSERT`/`UPDATE`를 주면서 RPC를 `SECURITY INVOKER`로 실행했다. 같은 table grant로 PostgREST 직접 DML이 가능해 자체 행의 revision을 RPC 없이 바꾸거나 entity를 덮을 수 있었다. RLS는 계정 간 접근만 제한하고 CAS를 강제하지 못했다.

수정된 `20261010120000_add_revisioned_cloud_sync.sql`은 다음 경계를 둔다.

- `authenticated`는 `cloud_sync_state`와 `cloud_sync_entities`를 `SELECT`만 할 수 있다. 원장 `INSERT`/`UPDATE`/`DELETE` grant와 쓰기 RLS 정책을 제거했다.
- 기존 public RPC 이름과 인자는 유지했다. public wrapper는 `SECURITY INVOKER`이며, 쓰기는 `private` schema의 제한된 `SECURITY DEFINER` helper로 전달한다.
- helper는 `auth.uid()`를 필수 검사하고 모든 테이블을 schema-qualified로 참조하며 `search_path`를 `pg_catalog, auth`로 고정했다. 함수 실행은 `authenticated`만 허용한다. private schema에서 authenticated의 CREATE도 회수하고 USAGE만 부여한다.
- 조회 RLS는 사용자별 `user_id`로 유지했다. Cloud migration이 추가하는 `competition_states` 기존 CRUD 권한은 유지했다.

## Staging PostgreSQL에서 실제 확인한 항목

SQL 세션에서 실제 Postgres role을 `authenticated`/`anon`으로 바꾸고 JWT subject claim을 합성 UUID로 설정했다. 이는 실제 OAuth 사용자 세션이나 서명된 JWT를 통한 브라우저 요청과는 구분한다.

- baseline 적용 후 legacy 세 테이블 컬럼/PK/FK/RLS와 row count 0 확인
- bootstrap 최초 성공, 두 번째 초기화 멱등성, team/player/match/competition 4개 원장 기록
- match events, appearances, shots-on-target payload 보존
- authenticated 직접 원장 INSERT/UPDATE 거부, 원장 테이블은 SELECT만 허용
- 정상 RPC commit, stale revision 거부, 사용자별 revision 증가
- tombstone 삭제와 오래된 upsert 거부
- A/B 계정의 원장 조회 격리 및 독립 revision
- 두 실제 MCP SQL 요청을 병렬 실행해 동일 revision CAS 경합: 하나만 `applied=true, revision=3`, 다른 요청은 `applied=false, revision=3`
- stale 기기 재시도: 현재 revision 재조회 뒤 재전송 성공
- `anon`의 원장 SELECT 및 RPC 실행 거부
- 비노출 helper owner=`postgres`, `SECURITY DEFINER`, 고정 search_path, authenticated 전용 실행 권한 확인

## v2.5.3 → v2.5.4 전환 재현 및 대응

원장 bootstrap 뒤 Staging에서 `authenticated` legacy 쓰기를 허용해 보니 구버전 방식의 `teams` UPDATE는 성공했지만 Cloud ledger payload는 이전 값으로 남았다. 즉 기존 grant를 둔 채 두 앱 버전을 같이 운영하면 데이터가 갈라진다.

이를 위해 `supabase/staging/phase9_legacy_write_cutover.sql`에 별도 cutover 단계를 두고 Staging에만 적용했다. 이 단계는 legacy `SELECT`를 유지하고 anon/authenticated의 legacy DML을 막는다. 적용 후 구버전 UPDATE/INSERT가 권한 오류로 거부되고 새 RPC는 계속 성공하는 것을 실제 DB에서 확인했다. cutover는 전체 구버전 클라이언트의 교체·오프라인 queue 백업이 끝나기 전에는 실행하면 안 된다.

v2.5.3 queue에는 `baseRevision`이 없다. v2.5.4는 이 값을 `0`으로 추정해 원격의 최신 행으로 로컬 내용을 교체하거나 오래된 queue를 승인할 수 있었다. 이제 충돌 가능한 원격 행이 있으면 동기화를 중단하고 로컬 상태와 durable queue를 보존한다. 같은 값이 이미 원격에 있으면 안전하게 승인한다. queue가 있던 entity를 사용자가 다시 편집해도 알 수 없는 기준 revision을 임의로 채우지 않는다. protocol, queue 재기록 회귀 테스트를 추가했다.

## 자동 검증

- `npm.cmd test`: **860/860 통과**
- `node --test tests/audit/phase1-risk-repros.test.cjs tests/audit/phase1-sync-risk-repros.test.cjs`: **18/18 통과**
- 9차 Cloud 권한/구버전 큐 신규 회귀 테스트: **3/3 통과** (Cloud protocol 테스트 포함 신규 9개 타깃 테스트 통과)
- `npm.cmd run build`: 통과 (`tsc -b` 포함). 기존 큰 초기 JS chunk 경고가 있다.
- `npm.cmd run lint`: 통과
- `git diff --check`: 통과. 기존 Windows CRLF 변환 안내만 출력됐다.

## 남은 검증과 판정

다음은 미검증이다.

- 실제 Supabase Auth 로그인과 서명된 JWT로 호출한 PostgREST RLS/RPC, 브라우저 2개 및 앱 재시작 end-to-end
- v2.5.3과 v2.5.4 실제 배포 build를 브라우저에서 교대로 실행하고 오래된 offline IndexedDB queue가 사용자에게 표시되는지 확인
- JSON backup의 staging restore, 실사용 데이터 규모/복구 시간 검증
- public Data API schema exposure 설정 확인 및 실제 REST endpoint 호출
- staging DB에서 실제 앱 전체 UI flow (Import, Draft, 경기 확정 포함)

따라서 **staging PostgreSQL의 SQL/CAS/security 검증은 통과**했지만 **운영 rollout은 NO-GO**다. 운영 전에는 오프라인 사용자 export/구버전 차단 계획, 실제 browser/Auth canary, backup restore, PostgREST endpoint 검증을 완료해야 한다. 운영 DB, 실제 배포, Git commit/push는 변경하지 않았다.

## 9차 최종 Auth/브라우저 후속 실행 기록

2026-10-10 추가 확인:

- Staging project ref/name과 이전 4개 rehearsal migration을 다시 확인했다. public 테이블은 6개, 합성 데이터와 Auth 사용자 행은 0건이다.
- Staging URL과 publishable key가 존재하고 활성 상태임을 MCP metadata로 확인했다. key 값은 출력하거나 파일에 저장하지 않았다.
- 현재 `.env.local`의 Supabase URL은 운영 ref `mztsniphpalgwdpvcqor`다. 이를 덮어쓰거나 Staging 모드 앱을 시작하지 않았다.
- Browser runtime을 초기화했으나 사용 가능한 browser 목록이 비어 있었다. browser skill의 복구 절차를 따라 목록을 한 번 확인했으며, 사용 가능한 browser가 없었다.
- Staging Auth REST endpoint의 읽기 전용 health 확인도 실행 환경 네트워크 제한으로 연결되지 않았다. MCP에는 Auth 계정 생성/로그인이나 Management Auth 설정 도구가 없다.
- 현재 앱 로그인 화면은 Google OAuth만 제공한다. Staging Google OAuth 설정 또는 확인 가능한 test inbox가 준비됐는지 확인할 수 없었다.

따라서 이 후속 실행에서는 Auth 계정/JWT를 만들거나 staging 데이터를 쓰지 않았다. 서명 JWT, REST/PostgREST, 브라우저, session refresh/logout, 구버전 UI 안내, 실제 Export/Import restore 및 23개 화면 라우팅은 모두 **미실행**이다. 브라우저를 연결하고 Staging Auth에서 쓸 수 있는 테스트 로그인 방법(Google OAuth 설정 또는 확인 가능한 테스트 이메일 계정)을 제공한 뒤 이어서 검증해야 한다. 운영 rollout 판정은 계속 **NO-GO**다.
