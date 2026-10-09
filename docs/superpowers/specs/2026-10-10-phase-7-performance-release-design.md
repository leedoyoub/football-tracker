# Football Tracker 7차 성능·품질·패치 릴리스 설계

## 목적과 보호 조건

1~6차의 계산 정확성 및 데이터 안전성을 유지하면서, 재현 가능한 합성 데이터 측정으로 확인한 병목을 줄이고 초기 진입 JavaScript를 분할한다. 앱 버전은 현재 2.5.3에서 패치만 증가시켜 2.5.4로 맞춘다.

Rating REV13과 MOM/Best XI/조합 수상 기준, League/Cup/Champions 규칙, 저장 키와 데이터 형식, Store coordinator, Import/Draft/Log Match, Cloud protocol은 고정한다. 사용자 데이터·운영 DB·migration은 읽거나 변경·적용하지 않는다. commit/push/deploy는 하지 않는다.

## 시작 기준

- 저장소 `C:\Users\이도엽\football-tracker`, `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`.
- 기존 1~6차는 미커밋 상태다. 현재 기준 전체 테스트 852/852 통과.
- 앱 2.5.3, lockfile 2.5.3, Rating REV13.
- 기준 production build JS: `index-D9Pnhzzx.js` 930.94 kB (gzip 262.68 kB), 500 kB 경고. 빌드에는 CSS 58.04 kB도 포함된다.
- App은 모든 주요 화면을 정적 import하며 route switch에서 조건 렌더링한다. `StartupBoundary`가 이미 앱 전체 render/lazy rejection 오류를 `StartupRecovery`로 처리하고 reload 동작을 제공한다.
- 코드에는 `buildGlobalRankingData`, `buildSeasonAnalytics`, competition selectors, rating/timeline WeakMap 및 React `useMemo`가 이미 있다. 이를 다시 중복 도입하지 않는다.
- `src/lib/developmentMeasurement.ts`는 development 전용 계측 hook을 제공한다.

## 측정 계획과 비교 범위

새 벤치마크는 사용자 데이터를 사용하지 않고 16개 팀, 팀당 23명 선수, 시즌당 30 MatchDay·팀별 최대 30경기인 double round-robin fixture를 합성한다. 요청 크기 100/500/1,000은 여러 시즌으로 분산한다. 각 계산은 같은 객체 identity의 cold/warm cache를 따로 3회 측정하며 중앙값, 범위, heap delta를 기록한다.

측정 함수는 구현된 공개 엔진 경로 중 `playerSeasonStats` population, `buildGlobalRankingData`, `leagueCompetition`, `buildSeasonAnalytics`, `combinationStats`의 다섯 유형, `seasonAwards`, `JSON.stringify/parse` restore proxy를 포함한다. 실제 browser localStorage/IndexedDB 복구시간이나 네트워크 초기 화면은 브라우저에서 계측하지 않으면 미측정으로 보고한다. 경기 변경 시 새 배열·새 객체로 다시 계산하는 구간도 측정하고 모든 출력의 안정적 요약값을 기록해 전후 equality를 확인한다.

측정 전 가설은 `App.tsx`의 모든 화면 정적 import가 초기 chunk에 포함되고, combo/season 집계가 반복 탐색 가능성이 있다는 점이다. 가설은 결과가 확인되기 전 최적화 근거로 취급하지 않는다. 비용이 의미 있게 큰 경로만 최적화한다.

## 선택한 구조

1. **Runtime 계산:** 프로파일된 함수만 작은 변경으로 최적화한다. 중복 산출물은 한 계산 호출 내에서 공유하고, 전역 mutable cache를 추가하기 전에 기존 immutable identity/revision cache와 무효화 경계를 우선 활용한다. 새/수정/삭제 경기, 팀/선수 변경, 시즌/대회 필터 변경 때 결과가 갱신되어야 한다.
2. **조합 계산:** 6차의 category selector와 모든 tie/eligibility 규칙을 유지한다. 기본 Records 정렬을 바꾸지 않는다. 후보 누락 금지.
3. **React / loading:** `App.tsx`에서 실제 route screen을 dynamic import하여 화면 단위로 필요할 때 로드한다. 기존 Store/Auth/App shell, route state, GitHub Pages base와 직접 경로 동작을 유지한다. `Suspense`는 짧고 명확한 loading fallback을 표시하고, 이미 있는 `StartupBoundary`가 chunk rejection을 recovery/reload 화면으로 처리한다.
4. **캐시:** 정확성·입력 완전성·반환 객체 소유권이 확인되지 않는 캐시는 늘리지 않는다. 5차에서 제거한 `competitionMatches` mutable-input cache는 복구하지 않는다.
5. **릴리스 메타데이터:** `package.json`, `package-lock.json`, `src/config.ts` 및 현재 버전 테스트를 2.5.4로 정합한다. schema/protocol/rating revision은 건드리지 않는다. 기존 changelog가 없으면 짧은 실제 변경 기록을 문서화한다.

## 검증

- 100/500/1,000 realistic synthetic benchmark에서 최적화 전후 중앙값·범위·heap delta와 주요 chunk를 비교한다.
- 계산 결과 summary, category winner, rating, standings 및 MatchDay snapshots가 전후 정확히 일치하는지 검증한다.
- 1~6차 전체 및 감사 재현 18개, Store/Import/Draft/Log Match/Cloud/Competition cache 회귀를 유지한다.
- 직접 route 복원, history/back, Suspense, chunk failure recovery를 검증한다.
- TypeScript, lint, build, 전체 테스트, version alignment, `git diff --check`를 실행한다.
- 번들 개선은 초기 eager JS와 모든 JS 총량을 분리 기록한다. 미측정 browser/network 지표는 추측하지 않는다.

## 배포 전 남은 범위

Supabase migration 실제 적용, staging DB/RPC 및 실제 다중 기기 rollout은 이 설계의 대상이 아니다. 누락 선수 Cloud 복구 정책과 tombstone retention도 후속 운영 검증이 필요하다.
