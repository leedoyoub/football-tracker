const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const rating = require('../src/engine/rating.ts')
const revision = require('../src/engine/ratingRevision.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { aggregatePlayerStats, buildGlobalRankingData, rankGlobalRankingRows, unifiedBestEleven } = require('../src/engine/stats.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { awardsForCompetition, seasonAwards, performanceAwardResult } = require('../src/engine/awards.ts')
const { monthlyAwardForBlock, buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { historyAwardsForSeason, historyTimelineForSeason, historyMonthlyAward } = require('../src/engine/historyReadModels.ts')
const { seasonRecap } = require('../src/engine/seasonInsights.ts')
const player = (id, position) => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1, rating: 10 })
const cb = player('cb', 'CB'), cam = player('cam', 'CAM'), players = [cb, cam]
const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
const filters = { seasons: ['S1'], teams: [], positions: [] }
const near = (value, expected) => assert(Math.abs(value - expected) < 1e-10, `${value} != ${expected}`)
function game(id, day = 1, subjects = players, sot = 4) {
  return { id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: 'A', awayTeamId: 'B',
    halftimeOpponentSot: sot / 2, fulltimeOpponentSot: sot, manOfMatchPlayerId: 'cb', ratings: { cb: 10, cam: 1 },
    appearances: subjects.map(p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position, rating: 10 })),
    events: [{ id: `${id}:g1`, type: 'goal', minute: 20, teamId: 'A', assistPlayerId: 'cam' }, { id: `${id}:g2`, type: 'goal', minute: 30, teamId: 'A' }] }
}
// Recreate REV12 solely inside the fixture, then reuse the same object identities
// under REV13. This detects caches that forget their formula revision dependency.
function withRevision12(run) {
  const original = revision.RATING_ENGINE_REVISION
  const values = ['CB', 'LCB', 'RCB'].map(p => rating.POSITION_RULES[p].suppressionMax)
  try {
    revision.RATING_ENGINE_REVISION = 12
    for (const p of ['CB', 'LCB', 'RCB']) rating.POSITION_RULES[p].suppressionMax = 1.3
    return run()
  } finally {
    revision.RATING_ENGINE_REVISION = original
    for (const [index, p] of ['CB', 'LCB', 'RCB'].entries()) rating.POSITION_RULES[p].suppressionMax = values[index]
  }
}

test('REV13 CB/LCB/RCB suppression is exactly 1.40 at zero SOT and .742 at four SOT', () => {
  for (const position of ['CB', 'LCB', 'RCB']) for (const [sot, expected] of [[0, 1.40], [4, .742]]) {
    const p = player(position, position), match = game(`exact-${position}-${sot}`, 1, [p], sot)
    const result = rating.ratePlayerMatch(match, p)
    near(result.noConceded, expected); assert.equal(result.cleanSheet, 0)
    near(result.base, 6.5); near(result.result, .1)
  }
})

test('non-CB suppression and all other CB contributions retain their contract', () => {
  for (const [position, maximum] of [['LB', 1], ['LWB', 1], ['RB', 1], ['RWB', 1], ['CDM', .8], ['CM', .3], ['LM', .25], ['RM', .25], ['GK', 0]]) {
    const p = player(position, position)
    near(rating.ratePlayerMatch(game(`unchanged-${position}`, 1, [p], 0), p).noConceded, maximum)
  }
  const match = game('contributions', 1, [cb], 4)
  match.events = [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: 'cb' }, { id: 'assist', type: 'goal', minute: 20, teamId: 'A', assistPlayerId: 'cb' }, { id: 'neutral', type: 'goal', minute: 30, teamId: 'A' }, { id: 'fault', type: 'goal', minute: 40, teamId: 'B', concededGoalCausePlayerId: 'cb' }]
  const r = rating.ratePlayerMatch(match, cb)
  assert.deepEqual([r.goals, r.assists, r.teamGoals, r.conceded, r.concededCause, r.cleanSheet], [1.35, .75, 0, -.35, -.3, 0])
})

test('canonical MOM changes from CAM to CB using raw precision even when both display 7.3', () => {
  const match = game('mom')
  withRevision12(() => { near(rating.ratePlayerMatch(match, cb).raw, 7.289); assert.equal(rating.getMatchManOfTheMatch(match, players), 'cam') })
  near(rating.ratePlayerMatch(match, cb).raw, 7.342)
  near(rating.ratePlayerMatch(match, cam).raw, 7.29)
  assert.equal(rating.ratePlayerMatch(match, cb).raw.toFixed(1), rating.ratePlayerMatch(match, cam).raw.toFixed(1))
  assert.equal(rating.getMatchManOfTheMatch(match, players), 'cb')
})

test('REV12 warm caches are invalidated for MOM counts, global/team/league ranks, Player Detail and Records', () => {
  const matches = [1, 2, 3].map(day => game(`rank-${day}`, day))
  const before = JSON.stringify(matches)
  withRevision12(() => {
    assert.equal(derivePlayerScope(cam, players, matches, { season: 'S1' }).mom, 3)
    assert.equal(rankGlobalRankingRows(buildGlobalRankingData(players, matches, filters, 'mom'), players, 'mom')[0].playerId, 'cam')
    buildPlayerRecordLeaderboards(players, matches)
    buildSeasonAnalytics(teams, players, matches, 'S1')
    historyTimelineForSeason(teams, players, matches, [], 'S1')
  })
  for (const p of players) {
    const expected = p === cb ? 7.342 : 7.29, mom = p === cb ? 3 : 0
    const detail = derivePlayerScope(p, players, matches, { season: 'S1', competition: 'league', teamIds: ['A'] })
    near(detail.averageRating, expected); assert.equal(detail.mom, mom); assert.equal(detail.goodMatches, 3)
    const stats = aggregatePlayerStats(p, players, matches)
    near(stats.avgRating, expected); assert.equal(stats.mom, mom)
  }
  assert.equal(derivePlayerScope(cb, players, matches, { season: 'S1' }).mom, 3)
  for (const scope of [filters, { ...filters, teams: ['A'] }]) for (const metric of ['mom', 'rating']) {
    const rows = buildGlobalRankingData(players, matches, scope, metric)
    near(rows.find(r => r.playerId === 'cb').avgRating, 7.342)
    assert.equal(rankGlobalRankingRows(rows, players, metric)[0].playerId, 'cb')
  }
  const records = buildPlayerRecordLeaderboards(players, matches)
  assert.equal(records.find(g => g.id === 'mom').rows[0].playerId, 'cb')
  assert.equal(records.find(g => g.id === 'highest-rating').rows[0].playerId, 'cb')
  const snapshots = buildSeasonAnalytics(teams, players, matches, 'S1').playerSnapshots
  assert.equal(snapshots.get(3).rows.get('mom')[0].playerId, 'cb')
  assert.equal(snapshots.get(3).rows.get('rating')[0].playerId, 'cb')
  assert.equal(historyTimelineForSeason(teams, players, matches, [], 'S1').rating.playerId, 'cb')
  assert.equal(JSON.stringify(matches), before, 'historical facts and ignored stored ratings must remain untouched')
})

test('Best XI and recent Team of the Week reorder close CB candidates in league/champions/cup scopes using REV13', () => {
  const a = player('zero-sot-cb', 'CB'), b = player('assist-cb', 'CB'), subjects = [a, b]
  for (const competitionType of ['league', 'champions', 'cup']) {
    const matches = [1, 2, 3].flatMap(day => {
      const first = { ...game(`${competitionType}-a-${day}`, day, [a], 0), competitionType, events: [] }
      const second = { ...game(`${competitionType}-b-${day}`, day, [b], 6), competitionType, events: [{ id: `assist-${day}`, type: 'goal', minute: 20, teamId: 'A', assistPlayerId: b.id }] }
      return [first, second]
    })
    withRevision12(() => {
      near(rating.ratePlayerMatch(matches[0], a).raw, 7.8); near(rating.ratePlayerMatch(matches[1], b).raw, 7.844)
      for (const recent of [false, true]) assert.equal(unifiedBestEleven(subjects, matches, 'S1', recent).slots.find(s => s.slot === 'LCB').playerId, b.id)
    })
    near(rating.ratePlayerMatch(matches[0], a).raw, 7.9); near(rating.ratePlayerMatch(matches[1], b).raw, 7.882)
    for (const recent of [false, true]) assert.equal(unifiedBestEleven(subjects, matches, 'S1', recent).slots.find(s => s.slot === 'LCB').playerId, a.id)
    assert.equal(performanceAwardResult(subjects, matches).bestXI.find(s => s.slot === 'LCB').playerId, a.id)
    assert.equal(awardsForCompetition(competitionType, 'S1', teams, subjects, matches, []).bestXI.find(s => s.slot === 'LCB').playerId, a.id)
  }
})

test('monthly, stage, competition, season and historical awards consume the new canonical average', () => {
  const matches = [1, 2, 3].map(day => game(`awards-${day}`, day)), states = []
  const competition = require('../src/engine/competition.ts'), original = competition.competitionSeasonStatus
  // Only completion is supplied; rating, eligibility, bonuses and selectors run unchanged.
  competition.competitionSeasonStatus = () => ({ league: { complete: true, championId: 'A', standings: [{ teamId: 'A', rank: 1 }] }, cup: { championId: 'A' }, champions: { championId: 'A' }, complete: true })
  try {
    withRevision12(() => {
      assert.equal(seasonAwards('S1', teams, players, matches, states).ballon.playerId, 'cam')
      assert.equal(seasonRecap(players, matches, 'S1', states, teams).awards.find(award => award.id === 'player').playerIds[0], 'cam')
      historyAwardsForSeason(teams, players, matches, states, 'S1', 'all')
      historyMonthlyAward(teams, players, matches, 'S1', 1)
    })
    assert.equal(monthlyAwardForBlock(teams, players, matches, 'S1', 1).bestPlayerId, 'cb')
    assert.equal(performanceAwardResult(players, matches).bestPlayerId, 'cb')
    for (const type of ['league', 'cup', 'champions']) {
      const scoped = matches.map(m => ({ ...m, competitionType: type }))
      const award = awardsForCompetition(type, 'S1', teams, players, scoped, states)
      assert.equal(award.mvp.playerId, 'cb')
      near(award.candidates.find(c => c.playerId === 'cb').average, 7.342)
    }
    assert.equal(seasonAwards('S1', teams, players, matches, states).ballon.playerId, 'cb')
    const recap = seasonRecap(players, matches, 'S1', states, teams)
    assert.equal(recap.awards.find(award => award.id === 'player').playerIds[0], 'cb')
    assert.equal(recap.awards.find(award => award.id === 'mom').playerIds[0], 'cb')
    assert.equal(historyAwardsForSeason(teams, players, matches, states, 'S1', 'all').find(a => a.competition === 'league').player.playerId, 'cb')
    assert.equal(historyMonthlyAward(teams, players, matches, 'S1', 1).bestPlayerId, 'cb')
  } finally { competition.competitionSeasonStatus = original }
})
