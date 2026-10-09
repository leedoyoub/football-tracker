# Local First Deployment Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to execute this plan task-by-task. Each task ends with verification.

**Goal:** Release v2.5.4 with existing local persistence as the only active storage path until Cloud Sync receives real browser/Auth validation.

**Architecture:** Keep the existing `football-tracker-v1` repository, transaction coordinator, drafts, imports, and recovery formats. Add an explicit opt-in Cloud Sync build flag that defaults off, and stop startup/quota cleanup from deleting recovery snapshots. Keep GitHub Pages base path and service worker release behavior.

**Tech Stack:** React 19, TypeScript, Vite, Supabase JS, Node test runner, GitHub Actions Pages.

**Spec:** User request in conversation, “Football Tracker v2.5.4 — 로컬 저장 우선 모드 및 정식 배포”.

## Global Constraints

- Keep app/package version `2.5.4`, Rating REV13, existing storage keys, IDs, data model, UI, and GitHub Pages base `/football-tracker/`.
- Do not clear browser football data, sync queues, or recovery snapshots automatically.
- Cloud Sync must remain disabled unless an explicit build flag enables it.
- Never run a production Supabase write, migration, or auth configuration change.
- Do not commit, push, or deploy until the user confirms a real-browser JSON Export backup.

## Review Focus

- Existing authenticated sessions must not refresh or issue Cloud RPCs when the flag is absent/false.
- Local changes while disabled must not append to or delete an old offline queue.
- Quota failure and app startup must preserve recovery snapshots.
- Production build must not accidentally consume `.env.staging.local` or enable Cloud Sync.
- Local persistence must retain data keys and IDs across save/reload.

### Task 1: Gate cloud access behind explicit opt-in

**Files:** Modify `src/lib/supabase.ts`, `src/lib/sync.ts`; test `tests/v223-safety-release.test.cjs` and add a focused sync regression test if needed.

- [x] Add `VITE_ENABLE_CLOUD_SYNC === 'true'` to the configured predicate, defaulting false.
- [x] Make disabled `syncNow()` return `local-only` without scheduling retries or issuing auth, REST, or RPC calls from SyncManager.
- [x] Make disabled queueing a no-op while leaving existing IndexedDB queue and metadata untouched.
- [x] Test disabled config, no network/client use, and unchanged preexisting queue.

### Task 2: Preserve local recovery snapshots

**Files:** Modify `src/main.tsx`, `src/lib/repository.ts`, and `tests/p0-durability.test.cjs`.

- [x] Remove automatic startup snapshot cleanup.
- [x] On quota failure, reject the save with the original recovery data intact instead of deleting backups to force the new write.
- [x] Test that valid primary data and backup/emergency snapshots remain intact after startup and failed save.

### Task 3: Verify local-first build and deployment configuration

**Files:** Modify `.github/workflows/deploy.yml` only if an explicit false flag is needed; add/update audit notes as useful.

- [x] Run tests, audit reproductions, TypeScript, lint, production build, and `git diff --check`.
- [x] Verify production build ignores `.env.staging.local`, has Cloud Sync disabled, and retains Pages base path.
- [x] Verify repository persistence IDs/keys and current staged/untracked changes remain accounted for.
- [x] Stop before commit/push/deploy pending user confirmation of browser JSON Export backup.
