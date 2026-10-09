const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { auditDataIntegrity } = require('../src/engine/integrity.ts')

test('integrity findings identify the problem class and affected stable IDs without mutating source data', () => {
  const match = { id: 'MISSING-PLAYER-MATCH', season: 'S1', matchDay: 1, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [{ playerId: 'P-LOST', teamId: 'A', position: 'CM', matchPosition: 'CM', role: 'starter' }], events: [] }
  const before = JSON.stringify(match)
  const report = auditDataIntegrity([match], [], [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }])
  const issue = report.issues.find(item => item.code === 'match.missing_player_reference')
  assert.equal(issue.severity, 'error')
  assert.equal(issue.entityType, 'match')
  assert.equal(issue.entityId, 'MISSING-PLAYER-MATCH')
  assert.deepEqual(issue.relatedIds, ['P-LOST'])
  assert(issue.impact)
  assert(issue.safeAction)
  assert.equal(JSON.stringify(match), before)
})

test('integrity audit reports an over-capacity roster as a diagnostic and does not rewrite it', () => {
  const players = Array.from({ length: 24 }, (_, index) => ({ id: `P${index}`, name: `Player ${index}`, teamId: 'A', teamIds: ['A'], position: 'CM', number: index + 1 }))
  const before = JSON.stringify(players)
  const report = auditDataIntegrity([], players, [{ id: 'A', name: 'A' }])
  assert(report.issues.some(item => item.code === 'player.roster_capacity_exceeded' && item.entityId === 'A'))
  assert.equal(JSON.stringify(players), before)
})

test('all audit findings retain the legacy severity and message while adding stable diagnostic metadata', () => {
  const report = auditDataIntegrity([], [{ id: 'P', name: 'P', teamId: 'UNKNOWN', teamIds: ['UNKNOWN'], position: 'CM', number: 1 }], [{ id: 'A', name: 'A' }])
  const issue = report.issues.find(item => item.message.includes('unknown current team'))
  assert.equal(issue.code, 'player.unknown_team')
  assert.equal(issue.entityType, 'player')
  assert.equal(issue.entityId, 'P')
  assert.deepEqual(issue.relatedIds, ['UNKNOWN'])
})
