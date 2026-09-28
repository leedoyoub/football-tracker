const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const root = path.resolve(__dirname, '..')
const source = file => fs.readFileSync(path.join(root, file), 'utf8')

test('Records uses one canonical leaderboard adapter and limits every ranking preview to Top 3', () => {
  const adapter = require('../src/screens/recordsLeaderboards.ts')
  assert.equal(typeof adapter.recordsLeaderboardGroups, 'function')
  const records = source('src/screens/RecordsScreen.tsx')
  assert.match(records, /recordsLeaderboardGroups/)
  assert.match(records, /rows\.slice\(0, 3\)/)
  assert.doesNotMatch(records.slice(0, records.indexOf('function PlayerRecords')), /expandedLeaderboardId/)
})

test('Records reuses the shared compact Position and Team filters before opening a leaderboard', () => {
  const records = source('src/screens/RecordsScreen.tsx')
  const activeScreen = records.slice(0, records.indexOf('function PlayerRecords'))
  assert.match(records, /<PositionFilter/)
  assert.match(records, /<TeamFilter/)
  assert.doesNotMatch(activeScreen, /RankingFilterButton/)
})

test('Records View All pushes a dedicated scoped leaderboard entry and Back preserves the Records entry', () => {
  const navigation = require('../src/lib/navigation.ts')
  const types = source('src/types.ts')
  const app = source('src/App.tsx')
  assert.match(types, /name: 'records-leaderboard'/)
  const recordsState = { ...navigation.defaultScreenState({ name: 'records' }), category: 'team', competition: 'cup', positionFilter: 'fb', filterSeasonIds: ['Season 2'], filterTeamIds: ['A'] }
  const entries = [navigation.createNavigationEntry({ name: 'records' }, recordsState)]
  const pushed = navigation.pushNavigationEntry(entries, { name: 'records-leaderboard', category: 'team', leaderboardId: 'wins' }, 321)
  assert.equal(pushed[0].scrollTop, 321)
  assert.deepEqual(navigation.popNavigationEntry(pushed), [navigation.createNavigationEntry({ name: 'records' }, recordsState, 321)])
  assert.match(app, /RecordsLeaderboardScreen/)
  assert.match(source('src/screens/RecordsScreen.tsx'), /name: 'records-leaderboard'/)
})

test('Records has no inline ranking expansion state or legacy expandable leaderboard renderer', () => {
  const records = source('src/screens/RecordsScreen.tsx')
  const types = source('src/types.ts')
  const navigation = source('src/lib/navigation.ts')
  assert.doesNotMatch(records, /expandedLeaderboardId|ApprovedCombinationRecords|function Leaderboard|Show Less/)
  assert.doesNotMatch(types, /expandedLeaderboardId/)
  assert.doesNotMatch(navigation, /expandedLeaderboardId/)
})
