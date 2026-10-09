# Football Tracker Store and Local Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every in-memory Store change derive once from the newest snapshot and persist in order without losing newer local data.

**Architecture:** Add a small versioned transaction coordinator that owns the synchronous current snapshot and serial persistence state. React receives already-computed snapshots as values; durable match saves and imports await verified writes; Draft writes resolve the latest ref only when their debounce fires. Import fences older queued work and publishes only after its replacement snapshot is durably verified.

**Tech Stack:** React 19, TypeScript 6, Node `node:test`, TypeScript transpile hook, existing localStorage repository and IndexedDB mirror.

**Spec:** [2026-10-09-phase-2-store-local-persistence-design.md](../specs/2026-10-09-phase-2-store-local-persistence-design.md)

**Completion note:** Implemented in this workspace. Persistence-backed Store methods return a Promise where callers must wait for durable success. The existing raw `createPersistenceQueue` helper remains for its focused tests and is no longer the Store's state coordinator.

## Global Constraints

- Keep `football-tracker-v1` and the serialized `AppState` shape unchanged.
- Preserve localStorage primary verification, IndexedDB best-effort mirror, recovery order, JSON Export/Import, and Draft lifecycle.
- Preserve Rating REV13, MOM, competition rules, current UI and navigation.
- Do not change cloud merge logic, Supabase schema, migrations, or database contents in this phase.
- Do not reset, delete, commit, push, publish, or deploy; preserve the existing untracked audit files.
- Every state reducer executes once outside React updater functions; every persistence side effect runs once for its transaction.

## Review Focus

- Two rapid updates before React renders must compose from the second update's latest snapshot.
- A storage failure after a newer mutation must keep that newer snapshot retryable and must not report durable success.
- An Import racing an in-flight save must write after/fence the old write and publish only after read-back success.
- A Draft debounce firing after a player change must save both the player and the latest Draft; finalizing the same match must invalidate that Draft.
- StrictMode render/updater replays must not duplicate commits, queue writes, cloud queueing, cache invalidation, IDs or sync side effects.

---

### Task 1: Versioned state transaction and persistence coordinator

**Files:**
- Create: `src/lib/storeTransactions.ts`
- Create: `tests/store-transactions.test.cjs`

**Interfaces:**
- Produces `createStoreTransactions<T, R>(initial: T, save: (snapshot: T) => Promise<R>, publish: (snapshot: T) => void)`.
- `read(): { revision: number; snapshot: T }` returns the authoritative memory snapshot.
- `commit(reducer: (current: T) => T): { previous: T; snapshot: T; revision: number; persisted: Promise<R> }` evaluates once synchronously, updates authoritative state, publishes a precomputed value, and serializes its full snapshot.
- `replaceDurably(reducer: (current: T) => T, fence: () => void): Promise<{ revision: number; result: R }>` takes a replacement gate, fences older scheduled work, queues the computed replacement behind in-flight I/O, and publishes only after successful save. Commits arriving during replacement are buffered and replayed over replacement on success or the original state on failure.
- `retryLatest(): Promise<R>` writes the latest current snapshot and resolves only after primary save succeeds.
- `drain(): Promise<void>` waits for queued writes without hiding a requested durable operation's rejection.

- [x] **Step 1: Write failing transaction behavior tests**

Add tests named `commit evaluates its reducer once and publishes a value`, `rapid commits compose from the latest snapshot`, `a failed latest snapshot remains retryable`, `durable replacement publishes only after save succeeds`, and `rejected old writes do not poison later commits`. Use deferred Promises to control write completion. Assert literal revisions, reducer counts, publish order, saved snapshots and retry results.

- [x] **Step 2: Run the focused tests to verify expected failures**

Run: `node --test tests/store-transactions.test.cjs`
Expected: FAIL because `src/lib/storeTransactions.ts` is not implemented.

- [x] **Step 3: Implement versioned coordinator and serial queue**

Run reducers only inside synchronous `commit`, never inside `setState`. Keep one authoritative current snapshot. Queue immutable versioned snapshots in revision order. Retain the latest state and error if persistence fails. `retryLatest` must retry current state, not an old failed snapshot.

- [x] **Step 4: Verify focused tests**

Run: `node --test tests/store-transactions.test.cjs`
Expected: all five transaction tests PASS, including failure recovery and publish-after-durable replacement.

---

### Task 2: Route Store changes and durable match saves through the coordinator

**Files:**
- Modify: `src/store.tsx`
- Modify: `tests/p0-durability.test.cjs`
- Modify: `tests/store-transactions.test.cjs`

**Interfaces:**
- Consumes the Task 1 `read`, `commit`, `replaceDurably`, `retryLatest` coordinator methods.
- Keeps mutation arguments and IDs; persistence-backed mutation methods return a Promise so storage errors reach the caller.
- Ordinary commits pass the computed snapshot to `setSnapshot(snapshot)`; no `setSnapshot(prev => ...)` callback performs side effects.

- [x] **Step 1: Add failing Store race tests**

Add behavior tests for a delayed match snapshot followed by a player update and restart, rapid commits during a blocked write, full-snapshot repair after failure, and single reducer evaluation when React renders repeatedly. The coordinator tests use deferred I/O; existing `p0-durability` tests exercise repository read-back and fresh repository launch.

- [x] **Step 2: Run the tests before changing Store code**

Run: `node --test tests/store-transactions.test.cjs tests/p0-durability.test.cjs`
Expected: new race tests FAIL against the old Store behavior; existing durability tests pass.

- [x] **Step 3: Replace side-effecting React updater with synchronous Store commit**

In `src/store.tsx`, derive `prev`, `next`, revisions and cache invalidation from coordinator `read()` and execute once. Publish only the finished snapshot. Keep cloud queueing detached after the local commit promise; preserve current logging/error behavior for non-durable background commits, and expose `retryLatest` as a Store recovery action without changing screen layout.

- [x] **Step 4: Convert `saveMatchDurably` into a latest-state durable transaction**

Derive the saved match, completion markers and matching Draft removal from the latest coordinator snapshot; await that transaction's primary save before returning. On failure reject and keep the finalizing-ID fence while the finalized match remains in memory, preventing a stale Draft from replacing it. Queue cloud change only after successful local save, using the transaction's before/after state.

- [x] **Step 5: Verify Store race and existing durability tests**

Run: `node --test tests/store-transactions.test.cjs tests/p0-durability.test.cjs`
Expected: all focused tests PASS; cold reload contains each committed mutation exactly once.

---

### Task 3: Integrate Draft, hydration and Import atomicity

**Files:**
- Modify: `src/store.tsx`
- Modify: `src/lib/importTransaction.ts`
- Modify: `tests/phase1-import-store-transaction.test.cjs`
- Modify: `tests/phase1-import-atomicity.test.cjs`
- Modify: `tests/store-transactions.test.cjs`

**Interfaces:**
- Import uses coordinator `replaceDurably` and does not independently write or publish snapshots.
- Draft checkpoint scheduling reads coordinator `read()` when its timer fires and checks the captured draft epoch plus finalizing ID.
- Hydration uses a single read/reconcile/publish path; normalization persistence is a normal revisioned commit.

- [x] **Step 1: Add failing Draft and Import race tests**

Add deferred-I/O checks for a Draft flush with an intervening unrelated update, a fenced Draft queued during Import, durable replacement ordering and publish-after-save, failed Import with buffered commits, and a fresh coordinator restoring the durable snapshot.

- [x] **Step 2: Run focused tests to verify failures**

Run: `node --test tests/store-transactions.test.cjs tests/phase1-import-store-transaction.test.cjs tests/phase1-import-atomicity.test.cjs`
Expected: new Draft/Import races fail; existing Import safety tests remain green.

- [x] **Step 3: Convert Draft scheduling to latest-snapshot flush**

Update `saveDraftMatch` to commit the new Draft in memory synchronously, preserve its debounce, and persist the coordinator's latest full snapshot at flush time. Finalization increments the epoch and rejects any pending same-ID checkpoint.

- [x] **Step 4: Fence and atomically publish Import**

Update `performAtomicImport` to parse/prepare and preserve backup before mutating state, cancel and invalidate Draft work, fence older queued work, durably save the imported snapshot, then publish and invalidate derived caches. If the Import write rejects, leave live state unchanged and propagate the error; older queued writes retain their own completion outcome.

- [x] **Step 5: Route hydration through one snapshot boundary**

When `getAppState` succeeds, reconcile once, replace the coordinator's initial snapshot before enabling edits, and enqueue only a normalized snapshot that still matches the hydration revision. Keep storage-read failure distinct from an empty store.

- [x] **Step 6: Verify Draft, Import and restart behavior**

Run: `node --test tests/store-transactions.test.cjs tests/phase1-import-store-transaction.test.cjs tests/phase1-import-atomicity.test.cjs tests/p0-durability.test.cjs`
Expected: all focused tests PASS; Import publishes only after verified save; Draft and unrelated state both survive reload.

---

### Task 4: Audit boundary and complete verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-phase-2-store-local-persistence-design.md` only if implementation details require a documented correction.
- No Supabase or cloud merge files are in scope.

- [x] **Step 1: Run Store-relevant first-phase repros**

Run: `node --test tests/audit/phase1-risk-repros.test.cjs`
Expected: the stale-snapshot assertion passes after the Store fix; the other five first-audit repros remain expected failures and are reported individually. The separate cloud suite remains outside this task.

- [x] **Step 2: Verify the cloud boundary is unchanged**

Run: `git diff -- src/lib/sync.ts src/lib/cloudMatch.ts src/lib/db.ts supabase`
Expected: no changes. Record merge-writeback race, remote deletion resurrection, empty-device restore, and schema mismatch as 3rd phase mandatory work.

- [x] **Step 3: Run full verification**

Run: `npm.cmd test`
Expected: all current standard tests PASS.

Run: `npm.cmd run lint`
Expected: exit 0; report warnings that remain.

Run: `npm.cmd run build`
Expected: TypeScript and production build succeed; report the existing bundle warning if present.

Run: `git diff --check`
Expected: no whitespace errors.

- [x] **Step 4: Review changed-file scope and data compatibility**

Confirm no storage key/shape, rating/competition rules, UI layout, user data, cloud file, migration, or database changed. Confirm the existing first-phase audit files remain present and the unrelated repro cases are preserved.
