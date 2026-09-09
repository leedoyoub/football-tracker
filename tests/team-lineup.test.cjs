const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { teamBestEleven } = require('../src/engine/stats.ts')
const { FORMATION_SLOTS, formationSlotsFor } = require('../src/components/Pitch.tsx')

const kickoffPositions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'ST', 'RW']
const wrongDefaults = ['ST', 'RW', 'CAM', 'CM', 'LW', 'CB', 'ST', 'LB', 'RB', 'CDM', 'GK']
const bayernPlayers = kickoffPositions.map((matchPosition, index) => ({
  id: `bayern-${index}`,
  name: `Player ${index}`,
  position: wrongDefaults[index],
  number: index + 1,
  teamId: 'BAYERN',
  matchPosition,
}))
const bayernMatch = {
  id: 'bayern-latest', season: '2026', matchDay: 4, date: '2026-09-08', formation: '4-2-1-3',
  homeTeamId: 'BAYERN', awayTeamId: 'OPP', duration: 90, events: [
    { id: 'later-sub', type: 'sub', minute: 60, teamId: 'BAYERN', playerOutId: 'bayern-9', playerInId: 'bench', position: 'ST' },
  ],
  appearances: [
    ...bayernPlayers.map(player => ({ playerId: player.id, teamId: 'BAYERN', position: player.position, matchPosition: player.matchPosition, role: 'starter' })),
    { playerId: 'bench', teamId: 'BAYERN', position: 'ST', matchPosition: 'ST', role: 'bench' },
  ],
  // The two centre-backs deliberately contain the same legacy slot and point.
  kickoffLineup: [
    { id: 'LCB', matchPosition: 'CB', playerId: 'bayern-2', x: .32, y: .75 },
    { id: 'LCB', matchPosition: 'CB', playerId: 'bayern-3', x: .32, y: .75 },
  ],
}

function bayernResult() {
  return teamBestEleven([...bayernPlayers, { id: 'bench', name: 'Bench', position: 'ST', number: 99, teamId: 'BAYERN' }], [bayernMatch], 'BAYERN', '2026')
}

test('Bayern 4-2-1-3 kickoff XI is unique, non-overlapping, and tactically row-correct', () => {
  const result = bayernResult()
  assert.equal(result.slots.length, 11)
  assert.equal(new Set(result.slots.map(slot => slot.playerId)).size, 11)
  assert.equal(new Set(result.slots.map(slot => slot.slot)).size, 11)
  assert(!result.slots.some(slot => slot.playerId === 'bench'))

  const points = Object.fromEntries(FORMATION_SLOTS['4-2-1-3'].map(slot => [slot.slot, `${slot.x},${slot.y}`]))
  const renderedPoints = result.slots.map(slot => slot.x === undefined ? points[slot.slot] : `${slot.x <= 1 ? slot.x * 100 : slot.x},${slot.y <= 1 ? slot.y * 100 : slot.y}`)
  assert.equal(new Set(renderedPoints).size, 11)
  assert.deepEqual(new Set(result.slots.filter(slot => ['LB', 'LCB', 'RCB', 'RB'].includes(slot.slot)).map(slot => slot.playerId)), new Set(['bayern-1', 'bayern-2', 'bayern-3', 'bayern-4']))
  assert.deepEqual(new Set(result.slots.filter(slot => ['LDM', 'RDM'].includes(slot.slot)).map(slot => slot.playerId)), new Set(['bayern-5', 'bayern-6']))
  assert.equal(result.slots.find(slot => slot.slot === 'CAM').playerId, 'bayern-7')
  assert.deepEqual(new Set(result.slots.filter(slot => ['LW', 'ST', 'RW'].includes(slot.slot)).map(slot => slot.playerId)), new Set(['bayern-8', 'bayern-9', 'bayern-10']))
  assert.equal(result.slots.find(slot => slot.slot === 'GK').playerId, 'bayern-0')
})

test('saved kickoff matchPosition overrides every current/default player position and preserves sides', () => {
  const slots = bayernResult().slots
  assert.equal(slots.find(slot => slot.playerId === 'bayern-1').slot, 'LB')
  assert.equal(slots.find(slot => slot.playerId === 'bayern-4').slot, 'RB')
  assert(['LDM', 'RDM'].includes(slots.find(slot => slot.playerId === 'bayern-5').slot))
  assert(['LDM', 'RDM'].includes(slots.find(slot => slot.playerId === 'bayern-6').slot))
  assert.equal(slots.find(slot => slot.playerId === 'bayern-7').slot, 'CAM')
  assert.equal(slots.find(slot => slot.playerId === 'bayern-8').slot, 'LW')
  assert.equal(slots.find(slot => slot.playerId === 'bayern-9').slot, 'ST')
  assert.equal(slots.find(slot => slot.playerId === 'bayern-10').slot, 'RW')
})

test('duplicate saved slots and coordinates are resolved without mutating the historical match', () => {
  const before = JSON.stringify(bayernMatch)
  const first = bayernResult().slots
  const second = bayernResult().slots
  assert.deepEqual(first, second)
  assert.equal(new Set(first.map(slot => slot.slot)).size, 11)
  assert.equal(first.filter(slot => slot.x === .32 && slot.y === .75).length, 1)
  assert.equal(JSON.stringify(bayernMatch), before)
})

test('every supported and generated formation contains eleven unique slot IDs and coordinates', () => {
  for (const slots of Object.values(FORMATION_SLOTS)) {
    assert.equal(slots.length, 11)
    assert.equal(new Set(slots.map(slot => slot.slot)).size, 11)
    assert.equal(new Set(slots.map(slot => `${slot.x},${slot.y}`)).size, 11)
  }
  for (const name of ['4-2-1-3', '4-3-3', '4-2-3-1', '4-4-2', '3-4-1-2', '3-5-2', '4-1-2-3', '4-3-1-2']) {
    const slots = formationSlotsFor(name)
    assert.equal(slots.length, 11, name)
    assert.equal(new Set(slots.map(slot => slot.slot)).size, 11, name)
    assert.equal(new Set(slots.map(slot => `${slot.x},${slot.y}`)).size, 11, name)
  }
})
