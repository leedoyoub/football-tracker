# 6차 계산 정합성 구현 계획

> **For agentic workers:** 이 계획은 사용자 요청에 따라 현재 작업자가 순차 실행한다. 각 단계는 회귀 테스트로 검증한다.

**Goal:** 표시된 공식 지표에 맞는 시즌 조합 수상자를 선택하고 1차 감사 Best Attack Trio 실패를 해결한다.

**Architecture:** 기존 `combinationStats`는 탐색·집계와 Records 기본 정렬을 계속 담당한다. `analytics.ts`에 부문 지표별 eligible winner selector를 분리하고 Season Recap과 Home CB insight가 이를 재사용한다. REV13·MOM·대회·저장/cloud 경계는 변경하지 않는다.

**Tech Stack:** TypeScript, React/Vite, Node built-in test runner.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-6-calculation-consistency-design.md`

## Global Constraints

- Rating Engine Revision은 13으로 유지한다.
- 승인된 수상 지표, MOM tie-break, 대회 규칙, 기존 필터 의미를 변경하지 않는다.
- 기본 `combinationStats` / Records 정렬을 수상자 선정 때문에 바꾸지 않는다.
- 기존 사용자 데이터, 저장 키, 1~5차 변경사항을 보존한다.
- 운영 DB, migration, Cloud protocol, commit, push, deploy는 변경·실행하지 않는다.

## Review Focus

- 대회·시즌 필터: selector 입력으로 만들어진 조합만 비교되는지 기존 season filter 테스트 재사용.
- 같은 수상 지표 동률: 원래 조합 순서로 유지되는지 새 테스트.
- 자격 미달 조합: `eligible` 후보에서 제외되는지 새 테스트.
- CB GA/90 0분·0으로 나누기: 기존 eligibility상 180분 미만 후보 제외를 새 테스트.
- 표 정렬과 선정 정렬: `combinationStats` 결과가 유지되는지 새 테스트.

---

### Task 1: 실패 재현과 수상 comparator 테스트

**Files:**
- Modify: `tests/audit/phase1-risk-repros.test.cjs`
- Create: `tests/combination-awards.test.cjs`

**Interfaces:** 기존 `seasonRecap()`이 공개한 Season Award 결과와 `combinationStats()` 원시 집계를 검증한다.

- [x] Best Attack Trio 감사 테스트만 실행해 `P1/P2/P3`가 선택되고 기대값 `P4/P5/P6`와 달라 실패하는 것을 기록한다.
- [x] 각 combo category별로 긴 overlap과 낮은 displayed metric 조합이 기본 첫 후보가 되는 반례를 만든다.
- [x] 먼저 실행해 selector 부재/현재 선정 오류를 확인한다.

### Task 2: 부문별 eligible winner selector 구현

**Files:**
- Modify: `src/engine/analytics.ts`
- Modify: `tests/combination-awards.test.cjs`

**Interfaces:** `selectBestCombinationForAward(rows: CombinationStats[], kind: CombinationKind): CombinationStats | undefined`를 제공한다. `rows`는 기존 `combinationStats` 결과이며 eligible subset만 비교한다.

- [x] `duo`, `attack`, `midfield`, `cb`, `backFour` 각각 표시 지표 방향으로 winner를 고르는 테스트를 작성한다.
- [x] metric tie는 입력 row의 원래 순서를 유지하고 ineligible rows는 제외하는 테스트를 작성한다.
- [x] 선형 비교로 호출자의 rows를 변경하지 않도록 구현하고 기본 조합 정렬 함수는 유지한다.
- [x] focused tests를 실행해 통과를 확인한다.

### Task 3: Season Insights 경로에 selector 연결

**Files:**
- Modify: `src/engine/seasonInsights.ts`
- Modify: `tests/combination-awards.test.cjs`
- Verify: `tests/audit/phase1-risk-repros.test.cjs`

**Interfaces:** Season Recap의 5 combo awards와 Home의 Best CB pair는 Task 2 selector를 사용한다.

- [x] 기존 첫 eligible 경로가 수상 지표 기준 selector를 사용하도록 변경한다.
- [x] category winner detail이 선택된 같은 row에서 계산되는지 assertion한다.
- [x] 감사 전체 18/18과 기본 combination list 비변경을 확인한다.

### Task 4: 관련 계산 회귀와 전체 검증

**Files:** 테스트 추가는 위 test 파일에 한정하며 실제 발견된 추가 오류가 없으면 제품 코드 확장을 하지 않는다.

- [x] Rating/Timeline/SOT/Stats/Ranking/Awards/Competition/Records 집중 테스트 308개와 1~5차 감사 재현을 실행한다.
- [x] 전체 테스트, TypeScript, lint, build, `git diff --check`를 실행한다.
- [x] Git 상태와 diff를 검토해 이전 변경, Rating REV13, cloud, migration, UI를 보존했는지 확인한다.
- [x] 결과와 남은 7차/Cloud rollout 위험을 보고한다.

## Completion record

- `npm.cmd test`: 852/852; 집중 계산 회귀: 308/308; phase1 감사 재현: 18/18.
- TypeScript 통과, lint 종료 코드 0(기존 경고 포함), build 성공(930.94 kB chunk 경고), `git diff --check` 통과.
- 선택 수정은 `analytics.ts`와 `seasonInsights.ts`; REV13·대회·MOM·기본 조합 정렬은 보존했다.
- Cloud rollout 및 Supabase staging 검증은 미완료이며 이번 단계에서 cloud/DB 변경은 하지 않았다.
