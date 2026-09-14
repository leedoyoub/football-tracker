const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { sotMultiplier, tracePlayerMatchRating } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { moveSubstitution } = require('../src/screens/matchLineup.ts')
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const player = (id, position = 'CB', teamId = 'A') => ({ id, name: id, displayName: id, teamId, position, number: 1 })
const appearance = (p, role = 'starter', extra = {}) => ({ playerId: p.id, teamId: extra.teamId ?? p.teamId, role, position: extra.position ?? p.position, matchPosition: extra.position ?? p.position, ...extra })
const goal = (id, minute, teamId = 'B') => ({ id, type: 'goal', minute, teamId })
const game = (appearances, events = [], extra = {}) => ({ id: 'm', season: 'Season 3', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events, ...extra })

test('interval SOT quality is normalized while total CB suppression remains proportional to minutes', () => {
  const starter = player('starter'), substitute = player('substitute')
  const match = game([appearance(starter), appearance(substitute, 'bench')], [{ id: 'sub', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'starter', playerInId: 'substitute', position: 'CB' }])
  const first = tracePlayerMatchRating(match, starter), second = tracePlayerMatchRating(match, substitute)
  near(first.sotBonus, .9); near(second.sotBonus, .45); near(first.sotBonus / second.sotBonus, 2)
})

test('conceded goals affect only the position segment in which they occurred', () => {
  const p = player('p')
  const match = game([appearance(p, 'starter', { positionHistory: [{ minute: 60, position: 'CDM' }] })], [goal('late', 80)])
  const trace = tracePlayerMatchRating(match, p)
  assert.deepEqual(trace.suppressionIntervals.map(row => [row.position, row.minutes, row.sot90]), [['CB', 60, 0], ['CDM', 30, 3]])
  near(trace.sotBonus, 1.0033333333333334)
})

test('fractional SOT values interpolate and preserve every integer table value', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 10].map(sotMultiplier), [1, .86, .73, .62, .45, .20])
  near(sotMultiplier(2.5), .675)
  near(sotMultiplier(4.7), .474)
})

test('Team Best Players scope uses historical appearance team context through the canonical ranking selector', () => {
  const transferred = player('transfer', 'ST', 'B')
  const a = game([appearance(transferred, 'starter', { teamId: 'A' })], [{ id: 'a-goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'transfer' }], { id: 'a', homeTeamId: 'A', awayTeamId: 'X', teamId: 'A' })
  const b = game([appearance(transferred)], [{ id: 'b-goal', type: 'goal', minute: 10, teamId: 'B', playerId: 'transfer' }], { id: 'b', homeTeamId: 'B', awayTeamId: 'X', teamId: 'B', competitionType: 'cup' })
  const onlyA = buildGlobalRankingData([transferred], [a, b], { seasons: ['Season 3'], teams: ['A'], positions: [] }, 'goals')
  const onlyBLeague = buildGlobalRankingData([transferred], [a, b].filter(match => match.competitionType === 'league'), { seasons: ['Season 3'], teams: ['B'], positions: [] }, 'goals')
  assert.equal(rankGlobalRankingRows(onlyA, [transferred], 'goals')[0].goals, 1)
  assert.equal(onlyBLeague.length, 0)
  const source = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(source.includes('buildGlobalRankingData') && source.includes('rankGlobalRankingRows') && source.includes('matchCompetitionType'))
})

test('new match flows keep one goalkeeper fixed and retain one total-save input', () => {
  const draft = { slotAssignments: { GK: 'keeper', CB: 'cb' }, homeBench: ['reserve'], events: [], positionHistories: {}, checkpoint: { slotAssignments: { GK: 'keeper', CB: 'cb' }, homeBench: ['reserve'] } }
  const positions = { GK: 'GK', CB: 'CB' }
  assert.strictEqual(moveSubstitution(draft, { group: 'starting', id: 'GK' }, { group: 'substitute', id: 'reserve' }, draft.checkpoint.slotAssignments, positions, 60, 'A', () => 'sub'), draft)
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes('The goalkeeper is fixed for this match.') && source.includes('aria-label="Total saves"'))
  assert(!source.includes('goalkeeperSaveEntries') && !source.includes('onGoalkeeperSaves'))
})
