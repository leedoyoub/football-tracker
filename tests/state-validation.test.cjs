const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { assertValidStateTransition, validateStateTransition } = require('../src/lib/validation.ts')
const { createStoreTransactions } = require('../src/lib/storeTransactions.ts')

const player = (id, teamId = 'A') => ({ id, name: id, teamId, teamIds: teamId ? [teamId] : [], position: 'CM', number: 1 })
const match = (id, teamId = 'A', matchDay = 1, playerId) => ({
  id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay, date: '2026-01-01', duration: 90,
  homeTeamId: teamId, awayTeamId: `O-${id}`, teamId, appearances: playerId ? [{ playerId, teamId, role: 'starter', position: 'CM', matchPosition: 'CM' }] : [], events: [],
})
const state = (players = [], matches = [], teams = [{ id: 'A', name: 'A' }]) => ({ teams, players, matches, competitionStates: [] })

test('valid store transitions retain historical dangling player IDs only in their original Match', () => {
  const old = state([], [match('M1', 'A', 1, 'departed')])
  const edited = { ...old, matches: [{ ...old.matches[0], date: '2026-02-01' }] }
  assert.deepEqual(validateStateTransition(old, edited), [])
  const introduced = { ...old, matches: [...old.matches, match('M2', 'A', 1, 'departed')] }
  assert(validateStateTransition(old, introduced).some(issue => issue.code === 'match.invalid_reference'))
})

test('player, team, and match stable IDs remain unique across changed collections', () => {
  const duplicatePlayer = state([player('P', 'A'), player('P', 'A')])
  assert(validateStateTransition(state(), duplicatePlayer).some(issue => issue.code === 'player.duplicate_id'))
  const duplicateTeam = state([], [], [{ id: 'A', name: 'A' }, { id: 'A', name: 'Duplicate' }])
  assert(validateStateTransition(state(), duplicateTeam).some(issue => issue.code === 'team.duplicate_id'))
  const duplicateMatch = state([], [match('M'), match('M', 'A', 2)])
  assert(validateStateTransition(state(), duplicateMatch).some(issue => issue.code === 'match.duplicate_id'))
})

test('new player and match references are rejected before the state transition is accepted', () => {
  const unknownTeam = state([player('P', 'UNKNOWN')])
  assert(validateStateTransition(state(), unknownTeam).some(issue => issue.code === 'player.unknown_team'))
  const unknownPlayerMatch = state([], [match('M', 'A', 1, 'UNKNOWN')])
  assert(validateStateTransition(state(), unknownPlayerMatch).some(issue => issue.code === 'match.invalid_reference'))
})

test('changed League slots are checked against the full next state with same-ID edit allowance', () => {
  const first = match('M1')
  const prior = state([], [first])
  const collision = { ...prior, matches: [...prior.matches, match('M2')] }
  assert(validateStateTransition(prior, collision).some(issue => issue.code === 'match.duplicate_league_slot'))
  const edit = { ...prior, matches: [{ ...first, date: '2026-01-02' }] }
  assert.deepEqual(validateStateTransition(prior, edit), [])
  const withSecondTeam = { ...prior, teams: [...prior.teams, { id: 'B', name: 'B' }], matches: [...prior.matches, match('M2', 'B')] }
  assert.deepEqual(validateStateTransition(prior, withSecondTeam), [])
})

test('failed validation leaves the Store transaction snapshot, publish list, and durable writes untouched', () => {
  const initial = { data: state([player('P')]), revision: 0 }
  const published = []; const saved = []
  const transactions = createStoreTransactions(initial, async value => { saved.push(value); return true }, value => published.push(value))
  assert.throws(() => transactions.commit(current => {
    const next = { ...current, data: { ...current.data, players: [...current.data.players, player('P')] } }
    assertValidStateTransition(current.data, next.data)
    return next
  }), error => error.code === 'player.duplicate_id')
  assert.equal(transactions.read().snapshot, initial)
  assert.deepEqual(published, [])
  assert.deepEqual(saved, [])
})

test('the Store guards both ordinary and durable Match commits before coordinator publication', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(source.includes('assertValidStateTransition(previous, next)'))
  assert(source.includes('assertValidStateTransition(prior, currentData)'))
  assert(source.includes('return Promise.reject(error)'))
})

test('a Draft-only update does not apply finalized Match validation to a partial checkpoint', () => {
  const prior = state([player('P')])
  const next = { ...prior, draftMatch: { ...match('D', 'A', 1, 'P'), competitionType: undefined, competitionStage: undefined, kickoffLineup: [] } }
  assert.deepEqual(validateStateTransition(prior, next), [])
})
