require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test'), path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')

test('Overall team and position filters preserve league movement, while Filtered ranks omit overall movement', () => {
  const fixture = performanceFixture(1)
  fixture.matches = fixture.matches.filter(m => m.competitionType === 'league' && m.matchDay <= 2)
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', fixture)
  let screenState = { ...defaultScreenState({ name: 'global-ranking' }), scope: 'league', rankMode: 'overall' }
  const render = () => nodes(h.render({ season: 'Season 1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} }), n => n.type?.name === 'VirtualRankingList')[0]
  let list = render()
  const movement = new Map(list.props.rows.map(row => [row.playerId, list.props.renderRow(row).props.movement]))
  assert([...movement.values()].some(value => value !== null))
  screenState = { ...screenState, teamIds: [fixture.teams[0].id] }
  list = render()
  assert(list.props.rows.length > 0)
  for (const row of list.props.rows) assert.equal(list.props.renderRow(row).props.movement, movement.get(row.playerId))
  screenState = { ...screenState, positionFilters: ['st-ss'] }
  list = render()
  assert(list.props.rows.length > 0)
  for (const row of list.props.rows) assert.equal(list.props.renderRow(row).props.movement, movement.get(row.playerId))
  const overallIds = list.props.rows.map(row => row.playerId)
  screenState = { ...screenState, rankMode: 'filtered' }
  list = render()
  assert.deepEqual(list.props.rows.map(row => row.playerId), overallIds)
  for (const row of list.props.rows) assert.equal(list.props.renderRow(row).props.movement, null)
})
