const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { defensiveMatchFacts, defensiveRankingValue, teamOpportunityMinutes } = require('../src/engine/defensiveRanking.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { formatRankingMetricValue } = require('../src/lib/rankingMetrics.ts')

const player = (id, position, teamId = 'A') => ({ id, name: id, teamId, position, number: 1 })
const appearance = (p, change) => ({ playerId: p.id, teamId: p.teamId, role: 'starter', position: p.position, matchPosition: p.position, ...(change ? { positionHistory: [change] } : {}) })
const match = (id, day, appearances, events = [], extra = {}) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events, ...extra })
const filters = { seasons: ['S1'], teams: [], positions: [] }

test('shared ranking surfaces show defensive rates to two decimal places', () => {
  assert.equal(formatRankingMetricValue('sotAllowed', 2.734), '2.73')
  assert.equal(formatRankingMetricValue('defenderGaPer90', 0.844), '0.84')
  assert.equal(formatRankingMetricValue('goalkeeperGaPer90', 0.844), '0.84')
})

test('SOT Allowed/90 uses qualifying defender minutes, canonical manual exposure and position aliases', () => {
  const cb = player('cb', 'LCB'), wing = player('wing', 'LWB'), cdm = player('cdm', 'CDM'), keeper = player('gk', 'GK')
  const first = match('m1', 1, [appearance(cb, { minute: 30, position: 'CM' }), appearance(wing), appearance(cdm), appearance(keeper)], [], { halftimeOpponentSot: 2, fulltimeOpponentSot: 4 })
  const second = match('m2', 2, [appearance(cb, { minute: 60, position: 'CM' }), appearance(wing), appearance(cdm), appearance(keeper)], [], { halftimeOpponentSot: 2, fulltimeOpponentSot: 4 })
  const rows = rankGlobalRankingRows(buildGlobalRankingData([cb, wing, cdm, keeper], [first, second], filters, 'rating'), [cb, wing, cdm, keeper], 'sotAllowed')
  assert.deepEqual(rows.map(row => row.playerId).sort(), ['cb', 'wing'])
  assert.equal(rows.find(row => row.playerId === 'cb').sotAllowedAppearances, 1)
  assert(Math.abs(rows.find(row => row.playerId === 'cb').sotAllowedTotal - 8 / 3) < 1e-9)
  assert(Math.abs(rows.find(row => row.playerId === 'cb').value - 4) < 1e-9)
  assert.equal(defensiveMatchFacts(first, first.appearances[0]).qualifyingDefenderMinutes, 0)
  assert.equal(defensiveMatchFacts(second, second.appearances[0]).qualifyingDefenderMinutes, 60)
})

test('defender and GK GA/90 use actual role at goal time and all credited minutes', () => {
  const cb = player('cb', 'CB'), gk = player('gk', 'GK')
  const first = match('m1', 1, [appearance(cb, { minute: 30, position: 'CM' }), appearance(gk)], [{ id: 'g1', type: 'goal', teamId: 'B', minute: 20 }, { id: 'g2', type: 'goal', teamId: 'B', minute: 40 }])
  const second = match('m2', 2, [appearance(cb, { minute: 45, position: 'CM' }), appearance(gk)], [{ id: 'g3', type: 'goal', teamId: 'B', minute: 30 }])
  const facts = defensiveMatchFacts(first, first.appearances[0])
  assert.equal(facts.defenderMinutes, 30)
  assert.equal(facts.defenderConceded, 1)
  const rows = buildGlobalRankingData([cb, gk], [first, second], filters, 'rating')
  assert.equal(rankGlobalRankingRows(rows, [cb, gk], 'defenderGaPer90')[0].value, 2 / 75 * 90)
  assert.equal(rankGlobalRankingRows(rows, [cb, gk], 'goalkeeperGaPer90')[0].value, 3 / 180 * 90)
})

test('30 percent threshold includes equality and historical team opportunities without current roster fallback', () => {
  const cb = player('cb', 'CB', 'B')
  const a1 = match('a1', 1, [appearance({ ...cb, teamId: 'A' })])
  const a2 = match('a2', 2, [], [])
  const a3 = match('a3', 3, [], [])
  const rows = buildGlobalRankingData([cb], [a1, a2, a3], filters, 'rating')
  assert.equal(rows[0].availableTeamMinutes, 270)
  assert.equal(rankGlobalRankingRows(rows, [cb], 'defenderGaPer90').length, 1)
  assert.equal(teamOpportunityMinutes([a1, a2, a3], new Set(['A'])), 270)
  assert.equal(defensiveRankingValue('defenderGaPer90', { ...rows[0], defenderMinutes: 80, availableTeamMinutes: 270 }), null)
  assert.equal(defensiveRankingValue('defenderGaPer90', { ...rows[0], defenderMinutes: 81, availableTeamMinutes: 270 }), 0)
})

test('invalid or incomplete manual SOT falls back to canonical legacy saves and lower values lead', () => {
  const low = player('low', 'RCB'), high = player('high', 'RWB'), keeper = player('keeper', 'GK')
  const first = match('low', 1, [appearance(low), appearance(keeper)], [{ id: 's1', type: 'save', minute: 20, teamId: 'A', playerId: 'keeper', count: 1 }], { halftimeOpponentSot: 4, fulltimeOpponentSot: 1 })
  const second = match('high', 2, [appearance(high), appearance(keeper)], [{ id: 's2', type: 'save', minute: 20, teamId: 'A', playerId: 'keeper', count: 3 }], { halftimeOpponentSot: 1 })
  const rows = rankGlobalRankingRows(buildGlobalRankingData([low, high, keeper], [first, second], filters, 'rating'), [low, high, keeper], 'sotAllowed')
  assert.deepEqual(rows.map(row => [row.playerId, row.value]), [['low', 1], ['high', 3]])
})

test('equal-minute position sequence and stoppage goals count only while actually defending', () => {
  const cb = player('cb', 'CB')
  const beforeAndAfter = match('sequence', 1, [appearance(cb, { minute: 60, position: 'CM', sequence: 2 })], [
    { id: 'before', type: 'goal', minute: 60, sequence: 1, teamId: 'B' },
    { id: 'after', type: 'goal', minute: 60, sequence: 3, teamId: 'B' },
  ])
  assert.deepEqual([defensiveMatchFacts(beforeAndAfter, beforeAndAfter.appearances[0]).defenderMinutes, defensiveMatchFacts(beforeAndAfter, beforeAndAfter.appearances[0]).defenderConceded], [60, 1])
  const stoppage = match('stoppage', 2, [appearance(cb)], [{ id: 'late', type: 'goal', minute: 95, teamId: 'B' }])
  assert.deepEqual([defensiveMatchFacts(stoppage, stoppage.appearances[0]).defenderMinutes, defensiveMatchFacts(stoppage, stoppage.appearances[0]).defenderConceded], [90, 1])
})

test('transfer opportunity denominator follows actual appearance teams and team filter', () => {
  const cb = player('cb', 'CB', 'B')
  const a1 = match('a1', 1, [appearance({ ...cb, teamId: 'A' })])
  const a2 = match('a2', 2, [])
  const b1 = match('b1', 3, [appearance(cb)], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'O' })
  const b2 = match('b2', 4, [], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'O' })
  const full = buildGlobalRankingData([cb], [a1, a2, b1, b2], filters, 'rating')[0]
  const filtered = buildGlobalRankingData([cb], [a1, a2, b1, b2], { ...filters, teams: ['A'] }, 'rating')[0]
  assert.equal(full.availableTeamMinutes, 360)
  assert.equal(full.defenderMinutes, 180)
  assert.equal(filtered.availableTeamMinutes, 180)
  assert.equal(filtered.defenderMinutes, 90)
})

test('transfer opportunities exclude provably prior and subsequent team matches in global and team scopes', () => {
  const cb = player('transfer', 'CB', 'B')
  const keeper = player('keeper-transfer', 'GK', 'B')
  const a = appearance({ ...cb, teamId: 'A' })
  const b = appearance(cb)
  const games = [
    match('b-before', 1, [], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'O' }),
    match('a-play', 2, [a, appearance({ ...keeper, teamId: 'A' })]),
    match('a-gap', 3, []),
    match('b-play', 4, [b, appearance(keeper)], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'O' }),
    match('a-after', 5, []),
    match('b-after', 6, [], [], { teamId: 'B', homeTeamId: 'B', awayTeamId: 'O' }),
  ]
  const global = buildGlobalRankingData([cb], games, filters, 'rating')[0]
  const teamA = buildGlobalRankingData([cb], games, { ...filters, teams: ['A'] }, 'rating')[0]
  const teamB = buildGlobalRankingData([cb], games, { ...filters, teams: ['B'] }, 'rating')[0]
  assert.equal(global.availableTeamMinutes, 360)
  assert.equal(teamA.availableTeamMinutes, 180)
  assert.equal(teamB.availableTeamMinutes, 180)
  const goalkeeperRows = buildGlobalRankingData([keeper], games, filters, 'rating')
  assert.equal(goalkeeperRows[0].availableTeamMinutes, 360)
  assert.equal(rankGlobalRankingRows(goalkeeperRows, [keeper], 'goalkeeperGaPer90')[0].playerId, keeper.id)
})

test('competition filtered opportunity denominator only counts that competition', () => {
  const cb = player('cb-scoped', 'CB')
  const league = match('league-play', 1, [appearance(cb)])
  const cup = match('cup-play', 2, [appearance(cb)], [], { competitionType: 'cup', competitionStage: 'stage1' })
  const otherLeague = match('league-other', 3, [])
  assert.equal(buildGlobalRankingData([cb], [league, otherLeague], filters, 'rating')[0].availableTeamMinutes, 180)
  assert.equal(buildGlobalRankingData([cb], [cup], filters, 'rating')[0].availableTeamMinutes, 90)
})

test('direct and legacy fixtures count each recorded team opportunity once', () => {
  const direct = match('direct', 1, [], [], { teamId: 'A', homeTeamId: 'A', awayTeamId: 'B' })
  const legacy = match('legacy', 2, [], [], { teamId: undefined, homeTeamId: 'A', awayTeamId: 'B' })
  assert.equal(teamOpportunityMinutes([direct, direct, legacy], new Set(['A'])), 180)
  assert.equal(teamOpportunityMinutes([direct, direct, legacy], new Set(['B'])), 90)
})
