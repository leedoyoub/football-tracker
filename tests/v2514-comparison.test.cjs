require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..'), noop = () => {}
test('Comparison calculates rank families once for summaries and shares same-team ranking', () => {
  const s = performanceFixture(1), position = require('../src/engine/positionScope.ts'), stats = require('../src/engine/stats.ts')
  let familyCalls = 0, teamCalls = 0
  const h = screenHarness(root, 'screens/ComparisonScreen.tsx', 'ComparisonScreen', s, {
    '../engine/positionScope': { ...position, scopedPositionFamilyByPlayer: (...args) => { if (args[2].fallback !== 'none') familyCalls++; return position.scopedPositionFamilyByPlayer(...args) } },
    '../engine/stats': { ...stats, buildGlobalRankingData: (...args) => { if (args[2].teams.length) teamCalls++; return stats.buildGlobalRankingData(...args) } },
  })
  h.render({ season: 'Season 1', screenState: { name: 'comparison', season: null, competition: 'all', teamId: null, leftId: s.players[9].id, rightId: s.players[10].id }, onStateChange: noop, onNavigate: noop })
  assert.equal(familyCalls, 1); assert.equal(teamCalls, 1)
})
test('Comparison picker windows hundreds of candidates, keeps search input and full candidate extent', () => {
  const s = performanceFixture(1), h = screenHarness(root, 'screens/ComparisonScreen.tsx', 'PlayerSelect', {})
  const props = { label: 'Left player', value: s.players[0].id, players: s.players, teams: s.teams, representative: new Map(), excludedId: '', onChange: noop }
  const first = h.render(props), buttons = nodes(first, n => n.type === 'button')
  assert(buttons.length < 30); assert(buttons.length > 1)
  assert(nodes(first, n => n.props?.['data-virtual-row']).length > 0)
  nodes(first, n => n.type === 'input')[0].props.onChange({ target: { value: s.players[15].name } })
  const searched = h.render(props)
  assert.equal(nodes(searched, n => n.type === 'input')[0].props.value, s.players[15].name)
  assert(nodes(searched, n => n.type === 'button').length < 5)
})

test('two picker layout observers scroll independently through first, middle and final players', () => {
  const s = performanceFixture(1), frames = new Map(), prior = { window: global.window, requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame, ResizeObserver: global.ResizeObserver }
  let frameId = 0, chosen
  global.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
  global.cancelAnimationFrame = id => frames.delete(id)
  global.ResizeObserver = class { observe() {} disconnect() {} }
  global.window = { addEventListener() {}, removeEventListener() {} }
  const flush = () => { for (const [id, fn] of frames) { frames.delete(id); fn() } }
  function picker(label) {
    const h = screenHarness(root, 'screens/ComparisonScreen.tsx', 'PlayerSelect', {}), listeners = new Map()
    let offset = 0
    const viewport = { clientTop: 0, clientHeight: 128, getBoundingClientRect: () => ({ top: 0 }), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
    const list = { closest() { throw Error('picker must not use app-content') }, getBoundingClientRect: () => ({ top: -offset }), querySelector: () => ({ getBoundingClientRect: () => ({ height: 42 }) }) }
    const props = { label, value: '', excludedId: '', players: s.players, teams: s.teams, representative: new Map(), onChange: id => chosen = id }
    const tree = h.render(props)
    nodes(tree, n => n.type === 'div' && n.props.className?.includes('overflow-y-auto'))[0].props.ref.current = viewport
    nodes(tree, n => n.props?.style?.overflowAnchor === 'none')[0].props.ref.current = list
    const stop = h.effects[0]()
    return { render: () => h.render(props), scroll(value) { offset = value; listeners.get('scroll')(); flush() }, stop, listeners }
  }
  try {
    const left = picker('Left player'), right = picker('Right player')
    nodes(left.render(), n => n.props?.['data-virtual-row'])[0].props.onClick()
    assert.equal(chosen, s.players[0].id)
    left.scroll(7000)
    const middle = nodes(left.render(), n => n.props?.['data-virtual-row'])[0]
    assert(middle.props['data-virtual-row'] !== s.players[0].id)
    middle.props.onClick(); assert.equal(chosen, middle.props['data-virtual-row'])
    assert.equal(nodes(right.render(), n => n.props?.['data-virtual-row'])[0].props['data-virtual-row'], s.players[0].id)
    left.scroll(s.players.length * 42 - 128)
    const last = nodes(left.render(), n => n.props?.['data-virtual-row']).at(-1)
    assert.equal(last.props['data-virtual-row'], s.players.at(-1).id)
    last.props.onClick(); assert.equal(chosen, s.players.at(-1).id)
    left.scroll(0); assert.equal(nodes(left.render(), n => n.props?.['data-virtual-row'])[0].props['data-virtual-row'], s.players[0].id)
    left.stop(); right.stop(); assert.equal(left.listeners.size + right.listeners.size, 0)
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete global[key]; else global[key] = value }
  }
})
