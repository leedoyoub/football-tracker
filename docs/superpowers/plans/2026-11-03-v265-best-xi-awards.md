# Best XI and Awards v2.6.5 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the shared engine and parallel, disjoint Team History and presentation tasks. Steps use checkbox syntax for tracking.

**Goal:** Implement the user's final Best XI/Awards specification as one patch release.

**Architecture:** Retain AWARD_433 and deterministic group selection. Reuse canonical raw ratings, position timelines, competition models and official event projections. Official scopes share one player-level evaluation; Team History retains a separate formation/role policy and reuses the existing Team Players pitch.

**Tech Stack:** Existing TypeScript/React/Vite, node:test; no dependencies added.

**Spec:** User's final Best XI and Awards integration request (2026-11-03).

## Global Constraints

- Preserve Rating REV13, match MOM, match input, roster/transfer operations, tournament progression, general statistics, match schemas, storage keys and sync.
- Local and remote main start at daefede / 2.6.4; initial worktree clean. Work directly in the requested open project.
- Bump AWARD_POLICY_REVISION only. Increase PATCH once, after validation, to 2.6.5.
- Raw arithmetic mean per played match; minutes capped through existing credited timeline helpers. Bonuses affect selection only.
- Retain official group selection and existing pitch. No global assignment optimizer.

## Audit and Decisions

Current official evaluation splits players by historical team and uses 40% appearances. Team History collapses saved multi-line formations into three lines and consumes broad official candidates. Official events feed career, team and Records honors; News additionally computes monthly awards. History/Competition retain monthly state. Existing arrays use immutable Store updates and arrayItemRevision for legacy item replacement; caches must include policy and source revisions and stay bounded.

Transfer fallback: there are no stored contracts or transfer dates. Use canonical chronological recorded appearances to delimit evidenced team stints, including bench registrations when available. At any recorded opportunity, assign only one evidenced team; uncertain gaps conservatively follow the last evidenced team until the next differing-team record. Single-team players retain that team's whole recorded scope. Never invent dates, sum two full club schedules, or count a match twice. Competition participation uses the same evidenced stint windows restricted to that competition. Bonus is a participation-weighted combination of team base bonuses, bounded naturally by the largest base for that competition.

Cup survival stages: existing stages remove two of 16 teams each time. Stage 5/6 eliminations represent places 5–8 (0.06), stage 7 places 3–4 (0.12). Confirmed finalists have secured at least runner-up (0.21); no prospective champion bonus. Champions uses canonical resolved bracket progression similarly. Half standings reuse leagueCompetition on the exact range; completion checks every canonical team and each of the 15 unique slots.

## Review Focus

- Transfers and released/currently reassigned players: historical appearances determine scope/team, one candidate per player.
- Zero-minute bench and post-90-only entries: no raw sample without credited playing time.
- Legacy monthly/round selection restoration: normalize to valid scope and metric without data migration.
- Same-length source replacement and nested immutable edits: invalidate relevant cached views.
- Partial schedules/replays: no premature official events, no future team bonus.

## Tasks

### 1. Shared official evaluation and publication

Files: awardRules.ts, awards.ts, awardScopes.ts, awardPolicy.ts, officialAwards.ts; focused v265 regression tests.

- [x] Pin minutes eligibility, averages, bonuses, half completion, transfer opportunities, race/XI/MVP consistency in failing tests.
- [x] Reuse ranking/timeline facts in one player-scope evaluation; preserve legacy goalkeeper awards independently of changed XI policy.
- [x] Expose `AwardScope = 'first-half' | 'second-half' | CompetitionType | 'season'` and `awardResultForScope(scope, season, teams, players, matches, states)` returning CanonicalAwardResult or undefined. Existing APIs remain.
- [x] Publish four new finalized half kinds; remove six retired kinds, retaining unrelated awards.
- [x] Verify focused tests and common-model cache invalidation.

### 2. Team History selection and existing pitch reuse

Files: teamHistorySelection.ts, teamHistoryPlacement.ts/teamHistoryLayout.ts as needed, TeamHistory.tsx, minimal Pitch.tsx adapter; focused tests.

- [x] Test modal saved tactical formation, 30% team minutes, whole-match averages, 20% secondary roles, main-role priority, empty slots and transfers.
- [x] Select independently of official bonuses/candidate eligibility, preserve exact formation lines, reuse Team Players Pitch presentation.
- [x] Verify deterministic placements, navigation and mobile geometry.

### 3. Presentation, records, News and compatibility

Files: CompetitionScreen.tsx, RecordsHistory.tsx, RecordsScreen.tsx, SeasonHighlightScreen.tsx, awardRecords.ts, historyReadModels.ts, news.ts, seasonAnalytics.ts, relevant lib state/types and tests.

- [x] Replace monthly/Champions round/final award UI; retain Cup stage and other competition controls.
- [x] Add League three-scope tabs and History six-scope views via shared result API; distinguish live/final.
- [x] Replace brittle metric slices, normalize retired state/routes, regenerate News from finalized half results.
- [x] Remove active monthly award computation while preserving matchday review, snapshots, trends and general News.
- [x] Verify all generic career/team/Home consumers inherit canonical events/results and raw display ratings.

### 4. Regression, performance, release and deployment

- [x] Compare repeatable fixture performance before/after (cold/warm evaluation, half scopes, history, race and match edit).
- [x] Run full tests, lint, build, diff check; update policy-sensitive expectations without removing unrelated regression coverage.
- [x] Chromium rendering with isolated synthetic data and responsive widths; source/harness navigation checks; complete diff and retired-string audit. Manual interaction stopped by the Computer Use URL-confidence guard. See release notes for inherited 288px limits.
- [ ] Update package.json/package-lock.json/src/config.ts once; final checks; stage only this work and commit/push main without force.
- [ ] Verify workflow result and deployed app separately; report measured results and verification limits in Korean.
