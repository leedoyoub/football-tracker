# 9차 Staging 검증 설계

작성일: 2026-10-10
상위 설계: [8차 Cloud Rollout 사전 검증](./2026-10-10-phase-8-cloud-rollout-design.md)

## 목표

운영 DB를 읽기 전용으로 관찰해 빈 Staging에 실제 legacy schema baseline을 만든다. Cloud migration과 계정별 CAS를 PostgreSQL에서 실행하고, RPC 이외의 직접 ledger DML을 차단한다. v2.5.3 legacy writer와 offline queue가 v2.5.4 원장과 섞이는 경계를 재현한다.

## 안전 경계

- 쓰기 대상은 `jpmgxogvoxavoesepikv`만이다. 운영 ref `mztsniphpalgwdpvcqor`에는 schema/data/grant/history 변경을 하지 않는다.
- 적용 전 매번 Supabase MCP에서 project ref/name을 확인한다. baseline 시작 전 staging public schema와 migration history가 모두 비었음을 확인한다.
- 이전 migration 6개 전체 대신 운영 catalog를 반영하는 staging baseline과 새 Cloud migration만 적용한다. 운영 사용자 데이터는 복사하지 않는다.
- 기존 로컬/Git 변경사항, v2.5.4, Rating REV13을 보존하며 commit/push/deploy와 운영 변경은 하지 않는다.

## 권한 설계

`authenticated`가 원장 테이블을 직접 INSERT/UPDATE할 수 없도록 테이블 권한과 write policy를 제거한다. 기존 RPC 이름은 API 호환을 위해 유지한다. public wrapper는 invoker 권한으로 실행하고, 쓰기 helper는 노출되지 않는 `private` schema에 둔다. helper는 고정 `search_path`, fully qualified table reference, 필수 `auth.uid()` 검사, 제한된 function EXECUTE를 사용한다. RLS는 사용자별 SELECT를 제한한다.

`SECURITY DEFINER`는 테이블 DML을 authenticated에서 회수하면서 RPC 기능을 유지하기 위해 private helper에서만 사용한다. Staging catalog로 함수 owner와 실제 grants를 검증한다. anon은 원장 조회나 RPC를 사용할 수 없어야 한다.

## Legacy 전환 경계

v2.5.3은 legacy 테이블을 직접 쓰고, v2.5.4는 ledger RPC를 쓴다. 따라서 레저 초기화 뒤에도 기존 DML이 열려 있으면 legacy와 ledger 값이 갈라진다. 두 단계로 처리한다.

1. 이전 버전이 남아 있는 동안은 원장과 legacy table을 임의로 섞어 쓰지 않는다. 각 오프라인 장치에서 JSON export와 queue 복구 상태를 확보한다.
2. 모든 사용자의 새 버전 전환 후 별도 cutover 단계에서 legacy `INSERT/UPDATE/DELETE`를 회수한다. `SELECT`는 처음 원장 bootstrap을 위해 남긴다.

v2.5.3 queue에서 기준 revision이 없는 경우 원격 행이 존재하면 자동 병합하지 않는다. 로컬 상태와 queue를 유지하고 충돌 검토/백업이 필요하다는 pending 결과를 낸다. remote에 없는 신규 ID나 이미 같은 값인 queue는 안전 조건 아래 계속 진행할 수 있다.

## 검증 분리

- PostgreSQL MCP 테스트: role/claim으로 RLS 및 RPC 권한, bootstrap, CAS 동시성, retry, tombstone, 계정 분리를 검사한다.
- Node regression: 기존 감사 18개 재현과 별도 v2.5.3 queue / RPC 권한 source checks를 유지한다.
- 앱/browser 및 실제 서명 JWT 검증은 별도 보고하고 SQL role simulation을 대체 증거로 간주하지 않는다.

## 운영 rollout gate

Staging SQL 통과만으로 운영 적용을 승인하지 않는다. backup restore, signed Auth/PostgREST, browser multi-device, 오래된 offline queue UX, 구버전 차단 시점이 검증돼야 한다. 어느 항목이라도 확인되지 않으면 운영 판정은 NO-GO다.
