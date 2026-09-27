const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const {
  validateManualOpponentSot,
  opponentSot,
  firstHalfOpponentSot,
  secondHalfOpponentSot,
  opponentSotExposure,
} = require('../src/engine/opponentSot.ts')

const keeper = { playerId: 'gk', teamId: 'A', role: 'starter', position: 'GK', matchPosition: 'GK' }
const cb = { playerId: 'cb', teamId: 'A', role: 'starter', position: 'CB', matchPosition: 'CB' }
const game = (overrides = {}) => ({
  id: 'm', season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90,
  teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [keeper, cb], events: [], ...overrides,
})
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)

test('manual Opponent SOT uses HT/FT as the canonical half and full totals', () => {
  const match = game({ halftimeOpponentSot: 3, fulltimeOpponentSot: 7 })
  assert.deepEqual(validateManualOpponentSot(match, 'A'), { kind: 'manual', halftime: 3, fulltime: 7 })
  assert.equal(firstHalfOpponentSot(match, 'A'), 3)
  assert.equal(secondHalfOpponentSot(match, 'A'), 4)
  assert.equal(opponentSot(match, 'A'), 7)
})

test('manual SOT validates FT ordering and each conceded-goal half boundary', () => {
  assert.equal(validateManualOpponentSot(game({ halftimeOpponentSot: 4, fulltimeOpponentSot: 3 }), 'A').kind, 'invalid')
  assert.equal(validateManualOpponentSot(game({ halftimeOpponentSot: 0, fulltimeOpponentSot: 1, events: [{ id: 'first', type: 'goal', minute: 45, teamId: 'B' }] }), 'A').kind, 'invalid')
  assert.equal(validateManualOpponentSot(game({ halftimeOpponentSot: 1, fulltimeOpponentSot: 1, events: [{ id: 'late', type: 'goal', minute: 70, teamId: 'B' }] }), 'A').kind, 'invalid')
  assert.equal(validateManualOpponentSot(game({ halftimeOpponentSot: 0, fulltimeOpponentSot: 0 }), 'A').kind, 'manual')
})

test('incomplete and absent manual SOT use the exact legacy proxy while complete manual SOT does not add goals again', () => {
  const legacy = game({ events: [{ id: 'save', type: 'save', minute: 20, teamId: 'A', playerId: 'gk', count: 2 }, { id: 'goal', type: 'goal', minute: 30, teamId: 'B' }] })
  assert.equal(validateManualOpponentSot(game({ halftimeOpponentSot: 4, events: legacy.events }), 'A').kind, 'legacy')
  assert.equal(opponentSot(legacy, 'A'), 3)
  assert.equal(opponentSot(game({ halftimeOpponentSot: 4, fulltimeOpponentSot: 6, events: legacy.events }), 'A'), 6)
})

test('manual SOT exposure uses regulation-clipped half overlap', () => {
  const match = game({ halftimeOpponentSot: 2, fulltimeOpponentSot: 8 })
  near(opponentSotExposure(match, 'A', 0, 60), 4)
  near(opponentSotExposure(match, 'A', 70, 90), 6 * 20 / 45)
  near(opponentSotExposure(match, 'A', 90, 105), 0)
})
