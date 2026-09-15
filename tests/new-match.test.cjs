const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { allowsGoalkeeperLineupMove, moveLineup, moveSubstitution } = require('../src/screens/matchLineup.ts')

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

test('before kickoff, a real goalkeeper can exchange only with the GK slot', () => {
  const draft = baseline()
  draft.homeBench = ['backup', 'cb']
  const positions = { gk: 'GK', backup: 'GK', cb: 'CB', cm: 'CM', st: 'ST' }
  const slots = { GK: 'GK', CM: 'CM', ST: 'ST' }
  const source = { group: 'starting', id: 'GK' }
  const backup = { group: 'substitute', id: 'backup' }
  const centreBack = { group: 'substitute', id: 'cb' }
  assert.equal(allowsGoalkeeperLineupMove(source, backup, draft, slots, positions, 'pre-kickoff'), true)
  const swapped = moveLineup(draft, source, backup)
  assert.equal(swapped.slotAssignments.GK, 'backup')
  assert.deepEqual(swapped.homeBench, ['gk', 'cb'])
  assert.equal(allowsGoalkeeperLineupMove(source, centreBack, draft, slots, positions, 'pre-kickoff'), false)
  assert.equal(allowsGoalkeeperLineupMove(backup, { group: 'starting', id: 'CM' }, draft, slots, positions, 'pre-kickoff'), false)
})

test('once kickoff is committed, every goalkeeper substitution or tactical move remains locked', () => {
  const draft = baseline()
  draft.homeBench = ['backup', 'cb']
  const positions = { gk: 'GK', backup: 'GK', cb: 'CB', cm: 'CM', st: 'ST' }
  const slots = { GK: 'GK', CM: 'CM', ST: 'ST' }
  for (const [source, target] of [
    [{ group: 'starting', id: 'GK' }, { group: 'substitute', id: 'backup' }],
    [{ group: 'starting', id: 'GK' }, { group: 'starting', id: 'CM' }],
    [{ group: 'substitute', id: 'backup' }, { group: 'starting', id: 'GK' }],
    [{ group: 'starting', id: 'CM' }, { group: 'starting', id: 'GK' }],
  ]) assert.equal(allowsGoalkeeperLineupMove(source, target, draft, slots, positions, 'in-match'), false)
  const source = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(source.includes("const lineupLocked = step === 1 || matchDraft.events.length > 0"))
  assert(source.includes('aria-label="Total saves"'))
})

test('exact restored tactical assignments can change only the pre-kickoff goalkeeper', () => {
  const draft = { slotAssignments: { GK: 'keeper-a', LB: 'lb', LCB: 'lcb', RCB: 'rcb', RB: 'rb', LCM: 'lcm', CM: 'cm', RCM: 'rcm', LW: 'lw', ST: 'st', RW: 'rw' }, homeBench: ['keeper-b'], events: [], positionHistories: {} }
  const slots = Object.fromEntries(Object.keys(draft.slotAssignments).map(id => [id, id === 'GK' ? 'GK' : 'CM']))
  const positions = Object.fromEntries([...Object.values(draft.slotAssignments), 'keeper-b'].map(id => [id, id.startsWith('keeper') ? 'GK' : 'CM']))
  const swapped = moveLineup(draft, { group: 'starting', id: 'GK' }, { group: 'substitute', id: 'keeper-b' })
  assert.equal(allowsGoalkeeperLineupMove({ group: 'starting', id: 'GK' }, { group: 'substitute', id: 'keeper-b' }, draft, slots, positions, 'pre-kickoff'), true)
  assert.equal(swapped.slotAssignments.GK, 'keeper-b')
  for (const slot of Object.keys(draft.slotAssignments).filter(slot => slot !== 'GK')) assert.equal(swapped.slotAssignments[slot], draft.slotAssignments[slot])
})
