# v2.2.9 Draft Lifecycle and Champions Identity Plan

## Goal

Prevent a finalised match from surviving as a resumable draft, and make Champions
series assignment use the same canonical identity that Team Detail displays.

## Invariants

1. A resumable draft has an ID absent from `matches`.
2. Final save writes the final match and clears only its matching draft atomically.
3. A delayed draft checkpoint can never restore a finalised draft.
4. Normal new-match restoration is context-specific; edit restoration is explicit.
5. Champions assignment never advances from ignored/malformed same-team stage data.
6. Existing Champions row-comparison semantics and slot counts are unchanged.

## Execution

1. Add pure draft lifecycle helpers and regression tests for stale cleanup and
   route/context eligibility.
2. Use those helpers at repository, store hydration/reconciliation, sync, and
   route boundaries. Make final save atomically clear its matching draft and
   fence delayed draft checkpoints.
3. Add New Match conflict UI and stop its autosave after a successful final save.
4. Add a canonical Champions pairing reconciliation/reporting path. Repair only
   uniquely derivable legacy identities; surface ambiguity as a blocking data
   integrity result.
5. Use shared competition-context parts in the Log Match header.
6. Add behaviour-level regressions, bump release metadata only after green
   implementation checks, and run test, lint, build, and diff review.
