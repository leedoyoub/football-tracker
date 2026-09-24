const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { resetCompetitionTypeScroll } = require('../src/lib/competitionTypeScroll.ts')
const { ensureHorizontalTabVisible } = require('../src/lib/horizontalTabScroll.ts')
const { createNavigationEntry, popNavigationEntry, pushNavigationEntry } = require('../src/lib/navigation.ts')
const { restoreScrollWhenReachable } = require('../src/lib/scrollRestoration.ts')

test('metric tab visibility changes only horizontal scroll and preserves the outer vertical scroll', () => {
  const container = { scrollLeft: 0, clientWidth: 100, scrollTop: 700 }
  ensureHorizontalTabVisible(container, { offsetLeft: 140, offsetWidth: 30 })
  assert.equal(container.scrollLeft, 70)
  assert.equal(container.scrollTop, 700)
})

test('metric tab visibility scrolls left when the selected tab is before the horizontal viewport', () => {
  const container = { scrollLeft: 80, clientWidth: 100, scrollTop: 700 }
  ensureHorizontalTabVisible(container, { offsetLeft: 20, offsetWidth: 30 })
  assert.equal(container.scrollLeft, 20)
  assert.equal(container.scrollTop, 700)
})

test('metric tab visibility leaves an already-visible selected tab unchanged', () => {
  const container = { scrollLeft: 40, clientWidth: 100, scrollTop: 700 }
  ensureHorizontalTabVisible(container, { offsetLeft: 60, offsetWidth: 30 })
  assert.equal(container.scrollLeft, 40)
  assert.equal(container.scrollTop, 700)
})

test('RankingMetricTabs does not use vertical scrollIntoView', () => {
  const source = fs.readFileSync(require.resolve('../src/components/RankingRow.tsx'), 'utf8')
  assert.equal(source.includes('scrollIntoView'), false)
  assert.match(source, /ensureHorizontalTabVisible\(viewport, item\)/)
})

test('Competition Back restores its saved scroll position without a type-reset call', () => {
  const competition = createNavigationEntry({ name: 'competition', competitionType: 'league' }, undefined, 700)
  const pushed = pushNavigationEntry([competition], { name: 'player', id: 'p1' }, 700)
  const returned = popNavigationEntry(pushed)
  assert.equal(returned[0].scrollTop, 700)
  const container = { scrollTop: 0, scrollHeight: 1400, clientHeight: 700 }
  let frame = null
  restoreScrollWhenReachable(container, returned[0].scrollTop, callback => { frame = callback; return 1 }, () => {})
  frame?.()
  assert.equal(container.scrollTop, 700)
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  assert.match(app, /restoreScroll\.current = true/)
})

test('Competition type changes always reset the app-owned scroll surface to zero', () => {
  for (const [from, to] of [['league', 'cup'], ['cup', 'champions'], ['champions', 'league']]) {
    const container = { scrollTop: 318 }
    resetCompetitionTypeScroll(container)
    assert.equal(container.scrollTop, 0, `${from} to ${to}`)
  }
})

test('Competition type scroll reset is inert without the App scroll owner', () => {
  assert.doesNotThrow(() => resetCompetitionTypeScroll(null))
})

test('only the App-owned Competition type callback can reset vertical competition scroll', () => {
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const screen = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  assert.match(app, /resetCompetitionTypeScroll\(scrollRef\.current\)/)
  assert.match(app, /onCompetitionTypeChange=\{onCompetitionTypeChange\}/)
  assert.match(screen, /onCompetitionTypeChange\(value\)/)
  assert.match(screen, /if \(value !== type\) onCompetitionTypeChange\(value\)/)
  assert.equal(screen.includes('window.scrollTo'), false)
  assert.equal(screen.includes('querySelector'), false)
  assert.equal(screen.includes('setPlayerMetric(value); onCompetitionTypeChange'), false)
  assert.equal(screen.includes('setTab(value); onCompetitionTypeChange'), false)
})
