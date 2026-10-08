const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { trendPlotWidth, scrollTrendToLatest, positionHistoryLabelVisible, recentFormLabelColor } = require('../src/lib/trendPlot.ts')

test('trend plots keep roughly ten points visible and scroll their own viewport to latest', () => {
  assert.equal(trendPlotWidth(3), 300)
  assert(trendPlotWidth(20) > 500)
  const viewport = { scrollLeft: 0, scrollWidth: 650 }
  scrollTrendToLatest(viewport)
  assert.equal(viewport.scrollLeft, 650)
})

test('League Position History labels every solo point and only focused multi-team history', () => {
  assert.equal(positionHistoryLabelVisible(1, null, 'A', 0, 4), true)
  assert.equal(positionHistoryLabelVisible(3, null, 'A', 0, 4), false)
  assert.equal(positionHistoryLabelVisible(3, null, 'A', 3, 4), true)
  assert.equal(positionHistoryLabelVisible(3, 'A', 'A', 0, 4), true)
  assert.equal(positionHistoryLabelVisible(3, 'A', 'B', 0, 4), false)
  assert.equal(positionHistoryLabelVisible(3, 'A', 'B', 3, 4), true)
})

test('Recent Form label color gives canonical MOM priority over rating thresholds', () => {
  assert.equal(recentFormLabelColor(5.5, true), '#60a5fa')
  assert.equal(recentFormLabelColor(7.2, false), '#34d399')
  assert.equal(recentFormLabelColor(6.0, false), '#fb923c')
  assert.equal(recentFormLabelColor(5.99, false), '#f87171')
})
