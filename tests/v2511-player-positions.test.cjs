require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const root = path.resolve(__dirname, '..')
const player = { id: 'p', name: 'P', number: 10, position: 'CAM', teamId: 'A' }
const teams = [{ id: 'A', name: 'A', shortName: 'A' }]
function game(id, position, history = [], extra = {}) {
  return { id, season: 'S1', date: '2026-01-01', matchDay: 1, duration: 90, competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'CAM', matchPosition: position, positionHistory: history }], events: [], ...extra }
}
function section(matches, competition = 'all') {
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', { players: [player], teams, matches })
  const tree = h.render({ playerId: 'p', season: 'S1', screenState: { ...defaultScreenState({ name: 'player', id: 'p' }), competition }, onStateChange() {}, onNavigate() {}, onBack() {} })
  return nodes(tree, n => n.type === 'section' && nodes(n, c => c.type === 'h2' && c.props.children === 'Positions Played').length)[0]
}
const labels = node => nodes(node, n => n.type === 'b').map(n => n.props.children)
const shares = node => nodes(node, n => n.type === 'span' && n.props.className === 'tabular-nums').map(n => n.props.children[0])
test('all played normalized positions remain visible with decimal shares, including below 1%', () => {
  const matches = [game('one', 'LAM', [{ minute: 80, position: 'RAM' }, { minute: 85, position: 'RW' }, { minute: 89.5, position: 'ST' }])]
  assert.deepEqual(labels(section(matches)), ['CAM', 'RW', 'ST'])
  assert.deepEqual(shares(section(matches)), ['94.4%', '5.0%', '0.6%'])
  assert.deepEqual([...derivePlayerScope(player, [player], matches, { season: 'S1' }).positionMinutes], [['CAM', 85], ['RW', 4.5], ['ST', .5]])
})
test('tiny positive share is not presented as zero and zero-minute positions are excluded', () => {
  const matches = [game('tiny', 'CAM', [{ minute: 89.99, position: 'ST' }, { minute: 90, position: 'CM' }])]
  assert.deepEqual(labels(section(matches)), ['CAM', 'ST'])
  assert.deepEqual(shares(section(matches)), ['100.0%', '<0.1%'])
})
test('position shares follow selected season and competition; an empty scope has no positions', () => {
  const matches = [game('league', 'CAM'), game('cup', 'RW', [], { competitionType: 'cup' }), game('old', 'CB', [], { season: 'Old' })]
  assert.deepEqual(labels(section(matches)), ['CAM', 'RW'])
  assert.deepEqual(shares(section(matches)), ['50.0%', '50.0%'])
  assert.deepEqual(labels(section(matches, 'cup')), ['RW'])
  assert.deepEqual(labels(section(matches, 'champions')), [])
  assert.deepEqual(labels(section([game('unused', 'ST', [], { appearances: [{ playerId: 'p', teamId: 'A', role: 'bench', position: 'ST' }] })])), [])
})
