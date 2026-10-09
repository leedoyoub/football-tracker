const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  filename,
)

const { leagueSlotConflict } = require('../src/engine/competition.ts')

const game = (id, teamId, matchDay, season = 'S1', competitionType = 'league') => ({
  id, season, competitionType, competitionStage: 'regular', matchDay, date: '2026-01-01', duration: 90,
  teamId, homeTeamId: teamId, awayTeamId: `OPP-${id}`, competitionAssignment: { competitionType, season, stage: 'regular', teamId, matchDay },
  appearances: [], events: [],
})

test('League slots conflict only for the same canonical season, team and MatchDay', () => {
  const existing = game('M1', 'T1', 4)
  assert.equal(leagueSlotConflict([existing], game('M2', 'T1', 4)), existing)
  assert.equal(leagueSlotConflict([existing], game('M1', 'T1', 4), 'M1'), undefined)
  assert.equal(leagueSlotConflict([existing], game('M2', 'T1', 5)), undefined)
  assert.equal(leagueSlotConflict([existing], game('M2', 'T2', 4)), undefined)
  assert.equal(leagueSlotConflict([existing], game('M2', 'T1', 4, 'S2')), undefined)
})

test('legacy direct fixtures occupy both League teams and knockout games use their existing rules', () => {
  const legacy = { ...game('OLD', 'T1', 3), teamId: undefined, homeTeamId: 'T1', awayTeamId: 'T2', competitionAssignment: undefined }
  assert.equal(leagueSlotConflict([legacy], game('NEW', 'T2', 3)), legacy)
  assert.equal(leagueSlotConflict([game('CUP', 'T1', 3, 'S1', 'cup')], game('OTHER', 'T1', 3, 'S1', 'cup')), undefined)
})

test('durable match save checks the latest Store transaction state and excludes only same-ID edits', () => {
  const source = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  const start = source.indexOf('const saveMatchDurably')
  const end = source.indexOf('const saveDraftMatch', start)
  const saveBoundary = source.slice(start, end)
  assert.match(saveBoundary, /transactions\.commit\(current => \{[\s\S]*leagueSlotConflict\(prior\.matches, saved, saved\.id\)/)
  assert.match(saveBoundary, /if \(duplicateLeagueSlot\) throw new Error/)
})
