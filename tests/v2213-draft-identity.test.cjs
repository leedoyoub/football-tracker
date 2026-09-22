const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const Module = require('node:module')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { editorLifecycleMode, activeEditorIdentity } = require('../src/lib/draftLifecycle.ts')
const { matchesCompetitionAssignmentExactly } = require('../src/engine/competitionContext.ts')

const identity = (competitionType, stage, matchDay, extra = {}) => ({ competitionType, season: 'Season 1', teamId: 'T1', stage, matchDay, ...extra })
const draft = (assignment) => ({ id: 'draft', season: 'Season 1', teamId: 'T1', homeTeamId: 'T1', awayTeamId: 'opponent:stale', competitionType: 'league', competitionStage: 'regular', matchDay: 4, competitionAssignment: assignment, date: '2026-09-20', duration: 90, appearances: [], events: [] })

let screenOwner
const React = require('react')
const screenHooks = {
  ...React,
  useState(initial) {
    const index = screenOwner.cursor++
    if (!(index in screenOwner.state)) screenOwner.state[index] = typeof initial === 'function' ? initial() : initial
    return [screenOwner.state[index], value => { screenOwner.state[index] = typeof value === 'function' ? value(screenOwner.state[index]) : value }]
  },
}
const moduleLoad = Module._load
Module._load = function(name, parent, main) {
  if (name === 'react') return screenHooks
  if (name === '../store') return { useStore: () => screenOwner.store }
  return moduleLoad.call(this, name, parent, main)
}
const { NewMatchScreen } = require('../src/screens/NewMatchScreen.tsx')
Module._load = moduleLoad

function renderNewMatch(owner) {
  screenOwner = owner; owner.cursor = 0
  return NewMatchScreen({ teamId: 'T1', requestedSeason: 'Season 1', competitionType: 'league', onReplace() {}, onBack() {} })
}

test('v2.2.13 keeps an autosaved fresh draft as a checkpoint instead of source authority after rerender', () => {
  const staleLeagueDraft = draft(identity('league', 'regular', 4))
  const cup = identity('cup', 'stage1', 1, { opponentTeamId: 'T2' })
  assert.equal(editorLifecycleMode({ draft: staleLeagueDraft, resumeRequested: false }), 'fresh')
  assert.deepEqual(activeEditorIdentity('fresh', staleLeagueDraft, cup), cup)
})

test('v2.2.13 resumes an explicitly accepted draft but freezes finalized edit identity including eventless matches', () => {
  const cupDraft = draft(identity('cup', 'stage2', 2, { opponentTeamId: 'T3' }))
  const completed = { ...cupDraft, id: 'saved', competitionAssignment: identity('champions', 'final', 11, { pairingId: 'final:0', seriesGame: 2, opponentTeamId: 'T4' }), events: [] }
  assert.equal(editorLifecycleMode({ draft: cupDraft, resumeRequested: true }), 'resume')
  assert.deepEqual(activeEditorIdentity('resume', cupDraft, identity('league', 'regular', 9)), cupDraft.competitionAssignment)
  assert.equal(editorLifecycleMode({ editingMatch: completed }), 'edit')
  assert.deepEqual(activeEditorIdentity('edit', completed, identity('league', 'regular', 9)), completed.competitionAssignment)
})

test('v2.2.13 retains the mounted fresh editor after its autosave checkpoint causes a parent rerender', () => {
  const owner = { cursor: 0, state: [], store: { teams: [{ id: 'T1', name: 'T1', shortName: 'T1' }], players: [], matches: [], draftMatch: undefined, clearDraftMatch() {} } }
  const initial = renderNewMatch(owner)
  assert.equal(initial.props.mode, 'fresh')

  // Fresh Log Match mount -> lineup initialization -> autosave -> store update
  // -> actual parent component rerender. The child remains the editor rather
  // than being replaced by the unfinished-draft prompt.
  owner.store.draftMatch = { ...draft(identity('league', 'regular', 1)), id: initial.props.freshCheckpointId }
  const afterAutosave = renderNewMatch(owner)
  assert.equal(afterAutosave.type, initial.type)
  assert.equal(afterAutosave.props.mode, 'fresh')
  assert.equal(afterAutosave.props.sourceMatch, undefined)
})

test('v2.2.13 final save integrity rejects split-brain metadata even when a snapshot itself is valid', () => {
  const cup = identity('cup', 'stage1', 1, { opponentTeamId: 'T2' })
  const validCup = {
    ...draft(cup), competitionType: 'cup', competitionStage: 'stage1', matchDay: 1,
    awayTeamId: 'T2', competitionAssignment: cup,
  }
  assert.equal(matchesCompetitionAssignmentExactly(validCup, cup), true)
  assert.equal(matchesCompetitionAssignmentExactly({ ...validCup, competitionType: 'league' }, cup), false)
  assert.equal(matchesCompetitionAssignmentExactly({ ...validCup, competitionStage: 'stage2' }, cup), false)

  const champions = identity('champions', 'roundOf16', 1, { pairingId: 'roundOf16:0', seriesGame: 1, opponentTeamId: 'T3' })
  const validChampions = {
    ...draft(champions), competitionType: 'champions', competitionStage: 'roundOf16', matchDay: 1,
    competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1, awayTeamId: 'T3', competitionAssignment: champions,
  }
  assert.equal(matchesCompetitionAssignmentExactly({ ...validChampions, competitionPairingId: 'roundOf16:1' }, champions), false)
  assert.equal(matchesCompetitionAssignmentExactly({ ...validChampions, competitionSeriesGame: 2 }, champions), false)
  assert.equal(matchesCompetitionAssignmentExactly({ ...validChampions, awayTeamId: 'T4' }, champions), false)
})
