const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { playerSeasonStats } = require('../src/engine/stats.ts')
const { derivePlayerScope, playerAppearanceMatches } = require('../src/engine/playerDerived.ts')
const { deserializeCloudEntity } = require('../src/lib/cloudMatch.ts')

const player = { id: 'P1', name: 'Player', displayName: 'Player', number: 9, position: 'ST', teamId: 'NEW', teamIds: ['NEW'] }
const match = (id, overrides = {}) => ({
  id, season: 'Season 1', teamId: 'OLD', homeTeamId: 'OLD', awayTeamId: 'OPP', competitionType: 'league', competitionStage: 'regular', matchDay: 4,
  competitionAssignment: { competitionType: 'cup', season: 'Season 1', teamId: 'OLD', stage: 'stage1', matchDay: 1, opponentTeamId: 'OPP' },
  date: '2026-09-20', duration: 90, appearances: [{ playerId: 'P1', teamId: 'OLD', role: 'starter', position: 'ST', minuteIn: 0, minuteOut: 18 }], events: [{ id: 'g', type: 'goal', minute: 10, teamId: 'OLD', playerId: 'P1', assistPlayerId: 'P1' }], ...overrides,
})

test('v2.2.13 competition scopes use the valid assignment rather than conflicting legacy fields', () => {
  const stats = playerSeasonStats(player, [player], [match('cup')], 'Season 1', undefined, 'cup')
  assert.equal(stats.matches, 1)
  assert.equal(stats.goals, 1)
  assert.equal(stats.assists, 1)
  const derived = derivePlayerScope(player, [player], [match('cup')], { season: 'Season 1', competition: 'cup' })
  assert.equal(derived.apps, 1)
})

test('v2.2.13 player history follows actual appearances across team stints and excludes current-team DNP matches', () => {
  const oldAppearance = match('old-appearance')
  const newTeamDnp = match('new-dnp', { teamId: 'NEW', homeTeamId: 'NEW', appearances: [] })
  assert.deepEqual(playerAppearanceMatches(player, [oldAppearance, newTeamDnp]).map(row => row.id), ['old-appearance'])
})

test('v2.2.13 cloud hydration applies only deterministic competition metadata repair', () => {
  const corrupted = match('cloud-corrupt', { matchDay: 4, events: [{ id: 'g', type: 'goal', minute: 10, teamId: 'OLD', playerId: 'P1' }] })
  const hydrated = deserializeCloudEntity(corrupted)
  assert.equal(hydrated.matchDay, 1)
  assert.equal(hydrated.competitionAssignment.matchDay, 1)
  assert.deepEqual(hydrated.events, corrupted.events)
})
