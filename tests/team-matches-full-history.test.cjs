const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const navigation = require('../src/lib/navigation.ts')
const teams = [{ id: 'A', name: 'Alpha', shortName: 'AAA' }, ...Array.from({ length: 10 }, (_, index) => ({ id: `OP${index + 1}`, name: `Opponent ${index + 1}`, shortName: `OP${index + 1}` }))]
const competitionByDay = { 1: 'league', 2: 'cup', 3: 'league', 4: 'league', 5: 'champions', 6: 'cup', 7: 'league', 8: 'champions' }
const game = (day, overrides = {}) => ({
  id: `match-${day}`, season: 'S1', date: `2026-09-${String(day).padStart(2, '0')}`, matchDay: day,
  competitionType: competitionByDay[day] ?? 'league', competitionStage: competitionByDay[day] === 'cup' ? 'stage1' : competitionByDay[day] === 'champions' ? 'semiFinal' : 'regular',
  teamId: 'A', homeTeamId: 'A', awayTeamId: `OP${day}`, duration: 90, appearances: [], events: [], ...overrides,
})
const matches = [game(3), game(8), game(1), game(6), game(4), game(2), game(7), game(5), game(9, { season: 'S2' }), game(10, { homeTeamId: 'OP9', awayTeamId: 'OP10', teamId: 'OP9' })]
const storePath = require.resolve('../src/store.tsx')
const previousStore = require.cache[storePath]
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ teams, players: [], matches, competitionStates: [] }) } }
const { TeamDetailScreen } = require('../src/screens/TeamDetailScreen.tsx')
if (previousStore) require.cache[storePath] = previousStore
else delete require.cache[storePath]

function renderTeam(competition = 'all', season = 'S1', tab = 'matches') {
  return renderToStaticMarkup(React.createElement(TeamDetailScreen, {
    teamId: 'A', season,
    screenState: { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), tab, matchesCompetition: competition },
    onStateChange() {}, onNavigate() {}, onBack() {},
  }))
}

const opponents = html => [...html.matchAll(/OP(\d+)<\/span>/g)].map(match => Number(match[1]))

test('Team Matches renders every in-season team match newest first without an expansion control', () => {
  const html = renderTeam()
  assert.deepEqual(opponents(html), [8, 7, 6, 5, 4, 3, 2, 1])
  assert.equal(html.includes('View All'), false)
  assert.equal(html.includes('Show Less'), false)
})

test('Team Matches competition filters retain the complete selected scope', () => {
  for (const [competition, expected] of [
    ['league', [7, 4, 3, 1]],
    ['cup', [6, 2]],
    ['champions', [8, 5]],
  ]) {
    assert.deepEqual(opponents(renderTeam(competition)), expected, competition)
  }
})

test('Team Matches keeps the empty scope message without an expansion control', () => {
  const html = renderTeam('champions', 'S2')
  assert.deepEqual(opponents(html), [])
  assert.match(html, /No matches in this scope\./)
  assert.equal(html.includes('View All'), false)
  assert.equal(html.includes('Show Less'), false)
})

test('Overview and Players do not derive or render the Team Matches list', () => {
  const recentModule = require('../src/screens/recentMatches.ts')
  const original = recentModule.recentMatches
  let derivations = 0
  recentModule.recentMatches = (...args) => { derivations++; return original(...args) }
  try {
    for (const tab of ['overview', 'players']) {
      const html = renderTeam('all', 'S1', tab)
      assert.deepEqual(opponents(html), [], tab)
      assert.equal(derivations, 0, tab)
    }
    renderTeam()
    assert.equal(derivations, 1, 'the spy must observe the Matches-tab derivation')
  } finally {
    recentModule.recentMatches = original
  }
})

test('Team Match navigation preserves its Matches filter and scroll on Back', () => {
  const teamState = { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), tab: 'matches', matchesCompetition: 'cup' }
  const team = navigation.createNavigationEntry({ name: 'team', id: 'A' }, teamState)
  const opened = navigation.navigateBrowseEntry([team], { name: 'match', id: 'match-6' }, 372)
  assert.deepEqual(opened.map(entry => entry.view), [{ name: 'team', id: 'A' }, { name: 'match', id: 'match-6' }])
  assert.deepEqual(navigation.popNavigationEntry(opened), [navigation.createNavigationEntry(team.view, teamState, 372)])
})
