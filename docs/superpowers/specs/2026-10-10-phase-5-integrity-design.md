# Football Tracker 5차 데이터 무결성 설계

## 목적과 제한

신규 Store 변경이 publish되기 전에 구조·참조·대회 슬롯 불변조건을 검사하고, 기존 기록은 원본을 유지하며 읽기 전용으로 진단한다. Import, local restore, Draft, cloud는 각자의 허용 범위를 가진다. Competition scope projection의 same-reference 변경 stale cache를 제거한다.

저장 키, Team/Player/Match ID, Rating REV13, 대회·수상 계산, 1~4차 transaction/Draft/Import/cloud protocol과 UI 조작 방식은 유지한다. Supabase migration·운영 DB, cloud protocol, Best Attack Trio, 전면 cache 재구성, 6·7차 범위는 수정하지 않는다. 사용자 데이터 자동 정리·치환·삭제, commit/push/deploy도 하지 않는다.

## 현재 상태와 원인

- 기준은 `main` / `703939c9cbe1e4abc56aed48e366854b395a6200`, 앱 v2.5.3, Rating REV13이다. 1~4차 변경은 미커밋 상태로 보존 중이다.
- 현재 전체 테스트는 829/829 통과한다. 1차 감사 재현은 16/18 통과하고 Competition Cache와 Best Attack Trio만 실패한다.
- `validateState`는 저장 구조와 참조를 boolean으로 검사하지만 Store 일반 mutation은 해당 검증을 커밋 전 호출하지 않는다. Store coordinator의 reducer는 검증이 예외를 던지면 publish 전에 중단할 수 있으므로 해당 경계를 재사용한다.
- `auditDataIntegrity`는 원본을 변경하지 않지만 plain message와 severity 위주이며 선수/경기 참조 문제를 구조화된 코드·관련 ID로 소비하기 어렵다.
- `competitionMatches`는 `WeakMap`으로 배열 참조와 길이만 확인한다. 같은 배열의 Match 교체·필드 수정은 길이가 같아 오래된 projection을 돌려준다. 필터 결과 배열도 캐시에 공유되어 외부 변경에 노출된다.
- 선수 이적은 `teamId/teamIds`의 현재 소속만 바꾼다. Match Appearance/Event는 당시 Player ID를 보존한다. Player 엔티티가 없어진 역사 참조는 local repository가 허용하고 strict cloud validator는 거부한다.
- Team 삭제와 Player 엔티티 삭제 Store command는 없다. 방출은 현재 소속에서 제외하는 방식이다. League 중복은 durable match save에서 이미 최신 snapshot 기준으로 막는다.

## 데이터 소유권

| 엔티티/결과 | Source of Truth | 변경·검증 경계 |
| --- | --- | --- |
| Team | `AppState.teams` | Store add/update에서 ID 유일성·구조 검사; Match의 상대 컨텍스트는 registered Team만을 강제하지 않음 |
| Player 및 현재 소속 | `AppState.players`, `currentTeamIds` | Store transition에서 ID·팀 참조 검사; add/transfer는 기존 23명 capacity guard 재사용 |
| Match/Appearance/Event | `AppState.matches` | Match ID와 실제 Player/Team 참조 검사; 과거 누락 player ref는 동일 기존 Match에 이미 있던 참조만 transition에서 허용 |
| Kickoff Lineup | Match의 저장 snapshot | 완료 Match는 기존 exact-XI validator; Draft는 partial 허용 경계를 유지 |
| Draft | `AppState.draftMatch` | phase2 generation fence와 phase4 `kickoffConfirmed`/partial restore가 소유; 일반 Match validator에 합치지 않음 |
| Competition State | `AppState.competitionStates` | Store에 추가되는 변경만 구조 및 Team ID 참조를 검사; 기존 record는 감사에서 진단 |
| League slot | Match의 canonical competition identity | 추가·수정 Match만 최신 transaction state에서 동일 team/season/MatchDay 충돌 검사; same-ID edit 제외 |
| Cloud metadata/queue | IndexedDB 및 phase3 protocol | phase3 strict validator와 CAS/tombstone 규칙 유지; 이 단계에서 수정하지 않음 |
| 파생 competition projection | 원시 Match 배열에서 계산 | `competitionMatches`는 새 결과 배열을 계산해 반환; mutable-input cache 없음 |

## 검증 계층

1. **구조·기본 참조:** 기존 `validateState`를 호환 가능한 boolean API로 유지한다. strict 기본값은 cloud와 새 데이터에 사용한다. LocalRepository/import는 기존 historical-missing-player 옵션으로 기록을 보존한다.
2. **변경 전이:** `validateStateTransition(previous,next)`는 변경된 collection/entity만 검사한다. 불변 arrays는 다시 순회하지 않는다. 새/수정된 Match는 전체 필드/참조를 검사하고, League 충돌은 `competitionIdentityForMatch`와 `leagueSlotTeamIds`로 비교한다. 누락 Player ID는 같은 ID가 동일 기존 Match에 이미 참조되어 있을 때만 보존한다. 잘못된 신규 참조·중복 ID·중복 슬롯은 안정적인 `StateValidationError`로 거부한다.
3. **Store commit:** generic `update` 및 별도 durable Match save는 coordinator의 동기 reducer 안에서 transition 검사를 호출한다. 예외는 publish와 persistence enqueue보다 먼저 발생하고 호출자 Promise의 reject가 된다. add/update/delete 및 unrelated commits는 동일 transaction coordinator를 쓴다. Import의 prepared snapshot, cloud strict merge, Draft generation fence는 기존의 전용 경계를 유지한다.
4. **Read-only audit:** `auditDataIntegrity`는 복구나 normalization을 하지 않는다. 기존 `severity`/`message`를 유지하면서 안정 code, entity type/ID, related IDs, impact 및 안전한 다음 조치를 제공한다. 과거 missing entity는 오류로 표시하되 기록 수정은 제안하지 않고 백업에서 동일 ID 엔티티 복구를 안내한다.
5. **Cache:** scope 선택은 Match 배열마다 O(n) filter를 수행한다. 반환 projection은 새 배열이므로 source와 분리된다. 각 화면의 `useMemo`, Store competition revision, 더 무거운 analytics cache는 immutable Store collection identity를 계속 이용한다. 전체 상태 JSON stringify나 전역 cache reset은 추가하지 않는다.

## 오류 정책

- 신규 malformed entity/reference, duplicate stable ID, changed Match의 중복 League slot: Store publish 전에 변경 거부.
- 이미 저장된 historical Player ID 결손: local load/save/export는 보존하고 integrity audit에 Match 및 player ID를 진단한다. 신규 Match가 임의의 누락 ID를 도입하는 것은 거부한다.
- Import: 기존 tolerant historical policy와 validate-before-backup/atomic replacement 유지; 성공 전에 live state를 바꾸지 않는다.
- Draft: incomplete XI/bench 허용; exact XI는 kickoff/final Match 경계에서만 검사한다.
- Cloud: strict state validator 유지. dangling reference 업로드나 일부 누락 업로드를 허용하지 않는다. sync failure는 기존 queue/retry에 남는다.
- Audit warnings/errors: read-only. 어떤 source array, Match, Player, Team도 수정하지 않는다.

## 주요 파일

- `src/lib/validation.ts`: transition validator, scoped legacy reference permission, coded error.
- `src/store.tsx`: generic and durable Match commit guard; error rejection.
- `src/engine/integrity.ts`: structured read-only diagnostics and missing-reference details.
- `src/engine/competition.ts`: remove identity+length projection cache and return fresh filter output.
- `tests/state-validation.test.cjs`, `tests/integrity-audit.test.cjs`, `tests/audit/phase1-risk-repros.test.cjs`, existing Store/import/cloud/cache tests.

## 검증 기준

- same-reference/same-length Match replace, season/type in-place change와 returned array mutation에 stale result가 없어야 한다.
- state-only/Draft-only changes are not rejected by finalized-match exact-XI checks; partial Draft regression remains green.
- valid legacy missing refs survive local load, unrelated Store update, Match edit, export; cloud strict validation still fails closed.
- new invalid refs/duplicate IDs/League slots reject before publication; previous snapshot and durable content remain unchanged.
- audit returns stable codes and affected IDs without mutating inputs.
- Best Attack Trio remains the only expected phase1 audit failure; do not alter its selector.
