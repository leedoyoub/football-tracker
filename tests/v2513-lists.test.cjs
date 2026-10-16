require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test, after } = require('node:test')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineSource } = require('./helpers/v2513-baseline.cjs')
const base = baselineSource(); after(base.cleanup)
const s = performanceFixture(2), noop = () => {}
test('unfiltered Players entry defers historical role work until a card is rendered', () => {
  const positions = require('../src/engine/positionScope.ts'), original = positions.scopedPositionFamilyByPlayer
  let calls = 0; positions.scopedPositionFamilyByPlayer = (...args) => { calls++; return original(...args) }
  try {
    const fresh = performanceFixture(1), nav = require('../src/lib/navigation.ts')
    const tree = screenHarness(base.root, 'screens/PlayersScreen.tsx', 'PlayersScreen', fresh).render({ screenState: nav.defaultScreenState({ name: 'players' }), onStateChange: noop, onNavigate: noop })
    assert.equal(calls, 0)
    renderToStaticMarkup(tree)
    assert(calls > 0 && calls < 30)
  } finally { positions.scopedPositionFamilyByPlayer = original }
})
test('Results and Competition Matches window cards without dropping/reordering any result or action', () => {
  for (const competition of [false, 'league', 'cup', 'champions']) {
    const file = competition ? 'components/CompetitionMatches.tsx' : 'screens/ResultsScreen.tsx', name = competition ? 'CompetitionMatches' : 'ResultsScreen'
    const props = { season: 'Season 1', type: competition, matches: s.matches, teams: s.teams, filters: { teamId: null, period: null }, onFiltersChange: noop, onNavigate: noop, onBack: noop }
    const before = screenHarness(base.directory, file, name, s).render(props), actual = screenHarness(base.root, file, name, s).render(props)
    const cards = nodes(before, n => n.type?.name === 'ResultCard')
    const list = nodes(actual, n => n.type?.name === 'VirtualCardList')[0]
    assert(list, name)
    assert.deepEqual(list.props.rows.map(r => r.match.id), cards.map(n => n.props.result.match.id))
    for (const i of [0, Math.floor(cards.length / 2), cards.length - 1]) assert.equal(renderToStaticMarkup(list.props.renderRow(list.props.rows[i], i)), renderToStaticMarkup(cards[i]))
    const html = renderToStaticMarkup(actual)
    assert((html.match(/data-card-key=/g) ?? []).length < 25)
    assert(html.length < renderToStaticMarkup(before).length / 2)
  }
})
test('Players retains every filtered/search row and exact card markup, with bounded DOM', () => {
  const nav = require('../src/lib/navigation.ts')
  for (const search of ['', 'arsenal', 'absent']) {
    const props = { screenState: { ...nav.defaultScreenState({ name: 'players' }), search }, onStateChange: noop, onNavigate: noop }
    const before = screenHarness(base.directory, 'screens/PlayersScreen.tsx', 'PlayersScreen', s).render(props)
    const actual = screenHarness(base.root, 'screens/PlayersScreen.tsx', 'PlayersScreen', s).render(props)
    const cards = nodes(before, n => n.type === 'button' && n.props?.className?.includes('rounded-2xl'))
    const list = nodes(actual, n => n.type?.name === 'VirtualCardList')[0]
    assert.equal(list.props.rows.length, cards.length)
    list.props.rows.forEach((row, i) => assert.equal(renderToStaticMarkup(list.props.renderRow(row, i)), renderToStaticMarkup(cards[i])))
    assert((renderToStaticMarkup(actual).match(/data-card-key=/g) ?? []).length < 25)
  }
})
