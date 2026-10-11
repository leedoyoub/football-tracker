# Football Tracker v2.5.5 performance design

The user-supplied release specification is authoritative. Work starts at clean
`main`, commit `2cb89aa3de0afcd59d844e0786d31eb9eba2d183`, version 2.5.4.
The user explicitly requests implementation, verification, commit, push to
`origin/main`, and deployment verification in this session.

## Constraints

Preserve screen DOM/CSS, copy, ordering, navigation, scroll restoration, deferred
rendering, every feature, REV13 formulas and floating point addition order,
historical player IDs, timeline ordering, SOT fallbacks, stored schema, key
`football-tracker-v1`, primary write/read-back validation, backup/import safety,
draft timing and atomic finalization. Keep Cloud Sync disabled. Add no dependency.
Use deterministic synthetic histories and memory storage, never user storage.

## Measurement and approach

Existing benchmarks and 823 passing tests establish the baseline. The added
benchmark separates fresh fixture and repeat reads, records individual samples,
median and p95, and excludes TypeScript loading from timings. Synthetic history
has 16 teams, up to 23 roster members, 30 league days, Cup and Champions records,
two seasons, transfers, released and absent historical players, substitutions,
same-minute sequenced events, position changes, stoppage and legacy SOT.

Connected browser inventory is empty and IAB creation reports unavailable.
Engine timings are explicitly derivation timings, not browser screen timings.
No browser FPS, paint, React Profiler, image network or PWA kill claims will be made.

Measured initial sample: Home derivation 8390ms, League History 3347ms, League
336ms, Chemistry repeat 615ms, Draft save 90ms cold / 30ms repeat. CPU samples
show repeated `ratePlayerMatch`/`normalizeMatchTimeline` calls in competition.
Final comparison uses seven unprofiled repetitions and a retained baseline source.

Use existing engine interfaces. Cache match ratings and MOM against the existing
normalized timeline and players array. Build participating candidates in original
player order. Aggregate competition rating sums per team in one traversal in
exactly the previous match/player order. Index recorded appearances within
`playerMatchFacts`; use it for stats, player history and Records. Reuse position
minute analysis with a bounded scope cache. Analyze Records goal types and streaks
once per player. Cache Chemistry results only if repeated measurements justify it,
using immutable arrays and bounded scope keys.

Alternative cumulative History accumulation is deferred: adding games by day
could change floating point order for unsorted/imported data. Retain the existing
prefix selection and domain ranking algorithm; accelerate their shared inputs.
Alternative global store/DOM refactoring and code splitting are excluded without
browser evidence of benefit and unchanged transitions.

## Persistence

Measure validation and full serialization. Keep both and synchronous verified
primary saves intact. Review IndexedDB connection lifetime independently: only
reuse an open/pending connection with error, blocked, close and versionchange
invalidation, and explicit transaction abort rejection. Test failure/retry and
late successful requests after blocked rejection. No delayed writes or new schema.
Cloud queue methods already guard disabled sync before serialization.

## Proof and release

Compare entire engine output objects with the retained baseline across synthetic
and adversarial histories, including mutations, removals, draw/player changes,
empty scopes and tie cases. Add work-count assertions for cache reuse and tests
for cache invalidation and defensive copies. Run existing storage suites and new
IndexedDB lifecycle tests. Review every changed line for scope preservation.
After verification update the three version files, run npm test/lint/build,
git diff --check and both benchmarks, commit, push, and inspect Actions/Pages.
The report names unmeasured browser metrics and remaining serialization cost.
