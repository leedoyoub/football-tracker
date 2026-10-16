require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { representativeMatchPosition } = require('../src/engine/playerMatchFacts.ts')
const { matchDisplayPositionSegments, creditedPositionSegments } = require('../src/engine/timeline.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const root = path.resolve(__dirname, '..')
const p = (id = 'p', position = 'CM', teamId = 'A') => ({ id, name: `Player ${id}`, number: 10, position, teamId })
const a = (id = 'p', position = 'CM', matchPosition = 'CAM', teamId = 'A') => ({ playerId: id, teamId, role: 'starter', position, matchPosition })
const m = (appearances = [a()], extra = {}) => ({ id: 'm', season: 'S1', date: '2026-01-01', matchDay: 1, duration: 90, competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events: [], ...extra })
const teams = ['A', 'B', 'C'].map(id => ({ id, name: id, shortName: id }))

test('match card represents actual longest played position and deterministic first-played ties', () => {
  for (const [registered, actual] of [['CM', 'CAM'], ['ST', 'LW'], ['CAM', 'LAM'], ['CAM', 'RAM']]) {
    const appearance = a('p', registered, actual); const match = m([appearance])
    assert.equal(representativeMatchPosition(match, appearance), actual)
    assert.equal(creditedPositionSegments(match, appearance)[0].position, actual === 'LAM' || actual === 'RAM' ? 'CAM' : actual)
  }
  for (const [minute, expected] of [[60, 'LW'], [30, 'CAM'], [45, 'LW']]) {
    const appearance = { ...a('p', 'ST', 'LW'), positionHistory: [{ minute, position: 'CAM' }] }
    assert.equal(representativeMatchPosition(m([appearance]), appearance), expected)
  }
})

test('display timeline preserves saved tactical slots, same-family changes and legacy certainty', () => {
  const appearance = { ...a(), positionHistory: [{ minute: 30, position: 'CAM', tacticalSlotId: 'RCAM' }, { minute: 60, position: 'CM' }] }
  const match = m([appearance], { kickoffLineup: [{ id: 'LCAM', playerId: 'p', matchPosition: 'CAM', displayPosition: 'LAM', x: 30, y: 36 }] })
  const original = JSON.stringify(match)
  assert.deepEqual(matchDisplayPositionSegments(match, appearance).map(s => [s.enter, s.exit, s.position]), [[0, 30, 'LAM'], [30, 60, 'RAM'], [60, 90, 'CM']])
  assert.equal(representativeMatchPosition(match, appearance), 'LAM')
  assert.equal(JSON.stringify(match), original)
  assert.equal(representativeMatchPosition(m(), a()), 'CAM')
  assert.equal(representativeMatchPosition(m([{ ...a(), matchPosition: undefined }]), { ...a(), matchPosition: undefined }), 'CM')
})

test('substitution entry labels and stoppage-time moves follow actual intervals without changing official time', () => {
  const appearance = { ...a('p', 'ST', 'ST'), role: 'bench', positionHistory: [{ minute: 92, position: 'CM' }] }
  const match = m([appearance], { duration: 95, events: [{ id: 'sub', type: 'sub', teamId: 'A', minute: 60, playerInId: 'p', playerOutId: 'other', position: 'CAM', tacticalSlotId: 'RCAM' }] })
  assert.equal(representativeMatchPosition(match, appearance), 'RAM')
  assert.deepEqual(matchDisplayPositionSegments(match, appearance).map(s => [s.enter, s.exit, s.position]), [[60, 92, 'RAM'], [92, 95, 'CM']])
  assert.equal(creditedPositionSegments(match, appearance).reduce((n, s) => n + s.exit - s.enter, 0), 30)
})

test('match card goal/assist icons use canonical on-pitch team and same-minute ordering', () => {
  const player = p(); const appearance = { ...a(), role: 'bench' }
  const match = m([appearance], { events: [
    { id: 'before', type: 'goal', teamId: 'A', minute: 60, sequence: 0, playerId: 'p', assistPlayerId: 'p' },
    { id: 'on', type: 'sub', teamId: 'A', minute: 60, sequence: 1, playerInId: 'p', playerOutId: 'x', position: 'LW' },
    { id: 'after', type: 'goal', teamId: 'A', minute: 60, sequence: 2, playerId: 'p', assistPlayerId: 'p' },
    { id: 'wrong-team', type: 'goal', teamId: 'B', minute: 70, playerId: 'p', assistPlayerId: 'p' },
  ] })
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'MatchRow', {})
  const tree = h.render({ match, player, displayCacheHit: false, onNavigate() {} })
  assert.equal(nodes(tree, n => n.type === 'span' && n.props.children === '⚽').length, 1)
  assert.equal(nodes(tree, n => n.type === 'span' && n.props.children === '👟').length, 1)
  assert.equal(nodes(tree, n => n.type === 'span' && n.props.children === 'LW').length, 1)
})

test('Rating Details summary omits duplicate position/time and retains expandable trace', () => {
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'RatingDetails', {})
  const tree = h.render({ match: m(), player: p(), rating: { position: 'CAM', minutes: 90 }, displayCacheHit: false })
  assert.equal(nodes(tree, n => n.type === 'summary')[0].props.children, 'Rating Details')
  assert.equal(typeof tree.props.onToggle, 'function')
})

function directory(players, matches, filters, search = '') {
  const h = screenHarness(root, 'screens/PlayersScreen.tsx', 'PlayersScreen', { players, teams, matches })
  const tree = h.render({ screenState: { ...defaultScreenState({ name: 'players' }), filters, search }, onStateChange() {}, onNavigate() {} })
  return nodes(tree, n => n.type === 'button' && n.key !== null).map(n => n.key)
}
const f = (seasons = [], teams = [], positions = []) => ({ seasons, teams, positions })

test('Players classifies selected seasons/teams/intersection using played minutes, preserving career search', () => {
  const players = [p(), p('never', 'RW', 'B')]
  const matches = [m([a()], { id: 'old' }), m([a('p', 'CM', 'RW', 'C')], { id: 'new', season: 'S2', homeTeamId: 'C', teamId: 'C' })]
  assert.deepEqual(directory(players, matches, f(['S2'], [], ['RW'])), ['p'])
  assert.deepEqual(directory(players, matches, f([], ['C'], ['RW'])), ['p'])
  assert.deepEqual(directory(players, matches, f(['S2'], ['C'], ['RW'])), ['p'])
  assert.deepEqual(directory(players, matches, f(['S1'], ['C'], ['RW'])), [])
  assert.deepEqual(directory(players, matches, f(['S2'], [], ['CAM'])), [])
  assert.deepEqual(directory(players, matches, f(['S2'], [], ['RW']), 'never'), [])
  assert.deepEqual(directory(players, matches, f([], [], ['CAM'])), ['p'])
  assert.deepEqual(directory(players, matches, f([], [], ['RW']), 'never'), ['never'])
  assert.deepEqual(directory(players, matches, f(['S1', 'S2'], ['A', 'C'], ['CAM'])), ['p'])
})

test('No Team uses current membership, season intersection and recorded positions without invented appearances', () => {
  const released = p('p', 'ST', ''); const never = p('never', 'RW', '')
  const matches = [m([a('p', 'ST', 'CAM')])]
  assert.deepEqual(directory([released, never], matches, f([], ['__no-team__'])).sort(), ['never', 'p'])
  assert.deepEqual(directory([released, never], matches, f(['S2'], ['__no-team__'])), [])
  assert.deepEqual(directory([released, never], matches, f(['S1'], ['__no-team__'], ['CAM'])), ['p'])
  assert.deepEqual(directory([released, never], matches, f([], ['__no-team__'], ['RW'])), ['never'])
  assert.deepEqual(directory([released, never], matches, f(['S1'], ['__no-team__'], ['RW'])), [])
  assert.deepEqual(directory([released], matches, f(['S1'], ['C', '__no-team__'], ['CAM'])), ['p'])
})

test('Positions Played keeps normalized CAM and every positive-minute position in selected competition', () => {
  const player = p(); const match = m([{ ...a('p', 'CM', 'LAM'), positionHistory: [{ minute: 45, position: 'CAM', tacticalSlotId: 'RCAM' }, { minute: 85, position: 'ST' }] }])
  const data = derivePlayerScope(player, [player], [match], { season: 'S1', competition: 'league' })
  assert.deepEqual([...data.positionMinutes], [['CAM', 85], ['ST', 5]])
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', { players: [player], teams, matches: [match], competitionStates: [] })
  const tree = h.render({ playerId: 'p', season: 'S1', screenState: defaultScreenState({ name: 'player', id: 'p' }), onStateChange() {}, onNavigate() {}, onBack() {} })
  const section = nodes(tree, n => n.type === 'section' && nodes(n.props.children, c => c.type === 'h2' && c.props.children === 'Positions Played').length)[0]
  assert.deepEqual(nodes(section, n => n.type === 'b').map(n => n.props.children), ['CAM', 'ST'])
})

test('opening a deleted historical player retains access to recorded matches without a fabricated rating', () => {
  const match = m([a('deleted', 'CM', 'CAM')], { events: [{ id: 'goal', type: 'goal', playerId: 'deleted', teamId: 'A', minute: 20 }] })
  const bytes = JSON.stringify(match)
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', { players: [], teams, matches: [match], competitionStates: [] })
  const { renderToStaticMarkup } = require('react-dom/server')
  const tree = h.render({ playerId: 'deleted', season: 'S1', screenState: { ...defaultScreenState({ name: 'player', id: 'deleted' }), season: 'S1' }, onStateChange() {}, onNavigate() {}, onBack() {} })
  const html = renderToStaticMarkup(tree)
  assert.match(html, /Historical player \(deleted\)/)
  assert.match(html, /CAM/); assert.match(html, /90/); assert.match(html, /⚽/)
  assert.match(html, /Rating unavailable/)
  assert.doesNotMatch(html, /Player not found|Edit player|6\.0|6\.00/)
  assert.equal(JSON.stringify(match), bytes)
})
