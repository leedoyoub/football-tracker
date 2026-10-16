require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test, after } = require('node:test')
const path = require('node:path')
const fs = require('node:fs')
const { baselineSource } = require('./helpers/v2511-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const baseline = baselineSource()
after(baseline.cleanup)
const before = require(path.join(baseline.directory, 'src/engine/stats.ts'))
const current = require('../src/engine/stats.ts')
const { RANKING_METRICS } = require('../src/lib/rankingMetrics.ts')
const { positionFilterFamilies } = require('../src/engine/positionScope.ts')
const s = performanceFixture()
for (const season of ['Season 1', 'Season 2']) for (const scope of ['all', 'league', 'cup', 'champions']) test(`v2.5.10 full ranking equivalence: ${season} ${scope}, every metric, team and position scopes`, () => {
  const matches = s.matches.filter(m => scope === 'all' || m.competitionType === scope)
  const snapshot = JSON.stringify(s)
  const filters = [{ seasons: [season], teams: [], positions: [] }, { seasons: [season], teams: [s.teams[0].id], positions: [] }, ...['st-ss', 'lw-rw', 'cam', 'lm-rm', 'cm', 'cdm', 'lb-rb', 'cb', 'gk'].map(position => ({ seasons: [season], teams: [], positions: positionFilterFamilies(position) }))]
  for (const filter of filters) {
    const a = current.buildGlobalRankingData(s.players, matches, filter, 'rating')
    const b = before.buildGlobalRankingData(s.players, matches, filter, 'rating')
    assert.deepEqual(a, b)
    assert.equal(current.buildGlobalRankingData(s.players, matches, filter, 'rating'), a, 'same scope returns cached facts')
    for (const metric of [...RANKING_METRICS.map(m => m.value), 'goalsConceded']) {
      const rows = current.rankGlobalRankingRows(a, s.players, metric)
      assert.deepEqual(rows, before.rankGlobalRankingRows(b, s.players, metric), `${metric} full ordered facts`)
      assert.equal(current.rankGlobalRankingRows(a, s.players, metric), rows, 'reselect returns cached ranked rows')
    }
  }
  assert.equal(JSON.stringify(s), snapshot)
})
test('timeline, competition rules, constants and durable data remain source identical to v2.5.10', () => {
  for (const file of ['engine/constants.ts', 'engine/timeline.ts', 'engine/seasonAnalytics.ts', 'engine/competition.ts', 'engine/kickoffLineup.ts', 'lib/repository.ts', 'lib/validation.ts', 'lib/rankingMetrics.ts', 'store.tsx']) {
    const normalize = filename => fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n')
    assert.equal(normalize(path.join(baseline.root, 'src', file)), normalize(path.join(baseline.directory, 'src', file)), file)
  }
  // REV13 calculation and all its role/goal/save helpers precede rateMatch.
  const calculation = filename => fs.readFileSync(filename, 'utf8').replaceAll('\r\n', '\n').split('export function rateMatch')[0].split('export function clampRating')[1]
  assert(calculation(path.join(baseline.root, 'src/engine/rating.ts')).length > 1000)
  // The full rating/MOM behavior is also independently compared for every fixture match.
  assert.equal(calculation(path.join(baseline.root, 'src/engine/rating.ts')), calculation(path.join(baseline.directory, 'src/engine/rating.ts')))
  assert.deepEqual(RANKING_METRICS, require(path.join(baseline.directory, 'src/lib/rankingMetrics.ts')).RANKING_METRICS)
})
