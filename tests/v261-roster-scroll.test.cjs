require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const scroll = require('../src/components/scrollToTop.ts')
const root = path.resolve(__dirname, '..')
const player = (id, position) => ({ id, name: id, position, number: 1, teamId: 'A' })
function rosterRows(props) {
  const h = screenHarness(root, 'screens/NewMatchScreen.tsx', 'RosterPlayerGroup', { players: props.players, matches: [] })
  return nodes(h.render({ title: 'Bench', group: 'substitute', onClick() {}, ...props }), node => node.type?.name === 'RosterPlayer').map(node => [node.props.player.id, node.props.position])
}

test('unused bench displays and sorts by the parent representative family, with registered fallback', () => {
  const players = [player('defender', 'ST'), player('attacker', 'GK'), player('fallback', 'CM')]
  const appearances = players.map(p => ({ playerId: p.id, teamId: 'A', role: 'bench', position: p.position }))
  const before = JSON.stringify({ players, appearances })
  assert.deepEqual(rosterRows({ players, playerIds: ['attacker', 'fallback', 'defender'], appearances, events: [], representative: new Map([['defender', 'CB'], ['attacker', 'ST']]) }), [['defender', 'CB'], ['fallback', 'CM'], ['attacker', 'ST']])
  assert.equal(JSON.stringify({ players, appearances }), before)
})

test('actual entrants keep tactical aliases and position history while sorting by their actual entry role', () => {
  const players = [player('entered', 'GK'), player('unused', 'ST')]
  const appearances = [
    { playerId: 'entered', teamId: 'A', role: 'bench', position: 'GK', positionHistory: [{ minute: 70, position: 'ST', tacticalSlotId: 'ST', sequence: 2 }] },
    { playerId: 'unused', teamId: 'A', role: 'bench', position: 'ST' },
  ]
  const events = [{ id: 'sub', type: 'sub', teamId: 'A', minute: 60, sequence: 1, playerInId: 'entered', playerOutId: 'out', position: 'CAM', tacticalSlotId: 'LCAM' }]
  assert.deepEqual(rosterRows({ players, playerIds: ['entered', 'unused'], appearances, events, representative: new Map([['entered', 'GK'], ['unused', 'CM']]) }), [['unused', 'CM'], ['entered', 'LAM → ST']])
})

test('substituted-off starters keep match roles and deleted historical players remain selectable', () => {
  const players = [player('starter', 'ST')]
  const appearances = [
    { playerId: 'starter', teamId: 'A', role: 'starter', position: 'LB' },
    { playerId: 'deleted', teamId: 'A', role: 'bench', position: 'CM' },
  ]
  assert.deepEqual(rosterRows({ players, playerIds: ['starter'], appearances, events: [], representative: new Map([['starter', 'ST']]) }), [['starter', 'LB']])
  const selected = []
  const h = screenHarness(root, 'screens/NewMatchScreen.tsx', 'RosterPlayerGroup', { players: [], matches: [] })
  const tree = h.render({ title: 'Historical bench', group: 'substitute', players: [], playerIds: ['deleted'], appearances, events: [], representative: new Map(), onClick: id => selected.push(id) })
  const button = nodes(tree, node => node.type === 'button')[0]
  assert.equal(button.props['aria-label'], 'Historical player (deleted)')
  assert.equal(nodes(button, node => node.type === 'span')[0].props.children, 'CM')
  button.props.onClick()
  assert.deepEqual(selected, ['deleted'])
})

test('available squad uses the same representative order and stable ties as bench', () => {
  const players = [player('attack', 'GK'), player('mid1', 'ST'), player('defence', 'ST'), player('mid2', 'ST')]
  assert.deepEqual(rosterRows({ group: 'squad', players, representative: new Map([['attack', 'ST'], ['mid1', 'CAM'], ['defence', 'CB'], ['mid2', 'CAM']]) }), [['defence', 'CB'], ['mid1', 'CAM'], ['mid2', 'CAM'], ['attack', 'ST']])
})

test('live substitution bench receives parent representatives for unused entrants', () => {
  const players = [player('defender', 'ST')]
  const representative = new Map([['defender', 'CB']])
  const props = { players, representative, teams: [], selectedTeamId: 'A', liveEvent: 'substitution', slots: [], events: [], pendingSubs: [], substitutionSelection: {}, benchPlayerIds: ['defender'], appearances: [], stats: {} }
  const h = screenHarness(root, 'screens/NewMatchScreen.tsx', 'LiveMatchStep', { players, matches: [] })
  const group = nodes(h.render(props), node => node.type?.name === 'RosterPlayerGroup')[0]
  assert.deepEqual(rosterRows(group.props), [['defender', 'CB']])
})

test('approved page scroll routes exclude player tabs, editor flows and screen-owned ranking controls', () => {
  for (const name of ['home', 'latest-changes', 'chemistry', 'player', 'records', 'records-leaderboard', 'results', 'players']) assert.equal(scroll.hasPageScrollToTop({ name }, defaultScreenState({ name })), true, name)
  for (const name of ['teams', 'match', 'new-match', 'edit-match', 'import-squad', 'season-recap', 'comparison', 'global-ranking', 'award-race']) assert.equal(scroll.hasPageScrollToTop({ name }, defaultScreenState({ name })), false, name)
  for (const tab of ['overview', 'matches', 'players', 'history']) assert.equal(scroll.hasPageScrollToTop({ name: 'team', id: 'A' }, { ...defaultScreenState({ name: 'team', id: 'A' }), tab }), tab !== 'players', tab)
  for (const competitionType of ['league', 'cup', 'champions']) for (const menu of ['players', 'table', 'bracket', 'matches', 'history']) {
    const state = { ...defaultScreenState({ name: 'competition' }), competitionType, [`${competitionType}Menu`]: menu }
    assert.equal(scroll.hasPageScrollToTop({ name: 'competition' }, state), menu === 'matches' || menu === 'players' || competitionType === 'league' && menu === 'history', `${competitionType}:${menu}`)
  }
})

test('team scope keys distinguish tabs and History menus but are stable for equivalent restored state', () => {
  const view = { name: 'team', id: 'A' }
  const history = { ...defaultScreenState(view), tab: 'history', historyMenu: 'honors', historyCompetition: 'all' }
  const key = scroll.pageScrollScopeKey(view, history)
  assert.equal(scroll.pageScrollScopeKey(view, { ...history }), key)
  for (const change of [{ tab: 'matches' }, { historyMenu: 'records' }, { historyCompetition: 'cup' }]) assert.notEqual(scroll.pageScrollScopeKey(view, { ...history, ...change }), key)
})

test('distance visibility reacts to content resize and DOM filtering and cleans up all observers', () => {
  const oldResize = global.ResizeObserver, oldMutation = global.MutationObserver
  const resizes = [], mutations = [], listeners = new Map(), values = []
  global.ResizeObserver = class { constructor(callback) { this.callback = callback; this.targets = new Set(); resizes.push(this) } observe(target) { this.targets.add(target) } unobserve(target) { this.targets.delete(target) } disconnect() { this.targets.clear() } }
  global.MutationObserver = class { constructor(callback) { this.callback = callback; mutations.push(this) } observe() { this.active = true } disconnect() { this.active = false } }
  const content = {}, surface = { children: [content], scrollTop: 499, scrollHeight: 2400, clientHeight: 600, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  try {
    const stop = scroll.observeScrollDistance(surface, 500, value => values.push(value))
    surface.scrollTop = 500; listeners.get('scroll')()
    assert.deepEqual(values, [false, true])
    // A disclosure/filter can change scrollHeight without resizing the viewport.
    const contentResize = resizes.find(observer => observer.targets.has(content))
    assert.ok(contentResize, 'content height must be observed, not only the fixed viewport')
    surface.scrollHeight = 500; contentResize.callback()
    assert.equal(values.at(-1), false)
    surface.scrollHeight = 3000; contentResize.callback()
    assert.equal(values.at(-1), true)
    assert.equal(mutations.length, 1)
    const replacement = {}; surface.children = [replacement]; surface.scrollHeight = 500; mutations[0].callback()
    assert.equal(values.at(-1), false)
    assert.ok(resizes.some(observer => observer.targets.has(replacement)))
    stop()
    assert.equal(listeners.size, 0)
    assert.ok(resizes.every(observer => observer.targets.size === 0))
    assert.equal(mutations[0].active, false)
  } finally { global.ResizeObserver = oldResize; global.MutationObserver = oldMutation }
})
