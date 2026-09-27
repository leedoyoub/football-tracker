# Phase 1 Data Safety and Canonical Opponent SOT Design

## Goal

Make resume and import fail-safe, establish one authoritative Opponent SOT derivation, and ensure every historical rating and SOT-derived result is recomputed from raw match data with the Phase 1 coefficient changes.

## Scope and constraints

- This changes only resume/error safety, import correctness, Opponent SOT input and derivation, rating coefficients, and their dependent read models.
- No later-phase layout, navigation, header, Records-filter, Teams-grid, or News redesign work is included.
- Existing raw match history remains immutable apart from user edits. Missing manual SOT remains missing, never becomes zero.
- No commits or pushes are part of this work.

## Data and canonical SOT domain

`Match` gains optional `halftimeOpponentSot` and `fulltimeOpponentSot` fields. A new domain module owns all SOT interpretation:

- A manual pair is eligible only when both fields are present integer values at least zero.
- A complete pair is valid only when FT is at least HT, HT covers first-half conceded goals, FT covers total conceded goals, and `FT - HT` covers second-half conceded goals. Existing 45+/90+ chronology semantics are reused rather than reinvented.
- A missing or incomplete pair uses the existing valid-GK-save plus conceded-goal proxy for the entire match. It never mixes manual and inferred halves.
- A complete invalid pair is surfaced as invalid input and is rejected on save/import; it is not silently interpreted as legacy data.
- Manual SOT includes goals. It is never incremented by conceded goals.
- `firstHalfOpponentSot = HT`, `secondHalfOpponentSot = FT - HT`, and whole-match SOT is `FT`. Missing values are never zero by implication.
- Segment exposure is `HT * overlap(segment, 0..45) / 45 + (FT - HT) * overlap(segment, 45..90) / 45`, using the canonical player-position timeline segments. Stoppage events remain event-attributed, while credited exposure cannot exceed 90 minutes.

The same module supplies whole-match SOT to rating/suppression, player SOT ranking metrics, Records, combination metrics, analytics/insights, and League/Cup/Champions SOT-allowed tie-breaks. No consumer retains a local `saves + conceded` formula; that calculation exists only inside the canonical legacy fallback. GK saves remain independent and continue to drive the GK save bonus.

## Draft restoration

Editor-source preparation returns an explicit success or failure result before `MatchEditor` mounts. A resumed draft that cannot be reconstructed displays recovery UI and does not create editor state, a default lineup, or autosave effects under the existing draft ID. Edit recovery stays fail-closed as well. Restoration failure does not mutate the persisted draft. Successful resume restores the persisted authoritative appearances, events, substitutions, position history, kickoff layout, and manual SOT fields exactly.

## Atomic import

Import is split into a pure prepare phase and a Store-owned replace transaction. Preparation parses, validates, and normalizes without mutating storage or React state. Replacement preserves a recovery copy, invalidates the persistence generation and pending draft timer, serializes the imported snapshot behind any already-started durable write, persists it, then atomically switches the live Store snapshot and invalidates derived caches. All later write paths carry the generation fence so no pre-import snapshot can persist afterward. A failed prepare or durable replacement leaves current state unchanged.

## Ratings, historical derivation, and caches

The rating engine remains raw-data-derived. It will consume segment SOT exposure rather than reconstructing SOT from saves and goals. Historical match ratings are recalculated from authoritative raw events; no raw event or saved rating is rewritten.

The exact approved position rule changes are:

- Conceded goal: GK/CB family `-0.25`, FB family `-0.20`, CDM family `-0.12`, CM family `-0.10`, LM/RM `-0.10`; individual conceded-cause remains `-0.30`.
- SOT suppression maximum: CB `1.40`, FB `1.00`, CDM `0.80`, CM `0.30`, LM/RM `0.25`.
- Team-goal contribution: CAM `+0.04`, LW/RW `+0.03`, LM/RM `+0.05`, CM `+0.07`, CDM `+0.06`, FB `+0.04`, ST/SS/CB/GK `0`.

The existing multiplier curve, GK save bonus, goal/assist coefficients, result handling, clean-sheet semantics, minutes cap, position normalization, and MOM tie rules remain unchanged unless a test establishes a required defect.

The rating engine revision is incremented. Rating-dependent WeakMap/map keys and explicit clear functions are audited so match ratings/order, MOM, Player Detail average/form/history, Global Ranking, Team Best Players/team-average-rating, Best XI, Team of the Week, Team of the Year, competition player rankings, season leaders/awards, Records, combinations, analytics, trends/history/change projections, News, and competition average-rating tie-breaks rebuild using current raw data. Competition revision reconciliation continues to invalidate changed match scopes; a state replacement supplies new raw collection identities and clears global caches.

## Verification

Tests are test-first and cover:

- Resume success and failure safety, including 1:1 events/substitutions/positions/kickoff/appearances/SOT restoration and no destructive autosave after a forced failure.
- Import validation, atomic live replacement, backup/rollback, stale persistence fencing, and no mutation after a failed import.
- Complete, incomplete, invalid, and legacy SOT; no manual-SOT goal double count; independent GK saves; HT=3/FT=7 giving 3/4; and validation of all conceded-goal half boundaries.
- HT=2/FT=8 segment exposure 0–60 = 4 and 70–90 ≈ 2.67, substitutions, position changes, 0/45/90 boundaries, and stoppage-time behavior.
- Exact coefficient values, unaffected coefficients, historical rating propagation, revision/cache invalidation, and SOT/rating competition tie-break consumers.

Final verification runs the full test suite, lint, production build, and `git diff --check`.
