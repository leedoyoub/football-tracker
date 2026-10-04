const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { kickoffFromAssignments } = require('../src/engine/kickoffLineup.ts')
const starters = { GK: 'gk', LB: 'lb', LCB: 'lcb', RCB: 'rcb', RB: 'rb', LDM: 'ldm', RDM: 'rdm', LCAM: 'A', CAM: 'B', RCAM: 'C', ST: 'st' }
const kickoff = kickoffFromAssignments(starters)
const players = [...kickoff.map(s => ({ id: s.playerId, name: s.playerId, teamId: 'T', position: s.ratingPosition, number: 1 })), { id: 'D', name: 'D', teamId: 'T', position: 'CAM', number: 12 }, { id: 'E', name: 'E', teamId: 'T', position: 'CAM', number: 13 }]
const sub = { id: 'sub60', type: 'sub', minute: 60, sequence: 0, teamId: 'T', playerOutId: 'C', playerInId: 'D', position: 'CAM', tacticalSlotId: 'RCAM' }
function fixture(events = [sub]) {
  return { id: 'draft', season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'T', homeTeamId: 'T', awayTeamId: 'O', kickoffLineup: kickoff, events,
    appearances: players.map(p => ({ playerId: p.id, teamId: 'T', position: p.position, matchPosition: p.position, role: ['D', 'E'].includes(p.id) ? 'bench' : 'starter' })) }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result }
}

// Execute the real editor and its callbacks with persistent hook cells. Only
// React scheduling and the external store are replaced; timeline logic is real.
function editor(run, match = fixture()) {
  const Module = require('node:module'), React = require('react'), originalLoad = Module._load
  let cells = [], cursor = 0
  const hook = initial => { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value }] }
  const hooks = { ...React, useState: hook, useRef: value => hook(() => ({ current: value }))[0], useMemo: fn => fn(), useEffect() {} }
  Module._load = function(name, parent, main) {
    if (name === 'react') return hooks
    if (name === '../store') return { useStore: () => ({ teams: [{ id: 'T', name: 'T', shortName: 'T' }, { id: 'O', name: 'O', shortName: 'O' }], players, matches: [], draftMatch: match, competitionStates: [], saveDraftMatch() {}, clearDraftMatch() {} }) }
    return originalLoad.call(this, name, parent, main)
  }
  const path = require.resolve('../src/screens/NewMatchScreen.tsx'); delete require.cache[path]
  try {
    const { NewMatchScreen } = require(path)
    const boundary = NewMatchScreen({ teamId: 'T', requestedSeason: 'S1', competitionType: 'league', resumeDraft: true, onBack() {}, onReplace() {} })
    assert.equal(boundary.type.name, 'MatchEditor')
    cells = []; cursor = 0
    const root = () => { cursor = 0; return boundary.type(boundary.props) }
    const render = () => find(root(), node => node.type?.name === 'LiveMatchStep')
    const get = () => render().props
    const ui = () => { const element = render(); const saved = cells; cells = []; cursor = 0; const tree = element.type(element.props); cells = saved; return tree }
    run(get, ui, root)
  } finally { Module._load = originalLoad; delete require.cache[path] }
}
const layout = p => Object.fromEntries(p.slots.filter(s => s.playerId).map(s => [s.slot, s.playerId]))

for (const kind of ['goal', 'conceded']) {
  test(`${kind}: empty and partial typing preserve committed slots and eligibility until commit`, () => editor(get => {
    get().onOpen(kind)
    const current = layout(get())
    assert.equal(current.RCAM, 'D')
    for (const value of ['7', '75']) { get().onMinute(value); assert.deepEqual(layout(get()), current) }
    get().onCommitMinute()
    assert.deepEqual(layout(get()), current)
    get().onMinute('20'); get().onCommitMinute()
    const past = layout(get()); assert.equal(past.RCAM, 'C'); assert.equal(past.LCAM, 'A'); assert.equal(past.CAM, 'B')
    if (kind === 'goal') { get().onScorer('C'); get().onAssist('A') }
    else { get().onPicker('cause'); get().onPitchClick('C') }
    for (const value of ['', '7', '75']) {
      get().onMinute(value); assert.deepEqual(layout(get()), past)
      assert.equal(kind === 'goal' ? get().liveScorerId : get().liveCauseId, 'C')
      if (kind === 'goal') assert.equal(get().liveAssistId, 'A')
    }
    get().onCommitMinute(); assert.equal(layout(get()).RCAM, 'D')
    assert.equal(kind === 'goal' ? get().liveScorerId : get().liveCauseId, '')
    get().onMinute(''); get().onCommitMinute(); assert.equal(layout(get()).RCAM, 'D')
  }))

  test(`${kind}: direct save validates the final typed minute without blur`, () => editor(get => {
    get().onOpen(kind)
    if (kind === 'goal') { get().onScorer('D'); get().onAssist('A') } else get().onCause('D')
    get().onMinute('7'); get().onSave()
    assert.equal(get().events.length, 1, 'off-pitch player must not be saved using the stable preview')
    get().onMinute('75'); get().onSave()
    const saved = get().events.at(-1)
    assert.equal(saved.minute, 75); assert.equal(saved.type, 'goal')
    assert.equal(kind === 'goal' ? saved.playerId : saved.concededGoalCausePlayerId, 'D')
  }))
}

test('substitution: typing does not apply pending moves; commit and direct save use final minute', () => editor(get => {
  get().onOpen('substitution'); get().onSubSlot('LCAM'); get().onSubIn('E')
  const pending = layout(get())
  for (const value of ['7', '75']) { get().onMinute(value); assert.deepEqual(layout(get()), pending); assert.equal(get().events.length, 1); assert.equal(get().canConfirmSubstitutions, true) }
  get().onCommitMinute(); assert.equal(get().events.at(-1).minute, 75)
  get().onMinute('85'); assert.equal(get().events.at(-1).minute, 75)
  get().onSave(); assert.equal(get().liveEvent, null); assert.equal(get().events.at(-1).minute, 85)
}))

for (const action of ['delete', 'undo']) test(`substitution ${action} restores exact slots and preserves an independent same-minute move`, () => editor((get, ui) => {
  // Independent tactical action at 60, confirmed separately.
  get().onOpen('substitution'); get().onMinute('60'); get().onCommitMinute()
  get().onSubSlot('CAM'); get().onSubSlot('ST'); get().onSave()
  const before = layout(get())
  get().onOpen('substitution'); get().onMinute('60'); get().onCommitMinute()
  get().onSubSlot('RCAM'); get().onSubIn('E')
  get().onSubSlot('LCAM'); get().onSubSlot('RCAM'); get().onSave()
  assert.equal(layout(get()).RCAM, 'A')
  if (action === 'delete') get().onDeleteEvent(get().events.at(-1))
  else find(ui(), node => node.type === 'button' && node.props.children === 'UNDO LAST').props.onClick()
  assert.deepEqual(layout(get()), before)
  assert.equal(layout(get()).ST, 'B')
}, fixture([{ id: 'opening-goal', type: 'goal', minute: 10, teamId: 'T', playerId: 'B' }])))

test('a rejected substitution does not poison later valid moves in the same editor', () => editor(get => {
  get().onOpen('substitution'); get().onMinute('75'); get().onCommitMinute()
  const before = layout(get())
  get().onSubSlot('LCAM'); get().onSubIn('C') // Subbed-out players cannot reenter.
  assert.deepEqual(layout(get()), before)
  get().onSubSlot('LCAM'); get().onSubIn('E'); get().onSave()
  assert.equal(get().liveEvent, null); assert.equal(get().events.at(-1).playerInId, 'E')
}))

test('editing a linked substitution time preserves independent same-minute history', () => editor((get, _ui, root) => {
  get().onOpen('substitution'); get().onMinute('60'); get().onCommitMinute()
  get().onSubSlot('CAM'); get().onSubSlot('ST'); get().onSave()
  get().onOpen('substitution'); get().onMinute('60'); get().onCommitMinute()
  get().onSubSlot('RCAM'); get().onSubIn('E')
  get().onSubSlot('LCAM'); get().onSubSlot('RCAM'); get().onSave()
  get().onEditEvent(get().events.at(-1))
  const dialog = () => find(root(), node => node.props.role === 'dialog')
  find(dialog(), node => node.type?.name === 'MinuteInput').props.onChange('70')
  find(dialog(), node => node.type === 'button' && node.props.children === 'SAVE').props.onClick()
  assert.equal(get().events.at(-1).minute, 70)
  get().onOpen('goal'); get().onMinute('65'); get().onCommitMinute()
  assert.equal(layout(get()).ST, 'B', 'independent move must remain at minute 60')
  assert.equal(layout(get()).RCAM, 'C', 'linked move must wait until minute 70')
  assert.equal(layout(get()).LCAM, 'A')
}, fixture([{ id: 'opening-goal', type: 'goal', minute: 10, teamId: 'T', playerId: 'B' }])))
