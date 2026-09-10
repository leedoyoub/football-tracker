const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { getMatchManOfTheMatch, rateMatch } = require('../src/engine/rating.ts')

const player = (id, position) => ({ id, name: id, displayName: id, teamId: 'A', position, number: 1 })
const goal = (id, minute, playerId, assistPlayerId) => ({ id, type: 'goal', minute, teamId: 'A', playerId, ...(assistPlayerId ? { assistPlayerId } : {}) })
function fixture(leftPosition, rightPosition, leftGoals = 10, rightGoals = 10, extraEvents = []) {
  const left = player('left', leftPosition), right = player('right', rightPosition)
  const events = [...Array.from({ length: leftGoals }, (_, index) => goal(`l${index}`, index + 1, left.id)), ...Array.from({ length: rightGoals }, (_, index) => goal(`r${index}`, index + 20, right.id)), ...extraEvents]
  return { players: [left, right], match: { id: `${leftPosition}:${rightPosition}`, season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [left, right].map(item => ({ playerId: item.id, teamId: 'A', position: item.position, matchPosition: item.position, role: 'starter' })), events } }
}
function equalRawFixture(leftPosition, rightPosition) {
  const value = fixture(leftPosition, rightPosition)
  assert.deepEqual(rateMatch(value.match, value.players).map(row => row.raw), [10, 10])
  return value
}

for (const [higher, lower] of [['GK', 'CB'], ['CB', 'LB'], ['LB', 'CDM'], ['CDM', 'CM'], ['CM', 'LM'], ['LM', 'CAM'], ['CAM', 'LW'], ['LW', 'SS'], ['SS', 'ST']]) test(`MOM equal raw rating prefers ${higher} over ${lower}`, () => {
  const { match, players } = equalRawFixture(higher, lower)
  assert.equal(getMatchManOfTheMatch(match, players), 'left')
})

test('MOM equal-priority tie uses goals before assists and minutes', () => {
  const { match, players } = fixture('LB', 'RB', 5, 4)
  assert.equal(getMatchManOfTheMatch(match, players), 'left')
})

test('MOM equal-priority tie uses assists after goals', () => {
  const { match, players } = fixture('LB', 'RB', 4, 4, [goal('assist', 50, 'other', 'left')])
  assert.equal(getMatchManOfTheMatch(match, players), 'left')
})

test('MOM equal-priority tie uses minutes after goals and assists', () => {
  const { match, players } = fixture('LW', 'RW', 10, 10, [{ id: 'off', type: 'sub', minute: 70, teamId: 'A', playerOutId: 'left', playerInId: 'replacement', position: 'LW' }])
  assert.equal(getMatchManOfTheMatch(match, players), 'right')
})

test('MOM technical fallback is deterministic by player ID', () => {
  const { match, players } = fixture('CB', 'CB', 4, 4)
  assert.equal(getMatchManOfTheMatch(match, players), 'left')
})
