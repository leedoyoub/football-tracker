const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { competitionAssignment, championsCompetition, reconcileChampionsPairingIds } = require('../src/engine/competition.ts')
const { competitionIdentityForMatch } = require('../src/engine/competitionContext.ts')

const season = 'Season 1'
const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index}`, name: `T${index}` }))
const draw = { id: `champions:${season}`, kind: 'champions-draw', season, teamIds: teams.map(team => team.id) }
const game = (id, overrides = {}) => ({ id, season, competitionType: 'champions', competitionStage: 'roundOf16', competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1, teamId: 'T0', homeTeamId: 'T0', awayTeamId: `O${id}`, matchDay: 1, date: '2026-09-18', duration: 90, appearances: [], events: [], ...overrides })

test('v2.2.9 uniquely inferred frozen R16 pairing remains visible to canonical next-slot assignment', () => {
  const saved = game('g1', { competitionPairingId: 'legacy-wrong', competitionAssignment: { competitionType: 'champions', season, teamId: 'T0', stage: 'roundOf16', pairingId: 'roundOf16:0', seriesGame: 1, matchDay: 1 } })
  const assignment = competitionAssignment('champions', season, 'T0', teams, [saved], draw, [])
  assert.equal(assignment.available, true)
  assert.equal(assignment.seriesGame, 2)
  assert.equal(assignment.pairingId, 'roundOf16:0')
})

test('v2.2.9 malformed same-team series identity fails closed rather than reopening Champions Game 1', () => {
  const malformed = [game('g1'), game('g2')]
  const status = championsCompetition(draw, malformed, season, [])
  assert.match(status.rounds.roundOf16[0].integrityError, /data-integrity warning/i)
  const assignment = competitionAssignment('champions', season, 'T0', teams, malformed, draw, [])
  assert.equal(assignment.available, false)
  assert.match(assignment.message, /data-integrity warning/i)
})

test('v2.2.13 pairing reconciliation atomically synchronizes a stale valid Champions snapshot', () => {
  const stale = game('g1', {
    competitionPairingId: 'roundOf16:7',
    competitionAssignment: { competitionType: 'champions', season, teamId: 'T0', stage: 'roundOf16', pairingId: 'roundOf16:7', seriesGame: 1, matchDay: 1 },
  })
  const repaired = reconcileChampionsPairingIds([stale], [draw])[0]
  assert.equal(repaired.competitionPairingId, 'roundOf16:0')
  assert.equal(repaired.competitionAssignment.pairingId, 'roundOf16:0')
  assert.equal(competitionIdentityForMatch(repaired).pairingId, 'roundOf16:0')
})
