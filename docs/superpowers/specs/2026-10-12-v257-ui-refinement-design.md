# Football Tracker v2.5.7 — UI Consistency & Player Detail Refinement

## 0. 프로젝트 및 작업 목표

Repository: `leedoyoub/football-tracker`

기준 버전: **v2.5.6**

목표 버전: **v2.5.7**

기준 commit: `e4ee68f3ab35e2a0d308672b313a149f1d0da0b9`

Rating Engine: **REV13 유지**

이번 업데이트의 목적은 새 기능을 추가하는 것이 아니라 기존 화면의 시각적 일관성과 사용성을 개선하는 것이다.

최종 수정 범위는 다음 5가지다.

1. League / Cup / Champions의 상위 메뉴 버튼 크기 및 디자인 조정
2. League Table의 Overall/Form 및 Cup Table의 Stage/Total 선택 버튼 디자인 통일
3. 팀 상세 화면 Matches의 경기 카드 디자인 통일
4. League History의 MD 슬라이더 색상과 스타일 개선
5. 선수 상세정보의 Rank Trend 기본 스코프 Overall 변경 및 대회 선택 UI 개선

**위 5가지 이외의 기능은 추가하거나 변경하지 않는다.**

특히 시즌·대회 스코프 다중 선택은 이번 버전에서 구현하지 않는다.

---

# 1. 작업 전 코드 분석

수정에 앞서 현재 저장소와 working tree를 점검한다.

다음 사항을 먼저 분석한다.

- 현재 v2.5.6 코드 구조
- 변경되지 않은 사용자 작업 존재 여부
- 상위 메뉴 및 하위 선택 버튼의 공통 컴포넌트 구조
- RankingMetricTabs의 스타일과 스크롤 처리
- TeamDetailScreen의 Matches 데이터 흐름
- ResultsScreen 및 ResultCard의 데이터 구조
- PlayerDetailScreen의 대회 스코프와 진입 경로
- RankTrend의 상태 관리
- League History의 range input 스타일
- NavigationEntry 및 Back 복원
- 기존 v2.5.6 성능 캐시와 회귀 테스트

주요 검토 파일:

- `src/screens/CompetitionScreen.tsx`
- `src/screens/TeamDetailScreen.tsx`
- `src/screens/PlayerDetailScreen.tsx`
- `src/screens/ResultsScreen.tsx`
- `src/components/SeasonUI.tsx`
- `src/components/RankingRow.tsx`
- `src/components/ResultCard.tsx`
- `src/lib/results.ts`
- `src/lib/navigation.ts`
- `src/lib/lastRoute.ts`
- `src/engine/matchPerspective.ts`
- `src/App.tsx`

기존 컴포넌트를 재사용하고, 동일한 디자인을 여러 화면에 별도로 복사하지 않는다.

현재 working tree에 사용자 변경사항이 있다면 무단으로 덮어쓰지 않는다.

---

# 2. 대회 화면의 버튼 계층 개선

대상:

- League
- Cup
- Champions

현재 Competition 화면은 대회 선택 버튼과 Players/Table/Matches 등의 하위 메뉴가 비슷한 크기로 표시되어 시각적 계층이 불명확하다.

이를 세 단계로 구분한다.

## 2.1 첫 번째 단계 — 대회 선택

버튼:

- League
- Cup
- Champions

**기존 UI를 그대로 유지한다.**

수정 금지:

- 버튼 크기
- 배경
- 아이콘
- 선택 색상
- 배치
- 대회 변경 동작

이 버튼들은 최상위 메뉴이므로 현재 크기를 유지한다.

## 2.2 두 번째 단계 — 상위 화면 메뉴

League:

- Players
- Table
- History
- Matches

Cup:

- Players
- Table
- Matches

Champions:

- Players
- Bracket
- Matches

현재 큰 SegmentedControl 스타일을 컴팩트한 pill 스타일로 변경한다.

디자인 요구:

- 기존 RankingMetricTabs와 같은 둥근 pill 형태
- 선택된 버튼은 기존 emerald 배경과 어두운 글자
- 미선택 버튼은 짙은 zinc 배경과 회색 글자
- 버튼 너비는 텍스트 길이에 맞춤
- 화면 너비를 강제로 N등분하지 않음
- 왼쪽 정렬
- 균일한 간격
- 모바일 가로 스크롤 지원
- 선택된 항목 자동 가로 스크롤 보정
- 화면 전체 가로 스크롤 발생 금지

권장 크기:

- 높이 약 36~40px
- 글자 크기 약 12px
- 적절한 좌우 padding

정확한 수치는 기존 컴포넌트 및 모바일 화면 너비를 기준으로 조정한다.

**RankingMetricTabs보다는 아주 조금 크게 만들되 기존 전체 폭 SegmentedControl보다는 시각적으로 가볍게 만든다.**

이 스타일을 세 대회에서 동일하게 사용한다.

상위 메뉴의 기능, 순서, 기본 선택, 독립 상태, Back 복원은 변경하지 않는다.

League 기본 Players, Cup 기본 Table, Champions 기본 Bracket을 유지한다.

## 2.3 세 번째 단계 — 세부 선택 메뉴

대상:

League Table:
- Overall
- Form

Cup Table:
- Stage 1~7
- Final
- Final Replay (필요할 때)
- Total

세부 선택 버튼은 기존 `RankingMetricTabs`와 **동일한 크기 및 디자인**을 사용한다.

현재 RankingMetricTabs의 핵심 스타일:

- `rounded-full`
- `px-3 py-1.5`
- `text-[10px]`
- 선택: `bg-emerald-500 text-black`
- 미선택: `bg-zinc-900 text-zinc-400`

가능하면 RankingMetricTabs를 재사용하거나 동일 스타일의 공통 컴포넌트를 구성한다.

별도의 임의 스타일을 여러 곳에 복사하지 않는다.

### League Table

버튼:

`Overall` / `Form`

기본 선택은 Overall을 유지한다.

Form은 기존 최근 5경기 기준을 그대로 사용한다.

버튼 명칭은 `Form`으로 간결하게 하고, 최근 5경기 기준이라는 설명은 테이블의 작은 보조 텍스트에 표시한다.

Form 계산과 공식 Overall 순위표는 변경하지 않는다.

### Cup Table

Stage/Total 버튼도 같은 작은 pill 스타일로 변경한다.

기존 Stage 선택을 위한 가로 스크롤은 유지한다.

**Total 버튼은 지금처럼 항상 쉽게 접근할 수 있어야 한다.**

Stage 목록을 가로 스크롤하고 Total을 별도 고정 영역에 표시하는 현재 구조가 있다면 해당 구조를 유지하면서 버튼 크기와 스타일만 통일한다.

Cup의 실제 현재 Stage, 사용자가 선택한 조회 Stage, Total 상태는 변경하지 않는다.

기존 16팀 테이블, 과거 탈락 팀 표시, 공식 순위, Survival Line, At Risk, Finals/Replay 계산은 그대로 유지한다.

### 그 밖의 기존 세부 선택

Ranking, Award Race, Team of the Month/Stage/Round 등의 기존 선택 버튼은 이번 작업의 직접적인 변경 대상이 아니다.

이미 RankingMetricTabs 또는 유사한 작은 버튼 스타일을 사용하는 기능은 유지한다.

불필요하게 모든 SegmentedControl의 전역 스타일을 바꿔 다른 화면까지 영향을 주지 않는다.

---

# 3. Team Detail — Matches 카드 디자인 통일

현재 TeamDetailScreen의 Matches는 별도 3열 레이아웃을 사용한다.

현재 구성:

- 왼쪽: MD/Stage/Round 정보
- 가운데: 홈팀 이름 + 스코어 + 원정팀 이름
- 오른쪽: 날짜

이를 v2.5.6에서 개선한 공통 ResultCard 디자인으로 통일한다.

## 변경 후 디자인

왼쪽:

- 조회 중인 팀의 로고
- 조회 중인 팀의 이름
- 해당 경기의 대회 및 진행 단계

오른쪽:

- 해당 팀 관점의 경기 스코어
- W/D/L 결과 배지

예시:

Real Madrid
League · MD 12
3 - 1    W

Home Recent Matches → View All 및 Competition Matches에서 사용하는 카드와 동일한 배경, 테두리, 간격, 타이포그래피, 결과 색상을 사용한다.

기존 `ResultCard.tsx`를 재사용하는 것을 우선한다.

새로운 비슷한 카드 컴포넌트를 중복해서 만들지 않는다.

## 중요한 데이터 처리 조건

TeamDetailScreen의 Matches에는 반드시 **현재 조회 중인 팀의 관점**을 반영한다.

현재 `derivedResults()`는 `recordedTeamId(match)` 기준으로 ResultCard 데이터를 생성한다.

따라서 TeamDetailScreen에서 이 함수를 무조건 그대로 사용하면, 조회 중인 팀이 원정팀이나 상대 팀으로 기록된 경우 스코어·W/D/L이 잘못 표시될 가능성이 있다.

이 문제를 고려하여 다음 원칙을 적용한다.

- 화면에서 조회 중인 `teamId`를 기준으로 카드 표시
- `teamPerspectiveScore(match, teamId)` 등 기존 canonical 계산 활용
- 홈/원정 위치에 따라 스코어와 결과를 올바르게 변환
- Champions의 기존 tracked team 귀속 규칙 유지
- League/Cup의 기존 팀 경기 귀속 규칙 유지
- 같은 Match 중복 표시 방지
- 이적·방출 선수의 현재 소속으로 과거 팀 경기 판단 금지
- 저장된 Match 객체를 변경하지 않음

필요하다면 `DerivedResult`를 생성하는 공통 읽기 전용 helper에 명시적인 `perspectiveTeamId`를 전달할 수 있도록 설계한다.

그러나 기존 ResultsScreen과 CompetitionMatches에서 사용하던 기록 팀 관점은 변경하지 않는다.

기존 Home/Competition 결과의 팀명, 스코어, W/D/L이 달라져서는 안 된다.

## 그대로 유지할 기능

- Team Detail의 Overview / Matches / Players 메뉴
- Matches의 All Competitions / League / Cup / Champions 필터
- 기존 필터 선택 상태
- 현재 선택된 시즌 범위
- 기존 전체 경기 목록
- 기존 경기 정렬
- 정확한 Match Detail 이동
- Back 및 스크롤 복원
- 빈 경기 목록 안내

팀별 Matches에 새로운 MD/Stage/Round 필터를 추가하지 않는다.

Home의 작은 Recent Matches 카드는 수정하지 않는다.

Home → Recent Matches → View All 카드도 시각적으로 변경하지 않는다.

Competition Matches의 카드와 필터도 기존대로 유지한다.

이번 수정은 **Team Detail의 Matches 카드 디자인을 공통 UI로 통일하는 것**이 목적이다.

---

# 4. League History — Matchday 슬라이더 디자인 개선

현재 League History는 HTML range input을 사용해 MD를 선택한다.

현재 코드에 `accent-emerald-500`이 적용되어 있지만 브라우저 기본 스타일 때문에 트랙이나 손잡이가 앱 테마보다 너무 밝게 보일 수 있다.

이 슬라이더를 앱의 dark theme에 맞는 디자인으로 개선한다.

## 권장 스타일

- 기본 트랙: `zinc-800` 또는 비슷한 어두운 회색
- 진행된 구간: 과도하게 밝지 않은 emerald
- Thumb: 차분한 emerald 원형
- Thumb 테두리: 어두운 zinc
- 지나치게 밝은 흰색 트랙 제거
- 지나치게 큰 기본 브라우저 손잡이 제거
- 필요 이상의 glow/shadow 효과 사용 금지

트랙은 얇고, 손잡이는 조작하기 쉬운 크기로 설정한다.

## 구현 조건

가능하면 scoped CSS와 기존 테마 색상을 활용한다.

WebKit/Blink 및 Firefox의 range thumb/track 스타일을 함께 고려한다.

키보드 조작과 접근성 focus-visible을 유지한다.

터치 기기에서도 기존처럼 드래그할 수 있어야 한다.

시각적 크기를 작게 조정하더라도 터치 조작성은 떨어뜨리지 않는다.

## 변경하지 않는 기능

- MD 최소/최대값
- 현재 MD 계산
- 드래그 및 키보드 선택
- 현재 MD 표시
- Complete/Incomplete 표시
- Position History
- 비교 팀 상태
- MD Results
- 그래프 스크롤
- 선택 상태 및 Back 복원
- 리그 순위 계산

**슬라이더의 디자인만 변경하고 기능과 데이터는 그대로 유지한다.**

---

# 5. Player Detail — Rank Trend 기본 Overall

현재 PlayerDetailScreen의 RankTrend는 다음 상태로 초기화된다.

```tsx
const [selected, setSelected] =
  useState<'overall' | 'position' | 'team'>('position')
```

기본 선택을 `position`에서 **`overall`**로 변경한다.

변경 후:

```tsx
const [selected, setSelected] =
  useState<'overall' | 'position' | 'team'>('overall')
```

다음 선택 항목을 그대로 유지한다.

- Overall
- Position
- Team

기본 진입 시 Overall을 선택하고 전체 선수 기준 순위 추이를 표시한다.

사용자가 Position이나 Team을 선택하면 기존과 동일하게 해당 순위 추이를 표시한다.

중요:

- Rank Trend의 순위 계산 함수 변경 금지
- 포지션 그룹핑 규칙 변경 금지
- 팀 소속 및 이적 기록 처리 변경 금지
- 그래프 데이터·정렬·순위 판정 변경 금지
- Rank Trend metric 선택 기능 유지
- 기존 선택 변경 및 그래프 가로 스크롤 유지
- 성능 및 캐시 구조 유지

기본값 변경을 위해 불필요하게 저장 데이터 스키마를 확장하지 않는다.

---

# 6. Player Detail — Competition Scope 버튼 변경

현재 PlayerDetailScreen 상단에는 두 개의 필터가 있다.

1. 시즌 선택 드롭다운
2. 대회 선택 드롭다운

이번 버전에서는 **시즌 선택 드롭다운은 그대로 유지하고, 대회 선택 드롭다운만 작은 pill 버튼으로 변경한다.**

## 변경 후 구성

시즌 선택:

`Season 1 ▼`

대회 선택:

`All` `League` `Cup` `Champions`

대회 선택 버튼은 기존 RankingMetricTabs와 같은 크기와 디자인으로 표시한다.

스타일:

- 작은 둥근 pill
- 글자 크기 약 10px
- 선택된 항목 emerald
- 미선택 항목 zinc
- 왼쪽 정렬
- 한 줄 가로 배치
- 화면이 좁으면 가로 스크롤
- 선택된 항목 자동 스크롤 보정

가능하면 RankingMetricTabs 또는 작은 공통 선택 컴포넌트를 재사용한다.

## 반드시 유지할 선택 동작

대회는 **단일 선택만 가능**하다.

각 버튼은 기존 스코프 값에 대응한다.

- All → `all`
- League → `league`
- Cup → `cup`
- Champions → `champions`

한 버튼을 선택하면 이전 대회 선택은 해제된다.

현재 대회가 선택된 경우 해당 버튼만 강조 표시한다.

All을 선택하면 기존처럼 전체 대회를 대상으로 계산한다.

## 진입 경로에 따른 자동 스코프 유지

**이 부분이 매우 중요하다.**

선수 상세정보는 접근 경로에서 전달된 대회 스코프를 유지해야 한다.

예시:

- League → Players → Player Detail: League 기본 선택
- Cup → Players → Player Detail: Cup 기본 선택
- Champions → Players → Player Detail: Champions 기본 선택
- League Ranking → Player Detail: League 기본 선택
- Cup Ranking → Player Detail: Cup 기본 선택
- Champions Ranking → Player Detail: Champions 기본 선택
- 전체 Ranking → Player Detail: 전달된 기존 스코프 유지

현재 `View.competitionType`, `ScreenStateByView['player'].competition`, `defaultScreenState()`, navigation 복원 경로를 분석한다.

**대회 선택 UI가 버튼으로 변경되었다고 해서 기본 스코프를 무조건 All로 초기화하면 안 된다.**

기존 진입 경로의 선택 값이 그대로 버튼에 반영되어야 한다.

다른 화면으로 이동했다가 Back으로 복귀할 때에도 기존 스코프가 유지되어야 한다.

## 기존 통계 범위 유지

대회 선택은 현재와 동일하게 다음 영역에 적용되어야 한다.

- Overview
- Avg Rating / Goals / Assists
- Rank Trend
- Recent Form
- Positions Played
- Position Stats
- 경기별 기록
- 해당 스코프를 사용하는 나머지 선수 통계

현재 도메인별로 의도적으로 전체 커리어 데이터를 사용하는 항목은 기존 범위를 유지한다.

스코프 UI 변경을 이유로 계산 함수의 조회 범위를 임의로 통일하거나 수정하지 않는다.

시즌 선택 및 대회 선택 시 기존 Rank Trend metric 초기화 동작도 유지한다.

## 이번 버전에서 하지 않을 것

- 여러 시즌 다중 선택
- 여러 대회 동시 선택
- All Seasons 기능 신규 추가
- 선수 통계 합산 방식 변경
- Rank Trend 순위 계산 변경
- 새로운 통계 기능 추가

---

# 7. 공통 컴포넌트 설계

버튼 디자인을 단순히 각 화면에서 복사하지 말고 공통 디자인 계층을 고려한다.

권장:

- 상위 메뉴용 Compact Navigation Tabs
- 세부 항목용 기존 RankingMetricTabs
- 현재 `SegmentedControl`은 다른 화면과의 영향 범위를 검토한 후 유지 또는 확장

특히 `SeasonUI.tsx`의 기존 SegmentedControl을 무조건 전역 변경해서 모든 화면의 버튼 크기가 바뀌는 상황을 피한다.

공통 컴포넌트는 실제 중복이 있는 경우에만 추가한다.

중복된 상태 관리 로직이나 불필요한 abstractions를 만들지 않는다.

모든 버튼은 접근성을 유지한다.

- 명확한 aria-label
- 선택 상태
- 키보드 focus-visible
- 모바일 터치 조작
- 가로 스크롤
- 현재 선택된 버튼 표시

UI 수정으로 불필요한 전체 페이지 리렌더링이 발생하지 않도록 한다.

---

# 8. 변경하지 않을 기능

다음은 기존 v2.5.6 상태를 유지한다.

## 대회 기능

- League 공식 Standings
- League Form Last 5
- League History 데이터
- League MD Results
- Cup Stage별 16팀 테이블
- Cup Total 순위표
- Cup 진출·탈락 판정
- Champions Bracket
- Champions 추첨
- 모든 대회의 Players
- Ranking
- Award Race
- Best XI / Best XI Race
- Matches 전체 경기 목록
- Matches 팀·MD·Stage·Round 필터

## 결과 및 선수 기능

- Home 작은 Recent Matches
- Home Recent Matches → View All
- ResultsScreen 기능
- 선수 상세정보 계산
- 선수 순위 계산
- 이적·방출 기록
- Match Detail
- 경기 수정 및 삭제
- 기존 Navigation 및 Back 동작

## 데이터 및 성능

- Rating REV13
- MOM
- 공식 대회 동률 기준
- 선수별 통계 계산
- 저장 키 `football-tracker-v1`
- Match/Player/Team 데이터 스키마
- IndexedDB
- Draft 및 Import/Backup
- 기존 Cache/Selector 최적화
- Cloud Sync 설정
- PWA 설정

모든 변경은 이번 버전의 UI 및 Rank Trend 초기 선택값 수정 범위 안에서 수행한다.

---

# 9. 필수 회귀 테스트

기존 테스트를 삭제하거나 검증 조건을 약화하지 않는다.

v2.5.6 기준 전체 테스트 871개를 유지한다.

필요한 신규 테스트를 추가한다.

## A. 메뉴 버튼

- League 상위 메뉴 크기 및 클래스
- Cup 상위 메뉴 크기 및 클래스
- Champions 상위 메뉴 크기 및 클래스
- 상위 메뉴와 세부 메뉴의 크기 차이
- 기존 RankingMetricTabs 스타일 재사용
- 버튼 선택 상태 표시
- 모바일 가로 스크롤
- 대회별 메뉴 독립 상태
- 기본 메뉴 유지
- Back 복원

## B. League/Cup 세부 선택

- League Overall 기본 선택
- League Form Last 5 유지
- Cup Stage 조회 선택
- Cup Total 조회 선택
- Total 버튼 접근성
- Stage 가로 스크롤
- Cup 기존 16팀 및 공식 순위 결과 동등성

## C. Team Detail Matches

- 기존 전체 경기 수 유지
- 기존 대회 필터 유지
- 최신순 정렬 유지
- 동일 경기 중복 없음
- 선택한 팀의 로고/이름 표시
- 선택한 팀 관점 스코어
- 선택한 팀 관점 W/D/L
- 홈팀/원정팀 사례
- 기록 팀과 조회 팀이 다른 League/Cup 사례
- Champions recorded-team 귀속 유지
- 이적·방출 전 경기 표시
- Match Detail 진입
- Back 및 스크롤 복원
- 빈 목록 처리
- Home/Competition Results 기존 출력과 동등성

## D. League History

- 슬라이더 테마 스타일 적용
- 기존 MD 값 유지
- MD 선택 이벤트
- 키보드 조작
- History 데이터 동일
- 기존 그래프와 MD Results 유지
- 상태 복원

## E. Player Detail

- Rank Trend 기본 Overall
- Position 선택
- Team 선택
- 기존 순위 그래프 결과와 동등성
- 시즌 드롭다운 유지
- 대회 선택 버튼 4개
- 단일 선택 동작
- League 진입 시 League 선택
- Cup 진입 시 Cup 선택
- Champions 진입 시 Champions 선택
- 전체 Ranking 진입 시 기존 scope 유지
- Back 복귀 시 scope 유지
- 시즌 및 대회 변경 시 통계 갱신
- 기존 랭킹 및 Rating 결과 동일

## F. 전체 기능

- Rating REV13 동일
- MOM 동일
- League/Cup/Champions 공식 계산 동일
- Award/Best XI 동일
- Player/Team/Match 데이터 저장 동등성
- 기존 v2.5.6 성능 캐시 유지
- 저장 데이터 호환성
- 오류 없는 페이지 전환

---

# 10. 버전 업데이트

모든 수정과 검증이 끝나면 앱 버전을 다음과 같이 변경한다.

`2.5.6` → **`2.5.7`**

다음 파일을 동기화한다.

- `package.json`
- `package-lock.json`
- `src/config.ts`

기존 버전 기대값 테스트도 2.5.7로 갱신한다.

Rating REV13은 변경하지 않는다.

기존 저장 키와 데이터 스키마는 유지한다.

불필요한 dependency 추가는 하지 않는다.

---

# 11. 테스트 및 최종 감사

반드시 다음 명령을 실행한다.

```bash
npm test
npm run lint
npm run build
git diff --check
```

또한 v2.5.6에서 사용한 성능 벤치마크를 재실행해 변경 범위 밖의 성능 회귀가 없는지 점검한다.

확인할 사항:

1. 전체 테스트 통과
2. 신규 lint 오류 및 경고 0개
3. TypeScript build 성공
4. UI 컴포넌트 재사용 및 중복 제거
5. Rating/Competition 도메인 계산 변경 없음
6. 저장 데이터 변경 없음
7. 기존 캐시 및 성능 유지
8. 접근성 및 Navigation 기능 유지
9. 기존 UI 중 의도하지 않은 변경 없음
10. 모바일 화면 크기에서 가로 넘침 방지

가능하면 실제 브라우저에서 모바일 viewport, 터치 스크롤, 슬라이더와 버튼 전환을 확인한다.

브라우저가 제공되지 않으면 테스트로 검증 가능한 범위와 실제 모바일 미검증 항목을 명확히 구분한다.

---

# 12. Commit / Push / Deploy

모든 검증을 통과하면 v2.5.7을 배포한다.

절차:

1. 최종 git diff 감사
2. 변경 파일 및 의도하지 않은 변경 확인
3. 버전 2.5.7 확인
4. Git commit 생성
5. `origin/main` push
6. GitHub Actions build 확인
7. GitHub Pages deploy 확인
8. 공개 Pages 자산의 2.5.7 확인
9. 최종 working tree 상태 확인

가능하면 커밋 메시지는 다음과 같이 작성한다.

`style: refine competition navigation and match cards (v2.5.7)`

GitHub Actions나 배포가 실패하면 성공했다고 보고하지 않는다.

---

# 13. 최종 보고

작업을 마친 뒤 다음 내용을 보고한다.

### 구현 결과

- 대회별 상위 메뉴 디자인
- Overall/Form 및 Stage/Total 버튼 디자인
- Team Detail Matches 카드
- League History 슬라이더
- Player Rank Trend 기본값
- Player Detail Competition Scope UI

### 기능 보존 확인

- 대회별 기본 탭
- 선수 상세정보 진입 경로 스코프
- 팀별 경기 관점 및 필터
- Back 복원
- 기존 Rating 및 공식 순위
- 데이터 저장 호환성

### 검증 및 배포

- 총 테스트 통과 수
- 신규 테스트 수
- lint 결과
- build 결과
- 성능 비교
- 변경 파일 목록
- commit SHA
- push 상태
- GitHub Actions 결과
- GitHub Pages 배포 결과
- 실제 모바일·브라우저 미검증 사항

---

# 최종 성공 기준

**Football Tracker v2.5.7은 기존 v2.5.6의 기능을 유지하면서 버튼 디자인과 화면 간 UI 일관성을 개선하는 릴리스다.**

핵심 결과:

1. 대회 선택 버튼은 그대로 유지
2. Players/Table/History/Matches/Bracket는 조금 작은 상위 메뉴 pill
3. Overall/Form 및 Cup Stage/Total은 RankingMetricTabs와 같은 작은 pill
4. Team Detail Matches는 공통 ResultCard 디자인
5. League History의 MD 슬라이더는 어두운 테마에 맞는 색감
6. Player Rank Trend는 Overall이 기본 선택
7. Player Detail 대회 스코프는 작은 All/League/Cup/Champions 버튼
8. 선수 상세정보의 진입 경로별 기본 대회 스코프 유지
9. 시즌·대회 다중 선택은 추가하지 않음
10. 기존 계산·평점·기록·저장·성능은 유지

이제 현재 저장소를 분석하고 위 범위에서 설계·구현·테스트·감사·커밋·푸시·배포까지 완료하라.
