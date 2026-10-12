# Football Tracker v2.5.9 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline with one final independent reviewer.

**Goal:** Adopt measured small optimizations across audited workflows and change Cup selector labels to S1–S7, preserving all v2.5.8 behavior.

**Architecture:** Reuse existing indexes/read models and selector caches. Separate essential first-screen work from expensive secondary components using idle scheduling with frame fallback. Keep shared canonical News generation for a narrow milestone projection. Coalesce horizontal scroll checkpoints while synchronously flushing before navigation. Avoid storage/engine rewrite and unproven virtualization/context changes.

**Tech Stack:** existing React/TypeScript/Node tests and Vite; no new dependency.

**Spec:** ../specs/2026-10-12-v259-performance-design.md. **Audit/ledger:** ../../performance/v2.5.9-audit.md.

## Global Constraints

- Base 090d6f07d7d9910b41fd1fbb05382dcf0d884258, existing 921 tests, final version 2.5.9.
- Rating REV13, all exact comparators/point values/domain decisions, historical team/position attribution, Cup provisional rules remain unchanged.
- No migration, schema/key/protocol changes; football-tracker-v1, 450ms Draft policy, verified primary read-back/mirror/failure handling/Import safety unchanged.
- Keep all rows accessible, all scopes/Back/scroll state, settled UI order/results and PWA offline/update behavior.
- Existing clean main and origin/main release are explicitly authorized. Windows logs use ignored .superpowers/v255/v259 scratch or *.log.
- Keep a candidate only after exact regression/equivalence checks and a material cost reduction or eliminated unnecessary work; document rejected candidates.

## Review Focus

- Filter combinations include No Team with seasons, former teams, unused bench, transferred/released players, duplicate/legacy appearance records.
- Scroll immediately followed by navigation/focus/MD/reset must save the latest offset without restoring stale unrelated state; unmounted callbacks must stop.
- Narrow milestones must match default News metadata/IDs/order on all saved history; defaults and global News stay exact.
- Cache eviction must preserve recent O(1) hits and force correct recomputation; legacy replacement invalidation must remain intact.
- Deferred/optional work must use current props, preserve output/order and Back reachability; persistence still rejects late finalized checkpoints and cloud operations remain exact when enabled.

### Task 1: Phase A — low risk calculations

**Files:** screens/PlayersScreen.tsx, screens/RankingFilters.tsx, engine/playerMatchFacts.ts, screens/TeamsScreen.tsx, screens/TeamDetailScreen.tsx, screens/SeasonHighlightScreen.tsx; tests/v259-phase-a.test.cjs.

**Interfaces:** expose a read-only map from the existing appearance index; optional index input to matchesForPlayer. Existing consumers/signatures stay compatible. Teams Progress consumes existing competition selectors; Team Overview consumes buildLeagueHistory.

- [x] Write failing real screen/call-count and exact baseline-output tests for skip-history search, indexed filtered rows, hidden Progress, light Team overview and kind-only Highlight.
- [x] Run focused tests; expected targeted RED failures.
- [x] Implement minimal index reuse/guards/read-model substitution. Preserve all historical filter semantics and selector invalidation.
- [x] Run focused/full suites and same baseline workflow cases. Expected exact outputs, removed calls and substantial CPU reductions; discard ineffective changes.

### Task 2: Phase B — first-screen, input and scroll

**Files:** HomeScreen.tsx, PlayerDetailScreen.tsx, news.ts, CompetitionScreen.tsx, App.tsx, store.tsx, lib/sync.ts, shared deferred/checkpoint helpers only as necessary; tests/v259-interaction.test.cjs.

**Interfaces:** a player milestone projection shares canonical News generation/cache; deferred child components have unchanged settled data; scroll checkpoint accepts current position and flushes pending offsets before navigation. No save/sync signatures change.

- [x] Capture baseline targeted milestone/scroll/sync/Draft costs. Write failing tests for no secondary first-screen calls, exact narrow milestones, coalesced/final scroll, duplicate Draft no-op and disabled Cloud Sync no serialization.
- [x] Implement small boundaries and conditional work; keep current-prop callbacks and explicit cancellation/flush.
- [x] Run interaction and storage suites, then full tests. Re-measure initial versus complete work separately; preserve enabled sync operation order/payload and timer/final-save guarantees.

### Task 3: Phase C — scaling and retention

**Files:** engine/playerRankTrend.ts, selected query caches if retention measured; benchmark/memory/equivalence tests. Bundle/lists/Match Detail/Records/Context are candidates, not blanket requirements to rewrite.

- [x] Measure metric-specific denominator calls and active-snapshot scope retention. Inspect production bundle source map and Results SSR/DOM.
- [x] Write RED tests for unused opportunity scans and unbounded cache retention; pin all Rank Trend metrics/points to independent v2.5.8.
- [x] Skip unused denominator work and add small bounded maps where measured. Preserve defensive eligibility and all comparator/order semantics.
- [x] Run full equivalence, cache mutation and forced-GC probes. Re-measure relevant paths. Document unsupported browser measurements and unadopted high-risk complexity.

### Task 4: Phase D — labels, release and deploy

**Files:** CompetitionScreen.tsx, current metadata/assertions, tests/v259-equivalence.test.cjs, benchmark families, docs/performance/v2.5.9-*.

- [x] Write failing Cup S1–S7 button-label test; change only selector display strings, keep award styling/IDs/Total/Survival model.
- [x] Compare every meaningful result with archived v2.5.8 across realistic/small/multi-season/transfer/release/legacy and mutation/import cases.
- [x] Run npm.cmd test/lint/build/diff checks, sequential final 7-sample engine/workflow/target benchmarks; report median/p95/raw, unchanged caches, bundle and all 15 candidate decisions.
- [x] Bump package/lock/config to2.5.9 and update version assertions; repeat full release checks.
- [x] Get one independent final code review; fix Important/Critical issues with RED→GREEN plus full suite. No blanket lint cleanup.
- [x] Commit `09d6642` (perf: optimize application performance and refine cup labels v2.5.9), push origin/main; Actions run #115 and GitHub Pages build/deploy jobs succeeded. Public Pages URL recorded in the performance report; direct host asset fetch was unavailable from this environment. Record deployment evidence in docs, commit and push the docs follow-up, then verify the resulting workflow and clean state.

## Execution record

### 2026-10-13 재개 기록

- 저장소 복구: HEAD090d6f0, 기존 미커밋 구현·raw 측정 보존, 메타데이터2.5.9. 이전958/958은 버전 갱신 전 결과임을 구분했다.
- 독립 리뷰: Critical0, Important3, Minor1. 실제 브라우저/모바일/오프라인/최종배포는 리뷰 판단 범위 밖이며 직접 수행 여부를 보고서에 명시한다.
- 수정: 비교 팀 변경 중 scroll rewind, Draft primary/final 실패 후 동일 checkpoint 재시도, Home/Teams Cup scope 충돌을 재현 RED 뒤 수정. 버전 정규화/regex도 정확히 수정. 집중25/25 GREEN, 최종 전체 suite는 이어서 실행.
- 브라우저 surfaces가 없어 paint/commit/FPS/mobile/offline 실측은 미수행. 결과를 성공으로 주장하지 않으며 별도 브라우저 검증 항목으로 기록한다.
- 최종 검증: pagehide 위치를 effect 전 동기 저장하지 못하는 Important finding이 추가로 발견되어 handler 반환 직후 localStorage 검사 RED/GREEN으로 수정. 963/963, lint, build, diff-check, 7-sample benchmark 및 memory probe 완료. 독립 리뷰 판정은 Critical0/Important1/Minor0 (해당 Important 수정 완료).
- 배포 확인: release commit/push 완료, Actions build/deploy 성공. 공개 Pages 호스트의 자산 본문 직접 조회는 환경 네트워크 제한으로 미확인.

- User's full design authorizes analysis through deploy; proceed inline without additional approval loops.
- Baseline 921 tests and build passed; existing engine 20-path and workflow15-path measurements completed before any src edit.
- Pre-flight: Task1 shared appearance index used by filter; Task2 News projection uses same canonical generator as existing global consumers; Task3 exact engine point comparisons protect denominator optimization; Task4 compares changed UI labels independently from unchanged calculations.

- Task1 complete: RED?GREEN7/7; full928/928; PhaseA7-sample CPU evidence.
- Task2 complete: RED?GREEN13/13; full941/941; first-screen versus settled measurements separate.
- Task3 implementation/checks: RED?GREEN8/8; full949/949; retention and target CPU evidence being finalized.
- Execution follows the user?s requested single final implementation commit after complete verification.
