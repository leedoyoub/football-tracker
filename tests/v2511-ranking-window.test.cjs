require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const { rankingWindow, observeRankingViewport } = require('../src/lib/rankingWindow.ts')

test('position-filtered League rankings do not build hidden movement analytics', () => {
  const path = require('node:path')
  const { screenHarness } = require('./helpers/v259-harness.cjs')
  const { defaultScreenState } = require('../src/lib/navigation.ts')
  const store = { players: [], teams: [], matches: [] }
  let calls = 0
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', store, {
    '../engine/seasonAnalytics': { buildSeasonAnalytics() { calls++; return { playerSnapshots: new Map(), currentMatchDay: 0 } }, rankingMovement() { return new Map() } },
  })
  const screenState = { ...defaultScreenState({ name: 'global-ranking' }), scope: 'league', positionFilter: 'gk' }
  h.render({ season: 'S1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} })
  assert.equal(calls, 0)
})

test('viewport window preserves total height and covers top, middle, bottom and overscan at different sizes', () => {
  for (const rowHeight of [53, 66.5, 106]) for (const viewportHeight of [320, 640, 1000]) for (const offset of [-230, 0, 3333, 17000, 99999]) {
    const range = rankingWindow(350, rowHeight, offset, viewportHeight)
    assert.ok(range.start >= 0 && range.end <= 350 && range.end > range.start)
    assert.ok(range.end - range.start <= Math.ceil(viewportHeight / rowHeight) + 13)
    assert.equal(range.top + (range.end - range.start) * rowHeight + range.bottom, 350 * rowHeight)
    const index = Math.min(349, Math.max(0, Math.floor(offset / rowHeight)))
    assert.ok(range.start <= index && range.end > index)
    if (offset >= 350 * rowHeight) assert.equal(range.end, 350)
  }
})
test('every player is reachable without truncation and results shrinking past current scroll stay valid', () => {
  const seen = new Set()
  for (let offset = 0; offset <= 350 * 53; offset += 320) {
    const r = rankingWindow(350, 53, offset, 640)
    for (let i = r.start; i < r.end; i++) seen.add(i)
  }
  assert.equal(seen.size, 350); assert.ok(seen.has(349))
  assert.deepEqual(rankingWindow(0, 53, 20000, 640), { start: 0, end: 0, top: 0, bottom: 0, rowHeight: 53 })
  const r = rankingWindow(3, 53, 20000, 640)
  assert.equal(r.end, 3); assert.ok(r.start < 3)
})
test('rendered virtual list updates absolute ranks, player actions and full-height spacers after scroll and resize', () => {
  const path = require('node:path')
  const React = require('react')
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
  const frames = new Map(); const listeners = new Map(); let nextId = 0; let resize
  const prior = { requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame, ResizeObserver: global.ResizeObserver, window: global.window }
  global.requestAnimationFrame = fn => { frames.set(++nextId, fn); return nextId }
  global.cancelAnimationFrame = id => frames.delete(id)
  global.ResizeObserver = class { constructor(fn) { resize = fn } observe() {} disconnect() {} }
  global.window = { addEventListener() {}, removeEventListener() {} }
  const flush = () => { for (const [id, fn] of frames) { frames.delete(id); fn() } }
  let offset = -200; let height = 640; let measuredHeight = 53; let clicked
  const viewport = { clientTop: 0, get clientHeight() { return height }, getBoundingClientRect: () => ({ top: 0 }), addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const list = { closest: () => viewport, getBoundingClientRect: () => ({ top: -offset }), querySelector: () => ({ getBoundingClientRect: () => ({ height: measuredHeight }) }) }
  const rows = Array.from({ length: 350 }, (_, i) => ({ playerId: `p${i}`, value: i }))
  const props = { rows, renderRow: (row, index) => React.createElement('button', { onClick: () => { clicked = row.playerId }, 'data-rank': index + 1 }, row.playerId) }
  const h = screenHarness(path.resolve(__dirname, '..'), 'components/VirtualRankingList.tsx', 'VirtualRankingList', {})
  try {
    let tree = h.render(props); tree.props.ref.current = list
    const stop = h.effects[0]()
    tree = h.render(props)
    assert.ok(nodes(tree, n => n.props?.role === 'listitem').length < 30)
    offset = 350 * 53 - height; listeners.get('scroll')(); flush()
    tree = h.render(props)
    let items = nodes(tree, n => n.props?.role === 'listitem')
    assert.equal(items.at(-1).props['aria-posinset'], 350)
    assert.equal(items.at(-1).key, 'p349')
    nodes(items.at(-1), n => n.type === 'button')[0].props.onClick(); assert.equal(clicked, 'p349')
    assert.equal(items.at(-1).props['aria-setsize'], 350)
    // A metric switch can reorder every player without resetting native scroll.
    tree = h.render({ ...props, rows: rows.slice().reverse() })
    items = nodes(tree, n => n.props?.role === 'listitem')
    assert.equal(items.at(-1).props['aria-posinset'], 350)
    assert.equal(items.at(-1).key, 'p0')
    assert.equal(offset, 350 * 53 - height)
    // Simulate Scroll to Top / restored scroll with the same app container.
    offset = 0; listeners.get('scroll')(); flush(); tree = h.render(props)
    assert.equal(nodes(tree, n => n.props?.role === 'listitem')[0].props['aria-posinset'], 1)
    measuredHeight = 80; height = 320; resize(); flush(); tree = h.render(props)
    const spacers = nodes(tree, n => n.props?.['aria-hidden'] === 'true')
    items = nodes(tree, n => n.props?.role === 'listitem')
    assert.equal(spacers[0].props.style.height + spacers[1].props.style.height + items.length * 80, 350 * 80)
    stop()
    // Re-mount at a restored middle position, then shrink beyond that position.
    offset = 10000; tree = h.render(props); const restoreStop = h.effects[0](); tree = h.render(props)
    assert.ok(nodes(tree, n => n.props?.role === 'listitem')[0].props['aria-posinset'] > 100)
    restoreStop()
    tree = h.render({ ...props, rows: rows.slice(0, 3) }); const shortStop = h.effects[0](); tree = h.render({ ...props, rows: rows.slice(0, 3) })
    assert.equal(nodes(tree, n => n.props?.role === 'listitem').at(-1).props['aria-posinset'], 3)
    shortStop()
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete global[key]; else global[key] = value }
  }
})
test('passive app-content observer measures real row height, batches fast scrolling, handles resize/restoration and cleans up', () => {
  const frames = new Map(); let frameId = 0; const listeners = new Map(); let resizeCallback; let disconnected = false
  const prior = { requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame, ResizeObserver: global.ResizeObserver, window: global.window }
  global.requestAnimationFrame = fn => { frames.set(++frameId, fn); return frameId }
  global.cancelAnimationFrame = id => frames.delete(id)
  const observerTargets = []
  global.ResizeObserver = class { constructor(fn) { resizeCallback = fn } observe(t) { observerTargets.push(t) } disconnect() { disconnected = true } }
  global.window = { addEventListener() {}, removeEventListener() {} }
  let offset = -200; let height = 640; let rowHeight = 53
  const viewport = { clientTop: 0, get clientHeight() { return height }, getBoundingClientRect: () => ({ top: 10 }), addEventListener: (name, fn, opts) => { assert.equal(opts.passive, true); listeners.set(name, fn) }, removeEventListener: name => listeners.delete(name) }
  const row = { getBoundingClientRect: () => ({ height: rowHeight }) }
  const list = { closest: cls => { assert.equal(cls, '.app-content'); return viewport }, getBoundingClientRect: () => ({ top: 10 - offset }), querySelector: () => row }
  const updates = []
  try {
    const stop = observeRankingViewport(list, 350, r => updates.push(r))
    assert.equal(updates.length, 1); assert.ok(observerTargets.includes(viewport)); assert.ok(observerTargets.includes(row))
    offset = 10000
    listeners.get('scroll')(); listeners.get('scroll')(); listeners.get('scroll')()
    assert.equal(frames.size, 1)
    for (const [id, fn] of frames) { frames.delete(id); fn() }
    assert.ok(updates.at(-1).start > 100)
    offset = 18550; height = 1000; rowHeight = 66.5; resizeCallback()
    for (const [id, fn] of frames) { frames.delete(id); fn() }
    assert.equal(updates.at(-1).top % 66.5, 0)
    offset = 0; listeners.get('scroll')()
    for (const [id, fn] of frames) { frames.delete(id); fn() }
    assert.equal(updates.at(-1).start, 0)
    listeners.get('scroll')(); stop()
    assert.equal(frames.size, 0); assert.equal(listeners.size, 0); assert.equal(disconnected, true)
  } finally {
    for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete global[key]; else global[key] = value }
  }
})
