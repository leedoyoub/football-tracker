const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { awardRacePresentationRows, awardTeamPerformanceLabel } = require('../src/engine/awardRacePresentation.ts')
const { defaultScreenState, navigateBrowseEntry, popNavigationEntry, createNavigationEntry } = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')

test('Award Race presentation preserves official ranks after position and team filters', () => {
  const players = [{ id: 'a', name: 'A', position: 'ST', teamId: 'X' }, { id: 'b', name: 'B', position: 'ST', teamId: 'X' }, { id: 'c', name: 'C', position: 'CM', teamId: 'X' }]
  const candidates = [
    { playerId: 'a', teamId: 'X', selectionScore: 9, average: 7 },
    { playerId: 'b', teamId: 'Y', selectionScore: 8, average: 8 },
    { playerId: 'c', teamId: 'X', selectionScore: 7, average: 8 },
    { playerId: 'b', teamId: 'X', selectionScore: 6, average: 9 },
  ]
  const games = [{ id: 'm', season: 'S1', competitionType: 'league', date: '2026-01-01', duration: 90, teamId: 'Y', homeTeamId: 'Y', awayTeamId: 'O', appearances: [{ playerId: 'b', teamId: 'Y', role: 'starter', position: 'LCAM' }], events: [] }]
  const rows = awardRacePresentationRows(candidates, players, games, 'S1', 'league', 'cam', 'Y')
  assert.deepEqual(rows.map(row => [row.candidate.playerId, row.rank, row.position]), [['b', 2, 'CAM']])
  assert.equal(rows[0].candidate.average, 8)
})

test('team progress abbreviation follows canonical competition status without bonus numbers', () => {
  const status = {
    league: { standings: [{ teamId: 'X', rank: 1 }], matches: [{ id: 'l', teamId: 'X' }] },
    cup: { championId: 'X', runnerUpId: 'Y', eliminatedAtByTeam: {}, activeTeamIds: [] },
    champions: { championId: undefined, runnerUpId: undefined, currentStage: 'semiFinal', rounds: { roundOf16: [{ teamIds: ['X', 'Y'], winnerId: 'X' }], quarterFinal: [{ teamIds: ['X', 'Z'], winnerId: 'X' }], semiFinal: [{ teamIds: ['X', 'Q'] }], final: [] } },
  }
  assert.equal(awardTeamPerformanceLabel(status, 'X', 'all'), 'L1 · C SF · Cup W')
  assert.equal(awardTeamPerformanceLabel(status, 'X', 'champions'), 'SF')
  assert.equal(awardTeamPerformanceLabel(status, 'Y', 'cup'), 'RU')
  assert.doesNotMatch(awardTeamPerformanceLabel(status, 'X', 'all'), /\+0\./)
})

test('Award Race route uses the existing navigation stack and defaults to its source scope', () => {
  const home = createNavigationEntry({ name: 'home' })
  const award = { name: 'award-race', season: 'S1', competitionType: 'all' }
  const next = navigateBrowseEntry([home], award, 440)
  assert.equal(next[0].scrollTop, 440)
  assert.deepEqual(defaultScreenState(award), { name: 'award-race', season: 'S1', scope: 'all', positionFilter: 'all', teamId: null })
  assert.deepEqual(popNavigationEntry(next)[0].view, { name: 'home' })
})

test('Award Race last route restores valid filters and drops stale saved values', () => {
  const state = { teams: [{ id: 'X', name: 'X' }], players: [], matches: [{ id: 'm', season: 'S1', appearances: [], events: [] }] }
  const read = (screenState) => loadLastNavigationEntry(state, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view: { name: 'award-race', season: 'S1', competitionType: 'cup' }, screenState }) : null })
  assert.deepEqual(read({ name: 'award-race', season: 'S1', scope: 'champions', positionFilter: 'cb', teamId: 'X' }).screenState, { name: 'award-race', season: 'S1', scope: 'champions', positionFilter: 'cb', teamId: 'X' })
  assert.deepEqual(read({ name: 'award-race', season: 'missing', scope: 'bogus', positionFilter: 'bogus', teamId: 'missing' }).screenState, { name: 'award-race', season: 'S1', scope: 'cup', positionFilter: 'all', teamId: null })
})
