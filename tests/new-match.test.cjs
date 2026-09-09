const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { moveLineup, moveSubstitution } = require('../src/screens/matchLineup.ts')

const baseline = () => ({ slotAssignments: { GK: 'gk', CM: 'cm', ST: 'st' }, homeBench: ['bench'], events: [], positionHistories: {}, checkpoint: { slotAssignments: { GK: 'gk', CM: 'cm', ST: 'st' }, homeBench: ['bench'] } })
const positions = { GK: 'GK', CM: 'CM', CAM: 'CAM', ST: 'ST' }

test('Log Match source has no drag-and-drop surfaces and uses tap targets', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(!source.includes('@dnd-kit') && !source.includes('DndContext') && !source.includes('useDraggable') && !source.includes('useDroppable'))
  assert(!source.includes('externalDnd') && !source.includes('onSlotDrop') && !source.includes('draggable={true}'))
  assert(source.includes('selectStartingTarget') && source.includes('onEmptySlotClick') && source.includes('RosterPlayerGroup'))
  assert(source.includes('draggable={false}'))
})

test('two taps swap starters, tapping the same target is a no-op, and an empty slot moves a player', () => {
  const draft = baseline()
  const swapped = moveLineup(draft, { group: 'starting', id: 'CM' }, { group: 'starting', id: 'ST' })
  assert.deepEqual(swapped.slotAssignments, { GK: 'gk', CM: 'st', ST: 'cm' })
  assert.equal(moveLineup(draft, { group: 'starting', id: 'CM' }, { group: 'starting', id: 'CM' }), draft)
  const moved = moveLineup(draft, { group: 'starting', id: 'CM' }, { group: 'starting', id: 'CAM' })
  assert.equal(moved.slotAssignments.CAM, 'cm')
  assert.equal(moved.slotAssignments.CM, undefined)
})

test('tap-only active substitutions retain the entered minute and position timeline through 99', () => {
  const draft = baseline()
  const changed = moveSubstitution(draft, { group: 'starting', id: 'CM' }, { group: 'starting', id: 'CAM' }, draft.slotAssignments, positions, 99, 'A', () => 'change')
  assert.equal(changed.positionHistories.cm[0].minute, 99)
  assert.equal(changed.positionHistories.cm[0].position, 'CAM')
  const substituted = moveSubstitution(draft, { group: 'starting', id: 'ST' }, { group: 'substitute', id: 'bench' }, draft.slotAssignments, positions, 99, 'A', () => 'sub')
  assert.deepEqual(substituted.events.map(event => [event.type, event.minute, event.playerOutId, event.playerInId]), [['sub', 99, 'st', 'bench']])
  assert.equal(moveSubstitution(draft, { group: 'starting', id: 'ST' }, { group: 'substitute', id: 'bench' }, draft.slotAssignments, positions, 100, 'A', () => 'bad'), draft)
})

test('minute inputs accept 90 through 99 and reject 100 while event history remains chronological', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes('liveMinute <= 99') && source.includes('Number(subEditMinute) > 99'))
  const events = [{ minute: 99 }, { minute: 89 }, { minute: 93 }].sort((a, b) => a.minute - b.minute)
  assert.deepEqual(events.map(event => event.minute), [89, 93, 99])
})
