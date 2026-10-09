# 5차 데이터 무결성 구현 계획

**Goal:** 새로운 Store 변경을 publish 전에 검증하고, legacy Match 참조는 보존·진단하며 Competition scope cache stale result를 없앤다.

**Architecture:** `validateState` strict/local options를 유지하면서 immutable Store transition을 대상으로 하는 scoped validator를 더한다. Store reducer에서 변경 검증을 실행한다. Read-only integrity audit에 stable identifiers를 제공한다. `competitionMatches`는 길이 추정 cache를 제거하고 fresh filtered projection을 반환한다.

**Spec:** `docs/superpowers/specs/2026-10-10-phase-5-integrity-design.md`

## Task 1: Add state transition and audit regressions — complete

**Files:** `tests/state-validation.test.cjs`, `tests/integrity-audit.test.cjs`, existing phase1 and phase4 regression suites.

- Add RED tests for duplicate Player/Team/Match IDs, unknown new references, roster-cap compatibility, and same/different League slots.
- Add RED tests that a known dangling ID in the same historical Match survives a changed record, while the same ID in a new Match is rejected.
- Add tests that an invalid Store transition throws before coordinator publish/save and leaves prior durable snapshot intact; use the actual transition validator with the transaction coordinator.
- Add integrity-audit tests for stable codes, entity IDs, missing player/related match references, and unchanged serialized inputs.
- Run focused tests before implementation and record the expected failures.

## Task 2: Implement scoped validation and Store guards — complete

**Files:** `src/lib/validation.ts`, `src/store.tsx`, `src/engine/competition.ts`, `tests/state-validation.test.cjs`, Store durability and import regressions.

- Implement `validateStateTransition(previous,next)` that skips collections with unchanged immutable references; validates changed structure/IDs and changed Match references.
- Preserve missing-player references only when the same Match already contained those IDs and the Player entity remains absent.
- Check duplicate League slot for added/modified Match against latest `next.matches`, excluding only the current Match ID.
- Call validation from generic Store `update` and `saveMatchDurably` inside coordinator reducers before returning/publishing. Convert reducer exceptions to rejected Promises at the mutation API boundary.
- Keep Import, strict Cloud, Draft fence, roster-cap guard, and transaction serialization separate and intact.
- Verify no-op, player transfer, match update/delete, import replacement, and retry behavior.

## Task 3: Structure read-only diagnostics — complete

**Files:** `src/engine/integrity.ts`, `tests/integrity-audit.test.cjs`, existing integrity screen/tests.

- Extend each diagnostic with a stable code, entity type, optional entity ID/match ID, related IDs, impact, and safe next action; retain `severity` and `message` compatibility.
- Diagnose missing historical player/team refs and competition-state team references without modifying source records.
- Add a 23-player over-cap diagnostic while retaining imported over-capacity legacy data and existing registration guards.
- Preserve current messages consumed by existing UI/tests where practical; no new management screen.

## Task 4: Fix Competition scope cache and final verification — complete

**Files:** `src/engine/competition.ts`, `tests/audit/phase1-risk-repros.test.cjs`, focused cache and phase1 suites.

- Replace the length-only WeakMap projection cache with fresh filtered output.
- Verify same-reference replacement/type/season mutation and caller mutation of returned rows cannot leak stale results.
- Run `node --test tests/audit/phase1-risk-repros.test.cjs tests/audit/phase1-sync-risk-repros.test.cjs`; expected 17/18 with only Best Attack Trio failing.
- Run integrity, Store, local repository, Import, cloud protocol, Log Match, Export and all existing tests.
- Run `npm.cmd test`, `npx.cmd tsc -b --pretty false`, `npm.cmd run lint`, `npm.cmd run build`, and `git diff --check`.
- Review full diff/status; keep phase1-4 dirty changes, no DB/migration/6th-phase/commit/push/deploy action.

## Completion record

- Added transition validation to ordinary Store updates, durable Match saves, and Draft checkpoints before the coordinator publishes or persists them.
- Added entity-scoped legacy missing-player allowances, Draft partial-lineup/reference checks, and read-only structured findings.
- Removed `competitionMatches`' length-only cache; focused mutation tests and the phase1 audit now pass for this risk.
- Verification: 847/847 full tests; phase1 risk repros 17/18 (the unchanged Best Attack Trio issue remains); TypeScript, lint, build, and `git diff --check` pass. Lint reports existing warnings; build reports the existing large-bundle warning.
- Supabase protocol and migration/DB were not changed or applied; pre-existing dirty phase1-4 work remains in the workspace.
