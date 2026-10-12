# Football Tracker v2.5.6 — Competition UI & Match History Overhaul

## 0. 프로젝트 및 작업 기준

Repository: `leedoyoub/football-tracker`

기준 버전: `2.5.5`

목표 버전: **`2.5.6`**

기준 commit: `7d076a6a6cae8e86b503b5de357c496c3ae96b3c`

Rating Engine: REV13 유지

이번 업데이트는 다음 기능을 통합한 UI/UX 개선 릴리스다.

1. League / Cup / Champions 화면 구조 통일
2. 대회별 Players 메뉴 분리
3. Cup Stage별 및 Total 테이블 구현
4. Champions Bracket 메뉴 분리
5. 모든 대회에 Matches 메뉴 추가
6. Matches에 팀별·진행 단계별 필터 추가
7. Home Recent Matches → View All 결과 카드 개선
8. League Table 내부 Overall / Form 선택 기능
9. League Form 최근 3경기 → 최근 5경기 변경
10. League History에 MD별 경기 결과 카드 추가
11. Cup 순위표 미리보기 제거 및 16팀 전체 표시

**중요: 이전에 작성된 v2.5.6 프롬프트는 실행되지 않았다. 따라서 해당 기능이 이미 구현되어 있다고 가정하지 말고 현재 v2.5.5 코드를 기준으로 작업한다.**

작업 전에 현재 브랜치, 최신 commit, working tree, 관련 코드 및 기존 테스트를 확인한다.

이미 존재하는 구현은 재사용하고 중복 로직을 만들지 않는다.

기존 사용자의 변경사항은 절대 무단으로 덮어쓰지 않는다.

---

# 1. 최우선 작업 원칙

기존 Football Tracker의 핵심 도메인 로직은 절대 변경하지 않는다.

다음 사항은 그대로 유지한다.

- Rating REV13
- 평점 계산 계수 및 방식
- MOM 판정
- League 공식 순위와 동률 기준
- Cup 진출·탈락 및 순위 결정 규칙
- Champions 대진표와 시리즈 판정
- Player Ranking
- Award Race
- Best XI 및 Best XI Race
- Match 기록과 경기 이벤트
- 선수 ID 및 이적·방출 기록
- History의 누적 통계
- 뉴스·기록·랭킹 계산
- 기존 저장 키와 데이터 스키마
- Draft 자동 저장·복원
- 경기 편집 및 Import
- Cloud Sync 비활성화 상태

v2.5.5에서 개선한 성능도 유지한다.

특히 경기 계산 캐시, Rating/MOM 재사용, Cup/League/Champions selector 캐시, 선수 통계 인덱스, Chemistry 캐시, IndexedDB 연결 최적화를 훼손하지 않는다.

이번 작업은 주로 화면 구성, 조회용 데이터 모델, 필터 및 결과 카드 개선이다.

기능 요구사항 때문에 의도적으로 변경하는 League Form 최근 경기 수를 제외하고 기존 계산 결과는 동일해야 한다.

---

# 2. Competition 메뉴 구조 전면 통일

경로: Competitions

상단의 League / Cup / Champions 선택 구조는 유지한다.

대회를 선택하면 각 대회에 맞는 메뉴를 제공한다.

## League

상단 메뉴를 다음 네 가지로 구성한다.

- Players
- Table
- History
- Matches

기존 별도 `Form` 탭은 제거한다.

Form은 Table 내부의 하위 선택 기능으로 이동한다.

League 최초 진입 기본 메뉴는 Players로 설정한다.

## Cup

상단 메뉴를 다음 세 가지로 구성한다.

- Players
- Table
- Matches

Cup 최초 진입 기본 메뉴는 Table로 설정한다.

기존 Cup 순위표와 현재 진행 정보는 Table에 배치하고, Ranking/Award/Best XI는 Players로 이동한다.

## Champions

상단 메뉴를 다음 세 가지로 구성한다.

- Players
- Bracket
- Matches

Champions 최초 진입 기본 메뉴는 Bracket으로 설정한다.

기존 추첨 및 토너먼트 대진표는 Bracket에 배치한다.

기존 Ranking/Award/Best XI는 Players로 이동한다.

## 메뉴 선택 상태

각 대회의 메뉴 선택 상태는 독립적으로 관리한다.

예시:
- League에서 History 선택
- Cup으로 이동해 Matches 선택
- 다시 League로 이동하면 이전 League History 상태 유지

Cup의 메뉴 선택 상태가 Champions나 League에 영향을 주면 안 된다.

기존 navigation/back/lastRoute 구조를 분석하고 일관되게 적용한다.

새로고침·이전 화면 복귀·시즌 변경 시 상태가 안전하게 복원되어야 한다.

기존 navigation state의 `form`, `cupViewAll` 등은 호환성을 고려해 안전하게 마이그레이션하거나 무시한다.

---

# 3. Players 메뉴의 공통 구조

League, Cup, Champions 모두 Players에서 동일한 순서로 콘텐츠를 제공한다.

1. 해당 대회 Player Ranking
2. Award Race
3. Best XI / Best XI Race

기존 각 대회의 콘텐츠를 단순히 올바른 메뉴 안으로 이동한다.

## Ranking

기존 RankingMetricTabs와 RankingRow를 재사용한다.

기존 지원 지표, 표시값, 필터, 스와이프, Top 10, View All을 유지한다.

View All은 반드시 해당 대회로 scope되어야 한다.

## Award Race

기존 대회별 Award Race 계산 및 카드 디자인을 그대로 사용한다.

시즌 및 대회별 계산 범위가 달라져서는 안 된다.

## Best XI

기존 전환 기능을 유지한다.

League:
- Team of the Month
- League Best XI

Cup:
- Team of the Stage
- Cup Best XI

Champions:
- Team of the Round
- Champions Best XI

최종 수상 확정 여부에 따른 Best XI / Best XI Race 표기도 유지한다.

## 성능

현재 선택되지 않은 메뉴의 무거운 Ranking, Award, Best XI 계산은 가능하면 실행하지 않는다.

기존 DeferredCompetitionPanels와 엔진 캐시를 분석해 필요하다면 구조를 안전하게 재편한다.

화면을 분리하면서 같은 데이터를 여러 번 계산하는 회귀가 발생하지 않도록 한다.

---

# 4. League Table — Overall / Form 통합

기존 League의 Table과 Form을 하나의 Table 메뉴에 통합한다.

Table 내부에 두 가지 선택 버튼을 배치한다.

- Overall
- Form · Last 5

기본 선택은 **Overall**이다.

## Overall

기존 공식 League StandingsTable을 그대로 사용한다.

기존 순위, 승점, GD, GF-GA, 승무패 기록, Rank Movement, Team 클릭 기능을 유지한다.

## Form

기존 최근 3경기 기준을 **최근 5경기** 기준으로 변경한다.

각 팀에서 기록된 가장 최근 League 5경기만 사용한다.

5경기보다 적게 기록된 팀은 현재까지 기록된 경기만 반영한다.

다른 대회 경기는 포함하지 않는다.

다음 지표를 최근 5경기 기준으로 계산한다.

- P
- W
- D
- L
- GF
- GA
- GD
- Pts

기존 Form의 순위 정렬 방식과 동률 기준은 유지한다.

선택한 시즌 내부 경기만 사용한다.

경기 정렬은 기존 canonical chronology를 재사용한다.

Form은 공식 League 전체 순위가 아니라 최근 경기력 비교용 순위표임을 작은 안내 문구로 표시한다.

기존 독립 Form 탭으로 저장된 화면 상태가 있다면 새 Table → Form 선택으로 호환 복원할 수 있도록 검토한다.

Form 관련 기존 테스트는 5경기 기준으로 갱신하고, 별도의 회귀 테스트를 추가한다.

---

# 5. League History — MD Results 추가

기존 League History의 다음 요소는 그대로 유지한다.

- Matchday 슬라이더
- Matchday 완료 여부
- Position History 그래프
- 비교 팀 선택
- 기존 Standing Table
- 이전 화면 복귀 및 스크롤 복원

순위표 아래에 새로운 섹션을 추가한다.

제목: `MD Results`

## 경기 카드

선택한 MD에 실제로 기록된 League 경기만 표시한다.

모바일 기준 **4열 그리드**로 배치한다.

Home의 작은 Recent Matches 카드 디자인과 동일한 시각적 스타일을 사용한다.

단, 대회 라벨은 생략한다.

경기 결과 색상은 기존과 동일하다.

- Win: 초록색
- Draw: 노란색
- Loss: 빨간색

기록 팀 로고와 스코어를 표시한다.

경기 카드 또는 명확한 클릭 영역을 누르면 해당 Match Detail로 이동한다.

기존 Home Recent Matches 디자인을 변경하지 않는다.

필요하다면 공통 컴포넌트로 분리하되 Home 화면은 시각적으로 기존과 동일해야 한다.

## 정렬

경기는 해당 Matchday에서 최초 기록된 순서대로 표시한다.

기록 시점 또는 기존 저장 순서의 안정적인 기준을 사용한다.

수정 때문에 기존 경기의 최초 기록 순서가 바뀌어서는 안 된다.

과거 경기의 기록 순서를 알 수 없는 경우에는 기존 배열 순서를 안정적인 fallback으로 사용한다.

경기 날짜, 팀 이름, 스코어에 따라 임의 재정렬하지 않는다.

다른 Matchday 경기를 섞지 않는다.

최대 16경기를 표시할 수 있어야 한다.

일부 경기만 기록된 MD는 해당 경기만 표시한다.

`LeagueSnapshot.matches`가 누적 경기 목록일 수 있으므로, 선택된 MD의 경기만 정확히 필터링한다.

## 이동 및 상태 보존

Match Detail을 열었다가 Back으로 돌아오면 다음 요소를 복원한다.

- 기존 MD
- 비교 팀 선택
- Position History 상태
- 스크롤 위치

경기 수정·삭제 시 MD Results가 즉시 올바르게 갱신되어야 한다.

---

# 6. Cup — Players / Table / Matches 구조

Cup 화면에서는 Ranking, Award Race, Best XI를 Players로 이동한다.

Table에는 Cup Stage별 및 Total 순위표를 배치한다.

기존 Cup 헤더, 시즌, 진행 정보, 우승 정보는 유지한다.

기존 Cup 엔진의 공식 진행 단계와 사용자가 조회 중인 과거 Stage를 명확하게 분리한다.

과거 Stage를 선택했다고 실제 대회 진행 상태나 기록 입력 가능한 Stage가 변경되어서는 안 된다.

---

# 7. Cup Table — Stage별 / Total 선택

Cup Table 상단에 다음 선택 메뉴를 추가한다.

- Stage 1
- Stage 2
- Stage 3
- Stage 4
- Stage 5
- Stage 6
- Stage 7
- Final
- Final Replay (실제로 필요한 경우)
- Total

모바일에서는 가로 스크롤 가능한 선택 UI를 사용한다.

**Total 버튼은 항상 쉽게 접근할 수 있게 배치한다.**

예를 들어 Stage 선택은 가로 스크롤로 표시하고 Total은 우측 고정 영역에 배치하는 방식을 검토한다.

기존 앱의 버튼 스타일을 재사용한다.

## 기본 선택

현재 실제로 진행 중인 Stage가 기본 선택된다.

예시:

- Stage 1 진행 중 → Stage 1
- Stage 1 완료 → Stage 2
- Stage 2 완료 → Stage 3
- Stage 7 완료 → Final
- Final 동률 및 재경기 필요 → Final Replay
- 최종 대회 종료 → 실제 마지막 결승 Stage

사용자가 과거 Stage나 Total을 직접 선택하면 선택 상태를 유지한다.

시즌 변경 시 새 시즌의 현재 Stage를 기본 선택한다.

미래 Stage는 조회 대상으로 노출하지 않는다.

단, 이전 Stage 완료로 진출 팀이 확정된 직후 아직 경기를 치르지 않은 현재 Stage는 조회 가능해야 한다.

---

# 8. Cup Stage별 테이블 — 항상 16팀 표시

**중요: 앞서 논의한 '해당 Stage 참가 팀만 표시' 방식은 최종 설계에서 변경되었다.**

최종 확정 방식:

모든 Stage별 테이블에는 **항상 전체 16팀을 표시**한다.

각 Stage에서:

1. 해당 Stage 참가 팀은 테이블 상단에 배치
2. 이전 Stage에서 탈락한 팀은 테이블 하단에 배치
3. 하단 탈락 팀은 기존 Cup 공식 순위 순서대로 정렬
4. 과거 Stage를 조회할 때 미래 Stage의 탈락 결과가 반영되지 않도록 처리

예시: Stage 3 진행 중

- 1~12위: Stage 3 참가 팀
- 13~14위: Stage 2 탈락 팀
- 15~16위: Stage 1 탈락 팀

## 해당 Stage 참가 팀

통계는 선택한 Stage에서 기록한 경기만 사용한다.

- W-D-L
- GF-GA
- GD
- Pts

순위는 기존 공식 Cup Stage Ranking 규칙을 사용한다.

At Risk / Surviving / Survival Line을 유지한다.

Stage 경기가 아직 하나도 기록되지 않았다면 임의로 하위 2팀을 At Risk로 확정하지 않는다.

## 이전 탈락 팀

이전 Stage의 탈락 팀은 하단에 배치한다.

기존 회색 Eliminated 스타일을 유지한다.

`Eliminated · Stage N` 문구를 표시한다.

통계는 해당 팀이 탈락한 시점까지의 Cup 누적 기록으로 고정한다.

이는 현재 Stage 참가 팀의 Stage 단독 통계와 범위가 다르므로, 사용자에게 의미가 혼동되지 않도록 작은 안내 문구를 유지한다.

## 완료된 Stage 조회

완료된 Stage를 조회할 때에는 당시 상태를 복원한다.

예시:

현재 Stage 5까지 진행한 상태에서 Stage 2 선택:

- Stage 2 참가했던 14팀 표시
- Stage 2에서 탈락한 2팀은 Eliminated 표시
- Stage 1 탈락 2팀은 하단에 Eliminated 표시
- 총 16팀
- Stage 3~5의 결과는 반영하지 않음

당시 적용된 공식 순위, 탈락, 경계 동률을 보존한다.

완료된 Stage의 하위 2팀은 이미 탈락이 확정된 상태이므로 단순 At Risk로 잘못 표시하지 않는다.

## Final / Final Replay

Final과 Final Replay는 기존 결승 규칙을 사용한다.

결승 참가 2팀을 상단에 표시하고 나머지 14팀은 이전 탈락 순서에 따라 하단에 배치한다.

결승에서는 일반 Stage의 하위 2팀 탈락 규칙을 적용하지 않는다.

우승 및 준우승 확정, 재경기 필요 상태를 기존 엔진 결과와 일치시킨다.

---

# 9. Cup Total — 전체 공식 순위표

Total을 선택하면 전체 16팀의 Cup 누적 기록을 표시한다.

## 공식 순위

단순 누적 승점순으로 정렬하면 안 된다.

기존 Cup 엔진의 공식 진출·탈락 순위를 사용한다.

최종 대회 종료 기준:

- 1위: Champion
- 2위: Runner-up
- 3~4위: Stage 7 탈락
- 5~6위: Stage 6 탈락
- 7~8위: Stage 5 탈락
- 9~10위: Stage 4 탈락
- 11~12위: Stage 3 탈락
- 13~14위: Stage 2 탈락
- 15~16위: Stage 1 탈락

같은 Stage에서 탈락한 팀끼리는 기존 공식 Cup 판정 결과를 재사용한다.

대회 진행 중에는 공식 Cup 엔진의 잠정 순위를 표시한다.

## 누적 통계

Stage 1부터 현재까지 실제 기록된 모든 Cup 경기를 누적한다.

- P
- W
- D
- L
- GF-GA
- GD
- Pts

Final Replay가 진행되었다면 기록된 재경기도 포함한다.

기존 `cup.rows`는 참가 팀과 탈락 팀의 통계 범위가 다르므로 이를 Total 통계로 그대로 사용하면 안 된다.

기존 공식 rank와 전체 `cumulativeStandings` 데이터를 올바르게 결합하는 구조를 우선 검토한다.

## UI

Total에서는 모든 팀을 동일한 일반 순위표 행으로 표시한다.

다음 스타일을 사용하지 않는다.

- At Risk 주황색
- Eliminated 회색
- 투명도 감소
- Survival Line
- Surviving 상태 문구

팀 이름 아래 작은 보조 텍스트로 컵 성적을 표시한다.

예시:

- Champion
- Runner-up
- Stage 7
- Stage 6
- Stage 5
- Stage 4
- Stage 3
- Stage 2
- Stage 1

대회 진행 중인 생존 팀은 확정되지 않은 최종 성적처럼 오해할 수 있는 문구를 표시하지 않는다.

필요하다면 `Active · Stage N`을 사용한다.

상단에 다음 안내를 표시한다.

- 진행 중: `Provisional Standings`
- 종료 후: `Final Standings`

모바일 화면이 좁아지지 않도록 별도의 Stage 열은 추가하지 않는다.

---

# 10. Cup 미리보기 기능 제거

현재 Cup 테이블은 일부 팀만 표시한 후 `View All 16` 버튼으로 확장한다.

이 동작을 완전히 제거한다.

변경사항:

- 모든 Stage에서 전체 16팀 항상 표시
- Total에서도 전체 16팀 항상 표시
- `View All 16` 제거
- `Show Survival Line` 제거
- 일부 행만 보여주는 slice 기반 미리보기 제거
- 기존 Survival Line 자체는 Stage 테이블에서 유지

`cupViewAll` 관련 상태와 분기 코드를 정리한다.

단, 오래된 navigation state를 읽을 때 오류가 발생하지 않도록 호환성을 유지한다.

---

# 11. Champions — Players / Bracket / Matches

Champions 화면에 독립적인 메뉴를 제공한다.

## Players

기존 콘텐츠 이동:

- Champions Ranking
- Award Race
- Best XI / Best XI Race
- Team of the Round
- Champions Best XI

기존 계산 방식과 결과는 변경하지 않는다.

## Bracket

기존의 다음 기능을 유지한다.

- Round of 16 추첨
- 추첨 진행 상태
- Quarter-finals
- Semi-finals
- Final
- Final Replay
- 경기별 점수
- 대진표 시각화
- 진출 팀 / 승리 팀
- 클릭 가능한 팀 상세
- 현재 라운드 표시

기존 대진표 디자인과 가로 스크롤을 유지한다.

선수 랭킹과 수상 콘텐츠를 Bracket 아래에 표시하지 않는다.

## Matches

새로운 공통 Matches 메뉴를 사용한다.

Champions 경기만 표시한다.

Team 및 Round 필터를 제공한다.

---

# 12. 모든 대회에 Matches 메뉴 추가

**이번 업데이트의 핵심 공통 기능이다.**

League, Cup, Champions에 각각 Matches 메뉴를 추가한다.

세 대회에서 같은 공통 컴포넌트를 사용한다.

## 기본 조회 조건

- 현재 선택된 시즌
- 현재 선택된 대회
- 해당 조건의 모든 기록 경기
- 최신 경기부터 내림차순 정렬
- 최대 5개가 아니라 전체 결과 표시

정렬에는 기존 `newestMatches()`와 canonical chronology를 사용한다.

동일 날짜 또는 레거시 경기의 순서도 기존 결과 목록과 일관되게 유지한다.

다른 시즌 및 다른 대회의 경기가 섞이지 않아야 한다.

## Team 필터

첫 번째 필터:

`All Teams`

선택된 시즌과 대회에서 조회 가능한 팀을 선택할 수 있다.

기존 정적 팀 순서를 유지한다.

필터는 해당 팀에 귀속되는 실제 경기 기록을 기준으로 동작해야 한다.

단순히 현재 Player.teamId 또는 현재 로스터를 기준으로 경기 범위를 제한하지 않는다.

이적·방출 이전 경기도 올바르게 조회되어야 한다.

경기당 canonical 기록 팀과 `isRecordedForTeam()` 등의 기존 도메인 규칙을 검토해, 상대 팀 이름만 등장한 경기를 잘못 귀속시키거나 중복 결과를 생성하지 않도록 한다.

## League 필터

두 번째 필터:

`All Matchdays`

선택 항목:
- MD 1~MD 30

선택한 MD에 해당하는 League 경기만 표시한다.

예시:
- Team: Real Madrid
- Matchday: MD 12

→ 해당 시즌 Real Madrid의 League MD12 경기만 표시.

## Cup 필터

두 번째 필터:

`All Stages`

선택 항목:
- Stage 1~7
- Final
- Final Replay (실제 존재하는 경우)

선택한 Stage에서 기록된 Cup 경기만 표시한다.

이 필터는 Cup 테이블 Stage 선택과 독립적으로 동작한다.

## Champions 필터

두 번째 필터:

`All Rounds`

선택 항목:
- Round of 16
- Quarter-finals
- Semi-finals
- Final
- Final Replay (실제 존재하는 경우)

같은 Round에 여러 게임이 있는 경우 전체를 최신순으로 표시한다.

예를 들어 Round of 16을 선택하면 해당 라운드의 Game 1/3, 2/3, 3/3 기록이 조회 대상이다.

Game 단위 필터는 이번 버전에서 추가하지 않는다.

## 필터 조합

Team 필터와 진행 단계 필터는 동시에 적용한다.

필터 변경 후 결과가 즉시 갱신되어야 한다.

결과가 없는 경우 기존 Empty State 디자인을 사용한다.

시즌 및 대회 변경 시 이전 선택 때문에 잘못된 결과가 보이지 않도록 안전하게 기본 필터를 설정한다.

Back으로 복귀할 때는 해당 Matches의 필터와 스크롤 위치가 복원되어야 한다.

---

# 13. Home → Recent Matches → View All 결과 카드 수정

현재 구조:

- Home Recent Matches의 작은 카드
- View All → ResultsScreen
- ResultsScreen 내부 ResultCard

**이번 수정 대상은 View All에서 열리는 ResultCard와 새 대회 Matches에서 재사용할 ResultCard다.**

Home의 작은 Recent Matches 5개 카드 디자인은 유지한다.

## 제거할 요소

기존 결과 카드의 다음 문구를 제거한다.

`vs Opponent`

팀 이름 오른쪽 끝에 표시되는 상대 팀의 원형 아이콘도 완전히 제거한다.

상대 팀 로고가 비어 있어서 동그라미로 보이는 문제를 해결한다.

상대 팀 로고가 정상적으로 존재하는 경우에도 해당 오른쪽 아이콘은 표시하지 않는다.

## 새 카드 레이아웃

왼쪽:

- 기록 팀 로고
- 기록 팀 이름

팀 이름 바로 아래:

- 경기 대회
- 진행 단계 정보

오른쪽 끝:

- 경기 스코어
- W / D / L 배지

오른쪽에 불필요한 빈 공간이 없도록 flex 구조를 정리한다.

팀 이름과 메타데이터는 남은 공간을 사용하고, 스코어와 결과 배지는 오른쪽에 고정한다.

모바일 화면에서 팀 이름이 길어도 스코어가 밀리지 않도록 한다.

기존 카드 높이, 라운드, 배경, 테두리 스타일과 최대한 일관되게 구현한다.

## 메타데이터 표시 규칙

League:

`League · MD 12`

Cup:

`Cup · Stage 3`

결승:

`Cup · Final`

재경기:

`Cup · Final Replay`

Champions:

`Champions · R16 · Game 2/3`

`Champions · QF · Game 1/3`

`Champions · SF · Game 3/3`

`Champions · Final · Game 1/2`

정확한 정보는 기존 `competitionIdentityForMatch()` 및 `competitionContext.ts`의 공통 포맷터를 활용한다.

하드코딩된 텍스트로 경기 단계를 추측하지 않는다.

레거시 경기에서 메타데이터가 불완전하면 안전한 fallback을 제공한다.

## 클릭 동작

팀 로고 또는 팀 이름은 기존처럼 Team Detail로 이동할 수 있어야 한다.

카드의 경기 정보 영역과 스코어를 클릭하면 Match Detail로 이동한다.

중첩 button 및 잘못된 접근성 구조를 만들지 않는다.

키보드 포커스, 터치 영역, aria-label을 유지한다.

## 공통 컴포넌트

`src/components/ResultCard.tsx`를 중심으로 개선한다.

다음 두 곳에서 완전히 동일한 카드 디자인을 사용한다.

1. Home Recent Matches → View All
2. League / Cup / Champions → Matches

각 화면에 별도의 비슷한 JSX를 복사하지 않는다.

---

# 14. 경기 결과 데이터 및 정렬

주요 파일:

- `src/lib/results.ts`
- `src/screens/ResultsScreen.tsx`
- `src/components/ResultCard.tsx`
- `src/engine/matchChronology.ts`
- `src/engine/competitionContext.ts`

기존 `DerivedResult`, `derivedResults()`, `recentDerivedResults()`를 우선 재사용한다.

기존 유효 경기 판정과 결과 계산 기준을 유지한다.

승/무/패와 스코어는 기존 기록 팀 기준의 `teamPerspectiveScore()` 결과를 사용한다.

경기 데이터는 읽기 전용으로 처리한다.

UI 필터 또는 카드 표시에 필요한 파생 정보 때문에 저장된 Match 객체를 변경하지 않는다.

경기를 클릭했을 때 원본 matchId를 사용해 정확한 상세정보로 이동한다.

---

# 15. Screen State 및 Navigation 설계

현재 `ScreenStateByView['competition']`의 기존 단일 `tab` 상태를 분석한다.

이번 개편에서는 대회별 메뉴와 하위 선택이 독립적이어야 한다.

권장 상태:

- League selected menu
- League Table mode: Overall / Form
- League History selected MD
- League History compared teams
- Cup selected menu
- Cup selected table stage / Total
- Cup Award Stage
- Champions selected menu
- Champions Award Round
- Matches team filter
- Matches matchday/stage/round filter

상태 구조는 실제 앱 아키텍처에 맞게 최적화한다.

중복 상태나 불필요한 전역 Store 상태를 만들지 않는다.

화면 조회용 상태는 NavigationEntry의 ScreenState에 두는 방식을 우선한다.

기존 `lastRoute` 복원 및 상태 유효성 검증을 갱신한다.

기존 저장 키와 경기 데이터 스키마는 변경하지 않는다.

이전 버전에서 복원된 상태에 새 필드가 없더라도 안전하게 기본값을 사용해야 한다.

기존 별도 Form 탭에서 복원한 상태는 가능한 경우 Table → Form으로 대응한다.

시즌 변경 시 Cup Stage, Matches 필터, League MD가 유효한지 다시 검증한다.

---

# 16. v2.5.5 성능 최적화 유지

이전 업데이트에서 개선한 계산 캐시 및 엔진 호출 구조를 반드시 보존한다.

특히 다음 경로의 성능 회귀를 방지한다.

- Home derivation
- League History derivation
- League/Cup/Champions selector
- Chemistry cache
- Player ranking
- Match Detail
- Competition Award
- IndexedDB

새로운 메뉴 구조를 구현하면서 숨겨진 Players 데이터를 매번 계산해서는 안 된다.

현재 선택된 메뉴에서 사용하는 데이터만 계산하는 방식을 우선한다.

Matches 필터 변경 시 대회 엔진의 공식 순위를 불필요하게 재계산하지 않는다.

필터는 기존 canonical 경기 메타데이터를 활용한다.

사용자가 다른 메뉴에 다녀와도 가능한 경우 캐시된 조회 결과를 재사용한다.

기능과 정확성을 훼손하는 과도한 메모이제이션은 하지 않는다.

기존 16팀×23명, 다중 시즌 대용량 성능 테스트도 유지한다.

---

# 17. 필수 회귀 테스트

## A. League

- Players 메뉴 기존 결과 동일
- Table → Overall 기본값
- Table → Form Last 5
- 최근 5경기만 반영
- 5경기 미만 기록 처리
- League 외 경기 제외
- History 기존 그래프 동일
- History 기존 누적 순위 동일
- MD Results 기록 순서
- MD Results 경기 클릭
- MD 변경 및 Back 복원
- Matches 팀 필터
- Matches MD 필터
- 필터 복합 적용

## B. Cup

- Players의 Ranking/Award/Best XI 기존 결과 동일
- Table Stage 선택
- 현재 Stage 자동 선택
- 과거 Stage 조회
- 모든 Stage 16팀 표시
- Stage별 참가 팀 통계
- 이전 탈락 팀 공식 순위
- 이전 탈락 팀 회색 UI
- At Risk 주황색
- Survival Line
- 완료된 Stage 탈락 처리
- 미래 탈락 결과 미반영
- 동률 및 Elimination Draw
- Final 및 Final Replay
- Total 16팀
- Total 공식 Cup 순위
- Total 누적 통계
- Total 일반 행 UI
- 미리보기 버튼 완전 제거
- Matches 팀 및 Stage 필터

## C. Champions

- Players 기존 Ranking/Award/Best XI 동일
- Bracket 기존 시각화 유지
- 추첨 기능
- 각 라운드 대진표
- 결승 및 재경기
- Matches 팀 필터
- Matches Round 필터
- Game 1/3, 2/3, 3/3 표시
- 브래킷과 Players 계산·상태 분리

## D. Results UI

- Home 작은 Recent Matches 카드 변경 없음
- Results 전체 목록 정상 표시
- vs Opponent 제거
- 오른쪽 상대 아이콘 제거
- 정확한 MD/Stage/Round/Game 표시
- 스코어 오른쪽 정렬
- W/D/L 배지 유지
- 팀 클릭
- 경기 클릭
- 모바일 긴 팀명 처리
- 레거시 데이터 fallback
- 키보드 접근성

## E. 데이터 및 저장

- Rating REV13 결과 동일
- MOM 동일
- Cup 공식 순위 동일
- Champions 진행 규칙 동일
- 기존 Best XI 동일
- 이적·방출 선수의 과거 기록 보존
- 경기 수정·삭제 후 UI 갱신
- Draft 자동 저장 및 복원
- Import·Backup
- Navigation/Back/Scroll 복원
- v2.5.5 저장 데이터 호환성
- Cloud Sync 비활성화 유지

기존 테스트를 삭제하거나 검증 기준을 완화하지 않는다.

---

# 18. 버전 업데이트

모든 구현 및 회귀 테스트를 통과한 다음 버전을 `2.5.6`으로 올린다.

다음 파일을 동기화한다.

- `package.json`
- `package-lock.json`
- `src/config.ts`

기존 릴리스 metadata 테스트의 버전 기대값도 필요한 범위에서 갱신한다.

Rating REV13은 절대 변경하지 않는다.

저장 키 `football-tracker-v1` 및 기존 데이터 스키마를 유지한다.

불필요한 패키지 추가는 금지한다.

---

# 19. 전체 검증

반드시 실행한다.

```bash
npm test
npm run lint
npm run build
git diff --check
```

그리고 기존 v2.5.5 성능 벤치마크를 가능한 범위에서 재실행해 주요 엔진 경로의 성능 회귀를 확인한다.

신규 lint 오류 및 경고는 0개여야 한다.

테스트에서 기능이 달라진 부분은 요구사항에 맞게 검증하고, 수정 범위와 관계없는 기존 기능은 정확한 동등성 비교를 유지한다.

전체 diff를 감사한다.

특히 다음을 확인한다.

- 불필요한 도메인 로직 변경 없음
- 저장 로직 변경 없음
- 경기 데이터 스키마 변경 없음
- 중복 컴포넌트 없음
- 중복 계산 없음
- 사용하지 않는 구형 UI 코드 정리
- React Hooks 규칙 준수
- Navigation state 호환성

---

# 20. Commit / Push / Deploy

모든 작업과 검증이 완료되면:

1. 최종 diff 감사
2. 버전 `2.5.6` 확인
3. Git commit 생성
4. `origin/main` push
5. GitHub Actions 실행 확인
6. GitHub Pages 배포 성공 확인
7. 공개 자산의 실제 버전 확인
8. 최종 작업 상태 확인

배포 실패 시 성공했다고 보고하지 않는다.

기존 사용자 데이터가 초기화되지 않도록 저장 및 PWA 호환성을 확인한다.

---

# 21. 최종 보고서

작업 완료 후 다음 항목을 정리해 보고한다.

### A. 구현 결과

- 대회별 메뉴 구조
- League Table / Form
- League History MD Results
- Cup Stage별 16팀 테이블
- Cup Total 테이블
- Champions Bracket 분리
- 대회별 Matches 필터
- Results 카드 UI

### B. 검증

- 공식 League/Cup/Champions 결과 유지
- Ranking / Award / Best XI 유지
- Rating REV13 유지
- 저장 및 데이터 호환성
- Navigation / Back / Scroll
- 성능 회귀 여부

### C. 빌드 및 배포

- 변경 파일
- 신규 테스트 수
- 전체 테스트 통과 수
- lint 결과
- build 결과
- 벤치마크 결과
- commit SHA
- push 상태
- Actions URL
- Pages 배포 상태

---

# 최종 성공 기준

**Football Tracker v2.5.6은 세 대회의 메뉴 구조를 통일하고, 과거 경기와 대회 성적을 더 편하게 조회할 수 있도록 개선하는 업데이트다.**

League:
- Players / Table / History / Matches
- Table 내부 Overall / Form Last 5
- History MD Results 4열 카드

Cup:
- Players / Table / Matches
- 모든 Stage에서 16팀 전체 표시
- 이전 탈락 팀은 공식 순위에 따라 회색으로 하단 배치
- Stage별 At Risk / Eliminated / Survival Line 유지
- Total은 일반 16팀 누적 순위표
- 미리보기 버튼 제거

Champions:
- Players / Bracket / Matches
- 기존 추첨 및 대진표 완전 보존

Matches:
- 각 대회 전체 경기 최신순
- 팀별 필터
- MD / Stage / Round 필터
- 기존 Results 카드와 디자인 공유

Results:
- vs Opponent 제거
- 상대 원형 아이콘 제거
- 경기 상세 메타데이터 추가
- 오른쪽 스코어 / W-D-L 자연스러운 정렬

기존 도메인 계산, 기록 데이터, 저장 시스템, Rating REV13, v2.5.5 성능 최적화는 유지한다.

**이제 현재 저장소를 분석한 뒤 설계·구현·테스트·최종 감사·커밋·푸시·배포까지 수행하라.**