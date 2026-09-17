const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

test('v2.2.3 home is compact and routes each consolidated detail destination', () => {
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  for (const token of ['Season dashboard', 'Recent Matches', 'News', 'Season Leaders', 'slice(0, 5)', 'slice(0, 4)', "kind: 'news'", 'rankingMetric']) assert(home.includes(token), token)
  assert(!/play.?style/i.test(home) && !home.includes('Show More'))
})

test('team play style is absent from active source while old saved fields remain ignorable', () => {
  const active = ['src/App.tsx', 'src/screens/HomeScreen.tsx', 'src/screens/NewTeamScreen.tsx', 'src/screens/EditTeamScreen.tsx', 'src/types.ts', 'src/data/teams.ts'].map(file => fs.readFileSync(file, 'utf8')).join('\n')
  assert(!/play.?style/i.test(active))
  assert(!fs.existsSync('src/engine/playStyleStats.ts') && !fs.existsSync('src/screens/PlayStyleDetailScreen.tsx'))
})

test('ranking scopes and comparison styling use canonical metadata with rounded safe comparisons', () => {
  const ranks = fs.readFileSync(require.resolve('../src/engine/seasonAnalytics.ts'), 'utf8')
  const detail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  const compare = fs.readFileSync(require.resolve('../src/screens/ComparisonScreen.tsx'), 'utf8')
  for (const token of ['scopedMetricRanks', 'historicalTeamId', 'positionFamily']) assert(ranks.includes(token), token)
  for (const token of ['ranks.rating', 'ranks.goals', 'ranks.assists', 'RankedMetric']) assert(detail.includes(token), token)
  for (const token of ["type Direction = 'higher' | 'lower' | 'neutral'", 'const METRICS: Metric[]', "direction: 'lower'", "direction: 'neutral'", 'toFixed(2)', 'better value']) assert(compare.includes(token), token)
})
