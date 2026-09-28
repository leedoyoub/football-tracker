# Log Match SOT Popup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move manual Opponent SOT entry to a single Log Match popup while preserving the established canonical HT/FT SOT domain.

**Architecture:** Keep `halftimeOpponentSot` and `fulltimeOpponentSot` as the only persisted analytics inputs. Store a workflow-only `fulltimeOpponentSotAutoLinked` flag on the unfinished draft checkpoint, use a pure UI workflow helper for linking behavior, and validate every complete candidate through `validateManualOpponentSot`.

**Tech Stack:** React, TypeScript, Node test runner.

**Spec:** User handoff supplied 2026-09-29.

## Global Constraints

- Keep version `2.4.2` and `RATING_ENGINE_REVISION = 11`.
- Do not alter rating or canonical SOT calculations, add a 2H field, commit, push, or deploy.
- Preserve legacy/edit fallback behavior; require HT and FT only for new/resumed draft finalization.

## Review Focus

- Explicit zero remains distinct from an unentered value.
- Equal manually-entered HT/FT values never become auto-linked by inference.
- An HT correction cannot create a canonical invalid pair after FT is manual.
- Popup close/reopen and Resume Draft preserve values and auto/manual state.
- End Match retains the editable saves control but has no editable SOT path.

### Task 1: Draft workflow state and behavior

**Files:**
- Create: `src/screens/opponentSotWorkflow.ts`
- Modify: `src/types.ts`
- Test: `tests/log-match-sot-popup.test.cjs`

**Interfaces:**
- Produces `OpponentSotDraftState`, initial-state and update helpers for the editor.
- Adds the checkpoint-only `fulltimeOpponentSotAutoLinked?: boolean` field.

- [ ] Write failing tests for auto-linking, manual override, zero/null, and legacy initialization.
- [ ] Run the focused test and observe the missing-module failure.
- [ ] Implement the minimal pure workflow helpers.
- [ ] Run the focused test and observe it pass.

### Task 2: Log Match popup and persistence integration

**Files:**
- Modify: `src/screens/NewMatchScreen.tsx`
- Test: `tests/log-match-sot-popup.test.cjs`, `tests/phase1-resume-safety.test.cjs`

**Interfaces:**
- Consumes the Task 1 workflow state.
- Produces draft checkpoints containing HT, FT, and only the workflow flag; final Match saves contain HT and FT only.

- [ ] Write failing integration/source tests for the SOT action, two-row popup, draft restoration, validation, and End Match ownership.
- [ ] Run the focused tests and observe their assertions fail.
- [ ] Add the compact popup, wire its state to the parent editor, and validate candidates with `validateManualOpponentSot`.
- [ ] Remove End Match SOT fields while retaining Saves and block incomplete new/resumed finalization with actionable copy.
- [ ] Run the focused and Phase 1 tests and observe them pass.

### Task 3: Regression verification and semantic audit

**Files:**
- Verify: all changed files and existing Phase 4 tests

- [ ] Run the focused popup tests, Phase 1 SOT/draft tests, Phase 4 award regressions, full suite, lint, build, and `git diff --check`.
- [ ] Audit the semantic diff for one editable SOT path, no persisted 2H value, exact final HT/FT persistence, and unchanged version/revision.
