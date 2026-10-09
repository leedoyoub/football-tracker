const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { validateStateTransition } = require('../src/lib/validation.ts')

const players = Array.from({ length: 10 }, (_, index) => ({ id: `P${index}`, name: `Player ${index}`, teamId: 'A', teamIds: ['A'], position: 'CM', number: index + 1 }))
const state = (draftMatch, matches = [], roster = players) => ({ teams: [{ id: 'A', name: 'A' }], players: roster, matches, competitionStates: [], draftMatch })
const draft = appearances => ({ id: 'DRAFT', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'OPP', appearances, events: [], kickoffLineup: [] })

test('Draft transition allows a partial XI and does not use finalized exact-XI validation', () => {
  const appearances = players.map(player => ({ playerId: player.id, teamId: 'A', position: 'CM', matchPosition: 'CM', role: 'starter' }))
  const previous = state(undefined)
  const next = state(draft(appearances))
  assert.deepEqual(validateStateTransition(previous, next), [])
})

test('new Draft player references must resolve to the current roster', () => {
  const previous = state(undefined)
  const next = state(draft([{ playerId: 'MISSING', teamId: 'A', position: 'CM', matchPosition: 'CM', role: 'starter' }]))
  assert(validateStateTransition(previous, next).some(issue => issue.code === 'draft.invalid_reference' && issue.relatedIds.includes('MISSING')))
})

test('an existing Draft retains its exact missing historical reference through later edits', () => {
  const oldDraft = draft([{ playerId: 'DEPARTED', teamId: 'A', position: 'CM', matchPosition: 'CM', role: 'starter' }])
  const previous = state(oldDraft, [], [])
  const next = state({ ...oldDraft, date: '2026-01-02' }, [], [])
  assert.deepEqual(validateStateTransition(previous, next), [])
})

test('Draft IDs cannot overlap finalized Match IDs', () => {
  const finalized = { id: 'DRAFT', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'OPP', appearances: [], events: [] }
  const next = state(draft([]), [finalized])
  assert(validateStateTransition(state(undefined), next).some(issue => issue.code === 'draft.finalized_id'))
})

test('the Draft transaction validates before publishing or persisting its checkpoint', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(source.includes('assertValidStateTransition(current.data, nextData)'))
  assert(source.includes('committed = transactions.commit(current =>'))
})
