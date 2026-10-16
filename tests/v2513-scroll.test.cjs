require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const core = require('../src/components/scrollToTop.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const path = require('node:path')
test('new scroll controls cover exactly the six requested route families', () => {
  for (const name of ['player', 'records', 'records-leaderboard', 'results', 'players']) assert.equal(core.hasPageScrollToTop({ name }, defaultScreenState({ name })), true, name)
  for (const name of ['home', 'teams', 'team', 'match', 'new-match', 'chemistry', 'comparison', 'global-ranking', 'award-race']) assert.equal(core.hasPageScrollToTop({ name }, defaultScreenState({ name })), false, name)
  for (const competitionType of ['league', 'cup', 'champions']) for (const menu of ['players', 'table', 'bracket', 'matches', 'history']) {
    const state = { ...defaultScreenState({ name: 'competition' }), competitionType, [`${competitionType}Menu`]: menu }
    assert.equal(core.hasPageScrollToTop({ name: 'competition' }, state), menu === 'matches')
  }
})
test('native app-content distance observer toggles at 500, handles short lists and disposes', () => {
  const listeners = new Map(), values = []
  const surface = { scrollTop: 0, scrollHeight: 2000, clientHeight: 600, addEventListener: (name, fn, options) => { assert.equal(options.passive, true); listeners.set(name, fn) }, removeEventListener: name => listeners.delete(name) }
  const stop = core.observeScrollDistance(surface, 500, value => values.push(value))
  assert.deepEqual(values, [false])
  for (const top of [499, 500, 1500, 0]) { surface.scrollTop = top; listeners.get('scroll')() }
  assert.deepEqual(values, [false, true, false])
  surface.scrollTop = 900; surface.scrollHeight = 500; listeners.get('scroll')()
  assert.equal(values.at(-1), false)
  stop(); assert.equal(listeners.size, 0)
})

test('distance button scrolls only its owning surface, announces smooth motion, hides at top and cleans up', () => {
  const listeners = new Map(), motions = [], calls = []
  const surface = { scrollTop: 900, scrollHeight: 3000, clientHeight: 600,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name),
    dispatchEvent: event => { motions.push(event.type); return true },
    scrollTo: options => { calls.push(options); surface.scrollTop = options.top; listeners.get('scroll')() },
  }
  const h = screenHarness(path.resolve(__dirname, '..'), 'components/FloatingScrollToTop.tsx', 'FloatingScrollToTop', {})
  let tree = h.render({ distance: 500 })
  const sentinel = nodes(tree, n => n.type === 'span')[0]
  assert.equal(sentinel.props.className, 'absolute h-0 w-0')
  sentinel.props.ref.current = { closest: selector => { assert.equal(selector, '.app-content'); return surface } }
  const dispose = h.effects[0]()
  tree = h.render({ distance: 500 })
  const button = nodes(tree, n => n.type === 'button')[0]
  assert.match(button.props.className, /safe-area-inset-bottom/)
  button.props.onClick()
  assert.deepEqual(motions, ['app-scroll-to-top'])
  assert.deepEqual(calls, [{ top: 0, behavior: 'smooth' }])
  assert.equal(nodes(h.render({ distance: 500 }), n => n.type === 'button').length, 0)
  dispose(); assert.equal(listeners.size, 0)
  assert.equal(h.render({ active: false, distance: 500 }), null)
})
