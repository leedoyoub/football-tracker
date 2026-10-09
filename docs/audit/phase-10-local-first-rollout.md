# Football Tracker v2.5.4 — 로컬 저장 우선 배포 사전 검증

작성일: 2026-10-10
판정: **배포 준비 완료, 사용자 브라우저 백업 확인 전 push/배포 보류**

## 확인 범위

- 기존 브랜치 `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`와 광범위한 1~9차 미커밋 변경사항을 확인했다. 기존 변경사항을 reset, stage, commit하지 않았다.
- 기존 기본 저장 키 `football-tracker-v1`, backup/emergency 키 및 IndexedDB 이름을 유지했다. 새 데이터 이전이나 브라우저 저장소 초기화는 수행하지 않았다.
- 실제 사용자의 브라우저 저장소는 이 실행 환경에서 읽지 않았다. 사용자 본인이 배포 전에 JSON Export를 내려받아야 한다.

## 적용 내용

- `VITE_ENABLE_CLOUD_SYNC`가 정확히 `true`일 때만 SyncManager가 클라우드 원장을 사용한다. 기본값과 GitHub Pages production workflow 값은 `false`다.
- 비활성 상태에서 SyncManager는 `local-only`를 반환하며 Supabase client, Auth identity, REST/RPC, IndexedDB 동기화 큐를 사용하지 않는다. 기존 동기화 큐와 metadata는 보존한다.
- 앱 시작 시 recovery backup/emergency snapshot을 정리하던 동작을 제거했다. LocalStorage quota 오류 때에도 기존 snapshot을 삭제해 쓰기를 강행하지 않고 오류를 전파한다.
- 인증 세션과 명시적 API-Football Edge Function 호출은 기존 기능 보존을 위해 별도 유지된다. 이 변경은 football data Cloud Sync bootstrap/REST/RPC 경로를 비활성화한다.
- 앱/패키지 버전 `2.5.4`, Rating REV13, GitHub Pages base `/football-tracker/`를 유지했다.

## 검증 결과

- `npm.cmd test`: **861/861 통과**
- 감사 재현: **18/18 통과**
- `npm.cmd run build` (TypeScript 포함): 통과. 기존 500 KB 초과 chunk 경고 1건.
- `npm.cmd run lint`: 종료 코드 0. 기존 lint 경고가 남아 있다.
- `git diff --check`: 통과. Windows CRLF 안내만 출력.
- production build에서 Pages base와 `football-tracker-v1` 저장 키가 확인됐고, Staging ref는 발견되지 않았다. CI workflow에서 Cloud Sync 플래그를 명시적으로 false로 둔다.
- 자동 회귀 테스트에서 비활성 Cloud Sync의 client/DB/timer 호출 0건, 기존 queue 유지, 저장 quota 실패 시 recovery snapshots 유지를 확인했다.

## 배포 미완료 조건

- 사용자 실제 브라우저에서 JSON Export 파일 생성·확인 필요.
- 실제 브라우저의 팀·선수·경기 ID/이벤트/저장 복원, 경기 추가·수정·삭제 후 새로고침 및 Network 패널을 통한 Cloud Sync RPC 부재 검증은 아직 수행하지 않았다.
- 백업 확인 후에만 승인된 working tree를 commit/push하고 GitHub Pages Actions 배포를 실행한다.
- 운영 Supabase schema, migration, data, Auth 설정은 변경하지 않았다.
