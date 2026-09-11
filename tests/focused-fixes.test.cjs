const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { teamBestEleven } = require('../src/engine/stats.ts')
const { POSITION_RULES } = require('../src/engine/rating.ts')
const { sortPlayersByPosition } = require('../src/lib/positionOrder.ts')
const { popPlayerEditHistory } = require('../src/lib/playerNavigation.ts')

const positions = ['GK', 'LCB', 'CB', 'RCB', 'LM', 'LCM', 'RCM', 'RM', 'CAM', 'LST', 'RST']
const players = positions.map((position, index) => ({ id: `p${index}`, name: position, position, number: index + 1, teamId: 'A' }))
const match = {
  id: 'latest', season: 'S1', matchDay: 2, date: '2026-09-02', formation: '3-4-1-2', homeTeamId: 'A', awayTeamId: 'B', duration: 90, events: [
    { id: 'sub', type: 'sub', minute: 70, teamId: 'A', playerOutId: 'p9', playerInId: 'bench', position: 'LST' },
  ],
  appearances: [...players.map(player => ({ playerId: player.id, teamId: 'A', position: player.position, matchPosition: player.position, role: 'starter' })), { playerId: 'bench', teamId: 'A', position: 'ST', role: 'bench' }],
}

test('latest 3-4-1-2 kickoff XI has distinct formation coordinates and ignores substitutions', () => {
  const result = teamBestEleven([...players, { id: 'bench', name: 'Bench', position: 'ST', number: 99, teamId: 'A' }], [match], 'A', 'S1')
  assert.equal(result.formation, '3-4-1-2')
  assert.equal(result.slots.length, 11)
  assert.equal(new Set(result.slots.map(slot => slot.playerId)).size, 11)
  assert(!result.slots.some(slot => slot.playerId === 'bench'))
  assert.equal(result.slots.find(slot => slot.playerId === 'p0').slot, 'GK')
  assert.deepEqual(result.slots.filter(slot => ['LCB', 'CB', 'RCB'].includes(slot.slot)).map(slot => slot.slot), ['LCB', 'CB', 'RCB'])
})

test('saved kickoff coordinates win over formation coordinates and legacy matches remain deterministic', () => {
  const saved = { ...match, kickoffLineup: [{ id: 'p0', matchPosition: 'GK', playerId: 'p0', x: 0, y: 1 }] }
  const withSaved = teamBestEleven(players, [saved], 'A', 'S1').slots.find(slot => slot.playerId === 'p0')
  assert.deepEqual({ x: withSaved.x, y: withSaved.y }, { x: 0, y: 1 })
  const legacy = { ...match, formation: undefined }
  const first = teamBestEleven(players, [legacy], 'A', 'S1').slots.map(slot => slot.slot)
  const second = teamBestEleven(players, [legacy], 'A', 'S1').slots.map(slot => slot.slot)
  assert.deepEqual(first, second)
})

test('position sorting is stable, match-aware, and does not mutate players', () => {
  const list = [{ id: 'st', name: 'ST', position: 'ST', number: 9, teamId: 'A' }, { id: 'cm', name: 'CM', position: 'CM', number: 8, teamId: 'A' }, { id: 'gk', name: 'GK', position: 'GK', number: 1, teamId: 'A' }]
  const before = JSON.stringify(list)
  assert.deepEqual(sortPlayersByPosition(list).map(player => player.id), ['gk', 'cm', 'st'])
  assert.deepEqual(sortPlayersByPosition(list, [{ playerId: 'st', teamId: 'A', position: 'ST', matchPosition: 'GK', role: 'bench' }]).map(player => player.id), ['st', 'gk', 'cm'])
  assert.equal(JSON.stringify(list), before)
})

test('edit player completion pops to the existing detail route without duplicates and direct entry is safe', () => {
  const stack = [{ name: 'players' }, { name: 'player', id: 'p1' }, { name: 'edit-player', id: 'p1' }]
  assert.deepEqual(popPlayerEditHistory(stack, 'p1'), [{ name: 'players' }, { name: 'player', id: 'p1' }])
  assert.deepEqual(popPlayerEditHistory([{ name: 'edit-player', id: 'p1' }], 'p1'), [{ name: 'player', id: 'p1' }])
})

test('finalized rating constants replace legacy values', () => {
  assert.equal(POSITION_RULES.ST.goal, .85); assert.equal(POSITION_RULES.SS.goal, .90)
  assert.equal(POSITION_RULES.LM.assist, .65); assert.equal(POSITION_RULES.RM.assist, .65)
  assert.equal(POSITION_RULES.LM.teamGoal, .05); assert.equal(POSITION_RULES.RM.teamGoal, .05)
  assert.equal(POSITION_RULES.CAM.assist, .65)
  assert.equal(POSITION_RULES.CM.goal, 1.05); assert.equal(POSITION_RULES.GK.goal, 1.50)
})

test('DataManagementScreen has Delete All Matches button', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/DataManagementScreen.tsx'), 'utf8')
  assert(source.includes('Delete All Matches'))
})
