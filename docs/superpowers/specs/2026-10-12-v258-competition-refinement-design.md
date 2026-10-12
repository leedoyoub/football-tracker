# Football Tracker v2.5.8 — Competition UI & Survival Line Refinement

## 0. 프로젝트 및 작업 목표

Repository: `leedoyoub/football-tracker`

기준 버전: **v2.5.7**

목표 버전: **v2.5.8**

기준 commit: `53ea649b56741e7f50954e61023a19f65982f2e4`

Rating Engine: **REV13 유지**

현재 v2.5.7의 모든 기능을 유지하면서 아래 4가지 사항을 개선한다.

1. League History의 팀별 순위 변화 그래프에서 팀 비교 선택 버튼 크기 축소
2. Cup Table의 Stage/Total 버튼 크기 및 표기 방식 개선
3. Cup Table의 진행 중인 Stage에서 실제 경기 완료 팀을 기준으로 움직이는 Survival Line 및 At Risk 구현
4. Champions Bracket에서 탈락 확정 팀의 로고와 이름을 살짝 어둡게 표시

이전 프롬프트에서 제안한 사항들은 아직 실행하지 않았다.

위 네 가지를 이번 작업에 모두 포함한다.

새로운 기능 추가나 대회 판정 규칙 변경은 금지한다.

---

# 1. 작업 전 코드 분석 및 설계

작업을 시작하기 전에 다음 파일과 의존 관계를 분석한다.

- `src/screens/CompetitionScreen.tsx`
- `src/lib/cupTable.ts`
- `src/engine/competition.ts`
- `src/engine/standings.ts`
- `src/engine/matchPerspective.ts`
- `src/engine/competitionContext.ts`
- `src/components/RankingRow.tsx`
- `src/components/SeasonUI.tsx`
- `src/lib/competitionScreenState.ts`
- 관련 UI 및 공식 대회 판정 테스트

특히 다음 항목을 확인한다.

- Cup 공식 Stage 순위의 source of truth
- 현재 Stage의 실제 경기 기록 및 참가 팀 판정
- `cupCompetition()`의 공식 탈락·진출 계산
- `cupTableModel()`의 조회용 Stage/Total 테이블 생성
- 과거 Stage 조회 시점 복원
- `cup.rows`와 `stageRanking()`의 역할
- 완료된 Stage와 진행 중인 Stage의 차이
- `Elimination Draw` 계산 및 표시
- Cup 조회용 캐시와 무효화 조건
- Champions `pairing.winnerId`와 경기별 승리 팀의 차이

**중요: 화면 표시를 위한 잠정 순위 모델과 공식 대회 진행을 결정하는 엔진 모델을 분리한다.**

증상별 임시 패치보다 기존 데이터 흐름과 source of truth를 재사용하는 구조를 우선한다.

---

# 2. League History — 팀 비교 버튼 축소

대상 화면:

Competitions → League → History

Position History 그래프 위의 팀별 비교 선택 버튼을 수정한다.

현재 코드에는 대략 다음 스타일이 적용되어 있다.

`min-h-10 shrink-0 rounded-full px-3 text-[10px]`

이 때문에 기존 RankingMetricTabs 버튼보다 세로로 크게 표시된다.

## 변경 사항

기존 RankingMetricTabs의 기본 metric 버튼과 동일한 크기를 적용한다.

기준 스타일:

- `rounded-full`
- `px-3 py-1.5`
- `text-[10px]`
- `font-bold`

불필요한 `min-h-10`을 제거한다.

기존 선택/미선택 색상을 유지한다.

- 선택: emerald 배경 + 검정 글자
- 미선택: zinc 배경 + 회색 글자

버튼 사이 간격은 기존 작은 ranking pill과 일치시킨다.

## 기능 유지

다음은 절대 변경하지 않는다.

- 최대 4팀 비교
- 팀 선택과 선택 해제
- 16팀 가로 스크롤
- 선택 팀 목록
- Position History 그래프
- 그래프 선 색상
- 그래프 포커스
- 그래프 가로 스크롤 및 복원
- Matchday 선택
- Back 복원
- 리그 순위 계산

비교 버튼은 **다중 선택 버튼**이다.

단일 선택을 전제로 하는 RankingMetricTabs를 무조건 적용해서 한 팀만 선택 가능하게 만들지 않는다.

공통 스타일만 재사용하거나 적절한 공통 pill primitive를 사용한다.

그래프 내부의 포커스용 버튼은 이번 작업의 변경 대상이 아니다.

---

# 3. Cup Table — Stage/Total 버튼 디자인 변경

대상 화면:

Competitions → Cup → Table

현재 Stage 선택 버튼은 RankingMetricTabs의 일반 metric 크기로 표시되어 있다.

이를 League의 `Team of the Month`에서 `1-1`, `1-2` 등을 선택하는 버튼과 동일한 디자인과 크기로 변경한다.

현재 `AwardScopeSelector`의 스타일을 기준으로 한다.

## 버튼 크기

기준:

- `rounded-full`
- `px-2.5 py-1`
- `text-[10px]`
- `font-black`

선택 색상과 미선택 색상 역시 AwardScopeSelector와 통일한다.

- 선택: `bg-emerald-400 text-black`
- 미선택: `bg-zinc-800 text-zinc-300`

공통 UI 컴포넌트를 확장하는 경우 이 크기를 위한 별도 variant를 추가해도 된다.

다만 기존 RankingMetricTabs, 상위 navigation pills, AwardScopeSelector의 다른 사용처에 의도치 않은 변경이 생기면 안 된다.

## Stage 표기 축약

Cup Table의 선택 버튼 텍스트만 다음과 같이 변경한다.

- Stage 1 → `s1`
- Stage 2 → `s2`
- Stage 3 → `s3`
- Stage 4 → `s4`
- Stage 5 → `s5`
- Stage 6 → `s6`
- Stage 7 → `s7`
- Final → `Final`
- Final Replay → `Replay`
- Total → `Total`

내부 Stage 식별자는 기존 `stage1`, `stage2` 등의 값을 그대로 사용한다.

실제 Cup 진행 상태, 테이블 제목, 경기 메타데이터, Results 카드 등 다른 곳의 Stage 명칭은 변경하지 않는다.

즉, **선택 버튼의 표시 문자열만 축약**한다.

## 레이아웃

기존 구조 유지:

- Stage 선택 버튼은 가로 스크롤
- Total 버튼은 별도 고정 영역
- 모바일에서 스테이지 선택 가능
- 현재 선택된 버튼 명확히 강조
- 전체 화면 가로 스크롤 방지

Stage를 선택했을 때 자동으로 선택 버튼이 보이도록 하되, 페이지의 세로 스크롤을 건드리지 않는다.

기존 현재 Stage 기본 선택, 과거 Stage 조회, Total 전환, 시즌 변경 시 초기화는 그대로 유지한다.

---

# 4. Cup Table — 진행 중 Survival Line 개선

이번 업데이트의 핵심 기능이다.

현재 `cupCompetition()`은 Stage 참가 팀 전체에 대해 순위를 계산하고 하위 2팀을 At Risk로 판정한다.

반면 `cupTableModel()`은 아직 해당 Stage 경기가 전혀 없으면 At Risk를 숨긴다.

사용자가 원하는 동작은 다음과 같다.

**진행 중인 Stage에서는 실제로 경기를 치른 팀만 잠정 순위를 구성하고, 그 팀들 가운데 하위 최대 2팀을 At Risk로 표시한다.**

Survival Line은 그 At Risk 그룹 바로 위에 위치한다.

경기를 기록한 팀이 늘어나면 Survival Line이 순위표 아래쪽으로 이동한다.

그러나 실제 Cup 탈락 판정은 Stage 전체가 완료되었을 때만 기존 공식 엔진이 수행한다.

---

# 5. 진행 중 Stage의 순위표 구성

Stage 1~7에서 아직 모든 참가 팀이 경기를 완료하지 않은 경우 적용한다.

## 그룹 A — 경기 완료 팀

해당 Stage에서 실제 경기 기록이 있는 참가 팀들이다.

- 테이블 상단 배치
- 해당 Stage 성적 사용
- 기존 공식 Cup tie-break 순서 사용
- 이 그룹에서 잠정 At Risk 결정

## 그룹 B — 미경기 팀

해당 Stage에 참가하지만 아직 경기 기록이 없는 팀들이다.

- 경기 완료 팀 바로 아래 배치
- 상태: `Not Played`
- At Risk로 표시하지 않음
- 주황색 강조 적용하지 않음
- 별도의 임의 탈락 가능성 순위를 만들지 않음

미경기 팀의 상대적 정렬은 기존 Stage의 안정적인 정렬 기준을 유지하되, 실제 경기 결과로 결정된 순위처럼 오해되지 않도록 표시한다.

## 그룹 C — 이전 Stage 탈락 팀

이미 이전 Stage에서 탈락한 팀들이다.

- 가장 아래 배치
- 기존 공식 Cup 순위 유지
- 회색 Eliminated 스타일 유지
- `Eliminated · Stage N` 표시
- 탈락 당시 누적 통계 유지

그룹 A, B, C를 모두 합쳐 **언제나 16팀 전체를 표시한다.**

예를 들어 Stage 3 진행 중이면:

- 참가 팀 12팀: 경기 완료 팀 + 미경기 팀
- 이전 탈락 팀 4팀
- 총 16팀

화면에서 보여주는 잠정 순위를 정렬할 때 원본 Match, 공식 Stage Ranking, 공식 탈락 결과를 변경하지 않는다.

필요하다면 현재 Stage 참가 팀에 대해서만 1부터 시작하는 표시용 `displayRank`를 만든다.

순서가 변경되었는데 행의 번호가 예전 순서대로 남아 있는 현상은 없어야 한다.

이전 탈락 팀의 공식 순위는 그대로 유지한다.

---

# 6. At Risk 및 Survival Line의 정확한 규칙

실제로 경기한 참가 팀 수를 `P`라고 한다.

진행 중인 Stage의 잠정 At Risk 팀 수는 다음과 같다.

`min(2, P)`

따라서 다음 규칙을 적용한다.

| 경기 완료 팀 수 P | 잠정 Surviving | 잠정 At Risk | Survival Line |
|---|---:|---:|---|
| 0 | 0 | 0 | 표시 안 함 |
| 1 | 0 | 1 | 1위 팀 위 |
| 2 | 0 | 2 | 1위 팀 위 |
| 3 | 1 | 2 | 1위와 2위 사이 |
| 4 | 2 | 2 | 2위와 3위 사이 |
| 5 | 3 | 2 | 3위와 4위 사이 |
| 6 | 4 | 2 | 4위와 5위 사이 |

같은 원칙을 참가 팀 전체가 경기할 때까지 적용한다.

## 예시: 1팀만 경기

- 1위: Team A — At Risk
- Survival Line은 Team A 위
- 나머지 참가 팀: Not Played
- 이전 Stage 탈락 팀: Eliminated

Team A 한 팀만 At Risk로 표시한다.

경기하지 않은 팀을 임의로 두 번째 At Risk에 포함하지 않는다.

## 예시: 2팀 경기

- Team A — At Risk
- Team B — At Risk
- 두 팀 위에 Survival Line
- 나머지 참가 팀: Not Played

## 예시: 3팀 경기

- 1위: Team A — Surviving
- Survival Line
- 2위: Team B — At Risk
- 3위: Team C — At Risk
- 나머지 참가 팀: Not Played

## 예시: 5팀 경기

- 1~3위: Surviving
- Survival Line
- 4~5위: At Risk
- 나머지 참가 팀: Not Played

경기 결과에 따라 At Risk 대상은 계속 달라질 수 있다.

**경계선이 이동하는 것은 잠정 상태 표시이며 탈락 확정이 아니다.**

---

# 7. 경기 완료 팀 판정

실제 경기 완료 여부는 기존 Cup 엔진의 `hasPlayed`, `teamsCreditedWithResult`, Stage 경기 스코프와 동일한 도메인 기준을 사용한다.

새로운 자의적인 경기 판정 규칙을 만들지 않는다.

중요:

- 해당 시즌의 해당 Cup Stage 경기만 반영
- 현재 Stage의 유효한 참가 팀만 포함
- 동일 팀이 여러 기록에 등장하더라도 완료 팀 수는 한 번만 계산
- 홈/원정 경기 귀속의 기존 규칙 유지
- Champions 경기 제외
- League 경기 제외
- 이전 Cup Stage 경기 제외
- 미기록 경기나 다른 Stage 경기로 완료 처리하지 않음
- 저장 데이터 수정·삭제 후 즉시 갱신

기존 Cup 엔진이 공식적으로 참가 팀을 어떻게 경기 완료 처리하는지 확인하고 그 기준을 재사용한다.

경기 완료 팀 수가 1, 3, 5 같은 홀수인 경우도 정확하게 처리한다.

---

# 8. Survival Line 렌더링 위치

현재 `CupView`는 행의 상태가 `at-risk`로 전환되는 위치에서 Survival Line을 렌더링한다.

하지만 첫 번째 행부터 At Risk인 경우에도 경계선이 올바르게 표시되어야 한다.

규칙:

- At Risk가 0팀이면 Survival Line 없음
- At Risk가 1팀이면 해당 팀 위에 표시
- At Risk가 2팀이면 두 팀 중 첫 번째 팀 위에 표시
- Survival Line은 각 Stage에서 하나만 표시
- Not Played 그룹 시작 위치에 잘못된 Survival Line을 추가하지 않음
- 이전 Stage 탈락 팀 사이에 새로운 Survival Line을 추가하지 않음

기존 주황색 계열의 Survival Line 스타일을 유지한다.

진행 중일 때는 `Provisional Survival Line` 또는 짧은 잠정 상태 안내를 추가해도 된다.

테이블이 지나치게 복잡해지지 않도록 안내 문구는 작게 유지한다.

라인 위치는 임의의 고정 순위가 아니라 실제 현재 표시 모델에서 계산한다.

---

# 9. Stage 완료 후 기존 공식 규칙 유지

**가장 중요한 제한 사항이다.**

모든 참가 팀의 Stage 경기가 완료되면 새 잠정 순위 표시 규칙을 중단한다.

그 시점부터 기존 공식 Cup 엔진의 최종 Stage Ranking, 탈락 결과, 동률 기준을 그대로 표시한다.

예를 들어 Stage 1 완료:

- 1~14위: 생존
- 14위와 15위 사이: Survival Line
- 15~16위: `Eliminated · Stage 1`
- 탈락 팀 회색 처리
- At Risk 주황색 제거

Stage 2 완료:

- Stage 2 참가 14팀의 기존 공식 결과 유지
- 해당 Stage에서 탈락한 2팀 회색 처리
- 기존 Stage 1 탈락 2팀은 아래에 유지
- 총 16팀

## 과거 Stage 조회

현재 Stage 5까지 진행되었더라도 Stage 2를 선택하면:

- Stage 2 완료 당시의 공식 순위
- 당시 생존 팀
- Stage 2 탈락 팀
- Stage 1 탈락 팀
- 당시 Survival Line

을 표시한다.

Stage 3~5의 기록과 탈락은 과거 Stage에 소급 반영하지 않는다.

Stage가 완료된 후에는 추가적인 잠정 At Risk 로직을 적용하지 않는다.

## 공식 엔진 보호

다음 함수 및 규칙을 변경하지 않는다.

- `cupCompetition()`의 공식 진출·탈락 계산
- `stageRanking()`의 공식 comparator
- 공식 tie-break
- `boundaryTieIds()`의 공식 의미
- Elimination Draw
- Stage 진출 팀 수
- Champion / Runner-up 결정
- Final / Final Replay

가능하면 변경 사항을 `cupTableModel()` 및 UI 전용 projection에 국한한다.

완료 Stage 여부는 공식 엔진의 완료 상태를 기준으로 판단한다.

단순히 화면의 표시 행 수나 저장된 경기 개수로 임의 추측하지 않는다.

---

# 10. Elimination Draw 처리

진행 중인 Stage의 잠정 At Risk와 실제 Elimination Draw는 서로 다른 개념이다.

진행 중에는 아직 경기하지 않은 팀이 존재할 수 있으므로, 임의의 동률을 공식 탈락 경계 동률처럼 표시하면 안 된다.

다음 원칙을 적용한다.

- 진행 중: Provisional At Risk 표시
- 진행 중: 공식 Elimination Draw가 확정된 것처럼 표시하지 않음
- 완료 후: 기존 공식 Elimination Draw 판정 유지
- 과거 완료 Stage: 당시 공식 경계 동률 결과 유지

실제 참가 팀 전체의 결과가 확정되기 전에는 미경기 팀과의 0점 동률을 기준으로 잘못된 경계 동률 안내가 나오지 않도록 한다.

공식 Stage 판정 결과와 조회용 잠정 상태를 분리한다.

---

# 11. Cup Final / Final Replay / Total 보호

이번 이동형 Survival Line은 **Stage 1~7의 진행 중인 화면에만 적용한다.**

다음 화면에는 적용하지 않는다.

## Final

- 기존 결승 참가 팀 표시
- 기존 경기 결과 및 우승 판정
- 일반 Stage의 하위 2팀 탈락 규칙 적용 금지
- Survival Line 표시 금지

## Final Replay

- 기존 재경기 규칙
- 기존 승리·우승 판정
- Survival Line 표시 금지

## Total

- 전체 16팀 유지
- 전체 Cup 누적 통계 유지
- 기존 공식 잠정/최종 순위 유지
- At Risk 표시 금지
- Survival Line 표시 금지
- Eliminated 회색 처리 금지
- 기존 일반 테이블 행 디자인 유지

이번 작업으로 Total의 공식 순위가 Stage 내 잠정 순위에 영향을 받아서는 안 된다.

---

# 12. Champions Bracket — 탈락 팀 시각적 구분

대상:

Competitions → Champions → Bracket

현재 대진표는 경기 결과에 따라 승리/패배 색상을 표시하지만, 최종 탈락 팀의 로고와 팀 이름은 일반 팀과 거의 동일한 밝기로 표시된다.

이를 개선한다.

## 요구사항

각 대진 카드에서 해당 라운드의 승패가 최종 확정된 경우:

- 승리/진출 팀: 기존 밝기 유지
- 탈락 팀: 로고와 팀 이름을 살짝 어둡게 표시
- 아직 승부가 확정되지 않은 팀: 기존 밝기 유지

권장 탈락 팀 opacity:

`0.55 ~ 0.65`

기본값은 약 `0.6`을 사용한다.

완전히 회색으로 숨기거나 식별이 어렵게 만들지는 않는다.

## 정확한 판정 기준

현재 `ChampionsBracket`의 `pairing.winnerId`를 우선 활용한다.

탈락 판정은 해당 pairing의 최종 승리 팀이 확정되었을 때만 적용한다.

다음 이유만으로 어둡게 표시하면 안 된다.

- 해당 경기에서 한 번 패배
- Game 1/3 패배
- Game 2/3 패배
- 현재 스코어 열세
- 이후 라운드에서 탈락
- 현재 대회의 champion이 아님

즉, 해당 라운드의 시리즈가 최종 종료되어 탈락이 확정된 팀만 어둡게 처리한다.

## 예시

Real Madrid가 R16에서 Barcelona를 이겼다면:

- Real Madrid: 정상 밝기
- Barcelona: 로고·팀명 어둡게

Real Madrid가 이후 8강에서 탈락했다면:

- R16의 Real Madrid: 정상 밝기
- 8강의 Real Madrid: 어둡게

미래 라운드의 탈락 결과를 과거 대진 카드에 소급 적용하면 안 된다.

## UI 적용 범위

어둡게 처리하는 대상:

- 해당 팀의 로고
- 해당 팀의 이름

기존 상태 유지:

- 경기별 스코어
- 스코어 W/L 색상
- 경기 진행 수
- 대진 카드 배경
- 대진표 연결선
- 다음 라운드 진출 팀
- 우승 트로피
- Team Detail 클릭
- 모바일 대진표 가로 스크롤

`TBD`, 아직 확정되지 않은 pairing, projected pairing은 기존 상태를 유지한다.

실제 탈락 팀이어도 팀을 클릭할 수 있어야 한다.

가능하다면 접근성 레이블로 `Eliminated` 상태를 구분한다.

## Final / Final Replay

최종 우승 팀이 확정된 경우 준우승 팀을 동일하게 어둡게 처리한다.

결승이 아직 미확정이거나 재경기가 필요한 경우에는 양 팀 모두 탈락 확정으로 표시하지 않는다.

기존 공식 winner 판정만 사용한다.

---

# 13. 성능 및 캐시 보존

v2.5.7에서 유지 중인 최적화를 보호한다.

특히:

- Cup Competition selector cache
- `cupTableModel()` cache
- League History cache
- Champions bracket projection
- Ranking 및 Rating cache
- Match derivation cache

진행 중 Stage의 경기 완료 팀과 At Risk는 입력된 경기 데이터를 기준으로 계산한다.

경기 추가, 수정, 삭제 또는 Stage 변경 시 올바르게 다시 계산되어야 한다.

하지만 UI 전환만으로 공식 Cup 엔진을 불필요하게 반복 계산해서는 안 된다.

가능하면 기존 Stage standings, 경기 배열 및 selector 결과를 재사용한다.

원본 데이터를 mutate하지 않는다.

UI 표시용 임시 객체를 기존 저장 상태에 저장하지 않는다.

불필요한 새 dependency를 추가하지 않는다.

---

# 14. 필수 회귀 테스트

기존 전체 테스트를 삭제하거나 약화하지 않는다.

v2.5.7의 모든 테스트와 계산 동등성 검증을 유지한다.

## A. League History 팀 선택

- 기존 팀 비교 버튼의 크기 축소
- RankingMetricTabs와 동일한 크기
- 최대 4팀 선택
- 팀 선택/해제
- 가로 스크롤
- 그래프 포커스
- Back 복원
- 순위 데이터 동일

## B. Cup Stage 버튼

- Stage 버튼 크기가 Team of the Month 선택 버튼과 동일
- s1~s7 표기
- Final / Replay / Total 표기
- 실제 Stage ID 유지
- 선택 변경 정상
- Total 고정
- 가로 스크롤
- 기본 Stage 유지
- 시즌 변경 시 초기화

## C. Cup 진행 중 Survival Line

다음 모든 경기 완료 팀 수를 테스트한다.

- 0팀
- 1팀
- 2팀
- 3팀
- 4팀
- 5팀
- 6팀
- 전체 팀

필수 결과:

- P=0: At Risk 0, Line 0
- P=1: At Risk 1, Line은 첫 경기 팀 위
- P=2: At Risk 2, Line은 첫 경기 팀 위
- P=3: At Risk 2, Line은 1위/2위 사이
- P=4: At Risk 2, Line은 2위/3위 사이
- P=5: At Risk 2, Line은 3위/4위 사이

추가 검증:

- 경기 완료 팀 먼저 표시
- 미경기 팀은 Not Played
- 이전 탈락 팀은 하단 유지
- 항상 16팀
- 올바른 표시 순위
- Stage별 공식 동률 기준으로 경기 완료 팀 정렬
- 중복 경기 및 레거시 기록
- 경기 수정·삭제 후 재계산
- 현재 Stage와 과거 Stage 혼동 없음
- 잠정 At Risk는 공식 진출·탈락에 영향 없음

## D. Cup 완료 Stage

- Stage 1 완료
- Stage 2 완료
- Stage 7 완료
- 완료 Stage 하위 2팀 Eliminated
- 완료 Stage에 At Risk 없음
- Survival Line은 탈락 2팀 위
- 공식 순위 동등성
- 과거 Stage 시점 복원
- 동률 및 Elimination Draw
- Total 변경 없음
- Final / Final Replay 변경 없음

## E. Champions Bracket

- R16 탈락 팀 어둡게
- QF 탈락 팀 어둡게
- SF 탈락 팀 어둡게
- Final 준우승 팀 어둡게
- 미완료 시리즈에서는 양 팀 기존 밝기
- 개별 경기 패배만으로 어둡게 처리하지 않음
- 이후 라운드 탈락을 과거 라운드에 소급 적용하지 않음
- TBD/projected pairing 유지
- Team Detail 이동 유지
- 스코어 색상 동일
- 대진표 연결선 및 가로 스크롤 유지
- 기존 공식 Champions 결과 동일

## F. 공통 회귀

- Rating REV13 동일
- MOM 동일
- League 공식 순위 동일
- Cup 공식 순위 및 탈락 동일
- Champions 진출·우승 판정 동일
- Ranking/Award Race/Best XI 동일
- Match 기록 및 팀 귀속 동일
- 저장 데이터 및 스키마 동일
- Navigation/Back/Scroll 동일
- v2.5.7 캐시 및 성능 유지

---

# 15. 버전 업데이트

모든 변경을 검증한 후 앱 버전을 다음과 같이 업데이트한다.

**2.5.7 → 2.5.8**

동기화할 파일:

- `package.json`
- `package-lock.json`
- `src/config.ts`

관련 버전 assertion 테스트도 함께 갱신한다.

다음은 변경하지 않는다.

- Rating REV13
- 저장 키 `football-tracker-v1`
- 기존 Match/Player/Team 스키마
- Import/Backup 형식
- Cloud Sync 설정
- PWA 업데이트 정책

새로운 데이터 마이그레이션이 필요하지 않은 UI 변경을 원칙으로 한다.

---

# 16. 검증 및 전체 감사

다음 명령을 모두 실행한다.

- `npm test`
- `npm run lint`
- `npm run build`
- `git diff --check`

추가로:

- 현재 v2.5.7 기준 엔진 계산 동등성 확인
- 기존 성능 벤치마크 재실행
- Cup Stage 변경 시 캐시 정상 동작 확인
- UI 변경 범위 밖 파일의 semantic diff 감사
- 사용하지 않는 구형 분기 정리
- React Hook 및 접근성 검사

가능하면 모바일 브라우저에서 다음을 직접 확인한다.

- 작은 Stage 버튼들의 터치 영역
- Total 버튼의 고정 배치
- Cup Survival Line의 실제 위치
- 1팀·3팀만 경기했을 때 UI
- Champions 탈락 팀의 시각적 대비
- League History 팀 선택 버튼의 가로 스크롤

브라우저 접근이 불가능하면 해당 항목을 미검증으로 명시한다.

---

# 17. Commit / Push / Deploy

전체 테스트와 감사를 통과하면 v2.5.8을 배포한다.

절차:

1. 최종 diff 감사
2. 불필요한 변경 확인
3. 버전 2.5.8 확인
4. Commit 생성
5. `origin/main` push
6. GitHub Actions build 성공 확인
7. GitHub Pages deploy 성공 확인
8. 공개 Pages의 실제 2.5.8 자산 확인
9. 작업 트리 상태 확인

권장 commit 메시지:

`feat: refine cup survival line and competition UI (v2.5.8)`

기존 사용자의 로컬 변경사항이 존재하면 무단으로 덮어쓰지 않는다.

빌드 또는 배포 실패 시 성공했다고 보고하지 않는다.

---

# 18. 최종 보고

작업 완료 후 다음 사항을 정리한다.

- 수정한 UI 목록
- League History 버튼 변경
- Cup Stage 버튼 및 축약 표기
- 경기 완료 팀 기준 Survival Line 계산 방식
- 1팀·3팀·전체 경기 완료 사례 테스트
- 완료 Stage 공식 판정 유지 여부
- Champions 탈락 팀 표시
- 변경 파일
- 추가 테스트
- 전체 테스트 결과
- lint/build 결과
- 성능 결과
- commit SHA
- GitHub Actions 상태
- GitHub Pages 배포 확인

---

# 최종 성공 기준

Football Tracker v2.5.8에서 다음 결과를 달성한다.

**League History**

팀별 순위 변화 그래프의 팀 선택 버튼이 기존 랭킹 항목 선택 버튼과 같은 작은 크기로 표시된다.

**Cup Table**

- Stage 선택 버튼은 Team of the Month의 1-1/1-2 선택 버튼 크기
- Stage 표기는 s1, s2, ..., s7
- Total은 항상 접근 가능
- Stage당 전체 16팀 표시 유지
- 진행 중 Stage는 경기 완료 팀 기준 잠정 At Risk
- 1팀 경기 완료 시 At Risk 1팀
- 3팀 경기 완료 시 At Risk 2팀
- Survival Line은 At Risk 그룹 바로 위
- 미경기 팀은 Not Played
- 완료 Stage는 기존 공식 순위와 Eliminated 표시 유지
- 과거 Stage 기록과 판정 유지
- 실제 공식 탈락·진출 규칙 변경 없음

**Champions Bracket**

- 해당 라운드에서 탈락이 확정된 팀의 로고와 이름만 살짝 어둡게 표시
- 승리 팀과 미확정 팀은 기존 밝기
- 기존 대진표와 판정 유지

**데이터 및 성능**

기존 v2.5.7의 Rating REV13, MOM, 순위, 수상, 경기 기록, 저장 데이터, 성능 최적화를 유지한다.

이제 현재 저장소를 분석하고 위 범위를 설계·구현·테스트한 다음, 최종 감사·버전 업데이트·커밋·푸시·GitHub Pages 배포까지 수행하라.
