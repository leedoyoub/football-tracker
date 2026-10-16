# Football Tracker v2.5.12 Implementation Plan

> Execute inline using superpowers:executing-plans. The user's attached, finalized requirements authorize implementation, verification, commit and main deployment.

**Goal:** Expand canonical awards and career records while preserving REV13, saved data and competition rules.

**Architecture:** Extend existing awards selectors, derive finalized event and team-season read models, and share them across career awards and Records. Reuse AwardBestXI, existing filters, cards and the main scrolling surface.

**Tech Stack:** TypeScript, React, Vite, Node test runner.

**Spec:** User attachment `cfc93672-63eb-4b3a-b304-11af7365634b/Pasted text.txt`.

## Global Constraints
- Version 2.5.11 → 2.5.12; retain Rating REV13 and MOM priority, competition and persistence rules.
- Official rating awards retain 40% appearances; League Golden Glove, final MVP and ordinary rankings have no minimum.
- Only finalized events count. No Recap statistics, Cup stage awards or Champions Team of the Final.
- Historical team membership comes from actual appearances in the relevant competition.

## Review Focus
- Unfinished replay and incomplete Champions pairings must not publish trophies.
- Transfers, released players and unused substitutes must retain accurate historical attribution.
- Immutable changes to matches, roster, teams or draws must invalidate derived results.
- Zero denominators and brief role segments must produce valid values or an unavailable state.
- Long ranking lists must retain bounded DOM and work after same-length scope changes.

## Tasks
- [x] Add failing regression tests for unrestricted defensive/GK metrics, League Golden Glove and canonical final MVP ties; implement shared MOM selection and award criteria; run targeted tests.
- [x] Add failing tests for finalized monthly/round/final/competition/season events, deduplication, historical membership and invalidation; implement `officialAwardsForSeason` and shared team-season results.
- [x] Add regression tests for player award and team history ranking filters, totals, best-season records and replay deduplication; implement Records selector integration using optional competition states.
- [x] Replace Player Detail awards with expandable career groups; use the same events in Records History; unify Champions round pitch and final MVP display using existing controls and AwardBestXI.
- [x] Measure existing virtualization and calculation cache reuse; improve same-count remeasurement and Records full lists only where necessary; validate window bounds and disposal.
- [x] Review semantic diff, run complete test suite, lint, TypeScript/production build and diff check; bump version consistently; commit, push main and verify Pages workflow/public version.

## Execution evidence
- Targeted v2512 regressions: 15/15 passed. Complete suite: 1,063/1,063 before the last two added policy tests; 1,065 unique passing tests including those additions. Existing virtual-window regressions also passed.
- Independent review found unused transfer bench registrations could move award attribution; reproduced RED, fixed by actual appearance/GK appearance attribution, GREEN.
- Compatibility comparisons preserve complete unchanged fields; only specified Season GK policy, League award wording, winner team metadata and career-awards markup use explicit policy projections. Integrated Season wording has its own regression.
- Two-season synthetic benchmark: 367 players, 1,152 matches; cold awards Records 741ms, cached Records 100 reads 0.091ms, shared season model 100 reads 0.027ms; initial virtual rows 19/350. CPU/SSR measurements, not browser FPS.
- Production build, lint and diff check exited 0. Lint retains pre-existing warnings and Vite retains the bundle-size warning.
- Browser QA unavailable: browser inventory was empty; isolated synthetic QA files were removed. React render/interaction/window tests remain the UI evidence.
- Feature commit `95586beccec2537cd5dc855387a62b22295bb4f2` pushed to main. Pages workflow `38891151054` completed successfully. Public HTTP 200 and `/football-tracker/assets/index-BhhGCjzw.js` confirmed version `2.5.12`, Career Awards and Honors & History.
