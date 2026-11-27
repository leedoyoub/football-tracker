require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { baselineRoot, root } = require('./helpers/v2611-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const baseline = baselineRoot()
const { alignArchivedRatingInputs } = require('./helpers/rating-release-comparison.cjs')
alignArchivedRatingInputs(baseline)
const from = (source, file) => require(path.join(source, 'src', file + '.ts'))

test('timeline normalization and persisted-state acceptance match v2.6.10', () => {
  const state = performanceFixture(1)
  const beforeTimeline = from(baseline, 'engine/timeline')
  const afterTimeline = from(root, 'engine/timeline')
  for (const position of ['gk', 'RcAm', 'LCAM', 'LDM', 'RCB', 'LWB', 'none', '', undefined]) {
    assert.equal(afterTimeline.normalizeMatchPosition(position), beforeTimeline.normalizeMatchPosition(position))
  }
  for (const match of state.matches.slice(0, 32)) {
    assert.deepEqual(afterTimeline.normalizeMatchTimeline(match), beforeTimeline.normalizeMatchTimeline(match))
  }
  const before = from(baseline, 'lib/validation').validateState
  const after = from(root, 'lib/validation').validateState
  assert.equal(before(state), true)
  assert.equal(after(state), true)
  const [match, ...other] = state.matches
  const [keeper, ...squad] = match.appearances
  const variants = [
    { ...match, appearances: [...match.appearances, keeper] },
    { ...match, appearances: [{ ...keeper, matchPosition: 'CB' }, ...squad] },
    { ...match, events: [...match.events, { id: 'invalid-sub', type: 'sub', teamId: match.homeTeamId, playerOutId: keeper.playerId, playerInId: 'unknown', minute: 45, position: 'GK' }] },
    { ...match, events: [...match.events, { id: 'invalid-assist', type: 'goal', teamId: match.awayTeamId, assistPlayerId: keeper.playerId, minute: 45 }] },
    { ...match, halftimeOpponentSot: 4, fulltimeOpponentSot: 2 },
  ]
  for (const candidate of variants) {
    const modified = { ...state, matches: [candidate, ...other] }
    assert.equal(before(modified), false)
    assert.equal(after(modified), false)
  }
})

test('unit facts and every Match Changes group retain v2.6.10 order, totals and wording', () => {
  const { matches, players, teams, competitionStates } = performanceFixture(1)
  for (const teamIds of [[], [teams[0].id]]) {
    assert.deepEqual(from(root, 'engine/unitRecords').buildUnitRecords(players, matches, teamIds),
      from(baseline, 'engine/unitRecords').buildUnitRecords(players, matches, teamIds))
  }
  const before = from(baseline, 'engine/matchChangeIndex').buildMatchChangeIndex
  const after = from(root, 'engine/matchChangeIndex').buildMatchChangeIndex
  const original = after(players, teams, matches, competitionStates)
  assert.deepEqual(original, before(players, teams, matches, competitionStates))
  assert.equal(original, after(players, teams, matches, competitionStates))
  const changed = matches[0]
  matches[0] = { ...changed, events: changed.events.filter(event => event.type !== 'goal') }
  const catchUp = after(players, teams, matches, competitionStates)
  assert.notEqual(catchUp, original)
  assert.deepEqual(catchUp, before(players, teams, matches.slice(), competitionStates))
})
