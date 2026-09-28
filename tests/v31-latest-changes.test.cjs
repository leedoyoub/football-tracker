const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { deriveLatestChanges } = require('../src/engine/latestChanges.ts')
const player = { id: 'p', name: 'Player', displayName: 'Player', fullName: 'Player', number: 9, position: 'ST', teamId: 'A' }
const teams = [{ id: 'A', name: 'Alpha', shortName: 'ALP', abbreviation: 'ALP', visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' }, { id: 'B', name: 'Beta', shortName: 'BET', abbreviation: 'BET', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' }]
const game = (id, day, goals) => ({ id, season: 'Season 1', competitionType: 'league', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: Array.from({ length: goals }, (_, index) => ({ id: `${id}:g:${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: 'p' })) })

test('Latest Changes is cached, newest-first, groups same-match canonical events, and suppresses routine contributions', () => {
  const matches = [game('early', 1, 9), game('latest', 2, 3)]
  const players = [player], states = []
  const first = deriveLatestChanges(players, teams, matches, states)
  const second = deriveLatestChanges(players, teams, matches, states)
  assert.strictEqual(first, second)
  assert.equal(first[0].matchId, 'latest')
  assert(first.some(group => group.items.some(item => item.id === 'milestone:p:goals:career:10')))
  assert(first.some(group => group.items.some(item => item.id.startsWith('rare:latest:'))))
  assert.equal(first.some(group => group.items.some(item => item.id.startsWith('match-performance:'))), false)
})

test('Latest Changes rebuilds for replacement, deletion, and chronology changes without persistent feed state', () => {
  const early = game('early', 1, 9)
  const late = game('late', 2, 3)
  const initial = deriveLatestChanges([player], teams, [early, late], [])
  const edited = deriveLatestChanges([player], teams, [early, { ...late, events: [] }], [])
  const reordered = deriveLatestChanges([player], teams, [{ ...early, date: '2026-01-03' }, late], [])
  assert(initial.some(group => group.matchId === 'late'))
  assert.equal(edited.some(group => group.items.some(item => item.id.startsWith('rare:late:'))), false)
  assert.equal(reordered[0].matchId, 'early')
  assert.equal(fs.readFileSync(require.resolve('../src/engine/latestChanges.ts'), 'utf8').includes('localStorage'), false)
})

test('Home renders exactly the first four Latest Changes groups and View All has its dedicated route', () => {
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const types = fs.readFileSync(require.resolve('../src/types.ts'), 'utf8')
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  assert.match(home, /deriveLatestChanges/)
  assert.match(home, /latestChanges\.slice\(0, 4\)/)
  assert.match(home, /title="Latest Changes"/)
  assert.match(home, /name: 'latest-changes'/)
  assert.match(types, /name: 'latest-changes'/)
  assert.match(app, /LatestChangesScreen/)
})
