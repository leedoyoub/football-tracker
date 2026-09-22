const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const history = require('../src/engine/historyReadModels.ts')
const source = path => fs.readFileSync(require.resolve('../' + path), 'utf8')

test('History entry uses a lightweight season shell and keeps Awards internal', () => {
  const records = source('src/screens/RecordsScreen.tsx')
  const screen = source('src/screens/RecordsHistory.tsx')
  assert(records.includes("category === 'history' && <RecordsHistory"))
  assert(!records.includes("category === 'awards' &&"))
  for (const token of ['>Timeline<', '>Awards<', "panel === 'timeline'", 'openSeason === season && <TimelineDetail', 'openSeason === season && <AwardsDetail']) assert(screen.includes(token), token)
  assert(!screen.includes('useState('), 'history drill-down state must be owned by NavigationEntry')
})

test('History read models build only on first opened detail and reuse unchanged data', () => {
  const teams = []; const players = []; const matches = []; const states = []
  history.clearHistoryReadModelCache()
  assert.deepEqual(history.historyReadModelDiagnostics(), { timelineBuilds: 0, awardBuilds: 0, monthlyBuilds: 0 })
  const first = history.historyTimelineForSeason(teams, players, matches, states, 'S1')
  assert.equal(history.historyReadModelDiagnostics().timelineBuilds, 1)
  assert.strictEqual(history.historyTimelineForSeason(teams, players, matches, states, 'S1'), first)
  assert.equal(history.historyReadModelDiagnostics().timelineBuilds, 1)
  history.historyAwardsForSeason(teams, players, matches, states, 'S1', 'all')
  assert.equal(history.historyReadModelDiagnostics().awardBuilds, 1)
  history.historyAwardsForSeason(teams, players, matches, states, 'S1', 'all')
  assert.equal(history.historyReadModelDiagnostics().awardBuilds, 1)
  history.historyMonthlyAward(teams, players, matches, 'S1', 1)
  assert.equal(history.historyReadModelDiagnostics().monthlyBuilds, 1)
  history.historyMonthlyAward(teams, players, matches, 'S1', 1)
  assert.equal(history.historyReadModelDiagnostics().monthlyBuilds, 1)
})

test('History cache invalidates naturally when an edited match array has new identity', () => {
  const teams = []; const players = []; const states = []; const original = []; const edited = []
  history.clearHistoryReadModelCache()
  history.historyTimelineForSeason(teams, players, original, states, 'S1')
  history.historyTimelineForSeason(teams, players, edited, states, 'S1')
  assert.equal(history.historyReadModelDiagnostics().timelineBuilds, 2)
})
