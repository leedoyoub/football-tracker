# Football Tracker v2.5.5 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Reduce measured repeat calculations while preserving every v2.5.4 result and persistence guarantee.

**Architecture:** Improve existing engines without changing screen DOM, CSS or formulas. Weak caches follow immutable snapshot lifetimes, with bounded scope maps and defensive copies for mutable public collections.

**Tech Stack:** TypeScript, React 19, Node test runner, Vite, IndexedDB.

**Spec:** `docs/superpowers/specs/2026-10-12-v255-performance-design.md`

## Global Constraints

- Rating engine REV13; preserve exact floating point addition order and all tie rules.
- Storage key `football-tracker-v1`; no schema or draft delay changes.
- No screen DOM/CSS, copy, behavior or feature changes; no dependencies.
- Cloud Sync remains disabled; never read/write real user browser storage for tests.
- Final version 2.5.5 in package.json, package-lock.json, src/config.ts.

## Review Focus

- Match event/appearance replacement and rating revision must invalidate match caches.
- Player removal/reordering and historical IDs must preserve participant output order.
- Unsorted legacy chronology and equal-minute events must preserve sums and attribution.
- Empty scopes, transfers, released/retired players must preserve fallbacks and nulls.
- Blocked/error/closed IndexedDB connections must retry and aborted writes must settle.

### Task 1: Baseline and independent equivalence harness

**Files:** tests/helpers/v255-fixture.cjs, tests/helpers/register-ts.cjs, tests/v255-performance.bench.cjs, tests/v255-equivalence.test.cjs.
**Interfaces:** Fixture produces AppState-shaped synthetic history. Baseline runner loads the exact original engine module graph from an isolated source directory.

- [x] Preserve baseline source and run seven cold/revisit benchmark samples.
- [x] Add whole-object equivalence tests for rating/MOM, rankings, competitions, Best XI, History, positions, Records, Chemistry, trends, News/Latest Changes/What Changed, SOT and defence.
- [x] Cover edited/deleted match, players and draw changes, unsorted legacy input and empty arrays.
- [x] Run `node --test tests/v255-equivalence.test.cjs`; expect identical outputs.

### Task 2: Shared calculation improvements

**Files:** src/engine/rating.ts, competition.ts, playerMatchFacts.ts, playerDerived.ts, stats.ts, playerRecords.ts, positionScope.ts, analytics.ts; tests/v255-cache.test.cjs.
**Interfaces:** Existing public outputs retain their types/order. New matchesWithPlayerAppearance(playerId: string, matches: Match[]): Match[] returns an ordered defensive copy from a weak appearance index.

- [x] Write cache reuse/work-count tests and run them red before each improvement.
- [x] Cache rated participants/MOM by normalized timeline, players identity and revision; preserve player order.
- [x] Aggregate team rating sums once in the existing game/player order.
- [x] Share appearance lookups and position minute analysis; bound scope maps to 64 entries.
- [x] Reuse Records streaks and goal totals; cache Chemistry combinations only after repeat cost is confirmed.
- [x] Run targeted and whole-object equivalence tests after each change; retain only measured improvements.

### Task 3: IndexedDB lifetime and storage regressions

**Files:** src/lib/db.ts, tests/v255-db.test.cjs.
**Interfaces:** openDB(), saveToIndexedDB(), getFromIndexedDB() retain their signatures and stores/version.

- [x] Write concurrent open, reuse, retry, versionchange/close, blocked late success and abort tests; run red.
- [x] Reuse the open promise, discard failed connections and close stale late results.
- [x] Reject transaction aborts; preserve verified localStorage authority and all import/backup logic.
- [x] Run storage regression suites and Draft save benchmark; report remaining serialization cost.

### Task 4: Review, release and deploy

**Files:** package.json, package-lock.json, src/config.ts, docs/performance/v2.5.5-report.md, benchmark result JSON.

- [x] Run final benchmark with the same fixture/sample count; compare median, p95 and retained baseline.
- [x] Review full diff and obtain a fresh whole-branch review; fix meaningful findings with regression tests.
- [x] Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`; compare prior lint warnings.
- [ ] Update version to 2.5.5, commit the reviewed release and push `origin/main`.
- [ ] Verify the commit's Actions build/deploy and published Pages version; report exact statuses.
