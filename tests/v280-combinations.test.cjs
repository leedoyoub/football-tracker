require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')

const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, teamId, position, number: 9 })
const appearance = (player, role = 'starter', teamId = player.teamId) => ({ playerId: player.id, teamId, role, position: player.position })
const match = (day, appearances, fields = {}) => ({
  id: String(day), date: `2026-01-${String(day).padStart(2, '0')}`, season: 'Season 1', matchDay: day,
  competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', duration: 90,
  appearances, events: [], ...fields,
})
const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
const groups = (players, matches, selectedIds, filters = {}) => require('../src/screens/recordsLeaderboards.ts').recordsLeaderboardGroups({
  players, matches, teams: [], category: 'combination', selectedIds, scope: { ...scope, ...filters },
})
const sub = (minute, out, into, teamId = 'A') => ({ id: `sub:${minute}:${out.id}`, type: 'sub', minute, teamId, playerOutId: out.id, playerInId: into.id, position: into.position })

test('Together PPG and Best Units use the 40% ceiling over shared club fixtures', () => {
  const a = player('a'), b = player('b')
  const starts = [match(1, [appearance(a), appearance(b)]), match(5, [appearance(a), appearance(b)])]
  const other = [match(2, []), match(3, [appearance(a), appearance(b, 'bench')]), match(4, [])]
  const ids = ['together:attack:2:ppg', 'best-unit:attack:2:goals', 'together:attack:2:starts']
  const selected = groups([a, b], [...starts, ...other], ids, { teamIds: ['A'] })
  for (const id of ids) assert.equal(selected.find(group => group.id === id).rows.length, 1, id)
  assert.match(selected.find(group => group.id === ids[0]).rows[0].detail, /2 starts.*180' shared/)
  const extra = match(6, [appearance(a), appearance(b, 'bench')], { competitionType: 'cup' })
  const all = groups([a, b], [...starts, ...other, extra], ids, { teamIds: ['A'] })
  assert.deepEqual(all.map(group => [group.id, group.rows.length]), [[ids[2], 1], [ids[0], 0], [ids[1], 0]])
  const league = groups([a, b], [...starts, ...other, extra], ids, { teamIds: ['A'], competition: 'league' })
  assert.equal(league.find(group => group.id === ids[0]).rows.length, 1)
})

test('both CB records accept exactly 20% shared CB time and report the overlap sample', () => {
  const a = player('a', 'A', 'CB'), b = player('b', 'A', 'CB'), c = player('c', 'A', 'CB')
  const fixtures = minute => [
    match(1, [appearance(a), appearance(b), appearance(c, 'bench')], { events: [sub(minute, b, c)] }),
    match(2, [appearance(a), appearance(b, 'bench')]),
  ]
  const ids = ['cb-suppression', 'cb-ga']
  for (const group of groups([a, b, c], fixtures(36), ids)) {
    const row = group.rows.find(row => row.playerIds.includes('a') && row.playerIds.includes('b'))
    assert.equal(row.numeric, 0)
    assert.match(row.detail, /1 match.*36' shared CB/)
    assert.equal(row.combinationTeamId, 'A')
  }
  for (const group of groups([a, b, c], fixtures(35), ids)) {
    assert.equal(group.rows.some(row => row.playerIds.includes('a') && row.playerIds.includes('b')), false)
  }
})

test('equal goal partnership totals retain shared ranks and assist direction', () => {
  const a = player('a'), b = player('b'), c = player('c')
  const events = [
    { id: 'a-to-b', type: 'goal', minute: 10, teamId: 'A', playerId: 'b', assistPlayerId: 'a' },
    { id: 'b-to-c', type: 'goal', minute: 20, teamId: 'A', playerId: 'c', assistPlayerId: 'b' },
  ]
  const [direct] = groups([a, b, c], [match(1, [appearance(a), appearance(b), appearance(c)], { events })], ['goal-combinations'])
  assert.deepEqual(direct.rows.map(row => [row.combinationPair.playerIds, row.combinationPair.connector, row.rank]), [
    [['a', 'b'], '→', 1], [['b', 'c'], '→', 1],
  ])
})

test('Find Partner includes players from their former club and counts nonoverlapping appearances', () => {
  const { findPartners, partnershipDetail } = require('../src/engine/partnershipRecords.ts')
  const a = player('a', 'C'), b = player('b'), c = player('c', 'C'), reserve = player('reserve')
  const fixtures = [
    match(1, [appearance(a, 'starter', 'A'), appearance(b), appearance(reserve, 'bench')], { events: [
      { id: 'a-to-b', type: 'goal', minute: 10, teamId: 'A', playerId: 'b', assistPlayerId: 'a' },
      { id: 'b-to-a', type: 'goal', minute: 20, teamId: 'A', playerId: 'a', assistPlayerId: 'b' },
    ] }),
    match(2, [appearance(a, 'starter', 'A'), appearance(b, 'bench')], { events: [sub(45, a, b)] }),
    match(3, [appearance(a), appearance(c)], { teamId: 'C', homeTeamId: 'C' }),
  ]
  const partners = findPartners([a, b, c, reserve], fixtures, scope, a.id)
  assert.deepEqual(partners.map(row => [row.playerIds, row.teamId, row.matchesTogether, row.startsTogether, row.minutesTogether]), [
    [['a', 'b'], 'A', 2, 1, 90], [['a', 'c'], 'C', 1, 1, 90],
  ])
  const detail = partnershipDetail(fixtures, scope, ['a', 'b'])
  assert.deepEqual(detail.directions, [{ assisterId: 'a', scorerId: 'b', goals: 1 }, { assisterId: 'b', scorerId: 'a', goals: 1 }])
  assert.equal(detail.combinedGA, 4)
  assert.equal(detail.ppg, 3)
  assert.deepEqual(detail.games.map(game => [game.match.id, game.minutesTogether]), [['2', 0], ['1', 90]])
  assert.deepEqual(findPartners([a, b, c, reserve], fixtures, { ...scope, teamIds: ['C'] }, a.id).map(row => row.playerIds), [['a', 'c']])
})

test('Partnership details use position changes to isolate the actual CB rate sample', () => {
  const { partnershipDetail } = require('../src/engine/partnershipRecords.ts')
  const a = player('a', 'A', 'CB'), b = player('b', 'A', 'CB')
  const game = match(1, [appearance(a), { ...appearance(b), positionHistory: [{ minute: 36, position: 'ST' }] }], {
    halftimeOpponentSot: 2, fulltimeOpponentSot: 5,
    events: [
      { id: 'conceded-cb', type: 'goal', minute: 18, teamId: 'B' },
      { id: 'conceded-not-cb', type: 'goal', minute: 55, teamId: 'B' },
    ],
  })
  const detail = partnershipDetail([game], scope, ['a', 'b'], 'cb-ga')
  assert.equal(detail.minutesTogether, 90)
  assert.equal(detail.defensiveMatches, 1)
  assert.equal(detail.defensiveMinutes, 36)
  assert.equal(detail.defensiveGA90, 2.5)
  assert.equal(detail.defensiveSot90, 4)
})

test('Best Back unit detail preserves the record’s shared-minute rate', () => {
  const { partnershipDetail } = require('../src/engine/partnershipRecords.ts')
  const a = player('a', 'A', 'CB'), b = player('b', 'A', 'CB'), c = player('c', 'A', 'LB')
  const game = match(1, [appearance(a), appearance(c), { ...appearance(b), positionHistory: [{ minute: 50, position: 'ST' }] }], {
    events: [{ id: 'conceded-during-move', type: 'goal', minute: 70, teamId: 'B' }],
  })
  const detail = partnershipDetail([game], scope, ['a', 'b', 'c'], 'best-unit:defence:3:ga')
  assert.equal(detail.defensiveMinutes, 90)
  assert.equal(detail.defensiveGA90, 1)
})

test('Extra-time-only teammates are matched once but carry zero credited minutes', () => {
  const { findPartners, partnershipDetail } = require('../src/engine/partnershipRecords.ts')
  const a = player('a'), b = player('b'), c = player('c')
  const game = match(1, [appearance(a), appearance(b, 'bench'), appearance(c)], {
    duration: 95,
    events: [
      sub(91, c, b),
      { id: 'a-to-b', type: 'goal', minute: 94, teamId: 'A', playerId: 'b', assistPlayerId: 'a' },
    ],
  })
  assert.equal(findPartners([a, b, c], [game, game], scope, 'a').find(row => row.playerIds[1] === 'b').matchesTogether, 1)
  const detail = partnershipDetail([game, game], scope, ['a', 'b'])
  assert.equal(detail.matchesTogether, 1)
  assert.equal(detail.minutesTogether, 0)
  assert.equal(detail.combinedGA, 0)
  assert.deepEqual(detail.directions, [{ assisterId: 'a', scorerId: 'b', goals: 1 }])
})
