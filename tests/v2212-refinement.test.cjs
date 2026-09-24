const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { POSITION_FILTER_OPTIONS } = require('../src/components/PositionFilter.tsx')
const { PositionFilter } = require('../src/components/PositionFilter.tsx')
const { restoreScrollWhenReachable } = require('../src/lib/scrollRestoration.ts')
const { createNavigationEntry, popNavigationEntry, teamDetailBackEntries } = require('../src/lib/navigation.ts')
const { presentMatchChanges } = require('../src/lib/matchChangePresentation.ts')
const { buildGlobalRankingData } = require('../src/engine/stats.ts')

test('shared compact PositionFilter exposes exactly the approved families', () => {
  assert.deepEqual(POSITION_FILTER_OPTIONS.map(option => option.label), ['All', 'ST/SS', 'LW/RW', 'CAM', 'LM/RM', 'CM', 'CDM', 'FB', 'CB', 'GK'])
  for (const file of ['HomeScreen.tsx', 'GlobalRankingScreen.tsx', 'RecordsScreen.tsx']) {
    const source = fs.readFileSync(require.resolve(`../src/screens/${file}`), 'utf8')
    assert.match(source, /<PositionFilter/)
  }
  const records = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  assert.match(records, /category === 'player'.*PositionFilter/s)
})

test('PositionFilter visibly identifies its active filter in the compact trigger', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const html = renderToStaticMarkup(React.createElement(PositionFilter, { value: 'st-ss', onChange: () => {}, label: 'Season Leaders position' }))
  assert.match(html, /Season Leaders position/)
  assert.match(html, />ST\/SS <span/)
  assert.match(html, /aria-haspopup="menu"/)
})

test('position filter is applied before ranking Top N on Home and Global Ranking', () => {
  for (const file of ['HomeScreen.tsx', 'GlobalRankingScreen.tsx']) {
    const source = fs.readFileSync(require.resolve(`../src/screens/${file}`), 'utf8')
    assert.match(source, /positions:\s*positionFilterFamilies\(screenState\.positionFilter\)/)
  }
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert.match(home, /rankGlobalRankingRows\(rankingIndex, players, metric\)\.slice\(0, 5\)/)
  assert(!home.includes('new Map(RANKING_METRICS.map'), 'Home must not eagerly rank every metric')
})

test('the FB filter keeps historically credited fullbacks and excludes other position families', () => {
  const players = [
    { id: 'fb', name: 'Fullback', teamId: 'A', position: 'LB', number: 3 },
    { id: 'st', name: 'Striker', teamId: 'A', position: 'ST', number: 9 },
  ]
  const match = { id: 'fb-match', season: 'Season 1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', events: [], appearances: [
    { playerId: 'fb', teamId: 'A', position: 'LB', role: 'starter' },
    { playerId: 'st', teamId: 'A', position: 'ST', role: 'starter' },
  ] }
  assert.deepEqual(buildGlobalRankingData(players, [match], { seasons: ['Season 1'], teams: [], positions: ['FB'] }, 'rating').map(row => row.playerId), ['fb'])
})

test('root scroll restoration survives a delayed layout beyond the first eight frames', () => {
  let frame
  let attempts = 0
  const container = {
    scrollTop: 0,
    get scrollHeight() { return attempts < 12 ? 200 : 1200 },
    clientHeight: 100,
  }
  const cancel = restoreScrollWhenReachable(container, 800, callback => { frame = callback; return 1 }, () => {})
  while (frame) { const next = frame; frame = undefined; attempts++; next() }
  assert.equal(container.scrollTop, 800)
  assert(attempts >= 12)
  assert(attempts <= 240)
  cancel()
})

test('Team Detail page Back resets to Teams while drill-down pop and Match Back to Team stay distinct', () => {
  const team = createNavigationEntry({ name: 'team', id: 'A' }, undefined, 640)
  const player = createNavigationEntry({ name: 'player', id: 'p1' })
  assert.deepEqual(popNavigationEntry([team, player]), [team])
  assert.deepEqual(teamDetailBackEntries(), [createNavigationEntry({ name: 'teams' })])
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  const teamScreen = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  const match = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert.match(app, /onBackToTeams/)
  assert.match(teamScreen, /onClick=\{onBackToTeams\}/)
  assert.match(match, /onBackToTeam\(teamId\)/)
})

test('Results View All is unbounded and Match Changes retain every canonical group with fallback presentation', () => {
  const results = fs.readFileSync(require.resolve('../src/screens/ResultsScreen.tsx'), 'utf8')
  const match = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert(!results.includes('.slice(0, 20)'))
  assert.match(results, /Completed matches.*newest first/)
  assert.match(match, /ChangePresentation/)
  assert.match(match, /fallback/)
  assert(!match.includes('changes.slice'))
})

test('Match Changes presentation keeps every player and unscoped canonical group exactly once', () => {
  const presented = presentMatchChanges([
    { id: 'player', playerId: 'p1', title: 'Cole Palmer · Changes', detail: 'climbs 2 places to #3 in Goals · takes #1 in G+A', eventIds: ['a', 'b'], items: [{ id: 'a', kind: 'ranking', label: 'climbs 2 places to #3 in Goals' }, { id: 'b', kind: 'ranking', label: 'takes #1 in G+A' }] },
    { id: 'team', title: 'Team milestone', detail: 'wins 10 matches', eventIds: ['c'], items: [{ id: 'c', kind: 'milestone', label: 'wins 10 matches' }] },
  ])
  assert.equal(presented.length, 2)
  assert.deepEqual(presented.map(change => change.id), ['player', 'team'])
  assert.equal(presented[0].title, 'Cole Palmer')
  assert.equal(presented[0].category, 'takeover')
  assert.deepEqual(presented[0].secondary, ['climbs 2 places to #3 in Goals'])
  assert.equal(presented[1].fallback, true)
})

test('Match Changes keeps canonical labels atomic and prioritizes rare event identity', () => {
  const presented = presentMatchChanges([{
    id: 'player', playerId: 'p1', title: 'Cole Palmer · Changes',
    detail: 'Cole Palmer · Season 10 Goals · Cole Palmer scores 4 in one match',
    eventIds: ['milestone:p1:goals:season:Season 1:10', 'rare:m1:p1:performance'],
    items: [
      { id: 'milestone:p1:goals:season:Season 1:10', kind: 'milestone', label: 'Cole Palmer · Season 10 Goals' },
      { id: 'rare:m1:p1:performance', kind: 'performance', label: 'Cole Palmer scores 4 in one match' },
    ],
  }])
  assert.equal(presented[0].primary, 'Cole Palmer scores 4 in one match')
  assert.deepEqual(presented[0].secondary, ['Cole Palmer · Season 10 Goals'])
  assert.equal(presented[0].category, 'rare')
})

test('v2.3.4 keeps package, lockfile, app version, rating revision, and storage namespace aligned', () => {
  const { APP_VERSION } = require('../src/config.ts')
  const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
  const repository = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  assert.equal(APP_VERSION, '2.3.4')
  assert.equal(require('../package.json').version, '2.3.4')
  assert.equal(require('../package-lock.json').version, '2.3.4')
  assert.equal(require('../package-lock.json').packages[''].version, '2.3.4')
  assert.equal(RATING_ENGINE_REVISION, 10)
  assert(repository.includes("STORAGE_KEY = 'football-tracker-v1'"))
})
