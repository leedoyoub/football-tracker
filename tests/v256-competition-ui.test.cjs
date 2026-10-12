require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { ResultCard } = require('../src/components/ResultCard.tsx')
const { resultCompetitionLabel } = require('../src/lib/competitionResults.ts')
const { derivedResults } = require('../src/lib/results.ts')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const { STATIC_TEAMS } = require('../src/data/teams.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const teams = [{ id: 'A', name: 'A very long recorded team name that must keep the score visible' }, { id: 'B', name: 'Opponent' }]
const game = props => ({ id: 'match', season: 'S1', matchDay: 12, competitionType: 'league', competitionStage: 'regular', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [], duration: 90, date: '2026-10-01', ...props })
function walk(node, predicate, found = []) { if (Array.isArray(node)) node.forEach(n => walk(n, predicate, found)); else if (node && typeof node === 'object') { if (predicate(node)) found.push(node); walk(node.props?.children, predicate, found) } return found }

test('full result card shows canonical metadata and a fixed score with no opponent label or icon', () => {
  const result = derivedResults([game()], teams)[0]
  const html = renderToStaticMarkup(React.createElement(ResultCard, { result, teams, showCompetition: true, onMatchNavigate() {}, onTeamNavigate() {} }))
  assert.match(html, /League · MD 12/)
  assert.doesNotMatch(html, /vs Opponent|Open Opponent team details/)
  assert.match(html, /shrink-0/)
  assert.match(html, /A very long recorded team name/)
})

test('team logo and name navigate to the team, metadata and score navigate to the match without nested buttons', () => {
  const calls = []
  const tree = ResultCard({ result: derivedResults([game()], teams)[0], teams, showCompetition: true, onMatchNavigate: () => calls.push('match'), onTeamNavigate: id => calls.push(id) })
  const teamActions = walk(tree, n => n.type?.name === 'TeamIdentityAction')
  assert.equal(teamActions.length, 2)
  teamActions.forEach(n => n.props.onNavigate(n.props.team.id))
  const matchButtons = walk(tree, n => n.type === 'button')
  assert.equal(matchButtons.length, 2)
  matchButtons.forEach(n => { n.props.onClick(); assert.equal(walk(n.props.children, c => c.type === 'button').length, 0) })
  assert.deepEqual(calls, ['A', 'A', 'match', 'match'])
})

test('result metadata covers Cup, replay, Champions games and incomplete legacy records', () => {
  const rows = [
    [game({ competitionType: 'cup', competitionStage: 'stage3' }), 'Cup · Stage 3'],
    [game({ competitionType: 'cup', competitionStage: 'finalReplay' }), 'Cup · Final Replay'],
    [game({ competitionType: 'champions', competitionStage: 'roundOf16', competitionSeriesGame: 2 }), 'Champions · R16 · Game 2/3'],
    [game({ competitionType: 'champions', competitionStage: 'final', competitionSeriesGame: 1 }), 'Champions · Final · Game 1/2'],
    [game({ competitionType: 'cup', competitionStage: undefined }), 'Cup'],
    [game({ matchDay: undefined }), 'League'],
  ]
  for (const [match, want] of rows) assert.equal(resultCompetitionLabel(match), want)
})

function competitionHarness(matches = []) {
  const store = { teams: STATIC_TEAMS, players: [], matches, competitionStates: [], competitionRevisions: {}, competitionCacheOwner: {}, setChampionsDraw() {}, completeSeason() {} }
  const filename = path.resolve('src/screens/CompetitionScreen.tsx')
  const compiled = new Module(filename, module)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const originalRequire = compiled.require.bind(compiled)
  compiled.require = name => name === '../store' ? { useStore: () => store } : name === 'react' ? {
    ...React, useMemo: fn => fn(), useEffect() {}, useRef: value => ({ current: value }),
    // Make the deferred idle turn ready; retain the real engine/components.
    useState: initial => [initial === 0 ? 3 : initial, () => {}],
  } : originalRequire(name)
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', 'false'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
  let state = defaultScreenState({ name: 'competition' })
  const destinations = []
  const render = () => compiled.exports.CompetitionScreen({ season: 'Season 1', screenState: state, onStateChange: value => { state = value }, onCompetitionTypeChange: type => { state = { ...state, competitionType: type } }, onSeason() {}, onNavigate: view => destinations.push(view) })
  return { render, destinations, get state() { return state }, set state(value) { state = value } }
}

test('all Players menus show ranking then Award Race and the live Best XI Race without bracket/table content', () => {
  const h = competitionHarness()
  for (const type of ['league', 'cup', 'champions']) {
    h.state = { ...h.state, competitionType: type, leagueMenu: 'players', cupMenu: 'players', championsMenu: 'players' }
    const html = renderToStaticMarkup(h.render())
    assert(html.indexOf('Top 10') < html.indexOf('Award Race'), type)
    assert.match(html, /Best XI Race/, type)
    assert.doesNotMatch(html, /Cup table stage|Champions fixed knockout bracket|Historical League Matchday/, type)
  }
})

test('menu switching keeps independent selections, and Matches never runs official standings or player derivations', () => {
  const h = competitionHarness([game({ id: 'one', season: 'Season 1' })])
  const counts = { standings: 0, rankings: 0, awards: 0 }
  const selectors = require('../src/engine/competitionSelectors.ts')
  const stats = require('../src/engine/stats.ts')
  const awards = require('../src/engine/awards.ts')
  const replacements = [[selectors, 'selectLeagueCompetition', 'standings'], [selectors, 'selectCupCompetition', 'standings'], [selectors, 'selectChampionsCompetition', 'standings'], [stats, 'buildGlobalRankingData', 'rankings'], [awards, 'competitionAwardResult', 'awards']]
  const originals = replacements.map(([owner, key, count]) => { const original = owner[key]; owner[key] = (...args) => { counts[count]++; return original(...args) }; return original })
  try {
    const leagueMenu = walk(h.render(), n => n.props?.label === 'League menu')[0]
    leagueMenu.props.onChange('history')
    assert.equal(h.state.leagueMenu, 'history')
    const typeTabs = walk(h.render(), n => n.props?.role === 'tab')
    typeTabs[1].props.onClick()
    walk(h.render(), n => n.props?.label === 'Cup menu')[0].props.onChange('matches')
    assert.equal(h.state.leagueMenu, 'history'); assert.equal(h.state.cupMenu, 'matches'); assert.equal(h.state.championsMenu, 'bracket')
    for (const type of ['league', 'cup', 'champions']) {
      h.state = { ...h.state, competitionType: type, leagueMenu: 'matches', cupMenu: 'matches', championsMenu: 'matches' }
      counts.standings = counts.rankings = counts.awards = 0
      renderToStaticMarkup(h.render())
      assert.deepEqual(counts, { standings: 0, rankings: 0, awards: 0 })
    }
  } finally { replacements.forEach(([owner, key], i) => { owner[key] = originals[i] }) }
})

test('Cup displays 16 team actions, fixed Total and neutral cumulative rows without preview controls', () => {
  const h = competitionHarness()
  h.state = { ...h.state, competitionType: 'cup' }
  const view = walk(h.render(), n => n.type?.name === 'CupView')[0]
  const tree = view.type(view.props)
  const rowButtons = walk(tree, n => n.type === 'button' && String(n.props.className).includes('grid w-full'))
  assert.equal(rowButtons.length, 16)
  rowButtons[0].props.onClick(); assert.equal(h.destinations[0].name, 'team')
  const total = walk(tree, n => n.type === 'button' && n.props.children === 'Total')[0]
  total.props.onClick(); assert.equal(h.state.cupTableStage, 'total')
  const html = renderToStaticMarkup(h.render())
  assert.match(html, /Provisional Standings/)
  assert.doesNotMatch(html, /View All 16|Show Survival Line|At Risk|Eliminated|opacity-60/)
})

test('League History renders only the selected MD in four columns with exact match destinations', () => {
  const first = game({ id: 'md1', season: 'Season 1', teamId: STATIC_TEAMS[0].id, homeTeamId: STATIC_TEAMS[0].id, matchDay: 1 })
  const second = { ...first, id: 'md2', matchDay: 2 }
  const h = competitionHarness([first, second])
  h.state = { ...h.state, leagueMenu: 'history', historyMatchday: 1, historyComparedTeamIds: [STATIC_TEAMS[0].id], historyFocusedTeamId: STATIC_TEAMS[0].id }
  const leagueView = walk(h.render(), n => n.type?.name === 'LeagueView')[0]
  const history = leagueView.type(leagueView.props)
  const tree = history.type(history.props)
  const grid = walk(tree, n => n.props?.['aria-label'] === 'Selected Matchday results')[0]
  assert.match(grid.props.className, /grid-cols-4/)
  const cards = walk(grid, n => n.type === 'button')
  assert.equal(cards.length, 1); cards[0].props.onClick()
  assert.deepEqual(h.destinations, [{ name: 'match', id: 'md1' }])
  const slider = walk(tree, n => n.type === 'input')[0]
  slider.props.onChange({ target: { value: '2' } }); assert.equal(h.state.historyMatchday, 2)
  assert.equal(h.state.historyFocusedTeamId, STATIC_TEAMS[0].id)
})
