# Football Tracker 4차 Log Match 설계

## 목적과 범위

현재 roster에서 신규 경기를 구성하고, 부분 Draft를 저장·복원하며, 이미 기록한 경기를 현재 roster 변경과 독립적으로 편집할 수 있게 한다. 선수 이동, 전술 슬롯, Draft/킥오프 경계, 기록 경기 검증을 같은 도메인 규칙으로 묶는다. 저장 키, 선수·경기 ID, Rating REV13, 대회 계산 규칙, 2차 Store transaction coordinator와 3차 클라우드 프로토콜은 유지한다. Supabase, migration, 배포, commit/push 및 5차 이후 작업은 범위에 포함하지 않는다.

## 조사 기준과 재현

- 시작 기준: `main`, HEAD `703939c9cbe1e4abc56aed48e366854b395a6200`; 앱 v2.5.3, Rating REV13. working tree에는 1~3차 변경이 미커밋으로 존재한다.
- 일반 테스트는 작업 시작 시 816/816 통과했다.
- `tests/audit/phase1-risk-repros.test.cjs`와 phase1 cloud repro를 실행한 결과 18개 중 13개 통과, 5개 실패다. 이번 범위의 실패는 빈 전술 슬롯에 벤치를 옮겨 선발 12명이 되는 문제, 10명 부분 Draft 복원이 거부되는 문제, 중복 League MatchDay 저장 허용이다. 같은 길이 배열의 competition cache와 Best Attack Trio 실패는 이번 범위 밖이다.
- `NewMatchScreen`은 최근 Kickoff XI를 현재 roster membership으로 정리하지 않고, roster는 `player.teamIds`/`teamId`로 조회한다. 사용 이동은 `moveLineup`을 거치지만 총원/중복 불변조건 검사가 부족하다. `restoreDraft`는 정확히 11명이 아니면 복원을 거부하고, 과거 편집 후보도 현재 팀 roster에만 의존한다.
- Store의 `saveMatchDurably`는 최신 transaction snapshot 안에서 기록을 갱신하지만 신규 기록에 League 슬롯 중복 검증이 없다. 기존 `competitionMutationSafety`는 대회 진행 안전성만 다루며 League 중복 차단 기능은 아니다.

## Source of Truth와 상태 모델

1. 팀 roster는 `currentTeamIds(player)`를 기준으로 한다. 최근 경기 선발 복원은 그중 현재 roster에 남은 선수의 기존 tactical slot만 유지하고 나머지 슬롯은 비워 둔다.
2. 신규 경기의 `slotAssignments`와 `homeBench`만 편집 상태로 저장한다. Available은 현재 roster에서 두 그룹을 뺀 파생 목록이다. 선발은 최대 11명, 벤치는 최대 12명, ID 중복 및 roster 밖 ID는 거부한다. 복원/렌더 중 임시로 중복 그룹을 저장하지 않는다.
3. Draft는 빈 슬롯과 11명 미만을 허용한다. 경기 시작 검증만 정확히 11명, 유일한 슬롯/선수, 실제 GK 1명을 요구한다.
4. `step`은 화면 표시 상태이고 `kickoffConfirmed`는 명시적인 match-edit 상태다. Continue에서 Draft checkpoint를 durable save한 뒤 확정/잠금을 표시한다. Back은 step만 바꾸고 확정을 해제하지 않는다. 명시 flag가 없는 기존 Draft는 기존 저장 방식상 킥오프 전에도 XI snapshot이 존재할 수 있으므로 events가 있을 때만 확정 상태를 추론한다.
5. 과거 경기 편집은 저장된 kickoff/appearances/events/history를 우선한다. 현재 소속 변경은 기존 player ID, 출전, 대체 관계, 이벤트, 위치 history를 재구성하거나 제거하지 않는다. 이적 전 참가자는 편집 읽기 모델에 포함하고, 현재 roster의 미참가자는 자동으로 선발/벤치에 넣지 않는다.
6. player entity가 없는 레거시 출전 참조는 해당 경기 안의 ID와 이벤트를 유지하고 `Missing player · <id>` 형태로 명시한다. 편집/Export/로컬 저장은 이를 보존할 수 있게 제한적 local-validation 옵션을 쓴다. 일반/클라우드 검증은 기본 fail-closed로 두고 dangling historical reference를 클라우드에 전송하지 않는다. 자동 ID 치환은 하지 않는다.

## 경기 저장 및 시간선

- 신규 저장은 최신 transaction snapshot을 기준으로 검증한다. 같은 시즌 League의 동일 canonical MatchDay에 같은 팀 슬롯이 이미 있으면 저장을 거부한다. 수정은 현재 경기 ID를 제외해 자기 자신과의 충돌은 허용하되, 다른 경기의 슬롯 충돌은 허용하지 않는다. 삭제 후 재등록은 삭제 이후 최신 상태를 사용한다.
- `matchLineup` 이동은 시작, 벤치, 대기 간 교체를 하나의 순수 변경으로 계산하고, 제한을 넘거나 duplicate/unknown slot이면 원본을 반환한다.
- 교체·포지션 변경·이벤트의 시간선은 기존 `moveSubstitution`, `rebuildLiveHistory`, `normalizeMatchTimeline`을 재사용한다. 90분 출전 제한, 90+ 이벤트 허용, GK 규칙 및 REV13 계산은 변경하지 않는다.

## 변경 구조

- `src/lib/matchdayLineup.ts`: 현재 roster 기반 Starting/Bench/Available 파생, 최근 XI의 roster-filter, lineup invariants.
- `src/screens/matchLineup.ts`: 모든 lineup 이동의 고유성·최대 인원·원자성 검증.
- `src/engine/kickoffLineup.ts`: 과거 exact-11 기본 동작을 보존하면서 restore 전용 partial validation을 명시적으로 지원.
- `src/lib/editorRestore.ts`, `src/lib/draftLifecycle.ts`: 부분 Draft, historical roster, 누락 player 진단, `kickoffConfirmed` 복원.
- `src/screens/NewMatchScreen.tsx`: 파생된 세 그룹과 placeholder historical participant를 기존 tap 기반 UI에 연결; durable kickoff checkpoint 후 lock.
- `src/types.ts`, `src/lib/validation.ts`, `src/lib/repository.ts`: optional Draft-only kickoff flag와 명시적 local legacy-reference validation. 기본 validator 및 cloud validation은 엄격하게 유지.
- `src/engine/competition.ts`, `src/engine/leagueSlots.ts`, `src/store.tsx`: canonical League slot conflict 함수와 최신 Store transaction 안의 save guard.
- `tests/audit/phase1-risk-repros.test.cjs`, `tests/new-match.test.cjs`, `tests/phase1-resume-safety.test.cjs`, 신규 Log Match domain tests 및 저장 회귀.

## 위험과 경계

- 선택 UI가 모든 group 이동을 제공하되 2차 Draft generation fence를 우회하지 않는다. kickoff 확정 저장 실패 시 live step으로 넘어가지 않고 Draft를 보존해 재시도한다.
- Local Repository는 결손 Player ID의 historical reference를 손실 없이 읽고 쓸 수 있다. cloud sync 및 strict import validators는 dangling reference를 계속 거부하므로 클라우드 동기화가 pending 될 수 있다. 누락 선수의 실제 엔티티 복구는 사용자가 가진 백업 또는 5차 데이터 복구 정책을 필요로 한다.
- 의미상 동일한 League 슬롯 판정은 기존 `competitionIdentityForMatch` 및 `leagueSlotTeamIds`만 재사용한다. 경기 진행 계산은 바꾸지 않는다.
- 1차 감사의 competition cache는 5차 무결성/캐시 검토에, Best Attack Trio는 6차 계산·수상자 작업에 남긴다.
