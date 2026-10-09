const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
  filename,
)

const { TACTICAL_SLOT_DEFINITIONS } = require('../src/engine/tacticalSlots.ts')
const { matchdayGroups, sanitizeRecentAssignments } = require('../src/lib/matchdayLineup.ts')
const { moveLineup } = require('../src/screens/matchLineup.ts')

const roster = ids => ids.map((id, index) => ({ id, teamId: 'T', teamIds: ['T'], name: id, number: index + 1, position: index === 0 ? 'GK' : 'CM' }))
const slots = TACTICAL_SLOT_DEFINITIONS.map(slot => slot.id)
const startingLineup = (players, count = 11) => ({
  slotAssignments: Object.fromEntries(players.slice(0, count).map((player, index) => [slots[index], player.id])),
  homeBench: players.slice(count, count + 12).map(player => player.id),
})

test('a released or transferred starter leaves an empty slot and a new player stays Available', () => {
  const originalRoster = roster(Array.from({ length: 23 }, (_, index) => `P${index}`))
  const savedLineup = startingLineup(originalRoster)
  const currentRoster = [...originalRoster.slice(1), ...roster(['NEW'])]
  const sanitized = sanitizeRecentAssignments(savedLineup.slotAssignments, currentRoster)
  const groups = matchdayGroups(currentRoster, { slotAssignments: sanitized, homeBench: savedLineup.homeBench })

  assert.equal(Object.keys(sanitized).length, 10)
  assert.equal(sanitized[slots[0]], undefined)
  assert.equal(groups.starters.length, 10)
  assert.equal(groups.bench.length, 12)
  assert.deepEqual(groups.available.map(player => player.id), ['NEW'])
  assert.deepEqual(Object.values(savedLineup.slotAssignments).slice(0, 11), originalRoster.slice(0, 11).map(player => player.id))
})

test('moving a bench player to an empty starting slot keeps 11 starters and conserves Available', () => {
  const players = roster([...Array.from({ length: 22 }, (_, index) => `P${index}`), 'NEW'])
  const lineup = startingLineup(players, 10)
  const moved = moveLineup(lineup, { group: 'substitute', id: 'P10' }, { group: 'starting', id: slots[10] })
  const groups = matchdayGroups(players, moved)

  assert.equal(groups.starters.length, 11)
  assert.equal(groups.bench.length, 11)
  assert.equal(groups.available.length, 1)
  assert.equal(groups.available[0].id, 'NEW')
  assert.equal(moved.slotAssignments[slots[10]], 'P10')
  assert.equal(moved.homeBench.includes('P10'), false)
})

test('moving an Available player into an empty Bench place makes that player selectable there', () => {
  const players = roster([...Array.from({ length: 22 }, (_, index) => `P${index}`), 'NEW'])
  const lineup = startingLineup(players, 10)
  const movedOff = moveLineup(lineup, { group: 'substitute', id: 'P11' }, { group: 'squad', id: '' })
  const groupsAfterMoveOff = matchdayGroups(players, movedOff)
  assert.equal(groupsAfterMoveOff.bench.length, 11)
  assert.deepEqual(groupsAfterMoveOff.available.map(player => player.id), ['P11', 'NEW'])

  const movedOn = moveLineup(movedOff, { group: 'squad', id: 'NEW' }, { group: 'substitute', id: '' })
  const groupsAfterMoveOn = matchdayGroups(players, movedOn)
  assert.equal(groupsAfterMoveOn.bench.length, 12)
  assert.equal(groupsAfterMoveOn.available.some(player => player.id === 'NEW'), false)
  assert.equal(movedOn.homeBench.at(-1), 'NEW')
})

test('starting, bench, and Available exchanges are atomic and keep every player unique', () => {
  const players = roster([...Array.from({ length: 22 }, (_, index) => `P${index}`), 'NEW'])
  const lineup = startingLineup(players, 10)
  const swappedStarter = moveLineup(lineup, { group: 'starting', id: slots[1] }, { group: 'starting', id: slots[2] })
  assert.equal(swappedStarter.slotAssignments[slots[1]], 'P2')
  assert.equal(swappedStarter.slotAssignments[slots[2]], 'P1')

  const swappedBench = moveLineup(lineup, { group: 'substitute', id: 'P10' }, { group: 'substitute', id: 'P11' })
  assert.equal(swappedBench.homeBench[0], 'P11')
  assert.equal(swappedBench.homeBench[1], 'P10')

  const exchanged = moveLineup(lineup, { group: 'starting', id: slots[1] }, { group: 'squad', id: 'NEW' })
  assert.equal(exchanged.slotAssignments[slots[1]], 'NEW')
  assert.equal(matchdayGroups(players, exchanged).available.some(player => player.id === 'P1'), true)
  const allAssigned = [...Object.values(exchanged.slotAssignments), ...exchanged.homeBench]
  assert.equal(new Set(allAssigned).size, allAssigned.length)
})

test('invalid recent assignments and moves cannot exceed 11 starters or duplicate a player', () => {
  const players = roster(Array.from({ length: 24 }, (_, index) => `P${index}`))
  const tooMany = Object.fromEntries([...slots.slice(0, 11).map((slot, index) => [slot, `P${index}`]), [slots[11], 'P11']])
  const cleaned = sanitizeRecentAssignments(tooMany, players)
  assert.equal(Object.keys(cleaned).length, 11)
  assert.equal(cleaned[slots[11]], undefined)

  const lineup = startingLineup(players)
  const overfull = moveLineup(lineup, { group: 'squad', id: 'P23' }, { group: 'starting', id: slots[11] })
  assert.equal(overfull, lineup)

  const duplicateAttempt = moveLineup(lineup, { group: 'squad', id: 'P0' }, { group: 'starting', id: slots[11] })
  assert.equal(duplicateAttempt, lineup)
})
