# Football Tracker v2.6.8 Implementation Plan

> **For agentic workers:** Use systematic-debugging, test-driven-development, and verification-before-completion. Independent engine domains use dispatching-parallel-agents; integration and release remain with the primary worker.

**Goal:** Add safe mobile edge Back and reduce measured computation costs while preserving every official result and durable save behavior.

**Architecture:** Reuse App navigation entries and existing Back handlers, preserving screen state and scroll restoration. Optimize repeated calculations in existing engines with immutable-array cache ownership; compare independent v2.6.7 source with the final source. No new navigation stack, database schema, or persistence format.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Node test runner, existing isolated Chromium/CDP helpers.

**Spec:** User attachment `0f80a2c3-9538-4383-8102-26c123002180/Pasted text.txt`, sections 0–15. User explicitly requests continuous implementation through push/deployment without additional design approval or clarification.

## Global Constraints

- Preserve Rating REV13, official awards, rankings, historical membership, all record and News IDs/order.
- Preserve localStorage validation, IndexedDB backup, Supabase queue, autosave and import/export.
- Read-only screens with a real Back handler only; exclude editors/import and block overlays, inputs, horizontal gestures.
- Use 2/6 seasons (1,152/3,456 games); report median/p95 and distinguish cold/warm/revisit/edit, CPU/SSR/browser.
- Keep only measured improvements. Record unverified physical iPhone Safari/PWA behavior explicitly.

## Review Focus

- Native Safari navigation must not double-pop custom gestures.
- Overlay opening, route replacement, multi-touch and cancelled gestures must invalidate candidates.
- Historical edits/deletion, player transfer/release and position changes must invalidate affected results.
- Draft changes must retain full save validation and not repeatedly serialize an unchanged last route.
- Deferred content and browser refresh must preserve filter, tab and reachable scroll restoration.

## Tasks

- [x] 1. Audit clean local/GitHub main, existing tests, store, navigation, PWA and benchmarks; capture baseline results.
- [x] 2. News/Latest Changes: profile repeated season/checkpoint/award/record work, optimize identified duplication, add independent baseline event equivalence tests including mutations.
- [x] 3. Player Overview/Global Ranking/Rank Trend: profile and remove repeated scope/snapshot work, preserve every historical point and official rank; add baseline comparisons.
- [x] 4. Records/Season Recap: profile shared indexes/official award calls, optimize confirmed duplication; compare every category and mutation against baseline.
- [x] 5. Implement a tested 24px edge touch recognizer with directional threshold, cancellation, double-pop protection, target exclusions and listener cleanup; wire exact existing Back callbacks. Remove sticky Back and normalize tab offset.
- [x] 6. Audit store/editor/home/lists/startup. Measure rendering and storage effects; apply only supported minimal fixes. Keep autosave timing and validations.
- [x] 7. Run independent alternating CPU/SSR and browser comparisons, mobile widths 320/375/390, gesture/navigation/storage/offline checks. Record raw measurements and limitations.
- [x] 8. Run full suite, TypeScript/build/lint/diff check and separate final review. Fix substantive findings with regression tests.
- [ ] 9. Bump config/package/lock metadata to 2.6.8, write Korean release notes, commit, push main, verify Pages workflow and served version.

## Execution Record

- Initial local main: `82c2c8a9e1975797b55397eac4389d2d1a8a6cc7`; clean working tree, no AGENTS.md discovered. Existing dependencies and benchmark/browser helpers are available.
- User opted out of design questions; proceed in current workspace and preserve existing artifacts. CPU benchmarking is serialized after implementation to avoid concurrent-worker measurement noise.
- Baseline: full 1,309/1,309 tests passed. Focused integrated change suite: 43/43 passed; navigation/route/gesture subset: 22/22 passed.
- Independent review reproduced duplicate roster/match-ID rank differences (fixed via original-engine compatibility path, independent comparisons green) and Team History disclosures incorrectly treated as overlays (real Chromium RED then fixed to actual popup triggers). Also added document multi-touch cancellation and layout-phase route cleanup.
- Real Chromium revealed fat-finger targeting of full-width News buttons and popup outside-close ordering; the recognizer now allows ordinary action buttons while consuming completed swipes, and snapshots popup blocking at pointerdown. Integrated 320/375/390px UI: 50/50 cases, runtime errors 0. Final refresh test now seeds once per context to avoid overwriting the persisted route during reload.
- Shared engines retain exact v2.6.7 complete News/event, rank/trend and Records comparisons for immutable and legacy same-array edits/deletes/additions/transfers. Rating/award revisions and all persistence code remain unchanged.
- Final CPU/SSR, Records metric, player engine, browser startup, React profiling and actual offline worker checks are serialized. Version metadata and final full suite/release/push/deployment follow.
- Resume 2026-11-13: local/remote main still `82c2c8a`, all implementation uncommitted. Last completed log was production React profiling at 2026-11-12 23:28:20 KST. Reused existing CPU/player/Records/31-sample overall/profile/capacity measurements; no implementation was reset or recreated. Original attachment is not present in this checkout; this recovered plan/release record and the user's current requirements define the resumed scope.
- Fresh TypeScript and production build passed; lint exit 0 with 44 warnings. Existing UI regression expanded to 1280px desktop, 36 cases passed at 320/375/390/1280px. Expanded swipe lifecycle tests passed 71 cases, runtime errors 0.
- First resumed full suite: 1,332/1,339 passed. Seven stale source/markup/version/browser-harness expectations were corrected while retaining official calculation source equality and adding complete independent candidate-field comparisons. Focused source/equivalence 12/12 and two UI harness files 25/25 passed. Full suite rerun remains required.
- Final independent review found no Critical/Important production issue. Clarified that last-route optimization avoids duplicate writes, while JSON.stringify remains. Added actual active-touch route/blur/pagehide cancellation coverage in response to the remaining review note.
- Actual offline worker validation found delayed response cloning after body consumption, preventing asset caching; minimal fix and dedicated RED/GREEN worker regression are in progress. This existed outside the performance edits and must pass before publication.
- Final worker fix: clone immediately and extend fetch lifetime for cache writes. Delayed-cache real-Response regression RED 0/2, fixed worker plus boot GREEN 7/7. Exact v2.6.7 independently reproduced the same bug. Actual offline reload passes, tab/competition and all 1,152 saved IDs preserved; old cache four entries/error count six, fixed cache six entries/error count zero. New-document reload barrier prevents stale-document false positives.
- Final full suite including worker regressions: 1,342/1,342 passed, zero failures/cancellations/skips (418.9s). Final build and TypeScript passed; lint exit 0, 44 warnings; diff check passed. Final swipe 71/71, existing mobile/desktop UI 36/36, runtime errors zero. Independent review and post-fix review have no remaining Critical/Important finding.
- Serialized startup comparison 11 samples/side completed against exact v2.6.7. Player Overview first/full analysis median 669.1/1605.3 → 598.4/1361.5ms. Home full analysis 2089.1 → 1825.4ms, first frame 555.0 → 556.2ms. Record p95 regressions, +6,756 entry JS bytes and additional retained cache memory in release notes. Six-season browser timing remains excluded due native localStorage quota; CPU/SSR 2/6-season measurements retained.
- Release transport is the remaining external step after committing this record: push main once and verify that exact commit's Pages run and served v2.6.8. Its immutable commit SHA and deployment result are recorded in the final user report and ignored recovery ledger, avoiding a documentation-only second deployment.
