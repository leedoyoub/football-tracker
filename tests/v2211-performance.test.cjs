require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test'), path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')

test('team display filtering preserves movement from the same overall league population', () => {
  const fixture = performanceFixture(1)
  fixture.matches = fixture.matches.filter(m => m.competitionType === 'league' && m.matchDay <= 2)
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', fixture)
  let screenState = { ...defaultScreenState({ name: 'global-ranking' }), scope: 'league' }
  const render = () => nodes(h.render({ season: 'Season 1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} }), n => n.type?.name === 'VirtualRankingList')[0]
  let list = render()
  const movement = new Map(list.props.rows.map((row, i) => [row.playerId, list.props.renderRow(row, i).props.movement]))
  screenState = { ...screenState, teamIds: [fixture.teams[0].id] }
  list = render()
  assert(list.props.rows.length > 0)
  for (const [i, row] of list.props.rows.entries()) assert.equal(list.props.renderRow(row, i).props.movement, movement.get(row.playerId))
  screenState = { ...screenState, positionFilters: ['st-ss'] }
  list = render()
  for (const [i, row] of list.props.rows.entries()) assert.equal(list.props.renderRow(row, i).props.movement, null, 'position ranks must not borrow overall movement')
})
