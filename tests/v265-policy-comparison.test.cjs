require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { assertPolicyEquivalence } = require('./helpers/v2512-policy-comparison.cjs')
const { assertSelection, assertNewsPolicy } = require('./helpers/v265-award-policy-comparison.cjs')
const { assertOfficialAwardPolicy } = require('./helpers/v261-award-policy-comparison.cjs')
const { awardResultForScope, seasonAwards } = require('../src/engine/awards.ts')
const { officialSeasonModel } = require('../src/engine/officialAwards.ts')
const { deriveNews } = require('../src/engine/news.ts')
const teams = [{ id: 'A', name: 'A', shortName: 'A' }]
const players = [{ id: 'p', name: 'p', teamId: 'A', position: 'ST', number: 1 }]
const matches = [{ id: 'm', date: '2026-01-01', season: 'S1', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'opponent', competitionType: 'league', competitionStage: 'regular', matchDay: 1, appearances: [{ playerId: 'p', teamId: 'A', position: 'ST', matchPosition: 'ST', role: 'starter' }], events: [] }]

test('old-release policy migration still rejects changed scorer values and unrelated model fields', () => {
  const args = ['S1', teams, players, matches, []]
  const actual = seasonAwards(...args)
  const { goldenBootWinners: _scorers, assistLeaderWinners: _assists, ...legacy } = actual
  assert.doesNotThrow(() => assertPolicyEquivalence(actual, legacy, 'engine/awards.ts', 'seasonAwards', args))
  for (const field of ['complete', 'goldenBoot', 'assistLeader']) {
    const changed = { ...actual, [field]: field === 'complete' ? !actual.complete : { playerId: 'wrong', value: 999, label: 'wrong' } }
    assert.throws(() => assertPolicyEquivalence(changed, legacy, 'engine/awards.ts', 'seasonAwards', args), /unaffected award fields/)
  }
})

test('official policy migration still rejects changed goalkeeper recipients and values', () => {
  const original = officialSeasonModel(teams, players, matches, [], 'S1')
  assert.doesNotThrow(() => assertOfficialAwardPolicy(original, original, players, matches, 'S1', teams))
  const changed = { ...original, competitionAwards: { ...original.competitionAwards, cup: { ...original.competitionAwards.cup, goalkeeper: { playerId: 'wrong', value: 999, label: 'wrong' } } } }
  assert.throws(() => assertOfficialAwardPolicy(changed, original, players, matches, 'S1', teams), /unaffected competition awards/)
})

test('independent selection checks reject changed raw means, regulation minutes, eligibility and score terms', () => {
  const actual = awardResultForScope('league', 'S1', teams, players, matches, [])
  for (const [field, value] of [['average', 8], ['minutes', 91], ['availableMinutes', 1000], ['teamPerformanceBonus', .1], ['selectionScore', 9]]) {
    const changed = structuredClone(actual)
    changed.candidates[0][field] = value
    const candidate = changed.candidates[0]
    if (field === 'average' || field === 'teamPerformanceBonus') candidate.selectionScore = candidate.average + candidate.teamPerformanceBonus
    changed.bestXI = changed.bestXI.map(slot => slot.playerId === candidate.playerId ? { ...slot, avgRating: candidate.average } : slot)
    changed.statsByPlayer[candidate.playerId].avgRating = candidate.average
    // Update all dependent presentation values too, so the independent numeric
    // oracle (rather than a stale projection) is what rejects each corruption.
    if (changed.mvp) changed.mvp = { ...changed.mvp, value: candidate.average, awardScore: candidate.selectionScore }
    const message = { average: /raw arithmetic average/, minutes: /regulation minutes/, availableMinutes: /50% opportunity-minute gate/, teamPerformanceBonus: /placement base/, selectionScore: /team participation term/ }[field]
    assert.throws(() => assertSelection(changed, 'league', 'S1', teams, players, matches, []), message, field)
  }
})

test('News policy migration still rejects changed non-award fields and invented award articles', () => {
  const args = [players, teams, matches, []]
  const original = deriveNews(...args)
  assert(original.length > 0)
  const changed = structuredClone(original)
  changed[0].detail += ' incorrect'
  assert.throws(() => assertNewsPolicy(changed, original, args), /non-award article/)
  const invented = [...original, { id: 'award:first-half-mvp:invented', date: '2026-01-01', matchId: 'm' }]
  assert.throws(() => assertNewsPolicy(invented, original, args))
})
