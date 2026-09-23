const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const {
  createNavigationEntry,
  defaultScreenState,
  popNavigationEntry,
  pushNavigationEntry,
  replaceNavigationEntry,
  resetNavigationEntries,
  sameTeamBackTarget,
  snapshotScroll,
} = require('../src/lib/navigation.ts')

test('push snapshots prior scroll and pop restores the exact prior route, state, and scroll', () => {
  const recordsState = {
    ...defaultScreenState({ name: 'records' }),
    category: 'player', competition: 'cup', positionFilter: 'cam',
    expandedLeaderboardId: 'hat-tricks', historyPanel: 'monthly', historySeason: 'Season 2', historyBlock: 4,
  }
  const initial = [createNavigationEntry({ name: 'records' }, recordsState)]
  const pushed = pushNavigationEntry(initial, { name: 'player', id: 'p1' }, 842)
  assert.equal(pushed[0].scrollTop, 842)
  assert.deepEqual(pushed[0].screenState, recordsState)
  assert.deepEqual(popNavigationEntry(pushed), [createNavigationEntry({ name: 'records' }, recordsState, 842)])
  assert.equal(initial[0].scrollTop, 0, 'helpers must not mutate prior entries')
})

test('snapshot, replace, and root-tab reset are immutable entry operations', () => {
  const entries = [createNavigationEntry({ name: 'home' }), createNavigationEntry({ name: 'new-match', teamId: 'A' })]
  const snapped = snapshotScroll(entries, 1, 120)
  const replaced = replaceNavigationEntry(snapped, { name: 'match', id: 'm1' })
  assert.deepEqual(replaced.map(entry => entry.view), [{ name: 'home' }, { name: 'match', id: 'm1' }])
  assert.equal(replaced[1].scrollTop, 0)
  assert.deepEqual(resetNavigationEntries({ name: 'teams' }), [createNavigationEntry({ name: 'teams' })])
  assert.equal(entries[1].scrollTop, 0)
})

test('BACK TO TEAM pops only for the immediately previous same Team Detail and otherwise replaces', () => {
  const same = [createNavigationEntry({ name: 'team', id: 'A' }), createNavigationEntry({ name: 'match', id: 'm1' })]
  assert.deepEqual(sameTeamBackTarget(same, 'A'), { action: 'pop' })

  const other = [createNavigationEntry({ name: 'results' }), createNavigationEntry({ name: 'match', id: 'm1' })]
  const target = sameTeamBackTarget(other, 'A')
  assert.equal(target.action, 'replace')
  assert.deepEqual(target.entry.view, { name: 'team', id: 'A' })
})

test('defaults retain every approved state-bearing screen field', () => {
  assert.deepEqual(defaultScreenState({ name: 'home' }), { name: 'home', leaderMetric: 'rating', positionFilter: 'all' })
  assert.deepEqual(defaultScreenState({ name: 'match', id: 'm1' }), { name: 'match', tab: 'facts' })
  assert.deepEqual(defaultScreenState({ name: 'global-ranking', season: 'Season 3', competitionType: 'cup', rankingMetric: 'assists' }), {
    name: 'global-ranking', metric: 'assists', scope: 'cup', positionFilter: 'all', teamId: null, viewAll: false,
  })
  assert.deepEqual(defaultScreenState({ name: 'team', id: 'A' }), {
    name: 'team', tab: 'overview', bestPlayersSeason: null, bestPlayersCompetition: 'all', bestPlayersMetric: 'rating', matchesCompetition: 'all', expandedContext: null,
  })
  assert.deepEqual(defaultScreenState({ name: 'competition', competitionType: 'champions', rankingMetric: 'mom' }), {
    name: 'competition', competitionType: 'champions', tab: 'players', rankingMetric: 'mom', positionFilter: 'all',
    bestXiMode: 'season', viewAllMetric: null, cupViewAll: false, compareMode: false, comparedPlayerIds: [], rankingTeamIds: [],
    historyMatchday: null, historyComparedTeamIds: [],
  })
  assert.deepEqual(defaultScreenState({ name: 'records' }), {
    name: 'records', category: 'player', competition: 'all', positionFilter: 'all', filterSeasonIds: [], filterTeamIds: [], expandedLeaderboardId: null,
    historyPanel: null, historySeason: null, historyBlock: null,
  })
  assert.deepEqual(defaultScreenState({ name: 'comparison', leftId: 'p1', rightId: 'p2', season: 'Season 3', competitionType: 'cup' }), {
    name: 'comparison', leftId: 'p1', rightId: 'p2', season: 'Season 3', competition: 'cup', teamId: null,
  })
})

test('screens use root navigation operations instead of route-shaped local memory', () => {
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const match = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  const newMatch = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  const newPlayer = fs.readFileSync(require.resolve('../src/screens/NewPlayerScreen.tsx'), 'utf8')
  const data = fs.readFileSync(require.resolve('../src/screens/DataManagementScreen.tsx'), 'utf8')
  for (const removed of ['teamTabMemory', 'leagueViewMemory', 'rankingMetricMemory', 'homeLeaderMemory', 'scrollPositions']) {
    assert(!app.includes(removed), `${removed} must not remain in App`)
  }
  assert.match(app, /sameTeamBackTarget\(prev, teamId\)/)
  assert.match(match, /onClick=\{onBack\}/)
  assert.match(match, /onBackToTeam\(teamId\)/)
  assert.match(newMatch, /onReplace\(\{ name: 'match', id: draftId \}\)/)
  assert.match(newMatch, /onClick=\{\(\) => \{ if \(editingMatchId\) clearDraftMatch\(\); onBack\(\) \}\}/)
  assert.match(newPlayer, /onReplace\(\{ name: 'player', id/)
  assert.match(newPlayer, /onClick=\{onBack\}/)
  assert.match(data, /onClick=\{onBack\}/)
})
