const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { buildGlobalRankingData, getLeaderboard } = require('../src/engine/stats.ts')

const player = (id, position, teamId = 'A') => ({ id, name: id, position, number: 1, teamId })
const players = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'ST'].map(position => player(position.toLowerCase(), position))
const match = (id, season, teamId, roster, events = []) => ({ id, season, matchDay: Number(id.replace(/\D/g, '')) || 1, date: `2026-01-0${Number(id.replace(/\D/g, '')) || 1}`, duration: 90, homeTeamId: teamId, awayTeamId: 'OPP', teamId, appearances: roster.map(item => ({ playerId: item.id, teamId, position: item.position, matchPosition: item.position, role: 'starter' })), events })
const filters = (overrides = {}) => ({ seasons: [], teams: [], positions: [], ...overrides })

test('Goals Against /90 has been removed from ranking types and UI', () => {
  const typeSource = fs.readFileSync(require.resolve('../src/types.ts'), 'utf8')
  const screenSource = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  assert(!typeSource.includes("'ga/90'"))
  assert(!screenSource.includes('Goals Against/90'))
})

test('new defensive and goalkeeper metrics are present', () => {
  const typeSource = fs.readFileSync(require.resolve('../src/types.ts'), 'utf8')
  assert(typeSource.includes("'sotAllowed'") && typeSource.includes("'goalsConceded'") && typeSource.includes("'savePercentage'"))
})

test('one derived ranking dataset supplies identical preview and full-list values/order', () => {
  const games = [match('1', 'S1', 'A', players, [{ id: 'g', type: 'goal', minute: 10, teamId: 'A', playerId: 'st' }])]
  const full = buildGlobalRankingData(players, games, filters(), 'goals')
  assert.deepEqual(full.slice(0, 3), full.filter((_, index) => index < 3))
  assert.deepEqual(full.map(row => [row.playerId, row.value]), getLeaderboard(players, games, filters(), 'goals').map(row => [row.playerId, row.value]))
})

test('season/source changes create a fresh derived ranking result', () => {
  const s1 = match('1', 'S1', 'A', players, [{ id: 's1', type: 'goal', minute: 10, teamId: 'A', playerId: 'st' }])
  const s2 = match('2', 'S2', 'A', players, [{ id: 's2', type: 'goal', minute: 10, teamId: 'A', playerId: 'st' }, { id: 's3', type: 'goal', minute: 20, teamId: 'A', playerId: 'st' }])
  assert.equal(buildGlobalRankingData(players, [s1, s2], filters({ seasons: ['S1'] }), 'goals').find(row => row.playerId === 'st').value, 1)
  assert.equal(buildGlobalRankingData(players, [s1, s2], filters({ seasons: ['S2'] }), 'goals').find(row => row.playerId === 'st').value, 2)
  assert.equal(buildGlobalRankingData(players, [{ ...s1, events: [...s1.events, { id: 'new', type: 'goal', minute: 30, teamId: 'A', playerId: 'st' }] }], filters(), 'goals').find(row => row.playerId === 'st').value, 2)
})

test('Competitions consumes one memoized ranking dataset for preview and View All', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  assert(source.includes("buildGlobalRankingData(players, matches, effective, 'rating')"))
  assert(source.includes('rankGlobalRankingRows(rankingIndex, players, metric)'))
  assert(source.includes('rows.slice(0, all ? 50 : 3)'))
  assert(source.includes("all ? 'Show Top 3' : 'View All'"))
  assert(!source.includes('matchesForPlayer(player, matches, appliedFilters)'))
})
