const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { resetCompetitionTypeScroll } = require('../src/lib/competitionTypeScroll.ts')

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
