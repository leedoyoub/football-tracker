require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const history = require('../src/engine/historyReadModels.ts')
const { STATIC_TEAMS } = require('../src/data/teams.ts')

for (const [kind, query, counter] of [
  ['timeline', (teams, players, matches, states, season) => history.historyTimelineForSeason(teams, players, matches, states, season), 'timelineBuilds'],
  ['awards', (teams, players, matches, states, season) => history.historyAwardsForSeason(teams, players, matches, states, season, 'league'), 'awardBuilds'],
  ['legacy monthly compatibility', (teams, players, matches, _states, season) => history.historyMonthlyAward(teams, players, matches, season, 1), 'monthlyBuilds'],
]) test(`v265 History ${kind} cache evicts stale revision/scope entries after 32 results`, () => {
  history.clearHistoryReadModelCache()
  const players = [], matches = [], states = []
  const run = season => query(STATIC_TEAMS, players, matches, states, season)
  run('S0')
  run('S0')
  assert.equal(history.historyReadModelDiagnostics()[counter], 1)
  for (let i = 1; i <= 32; i++) run(`S${i}`)
  assert.equal(history.historyReadModelDiagnostics()[counter], 33)
  run('S0')
  assert.equal(history.historyReadModelDiagnostics()[counter], 34)
})
