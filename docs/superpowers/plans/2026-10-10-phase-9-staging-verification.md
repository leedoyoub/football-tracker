# 9차 Staging 실행 계획

작성일: 2026-10-10
설계: [9차 Staging 검증 설계](../specs/2026-10-10-phase-9-staging-verification-design.md)

## 단계와 결과

1. 로컬 상태와 8차 문서를 확인하고 Supabase MCP 프로젝트를 구분한다. **완료:** production과 staging ref 및 region/version 확인, staging은 public schema/history가 비어 있었음.
2. 운영 catalog를 읽기 전용으로 조회해 legacy baseline을 만든다. **완료:** `supabase/staging/phase9_production_schema_baseline.sql` 작성, 기존 6개 migration은 적용하지 않음.
3. baseline과 신규 Cloud migration을 Staging에서 적용하고 schema/policy/grant를 검사한다. **완료:** 합성 fixture만 사용.
4. 원장 직접 DML bypass를 실제 authenticated DB role에서 시도하고 막는다. **완료:** SELECT만 허용, direct write 거부, 정상 RPC 유지.
5. bootstrap, revision CAS, 병렬 충돌, tombstone, 계정 분리, retry를 검사한다. **완료:** 실제 PostgreSQL assertion 및 동시 MCP SQL 요청.
6. 구버전 legacy 쓰기와 queue 경계를 재현하고 단계적 cutover를 검사한다. **완료:** legacy/ledger drift를 재현하고 staging 전용 grant cutover 후 구버전 DML 거부. v2.5.3 queue 누락 revision 보존 테스트 추가.
7. 전체 회귀/타입/lint/build/diff 검사를 실행한다. **완료:** 감사 18/18, 전체 860/860, build/lint/diff 통과.
8. 운영 전 남은 항목과 최종 판정을 기록한다. **완료:** 실제 signed JWT/browser, backup restore, 앱 배포물 교차 실행은 미검증으로 표시. 운영 rollout NO-GO.

## 실행 대상 고정

- Staging only: `jpmgxogvoxavoesepikv`
- Production read only: `mztsniphpalgwdpvcqor`
- 모든 DDL/DML 실행 전 project metadata를 다시 조회한다. 대상 ref가 다르거나 staging이 예상 객체를 갖고 있으면 즉시 중단한다.
- 합성 fixture는 `phase9-` prefix와 전용 synthetic Auth UUID만 사용하며, 테스트 종료 후 제거한다.
