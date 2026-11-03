require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test, after } = require('node:test'), path = require('node:path')
const { baselineSource } = require('./helpers/v2513-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { assertOfficialAwardPolicy } = require('./helpers/v261-award-policy-comparison.cjs')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const base = baselineSource(); after(base.cleanup)
test('team history does not calculate player awards and selected groups do not build hidden metrics', () => {
  const s = performanceFixture(1), awards = require('../src/engine/awards.ts'), prior = awards.awardsForCompetition
  let calls = 0; awards.awardsForCompetition = (...args) => { calls++; return prior(...args) }
  try {
    const { teamHistoryRecordGroups, awardRecordGroups } = require('../src/engine/awardRecords.ts')
    const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
    assert(teamHistoryRecordGroups(s.teams, s.players, s.matches, s.competitionStates, scope).length > 0)
    assert.equal(calls, 0)
    const groups = awardRecordGroups(s.teams, s.players, s.matches, s.competitionStates, scope, ['awards-total'])
    assert.deepEqual(groups.map(g => g.id), ['awards-total'])
    assert.equal(calls, 1, 'only the completed league publishes awards; unfinished Cup/Champions are deferred')
  } finally { awards.awardsForCompetition = prior }
})
test('official awards preserve unaffected v2.5.12 fields and record filters while applying the v265 policy', () => {
  const current = require('../src/engine/officialAwards.ts'), before = require(path.join(base.directory, 'src/engine/officialAwards.ts'))
  // Compare the unchanged aggregator with the archived recipient set. Joint
  // recipient totals are asserted against canonical events in v261 records.
  const currentRecords = sourceModule(path.resolve(__dirname, '..'), 'engine/awardRecords.ts', { './officialAwards': { ...current, awardEventDetail: before.awardEventDetail, officialSeasonModel: (...args) => ({ ...current.officialSeasonModel(...args), events: before.officialSeasonModel(...args).events }) } }), beforeRecords = require(path.join(base.directory, 'src/engine/awardRecords.ts'))
  const s = performanceFixture(2)
  for (const season of ['Season 1', 'Season 2']) assertOfficialAwardPolicy(current.officialSeasonModel(s.teams, s.players, s.matches, s.competitionStates, season), before.officialSeasonModel(s.teams, s.players, s.matches, s.competitionStates, season), s.players, s.matches, season, s.teams, s.competitionStates)
  for (const competition of ['all', 'league', 'cup', 'champions']) for (const positionFilter of ['all', 'gk', 'st-ss']) {
    const scope = { seasons: ['Season 2'], teamIds: [s.teams[0].id], competition, positionFilter }
    for (const fn of ['awardRecordGroups', 'teamHistoryRecordGroups']) {
      const actual = currentRecords[fn](s.teams, s.players, s.matches, s.competitionStates, scope)
      const original = beforeRecords[fn](s.teams, s.players, s.matches, s.competitionStates, scope)
      if (fn === 'teamHistoryRecordGroups') assert.deepEqual(actual, original)
      else {
        const retired = /^awards-(monthly|monthly-player|monthly-xi|finals|cup-final|champions-final|champions-round-player|champions-round-xi)$/
        const added = /^awards-(first-half|second-half)-(mvp|xi)$/
        assert.deepEqual(actual.filter(group => !added.test(group.id)), original.filter(group => !retired.test(group.id)), 'every retained metric, aggregate, row, rank, filter and historical detail remains identical with archived events')
        assert(!actual.some(group => retired.test(group.id)))
        assert.deepEqual(actual.filter(group => added.test(group.id)).map(group => [group.id, group.rows]), ['first-half-mvp', 'first-half-xi', 'second-half-mvp', 'second-half-xi'].map(kind => [`awards-${kind}`, []]), 'new half metrics cannot invent recipients in an injected legacy event set')
      }
    }
  }
  for (const matches of [s.matches.slice(1), s.matches.map((m, i) => i ? m : { ...m, events: [] }), [...s.matches, { ...s.matches[0], id: 'added' }]]) {
    const players = s.players.map((p, i) => i ? p : { ...p, teamId: 'released', position: 'ST' })
    const states = s.competitionStates.map(d => ({ ...d, teamIds: d.teamIds.slice().reverse() }))
    assertOfficialAwardPolicy(current.officialSeasonModel(s.teams, players, matches, states, 'Season 1'), before.officialSeasonModel(s.teams, players, matches, states, 'Season 1'), players, matches, 'Season 1', s.teams, states)
  }
})
