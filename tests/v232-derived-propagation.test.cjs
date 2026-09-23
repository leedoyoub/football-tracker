const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { GOOD_RATING_THRESHOLD } = require('../src/engine/constants.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { aggregatePlayerStats, buildGlobalRankingData } = require('../src/engine/stats.ts')
const { playerStreaks } = require('../src/engine/seasonInsights.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')

const player = (id = 'cdm') => ({ id, name: id, displayName: id, fullName: id, teamId: 'A', position: 'CDM', number: 6, rating: 1 })
const app = (p) => ({ playerId: p.id, teamId: 'A', role: 'starter', position: 'CDM', matchPosition: 'CDM' })
function game(id, day, p, events = []) {
  return { id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [app(p)], events }
}
const filters = { seasons: ['S1'], teams: [], positions: [] }

test('historical raw CDM match is revision-10 recomputed and crosses the existing 7.2 threshold', () => {
  const p = player()
  const historical = game('historical', 1, p)
  const rawBefore = JSON.stringify(historical)
  const rating = ratePlayerMatch(historical, p)
  assert.equal(JSON.stringify(historical), rawBefore)
  assert.equal(rating.raw, 7.3)
  assert(rating.raw >= GOOD_RATING_THRESHOLD)
  assert.notEqual(rating.raw, p.rating)
  const derived = derivePlayerScope(p, [p], [historical], { season: 'S1', competition: 'league' })
  const stats = aggregatePlayerStats(p, [p], [historical])
  const ranking = buildGlobalRankingData([p], [historical], filters, 'rating')[0]
  assert.strictEqual(derived.appearances[0].rating, rating)
  assert.deepEqual([derived.goodMatches, derived.goodMatchRate, derived.averageRating], [1, 100, 7.3])
  assert.deepEqual([stats.goodMatches, stats.avgRating, ranking.goodMatches, ranking.avgRating], [1, 7.3, 1, 7.3])
})

test('canonical chronology drives current and longest 7.2+ streaks without inventing new semantics', () => {
  const p = player()
  const good = [game('g1', 1, p), game('g2', 2, p), game('g3', 3, p)]
  const below = game('low', 2, p, [{ id: 'against', type: 'goal', minute: 10, teamId: 'B' }])
  const continuous = playerStreaks(p, good).find(row => row.key === 'goodRating')
  const split = playerStreaks(p, [good[0], below, good[2]]).find(row => row.key === 'goodRating')
  assert.deepEqual([continuous.current, continuous.best], [3, 3])
  assert.deepEqual([split.current, split.best], [1, 1])
})

test('existing 8.0 Records consumer counts revision-10 ratings without adding an 8.0 streak', () => {
  const p = player()
  const high = game('high', 1, p, [{ id: 'g1', type: 'goal', minute: 10, teamId: 'A', playerId: p.id }])
  const normal = game('normal', 2, p)
  assert(ratePlayerMatch(high, p).raw >= 8 && ratePlayerMatch(high, p).raw < 9)
  assert(ratePlayerMatch(normal, p).raw < 8)
  const groups = buildPlayerRecordLeaderboards([p], [high, normal])
  const eight = groups.find(group => group.id === 'eight')
  assert.equal(eight.rows[0].numeric, 1)
  assert.equal(groups.some(group => group.id === 'eight-streak'), false)
})
