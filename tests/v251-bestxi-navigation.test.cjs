const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const navigation = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const { matchesForAwardPeriod } = require('../src/engine/awardScopes.ts')

const game = (id, type, stage, day) => ({ id, season: 'S1', date: '2026-01-01', competitionType: type, competitionStage: stage, matchDay: day, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [] })

test('League awards default to League and restore valid scopes while ignoring legacy modes', () => {
  const view = { name: 'competition', season: 'S1', competitionType: 'league' }
  const base = navigation.defaultScreenState(view)
  assert.equal(base.leagueAwardScope, 'league')
  const app = { teams: [{ id: 'A', name: 'A' }], players: [], matches: [game('m', 'league', 'regular', 1)] }
  const restored = mode => loadLastNavigationEntry(app, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view, screenState: { ...base, bestXiMode: mode, monthlyAwardBlock: 2 } }) : null }).screenState
  for (const saved of ['monthly', 'season', 'period', 'competition']) {
    assert.equal(restored(saved).leagueAwardScope, 'league'); assert.equal(restored(saved).bestXiMode, undefined)
  }
  const entry = navigation.createNavigationEntry(view, { ...base, leagueAwardScope: 'second-half' })
  const opened = navigation.navigateBrowseEntry([entry], { name: 'player', id: 'p' }, 352)
  assert.deepEqual(navigation.popNavigationEntry(opened), [{ ...entry, scrollTop: 352 }])
})

test('period award scopes include each Champions independent round and exclude adjacent stages', () => {
  const games = [
    ...[1, 2, 3].map(n => game('r16-' + n, 'champions', 'roundOf16', n)),
    ...[1, 2, 3].map(n => game('qf-' + n, 'champions', 'quarterFinal', n + 3)),
    ...[1, 2, 3].map(n => game('sf-' + n, 'champions', 'semiFinal', n + 6)),
    ...[1, 2].map(n => game('final-' + n, 'champions', 'final', n + 9)),
    game('cup-stage', 'cup', 'stage2', 2), game('cup-final', 'cup', 'final', 8), game('cup-replay', 'cup', 'finalReplay', 9),
  ]
  for (const [stage, expected] of [['roundOf16', 3], ['quarterFinal', 3], ['semiFinal', 3], ['final', 2]]) {
    assert.equal(matchesForAwardPeriod(games, 'S1', 'champions', stage).length, expected)
  }
  assert.deepEqual(matchesForAwardPeriod(games, 'S1', 'cup', 'stage2').map(row => row.id), ['cup-stage'])
  assert.deepEqual(matchesForAwardPeriod(games, 'S1', 'cup', 'final').map(row => row.id), ['cup-final', 'cup-replay'])
})
