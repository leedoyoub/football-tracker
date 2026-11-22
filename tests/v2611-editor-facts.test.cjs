require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { game, save } = require('./helpers/v2610-saves-fixture.cjs')
const { playerSaveCount } = require('../src/engine/playerMatchFacts.ts')
const { teamGoalkeeperSaves, opponentSot } = require('../src/engine/opponentSot.ts')
const { initialOpponentSotDraft, stepOpponentSot } = require('../src/screens/opponentSotWorkflow.ts')
const { editGoalkeeperSaveTotal } = require('../src/screens/goalkeeperSaveEditor.ts')

test('SOT steps build on the latest pending value and retain manual full-time mode', () => {
  let state = initialOpponentSotDraft(undefined, true)
  state = stepOpponentSot(state, 'halftimeOpponentSot', 1)
  assert.deepEqual(state, { halftimeOpponentSot: '1', fulltimeOpponentSot: '1', fulltimeOpponentSotAutoLinked: true })
  for (const direction of [1, 1, -1]) state = stepOpponentSot(state, 'fulltimeOpponentSot', direction)
  assert.deepEqual(state, { halftimeOpponentSot: '1', fulltimeOpponentSot: '2', fulltimeOpponentSotAutoLinked: false })
  const empty = initialOpponentSotDraft(undefined, false)
  assert.equal(stepOpponentSot(empty, 'fulltimeOpponentSot', -1), empty)
  assert.equal(stepOpponentSot(empty, 'fulltimeOpponentSot', 1).fulltimeOpponentSot, '1')
})

test('save totals use official valid GK events and keep each existing event identity and timing', () => {
  const legacy = save('legacy', { sequence: 1 })
  const aggregate = save('aggregate', { minute: undefined, count: 4 })
  const prior = game('game', [legacy, aggregate, save('wrong-role', { minute: 70, count: 8 }),
    { id: 'sub', type: 'sub', teamId: 'A', minute: 60, playerOutId: 'p', playerInId: 'q', position: 'GK' },
    save('replacement-gk', { playerId: 'q', minute: 75, count: 2 })])
  const match = { ...prior, halftimeOpponentSot: 3, fulltimeOpponentSot: 6 }
  const keeper = match.appearances[0]
  match.appearances[1] = { ...match.appearances[1], role: 'bench' }
  assert.equal(playerSaveCount(match, keeper), 5)
  assert.equal(editGoalkeeperSaveTotal(match, keeper, 5, () => 'new'), match.events)
  const lower = editGoalkeeperSaveTotal(match, keeper, 1, () => 'new')
  assert.equal(lower[0], legacy)
  assert.deepEqual(lower[1], { ...aggregate, count: 0 })
  assert.deepEqual(lower.slice(2), match.events.slice(2))
  assert.equal(teamGoalkeeperSaves({ ...match, events: lower }, 'A'), 3)
  const higher = editGoalkeeperSaveTotal({ ...match, events: lower }, keeper, 7, () => 'new')
  assert.deepEqual(higher[1], { ...aggregate, count: 6 })
  assert.equal(teamGoalkeeperSaves({ ...match, events: higher }, 'A'), 9)
  assert.equal(opponentSot({ ...match, events: higher }, 'A'), 6)
})

test('an increment keeps timed legacy events unchanged and creates an independent total adjustment', () => {
  const match = game('timed', [save('timed', { sequence: 3 })])
  const keeper = match.appearances[0]
  const events = editGoalkeeperSaveTotal(match, keeper, 3, () => 'new')
  assert.equal(events[0], match.events[0])
  assert.deepEqual(events[1], { id: 'new', type: 'save', playerId: 'p', teamId: 'A', count: 2 })
  const decreased = editGoalkeeperSaveTotal({ ...match, events }, keeper, 0, () => 'unused')
  assert.deepEqual(decreased, events.map(event => ({ ...event, count: 0 })))
  assert.equal(playerSaveCount({ ...match, events: decreased }, keeper), 0)
  const empty = game('empty')
  assert.deepEqual(editGoalkeeperSaveTotal(empty, empty.appearances[0], 0, () => 'zero'), [{ id: 'zero', type: 'save', playerId: 'p', teamId: 'A', count: 0 }])
})
