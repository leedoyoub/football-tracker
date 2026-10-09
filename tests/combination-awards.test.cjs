const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { selectBestCombinationForAward } = require('../src/engine/analytics.ts')
const { homeDataStories, seasonRecap } = require('../src/engine/seasonInsights.ts')

function row(key, kind, overrides = {}) {
  return {
    key, kind, playerIds: key.split(':'), teamId: 'T', togetherMinutes: 270, matches: 3, startsTogether: 3,
    goalsFor: 2, goalsAgainst: 1, weightedOpponentSot: 0, onPitchGoalsFor: 2, onPitchGoalsAgainst: 1,
    onPitchGoalDifference: 1, onPitchGoalsForPer90: 0.67, onPitchGoalsAgainstPer90: 0.33, onPitchGoalDifferencePer90: 0.33,
    startingGoalsFor: 0, startingGoalsAgainst: 0, startingCombinedGA: 0, startingGoalInvolvements: 0,
    startingOpponentSot: 0, startingWins: 0, startingDraws: 0, startingLosses: 0, startingCleanSheets: 0,
    goalDifference: 1, combinedGoals: 2, combinedAssists: 0, combinedGA: 2,
    averageRating: 7, wins: 1, draws: 1, losses: 1, cleanSheets: 1, eligible: true,
    ...overrides,
  }
}

test('Best Attack Trio chooses the eligible trio with the highest combined G+A', () => {
  const low = row('P1:P2:P3', 'attack', { togetherMinutes: 270, matches: 3, combinedGA: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 })
  const high = row('P4:P5:P6', 'attack', { togetherMinutes: 180, matches: 2, combinedGA: 2, goalsFor: 2, goalsAgainst: 0, goalDifference: 2 })
  assert.equal(selectBestCombinationForAward([low, high], 'attack').key, high.key)
})

test('combo award selector uses each card metric and preserves existing order for ties', () => {
  const cases = [
    ['duo', row('long', 'duo', { togetherMinutes: 360, goalDifference: 0 }), row('better', 'duo', { togetherMinutes: 180, goalDifference: 2 })],
    ['attack', row('long', 'attack', { togetherMinutes: 360, combinedGA: 1 }), row('better', 'attack', { togetherMinutes: 180, combinedGA: 3 })],
    ['midfield', row('long', 'midfield', { togetherMinutes: 360, averageRating: 7.1 }), row('better', 'midfield', { togetherMinutes: 180, averageRating: 8.2 })],
    ['cb', row('long', 'cb', { togetherMinutes: 360, goalsAgainst: 3 }), row('better', 'cb', { togetherMinutes: 180, goalsAgainst: 1 })],
    ['backFour', row('long', 'backFour', { togetherMinutes: 360, cleanSheets: 1 }), row('better', 'backFour', { togetherMinutes: 180, cleanSheets: 2 })],
  ]
  for (const [kind, first, second] of cases) assert.equal(selectBestCombinationForAward([first, second], kind).key, second.key, `${kind} should rank by its displayed award metric`)
  const tied = row('first', 'attack', { combinedGA: 4 })
  const same = row('second', 'attack', { combinedGA: 4 })
  assert.equal(selectBestCombinationForAward([tied, same], 'attack').key, 'first')
})

test('combo award selector excludes ineligible rows without mutating the Records list', () => {
  const ineligible = row('not-qualified', 'attack', { combinedGA: 99, eligible: false })
  const qualified = row('qualified', 'attack', { combinedGA: 1 })
  const rows = [ineligible, qualified]
  assert.equal(selectBestCombinationForAward(rows, 'attack').key, 'qualified')
  assert.deepEqual(rows, [ineligible, qualified])
})

test('Season Recap chooses the high-G+A eligible trio and preserves the displayed detail', () => {
  const players = [1, 2, 3, 4, 5, 6].map((number, index) => ({ id: `P${number}`, name: `P${number}`, teamId: 'T', teamIds: ['T'], position: ['LW', 'ST', 'RW'][index % 3], number }))
  const fixture = (id, trio, score) => ({
    id, season: 'S1', matchDay: Number(id.slice(1)), date: `2026-01-0${id.slice(1)}`, duration: 90,
    homeTeamId: 'T', awayTeamId: 'O', teamId: 'T', opponentName: 'O',
    appearances: trio.map((playerId, index) => ({ playerId, teamId: 'T', position: ['LW', 'ST', 'RW'][index], matchPosition: ['LW', 'ST', 'RW'][index], role: 'starter' })),
    events: score ? [{ id: `G${id}`, type: 'goal', minute: 10, teamId: 'T', playerId: trio[0] }] : [],
  })
  const matches = [fixture('M1', ['P1', 'P2', 'P3'], 0), fixture('M2', ['P1', 'P2', 'P3'], 0), fixture('M3', ['P1', 'P2', 'P3'], 0), fixture('M4', ['P4', 'P5', 'P6'], 1), fixture('M5', ['P4', 'P5', 'P6'], 1)]
  const award = seasonRecap(players, matches, 'S1', [], [{ id: 'T', name: 'Team' }]).awards.find(item => item.id === 'attack')
  assert.deepEqual(award.playerIds, ['P4', 'P5', 'P6'])
  assert.equal(award.detail, '2 combined G+A')
})

test('Home Best CB insight minimizes displayed GA/90 instead of selecting longest overlap', () => {
  const players = ['A', 'B', 'C', 'D'].map((id, index) => ({ id, name: id, teamId: 'T', teamIds: ['T'], position: 'CB', number: index + 1 }))
  const fixture = (id, pair, goalsFor, goalsAgainst) => ({
    id, season: 'S1', date: `2026-01-0${id.slice(1)}`, duration: 90,
    homeTeamId: 'T', awayTeamId: 'O', teamId: 'T', opponentName: 'O',
    appearances: pair.map(playerId => ({ playerId, teamId: 'T', position: 'CB', matchPosition: 'CB', role: 'starter' })),
    events: [
      ...Array.from({ length: goalsFor }, (_, index) => ({ id: `F${id}${index}`, type: 'goal', minute: 10 + index, teamId: 'O', ownGoal: true })),
      ...Array.from({ length: goalsAgainst }, (_, index) => ({ id: `A${id}${index}`, type: 'goal', minute: 60 + index, teamId: 'O' })),
    ],
  })
  const matches = [fixture('M1', ['A', 'B'], 2, 1), fixture('M2', ['A', 'B'], 1, 1), fixture('M3', ['A', 'B'], 1, 0), fixture('M4', ['C', 'D'], 0, 1), fixture('M5', ['C', 'D'], 0, 0)]
  const insight = homeDataStories(players, matches, 'S1').find(item => item.id.startsWith('cb:'))
  assert.deepEqual(insight.playerIds, ['C', 'D'])
  assert.equal(insight.detail, '0.50 GA/90')
})
