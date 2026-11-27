require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { baselineRoot, cappedMomFixture } = require('./helpers/v2612-mom-fixture.cjs')
const { assertRatingTransition } = require('./helpers/rating-release-comparison.cjs')
const before = require(path.join(baselineRoot(), 'src/engine/rating.ts'))
const { getMatchManOfTheMatch, rateMatch, RATING_ENGINE_REVISION } = require('../src/engine/rating.ts')

test('a capped striker beats a capped keeper on the existing full-precision breakdown', () => {
  const { state, capped, keeper, striker } = cappedMomFixture()
  const match = capped('capped', 'Season 1', 1)
  const { players } = state
  const ratings = rateMatch(match, players)
  const byId = new Map(ratings.map(row => [row.playerId, row]))
  assert.equal(RATING_ENGINE_REVISION, 14)
  assertRatingTransition(before.rateMatch(match, players), ratings)
  assert.equal(byId.get(keeper).saves, 3.5)
  assert.equal(byId.get(keeper).preClamp, 10.7)
  assert.equal(byId.get(keeper).raw, 10)
  assert.equal(byId.get(striker).raw, 10)
  assert(byId.get(striker).preClamp > byId.get(keeper).preClamp)
  assert.equal(before.getMatchManOfTheMatch(match, players), keeper)
  assert.equal(getMatchManOfTheMatch(match, players), striker)
  assert.equal(getMatchManOfTheMatch(match, [...players].reverse()), striker)
})

test('an immutable edit with the same saved ID recomputes the capped winner', () => {
  const { state, capped, keeper, striker } = cappedMomFixture()
  const match = capped('edited', 'Season 1', 1)
  const { players } = state
  assert.equal(getMatchManOfTheMatch(match, players), striker)
  const edited = { ...match, events: match.events.map(event => event.type === 'save' ? { ...event, count: 24 } : event) }
  assert.equal(rateMatch(edited, players).find(row => row.playerId === keeper).raw, 10)
  assert.equal(getMatchManOfTheMatch(edited, players), keeper)
  assert.equal(getMatchManOfTheMatch(match, players), striker)
})

test('an ordinary historical winner is recalculated and a single capped player wins outright', () => {
  const { state, capped, keeper, striker } = cappedMomFixture()
  const { players } = state
  const ordinary = state.matches[0]
  assert(Math.max(...rateMatch(ordinary, players).map(row => row.raw)) < 10)
  assert.equal(before.getMatchManOfTheMatch(ordinary, players), ordinary.appearances[11].playerId)
  assert.equal(getMatchManOfTheMatch(ordinary, players), keeper)
  const match = capped('one-capped', 'Season 1', 1)
  const edited = { ...match, events: match.events.filter(event => event.type !== 'save') }
  assert.deepEqual(rateMatch(edited, players).filter(row => row.raw === 10).map(row => row.playerId), [striker])
  assert.equal(getMatchManOfTheMatch(edited, players), striker)
  assert.notEqual(getMatchManOfTheMatch(edited, players), keeper)
})

function goalsFor(match, playerId) {
  return Array.from({ length: 7 }, (_, i) => ({ id: `${playerId}:${i}`, type: 'goal', minute: 5 + 10 * i, teamId: match.teamId, playerId }))
}

test('three capped players compete on the same precision, including a defender and an attacker', () => {
  const { state, capped, keeper, striker, defender } = cappedMomFixture()
  const match = capped('three-capped', 'Season 1', 1)
  match.events.push(...goalsFor(match, defender))
  const cappedRows = rateMatch(match, state.players).filter(row => row.raw === 10)
  assert.deepEqual(cappedRows.map(row => row.playerId), [keeper, defender, striker])
  assert.equal(getMatchManOfTheMatch(match, state.players), defender)
})

test('exact equal pre-clamp scores preserve the seeded legacy tie, including duplicate roster entries', () => {
  const { state, capped, defender } = cappedMomFixture()
  const match = capped('m', 'Season 1', 1)
  const other = match.appearances[3].playerId
  match.events = [...goalsFor(match, defender), ...goalsFor(match, other)]
  const rows = rateMatch(match, state.players).filter(row => row.raw === 10)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].preClamp, rows[1].preClamp)
  assert.equal(getMatchManOfTheMatch(match, state.players), other)
  const duplicate = [...state.players, state.players.find(player => player.id === defender)]
  assert.equal(getMatchManOfTheMatch(match, duplicate), before.getMatchManOfTheMatch(match, duplicate))
  assert.equal(getMatchManOfTheMatch(match, duplicate.reverse()), before.getMatchManOfTheMatch(match, [...duplicate]))
})

test('a sub-micro-point pre-clamp difference survives rounding and a late historical position change', () => {
  const { state, capped, defender } = cappedMomFixture()
  const match = capped('m', 'Season 1', 1)
  match.halftimeOpponentSot = 0
  match.fulltimeOpponentSot = 0
  const other = match.appearances[3].playerId
  match.events = [...goalsFor(match, defender), ...goalsFor(match, other)]
  match.appearances = match.appearances.map(row => row.playerId === other ? { ...row, positionHistory: [{ minute: 89.9999, position: 'LB' }] } : row)
  const [leading, trailing] = rateMatch(match, state.players).filter(row => row.raw === 10)
  const difference = leading.preClamp - trailing.preClamp
  assert(difference > 0 && difference < 0.000001)
  assert.equal(leading.preClamp.toFixed(5), trailing.preClamp.toFixed(5))
  assert.equal(before.getMatchManOfTheMatch(match, state.players), other)
  assert.equal(getMatchManOfTheMatch(match, state.players), defender)
})

test('a capped substitute competes using the same credited minutes and position as before', () => {
  const { state, capped, striker, keeper } = cappedMomFixture()
  const match = capped('substitute', 'Season 1', 1)
  const incoming = match.appearances[11].playerId
  match.events = [{ id: 'replace', type: 'sub', minute: 1, teamId: match.teamId, playerOutId: striker, playerInId: incoming, position: 'ST' },
    ...match.events.map(event => event.type === 'goal' ? { ...event, playerId: incoming } : event)]
  const ratings = rateMatch(match, state.players)
  assertRatingTransition(before.rateMatch(match, state.players), ratings)
  assert.equal(ratings.find(row => row.playerId === incoming).goals.toFixed(2), '5.60')
  assert.equal(ratings.find(row => row.playerId === incoming).minutes, 89)
  assert.equal(before.getMatchManOfTheMatch(match, state.players), keeper)
  assert.equal(getMatchManOfTheMatch(match, state.players), incoming)
})
