require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test')
test('measured cards retain every item, exact gaps, variable heights and bounded windows', () => {
  const { MeasuredCardWindow } = require('../src/lib/cardWindow.ts')
  const keys = Array.from({ length: 500 }, (_, i) => String(i))
  const model = new MeasuredCardWindow(keys, 80, 8)
  assert.equal(model.total, 500 * 88 - 8)
  model.measure('0', 120); model.measure('250', 37); model.measure('499', 240)
  assert.equal(model.offset(1), 128)
  assert.equal(model.total, 500 * 88 - 8 + 40 - 43 + 160)
  const reached = new Set()
  for (let offset = -200; offset < model.total + 640; offset += 300) {
    const r = model.window(offset, 640)
    assert(r.start >= 0 && r.end <= 500 && r.end > r.start)
    assert(r.end - r.start < 35)
    assert.equal(r.top + (model.offset(r.end) - model.offset(r.start)) + r.bottom, model.total)
    for (let i = r.start; i < r.end; i++) reached.add(i)
  }
  assert.equal(reached.size, 500)
  assert.equal(model.window(1e9, 640).end, 500)
  const small = new MeasuredCardWindow(['last'], 80, 8)
  assert.equal(small.window(10000, 640).end, 1)
  assert.equal(small.total, 80)
  assert.equal(new MeasuredCardWindow([], 80, 8).total, 0)
})
test('height caches follow IDs after reorder/filter and ignore invalid measurements', () => {
  const { MeasuredCardWindow } = require('../src/lib/cardWindow.ts')
  const cache = new Map(), first = new MeasuredCardWindow(['a', 'b', 'c'], 80, 8, cache)
  first.measure('a', 140); first.measure('b', 35)
  const next = new MeasuredCardWindow(['b', 'a'], 80, 8, cache)
  assert.equal(next.offset(1), 43); assert.equal(next.total, 183)
  next.measure('a', NaN); next.measure('a', 0); next.measure('a', Infinity)
  assert.equal(next.total, 183)
})

test('app-content adapter batches fast scrolls, corrects measured anchors, restores and disposes', () => {
  const { observeCardViewport } = require('../src/lib/cardWindow.ts')
  const prior = { requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame, ResizeObserver: global.ResizeObserver, window: global.window }
  const frames = new Map(), listeners = new Map(), observed = new Set(), unobserved = new Set()
  let next = 0, resize, disconnected = false, width = 390, scrollTop = 0, rows = [], range
  global.requestAnimationFrame = fn => { frames.set(++next, fn); return next }
  global.cancelAnimationFrame = id => frames.delete(id)
  global.ResizeObserver = class { constructor(fn) { resize = fn } observe(row) { observed.add(row) } unobserve(row) { observed.delete(row); unobserved.add(row) } disconnect() { disconnected = true } }
  global.window = { addEventListener() {}, removeEventListener() {} }
  const viewport = { get scrollTop() { return scrollTop }, set scrollTop(value) { scrollTop = value }, clientHeight: 600, clientTop: 0, getBoundingClientRect: () => ({ top: 0 }), addEventListener: (name, fn, options) => { assert.equal(options.passive, true); listeners.set(name, fn) }, removeEventListener: name => listeners.delete(name) }
  const list = { get clientWidth() { return width }, closest: selector => { assert.equal(selector, '.app-content'); return viewport }, getBoundingClientRect: () => ({ top: 200 - scrollTop }), querySelectorAll: () => rows }
  const mount = (start, end, changed = -1) => { rows = Array.from({ length: end - start }, (_, i) => ({ dataset: { cardKey: String(start + i), cardIndex: String(start + i) }, getBoundingClientRect: () => ({ height: (start + i === changed ? 120 : 80) + (start + i < 499 ? 8 : 0) }) })) }
  const flush = () => { for (const [id, fn] of frames) { frames.delete(id); fn() } }
  const owner = {}, keys = Array.from({ length: 500 }, (_, i) => String(i))
  try {
    mount(0, 15)
    const controller = observeCardViewport(list, keys, 80, 8, owner, r => { range = r })
    assert.equal(range.start, 0)
    scrollTop = 1100; mount(5, 22, 5)
    listeners.get('scroll')(); listeners.get('scroll')(); listeners.get('scroll')()
    assert.equal(frames.size, 1); flush()
    assert.equal(scrollTop, 1140, '40px measured above the viewport preserves the visible card')
    assert(unobserved.size > 0)
    listeners.get('app-scroll-to-top')()
    scrollTop = 1100; mount(5, 22, 6); listeners.get('scroll')(); flush()
    assert.equal(scrollTop, 1100, 'height corrections cannot interrupt native smooth scroll-to-top')
    listeners.get('scrollend')()
    mount(5, 22, 6); rows.find(row => row.dataset.cardKey === '7').getBoundingClientRect = () => ({ height: 128 })
    listeners.get('scroll')(); flush()
    assert.equal(scrollTop, 1140, 'anchor correction resumes after the smooth motion ends')
    scrollTop = 50000; mount(488, 500); listeners.get('scroll')(); flush(); assert.equal(range.end, 500)
    scrollTop = 0; listeners.get('scroll')(); flush(); assert.equal(range.start, 0)
    width = 320; mount(0, 15); resize(); flush(); assert.equal(range.start, 0)
    controller.refresh(); controller.dispose(); assert.equal(frames.size, 0); assert.equal(listeners.size, 0); assert(disconnected)
    scrollTop = 20000; mount(210, 235)
    const restored = observeCardViewport(list, keys, 80, 8, owner, r => { range = r })
    assert(range.start > 200 && range.end < 250); restored.dispose()
  } finally { for (const [key, value] of Object.entries(prior)) if (value === undefined) delete global[key]; else global[key] = value }
})
