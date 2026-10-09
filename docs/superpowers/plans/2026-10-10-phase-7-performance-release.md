# 7차 성능 최적화 및 패치 릴리스 구현 계획

> **For agentic workers:** 사용자가 7차 측정·구현·검증까지 승인했다. 현재 작업자가 아래 단계를 순서대로 실행하며 기존 미커밋 변경을 보존한다.

**Goal:** 실제 측정된 병목을 줄이고 초기 JS 로딩을 분할하며, 기능·저장 안전성을 보존한 2.5.4 코드를 완성한다.

**Architecture:** 100/500/1,000경기의 현실적 합성 fixture 벤치마크로 계산 기준선을 만들고 결과가 같은 범위에서만 최적화한다. App shell과 기존 `StartupBoundary`를 유지하면서 route screen을 lazy import한다. 패키지/앱 패치 버전만 2.5.4로 동기화한다.

**Tech Stack:** TypeScript, React 19, Vite 8/Rolldown, Node built-in test runner, oxlint.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-7-performance-release-design.md`

## Global Constraints

- Rating REV13 및 기존 모든 계산·동률·대회 규칙 유지.
- 기존 저장 키/형식, Store coordinator, Import/Draft/Log Match/Cloud 안전성 유지.
- 기존 1~6차 미커밋 변경을 삭제·되돌리지 않는다.
- Supabase DB, RLS, RPC, migration 및 Cloud protocol은 변경하거나 적용하지 않는다.
- 새 제품 의존성, 사용자 데이터 조작, commit/push/deploy 금지.
- 패치 버전만 `2.5.3`에서 `2.5.4`로 변경한다.

## Review Focus

- 30 matchday/팀/시즌 상한: 합성 fixture 팀이 시즌당 30회 초과하지 않는지 벤치마크 생성 검증.
- 동일 참조의 cache: cold/warm과 immutable entity replacement 결과가 같고 변경 후 갱신되는지 benchmark assertions.
- combo winner tie/eligibility: 6차 결과 유지 여부 기존+신규 Award tests.
- lazy route 직접 복원/Back: state/history 유지와 실제 화면 로드 integration 검증.
- chunk failure: Suspense 무한 로딩 없이 recovery UI에 도달하는지 StartupBoundary 검증.

---

### Task 1: 재현 가능한 성능 기준선 스크립트

**Files:**
- Create: `scripts/benchmark-engine.cjs`
- Create: `tests/performance-benchmark.test.cjs` (생성 데이터의 도메인 상한과 summary consistency만 검사)
- Modify: `package.json` (benchmark script)

**Interfaces:** `node scripts/benchmark-engine.cjs --sizes=100,500,1000 --rounds=3`은 median/min/max, heap delta, cold/warm, 결과 summary를 JSON/표로 출력한다.

- [ ] 팀 16개, 팀별 23명, 시즌당 30라운드·240팀 경기 상한에서 합성 경기 수 100/500/1,000을 만든다.
- [ ] 점수/득점/라인업/이벤트 ID와 시즌·대회 범위를 결정적으로 생성한다.
- [ ] 선수 시즌 집계, global ranking, League, Season Analytics, 조합 5종, Season Awards, JSON save/restore proxy를 각각 측정한다.
- [ ] 각 입력 크기별 3회 cold/warm median과 heap delta, 결과 summary를 기록한다.
- [ ] 1차 benchmark와 package runner로 재현성을 확인한다.

### Task 2: 측정된 hot path 최적화

**Files:** Task 1 결과에 따라 실제 hotspot이 있는 기존 engine module과 대응 test만 수정한다.

**Interfaces:** 기존 공개 계산 함수 및 결과 타입을 유지한다.

- [ ] profile상 상위 비용을 원인별로 분류하고, 미미하거나 개선 근거 없는 경로는 손대지 않는다.
- [ ] 중복 match/player lookup 및 동일 계산을 한 호출/동일 snapshot에서만 공유한다.
- [ ] global mutable cache를 추가하기 전 현재 revision/identity cache가 재사용 가능한지 확인한다.
- [ ] benchmark summary와 핵심 개별 결과를 변경 전후 비교하고 exact equality를 검증한다.
- [ ] 캐시 replacement, season/team/type 변경, match add/edit/delete invalidation 테스트를 실행한다.

### Task 3: Route-level code splitting 및 recovery

**Files:**
- Modify: `src/App.tsx`
- Modify: `tests/production-boot.test.cjs` 및 route/boot 테스트
- Modify only if necessary: `src/components/StartupBoundary.tsx`

**Interfaces:** `App` default export와 기존 navigation/props는 그대로 유지하고 route screens는 `React.lazy`/dynamic import로 로드한다.

- [ ] 무거운 non-home route screens를 dynamic import하고 loading fallback을 둔다.
- [ ] 이미 전역에 설치된 `StartupBoundary`가 chunk reject를 Recovery/Reload UI로 처리하는지 검증한다.
- [ ] app shell와 Home 초기 chunk 크기 및 모든 chunk 합계를 빌드 결과에서 기록한다.
- [ ] GitHub Pages base, app boot, route restore, back/history, Draft state 테스트를 실행한다.
- [ ] async chunk 개수와 shared chunk를 리뷰해 지나친 분할이 없도록 조정한다.

### Task 4: React warnings/실제 중복 개선 리뷰

**Files:** 측정·lint로 확인된 컴포넌트 및 회귀 테스트에 한정한다.

- [ ] `NewMatchScreen` compiler memo warnings와 `store.tsx` ref publisher warning의 원인을 읽고, 안전하고 범위 내인 수정만 한다.
- [ ] lint 경고 억제, dependency 약화, Store publisher 변경은 하지 않는다.
- [ ] 원인 해결이 위험하거나 경고가 도구 오탐으로 판명되면 근거와 잔여 경고로 기록한다.

### Task 5: 앱 패치 버전 2.5.4 및 릴리스 노트

**Files:**
- Modify: `package.json`, `package-lock.json`, `src/config.ts`
- Modify: 현재 메타데이터 정합성을 확인하는 release tests
- Create: `docs/releases/2.5.4.md` (기존 릴리스 로그 패턴이 확인되면 그 위치에 기록)

- [ ] 실제 버전 참조와 current-version assertions를 전수 확인한다.
- [ ] package, lock package root, app display version을 2.5.4로 맞춘다.
- [ ] 저장 schema, storage key, Cloud protocol, Rating REV13은 그대로인지 test한다.
- [ ] 실제 완료한 개선을 기록하고 미배포 상태를 분명히 한다.

### Task 6: 전체 회귀·성능·최종 감사

**Files:** 필요한 회귀 테스트와 benchmark report만 추가/갱신한다.

- [ ] 전체 npm test, 18개 phase1 audit repro, 308+ calculation focused tests 및 저장/Log Match/Cloud suites를 실행한다.
- [ ] 100/500/1,000 benchmark를 전후 동일 옵션으로 재실행한다.
- [ ] TypeScript, lint, production build, version alignment, `git diff --check`를 실행한다.
- [ ] 초기 eager JS, 전체 JS, 모든 chunk 수와 cold/warm benchmark median을 비교한다.
- [ ] Git 상태를 검토하고 1~6차 작업을 보존한 채 최종 결과 및 배포 전 남은 staging/Cloud 위험을 보고한다.

## Execution record

- Implemented the synthetic benchmark runner, realistic 16-team/30-matchday schedule, data-cap test, JSON round-trip proxy, changed-array cache measurement, and before/after result hashes.
- Optimized combination analytics with a call-local index for larger scopes; retained the original lookup path for scopes below 200 matches.
- Lazy-loaded 23 route screens under `Suspense`; the existing startup error boundary provides chunk failure recovery.
- Updated patch release metadata and release note to 2.5.4. Rating REV13 and storage/cloud versions remain unchanged.
- Final checks: 854 unit tests, 18 phase-1 reproductions, TypeScript, lint, production build, version consistency, and `git diff --check` passed. Lint reports existing warnings, including the investigated New Match memo and synchronous Store ref publisher warnings.
- Build output: 548.62 kB initial JavaScript entry (159.02 kB gzip), 952.44 kB across all emitted JavaScript chunks. The 500 kB entry warning remains.
- No commit, push, deployment, or database/migration operation was performed.
