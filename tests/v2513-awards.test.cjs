require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test, after } = require('node:test'), path = require('node:path')
const { baselineSource } = require('./helpers/v2513-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
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
    assert.equal(calls, 3)
  } finally { awards.awardsForCompetition = prior }
})
test('optimized official events, candidates and record filters equal independent v2.5.12 objects', () => {
  const current = require('../src/engine/officialAwards.ts'), before = require(path.join(base.directory, 'src/engine/officialAwards.ts'))
  const currentRecords = require('../src/engine/awardRecords.ts'), beforeRecords = require(path.join(base.directory, 'src/engine/awardRecords.ts'))
  const s = performanceFixture(2)
  for (const season of ['Season 1', 'Season 2']) assert.deepEqual(current.officialSeasonModel(s.teams, s.players, s.matches, s.competitionStates, season), before.officialSeasonModel(s.teams, s.players, s.matches, s.competitionStates, season))
  for (const competition of ['all', 'league', 'cup', 'champions']) for (const positionFilter of ['all', 'gk', 'st-ss']) {
    const scope = { seasons: ['Season 2'], teamIds: [s.teams[0].id], competition, positionFilter }
    for (const fn of ['awardRecordGroups', 'teamHistoryRecordGroups']) assert.deepEqual(currentRecords[fn](s.teams, s.players, s.matches, s.competitionStates, scope), beforeRecords[fn](s.teams, s.players, s.matches, s.competitionStates, scope))
  }
  for (const matches of [s.matches.slice(1), s.matches.map((m, i) => i ? m : { ...m, events: [] }), [...s.matches, { ...s.matches[0], id: 'added' }]]) {
    const players = s.players.map((p, i) => i ? p : { ...p, teamId: 'released', position: 'ST' })
    const states = s.competitionStates.map(d => ({ ...d, teamIds: d.teamIds.slice().reverse() }))
    assert.deepEqual(current.officialSeasonModel(s.teams, players, matches, states, 'Season 1'), before.officialSeasonModel(s.teams, players, matches, states, 'Season 1'))
  }
})
