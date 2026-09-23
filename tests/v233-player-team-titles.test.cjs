const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { playerTeamTitles } = require('../src/engine/historyReadModels.ts')

const season = 'Season 1'
const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const draw = { id: `champions:${season}`, kind: 'champions-draw', season, teamIds: teams.map(team => team.id) }
const player = { id: 'P1', name: 'Transferred Player', displayName: 'Transferred Player', teamId: 'T2', position: 'ST', number: 9 }
const game = (id, stage, pairingId, teamId, number, goalsFor, goalsAgainst, appearances = []) => ({
  id, season, competitionType: 'champions', competitionStage: stage, competitionPairingId: pairingId, competitionSeriesGame: number, teamId, homeTeamId: teamId, awayTeamId: `Opponent:${id}`, matchDay: number, date: `2026-08-${String(number).padStart(2, '0')}`, duration: 90, appearances,
  events: [...Array.from({ length: goalsFor }, (_, index) => ({ id: `${id}:for:${index}`, type: 'goal', minute: index + 1, teamId })), ...Array.from({ length: goalsAgainst }, (_, index) => ({ id: `${id}:against:${index}`, type: 'goal', minute: index + 30, teamId: `Opponent:${id}` }))],
})
const addSeries = (target, stage, pairingId, first, second, appearances = []) => {
  for (let number = 1; number <= (stage === 'final' ? 2 : 3); number++) {
    target.push(game(`${pairingId}:${first}:${number}`, stage, pairingId, first, number, 1, 0, number === 1 ? appearances : []))
    target.push(game(`${pairingId}:${second}:${number}`, stage, pairingId, second, number, 0, 1))
  }
}

test('a historical champion-team appearance grants a Champions title after a later transfer', () => {
  const matches = []
  for (let index = 0; index < 8; index++) addSeries(matches, 'roundOf16', `roundOf16:${index}`, `T${index * 2 + 1}`, `T${index * 2 + 2}`, index === 0 ? [{ playerId: 'P1', teamId: 'T1', position: 'ST', role: 'starter' }] : [])
  for (let index = 0; index < 4; index++) addSeries(matches, 'quarterFinal', `quarterFinal:${index}`, `T${index * 4 + 1}`, `T${index * 4 + 3}`)
  addSeries(matches, 'semiFinal', 'semiFinal:0', 'T1', 'T5'); addSeries(matches, 'semiFinal', 'semiFinal:1', 'T9', 'T13'); addSeries(matches, 'final', 'final:0', 'T1', 'T9')
  assert.deepEqual(playerTeamTitles(teams, [player], matches, [draw], player.id, season), ['Season 1 Champions'])
})

test('current-team identity cannot create a false historical title and incomplete competitions create none', () => {
  const appearanceForOtherTeam = game('one', 'roundOf16', 'roundOf16:0', 'T1', 1, 1, 0, [{ playerId: 'P1', teamId: 'T2', position: 'ST', role: 'starter' }])
  assert.deepEqual(playerTeamTitles(teams, [player], [appearanceForOtherTeam], [draw], player.id, season), [])
})

test('Player Detail combines derived team titles with existing Awards and selected-season count', () => {
  const detail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  assert(detail.includes('playerTeamTitles'))
  assert(detail.includes('const awards ='))
  assert(detail.includes('Awards {awards.length}'))
  assert.equal(detail.includes('awards.slice(-3)'), false)
})
