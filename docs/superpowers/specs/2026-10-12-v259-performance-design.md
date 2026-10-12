# Football Tracker v2.5.9 — Comprehensive Performance Optimization

## 0. 프로젝트 및 작업 목표

Repository: `leedoyoub/football-tracker`

현재 버전: **v2.5.8**

목표 버전: **v2.5.9**

현재 확인된 GitHub `main` HEAD:
`090d6f07d7d9910b41fd1fbb05382dcf0d884258`

Rating Engine: **REV13 유지**

이번 업데이트는 다음 두 가지를 수행한다.

1. Cup Table의 Stage 선택 버튼 표기를 `s1~s7`에서 **`S1~S7`**로 변경한다.
2. 전체 애플리케이션의 성능을 감사하고, 렉을 유발하는 불필요한 계산·재렌더링·스크롤 상태 갱신·메모리 사용·초기 로딩 비용을 최적화한다.

가장 중요한 목표는 **기존 기능과 계산 결과를 완전히 유지하면서 실제 사용자가 체감하는 속도를 개선하는 것**이다.

이번 작업은 단순히 `useMemo`나 캐시를 추가하는 업데이트가 아니다.

현재 구조의 중복 계산, source of truth, 데이터 흐름, 캐시 무효화, 컴포넌트 렌더링, 브라우저 메인 스레드 작업을 분석하고 근본 원인을 해결한다.

모든 변경은 가능한 한 작은 단위로 구현하고 검증한다.

기존 코드의 대규모 재작성은 원칙적으로 금지한다.

---

# 1. 작업 전 전체 코드 및 Git 상태 분석

먼저 현재 로컬 저장소를 분석한다.

확인할 항목:

- 현재 브랜치 및 HEAD
- Git working tree 상태
- 기존 사용자 미커밋 변경사항
- 현재 앱 버전
- 기존 테스트 통과 여부
- 성능 벤치마크 실행 방법
- 관련 코드 및 의존성 구조

GitHub HEAD와 로컬 HEAD가 다르다면 차이를 확인하고, 기존 변경사항을 임의로 삭제하거나 덮어쓰지 않는다.

다음 영역을 중점 분석한다.

### 애플리케이션·상태 관리

- `src/App.tsx`
- `src/store.tsx`
- `src/lib/navigation.ts`
- `src/lib/lastRoute.ts`
- `src/lib/scrollRestoration.ts`
- `src/lib/repository.ts`
- `src/lib/sync.ts`
- Auth 및 PWA 관련 코드

### 주요 화면

- Home
- Teams
- Team Detail
- Players
- Player Detail
- Match Detail
- New Match / Match Editor
- Competitions
- League History
- Global Ranking
- Records
- Chemistry
- Comparison
- Season Highlight
- Results
- Latest Changes

### 계산 엔진

- `src/engine/rating.ts`
- `src/engine/stats.ts`
- `src/engine/playerDerived.ts`
- `src/engine/playerRankTrend.ts`
- `src/engine/seasonAnalytics.ts`
- `src/engine/competition.ts`
- `src/engine/competitionSelectors.ts`
- `src/engine/positionScope.ts`
- `src/engine/playerMatchFacts.ts`
- `src/engine/news.ts`
- `src/engine/latestChanges.ts`
- `src/engine/analytics.ts`
- `src/engine/playerRecords.ts`
- `src/engine/historyReadModels.ts`
- `src/screens/recordsLeaderboards.ts`

실제 저장소의 파일명과 구조가 다르거나 새로 정리되었다면 현재 코드를 기준으로 대응한다.

## 분석 원칙

특히 다음을 조사한다.

1. 같은 데이터에 대한 반복 계산
2. 불필요한 전체 경기 배열 탐색
3. 불필요한 전체 선수 배열 탐색
4. 불필요한 정렬과 객체 생성
5. 화면에 보이지 않는 컴포넌트의 계산
6. 지나치게 넓은 React 재렌더링
7. 지나치게 자주 변경되는 상태
8. 과도한 localStorage 접근
9. 캐시 미적중 및 캐시 무효화 문제
10. 장시간 사용 시 메모리 누적
11. 불필요한 이미지·번들 로딩
12. 메인 스레드 Long Task
13. 긴 목록의 DOM 노드 증가
14. PWA 시작 및 복원 시 발생하는 작업
15. 기존 최적화와 중복되거나 충돌하는 로직

이미 최적화된 구조를 불필요하게 다시 작성하지 않는다.

---

# 2. 최적화 전 기준 성능 측정

**코드를 수정하기 전에 반드시 현재 v2.5.8의 기준 성능을 확보한다.**

기존 성능 보고서를 확인한다.

- `docs/performance/v2.5.8-report.md`
- 기존 benchmark 스크립트
- 기존 benchmark raw samples
- 캐시 및 계산 동등성 테스트

기존 대표 테스트 데이터:

- 16팀
- 팀당 약 23명
- 약 367명
- 2시즌
- 1,152경기

가능하면 동일 fixture로 v2.5.8과 v2.5.9를 비교한다.

추가로 기록이 적은 데이터, 다중 시즌 데이터, 선수 이적·방출 및 과거 경기 기록을 포함하는 데이터도 검사한다.

## 필수 측정 대상

- Home 첫 진입
- Home 재방문
- Teams 진입
- Players 검색
- Team Detail 진입
- Player Detail 진입
- Player Rank Trend
- League History
- Cup Table Stage 전환
- Champions Bracket
- Global Ranking
- Records
- Chemistry
- Match Detail
- Log Match 진입
- 선수 배치 및 이벤트 기록
- Draft 저장
- Results 전체 조회
- 앱 최초 실행 및 저장 상태 복원

## 측정 방식

가능한 범위에서 다음을 수집한다.

- Cold 계산 시간
- Cache-hit 재조회 시간
- React render 횟수
- React commit 시간
- 불필요한 selector 실행 횟수
- 메인 스레드 Long Task
- 초기 번들 크기
- 화면별 로딩 시간
- DOM 노드 수
- Heap 사용량
- 스크롤 및 입력 반응성

CPU benchmark와 실제 브라우저 측정값은 명확하게 구분한다.

실제 브라우저를 사용할 수 없다면 측정한 것처럼 보고하지 않는다.

벤치마크는 단 한 번 실행한 값을 기준으로 판단하지 않는다.

최소 여러 회 반복하고, median 및 p95와 원시 표본을 함께 기록한다.

측정값의 자연 변동을 실제 성능 개선이나 퇴보로 단정하지 않는다.

---

# 3. Home — 초기 계산 최적화

대상: `HomeScreen.tsx`

현재 Home에서는 다음 계산이 함께 수행된다.

- Latest Changes
- Global Ranking
- League Competition
- Cup Competition
- Champions Competition
- Season Awards
- Recent Matches

각 계산의 캐시가 존재하더라도 첫 실행에서는 상당한 비용이 발생할 수 있다.

## 개선 목표

화면에 즉시 필요한 데이터와 상대적으로 무거운 부가 분석을 구분한다.

우선 표시할 항목:

- 시즌
- 기본 Competition Progress
- 최근 경기

이후 준비할 수 있는 항목:

- Latest Changes
- Global Ranking
- Season Awards 등 비용이 큰 파생 데이터

현재 실제 비용을 측정한 뒤 작업 순서를 조정한다.

필요하다면 독립적인 컴포넌트 경계로 분리한다.

단, 계산을 `setTimeout`으로 단순히 늦추는 임시방편에 의존하지 않는다.

가능한 한 계산 자체의 중복을 줄이고 기존 데이터 재사용 구조를 활용한다.

## 유지 사항

- Home 섹션 순서
- 최근 경기 5개
- Latest Changes 4개
- Global Ranking Top 10
- 기존 Progress 정보
- Season Awards
- Navigation 및 View All
- 기존 표시 결과와 정렬

---

# 4. Players — 검색 및 필터링 최적화

대상:

- `src/screens/PlayersScreen.tsx`
- `src/screens/RankingFilters.tsx`

현재 검색어가 바뀔 때마다 전체 선수 목록을 반복 처리한다.

특히 `matchesForPlayer()`는 선수별로 경기 배열을 탐색한다.

필터가 없는 경우에도 불필요하게 경기 기록을 검사할 수 있다.

## 개선 목표

1. 필터가 필요하지 않은 경우 경기 배열 탐색 생략
2. 선수별 경기 기록 인덱스 재사용
3. 시즌·팀·포지션 필터에 맞는 조회 비용 최소화
4. 팀 및 선수 객체 조회용 Map 재사용
5. 검색어 입력 중 불필요한 전체 화면 렌더링 감소
6. 선수 이름 정규화 및 필터 계산의 중복 제거

경기 인덱스는 기존 `playerMatchFacts` 등의 공유 구조를 우선 검토한다.

이미 존재하는 인덱스로 해결할 수 있다면 새로운 인덱스를 중복 구축하지 않는다.

검색 입력 자체는 즉시 반응해야 한다.

필요한 경우 검색 결과 계산과 입력 반응을 분리하되, 불필요한 debounce로 입력 표시를 지연시키지 않는다.

## 유지 사항

- 선수 이름 정렬
- 현재 팀 및 과거 소속 팀
- 이적·방출 선수 검색
- No Team 필터
- 시즌 필터
- 포지션 필터
- 필터 조합
- 선수 상세정보 이동
- 검색 상태 및 Back 복원

---

# 5. Teams — Progress 계산 최적화

대상: `TeamsScreen.tsx`

현재 Teams 화면에서는 Progress 모드를 표시하지 않아도 `competitionSeasonStatus()`가 계산될 수 있다.

## 개선 목표

기본 팀 로고 화면에서는 Progress 전용으로만 사용되는 무거운 계산을 실행하지 않는다.

Progress 버튼을 선택했을 때 필요한 데이터를 조회한다.

가능하다면 기존 Competition selector 캐시를 재사용한다.

같은 데이터로 Teams Progress를 다시 열면 불필요한 재계산이 발생하지 않도록 한다.

단, 경기 기록이 수정되면 최신 상태를 정확히 반영해야 한다.

## 유지 사항

- 팀 배열 순서
- 팀 로고 및 이름
- Random Team
- Progress 버튼
- League / Cup / UCL 상태
- 팀 상세정보 이동

---

# 6. Team Detail — 필요 이상의 시즌 분석 제거

대상: `TeamDetailScreen.tsx`

현재 Team Overview에서 리그 순위 변화를 사용하기 위해 `buildSeasonAnalytics()`를 호출한다.

그러나 이 함수는 해당 화면에서 직접 사용하지 않는 선수 순위 스냅샷과 월간 수상 분석 등을 포함할 수 있다.

## 개선 목표

실제 사용되는 데이터 범위를 조사한다.

리그 순위 변화만 필요하다면 `buildLeagueHistory()` 등 더 좁은 기존 read model을 사용한다.

같은 팀·시즌·대회 데이터에 대한 반복 분석을 제거한다.

Players 탭의 Best XI와 선수별 시즌 통계가 중복 계산되는지도 검사한다.

Matches 탭은 기존 결과 인덱스를 최대한 재사용한다.

## 유지 사항

- League 순위 및 순위 변화
- Champions 및 Cup 진행 상태
- Team Analysis
- Best Players
- Latest XI
- 선수별 기록
- Matches 카드
- 시즌·대회 필터
- 이적 선수의 과거 기록 귀속
- Back 및 스크롤 복원

---

# 7. Player Rank Trend — 반복 정렬 최적화

대상: `src/engine/playerRankTrend.ts`

현재 Rank Trend는 경기를 시간순으로 처리하며, 선택한 선수가 출전할 때마다 전체 선수의 누적 순위와 팀별 순위를 재계산한다.

## 개선 목표

다음을 분석한다.

- 같은 선수 누적치 반복 변환
- 같은 팀 기회 시간 반복 합산
- 반복적인 전체 선수 정렬
- 반복적인 포지션 가족 계산
- 정렬용 임시 객체 생성
- 조회 결과 캐시의 범위

순위 계산의 중간 결과를 안전하게 재사용할 수 있는지 검토한다.

다만 새로운 자료구조가 오히려 계산량을 늘리거나 동률 순서를 바꾸면 도입하지 않는다.

## 절대 유지할 규칙

- Overall Rank
- Position Rank
- Team Rank
- 시즌별 스코프
- 대회별 스코프
- 선택 지표별 순위
- 모든 tie-break
- 과거 Match 시점의 순위
- 당시 소속 팀 기준 순위
- 포지션 변경 이력
- 이적·방출 및 재등록 이력

기존 v2.5.8과 모든 Rank Trend point의 값과 순서를 비교한다.

소수점 또는 comparator 동작이 달라지는 변경은 허용하지 않는다.

---

# 8. League History — 스크롤 반응성 최적화

대상:

- `CompetitionScreen.tsx`
- `LeagueHistory`
- `PositionHistory`

현재 그래프의 `onScroll`이 화면 상태 변경으로 연결되어 있다.

## 개선 목표

사용자가 그래프를 드래그할 때 불필요한 전체 CompetitionScreen 재렌더링을 최소화한다.

가능한 방법:

- 스크롤 이벤트 갱신 횟수 제한
- 현재 스크롤 위치를 ref에 유지
- 복원용 상태와 실제 DOM 스크롤 분리
- 필요 시 상태 저장
- 중복된 위치 값 업데이트 방지

`requestAnimationFrame` 기반 업데이트나 스크롤 종료 시점의 저장을 검토할 수 있다.

단, 사용자가 스크롤 직후 곧바로 다른 화면으로 이동하는 경우에도 마지막 위치가 유실되면 안 된다.

## 유지 사항

- 그래프 가로 스크롤
- 최대 4팀 비교
- 팀 포커스
- 그래프 색상
- Matchday 선택
- 과거 순위
- Back 복원
- 마지막 위치 복원
- 기존 스크롤 초기화 조건

---

# 9. Log Match — 입력과 Draft 상태 최적화

대상:

- `NewMatchScreen.tsx`
- `store.tsx`
- Draft lifecycle 및 persistence 관련 코드

현재 Match Editor는 여러 입력 상태와 파생 데이터를 함께 관리한다.

Draft 변경이 전역 Store 상태를 갱신할 수 있으므로 렌더링 영향 범위를 확인해야 한다.

## 조사 대상

- 선수 선택
- 포메이션 및 위치 변경
- 벤치 이동
- 선수 교체
- 골 기록
- 어시스트 기록
- 실점 기록
- 선방 입력
- SOT 입력
- 경기 시간 입력
- Draft checkpoint
- 최종 Match 저장

## 개선 목표

- 사용자 입력의 즉시 반응성 확보
- 실제 변경되지 않은 데이터의 객체 참조 유지
- 하위 UI별 렌더링 분리
- 불필요한 시즌 통계 재계산 제거
- 동일 Draft 내용에 대한 중복 저장 요청 방지
- 저장과 무관한 임시 UI 상태 변경의 영향 범위 축소

대표 포지션, 선수 시즌 통계, 경기 배정 정보 등은 입력할 때마다 불필요하게 재계산되지 않도록 한다.

## 매우 중요한 안전 조건

현재 Draft 저장 지연 정책과 검증된 최종 저장 정책은 유지한다.

특히:

- Draft 450ms 저장 정책
- 최종 Match durable save
- 검증된 localStorage primary
- IndexedDB mirror
- 저장 실패 시 오류 처리
- 미완료 Draft 복원
- 최종 저장 후 오래된 Draft의 재등장 방지
- 전원 종료·앱 종료 후 복원
- Import 및 Backup
- 경기 중복 저장 방지

성능 향상을 위해 검증이나 read-back을 제거하지 않는다.

React 전역 Context 분리는 실제 렌더링 개선 효과와 저장 안전성이 확인되는 경우에만 제한적으로 수행한다.

---

# 10. Player Detail — 초기 계산 및 부가 분석 최적화

대상: `PlayerDetailScreen.tsx`

현재 여러 파생 데이터가 동시에 조회된다.

- Player Scope
- Overall/Position/Team Ranking
- Season Analytics
- Milestones
- Career
- Chemistry
- Personal Records
- Rank Trend

## 개선 목표

초기 Overview 렌더링에 반드시 필요한 데이터와 하위 부가 섹션 데이터를 구분한다.

이미 존재하는 `DeferredMount`, `DeferredRankTrend` 등의 구조를 최대한 재사용한다.

동일한 선수·시즌·대회에 대한 분석을 중복 실행하지 않는다.

Milestone 3개만 표시하기 위해 전체 News를 새로 계산하는 비용을 점검한다.

이미 계산된 최신 News 또는 player-specific projection을 재사용할 수 있는지 검토한다.

단, 기존 News의 canonical event 기준과 기록 수정 후 갱신 정확성은 유지한다.

## 유지 사항

- 모든 Overview 수치
- 전체/포지션/팀 순위
- 대회 스코프
- 시즌 스코프
- Rank Trend
- Career
- Records
- Chemistry
- Awards
- 선수 이적·방출 이력
- 출전 당시 포지션

---

# 11. Match Detail — 탭별 계산 최적화

대상: `MatchDetailScreen.tsx`

현재 Match Detail의 공통 read model에서 평점, MOM, Match Story, 선발, 벤치 및 교체 기록을 함께 생성한다.

## 개선 목표

Facts, Lineup, Ratings 탭에서 공통으로 필요한 데이터와 특정 탭 전용 데이터를 구분한다.

선택하지 않은 탭에서만 사용되는 무거운 파생 데이터를 불필요하게 계산하지 않는다.

다만 세 탭이 공유하는 Rating 및 Timeline 데이터는 중복 계산하지 않도록 한다.

## 유지 사항

- Rating REV13
- MOM
- Match Story
- Starting XI
- Bench
- 교체 기록
- Goals / Assists
- SOT
- 선방
- 과거 선수의 표시
- 경기 수정 및 삭제
- 팀 상세정보 복귀
- 모든 경기 기록

---

# 12. Results / Matches / Players — 긴 목록 렌더링 최적화

대상:

- `ResultsScreen.tsx`
- `CompetitionMatches.tsx`
- `PlayersScreen.tsx`
- Team Detail Matches
- 관련 ResultCard 컴포넌트

경기가 많아질수록 전체 결과 목록을 한 번에 렌더링하는 방식은 DOM 노드 수와 초기 렌더링 비용을 증가시킨다.

## 개선 목표

실제 목록 길이와 렌더링 비용을 측정한다.

필요한 경우 점진적 렌더링 또는 virtualization을 적용한다.

하지만 짧은 목록에는 복잡한 virtualization을 적용하지 않는다.

기본적으로:

- 처음 보이는 목록부터 빠르게 표시
- 나머지는 스크롤에 따라 렌더링
- 사용자는 모든 기록에 접근 가능
- 기존 정렬 유지

## 필수 보존 조건

- 최신순 정렬
- 경기별 ResultCard
- Competition 라벨
- 승패 표시
- 팀 및 경기 클릭
- 필터 조합
- Back 복원
- 스크롤 위치 복원
- 과거 기록 귀속
- 전체 기록 조회 가능

특히 목록에 돌아왔을 때 기존 스크롤 위치로 복원할 수 없는 구조는 적용하지 않는다.

---

# 13. Chemistry 및 Records 계산 최적화

대상:

- `src/engine/analytics.ts`
- `src/engine/playerRecords.ts`
- `src/engine/unitRecords.ts`
- `src/screens/recordsLeaderboards.ts`
- 관련 화면

v2.5.5부터 기존 계산 캐시가 상당히 개선되었다.

따라서 이번에는 첫 계산에서 발생하는 비용과 선택하지 않은 항목의 계산을 중점적으로 분석한다.

## 개선 목표

- 선택하지 않은 조합 종류의 불필요한 계산 제거
- 공통 선수·경기 사실 재사용
- 같은 경기의 on-pitch 분석 중복 제거
- 불필요한 결과 객체 생성 제거
- 불필요한 정렬 제거
- 선택한 Records 카테고리 중심의 계산
- 이미 존재하는 selectedIds 기반 최적화 유지 및 보완

단, 계산 조건과 출력 결과는 변경하지 않는다.

## 유지 사항

- Combinations
- Goal Partnerships
- Best Units
- Defensive Partnerships
- On-pitch 지표
- Records 전체 카테고리
- 동률 순서
- 포지션·시즌·대회·팀 필터
- View All
- 기존 최소 출전 기준

---

# 14. Season Highlight / News — 불필요한 분석 분리

대상:

- `SeasonHighlightScreen.tsx`
- `src/engine/news.ts`
- `src/engine/latestChanges.ts`
- 관련 read model

현재 Season Highlight는 화면 종류에 관계없이 Season Analytics와 News 데이터를 모두 준비할 수 있다.

## 개선 목표

선택한 `kind`를 기준으로 실제 필요한 분석만 실행한다.

예시:

- Monthly Awards: 월간 수상 데이터
- Matchday Review: 해당 리뷰 데이터
- News: 뉴스 데이터

선택하지 않은 화면의 계산을 불필요하게 실행하지 않는다.

다른 화면에서 계산한 News 데이터와 결과를 안전하게 재사용할 수 있는지 확인한다.

기존 뉴스 생성과 정렬 규칙은 유지한다.

---

# 15. ID 조회 및 반복 배열 탐색 최적화

앱 전반에서 다음과 같은 패턴을 조사한다.

- `players.find(...)`
- `teams.find(...)`
- `matches.find(...)`
- 선수마다 전체 경기 탐색
- 경기마다 전체 선수 탐색
- 팀마다 전체 경기 탐색

특히 News, Match Story, Player Stats, Records, Rank Trend에서 반복 호출되는 부분을 점검한다.

## 개선 목표

동일 스코프에서 여러 번 조회할 경우 Map 또는 기존 인덱스를 활용한다.

단 한 번만 조회하는 짧은 배열까지 무조건 Map으로 바꾸지 않는다.

인덱스를 새로 만드는 비용과 재사용 횟수를 비교한다.

다음 정확성을 반드시 유지한다.

- 과거 Match 기록
- 방출 선수
- 이적 선수
- 현재 팀이 없는 선수
- 중복 또는 legacy 데이터
- 출전 당시 소속 팀
- 과거 포지션

---

# 16. 캐시 — 메모리 사용량과 무효화 검토

현재 여러 엔진이 WeakMap 및 Map 기반 캐시를 사용한다.

다음 캐시를 검사한다.

- Rating/MOM
- Global Ranking
- Player Derived
- Rank Trend
- Position Scope
- Season Analytics
- History
- Competition Selectors
- Records
- Chemistry
- News
- Latest Changes

## 조사할 문제

- 동일한 결과를 서로 다른 캐시에 중복 저장하는지
- 시즌·선수·지표 변경 시 불필요한 새 결과가 누적되는지
- 오래된 Map 엔트리가 계속 유지되는지
- 실제 경기 수정 후 캐시가 올바르게 갱신되는지
- 배열 identity가 불필요하게 변경되어 캐시 미적중이 증가하는지
- 이미 제한된 캐시를 중복 관리하는지

캐시 크기 제한이 없는 경우 실제 메모리 누적 가능성을 조사한다.

필요하다면 bounded cache 또는 LRU 방식을 도입한다.

단, 무조건 전체 캐시를 삭제하거나 TTL을 추가하지 않는다.

기존 캐시의 O(1) hit 특성을 유지한다.

특히 기존 legacy 배열 내부 변경 감지와 immutable update 처리가 훼손되면 안 된다.

캐시 최적화로 인한 오래된 데이터 표시는 절대 허용하지 않는다.

---

# 17. 앱 초기 실행 및 JS 번들 최적화

현재 v2.5.8의 JS 번들은 약 919.52KB이며 gzip 기준 약 259.90KB다.

`App.tsx`는 다수 화면을 정적으로 import한다.

## 개선 목표

실제 production bundle 분석을 수행한다.

화면별 코드 분할이 초기 로딩 성능에 효과적인지 평가한다.

가능한 후보:

- Records
- Chemistry
- Comparison
- Season Highlight
- Match Editor
- 기타 사용 빈도가 낮고 무거운 화면

필요한 경우 React.lazy와 Suspense를 활용한다.

단, 단순히 번들 파일 수를 늘리는 것이 목적이 아니다.

다음 값을 함께 확인한다.

- 초기 다운로드 크기
- 초기 JS parse/execute 비용
- 첫 화면 로딩 시간
- 화면 전환 시 추가 대기시간
- PWA 오프라인 실행
- GitHub Pages 경로 호환성

기존 화면 전환에 추가적인 깜빡임이나 긴 로딩 화면이 생기면 최적화 방식을 재검토한다.

별도 dependency 추가는 가능한 한 피한다.

---

# 18. App 전역 상태 및 React 렌더링 감사

대상:

- `App.tsx`
- `store.tsx`
- 주요 Screen 컴포넌트

다음 문제를 조사한다.

- Draft 변경으로 불필요한 상위 화면 렌더링이 발생하는지
- Context value가 매번 변경되는지
- callback identity 변경으로 memoization이 무력화되는지
- 자식 컴포넌트가 변경되지 않은 props에도 반복 렌더링되는지
- 화면에 필요한 일부 상태가 과도하게 큰 객체에 저장되는지
- useMemo의 dependency가 불필요하게 자주 변경되는지
- UI 전용 상태 변경으로 무거운 Domain selector가 실행되는지

## 개선 원칙

- React Profiler 등으로 실제 렌더 비용 확인
- 변경된 데이터만 필요한 컴포넌트에 영향
- 안정적인 객체 참조 유지
- 불필요한 callback 재생성 최소화
- React.memo는 실제 효과가 입증된 곳에만 적용

전체 Store 구조를 무조건 교체하지 않는다.

새 상태 관리 라이브러리를 도입하지 않는다.

특히 데이터 저장과 React 상태 갱신의 순서를 변경할 때는 기존 내구성 보장을 우선한다.

---

# 19. 저장 및 동기화 성능 점검

대상:

- `store.tsx`
- `lib/repository.ts`
- `lib/db.ts`
- `lib/sync.ts`

현재 검증된 localStorage primary와 IndexedDB mirror 구조는 유지한다.

## 조사 항목

- 동일 상태에 대한 불필요한 저장 요청
- 과도한 직렬화 요청
- 저장 전 검증의 중복 호출
- 불필요한 전체 상태 비교
- Cloud Sync 비활성화 상태에서의 오버헤드
- 실제 동기화가 활성화된 경우의 변경 엔티티 탐색
- 저장 중 메인 스레드 차단

단, 성능 최적화를 위해 다음을 생략하면 안 된다.

- 데이터 검증
- 원자적 Import
- 백업
- primary read-back
- 저장 실패 처리
- Draft lifecycle 검증
- 기록 변경의 안전성 검증

Cloud Sync의 변경 감지는 동일한 의미와 저장 순서를 보존해야 한다.

실제 저장 I/O와 메모리 기반 benchmark를 구분한다.

**데이터 안전성을 훼손하는 최적화는 적용하지 않는다.**

---

# 20. Cup Table — S1~S7 대문자 표기

이번 업데이트에 반드시 포함할 UI 변경이다.

대상:

`src/screens/CompetitionScreen.tsx`

현재 Cup Table Stage 선택 버튼:

- s1
- s2
- s3
- s4
- s5
- s6
- s7

변경 후:

- **S1**
- **S2**
- **S3**
- **S4**
- **S5**
- **S6**
- **S7**

다음 표기는 유지한다.

- Final
- Replay
- Total

## 중요한 제한

선택 버튼의 표시 문자열만 변경한다.

기존 내부 Stage 식별자는 유지한다.

- `stage1`
- `stage2`
- …
- `stage7`
- `final`
- `finalReplay`
- `total`

기존 `RankingMetricTabs size="award"` 스타일을 그대로 유지한다.

다음은 변경하지 않는다.

- 버튼 크기
- 선택 색상
- 미선택 색상
- 가로 스크롤
- Total 고정 위치
- Stage 선택 상태
- Cup 테이블 계산
- Survival Line
- Provisional At Risk
- Eliminated
- Elimination Draw
- Final / Replay 판정

다른 화면의 `Stage 1`, `Cup · Stage 1` 등 정식 명칭은 변경하지 않는다.

**오직 Cup Table Stage 선택 버튼의 s를 대문자 S로 변경한다.**

---

# 21. 성능 최적화 우선순위 및 작업 방식

모든 후보를 동시에 수정하지 않는다.

다음 순서로 진행한다.

## Phase A — 높은 효과와 낮은 위험

1. Players 검색의 불필요한 경기 탐색
2. Teams Progress 지연 계산
3. Team Detail 분석 범위 축소
4. Season Highlight의 불필요한 분석
5. 반복 ID 조회 및 중복 계산

이 단계에서 모든 기존 테스트를 실행한다.

## Phase B — 사용자 입력과 스크롤

1. League History 스크롤 상태 갱신
2. Home 초기 계산 및 표시
3. Match Editor 불필요한 재렌더링
4. Player Detail 및 Match Detail 초기 계산
5. 전역 상태 렌더링 범위

입력 반응성과 저장 안정성을 함께 검증한다.

## Phase C — 대규모 데이터

1. Rank Trend 반복 정렬
2. Results 및 Players 긴 목록
3. Records / Chemistry 계산
4. 캐시 메모리 관리
5. 필요 시 코드 분할

실제 병목이 확인된 부분부터 적용한다.

## Phase D — UI 및 최종 감사

1. Cup `S1~S7` 표기
2. 전체 회귀 테스트
3. 계산 동등성
4. 성능 재측정
5. 최종 diff 감사

### 중요한 작업 원칙

각 최적화 후보에 대해 다음 순서를 지킨다.

**기존 비용 측정 → 근본 원인 확인 → 최소 변경 → 테스트 → 성능 재측정 → 채택 여부 결정**

성능 개선이 확인되지 않는 복잡한 변경은 되돌리거나 적용하지 않는다.

작은 이득을 위해 큰 유지보수 비용을 만드는 설계는 피한다.

---

# 22. 절대 변경하면 안 되는 기능과 규칙

## Rating

- Rating REV13
- 포지션별 평점 계수
- 득점·어시스트 가점
- 원더골·어시스트리드
- 실점 감점
- 무실점 시간 보너스
- GK 선방
- 상대 유효슈팅
- 교체 출전시간
- 추가시간 처리
- MOM 선정 규칙

## Competition

- League 공식 순위
- Cup 공식 순위
- Cup Survival Line
- Cup 진행 중 At Risk
- Cup 완료 Stage의 Eliminated
- Elimination Draw
- Champions Bracket
- Champions 진출·우승 판정
- Final 및 Replay
- 과거 Stage 조회

## Players / Matches

- 선수 이적
- 선수 방출
- 선수 재등록
- 과거 Match 출전 기록
- 현재 스쿼드와 과거 스쿼드 구별
- 선발·벤치 인원 제한
- 포지션 변경
- 과거 포지션별 기록
- Rating의 역사적 정확성

## Statistics

- Global Ranking
- Records
- Chemistry
- Best XI
- Awards
- Award Race
- Rank Trend
- News
- Latest Changes
- Player Detail

## Storage / Navigation

- 저장 키 `football-tracker-v1`
- 기존 저장 스키마
- Backup
- Import
- Draft 저장
- Cloud Sync
- PWA 오프라인
- GitHub Pages
- Back
- 화면 상태 복원
- 스크롤 위치 복원

이번 업데이트에서 **저장된 사용자 데이터를 변경하는 migration은 수행하지 않는다.**

---

# 23. 필수 회귀 테스트

기존 v2.5.8 테스트 **921개**를 기준으로 유지한다.

새로운 기능 및 최적화에 맞는 테스트를 추가한다.

기존 테스트를 삭제하거나 의미를 약화하지 않는다.

## A. 계산 동등성

v2.5.8과 v2.5.9에서 동일 fixture로 다음 결과를 비교한다.

- 모든 Match Rating
- 모든 MOM
- League standings
- Cup standings
- Champions results
- Cup 진행 중/완료 Stage
- Best XI
- Awards
- Global Ranking
- Rank Trend
- Records
- Chemistry
- News
- Player Detail
- Match Detail

가능하면 값뿐 아니라 정렬, 행 순서, 객체의 의미 있는 모든 필드를 비교한다.

## B. 캐시 무효화

- 경기 추가
- 경기 수정
- 경기 삭제
- 선수 추가
- 선수 방출
- 선수 이적
- 선수 포지션 수정
- 시즌 전환
- 대회 전환
- 필터 전환
- 데이터 Import

위 작업 후 이전 캐시가 오래된 결과를 반환하지 않아야 한다.

## C. 성능·반응성

- 검색어 연속 입력
- History 빠른 가로 스크롤
- History 스크롤 직후 Back
- Match Editor 연속 입력
- Draft 저장 후 복원
- 선수 상세정보 연속 방문
- Results 긴 목록 스크롤
- Records 필터 반복 전환
- Competition 탭 반복 전환
- 캐시 적중 시 불필요한 계산 없음

## D. Cup UI

- S1~S7 대문자 표기
- Stage 내부 ID 유지
- 버튼 크기 유지
- Total 고정 유지
- Stage 선택 정상
- Survival Line 및 At Risk 결과 동일
- Final/Replay/Total 결과 동일

## E. 데이터 안전성

- 앱 강제 종료 후 Draft 복원
- 저장 실패 처리
- Import rollback
- Backup 유지
- 기록 중복 저장 방지
- 역사적 Match 보존
- Cloud Sync 동등성
- PWA 오프라인 로딩

---

# 24. 최적화 전후 성능 비교

동일한 fixture와 측정 환경에서 기준 버전과 개선 버전을 비교한다.

성능 보고서에는 다음을 포함한다.

| 항목 | v2.5.8 | v2.5.9 | 변화 |
|---|---|---|---|
| Home Cold | 측정 | 측정 | 계산 |
| Home Revisit | 측정 | 측정 | 계산 |
| Players Search | 측정 | 측정 | 계산 |
| Teams | 측정 | 측정 | 계산 |
| Team Detail | 측정 | 측정 | 계산 |
| Player Detail | 측정 | 측정 | 계산 |
| Rank Trend | 측정 | 측정 | 계산 |
| League History | 측정 | 측정 | 계산 |
| Global Ranking | 측정 | 측정 | 계산 |
| Records | 측정 | 측정 | 계산 |
| Chemistry | 측정 | 측정 | 계산 |
| Match Detail | 측정 | 측정 | 계산 |
| Log Match | 측정 | 측정 | 계산 |
| Draft Save | 측정 | 측정 | 계산 |
| Results Rendering | 측정 | 측정 | 계산 |
| JS Bundle | 측정 | 측정 | 계산 |

실제로 측정하지 않은 값은 `Not measured`라고 명시한다.

브라우저가 없는 경우 React render·paint·FPS 수치를 추정해서 작성하지 않는다.

개선율이 벤치마크 변동 범위에 있다면 개선을 확정했다고 보고하지 않는다.

성능 향상을 위해 계산 결과가 변하면 해당 최적화는 실패한 것으로 취급한다.

## 성능 성공 기준

- 주요 사용자 흐름의 체감 지연 감소
- 불필요한 계산 및 재렌더링 감소
- Cold 계산 시간 개선
- 기존 Cache-hit 성능 유지
- 메모리의 불필요한 증가 방지
- 초기 번들 또는 JS 실행 비용 개선
- 기록 저장의 안정성 유지

모든 지표가 반드시 개선되어야 한다는 이유로 무리한 최적화를 적용하지 않는다.

실제 효과가 확인된 변경만 최종 반영한다.

---

# 25. 테스트·Lint·Build

다음 명령을 실행한다.

```bash
npm test
npm run lint
npm run build
git diff --check
```

추가 검사:

- 전체 테스트
- TypeScript
- 기존 lint 경고와 신규 경고 비교
- 기존 benchmark
- 변경된 경로의 회귀 테스트
- 입력·스크롤·저장 관련 테스트
- 캐시 무효화 테스트
- 버전 assertion 테스트

기존 lint 경고를 무리하게 전체 수정하지 않는다.

신규 lint 오류나 불필요한 경고는 남기지 않는다.

모든 최적화 변경의 semantic diff를 확인한다.

---

# 26. 버전 업데이트

모든 변경을 검증한 뒤 앱 버전을 다음과 같이 변경한다.

**2.5.8 → 2.5.9**

동기화 대상:

- `package.json`
- `package-lock.json`
- `src/config.ts`

관련 현재 버전 assertion 테스트를 갱신한다.

다음은 유지한다.

- Rating REV13
- 저장 키 `football-tracker-v1`
- DB 스키마 및 버전
- 사용자 데이터 구조
- Cloud Sync 프로토콜
- PWA 업데이트 정책

추가 dependency는 꼭 필요한 경우에만 도입하고, 사용 이유와 번들 영향을 보고한다.

---

# 27. 성능 보고서 작성

새 보고서를 작성한다.

`docs/performance/v2.5.9-report.md`

보고서 구성:

1. 기준 버전 및 commit
2. 수정 전 성능
3. 발견한 병목
4. 각 병목의 근본 원인
5. 실제 적용한 개선
6. 측정 후 적용하지 않은 최적화
7. 수정 파일 목록
8. 계산 동등성 검증
9. 렌더링·입력·스크롤 검증
10. 저장 안전성 검증
11. 캐시 및 메모리 검증
12. 번들 크기 비교
13. 전체 테스트 결과
14. 신규 테스트
15. 성능 전후 비교
16. 남아 있는 병목 및 미검증 항목

기존 보고서 형식을 최대한 따른다.

가능하다면 원시 benchmark 결과를 별도 JSON으로 보존한다.

실제 측정하지 않은 성능이나 미수행 테스트는 성공했다고 작성하지 않는다.

---

# 28. Commit / Push / GitHub Pages 배포

전체 테스트 및 최종 감사를 통과한 뒤 배포한다.

절차:

1. 최종 diff 감사
2. 기존 사용자 변경사항 확인
3. v2.5.9 버전 확인
4. 전체 테스트 통과
5. lint 통과
6. build 통과
7. `git diff --check` 통과
8. 성능 보고서 작성
9. commit 생성
10. `origin/main` push
11. GitHub Actions 확인
12. GitHub Pages 배포 성공 확인
13. 공개 사이트의 실제 v2.5.9 자산 확인
14. 작업 트리 상태 확인

권장 commit 메시지:

`perf: optimize application performance and refine cup labels (v2.5.9)`

배포 실패 시 성공했다고 보고하지 않는다.

GitHub Pages에서 이전 버전이 보이면 최신 버전이 실제로 제공되는지 확인한다.

기존 작업을 덮어쓰기 위한 강제 push는 수행하지 않는다.

---

# 29. 최종 결과 보고 형식

작업 완료 후 다음 사항을 명확히 보고한다.

### 업데이트

- v2.5.8 → v2.5.9
- Cup S1~S7 변경 여부

### 성능 개선

각 항목에 대해:

- 기존 문제
- 근본 원인
- 수정 내용
- 성능 변화
- 기능 동등성 확인

### 미적용 최적화

- 측정 결과 효과가 없었던 사항
- 위험 때문에 보류한 사항
- 별도 업데이트가 필요한 사항

### 품질 검증

- 기존 테스트 개수
- 신규 테스트 개수
- 최종 통과 개수
- lint 결과
- build 결과
- 벤치마크 비교
- 사용자 데이터 안전성

### 배포

- 최종 commit SHA
- GitHub Actions 결과
- GitHub Pages 확인
- 최종 working tree 상태

---

# 최종 성공 기준

Football Tracker v2.5.9에서는 다음 목표를 달성해야 한다.

**UI**

Cup Table의 선택 버튼이 `S1~S7 · Final · Replay · Total`로 표시된다.

그 외 기존 UI와 기능은 유지한다.

**성능**

실제 병목이 확인된 영역의 불필요한 계산, 반복 정렬, 배열 검색, 렌더링, 상태 갱신 및 메모리 비용을 줄인다.

특히 Home, Players, Team Detail, Rank Trend, League History, Match Editor, Player Detail, Results에서 체감 성능 개선을 우선한다.

**안정성**

Rating REV13, MOM, 순위, 대회 판정, 수상, 이적·방출 선수의 과거 기록, Draft 저장 및 복원, Backup, Cloud Sync가 기존과 동일하게 동작한다.

**구조**

새로운 중복 캐시나 임시방편을 남기지 않는다.

기존 source of truth를 유지하고, 실제로 필요할 때만 계산하는 구조를 우선한다.

**검증**

동일한 데이터에서 v2.5.8과 v2.5.9의 계산 결과는 동일해야 한다.

성능 개선은 측정으로 입증한다.

---

이제 현재 로컬 저장소부터 분석하라.

15개 성능 후보를 전부 조사하되, 측정 결과 의미 있는 개선이 가능한 부분을 우선 구현하라.

각 단계마다 테스트와 성능 비교를 수행하고, 기능 동등성이 확인된 변경만 유지하라.

마지막으로 Cup S1~S7 표기 변경, 버전 2.5.9 업데이트, 전체 테스트, 최종 감사, commit, push 및 GitHub Pages 배포까지 완료하라.
