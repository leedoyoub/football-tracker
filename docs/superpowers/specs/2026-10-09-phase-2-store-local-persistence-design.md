# 2차 Store 및 로컬 저장 안정화 설계

## 목표

메모리 Store와 `football-tracker-v1` 원본 저장 사이의 경쟁 상태를 제거한다. 각 변경은 최신 메모리 스냅샷에서 한 번만 계산하고, 해당 불변 스냅샷을 순서대로 영구 저장한다. 저장 실패를 성공으로 표시하지 않으며 재시도 가능한 최신 스냅샷을 보존한다.

## 범위

- 일반 Store 변경, 확정 경기 저장, Draft 자동 저장, Import, 시작 시 저장 데이터 복구/정규화를 공통 transaction coordinator로 연결한다.
- `LocalRepository`의 기존 원본 키·형식·IndexedDB 미러·복구 순서를 유지한다.
- Import는 원본 저장이 성공한 뒤에만 라이브 상태를 교체한다. Import가 시작되면 이전에 예약된 일반/Draft 쓰기는 epoch fence로 실행을 거부한다.
- 경기 확정은 최신 Store에서 이전 경기와 관련 Draft를 한 번 계산해 저장한다. 확정된 경기 ID에는 이전 Draft 세대가 저장되지 못한다.
- 일반적인 React updater 함수 안에서는 Store 변경, 저장, 큐잉, 캐시 초기화 등 부수효과를 실행하지 않는다. updater에는 이미 계산된 snapshot 값만 전달한다.
- Supabase 병합 계산과 DB·마이그레이션은 범위 밖이다. SyncManager는 이 단계에서 merge 또는 schema 동작을 변경하지 않는다.

## 상태 및 트랜잭션 모델

`StoreProvider`의 `snapshotRef.current`를 동기적 Source of Truth로 사용한다. `commit(next)`는 다음 순서를 하나의 동기 구간에서 수행한다.

1. 최신 ref에서 계산된 완전한 snapshot을 받는다. reducer를 받는 경우 reducer는 coordinator가 한 번만 직접 실행하며 React updater에는 전달하지 않는다.
2. snapshot과 증가한 revision을 ref에 즉시 기록한다.
3. 계산 완료된 snapshot을 `setSnapshot(snapshot)`에 값으로 전달해 React 렌더를 예약한다.
4. 같은 revision/snapshot을 직렬 영구 저장 큐에 넣는다.

JavaScript 이벤트 처리 구간에서 ref를 먼저 갱신하므로 연속 호출은 이전 React 렌더를 기다리지 않고 최신 값을 기반으로 계산한다. React StrictMode의 렌더/updater 재실행은 transaction이나 외부 부수효과를 다시 실행하지 않는다.

저장 큐는 I/O 순서를 직렬화하고 상태 계산에는 관여하지 않는다. 각 queued write는 완전한 불변 스냅샷을 쓴다. 큐가 대기 중일 때 여러 revision이 생기면 저장 시점에 이미 superseded 된 대기 스냅샷을 최신 revision 하나로 합칠 수 있지만, 진행 중인 write와 호출자별 durable Promise의 완료/실패 의미는 보존한다. 오래된 revision이 최신 revision 이후 원본에 기록되는 순서는 허용하지 않는다.

## 저장 결과와 오류 복구

- 메모리 변경과 저장 성공은 별개의 상태다. Store는 현재 revision, 마지막으로 검증된 durable revision, 최근 저장 실패를 추적한다.
- `saveMatchDurably`와 `importAppState`는 자신의 revision이 원본 `localStorage`에 저장되고 read-back이 검증된 후에만 성공한다.
- 영구 저장 실패 시 durable 호출은 reject한다. 경기 편집 UI는 기존 동작대로 사용자가 재시도할 수 있게 남는다. Import는 라이브 상태를 교체하지 않는다.
- 일반 변경이 실패하면 최신 메모리 snapshot을 pending으로 보존한다. 다음 저장 요청은 그 전체 최신 snapshot을 기록한다. 명시적인 `retryPendingPersistence()` 경계도 제공해 호출자가 같은 최신 snapshot을 재시도할 수 있으며, 동일한 오래된 snapshot을 재생하지 않는다.
- 새 revision 저장이 성공하면 이전 실패 revision은 새 snapshot에 포함된 것으로 간주해 해소한다. 저장 오류는 성공 상태로 초기화하지 않는다.
- 기존 storage key, serialized `AppState` shape, IndexedDB best-effort mirror, quota 복구, emergency snapshots에는 변경이 없다.

## 작업별 원자성

### 일반 변경

모든 `add/update/delete` 함수는 최신 ref에서 검증 및 다음 상태를 동기 계산하고 한 번 커밋한다. 실패 가능한 roster 검사는 updater 바깥에서 실행되어 호출부의 동기 try/catch가 받는다. persistence와 cloud sync는 commit 이후 한 번만 시작한다. 저장 실패 시 최신 메모리는 보존하고 오류 및 재시도 상태를 유지한다.

### 경기 확정

최신 ref를 기준으로 기록 시각 보존, 경기 추가/수정, 완료 표식 조정, 해당 ID Draft 제거를 한 snapshot에 반영한다. 확정 ID를 먼저 finalizing set에 넣고 Draft epoch를 증가시켜 late checkpoint를 차단한다. 그 최종 snapshot을 저장 큐에 넣고 해당 write가 검증되어야 성공을 반환한다. 저장 실패는 finalizing fence를 풀어 사용자가 같은 편집 상태에서 재시도하게 한다.

### Draft

Draft 입력은 ref와 React 메모리에 즉시 반영하되 450ms debounce를 유지한다. timer는 예약 당시 전체 snapshot을 쓰지 않고 실행 시점의 최신 ref에서 Draft를 포함한 snapshot을 가져온다. 전용 draft epoch 검사와 finalizing ID 검사를 함께 사용해 오래된 debounce를 무효화한다. 다른 엔티티 변경이 Draft보다 먼저 발생해도 Draft flush가 그 변경을 잃지 않는다.

### Import

입력 parse/validation과 pre-import backup을 먼저 수행한다. 그 다음 coordinator가 replacement gate를 잡고 Draft/persistence epoch를 증가시켜 이전 예약 쓰기를 fence한다. 기존 진행 중 I/O가 끝나면 Import가 큐의 다음 작업이 된다. Gate 동안 들어온 Store reducer는 보류하고, Import 스냅샷의 원본 저장/read-back 성공 후 ref와 React 상태를 교체한 다음 보류된 reducer를 새 Import 상태 위에서 순서대로 재생·저장한다. 실패하면 live Store를 바꾸지 않고 보류된 reducer를 기존 상태 위에서 재생하고 오류를 반환한다. 따라서 Import 결과는 과거 큐 작업에 덮이지 않고 Import 뒤 입력도 버려지지 않는다.

### Hydration

읽기 실패와 빈 저장소 상태를 구분한다. 성공적으로 읽은 저장 데이터는 한 번 reconcile한 후 Store ref와 React 상태에 같은 snapshot으로 설정한다. 정규화가 필요하면 최신 snapshot에 대한 저장 transaction으로 큐에 넣는다. Hydration 전에는 사용자 데이터 변경 UI가 허용되지 않는 현재 boundary를 유지한다.

## 클라우드 경계 및 명시적 잔여 위험

SyncManager는 현재 local state를 읽고 cloud 조회 후 직접 `LocalRepository.saveAppState(merged)`를 수행한다. 이번 구현은 로컬 Store 저장 구조를 정리하되 이 병합 알고리즘 및 실제 DB를 변경하지 않는다. Cloud fetch 중 로컬 변경된 revision을 sync writeback이 덮는 경쟁 상태는 이 단계의 성공 조건에서 제외하고, **3차 Supabase/동기화 작업의 선행 회귀 테스트 및 필수 해결 항목**으로 남긴다. Store 재조회 후 merge conflict 처리, 계정별 큐, tombstone, 빈 기기 복원도 3차 범위다.

## 불변조건

1. Store transaction reducer는 호출당 한 번만 평가되고 React updater 안에서 실행되지 않는다.
2. 메모리 revision은 단조 증가하며 가장 최신 ref를 기준으로 다음 상태를 만든다.
3. durable write가 역순으로 완료되어 최신 원본을 오래된 상태가 덮지 않는다.
4. 저장 오류는 durable 성공으로 변환되지 않고 최신 실패 상태가 재시도 가능하다.
5. 경기 확정과 관련 Draft 제거는 같은 저장 snapshot에 있다.
6. 무효 Draft epoch 및 확정 ID checkpoint는 저장되지 않는다.
7. Import는 durable 저장 성공 후에만 라이브 상태를 교체하고 이전 큐 write는 Import 이후에 덮어쓸 수 없다.
8. 기존 키, 데이터 shape, 역사 경기, 평점/대회 규칙, UI와 메뉴 동작은 바꾸지 않는다.

## 검증 계획

- transaction helper에서 동일 reducer 호출의 1회 계산, 연속 변경의 최신 입력, 저장 순서/실패 재시도/중복 완료를 제어 가능한 Promise로 검증한다.
- 실제 `LocalRepository` 메모리 Storage 어댑터로 재시작 후 전체 데이터와 read-back을 확인한다.
- Store transaction 통합 테스트에서 StrictMode와 같은 updater 재평가 시나리오를 적용하되 외부 효과는 1회만 나타나는지 확인한다.
- 경기 저장 vs 선수 수정/경기 추가/수정/삭제 지연 시나리오, Draft flush vs 일반 commit 및 확정, Import vs 기존 queued write를 검증한다.
- 기존 Import atomicity, p0 durability, 1차 audit Store 재현의 관련 항목을 녹색으로 전환한다. Cloud audit 3개는 이 단계에서 기대 실패로 유지하고 별도 명령 경로에 둔다.
- 전체 `npm test`, `npm run lint`, `npm run build` (TypeScript 포함), `git diff --check`를 실행한다.

## 구현 결과 및 상세 보완

- `snapshotRef.current`는 coordinator가 동기적으로 publish하는 최신 `StoreSnapshot`으로 유지한다. transaction reducer는 한 번만 동기 실행하고 React에는 계산된 값만 전달한다.
- 일반 저장 API는 durable Promise를 반환한다. UI에서 저장 성공 후 이동하거나 Import 완료를 표시하는 경로는 해당 Promise가 성공한 뒤 진행하고, 실패는 오류 UI/Promise rejection으로 전달한다. 실패 시 최신 메모리 스냅샷은 유지하며, 명시적 `retryLocalSave`와 `online` 이벤트에서 최신 스냅샷 재저장을 시도한다.
- Draft는 메모리에 즉시 반영하고 debounce 시점의 전체 최신 스냅샷을 저장한다. Import 중 버퍼된 Draft에는 세대 검사를 재적용하므로 Import 이전 세대가 재생되지 않는다.
- 확정 경기 저장 실패 시 편집 상태의 최신 메모리 결과는 남고 Promise는 reject된다. 해당 경기 ID의 Draft fence는 유지되어 뒤늦은 Draft가 확정 경기 상태를 덮을 수 없다.
- Import는 진행 중 저장 다음 순서로 저장하고, 저장 성공 전에 publish하지 않는다. gate 동안의 변경은 reducer로 버퍼링하고 성공한 Import 위에 재생·저장한다. Import 저장 실패 시 기존 snapshot 위에 변경을 재생하고 Import 오류를 반환한다.
- 회귀 테스트는 transaction 경계에서 지연·실패·재시도·연속 변경·Import fence·Draft 세대·StrictMode 재렌더 모델·재시작 복원을 검증한다. 브라우저 컴포넌트 전체를 StrictMode DOM으로 마운트하는 테스트 환경은 저장소에 없어, React updater를 사용하지 않는 transaction boundary의 실행 횟수를 직접 검증한다.
- 최종 `npm.cmd test`는 812/812 통과했다. 1차 전체 감사 재현 중 저장 조합 검증은 기존 실패에서 통과로 바뀌었고, 저장소 외 영역의 나머지 5개는 그대로 실패한다. 별도 클라우드 경쟁 재현 3개도 그대로 실패하며 3차 필수 범위다.
