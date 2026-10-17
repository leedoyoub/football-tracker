require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { sourceModule, screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const b = baselineSource(); after(b.cleanup); const root = path.resolve(__dirname, '..')
test('onPitchStats does not filter the full match collection once per player', () => {
  const s = performanceFixture(1); let scans = 0
  s.matches.filter = function(...args) { scans++; return Array.prototype.filter.apply(this, args) }
  require('../src/engine/analytics.ts').onPitchStats(s.players, s.matches, { season: 'Season 1' })
  assert(scans <= 1, `match collection scans ${scans}`)
})
test('onPitchStats preserves every row, order and interval under transfers, duplicates and event edits', () => {
  const s = performanceFixture(1), old = require(path.join(b.directory, 'src/engine/analytics.ts')), current = require('../src/engine/analytics.ts')
  s.matches[0].appearances.unshift({ ...s.matches[0].appearances[0], role: 'bench' })
  for (const matches of [s.matches, s.matches.slice(1), s.matches.map((m, i) => i === 0 ? { ...m, events: [] } : m)]) for (const filter of [{}, { season: 'Season 1' }, { season: 'Season 1', teamId: s.teams[0].id }]) assert.deepEqual(current.onPitchStats(s.players, matches, filter), old.onPitchStats(s.players, matches, filter))
})
test('Player restore only asks position scope for the selected player', () => {
  const s = performanceFixture(1), actual = require('../src/engine/positionScope.ts'); let count = 0
  const mod = sourceModule(root, 'lib/lastRoute.ts', { '../engine/positionScope': { ...actual, scopedPositionFamilyByPlayer: (players, ...args) => { count = players.length; return actual.scopedPositionFamilyByPlayer(players, ...args) } } })
  const storage = { getItem: () => JSON.stringify({ version: 2, view: { name: 'player', id: s.players[9].id }, screenState: { name: 'player', season: 'Season 1', competition: 'all', rankTrendMetric: 'goals' } }) }
  const restored = mod.loadLastNavigationEntry(s, storage)
  assert.equal(restored.screenState.rankTrendMetric, 'goals'); assert.equal(count, 1)
})
test('Latest Changes and News reuse shared measured cards for long results', () => {
  const s = performanceFixture(1)
  for (const [name, engine, fn] of [['LatestChangesScreen', '../engine/latestChanges', 'deriveLatestChanges'], ['SeasonHighlightScreen', '../engine/news', 'majorNewsEvents']]) {
    const rows = Array.from({ length: 70 }, (_, i) => ({ id: `event:${i}`, title: 'title', detail: 'detail', playerIds: [], teamIds: [], items: [] }))
    const h = screenHarness(root, `screens/${name}.tsx`, name, s, { [engine]: { [fn]: () => rows } })
    const tree = h.render({ season: 'Season 1', kind: 'news', onNavigate() {}, onBack() {} })
    const list = nodes(tree, n => n.type?.name === 'VirtualCardList')[0]
    assert(list); assert.equal(list.props.rows, rows)
  }
})
