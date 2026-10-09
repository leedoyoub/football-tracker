# Football Tracker 6차 계산 정확성 설계

## 목표와 제한

동일한 원시 Match 기록과 필터에서 평점·통계·랭킹·대회·수상 결과가 일관되도록 기존 공식 경로를 검증하고, 재현된 계산 오류만 수정한다. Rating REV13 계수, MOM 동률 규칙, 대회 규칙, 기존 필터 의미와 UI는 유지한다. Cloud/DB, 저장 형식, 성능 중심 캐시 재설계는 범위 밖이다.

## 기준선

- 저장소: `C:\Users\이도엽\football-tracker`, branch `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`.
- 앱 `2.5.3`, Rating Engine REV13.
- 기존 1~5차 변경은 미커밋이며 전부 보존한다.
- 기준 테스트: `npm.cmd test` 847/847 통과. 1차 감사 재현은 17/18이며 Best Attack Trio가 유일한 실패다.

## Source of Truth와 흐름

`Match` 원시 이벤트와 출전 기록이 기준이다. `timeline.ts`와 `rating.ts`가 선수 출전 구간 및 REV13 경기 평점을 계산하고, `stats.ts`와 `analytics.ts`가 선수·팀·조합 집계를 제공한다. `competition.ts`/`seasonAnalytics.ts`가 대회 범위를 파생하고, `awards.ts`와 `seasonInsights.ts`가 랭킹·수상·요약을 구성한다. 화면은 이 파생 모델을 소비한다. 기존 ranking, MOM, REV13, 대회, event-order 및 필터 회귀 테스트를 재사용하고 실제로 확인된 불일치만 신규 테스트로 고정한다.

## 재현 결함과 선택 기준

`seasonInsights.ts`의 `combination()` 및 Home의 Best CB pair가 `combinationStats()` 결과에서 첫 번째 eligible 조합을 사용한다. 일반 조합 표의 기본 순서는 eligible 여부, 함께 뛴 시간, goal difference인데 각 수상 카드의 표시는 별도 지표를 보여준다. 따라서 longest-together 조합이 G+A가 높은 조합보다 먼저 노출될 수 있다.

계산과 기본 Records 정렬은 그대로 둔다. 별도의 수상 선택 함수를 두어 eligible 조합을 표시 지표에 맞게 선택한다.

| 부문 | 표시된 공식 지표 | 우선 방향 |
| --- | --- | --- |
| Best Duo | on-pitch goal difference | 높음 |
| Best Attack Trio | combined G+A | 높음 |
| Best Midfield Trio | average rating | 높음 |
| Best CB Pair | goals against per 90 together | 낮음 |
| Best Back Four | clean sheets | 높음 |

각 수상 지표가 동률이면 기존 `combinationStats` 정렬 순서를 그대로 사용한다. 자격은 기존 `eligible` 계산(3경기 또는 180분)을 재사용한다. GA/90 계산은 기존 화면 표현과 같은 `goalsAgainst / togetherMinutes * 90`을 사용한다. 새로운 규칙·계수는 추가하지 않는다.

## 검증 범위

- Best Attack Trio 감사 재현을 수정 전 실패, 수정 후 통과로 확인한다.
- 다른 4개 부문과 Home Best CB pair도 긴 overlap과 수상 지표가 서로 다른 합성 경기에서 올바른 조합을 선택하는지 확인한다.
- 동률 때 기존 순서 유지, 미자격 조합 제외, 지표 방향, 표의 기본 정렬 유지 테스트를 추가한다.
- 기존 `rating-correctness`, REV13, timeline, SOT, stats, analytics, competition, awards, ranking, Records 및 1~5차 회귀 테스트를 실행한다.

## 남은 불확실성과 후속 범위

이번 조사에서 검증된 수상 기준은 현재 카드의 설명 문구와 계산 필드다. 코드·기존 테스트에서 별도 동률 규칙을 찾지 못한 경우 기존 deterministic 순서를 보존한다. 대규모 계산 성능 및 번들 최적화는 7차에서 프로파일링해 결정한다. Cloud rollout과 Supabase staging 검증은 미완료 상태다.
