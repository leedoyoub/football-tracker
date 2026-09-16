const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const rating = require('../src/engine/rating.ts')
const revision = require('../src/engine/ratingRevision.ts')
const { aggregatePlayerStats, buildGlobalRankingData, unifiedBestEleven } = require('../src/engine/stats.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { deriveNews } = require('../src/engine/news.ts')

const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const player = (id, position, rating = 1) => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1, rating })
const appearance = player => ({ playerId: player.id, teamId: 'A', position: player.position, matchPosition: player.position, role: 'starter' })

test('v8 has the exact finalized balance table and result modifier', () => {
  assert.equal(revision.RATING_ENGINE_REVISION, 8)
  assert.equal(rating.GOALKEEPER_BASE_RATING, 7.0)
  for (const position of ['CB', 'LCB', 'RCB']) assert.equal(rating.POSITION_RULES[position].suppressionMax, 1.50)
  for (const position of ['LB', 'LWB', 'RB', 'RWB']) assert.equal(rating.POSITION_RULES[position].suppressionMax, 1.20)
  for (const position of ['CDM', 'LDM', 'RDM']) assert.equal(rating.POSITION_RULES[position].suppressionMax, .65)
  for (const position of ['CM', 'LCM', 'RCM', 'LM', 'RM']) assert.equal(rating.POSITION_RULES[position].suppressionMax, .25)
  for (const position of ['CAM', 'GK', 'LW', 'RW', 'SS', 'ST', 'LST', 'RST']) assert.equal(rating.POSITION_RULES[position].suppressionMax, 0)
  const teamGoal = { LM: .03, RM: .03, CM: .05, LCM: .05, RCM: .05, CDM: .05, LDM: .05, RDM: .05, LB: .03, LWB: .03, RB: .03, RWB: .03 }
  for (const position of Object.keys(rating.POSITION_RULES)) assert.equal(rating.POSITION_RULES[position].teamGoal, teamGoal[position] ?? 0)
  assert.deepEqual([.8, .6, .4, .2, 0].map(rating.saveBonusPerSave), [.30, .27, .25, .21, .17])
  const base = { id: 'result', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [] }
  assert.equal(rating.resultModifier({ ...base, events: [{ id: 'win', type: 'goal', minute: 1, teamId: 'A' }] }, 'A'), .1)
  assert.equal(rating.resultModifier(base, 'A'), 0)
  assert.equal(rating.resultModifier({ ...base, events: [{ id: 'loss', type: 'goal', minute: 1, teamId: 'B' }] }, 'A'), -.3)
})

test('historical v6 rating and MOM feed every derived stats surface, not saved fields', () => {
  const defender = player('defender', 'LM', 9.9)
  const creator = player('creator', 'CAM', 1)
  const scorer = player('scorer', 'ST', 1)
  const players = [defender, creator, scorer]
  const match = {
    id: 'v6-mom-change', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B',
    manOfMatchPlayerId: creator.id,
    appearances: [
      { ...appearance(defender), role: 'bench' },
      { ...appearance(creator), role: 'bench' },
    ],
    events: [
      { id: 'defender-on', type: 'sub', minute: 89, teamId: 'A', playerOutId: 'out-1', playerInId: defender.id, position: 'LM' },
      { id: 'creator-on', type: 'sub', minute: 89, teamId: 'A', playerOutId: 'out-2', playerInId: creator.id, position: 'CAM' },
      { id: 'goal', type: 'goal', minute: 90, teamId: 'A', playerId: scorer.id },
    ],
  }
  const rawFactsBefore = JSON.stringify(match)
  const defenderRating = rating.ratePlayerMatch(match, defender)
  const creatorRating = rating.ratePlayerMatch(match, creator)
  near(defenderRating.raw, 6.5 + .1 + .03 + .25 / 90)
  near(creatorRating.raw, 6.6)
  assert.equal(rating.getMatchManOfTheMatch(match, players), defender.id)
  assert.equal(JSON.stringify(match), rawFactsBefore)

  const scope = derivePlayerScope(creator, players, [match])
  const ranking = buildGlobalRankingData(players, [match], { seasons: ['S1'], teams: [], positions: [] }, 'rating')
  const rankingCreator = ranking.find(row => row.playerId === creator.id)
  near(scope.appearances[0].rating.raw, creatorRating.raw)
  near(scope.averageRating, creatorRating.raw)
  near(aggregatePlayerStats(creator, players, [match]).avgRating, creatorRating.raw)
  near(rankingCreator.avgRating, creatorRating.raw)
  assert.equal(rankingCreator.mom, 0)
  assert.equal(ranking.find(row => row.playerId === defender.id).mom, 1)
  near(unifiedBestEleven(players, [match], 'S1').slots.find(slot => slot.playerId === creator.id).avgRating, creatorRating.raw)

  const homeSource = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const teamSource = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(homeSource.includes('buildGlobalRankingData(players, matches'))
  assert(teamSource.includes('scopedTeamRanking(players, matches'))
  assert(teamSource.includes('return buildGlobalRankingData(players'))
})

test('News cache is revision-aware and MOM is always recomputed from current facts', () => {
  const p = player('p', 'ST')
  const players = [p]
  const teams = [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }]
  const matches = [{ id: 'news', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [appearance(p)], events: [] }]
  const states = []
  const first = deriveNews(players, teams, matches, states)
  const originalRevision = revision.RATING_ENGINE_REVISION
  try {
    revision.RATING_ENGINE_REVISION = originalRevision + 1
    assert.notStrictEqual(deriveNews(players, teams, matches, states), first)
  } finally {
    revision.RATING_ENGINE_REVISION = originalRevision
  }
})
