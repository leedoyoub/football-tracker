const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
const dnd = require('@dnd-kit/core')

// Exercise the screen's event handlers without adding a DOM/testing dependency.
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
}
let active
const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
const hooks = {
  ...React,
  useState(initial) {
    const owner = active
    const index = owner.cursor++
    if (!(index in owner.hooks)) owner.hooks[index] = typeof initial === 'function' ? initial() : initial
    return [owner.hooks[index], value => {
      const next = typeof value === 'function' ? value(owner.hooks[index]) : value
      if (!Object.is(next, owner.hooks[index])) { owner.hooks[index] = next; owner.dirty = true }
    }]
  },
  useRef(initial) {
    const index = active.cursor++
    return active.hooks[index] ??= { current: initial }
  },
  useMemo(factory, deps) {
    const index = active.cursor++
    const previous = active.hooks[index]
    if (!previous || !equalDeps(previous.deps, deps)) active.hooks[index] = { deps, value: factory() }
    return active.hooks[index].value
  },
  useEffect(effect, deps) {
    const index = active.cursor++
    if (!equalDeps(active.hooks[index], deps)) { active.hooks[index] = deps; active.effects.push(effect) }
  },
}
const load = Module._load
Module._load = function (name, parent, main) {
  if (name === 'react') return hooks
  if (name === '../store') return { useStore: () => active.store }
  if (name === '@dnd-kit/core') return { ...dnd, useSensors: (...sensors) => sensors, useSensor: (sensor, options) => ({ sensor, options }) }
  return load.call(this, name, parent, main)
}
const { NewMatchScreen } = require('../src/screens/NewMatchScreen.tsx')
const { Pitch, FORMATION_SLOTS } = require('../src/components/Pitch.tsx')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const { aggregatePlayerStats, getLeaderboard } = require('../src/engine/stats.ts')
const { MatchDetailScreen } = require('../src/screens/MatchDetailScreen.tsx')
const { TeamDetailScreen } = require('../src/screens/TeamDetailScreen.tsx')
const { SubstitutePlayerCard } = require('../src/components/ui.tsx')

function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
function content(node) {
  if (Array.isArray(node)) return node.map(content).join('')
  if (node && typeof node === 'object') return content(node.props?.children)
  return node == null ? '' : String(node)
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
function harness() {
  const h = { hooks: [], cursor: 0, effects: [], timers: [], dirty: false, saved: [], drafts: [], navigation: [] }
  h.store = {
    teams: [{ id: 'A', name: 'Team A' }], matches: [],
    players: freeze([
      ...FORMATION_SLOTS['4-3-3'].map((slot, index) => ({ id: slot.slot, name: slot.slot, position: slot.position, number: index + 1, teamId: 'A' })),
      ...['b1', 'b2', 'b3', 'bGK', 'unused'].map(id => ({ id, name: id, position: 'CM', number: 20, teamId: 'B', teamIds: ['B', 'A'] })),
      { id: 'other-team', name: 'Other', position: 'GK', number: 1, teamId: 'B' },
    ]),
    addMatch: match => { h.saved.push(match); return match.id },
    saveDraftMatch: match => h.drafts.push(match),
    clearDraftMatch: () => {},
  }
  h.render = () => {
    active = h
    global.window = { setTimeout: fn => h.timers.push(fn), confirm: () => true }
    for (let count = 0; count < 20; count++) {
      h.cursor = 0; h.dirty = false; h.effects = []
      h.tree = NewMatchScreen({ teamId: 'A', onNavigate: view => h.navigation.push(view) })
      h.effects.forEach(effect => effect())
      if (!h.dirty) return
    }
    throw new Error('Render did not settle')
  }
  h.act = fn => { active = h; fn(); h.render() }
  h.live = () => nodes(h.tree, node => node.type?.name === 'LiveMatchStep')[0]
  h.liveTree = () => h.live().type(h.live().props)
  h.props = () => h.live().props
  h.call = (name, ...args) => h.act(() => h.props()[name](...args))
  h.pitch = () => nodes(h.live() ? h.liveTree() : h.tree, node => node.type === Pitch)[0]
  h.button = name => nodes(h.live() ? h.liveTree() : h.tree, node => node.type === 'button' && content(node) === name)[0]
  h.clickButton = name => { const button = h.button(name); assert(button, name); assert(!button.props.disabled, name); h.act(button.props.onClick) }
  h.clickOut = slotId => h.act(() => { const pitch = h.pitch(); pitch.props.onSlotClick(pitch.props.slots.find(slot => slot.slot === slotId)) })
  h.clickIn = id => h.act(() => nodes(h.liveTree(), node => node.type?.name === 'DragPlayerGroup')[0].props.onClick(id))
  h.drag = (source, target) => {
    const context = () => nodes(h.live() ? h.liveTree() : h.tree, node => node.type === dnd.DndContext)[0]
    h.act(() => context().props.onDragStart({ active: { id: source } }))
    h.act(() => context().props.onDragEnd({ active: { id: source }, over: target ? { id: target } : null }))
    h.timers.splice(0).forEach(fn => fn())
  }
  h.enter = () => {
    assert.equal(nodes(h.tree, node => node.type === 'input' && node.props.maxLength === 3).length, 0)
    h.clickButton('CONTINUE')
  }
  h.openSub = (minute = 60) => { h.call('onOpen', 'substitution'); h.call('onMinute', minute) }
  h.slot = slotId => h.pitch().props.slots.find(slot => slot.slot === slotId).playerId
  h.render()
  return h
}

test('click and both drag directions share one draft; same-minute changes synchronize formation and bench', () => {
  const h = harness(); h.enter(); h.openSub()
  h.clickOut('ST'); h.clickIn('b1')
  assert.equal(h.slot('ST'), 'b1')
  h.drag('roster:substitute:b2', 'target:LW')
  h.drag('player:GK', 'roster:substitute:bGK')
  assert.equal(h.slot('LW'), 'b2'); assert.equal(h.slot('GK'), 'bGK')
  assert.deepEqual(h.props().events.map(event => [event.playerOutId, event.playerInId, event.minute]), [['ST', 'b1', 60], ['LW', 'b2', 60], ['GK', 'bGK', 60]])
  const bench = h.props().benchPlayers.map(player => player.id)
  for (const id of ['ST', 'LW', 'GK']) assert(bench.includes(id))
  for (const id of ['b1', 'b2', 'bGK']) assert(!bench.includes(id))
  assert.equal(h.drafts.at(-1).events.length, 0, 'pending changes must not leak into saved draft')
  h.clickButton('CONFIRM SUBSTITUTIONS')
  const savedEvents = h.props().events
  h.clickButton('BACK')
  assert.equal(h.slot('ST'), 'b1')
  h.clickButton('CONTINUE')
  assert.deepEqual(h.props().events, savedEvents)
  h.clickButton('FINISH & SAVE')
  const match = h.saved[0]
  assert.equal(match.id, h.drafts[0].id)
  assert.deepEqual(h.navigation.at(-1), { name: 'match', id: match.id })
  assert.equal(match.appearances.filter(row => row.role === 'starter').length, 11)
  assert.equal(match.appearances.find(row => row.playerId === 'ST').role, 'starter')
  const entered = match.appearances.find(row => row.playerId === 'b1')
  assert.deepEqual(entered, { playerId: 'b1', teamId: 'A', position: 'CM', matchPosition: 'ST', role: 'bench' })
  assert(!match.appearances.some(row => row.playerId === 'unused'))
  assert.equal(ratePlayerMatch(match, h.store.players.find(player => player.id === 'unused')), null)
  assert.equal(aggregatePlayerStats(h.store.players.find(player => player.id === 'b1'), h.store.players, [match]).minutes, 30)
  assert.equal(h.store.players.find(player => player.id === 'b1').position, 'CM')
  h.store.matches = h.saved
  const result = MatchDetailScreen({ matchId: match.id, onNavigate: () => {} })
  assert(result)
  const teamMain = TeamDetailScreen({ teamId: 'A', season: match.season, onNavigate: () => {}, onBack: () => {} })
  const cards = nodes(teamMain, node => node.type === SubstitutePlayerCard)
  assert.deepEqual(cards.map(card => card.props.player.id).sort(), ['b1', 'b2', 'bGK'].sort())
  for (const card of cards) assert.equal(card.props.rating, ratePlayerMatch(match, card.props.player).raw)
})

test('reject duplicates, re-entry, unknown players, and invalid chronology; allow later replacement of entered player', () => {
  const h = harness(); h.enter(); h.openSub()
  h.clickOut('ST'); h.clickIn('b1')
  h.clickIn('b1')
  h.clickOut('ST'); h.clickIn('ST')
  h.clickOut('ST'); h.clickIn('b2')
  h.drag('player:LW', 'roster:substitute:other-team')
  assert.equal(h.props().events.length, 1)
  for (const minute of [-1, 59, 60.5, 90, NaN]) {
    h.call('onMinute', ''); h.call('onMinute', minute); h.clickOut('LW'); h.clickIn('b2')
    assert.equal(h.props().events.length, 1)
  }
  h.call('onMinute', 75); h.clickOut('ST'); h.clickIn('b2')
  assert.equal(h.props().events.length, 2)
  h.clickButton('CONFIRM SUBSTITUTIONS'); h.clickButton('FINISH & SAVE')
  for (const [id, minutes] of [['ST', 60], ['b1', 15], ['b2', 15]]) {
    assert.equal(ratePlayerMatch(h.saved[0], h.store.players.find(player => player.id === id)).minutes, minutes)
  }
})

test('cancel restores both formation and bench; another confirmed batch remains append-only', () => {
  const h = harness(); h.enter(); h.openSub()
  const bench = h.props().benchPlayers.map(player => player.id)
  h.clickOut('ST'); h.clickIn('b1'); h.call('onCancel')
  assert.equal(h.slot('ST'), 'ST')
  assert.deepEqual(h.props().benchPlayers.map(player => player.id), bench)
  assert.equal(h.props().events.length, 0)
  h.openSub(); h.clickOut('ST'); h.clickIn('b1'); h.call('onSave')
  const first = h.props().events[0]
  h.openSub(70); h.drag('roster:substitute:b2', 'target:LW'); h.call('onSave')
  assert.equal(h.props().events.length, 2); assert.deepEqual(h.props().events[0], first)
})

test('Page 1 occupied/empty tactical slot dragging remains available and does not create substitution events', () => {
  const h = harness()
  const context = nodes(h.tree, node => node.type === dnd.DndContext)[0]
  assert.deepEqual(context.props.collisionDetection({
    pointerCoordinates: { x: 500, y: 500 },
    droppableContainers: [{ id: 'target:ST' }],
    droppableRects: new Map([['target:ST', { left: 0, right: 50, top: 0, bottom: 50, width: 50, height: 50 }]]),
  }), [], 'releasing outside every drop target must not select a nearby player')
  h.drag('player:ST', 'target:CAM')
  assert.equal(h.slot('ST'), null); assert.equal(h.slot('CAM'), 'ST')
  h.drag('player:CAM', 'target:LW')
  assert.equal(h.slot('CAM'), 'LW'); assert.equal(h.slot('LW'), 'ST')
  h.enter(); h.clickButton('FINISH & SAVE')
  assert.equal(h.saved[0].events.length, 0)
  assert.equal(h.saved[0].appearances.find(row => row.playerId === 'ST').matchPosition, 'LW')
  assert.equal(h.store.players.find(player => player.id === 'ST').position, 'ST')
})

test('draft survives roster reference refresh; pending events cannot finish and cancelled drags do not swap players', () => {
  const h = harness(); h.enter(); h.openSub(); h.clickOut('ST'); h.clickIn('b1')
  assert(h.button('FINISH & SAVE').props.disabled)
  h.call('onFinish'); assert.equal(h.saved.length, 0)
  h.store.players = [...h.store.players]; h.render()
  assert.equal(h.slot('ST'), 'b1'); assert.equal(h.props().events.length, 1)
  h.drag('roster:substitute:b2', null)
  assert.equal(h.props().events.length, 1)
  h.call('onCancel'); assert.equal(h.slot('ST'), 'ST')
})

test('bench to invisible empty target uses the lineup assignment mechanism; OUT completes a valid 11-player substitution', () => {
  const h = harness(); h.enter(); h.openSub(60)
  h.drag('roster:substitute:b1', 'target:CAM')
  assert.equal(h.slot('CAM'), 'b1')
  assert.equal(h.props().slots.filter(slot => slot.playerId).length, 12)
  assert(h.button('CONFIRM SUBSTITUTIONS').props.disabled)
  h.drag('player:ST', 'bench:empty')
  assert.equal(h.slot('ST'), null)
  assert.equal(h.props().slots.filter(slot => slot.playerId).length, 11)
  assert.equal(h.props().events[0].playerOutId, 'ST')
  assert.equal(h.props().events[0].playerInId, 'b1')
  assert.equal(h.props().events[0].position, 'CAM')
  h.clickButton('CONFIRM SUBSTITUTIONS'); h.clickButton('FINISH & SAVE')
  assert.equal(ratePlayerMatch(h.saved[0], h.store.players.find(player => player.id === 'b1')).position, 'CAM')
  assert.equal(ratePlayerMatch(h.saved[0], h.store.players.find(player => player.id === 'b1')).minutes, 30)
})

test('sequential player/empty-slot/bench choices persist CM -> CAM at the substitution minute without changing base position', () => {
  const h = harness(); h.enter(); h.openSub(60)
  const empty = id => h.act(() => { const pitch = h.pitch(); pitch.props.onEmptySlotClick(pitch.props.slots.find(slot => slot.slot === id)) })
  h.clickOut('CM'); empty('CAM')
  assert.equal(h.slot('CAM'), 'CM'); assert.equal(h.slot('CM'), null)
  assert(h.button('CONFIRM SUBSTITUTIONS').props.disabled, 'a position-only change needs a substitution at the same minute')
  h.clickIn('b1'); empty('CM')
  h.clickOut('ST'); h.act(() => nodes(h.liveTree(), node => node.type?.name === 'BenchDropTarget')[0].props.onClick())
  h.clickButton('CONFIRM SUBSTITUTIONS')
  h.clickButton('BACK'); h.clickButton('CONTINUE')
  h.clickButton('FINISH & SAVE')
  const match = JSON.parse(JSON.stringify(h.saved[0]))
  const appearance = match.appearances.find(row => row.playerId === 'CM')
  assert.equal(appearance.matchPosition, 'CM')
  assert.deepEqual(appearance.positionHistory, [{ minute: 60, position: 'CAM' }])
  assert.equal(h.store.players.find(player => player.id === 'CM').position, 'CM')
  const { matchPositionSegments } = require('../src/engine/rating.ts')
  assert.deepEqual(matchPositionSegments(match, appearance), [{ enter: 0, exit: 60, position: 'CM' }, { enter: 60, exit: 90, position: 'CAM' }])
  assert.equal(ratePlayerMatch(match, h.store.players.find(player => player.id === 'CM')).minutes, 90)
})

test('formation rearrangement can share an existing substitution minute, but cannot silently create a new position-only minute', () => {
  const h = harness(); h.enter(); h.openSub(60)
  h.clickOut('ST'); h.clickIn('b1'); h.call('onSave')
  h.openSub(65); h.drag('player:CM', 'target:CAM')
  assert(h.button('CONFIRM SUBSTITUTIONS').props.disabled)
  h.call('onCancel'); assert.equal(h.slot('CM'), 'CM')
  h.openSub(60); h.drag('player:CM', 'target:CAM'); h.call('onSave')
  h.clickButton('FINISH & SAVE')
  assert.equal(h.saved[0].events.filter(event => event.type === 'sub').length, 1)
  assert.deepEqual(h.saved[0].appearances.find(row => row.playerId === 'CM').positionHistory, [{ minute: 60, position: 'CAM' }])
})

test('sequential occupied-slot swap and a later drag retain both position change times', () => {
  const h = harness(); h.enter(); h.openSub(60)
  h.clickOut('CM'); h.clickOut('LW')
  assert.equal(h.slot('CM'), 'LW'); assert.equal(h.slot('LW'), 'CM')
  h.clickOut('ST'); h.clickIn('b1'); h.call('onSave')
  h.openSub(75); h.drag('player:LW', 'target:CAM'); h.drag('roster:substitute:b2', 'target:RW'); h.call('onSave')
  h.clickButton('FINISH & SAVE')
  const match = JSON.parse(JSON.stringify(h.saved[0]))
  const appearance = match.appearances.find(row => row.playerId === 'CM')
  assert.deepEqual(appearance.positionHistory, [{ minute: 60, position: 'LW' }, { minute: 75, position: 'CAM' }])
  const { matchPositionSegments } = require('../src/engine/rating.ts')
  assert.deepEqual(matchPositionSegments(match, appearance), [
    { enter: 0, exit: 60, position: 'CM' }, { enter: 60, exit: 75, position: 'LW' }, { enter: 75, exit: 90, position: 'CAM' },
  ])
})


test('save without opponent input preserves historical opponents and team-specific Match Day, including rollover', () => {
  for (const [previousDay, expectedSeason, expectedDay] of [[7, 'Season 1', 8], [38, 'Season 2', 1]]) {
    const h = harness()
    h.store.matches = freeze([
      { id: 'historical-A', teamId: 'A', homeTeamId: 'A', awayTeamId: 'old-opponent', opponentName: 'OLD', season: 'Season 1', matchDay: previousDay, date: '2026-01-01', duration: 90, appearances: [], events: [] },
      { id: 'historical-B', teamId: 'B', homeTeamId: 'B', awayTeamId: 'another-opponent', opponentName: 'XYZ', season: 'Season 8', matchDay: 38, date: '2026-01-01', duration: 90, appearances: [], events: [] },
    ])
    const before = JSON.stringify(h.store.matches)
    h.render()
    assert.equal(h.button('home'), undefined)
    assert.equal(h.button('away'), undefined)
    h.enter()
    const draft = h.drafts.at(-1)
    h.clickButton('FINISH & SAVE')
    const saved = h.saved[0]
    assert.equal(saved.season, expectedSeason)
    assert.equal(saved.matchDay, expectedDay)
    assert.equal(saved.opponentName, 'OPP')
    assert.equal(saved.id, draft.id)
    assert.equal(saved.teamId, 'A')
    assert.equal(saved.awayTeamId, 'opponent:' + saved.id)
    assert.equal(saved.homeTeamId, 'A')
    assert.equal(JSON.stringify(h.store.matches), before)
    assert.deepEqual(h.navigation.at(-1), { name: 'match', id: saved.id })
  }
})

test('shared PlayerIcon renders plain position text and retains jersey, rating, card stats and click handlers', () => {
  const { PlayerIcon } = require('../src/components/PlayerIcon.tsx')
  const player = { id: 'p', name: 'Full Name', displayName: 'Display', position: 'ST', number: 9 }
  let clicked = 0
  const onClick = () => clicked++
  const icon = PlayerIcon({ player, position: 'CM', badges: React.createElement('span', null, '7.5'), onClick })
  const label = nodes(icon, node => node.props['aria-label'] === 'Position')[0]
  assert.equal(content(label), 'CM')
  assert(!/bg-|rounded|border|shadow/.test(label.props.className))
  assert(label.props.className.includes('font-bold'))
  assert.equal(content(nodes(icon, node => node.props['aria-label'] === 'Jersey number')[0]), '9')
  assert(content(icon).includes('7.5'))
  icon.props.onClick()
  const card = SubstitutePlayerCard({ player, position: 'CM', rating: 7.5, stats: { goals: 2, assists: 1 }, onClick })
  assert.equal(nodes(card, node => node.type === PlayerIcon)[0].props.position, 'CM')
  assert(content(card).includes('Display'))
  assert(content(card).includes('7.5'))
  assert.equal(nodes(card, node => node.type?.name === 'GoalIcon').length, 1)
  assert.equal(nodes(card, node => node.type?.name === 'AssistIcon').length, 1)
  card.props.onClick()
  assert.equal(clicked, 2)
})


test('Log Match has no special goal selector and saves normal goals with scorer and assister', () => {
  const h = harness(); h.enter(); h.call('onOpen', 'goal')
  assert(!content(h.liveTree()).includes('Wonder'))
  assert(!content(h.liveTree()).includes('Assist-led'))
  assert.equal(nodes(h.liveTree(), node => node.type === 'select').length, 0)
  h.call('onScorer', 'ST'); h.call('onAssist', 'CM'); h.call('onMinute', '45'); h.call('onSave')
  h.clickButton('FINISH & SAVE')
  const event = h.saved[0].events[0]
  assert.equal(event.goalType, 'normal')
  assert.equal(event.playerId, 'ST')
  assert.equal(event.assistPlayerId, 'CM')
  assert.equal(h.saved[0].homeAway, 'home')
})

test('Teams New Team action opens existing form and form saves with existing fields', () => {
  const h = harness()
  const { TeamsScreen } = require('../src/screens/TeamsScreen.tsx')
  const { NewTeamScreen } = require('../src/screens/NewTeamScreen.tsx')
  const tree = TeamsScreen({ onNavigate: view => h.navigation.push(view) })
  const button = nodes(tree, node => node.type === 'button' && content(node) === 'New Team')[0]
  assert(button)
  assert(!button.props.disabled)
  assert.equal(button.props.type, 'button')
  button.props.onClick()
  assert.deepEqual(h.navigation.at(-1), { name: 'new-team' })
  const savedTeams = []
  h.store.addTeam = team => { savedTeams.push(team); return 'created-team' }
  h.hooks = []
  const form = () => { h.cursor = 0; return NewTeamScreen({ onNavigate: view => h.navigation.push(view) }) }
  let screen = form()
  const input = placeholder => nodes(screen, node => node.type === 'input' && node.props.placeholder === placeholder)[0]
  input('Club name').props.onChange({ target: { value: 'New Club' } })
  input('ABC').props.onChange({ target: { value: 'new' } })
  screen = form()
  const create = nodes(screen, node => node.type === 'button' && content(node) === 'Create team')[0]
  assert(!create.props.disabled)
  create.props.onClick()
  assert.equal(savedTeams[0].name, 'New Club')
  assert.equal(savedTeams[0].abbreviation, 'NEW')
  assert.deepEqual(h.navigation.at(-1), { name: 'team', id: 'created-team' })
})


test('substitution feedback follows OUT-first and IN-first clicks, pending pairs, cancel and confirmation', () => {
  const h = harness(); h.enter(); h.openSub()
  assert.deepEqual(h.props().substitutionSelection, {})
  h.clickOut('ST')
  assert.deepEqual(h.props().substitutionSelection, { ST: 'out' })
  assert.equal(h.pitch().props.substitutionSelection.ST, 'out')
  h.clickOut('ST')
  assert.deepEqual(h.props().substitutionSelection, {})
  h.clickIn('b1')
  assert.deepEqual(h.props().substitutionSelection, { b1: 'in' })
  h.clickIn('b1')
  assert.deepEqual(h.props().substitutionSelection, {})
  h.clickIn('b1'); h.clickOut('ST')
  assert.deepEqual(h.props().substitutionSelection, { ST: 'out', b1: 'in' })
  assert.equal(h.props().pendingSubs.length, 1)
  assert(content(h.liveTree()).includes('ST OUT'))
  assert(content(h.liveTree()).includes('b1 IN'))
  h.clickButton('CANCEL')
  assert.deepEqual(h.props().substitutionSelection, {})
  assert.equal(h.props().pendingSubs.length, 0)
  h.openSub(); h.clickOut('ST'); h.clickIn('b1'); h.clickButton('CONFIRM SUBSTITUTIONS')
  assert.deepEqual(h.props().substitutionSelection, {})
  assert.equal(h.props().pendingSubs.length, 0)
  h.openSub(70)
  assert.deepEqual(h.props().substitutionSelection, {})
})

test('drag and empty-slot substitutions expose the same visual feedback without changing the mechanism', () => {
  const h = harness(); h.enter(); h.openSub()
  h.drag('roster:substitute:b1', 'target:ST')
  assert.deepEqual(h.props().substitutionSelection, { ST: 'out', b1: 'in' })
  h.clickButton('CANCEL'); h.openSub()
  h.clickIn('b1'); h.call('onSubSlot', 'CAM')
  assert.equal(h.props().substitutionSelection.b1, 'in')
  h.clickOut('ST'); h.call('onSubBench')
  assert.equal(h.props().substitutionSelection.ST, 'out')
  assert.equal(h.props().substitutionSelection.b1, 'in')
  h.clickButton('CONFIRM SUBSTITUTIONS')
  assert.deepEqual(h.props().substitutionSelection, {})
})

test('shared substitute card hides only rating and selection arrows have the correct colors', () => {
  const { Badge, SubstitutionSelection } = require('../src/components/ui.tsx')
  const player = { id: 'p', name: 'Kim', displayName: 'Kim', teamId: 'A', position: 'CM', number: 10 }
  const props = { player, rating: 7.5, stats: { goals: 2, assists: 1 }, onClick() {} }
  const normal = SubstitutePlayerCard(props)
  const log = SubstitutePlayerCard({ ...props, showRating: false })
  assert.equal(nodes(normal, node => node.type === Badge).length, 1)
  assert.equal(nodes(log, node => node.type === Badge).length, 0)
  assert.equal(normal.props.className, log.props.className)
  const { PlayerIcon } = require('../src/components/PlayerIcon.tsx')
  assert.equal(nodes(log, node => node.type === PlayerIcon)[0].props.player.number, 10)
  assert(content(log).includes('Kim'))
  const out = SubstitutionSelection({ direction: 'out' })
  const incoming = SubstitutionSelection({ direction: 'in' })
  assert.equal(content(out), '? OUT'); assert(out.props.className.includes('text-red-400'))
  assert.equal(content(incoming), 'IN ?'); assert(incoming.props.className.includes('text-emerald-400'))
  assert(SubstitutePlayerCard({ ...props, selection: 'in' }).props.className.includes('scale-105'))
})


test('goal pitch flow selects scorer then assist, highlights both, shows summary and saves normal IDs', () => {
  const h = harness(); h.enter(); h.call('onOpen', 'goal')
  assert.equal(h.props().liveMinute, '')
  h.call('onPitchClick', 'ST')
  assert.equal(h.props().liveScorerId, 'ST')
  assert.equal(h.props().livePicker, 'assist')
  assert.equal(h.pitch().props.goalSelection.ST, 'scorer')
  assert(h.pitch().props.disabledPlayerIds.includes('ST'))
  h.call('onPitchClick', 'ST'); assert.equal(h.props().liveAssistId, '')
  h.call('onPitchClick', 'CM')
  assert.equal(h.props().livePicker, 'minute')
  assert.equal(h.pitch().props.goalSelection.CM, 'assist')
  assert(content(h.liveTree()).includes('? ST'))
  assert(content(h.liveTree()).includes('?? CM'))
  assert(h.button('SAVE GOAL').props.disabled)
  h.call('onSave'); assert.equal(h.props().events.length, 0)
  h.call('onMinute', '7'); h.clickButton('SAVE GOAL')
  assert.deepEqual(h.props().events.map(e => [e.playerId, e.assistPlayerId, e.minute, e.goalType]), [['ST', 'CM', 7, 'normal']])
  assert.equal(h.pitch().props.goalSelection, undefined)
})

test('No Assist is explicit and unused bench cannot be selected; Cancel resets a new goal', () => {
  const h = harness(); h.enter(); h.call('onOpen', 'goal')
  h.call('onPitchClick', 'unused'); assert.equal(h.props().liveScorerId, '')
  h.call('onPitchClick', 'ST')
  h.call('onPitchClick', 'b1'); assert.equal(h.props().liveAssistId, '')
  h.clickButton('No Assist')
  assert(h.props().assistChosen)
  assert(content(h.liveTree()).includes('?? No Assist'))
  h.call('onMinute', '45'); h.clickButton('SAVE GOAL')
  assert.equal(h.props().events[0].assistPlayerId, undefined)
  h.call('onOpen', 'goal'); assert.equal(h.props().liveMinute, '')
  h.call('onPitchClick', 'CM'); h.clickButton('CANCEL')
  h.call('onOpen', 'goal')
  assert.equal(h.props().liveScorerId, '')
  assert.equal(h.props().assistChosen, false)
})

test('goal candidates follow substitution boundaries and changing minute invalidates an unavailable scorer or assist', () => {
  const h = harness(); h.enter(); h.openSub(60)
  h.clickOut('ST'); h.clickIn('b1'); h.clickButton('CONFIRM SUBSTITUTIONS')
  h.call('onOpen', 'goal'); h.call('onPitchClick', 'b1'); h.clickButton('No Assist')
  h.call('onMinute', '59')
  assert.equal(h.props().liveScorerId, '')
  assert(h.pitch().props.slots.some(s => s.playerId === 'ST'))
  assert(!h.pitch().props.slots.some(s => s.playerId === 'b1'))
  h.call('onPitchClick', 'CM'); h.call('onPitchClick', 'ST')
  h.call('onMinute', '60')
  assert.equal(h.props().liveScorerId, 'CM')
  assert.equal(h.props().liveAssistId, '')
  assert.equal(h.props().assistChosen, false)
  assert(!h.pitch().props.slots.some(s => s.playerId === 'ST'))
  h.call('onPitchClick', 'ST'); assert.equal(h.props().liveAssistId, '')
  h.call('onPitchClick', 'b1'); h.clickButton('SAVE GOAL')
  assert.equal(h.props().events.at(-1).assistPlayerId, 'b1')
})

test('all event minutes start blank, accept at most two digits, preserve numeric keyboard props and block empty saves', () => {
  for (const type of ['goal', 'conceded', 'substitution']) {
    const h = harness(); h.enter(); h.call('onOpen', type)
    assert.equal(h.props().liveMinute, '')
    assert.equal(h.props().validMinute, false)
    h.call('onSave'); assert.equal(h.props().events.length, 0)
    for (const value of ['abc', '-1', '1.5', '123', '1e2', ' 7']) {
      h.call('onMinute', value); assert.equal(h.props().liveMinute, '')
    }
    for (const value of ['7', '45', '90']) {
      h.call('onMinute', value)
      assert.equal(h.props().liveMinute, value)
      assert.equal(h.props().validMinute, type !== 'substitution' || value !== '90')
    }
    const minute = nodes(h.liveTree(), node => node.type?.name === 'MinuteInput')[0]
    h.cursor = h.hooks.length
    const input = nodes(minute.type(minute.props), node => node.type === 'input')[0]
    assert.equal(input.props.type, 'text')
    assert.equal(input.props.inputMode, 'numeric')
    assert.equal(input.props.maxLength, 2)
    h.call('onMinute', '')
    assert.equal(h.props().validMinute, false)
    h.call('onSave'); assert.equal(h.props().events.length, 0)
  }
})


test('inline saves starts blank, has no picker or minute, updates one stable event and rejects non-digits', () => {
  const h = harness(); h.enter()
  assert.equal(h.props().totalSaves, '')
  const input = nodes(h.liveTree(), node => node.type === 'input' && node.props['aria-label'] === 'Total saves')[0]
  assert(input); assert.equal(input.props.inputMode, 'numeric')
  assert.equal(h.button('SAVE'), undefined)
  assert.equal(nodes(h.liveTree(), node => node.type === 'select').length, 0)
  assert.equal(nodes(h.liveTree(), node => node.type?.name === 'MinuteInput').length, 0)
  for (const value of ['-1', '1.5', 'abc', '1e2', '9007199254740992']) h.call('onTotalSaves', value)
  assert.equal(h.props().events.length, 0)
  h.call('onTotalSaves', '3')
  const id = h.props().events[0].id
  h.call('onTotalSaves', '5'); h.call('onTotalSaves', '5')
  assert.equal(h.props().events.length, 1)
  assert.equal(h.props().events[0].id, id)
  assert.equal(h.props().events[0].count, 5)
  assert.equal(h.props().events[0].playerId, 'GK')
  assert(!('minute' in h.props().events[0]))
  h.call('onTotalSaves', '')
  assert.equal(h.props().events.length, 0)
  h.call('onTotalSaves', '0'); assert.equal(h.props().events[0].count, 0)
  h.call('onTotalSaves', '5'); assert.equal(h.props().events[0].id, id)
  h.clickButton('FINISH & SAVE')
  assert.equal(aggregatePlayerStats(h.store.players.find(p => p.id === 'GK'), h.store.players, h.saved).saves, 5)
})

test('total saves stay attached to starting tactical GK after a keeper substitution', () => {
  const h = harness(); h.enter(); h.call('onTotalSaves', '3')
  h.openSub(60); h.clickOut('GK'); h.clickIn('bGK'); h.clickButton('CONFIRM SUBSTITUTIONS')
  h.call('onTotalSaves', '5'); h.clickButton('FINISH & SAVE')
  const saves = h.saved[0].events.filter(e => e.type === 'save')
  assert.equal(saves.length, 1); assert.equal(saves[0].playerId, 'GK')
  assert.equal(saves[0].count, 5); assert(!('minute' in saves[0]))
  assert.equal(aggregatePlayerStats(h.store.players.find(p => p.id === 'GK'), h.store.players, h.saved).saves, 5)
  assert.equal(aggregatePlayerStats(h.store.players.find(p => p.id === 'bGK'), h.store.players, h.saved).saves, 0)
})

test('tactical GK is used even when their registered position is CM', () => {
  const h = harness()
  h.drag('roster:substitute:b1', 'target:GK')
  h.enter(); h.call('onTotalSaves', '4'); h.clickButton('FINISH & SAVE')
  assert.equal(h.saved[0].events[0].playerId, 'b1')
  assert.equal(aggregatePlayerStats(h.store.players.find(p => p.id === 'b1'), h.store.players, h.saved).saves, 4)
})

test('total saves rank and aggregate by season and historical team without changing old records', () => {
  const h = harness(); h.enter(); h.call('onTotalSaves', '5'); h.clickButton('FINISH & SAVE')
  const current = h.saved[0]
  const historical = freeze({ ...current, id: 'historical', teamId: 'B', homeTeamId: 'B', season: 'Season 2', appearances: current.appearances.map(a => ({ ...a, teamId: 'B' })), events: [{ id: 'old-save', type: 'save', playerId: 'GK', teamId: 'B', minute: 20, count: 2 }] })
  const before = JSON.stringify(historical)
  const matches = [historical, current]
  const ranking = (seasons, teams) => getLeaderboard(h.store.players, matches, { seasons, teams, positions: [] }, 'saves').find(row => row.playerId === 'GK')?.value
  assert.equal(ranking([], ['A']), 5)
  assert.equal(ranking([], ['B']), 2)
  assert.equal(ranking([], ['A', 'B']), 7)
  assert.equal(ranking(['Season 2'], []), 2)
  assert.equal(ranking(['Season 1'], []), 5)
  assert.equal(JSON.stringify(historical), before)
})
