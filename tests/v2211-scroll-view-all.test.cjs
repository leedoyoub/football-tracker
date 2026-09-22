const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { createScrollToTopController, scrollViewAllSection } = require('../src/components/scrollToTop.ts')

test('active View All control stays hidden until its section leaves view and returns to that section header', () => {
  const observations = []
  const controller = createScrollToTopController((callback) => ({ observe: () => observations.push(callback), disconnect() {} }), () => {})
  assert.equal(controller.visible, false)
  controller.observe({})
  observations[0]([{ isIntersecting: false }])
  assert.equal(controller.visible, true)
  observations[0]([{ isIntersecting: true }])
  assert.equal(controller.visible, false)

  const calls = []
  scrollViewAllSection({ scrollIntoView: options => calls.push(options) })
  assert.deepEqual(calls, [{ behavior: 'smooth', block: 'start' }])
})

test('floating controls are attached only to active expanded ranking sections', () => {
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  const globalRanking = fs.readFileSync(require.resolve('../src/screens/GlobalRankingScreen.tsx'), 'utf8')
  const competition = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  assert(!records.includes('</div><FloatingScrollToTop />'), 'Records must not render an unconditional page-level control')
  assert.match(records, /activeGroup.*FloatingScrollToTop/s)
  assert.match(globalRanking, /rows\.length > 10.*FloatingScrollToTop/s)
  assert.match(competition, /all && rows\.length > 10.*FloatingScrollToTop/s)
  assert(!competition.includes('rows.slice(0, all ? 50 : 10)'), 'expanded competition rankings must not retain a 50-row cap')
})
