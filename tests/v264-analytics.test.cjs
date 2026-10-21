require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const competition = require('../src/engine/competition.ts')
const rating = require('../src/engine/rating.ts')
const shots = require('../src/engine/opponentSot.ts')

test('League History prepares rating membership and allowed shots once per match across prefixes', () => {
  const fixture = performanceFixture(1)
  let ratingCalls = 0, shotCalls = 0
  const isolatedCompetition = sourceModule(path.resolve(__dirname, '..'), 'engine/competition.ts', {
    './rating': { ...rating, rateMatch(...args) { ratingCalls++; return rating.rateMatch(...args) } },
    './opponentSot': { ...shots, opponentSot(...args) { shotCalls++; return shots.opponentSot(...args) } },
  })
  const analytics = sourceModule(path.resolve(__dirname, '..'), 'engine/seasonAnalytics.ts', { './competition': isolatedCompetition })
  const history = analytics.buildLeagueHistory(fixture.teams, fixture.players, fixture.matches, 'Season 1')
  assert.equal(history.leagueSnapshots.size, 30)
  assert.equal(ratingCalls, 480, 'each match roster is rated once instead of once per later prefix')
  assert.equal(shotCalls, 480, 'only the registered recorded team needs allowed-shot facts')
  for (const [day, snapshot] of history.leagueSnapshots) {
    const expected = competition.leagueCompetition(fixture.teams, history.leagueMatches.filter(match => match.matchDay <= day), 'Season 1', fixture.players).standings
    assert.deepEqual(snapshot.standings.map(({ movement: _movement, ...row }) => row), expected)
  }
})
