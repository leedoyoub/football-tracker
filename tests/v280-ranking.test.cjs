require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { RANKING_METRICS } = require('../src/lib/rankingMetrics.ts')
const { defaultScreenState, pushNavigationEntry, popNavigationEntry, updateCurrentScreenState } = require('../src/lib/navigation.ts')
const { saveLastRoute, loadLastNavigationEntry } = require('../src/lib/lastRoute.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')

const root = path.resolve(__dirname, '..')
const filter = { seasons: [], teams: [], positions: [] }
const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, teamId, position })
const appearance = (p, role = 'starter') => ({ playerId: p.id, teamId: p.teamId, position: p.position, role })
const match = (id, teamId, appearances, events = [], season = 'S1', competitionType = 'league') => ({
  id, date: '2026-01-01', season, duration: 95, competitionType, teamId, homeTeamId: teamId, awayTeamId: 'O', appearances, events,
})
const sub = (id, playerInId, playerOutId, minute) => ({ id, type: 'sub', minute, teamId: 'A', playerInId, playerOutId })

test('Appearances is a shared default metric before Minutes and includes recorded terminal substitutions', () => {
  assert.deepEqual(RANKING_METRICS.map(({ label }) => label), [
    'Rating', 'Goals', 'Assists', 'G+A', 'Appearances', 'Minutes', 'MOM', 'Goals/90',
    'Assists/90', 'G+A/90', 'Clean Sheets', 'Saves', 'Save %',
  ])
  const players = ['full', 'zs', 'short', 'terminal', 'unused'].map(id => player(id))
  const [full, starter, short, terminal, unused] = players
  const games = [
    match('1', 'A', [
      { ...appearance(full), positionHistory: [{ minute: 10, position: 'CM' }, { minute: 45, position: 'ST' }] },
      appearance(starter), appearance(short, 'bench'), appearance(terminal, 'bench'), appearance(unused, 'bench'),
    ], [sub('ordinary', 'short', 'zs', 30), sub('final', 'terminal', 'short', 95)]),
    match('2', 'A', [appearance(starter), appearance(full)]),
  ]
  const base = buildGlobalRankingData(players, games, filter, 'rating')
  assert.deepEqual(base.map(row => row.playerId).sort(), ['full', 'short', 'zs'])
  const expected = [['full', 2, 180], ['zs', 2, 120], ['short', 1, 60], ['terminal', 1, 0]]
  const actual = rows => rows.map(row => [row.playerId, row.value, row.minutes])
  assert.deepEqual(actual(rankGlobalRankingRows(base, players, 'appearances')), expected)
  assert.deepEqual(actual(buildGlobalRankingData(players, games, filter, 'appearances')), expected)
  assert.deepEqual(rankGlobalRankingRows(base, players, 'rating').map(row => row.playerId).sort(), ['full', 'short', 'zs'])
  const revised = [match('1', 'A', games[0].appearances, games[0].events.slice(0, 1)), games[1]]
  assert.equal(rankGlobalRankingRows(buildGlobalRankingData(players, revised, filter, 'rating'), players, 'appearances').some(row => row.playerId === 'terminal'), false)
})

test('Filtered and Overall display the same scoped players and values with their respective ranks', () => {
  const players = [player('leader', 'A', 'CM'), player('transferred', 'C'), player('middle', 'A'), player('wing', 'B', 'RW')]
  const teams = ['A', 'B', 'C'].map(id => ({ id, name: id, shortName: id }))
  const scores = (id, teamId, p, goals, season, competition) => match(id, teamId, [appearance({ ...p, teamId })],
    Array.from({ length: goals }, (_, i) => ({ id: `${id}:${i}`, type: 'goal', minute: i + 10, teamId, playerId: p.id })), season, competition)
  const matches = [
    scores('1', 'A', players[0], 6), scores('2', 'B', players[1], 1), scores('3', 'A', players[2], 3),
    scores('4', 'B', players[3], 2), scores('5', 'C', players[1], 3), scores('6', 'B', players[3], 12, 'S2'),
    scores('7', 'B', players[3], 7, 'S1', 'cup'),
  ]
  const view = { name: 'global-ranking', season: 'S1', competitionType: 'league', rankingMetric: 'goals' }
  let screenState = { ...defaultScreenState(view), teamIds: ['B', 'C'], positionFilters: ['st-ss', 'lw-rw'] }
  const h = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', { players, teams, matches })
  const render = () => h.render({ season: 'S1', screenState, onStateChange: next => { screenState = next }, onNavigate() {}, onBack() {} })
  const rows = tree => nodes(tree, n => n.type?.name === 'VirtualRankingList')[0].props.rows.map(row => [row.playerId, row.value, row.rank])
  const toggle = tree => nodes(tree, n => n.type === 'button' && (n.props.children === 'Filtered' || n.props.children === 'Overall'))
  const initial = render()
  assert.deepEqual(rows(initial), [['transferred', 4, 1], ['wing', 2, 2]])
  assert.equal(toggle(initial).length, 1)
  assert.equal(toggle(initial)[0].props.children, 'Filtered')
  assert.match(toggle(initial)[0].props.className, /bg-emerald-500/)
  toggle(initial)[0].props.onClick()
  const overall = render()
  assert.deepEqual(rows(overall), [['transferred', 4, 2], ['wing', 2, 4]])
  assert.equal(toggle(overall)[0].props.children, 'Overall')
  assert.match(toggle(overall)[0].props.className, /bg-zinc-900/)
  assert.deepEqual(screenState.teamIds, ['B', 'C'])
  assert.deepEqual(screenState.positionFilters, ['st-ss', 'lw-rw'])
  const metrics = nodes(overall, n => n.type?.name === 'RankingMetricTabs')[0]
  metrics.props.onChange('appearances')
  assert.equal(toggle(render())[0].props.children, 'Overall')
  screenState = { ...screenState, metric: 'goals', teamIds: [], positionFilters: [] }
  const unfilteredOverall = render()
  toggle(unfilteredOverall)[0].props.onClick()
  assert.deepEqual(rows(render()), rows(unfilteredOverall))
})

test('Appearances ranks duplicate saved IDs once and applies only their credited minutes', () => {
  const p = player('p')
  const played = match('duplicate', 'A', [appearance(p)])
  const rows = buildGlobalRankingData([p], [played, { ...played }], filter, 'appearances')
  assert.deepEqual(rows.map(row => [row.value, row.minutes]), [[1, 90]])
})

test('Ranking mode defaults to Filtered and survives opening details, re-entry and reload', () => {
  const previousWindow = global.window
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  global.window = { localStorage: storage }
  try {
    const view = { name: 'global-ranking', season: 'S1', competitionType: 'league', rankingMetric: 'appearances' }
    const p = player('p'), matches = [match('1', 'A', [appearance(p)])]
    const store = { players: [p], teams: [{ id: 'A' }], matches }
    assert.equal(defaultScreenState(view).rankMode, 'filtered')
    let history = pushNavigationEntry([], view, 0)
    const h = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', store)
    const tree = h.render({ season: 'S1', screenState: history[0].screenState, onStateChange: next => { history = updateCurrentScreenState(history, next) }, onNavigate() {}, onBack() {} })
    nodes(tree, n => n.type === 'button' && n.props.children === 'Filtered')[0].props.onClick()
    const detail = pushNavigationEntry(history, { name: 'player', id: 'p' }, 120)
    assert.equal(popNavigationEntry(detail)[0].screenState.rankMode, 'overall')
    assert.equal(defaultScreenState(view).rankMode, 'overall')
    saveLastRoute(view, undefined, storage, history[0].screenState)
    const reloaded = loadLastNavigationEntry(store, storage)
    assert.equal(reloaded.view.rankingMetric, 'appearances')
    assert.equal(reloaded.screenState.metric, 'appearances')
    assert.equal(reloaded.screenState.rankMode, 'overall')
  } finally {
    if (previousWindow === undefined) delete global.window
    else global.window = previousWindow
  }
})
