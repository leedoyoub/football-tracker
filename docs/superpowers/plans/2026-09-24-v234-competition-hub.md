# v2.3.4 Competition Hub UX and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a consistent Global Ranking Team popup, immediate Competition type scroll reset, and revision-aware Cup/Champions runtime caching without changing football semantics.

**Architecture:** A shared compact menu presentation component replaces the one native Team select. App retains ownership of the only vertical scroll ref and supplies a narrow type-transition callback. The existing owner-scoped competition selector layer gains canonical Cup and Champions entries, which primary and deferred Competition consumers reuse demand-driven.

**Tech Stack:** React 19, TypeScript, Vite, Node's built-in test runner, Oxlint.

**Spec:** `docs/superpowers/specs/2026-09-24-v234-competition-hub-design.md`

## Global Constraints

- Set canonical version sources to `2.3.4`.
- Keep `RATING_ENGINE_REVISION = 10` and `STORAGE_KEY = football-tracker-v1`.
- Do not change canonical competition engines, ranking/award semantics, persisted schemas, or data migrations.
- Cache only at runtime through the stable `competitionCacheOwner`; never serialize Match/Event data on a hit.
- Do not commit or push.

## Review Focus

- A selected Team must retain its real ID while compact UI shows its short name; test select and clear mappings in the Global Ranking source/component tests.
- A newly replaced but equal-shaped Champions draw must miss; test object-reference invalidation in selector tests.
- A Cup-only mutation must not invalidate League; retain the existing League isolation test while adding Cup/Champions equivalents.
- Back navigation must still use saved scroll restoration; test the new helper independently from existing restoration behavior.
- Deferred panel remounting must remain staged, not synchronously render all lower analytics; retain the immediate-render structural assertion.

---

### Task 1: Shared compact filter menu and Global Ranking Team filter

**Files:**
- Create: `src/components/CompactFilterMenu.tsx`
- Modify: `src/components/PositionFilter.tsx`
- Create: `src/components/TeamFilter.tsx`
- Modify: `src/screens/GlobalRankingScreen.tsx`
- Modify: `tests/global-ranking-filter-labels.test.cjs`
- Modify: `tests/v233-ranking-ux.test.cjs`

**Interfaces:**
- Produces `CompactFilterMenu<T>({ value, options, onChange, label, allValue, allLabel, allAccessibilityLabel, menuClassName })`.
- Produces `TeamFilter({ value: string | null, teams, onChange, label })`.
- Consumes the unchanged `PositionFilter` API and Global Ranking `teamId: string | null` state.

- [ ] **Step 1: Write failing rendering/source assertions.** Assert that Position and Team render menu triggers with `aria-haspopup="menu"`, menu-radio semantics, default labels `Position` and `Team`, accessible names `All positions` and `All teams`, Team's bounded popup class, no `<select>` in `GlobalRankingScreen`, selection mapping to a team ID, and `null` clearing.

- [ ] **Step 2: Run focused tests to verify failure.**

Run: `node --test tests/global-ranking-filter-labels.test.cjs tests/v233-ranking-ux.test.cjs`

Expected: FAIL because Team still renders a native select and no TeamFilter exists.

- [ ] **Step 3: Implement the shared presentation primitive and wrappers.** Move PositionFilter's open state, document listeners, trigger classes, menu-radio buttons, and close behavior into `CompactFilterMenu`. Implement TeamFilter with a null all value, short-name options, `All teams` accessibility copy, and `max-h`/`overflow-y-auto` popup styling. Replace the native Global Ranking Team select with TeamFilter without changing `buildGlobalRankingData` filter mapping.

- [ ] **Step 4: Run focused tests to verify passing behavior.**

Run: `node --test tests/global-ranking-filter-labels.test.cjs tests/v233-ranking-ux.test.cjs`

Expected: PASS; no native Team select remains and values/accessibility are preserved.

### Task 2: App-owned Competition type scroll reset

**Files:**
- Create: `src/lib/competitionTypeScroll.ts`
- Modify: `src/App.tsx`
- Modify: `src/screens/CompetitionScreen.tsx`
- Create: `tests/v234-competition-scroll.test.cjs`

**Interfaces:**
- Produces `resetCompetitionTypeScroll(container: { scrollTop: number } | null): void`.
- App provides `onCompetitionTypeChange(next: CompetitionType): void` to CompetitionScreen.
- CompetitionScreen consumes that callback only in its top-level tab click handler.

- [ ] **Step 1: Write failing helper and wiring tests.** Test nonzero scroll resets to zero for League→Cup, Cup→Champions, and Champions→League by invoking the helper; source-test that App passes the ref-owned callback and CompetitionScreen uses it only for top-level `setType`, while metric/filter/tab patch paths do not call it. Keep an assertion that `window.scrollTo` and `querySelector` are absent.

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `node --test tests/v234-competition-scroll.test.cjs`

Expected: FAIL because the helper and callback wiring do not exist.

- [ ] **Step 3: Implement the narrow owner callback.** Add the pure helper, call it from App with `scrollRef.current` before updating competition screen state, pass the callback into CompetitionScreen, and route only top-level tab presses through it. Leave `restoreScrollWhenReachable`, navigation callbacks, and ordinary state patching unchanged.

- [ ] **Step 4: Run focused test to verify passing behavior.**

Run: `node --test tests/v234-competition-scroll.test.cjs`

Expected: PASS; only type changes reset the app-owned surface.

### Task 3: Revision-aware Cup and Champions selectors

**Files:**
- Modify: `src/engine/competitionSelectors.ts`
- Modify: `src/store.tsx`
- Modify: `src/screens/CompetitionScreen.tsx`
- Modify: `tests/critical-bugfix.test.cjs`
- Create: `tests/v234-competition-selectors.test.cjs`

**Interfaces:**
- Produces `selectCupCompetition(owner, teams, matches, season, cupRevision, teamCatalogRevision, players, onDiagnostic?)`.
- Produces `selectChampionsCompetition(owner, draw, matches, season, championsRevision, players, onDiagnostic?)`.
- Both return the corresponding canonical engine result by stable reference on equal keys.

- [ ] **Step 1: Write failing selector tests.** Build canonical Cup/Champions fixtures and assert cold then same-reference hit, Cup revision invalidation, Cup team catalog/player identity invalidation, Champions revision invalidation, Champions draw object-reference invalidation, and Champions player identity invalidation. Assert selector source contains no `JSON.stringify`, `.filter(`, or `.sort(` before hits. Preserve League hit/isolation assertions.

- [ ] **Step 2: Run focused selector tests to verify failure.**

Run: `node --test tests/critical-bugfix.test.cjs tests/v234-competition-selectors.test.cjs`

Expected: FAIL because Cup and Champions selectors are absent.

- [ ] **Step 3: Implement owner-scoped canonical selectors.** Add per-type entries in the existing WeakMap cache, compare only scalar revision/catalog keys and raw array/draw references, report DEV-safe hit/miss diagnostics, and invoke canonical engines only on misses. Ensure setChampionsDraw replaces its draw object so the reference changes, without adding persisted revisions. Route CompetitionScreen's visible Cup/Champions model reads through the new selectors.

- [ ] **Step 4: Run focused selector tests to verify passing behavior.**

Run: `node --test tests/critical-bugfix.test.cjs tests/v234-competition-selectors.test.cjs`

Expected: PASS; equal revisits are O(1) stable hits and defined mutations miss.

### Task 4: Reuse selector models in deferred consumers and stage Best XI grouping

**Files:**
- Modify: `src/screens/CompetitionScreen.tsx`
- Modify: `src/engine/awards.ts`
- Modify: `tests/critical-bugfix.test.cjs`
- Create: `tests/v234-competition-consumers.test.cjs`

**Interfaces:**
- CompetitionScreen provides cache-backed canonical model access to deferred completion and awards.
- `competitionAwardResult` accepts an optional already-derived season status/type model input while preserving its existing public call behavior.
- `indexCompetitionMatchesByStage(matches)` is local to CompetitionScreen and returns `Map<string, Match[]>` for snapshot lookup.

- [ ] **Step 1: Write failing reuse tests.** Instrument selector diagnostics/canonical engine calls to show a visible Cup or Champions model is reused by the corresponding award and completion consumer rather than rederived. Source-test that deferred panels retain their idle staging/key, and test a stage index maps final/finalReplay correctly for Cup and Champions snapshots.

- [ ] **Step 2: Run focused consumer tests to verify failure.**

Run: `node --test tests/critical-bugfix.test.cjs tests/v234-competition-consumers.test.cjs`

Expected: FAIL because awards/completion currently derive direct models and snapshot groups repeatedly filter.

- [ ] **Step 3: Implement minimal consumer reuse.** Pass selector-backed competition models only when the consumer asks for them; do not warm other competition types. Refactor completion to read cached selectors after its league-complete short circuit. Let awards receive the visible/cached status/model for its current type, retaining existing direct-engine behavior for unrelated callers. Build one local stage index over the already-scoped tournament matches and use it for every Best XI snapshot.

- [ ] **Step 4: Run focused consumer tests to verify passing behavior.**

Run: `node --test tests/critical-bugfix.test.cjs tests/v234-competition-consumers.test.cjs`

Expected: PASS; staged rendering remains and duplicate current-screen derivations become selector hits.

### Task 5: Release metadata and full validation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/config.ts`
- Modify: release-focused tests above where version assertions belong

**Interfaces:**
- Produces release version `2.3.4`; no rating/storage interface changes.

- [ ] **Step 1: Write/update the version assertion.** Assert package, package-lock root package, and `APP_VERSION` all contain `2.3.4`, while rating revision and storage key source remain exact required values.

- [ ] **Step 2: Run release-focused tests.**

Run: `node --test tests/v234-competition-scroll.test.cjs tests/v234-competition-selectors.test.cjs tests/v234-competition-consumers.test.cjs tests/global-ranking-filter-labels.test.cjs`

Expected: PASS.

- [ ] **Step 3: Update canonical version fields.** Change only the three version sources to `2.3.4`; do not change dependency versions, rating revision, or storage key.

- [ ] **Step 4: Run the full release validation.**

Run: `npm.cmd test; npm.cmd run lint; npm.cmd run build; git diff --check`

Expected: zero failing tests, zero lint errors, successful build, and no whitespace errors.

- [ ] **Step 5: Inspect handoff state without committing.**

Run: `git status --short --untracked-files=all; git diff --stat; git diff`

Expected: only the intended v2.3.4 source, test, and documentation changes; do not commit or push.

## Plan Self-Review

- Spec coverage: Tasks 1–5 cover menu UX, scroll ownership, all selector keys,
  deferred reuse/staging, stage grouping, release metadata, and validation.
- Placeholder scan: no implementation placeholders or deferred decisions remain.
- Type consistency: all selector and callback names match the interfaces above.
- Review focus: each listed risk has an owning task and explicit test.
