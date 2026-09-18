const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { createScrollToTopController, scrollViewAllSurface } = require('../src/components/scrollToTop.ts')
const { playerRecordGroups } = require('../src/engine/playerRecords.ts')

test('v2.2.8 floating control starts hidden, becomes fixed after selector leaves, smooth-scrolls, and hides on return', () => {
  const observations = []
  const calls = []
  const controller = createScrollToTopController((callback) => ({ observe: () => observations.push(callback), disconnect: () => calls.push('disconnect') }), () => calls.push('scroll'))
  assert.equal(controller.visible, false)
  controller.observe({})
  observations[0]([{ isIntersecting: false }])
  assert.equal(controller.visible, true)
  assert.equal(controller.fixedClassName.includes('fixed'), true)
  controller.scrollToTop()
  assert.deepEqual(calls, ['scroll'])
  observations[0]([{ isIntersecting: true }])
  assert.equal(controller.visible, false)
})

test('v2.2.8 floating control scrolls the View All container rather than an unrelated page window', () => {
  const calls = []
  scrollViewAllSurface({ scrollTo: options => calls.push(options) })
  assert.deepEqual(calls, [{ top: 0, behavior: 'smooth' }])
})

test('v2.2.8 Player Records keeps exact-final-10 semantics in the shared leaderboard directly after 9.0+', () => {
  const groups = playerRecordGroups([{ id: 'p', name: 'P', metrics: { eightRatings: 2, nineRatings: 1, tenRatings: 1 } }])
  assert.deepEqual(groups.slice(0, 3).map(group => group.title), ['Most 8.0+ Ratings', 'Most 9.0+ Ratings', 'Most 10.0 Ratings'])
  assert.equal(groups[2].rows[0].numeric, 1)
  assert.equal(groups[2].rows[0].detail, 'final canonical 10.0 ratings')
})
