require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test, after } = require('node:test'), path = require('node:path')
const { baselineSource } = require('./helpers/v2513-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const base = baselineSource(); after(base.cleanup)
test('ranking facts establish chronological order once per scope rather than once per player', () => {
  const chronology = require('../src/engine/matchChronology.ts'), prior = chronology.oldestMatches
  const positions = require('../src/engine/positionScope.ts'), priorPositions = positions.scopedPositionFamilyByPlayer
  let familySource
  positions.scopedPositionFamilyByPlayer = (players, matches, ...rest) => { familySource = matches; return priorPositions(players, matches, ...rest) }
  let calls = 0; chronology.oldestMatches = (...args) => { calls++; return prior(...args) }
  try {
    const s = performanceFixture(1)
    require('../src/engine/stats.ts').buildGlobalRankingData(s.players, s.matches, { seasons: [], teams: [], positions: [] }, 'rating')
    assert.equal(calls, 1)
    assert.strictEqual(familySource, s.matches, 'an already scoped collection reuses canonical position inputs')
  } finally { chronology.oldestMatches = prior; positions.scopedPositionFamilyByPlayer = priorPositions }
})
test('shared Detail rank scope exactly matches v2.5.12 overall/position/team ranks for every player', () => {
  const { playerDetailRankingScope } = require('../src/engine/playerDetailRanks.ts')
  const oldStats = require(path.join(base.directory, 'src/engine/stats.ts'))
  const { scopedMetricRanks } = require(path.join(base.directory, 'src/engine/seasonAnalytics.ts'))
  const { scopedPositionFamilyByPlayer } = require(path.join(base.directory, 'src/engine/positionScope.ts'))
  const { latestAppearanceTeamId } = require('../src/engine/playerDetailScope.ts')
  const s = performanceFixture(1)
  for (const competition of ['all', 'league', 'cup', 'champions']) {
    const games = s.matches.filter(m => competition === 'all' || m.competitionType === competition)
    const filters = { seasons: ['Season 1'], teams: [], positions: [] }, families = scopedPositionFamilyByPlayer(s.players, games, {})
    const rows = oldStats.buildGlobalRankingData(s.players, games, filters, 'rating')
    const scope = playerDetailRankingScope(s.players, s.matches, 'Season 1', competition)
    assert.strictEqual(playerDetailRankingScope(s.players, s.matches, 'Season 1', competition), scope)
    for (const player of s.players) {
      const team = latestAppearanceTeamId(player.id, games), ranks = scope.ranksFor(player.id, team)
      const teamRows = team ? oldStats.buildGlobalRankingData(s.players, games, { ...filters, teams: [team] }, 'rating') : []
      for (const metric of ['rating', 'goals', 'assists']) {
        const expected = { ...scopedMetricRanks(oldStats.rankGlobalRankingRows(rows, s.players, metric), s.players, player.id, families), team: scopedMetricRanks(oldStats.rankGlobalRankingRows(teamRows, s.players, metric), s.players, player.id).team }
        assert.deepEqual(ranks[metric], expected, `${competition}:${player.id}:${metric}`)
      }
    }
    assert.notStrictEqual(playerDetailRankingScope(s.players, s.matches.slice(1), 'Season 1', competition), scope)
  }
})
