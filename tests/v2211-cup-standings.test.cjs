const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { cupCompetition } = require('../src/engine/competition.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: String.fromCharCode(65 + index), name: `Team ${index + 1}` }))
const result = (teamId, stage, index, win) => ({
  id: `${stage}:${teamId}:${index}`, season: 'S1', competitionType: 'cup', competitionStage: stage, matchDay: index + 1,
  date: `2026-01-${String(index + 1).padStart(2, '0')}`, duration: 90, teamId, homeTeamId: teamId, awayTeamId: `X-${teamId}`,
  appearances: [], events: win ? [{ id: `g:${stage}:${teamId}:${index}`, type: 'goal', minute: 20, teamId }] : [{ id: `g:${stage}:${teamId}:${index}`, type: 'goal', minute: 20, teamId: `X-${teamId}` }],
})

test('Cup rows reset survivors to current-stage totals and freeze eliminated cumulative totals', () => {
  const stage1 = teams.flatMap(team => Array.from({ length: 3 }, (_, index) => result(team.id, 'stage1', index, team.id === 'P' ? index === 0 : team.id === 'O' ? index < 2 : true)))
  const stage2Partial = [result('A', 'stage2', 0, false)]
  const cup = cupCompetition(teams, [...stage1, ...stage2Partial], 'S1')
  assert.equal(cup.stage, 'stage2')
  const survivor = cup.rows.find(row => row.teamId === 'A')
  assert.deepEqual({ played: survivor.played, wins: survivor.wins, losses: survivor.losses, goalsAgainst: survivor.goalsAgainst }, { played: 1, wins: 0, losses: 1, goalsAgainst: 1 })
  const eliminated = cup.rows.find(row => row.teamId === 'O')
  assert.deepEqual({ played: eliminated.played, wins: eliminated.wins, losses: eliminated.losses, goalsAgainst: eliminated.goalsAgainst, eliminatedStage: eliminated.eliminatedStage }, { played: 3, wins: 2, losses: 1, goalsAgainst: 1, eliminatedStage: 1 })
})

test('Cup UI explains current-stage survivor rows and frozen eliminated rows', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  assert(source.includes('Survivors show this Stage; eliminated teams are frozen at elimination.'))
})
