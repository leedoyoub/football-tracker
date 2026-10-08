const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { playerRankTrend, rankTrendMetricOptions } = require('../src/engine/playerRankTrend.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')

const player = (id, position) => ({ id, name: id, teamId: 'A', position })
const appearance = (id, position, change) => ({ playerId: id, teamId: 'A', role: 'starter', position, ...(change ? { positionHistory: [change] } : {}) })
const match = (id, day, appearances, events = [], extra = {}) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-0${day}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events, ...extra })

test('Rank Trend metric options follow canonical detailed position families', () => {
  assert.deepEqual(rankTrendMetricOptions('ST').map(row => row.label), ['Rating', 'Goals', 'Assists', 'G+A'])
  assert.deepEqual(rankTrendMetricOptions('CDM').map(row => row.label), ['Rating', 'Goals', 'Assists', 'G+A'])
  assert.deepEqual(rankTrendMetricOptions('LCB').map(row => row.label), ['Rating', 'G+A', 'SOT Allowed/90', 'Defender GA/90'])
  assert.deepEqual(rankTrendMetricOptions('GK').map(row => row.label), ['Rating', 'Clean Sheets', 'Saves', 'GK GA/90'])
})

test('Goals trend uses appearance points and prefix totals, without future leakage', () => {
  const players = [player('target', 'ST'), player('rival', 'ST')]
  const games = [
    match('m1', 1, [appearance('target', 'ST'), appearance('rival', 'ST')], [{ id: 'g1', type: 'goal', teamId: 'A', playerId: 'target', minute: 20 }]),
    match('m2', 2, [appearance('rival', 'ST')], [{ id: 'g2', type: 'goal', teamId: 'A', playerId: 'rival', minute: 20 }, { id: 'g3', type: 'goal', teamId: 'A', playerId: 'rival', minute: 30 }]),
    match('m3', 3, [appearance('target', 'ST'), appearance('rival', 'ST')]),
  ]
  const trend = playerRankTrend('target', players, games, 'S1', 'league', 'goals')
  assert.deepEqual(trend.map(row => row.match.id), ['m1', 'm3'])
  assert.deepEqual(trend.map(row => row.overall), [1, 2])
  assert.deepEqual(trend.map(row => row.team), [1, 2])
})

test('transfer trend ranks within the actual team at each appearance', () => {
  const players = [player('target', 'ST'), player('old-rival', 'ST'), player('new-rival', 'ST')]
  players[0].teamId = 'B'
  players[2].teamId = 'B'
  const first = match('m1', 1, [appearance('target', 'ST'), appearance('old-rival', 'ST'), { ...appearance('new-rival', 'ST'), teamId: 'B' }], [
    { id: 'g1', type: 'goal', teamId: 'A', playerId: 'target', minute: 20 },
    { id: 'g2', type: 'goal', teamId: 'B', playerId: 'new-rival', minute: 30 },
    { id: 'g3', type: 'goal', teamId: 'B', playerId: 'new-rival', minute: 40 },
  ])
  const second = match('m2', 2, [{ ...appearance('target', 'ST'), teamId: 'B' }, { ...appearance('new-rival', 'ST'), teamId: 'B' }], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'A' })
  const trend = playerRankTrend('target', players, [first, second], 'S1', 'league', 'goals')
  assert.deepEqual(trend.map(row => row.teamId), ['A', 'B'])
  assert.deepEqual(trend.map(row => row.overall), [2, 2])
  assert.deepEqual(trend.map(row => row.team), [1, 2])
})

test('defensive Rank Trend eligibility is recalculated at each historical prefix', () => {
  const players = [player('target', 'CB')]
  const games = [
    match('m1', 1, [appearance('target', 'CB', { minute: 20, position: 'CM' })]),
    match('m2', 2, []),
    match('m3', 3, [appearance('target', 'CB', { minute: 65, position: 'CM' })]),
  ]
  assert.deepEqual(playerRankTrend('target', players, games, 'S1', 'league', 'sotAllowed').map(row => row.overall), [null, 1])
  assert.deepEqual(playerRankTrend('target', players, games, 'S1', 'league', 'defenderGaPer90').map(row => row.overall), [null, 1])
})

test('GK GA/90 trend applies prefix opportunities and keeps actual GK appearances', () => {
  const players = [player('target', 'GK')]
  const games = [match('m1', 1, [appearance('target', 'GK', { minute: 20, position: 'CM' })]), match('m2', 2, []), match('m3', 3, [appearance('target', 'GK', { minute: 65, position: 'CM' })])]
  assert.deepEqual(playerRankTrend('target', players, games, 'S1', 'league', 'goalkeeperGaPer90').map(row => row.overall), [null, 1])
})

test('transfer defensive trend uses prefix stint opportunities and matches final Ranking eligibility', () => {
  const target = player('target', 'CB')
  target.teamId = 'B'
  const before = [1, 2, 3, 4].map(day => match(`b-before-${day}`, day, [], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'A' }))
  const atA = match('a-play', 5, [appearance('target', 'CB')])
  const atB = match('b-play', 6, [{ ...appearance('target', 'CB', { minute: 30, position: 'CM' }), teamId: 'B' }], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'A' })
  const after = match('a-after', 7, [])
  const games = [...before, atA, atB, after]
  const points = playerRankTrend('target', [target], games, 'S1', 'league', 'defenderGaPer90')
  assert.deepEqual(points.map(point => point.overall), [1, 1])
  assert.deepEqual(points.map(point => point.teamId), ['A', 'B'])
  const final = rankGlobalRankingRows(buildGlobalRankingData([target], games, { seasons: ['S1'], teams: [], positions: [] }, 'rating'), [target], 'defenderGaPer90')
  assert.equal(final[0].availableTeamMinutes, 180)
  assert.equal(final[0].playerId, 'target')
})

test('GK count trends rank only actual goalkeepers, including zero-save appearances', () => {
  const players = [player('target', 'GK'), player('field', 'ST')]
  const games = [match('m1', 1, [appearance('target', 'GK'), appearance('field', 'ST')])]
  assert.deepEqual(playerRankTrend('target', players, games, 'S1', 'league', 'saves').map(row => row.overall), [1])
  assert.deepEqual(playerRankTrend('target', players, games, 'S1', 'league', 'cleanSheets').map(row => row.overall), [1])
})

test('Rank Trend saved metric defaults and invalid legacy values fall back to Rating', () => {
  assert.equal(defaultScreenState({ name: 'player', id: 'target' }).rankTrendMetric, 'rating')
  const state = { teams: [{ id: 'A', name: 'A' }], players: [player('target', 'CB')], matches: [match('m1', 1, [appearance('target', 'CB')])] }
  const read = metric => loadLastNavigationEntry(state, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view: { name: 'player', id: 'target' }, screenState: { name: 'player', season: 'S1', competition: 'league', rankTrendMetric: metric } }) : null })
  assert.equal(read('defenderGaPer90').screenState.rankTrendMetric, 'defenderGaPer90')
  assert.equal(read('goals').screenState.rankTrendMetric, 'rating')
  assert.equal(read('unknown').screenState.rankTrendMetric, 'rating')
})
