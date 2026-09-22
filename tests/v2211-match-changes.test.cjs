const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { matchChangesForMatch, rankingTransitionLabel } = require('../src/engine/matchChanges.ts')

const teams = [
  { id: 'A', name: 'Alpha', shortName: 'A', abbreviation: 'A', visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' },
  { id: 'B', name: 'Beta', shortName: 'B', abbreviation: 'B', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' },
]
const players = [...Array.from({ length: 10 }, (_, index) => ({ id: `p${index}`, name: `P${index}`, displayName: `P${index}`, teamId: 'A', position: 'ST', number: index + 1 })), { id: 'z', name: 'Zed', displayName: 'Zed', teamId: 'A', position: 'ST', number: 11 }]
const appearances = players.map(player => ({ playerId: player.id, teamId: 'A', position: 'ST', role: 'starter' }))
const game = (id, day, events = []) => ({ id, season: 'Season 1', competitionType: 'league', matchDay: day, date: `2026-01-0${day}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, events })

test('only a participating player receives canonical Top 10 entry and #1 ranking transitions', () => {
  const matches = [game('m1', 1), game('m2', 2, [{ id: 'z-goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'z' }])]
  const changes = matchChangesForMatch(players, teams, matches, [], 'm2')
  const zed = changes.find(change => change.playerId === 'z')
  assert(zed)
  assert(zed.eventIds.includes('ranking:core:global:goals:z'))
  assert.match(zed.detail, /takes #1 in Goals/)
  assert.equal(changes.some(change => change.playerId === 'p9' && change.eventIds.some(id => id.startsWith('ranking:'))), false)
})

test('an initial leaderboard observation is not a #1 takeover transition', () => {
  const matches = [game('first', 1, [{ id: 'z-goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'z' }])]
  const changes = matchChangesForMatch(players, teams, matches, [], 'first')
  const zed = changes.find(change => change.playerId === 'z')
  assert(zed)
  assert.equal(zed.eventIds.some(id => id.startsWith('ranking:')), false)
})

test('same-date chronology rebuilds transitions after historical collection replacement', () => {
  const early = game('early', 1)
  const late = { ...game('late', 1, [{ id: 'z-goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'z' }]), recordedAt: 2 }
  const first = matchChangesForMatch(players, teams, [early, late], [], 'late')
  const edited = { ...late, events: [] }
  const rebuilt = matchChangesForMatch(players, teams, [early, edited], [], 'late')
  assert(first.some(change => change.eventIds.includes('ranking:core:global:goals:z')))
  assert.equal(rebuilt.some(change => change.eventIds.includes('ranking:core:global:goals:z')), false)
})

test('What Changed keeps Team Top 3 separate from Global and Competition Top 10 cutoffs', () => {
  const before = new Map([['leader', 1], ['player', 4]])
  const after = new Map([['leader', 1], ['player', 3]])
  assert.equal(rankingTransitionLabel(before, after, 'player', 'Goals', 3, 'Team'), 'enters the Top 3 in Goals at #3 · Team')
  assert.equal(rankingTransitionLabel(before, after, 'player', 'Goals', 2, 'Team'), undefined)
  assert.equal(rankingTransitionLabel(new Map([['leader', 1]]), new Map([['leader', 2], ['player', 10]]), 'player', 'Goals', 10, 'Cup'), 'enters the Top 10 in Goals at #10 · Cup')
})
