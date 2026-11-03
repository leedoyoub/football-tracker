require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { releaseBaseline } = require('./helpers/v261-baseline.cjs')
const { assertSelection, withoutSelection } = require('./helpers/v265-award-policy-comparison.cjs')
const b = releaseBaseline(); after(b.cleanup)
const fixture = performanceFixture(1)
const baseline = file => require(path.join(b.directory, 'src', file))

test('v2.6.1 preserves every REV13 breakdown and MOM for sampled tactical, substitute and edited histories', () => {
  const current = require('../src/engine/rating.ts'), old = baseline('engine/rating.ts')
  for (const original of fixture.matches.filter((_, i) => i % 19 === 0)) for (const match of [original, { ...original, events: original.events.filter(e => e.type !== 'goal') }]) {
    for (const appearance of match.appearances) {
      const player = fixture.players.find(p => p.id === appearance.playerId)
      if (player) assert.deepEqual(current.ratePlayerMatch(match, player), old.ratePlayerMatch(match, player), `${match.id} ${player.id}`)
    }
    assert.equal(current.getMatchManOfTheMatch(match, fixture.players), old.getMatchManOfTheMatch(match, fixture.players), match.id)
  }
})

test('official MVP/XI follow the v265 mathematics while every legacy GK and individual winner stays identical', () => {
  const current = require('../src/engine/awards.ts'), old = baseline('engine/awards.ts')
  for (const type of ['league', 'cup', 'champions']) {
    const args = [type, 'Season 1', fixture.teams, fixture.players, fixture.matches, fixture.competitionStates]
    const now = current.awardsForCompetition(...args), before = old.awardsForCompetition(...args)
    assertSelection(now, type, 'Season 1', fixture.teams, fixture.players, fixture.matches, fixture.competitionStates)
    const { scorers: _scorers, assistLeaders: _assistLeaders, goalkeepers: _goalkeepers, ...legacy } = withoutSelection(now)
    assert.deepEqual(legacy, withoutSelection(before), `${type}: every pre-v261 unaffected award field`)
  }
  const args = ['Season 1', fixture.teams, fixture.players, fixture.matches, fixture.competitionStates]
  const now = current.seasonAwards(...args), before = old.seasonAwards(...args)
  assertSelection(now, 'season', 'Season 1', fixture.teams, fixture.players, fixture.matches, fixture.competitionStates)
  const { goldenBootWinners: _boot, assistLeaderWinners: _assists, ...legacy } = withoutSelection(now)
  assert.deepEqual(legacy, withoutSelection(before), 'all unaffected season awards, including the goalkeeper')
})

test('team History records and XI projections reuse cached immutable scopes', () => {
  const { teamHistoryRecords, teamHistoryBestXI } = require('../src/engine/teamHistory.ts')
  const scope = { teamId: fixture.teams[0].id, season: 'Season 1', competition: 'all' }
  const start = performance.now(), records = teamHistoryRecords(fixture.players, fixture.matches, scope), xi = teamHistoryBestXI(fixture.players, fixture.matches, scope)
  const cold = performance.now() - start, warmStart = performance.now()
  for (let i = 0; i < 100; i++) {
    assert.strictEqual(teamHistoryRecords(fixture.players, fixture.matches, scope), records)
    assert.strictEqual(teamHistoryBestXI(fixture.players, fixture.matches, scope), xi)
  }
  const warm = performance.now() - warmStart
  console.log(`v2.6.1 History ${fixture.matches.length} matches: cold ${cold.toFixed(2)} ms; 100 cached Records + XI queries ${warm.toFixed(2)} ms`)
  assert.equal(new Set(xi.bestXI.flatMap(slot => slot.playerId ? [slot.playerId] : [])).size, xi.bestXI.filter(slot => slot.playerId).length)
})
