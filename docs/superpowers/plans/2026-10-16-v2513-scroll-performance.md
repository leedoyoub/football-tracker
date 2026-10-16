# Football Tracker v2.5.13 implementation plan

Execute inline under superpowers:executing-plans. The user's finalized attachment authorizes implementation, tests, commit, main push and Pages deployment.

**Goal:** Preserve v2.5.12 presentation and football results while adding the six requested scroll controls and reducing measured list/detail/award costs.

**Baseline:** `5fca29a69317922206e64329b3e2928fe662c4e0`; clean main, version 2.5.12.

**Architecture:** Keep FloatingScrollToTop's existing observer mode and add an optional native app-content distance observer. Mount one new control in App only for eligible routes/competition menus. Use a measured card-window adapter for variable heights; retain VirtualRankingList. Share immutable ranking/award scope inputs and compute only requested record groups.

**Spec:** User attachment `2edcfce7-abe7-4f12-ad2c-6c3616d8b583/Pasted text.txt`.

## Constraints
- No changes to Rating REV13, MOM, awards policy, competition operation, data meaning, persistence, sync or navigation semantics.
- Reuse exact existing card renderers/classes, icons, images, controls and gaps. No dependencies.
- Only Player Detail, Records main/full lists, Results, Players and Competition Matches get a new button; threshold 500px. Preserve existing ranking/race controls.
- Changes must retain immutable invalidation and policy revisions. No statistical test expectation changes except release version and virtualization structure.

## Review focus
- Variable-height measurements above the visible anchor must not jump the list.
- Filter shrink, empty/single lists, data replacement and Back must preserve reachability and clamp native scrolling.
- Transferred/released/missing players and frozen competition identities must keep exact statistics and award events.
- Scope caches must include every dependency, remain bounded/weak, and never mutate cached projections.
- Buttons must follow the active competition menu, clean up observers and scroll only app-content.

## Tasks
- [x] Archive independent v2.5.12 baseline and run the same benchmark against both unchanged graphs before production changes. Baseline: Results 9,029 DOM nodes; Players 2,626; Competition Matches 3,848; awards cold approximately 760ms on 367 players / 1,152 matches.
- [x] Add failing route/distance/cleanup tests; extend FloatingScrollToTop and mount only eligible routes in App.
- [x] Add failing measured-window, anchor, resize, filter-shrink and reachability tests; implement measured card adapter and integrate Results/Players/CompetitionMatches with unchanged card contents.
- [x] Measure and remove duplicate Player Detail rank/index work while asserting exact three-metric overall/position/team ranks against the archived implementation. Retain existing deferred sections and Rank Trend unless measured evidence justifies a change.
- [x] Profile cold awards; optimize canonical scope data reuse and requested record calculations. Compare complete events, winners, counts, team results and filters against v2.5.12, including immutable edits and policy revisions.
- [x] Measure NewMatch badges and initial bundle. Apply only safe measured improvements; record deferred candidates and reasons.
- [ ] Run alternating before/after benchmark with median/p95 and size variants; full tests, lint, build, diff check, independent review; bump to 2.5.13, write docs/v2.5.13-release.md, commit/push and verify Pages/public version.
