const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { championsCompetition, compareChampionsSeriesRow, competitionAssignment } = require('../src/engine/competition.ts')
const { compareStandings } = require('../src/engine/standings.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const draw = { id: 'champions:Season 1', season: 'Season 1', kind: 'champions-draw', teamIds: teams.map(team => team.id) }

function championsGame(id, stage, pairingId, teamId, number, goalsFor, goalsAgainst) {
  const opponent = `actual-opponent:${id}`
  return {
    id, season: 'Season 1', competitionType: 'champions', competitionStage: stage, competitionPairingId: pairingId, competitionSeriesGame: number,
    teamId, homeTeamId: teamId, awayTeamId: opponent, matchDay: 1, date: `2026-01-${String(number).padStart(2, '0')}`, duration: 90, appearances: [],
    events: [
      ...Array.from({ length: goalsFor }, (_, index) => ({ id: `${id}:for:${index}`, type: 'goal', minute: index + 1, teamId })),
      ...Array.from({ length: goalsAgainst }, (_, index) => ({ id: `${id}:against:${index}`, type: 'goal', minute: index + 20, teamId: opponent })),
    ],
  }
}

function addSeries(target, stage, pairingId, firstId, secondId, firstScores = [[1, 0], [1, 0], [1, 0]], secondScores = [[0, 1], [0, 1], [0, 1]]) {
  firstScores.forEach(([goalsFor, goalsAgainst], index) => target.push(championsGame(`${pairingId}:${firstId}:${index + 1}`, stage, pairingId, firstId, index + 1, goalsFor, goalsAgainst)))
  secondScores.forEach(([goalsFor, goalsAgainst], index) => target.push(championsGame(`${pairingId}:${secondId}:${index + 1}`, stage, pairingId, secondId, index + 1, goalsFor, goalsAgainst)))
}

test('Champions comparison series uses independent full-match rows and advances the 2-1 row winner', () => {
  const matches = []
  addSeries(matches, 'roundOf16', 'roundOf16:0', 'T1', 'T2', [[3, 2], [2, 0], [1, 1]], [[1, 1], [0, 1], [4, 1]])
  const pairing = championsCompetition(draw, matches, 'Season 1').rounds.roundOf16[0]
  assert.deepEqual(pairing.teamGames.T1.map(match => match.awayTeamId), ['actual-opponent:roundOf16:0:T1:1', 'actual-opponent:roundOf16:0:T1:2', 'actual-opponent:roundOf16:0:T1:3'])
  assert.deepEqual(pairing.rowWinners, ['T1', 'T1', 'T2'])
  assert.equal(pairing.winnerId, 'T1')
  assert.equal(competitionAssignment('champions', 'Season 1', 'T1', teams, matches, draw).available, false)
})

test('Champions row comparison prioritizes result quality, then GD and goals scored', () => {
  const a = championsGame('a', 'roundOf16', 'roundOf16:0', 'T1', 1, 1, 0)
  const b = championsGame('b', 'roundOf16', 'roundOf16:0', 'T2', 1, 4, 2)
  assert.equal(compareChampionsSeriesRow('T1', a, 'T2', b, []), 'T2', 'both won, but +2 beats +1 GD')
  const c = championsGame('c', 'roundOf16', 'roundOf16:0', 'T1', 1, 2, 0)
  const d = championsGame('d', 'roundOf16', 'roundOf16:0', 'T2', 1, 3, 1)
  assert.equal(compareChampionsSeriesRow('T1', c, 'T2', d, []), 'T2', 'equal GD is broken by more goals scored')
})

test('Champions never resolves an incomplete series and final is exactly two games per team with no replay', () => {
  const incomplete = []
  addSeries(incomplete, 'roundOf16', 'roundOf16:0', 'T1', 'T2', [[1, 0], [1, 0], [1, 0]], [[0, 1], [0, 1]])
  const partial = championsCompetition(draw, incomplete, 'Season 1').rounds.roundOf16[0]
  assert.equal(partial.winnerId, undefined)
  assert.equal(partial.requiredMatches, 3)

  const matches = []
  for (let index = 0; index < 8; index++) addSeries(matches, 'roundOf16', `roundOf16:${index}`, `T${index * 2 + 1}`, `T${index * 2 + 2}`)
  for (let index = 0; index < 4; index++) addSeries(matches, 'quarterFinal', `quarterFinal:${index}`, `T${index * 4 + 1}`, `T${index * 4 + 3}`)
  addSeries(matches, 'semiFinal', 'semiFinal:0', 'T1', 'T5')
  addSeries(matches, 'semiFinal', 'semiFinal:1', 'T9', 'T13')
  addSeries(matches, 'final', 'final:0', 'T1', 'T9', [[2, 1], [1, 0]], [[1, 2], [0, 1]])
  const champions = championsCompetition(draw, matches, 'Season 1')
  assert.equal(champions.rounds.final[0].requiredMatches, 2)
  assert.equal(champions.rounds.final[0].teamGames.T1.length, 2)
  assert.equal(champions.rounds.final[0].teamGames.T9.length, 2)
  assert.equal(champions.currentStage, 'final')
  assert.equal(champions.championId, 'T1')
  assert.equal(competitionAssignment('champions', 'Season 1', 'T1', teams, matches, draw).available, false)
})

test('League and Cup standings share the complete deterministic tie-break order', () => {
  const base = { rank: 0, played: 4, draws: 0, losses: 0, goalsAgainst: 2 }
  const a = { ...base, teamId: 'A', points: 9, wins: 3, goalsFor: 8, goalDifference: 6 }
  const b = { ...base, teamId: 'B', points: 9, wins: 2, goalsFor: 8, goalDifference: 6 }
  const c = { ...base, teamId: 'C', points: 9, wins: 3, goalsFor: 8, goalDifference: 6 }
  const metrics = new Map([['A', { averageRating: 7.1, opponentShotsOnTarget: 8 }], ['B', { averageRating: 9, opponentShotsOnTarget: 1 }], ['C', { averageRating: 7.1, opponentShotsOnTarget: 7 }]])
  assert(compareStandings(a, b, metrics) < 0, 'wins are considered before rating')
  assert(compareStandings(c, a, metrics) < 0, 'lower SOT follows average rating')
})

test('v2.1.8 UI uses full score cells, full Best Player names, and scoped Log Match overflow protection', () => {
  const bracket = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const detail = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  const newMatch = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(bracket.includes('pairing.requiredMatches') && bracket.includes('`${home ? value.home : value.away}-${home ? value.away : value.home}`'))
  assert(detail.includes('playerFullName') && detail.includes('playerFullName as playerDisplayName'))
  assert(newMatch.includes('touch-pan-y') && newMatch.includes('overflow-x-hidden'))
})
