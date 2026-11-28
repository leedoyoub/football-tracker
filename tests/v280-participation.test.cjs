require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildHistoricalParticipation, playerAvailableMatches, buildSharedOpportunityCounter, officialParticipationThresholds, actualAppearance, meetsMinutesShare, meetsAppearancesShare } = require('../src/engine/participation.ts')
const { evaluateOfficialCandidates } = require('../src/engine/awardEvaluation.ts')

const player = (id, teamId = 'A') => ({ id, name: id, teamId, position: 'ST', number: 9 })
const app = (p, teamId, role = 'starter') => ({ playerId: p.id, teamId, role, position: p.position })
const match = (i, teamId, appearances = [], extra = {}) => ({
  id: `${i}-${teamId}`, season: 'S1', date: `2026-01-${String(i).padStart(2, '0')}`,
  matchDay: i, duration: 90, competitionType: 'league', homeTeamId: teamId, awayTeamId: 'opponent',
  teamId, appearances, events: [], ...extra,
})

test('official thresholds take the maximum total for one team across the supplied scope', () => {
  const league = [1, 2, 3, 4, 5].map(i => match(i, 'A'))
  const cup = [6, 7, 8, 9, 10, 11, 12, 13].map(i => match(i, 'B', [], { competitionType: 'cup' }))
  assert.deepEqual(officialParticipationThresholds([...league, ...cup, cup[0]]), { teamMatches: 8, appearances: 4, minutes: 144 })
  assert.deepEqual(officialParticipationThresholds(league), { teamMatches: 5, appearances: 2, minutes: 90 })
})

test('a saved last-event stoppage substitution counts as actual without a rating sample', () => {
  const p = player('p')
  const q = player('q')
  const late = app(p, 'A', 'bench')
  const on = { id: 'on', type: 'sub', minute: 92, teamId: 'A', playerOutId: q.id, playerInId: p.id, position: 'ST' }
  const games = [match(1, 'A', [app(p, 'A')]), match(2, 'A', [late, app(q, 'A')], { events: [on] }), ...[3, 4, 5].map(i => match(i, 'B', []))]
  assert.equal(actualAppearance(games[1], late), true)
  const candidates = evaluateOfficialCandidates([p, q], games, games, () => 0, {})
  assert.equal(candidates.find(row => row.playerId === p.id).minutes, 90)
  assert.equal(candidates.find(row => row.playerId === p.id).appearances, 1)
})

test('historical opportunities count roster evidence and gaps, with a departed final stint bounded', () => {
  const p = player('p', '')
  const q = player('q')
  const games = [match(1, 'A', [app(p, 'A'), app(q, 'A')]), match(2, 'A', []), match(3, 'A', [app(p, 'A', 'bench')]), match(4, 'A', [app(q, 'A')])]
  const index = buildHistoricalParticipation(games)
  assert.equal(playerAvailableMatches(index, p, games), 3)
  assert.equal(playerAvailableMatches(index, q, games), 4)
  const shared = buildSharedOpportunityCounter(index, [p, q], games)
  assert.equal(shared(['q', 'p'], 'A'), 3)
  assert.equal(shared(['p', 'q'], 'elsewhere'), 0)
})

test('registration gaps count across seasons and a full earlier roster bounds a new signing', () => {
  const p = player('p')
  const signing = player('signed')
  const roster = [p, ...Array.from({ length: 22 }, (_, i) => player(`old-${i}`))]
  const games = [
    match(1, 'A', roster.map(item => app(item, 'A'))),
    match(2, 'A', [app(signing, 'A'), app(p, 'A', 'bench')]),
    match(3, 'A', [], { season: 'S2' }),
    match(4, 'A', [app(p, 'A')], { season: 'S3' }),
  ]
  const history = buildHistoricalParticipation(games)
  assert.equal(playerAvailableMatches(history, signing, games.slice(0, 2)), 1)
  assert.equal(playerAvailableMatches(history, p, games), 4)
})

test('rate, position efficiency and career shares include exact boundaries and reject zero opportunity', () => {
  assert.equal(meetsMinutesShare(18, 90, 20), true)
  assert.equal(meetsMinutesShare(17, 90, 20), false)
  assert.equal(meetsMinutesShare(36, 90, 40), true)
  assert.equal(meetsMinutesShare(35, 90, 40), false)
  assert.equal(meetsMinutesShare(0, 0, 40), false)
  assert.equal(meetsAppearancesShare(3, 8), false)
  assert.equal(meetsAppearancesShare(4, 8), true)
})

test('two distinct fixtures on one calendar day count even when a player represents both clubs', () => {
  const p = { ...player('p'), teamIds: ['A', 'B'] }
  const one = match(1, 'A', [app(p, 'A')])
  const two = match(1, 'B', [app(p, 'B')])
  const games = [one, two, two]
  assert.equal(playerAvailableMatches(buildHistoricalParticipation(games), p, games), 2)
})
