const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { championsCompetition, projectChampionsBracket, competitionAssignment } = require('../src/engine/competition.ts')

const season = 'Season 1'
const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const draw = { id: `champions:${season}`, kind: 'champions-draw', season, teamIds: teams.map(team => team.id) }
const game = (id, teamId, number, goalsFor, goalsAgainst) => ({
  id, season, competitionType: 'champions', competitionStage: 'roundOf16', competitionPairingId: `roundOf16:${teamId === 'T1' || teamId === 'T2' ? 0 : 1}`,
  competitionSeriesGame: number, teamId, homeTeamId: teamId, awayTeamId: `Opponent:${id}`, matchDay: number, date: `2026-09-0${number}`, duration: 90, appearances: [],
  events: [...Array.from({ length: goalsFor }, (_, index) => ({ id: `${id}:for:${index}`, type: 'goal', minute: index + 1, teamId })), ...Array.from({ length: goalsAgainst }, (_, index) => ({ id: `${id}:against:${index}`, type: 'goal', minute: index + 20, teamId: `Opponent:${id}` }))],
})

test('Champions resolves only completed same-game rows and projects downstream slots without advancing authority', () => {
  const matches = [
    game('a1', 'T1', 1, 2, 0), game('b1', 'T2', 1, 0, 1),
    game('a2', 'T1', 2, 1, 0), game('b2', 'T2', 2, 0, 1),
    game('a3', 'T1', 3, 1, 0), game('b3', 'T2', 3, 0, 1),
  ]
  const partial = championsCompetition(draw, matches.slice(0, 2), season)
  assert.deepEqual(partial.rounds.roundOf16[0].rowWinners, ['T1', undefined, undefined])
  assert.equal(partial.rounds.roundOf16[0].winnerId, undefined)
  assert.deepEqual(projectChampionsBracket(partial.rounds).quarterFinal[0], ['TBD', 'TBD'])

  const fullFirstPair = championsCompetition(draw, matches, season)
  assert.deepEqual(fullFirstPair.rounds.roundOf16[0].rowWinners, ['T1', 'T1', 'T1'])
  assert.equal(fullFirstPair.rounds.roundOf16[0].winnerId, 'T1')
  assert.deepEqual(projectChampionsBracket(fullFirstPair.rounds).quarterFinal[0], ['T1', 'TBD'])
  assert.equal(competitionAssignment('champions', season, 'T1', teams, matches, draw).available, false)
})

test('Champions projection follows fixed pair ordering and the bracket preserves neutral projected UI state', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert(source.includes('projectChampionsBracket'))
  assert(source.includes('resultTone'))
  assert(home.includes('resultTone'))
  assert(source.includes("'TBD'"))
})

test('Champions selects stage matches once per round before evaluating pairings', () => {
  const source = fs.readFileSync(require.resolve('../src/engine/competition.ts'), 'utf8')
  const makeRound = source.slice(source.indexOf('function makeRound'), source.indexOf('export function championsCompetition'))
  assert(makeRound.indexOf('const stageGames = competitionStageMatches') < makeRound.indexOf('return Array.from'))
  assert.equal(makeRound.includes('stageGames.map('), false)
  assert.equal(makeRound.includes('stageGames.some('), false)
})
