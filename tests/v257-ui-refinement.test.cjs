require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { derivedResults } = require('../src/lib/results.ts')
const navigation = require('../src/lib/navigation.ts')
const { resolvePlayerDestination } = require('../src/lib/playerNavigation.ts')
const { playerRankTrend } = require('../src/engine/playerRankTrend.ts')
const teams = [{ id: 'A', name: 'Alpha', shortName: 'AAA' }, { id: 'B', name: 'Beta', shortName: 'BBB' }]
const players = [{ id: 'p', name: 'Player', displayName: 'Player', fullName: 'Player', position: 'ST', number: 9, teamId: 'B' }]
function game(id, props = {}) {
  return { id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-10-01', recordedAt: 1000, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'ST', matchPosition: 'ST' }], events: [{ id: `${id}:g`, type: 'goal', minute: 10, teamId: 'A', playerId: 'p' }], ...props }
}
const games = [game('league'), game('cup', { competitionType: 'cup', competitionStage: 'stage1', recordedAt: 2000 }), game('champions', { competitionType: 'champions', competitionStage: 'roundOf16', competitionSeriesGame: 1, recordedAt: 3000 })]
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}

/** Real component/functions with only React's state/effect lifecycle and the
 * Store provider adapted for deterministic handler tests without a browser. */
function componentHarness(relativePath, exportName, store = { teams, players, matches: games, competitionStates: [], competitionCacheOwner: {} }) {
  let hookCursor = 0
  const state = []
  const effects = []
  const react = { ...React, useMemo: fn => fn(), useRef: initial => {
    const i = hookCursor++; if (!(i in state)) state[i] = { current: initial }; return state[i]
  }, useState: initial => {
    const i = hookCursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
    return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next }]
  }, useEffect: effect => { effects.push(effect) } }
  const filename = path.resolve(relativePath)
  const compiled = new Module(filename, module)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = compiled.require.bind(compiled)
  compiled.require = name => name === 'react' ? react : name === '../store' ? { useStore: () => store } : original(name)
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', 'false'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
  return { render(props) { hookCursor = 0; effects.length = 0; return compiled.exports[exportName](props) }, effects }
}

test('explicit team result perspective reverses League/Cup scores while the default recorded-team output stays unchanged', () => {
  const untouched = JSON.stringify(games)
  const defaults = derivedResults(games, teams)
  assert.deepEqual(defaults.map(r => [r.match.id, r.teamId, r.goalsFor, r.goalsAgainst, r.outcome]), [['champions', 'A', 1, 0, 'W'], ['cup', 'A', 1, 0, 'W'], ['league', 'A', 1, 0, 'W']])
  const away = derivedResults(games, teams, 'B')
  assert.deepEqual(away.map(r => [r.match.id, r.teamId, r.teamName, r.goalsFor, r.goalsAgainst, r.outcome]), [['cup', 'B', 'Beta', 0, 1, 'L'], ['league', 'B', 'Beta', 0, 1, 'L']])
  assert.equal(JSON.stringify(games), untouched)
  assert.deepEqual(derivedResults(games, teams), defaults)
})

test('explicit results support an away recorded owner, home opponent, draws, duplicates and released-player history', () => {
  const awayOwned = game('away', { teamId: 'B', appearances: [{ playerId: 'released', teamId: 'B', role: 'starter', position: 'ST' }] })
  assert.deepEqual(derivedResults([awayOwned], teams, 'B').map(r => [r.teamId, r.goalsFor, r.goalsAgainst, r.outcome]), [['B', 0, 1, 'L']])
  assert.deepEqual(derivedResults([awayOwned], teams, 'A').map(r => [r.teamId, r.goalsFor, r.goalsAgainst, r.outcome]), [['A', 1, 0, 'W']])
  const tied = game('draw', { events: [], recordedAt: 4000 })
  assert.deepEqual(derivedResults([awayOwned, tied, tied], teams, 'B').map(r => [r.match.id, r.outcome]), [['draw', 'D'], ['away', 'L']])
  assert.deepEqual(derivedResults([awayOwned], teams, 'missing'), [])
})

test('team perspective uses its actual fixture opponent rather than another owner’s opponentName', () => {
  const recorded = game('names', { opponentName: 'Custom Beta name' })
  assert.equal(derivedResults([recorded], teams)[0].opponentName, 'Custom Beta name')
  assert.equal(derivedResults([recorded], teams, 'B')[0].opponentName, 'Alpha')
  const championsAway = { ...recorded, competitionType: 'champions', competitionStage: 'roundOf16', teamId: 'B' }
  assert.deepEqual(derivedResults([championsAway], teams, 'A'), [])
  assert.equal(derivedResults([championsAway], teams, 'B').length, 1)
})

test('navigation pills are larger than metric pills, content-width, left aligned and show one selected item', () => {
  const h = componentHarness('src/components/RankingRow.tsx', 'RankingMetricTabs')
  const props = { label: 'Menu', value: 'table', options: [{ value: 'players', label: 'Players' }, { value: 'table', label: 'Table' }], onChange() {} }
  const metric = h.render(props)
  const nav = h.render({ ...props, size: 'navigation' })
  const metricButtons = nodes(metric, n => n.type === 'button')
  const navButtons = nodes(nav, n => n.type === 'button')
  assert.match(metricButtons[0].props.className, /rounded-full/)
  assert.match(metricButtons[0].props.className, /px-3 py-1\.5 text-\[10px\]/)
  assert.match(navButtons[0].props.className, /min-h-9/)
  assert.match(navButtons[0].props.className, /text-xs/)
  assert.doesNotMatch(navButtons[0].props.className, /w-full|flex-1/)
  assert.equal(navButtons.filter(n => n.props['aria-pressed']).length, 1)
  assert.match(navButtons[1].props.className, /bg-emerald-500 text-black/)
  assert.match(navButtons[0].props.className, /bg-zinc-900 text-zinc-400/)
})

test('pill selection scrolls only its local viewport and fixed Total remains outside the stage scroller', () => {
  const h = componentHarness('src/components/RankingRow.tsx', 'RankingMetricTabs')
  let chosen = 'stage2'
  const props = { label: 'Cup table stage', value: chosen, options: [{ value: 'stage1', label: 'Stage 1' }, { value: 'stage2', label: 'Stage 2' }], pinnedOption: { value: 'total', label: 'Total' }, onChange: value => { chosen = value } }
  const tree = h.render(props)
  const buttons = nodes(tree, n => n.type === 'button')
  const total = buttons.find(n => n.props.children === 'Total')
  assert(total)
  const scroller = nodes(tree, n => n.type === 'div' && /overflow-x-auto/.test(n.props.className ?? ''))[0]
  assert(!nodes(scroller, n => n.type === 'button').includes(total))
  assert.match(scroller.props.className, /min-w-0/)
  assert.match(scroller.props.className, /\brelative\b/, 'tab offsets must be measured against their own scroller')
  scroller.props.ref.current = { scrollLeft: 0, clientWidth: 100, scrollTop: 350 }
  buttons[1].props.ref.current = { offsetLeft: 130, offsetWidth: 70 }
  h.effects.forEach(effect => effect())
  assert.equal(scroller.props.ref.current.scrollLeft, 100)
  assert.equal(scroller.props.ref.current.scrollTop, 350)
  total.props.onClick(); assert.equal(chosen, 'total')
  assert.match(total.props.className, /px-3 py-1\.5 text-\[10px\]/)
  assert.match(total.props.className, /focus-visible/)
})

test('Team Matches uses shared ResultCard, keeps scope/order, and sends the original match ID', () => {
  const h = componentHarness('src/screens/TeamDetailScreen.tsx', 'TeamDetailScreen')
  let state = { ...navigation.defaultScreenState({ name: 'team', id: 'B' }), tab: 'matches' }
  const opened = []
  const render = () => h.render({ teamId: 'B', season: 'S1', screenState: state, onStateChange: value => { state = value }, onNavigate: view => opened.push(view), onBack() {} })
  let tree = render()
  const rows = nodes(tree, n => n.type?.name === 'ResultCard')
  assert.deepEqual(rows.map(n => [n.props.result.match.id, n.props.result.teamId, n.props.result.outcome]), [['cup', 'B', 'L'], ['league', 'B', 'L']])
  rows[0].props.onMatchNavigate(); assert.deepEqual(opened, [{ name: 'match', id: 'cup' }])
  nodes(tree, n => n.type?.name === 'CompetitionScopeSelector')[0].props.onChange('cup')
  tree = render(); assert.equal(state.matchesCompetition, 'cup')
  assert.deepEqual(nodes(tree, n => n.type?.name === 'ResultCard').map(n => n.props.result.match.id), ['cup'])
  nodes(tree, n => n.type?.name === 'CompetitionScopeSelector')[0].props.onChange('champions')
  assert.match(renderToStaticMarkup(render()), /No matches in this scope/)
})

test('Player competition pills inherit League/Cup/Champions/All entry scopes and preserve Back', () => {
  const h = componentHarness('src/screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen')
  for (const scope of ['league', 'cup', 'champions', 'all']) {
    const source = { name: 'global-ranking', season: 'S1', competitionType: scope }
    const sourceState = navigation.defaultScreenState(source)
    const destination = resolvePlayerDestination({ name: 'player', id: 'p' }, source, sourceState, 'S1', games)
    let state = { ...destination.screenState, rankTrendMetric: 'goals' }
    const render = () => h.render({ playerId: 'p', season: 'S1', screenState: state, onStateChange: next => { state = next }, onNavigate() {}, onBack() {} })
    const tree = render()
    const season = nodes(tree, n => n.type?.name === 'CompactFilterMenu' && n.props.label === 'Player detail season')[0]
    assert(season)
    const pills = nodes(tree, n => n.type?.name === 'RankingMetricTabs' && n.props.label === 'Player detail competition')[0]
    assert(pills)
    assert.deepEqual(pills.props.options.map(o => [o.value, o.label]), [['all', 'All'], ['league', 'League'], ['cup', 'Cup'], ['champions', 'Champions']])
    assert.equal(pills.props.value, scope)
    pills.props.onChange('cup'); assert.equal(state.competition, 'cup'); assert.equal(state.rankTrendMetric, 'rating')
    state = { ...state, rankTrendMetric: 'goals' }
    nodes(render(), n => n.type?.name === 'CompactFilterMenu' && n.props.label === 'Player detail season')[0].props.onChange('S1')
    assert.equal(state.rankTrendMetric, 'rating')
    const sourceEntry = navigation.createNavigationEntry(destination.view, state)
    const back = navigation.popNavigationEntry(navigation.pushNavigationEntry([sourceEntry], { name: 'team', id: 'A' }, 283))
    assert.equal(back[0].screenState.competition, 'cup'); assert.equal(back[0].scrollTop, 283)
  }
})

test('Rank Trend starts with Overall and Position/Team still display the existing canonical histories', () => {
  const h = componentHarness('src/screens/PlayerDetailScreen.tsx', 'RankTrend')
  const props = { playerId: 'p', players, matches: games, season: 'S1', competition: 'all' }
  const points = playerRankTrend('p', players, games, 'S1', 'all', 'rating')
  const expectedLabel = type => type + ' rating rank history: ' + points.map(row => row[type] === null ? '—' : '#' + row[type]).join(', ')
  let tree = h.render(props)
  assert.equal(nodes(tree, n => n.type === 'button' && n.props['aria-pressed'])[0].props.children, 'Overall')
  assert.equal(nodes(tree, n => n.type === 'svg')[0].props['aria-label'], expectedLabel('overall'))
  for (const type of ['position', 'team', 'overall']) {
    nodes(tree, n => n.type === 'button' && String(n.props.children).toLowerCase() === type)[0].props.onClick()
    tree = h.render(props)
    assert.equal(nodes(tree, n => n.type === 'svg')[0].props['aria-label'], expectedLabel(type))
  }
})

test('League History dark slider retains native range semantics, MD handler and result/graph state', () => {
  const h = componentHarness('src/screens/CompetitionScreen.tsx', 'CompetitionScreen', { teams, players, matches: games, competitionStates: [], competitionCacheOwner: {}, competitionRevisions: {} })
  let state = { ...navigation.defaultScreenState({ name: 'competition' }), leagueMenu: 'history', historyMatchday: 1, historyComparedTeamIds: ['A'], historyFocusedTeamId: 'A', historyPlotScrollLeft: 20 }
  const root = h.render({ season: 'S1', screenState: state, onStateChange: next => { state = next }, onCompetitionTypeChange() {}, onSeason() {}, onNavigate() {} })
  const view = nodes(root, n => n.type?.name === 'LeagueView')[0]
  // Render nested components under the same lifecycle adapter using SSR.
  const html = renderToStaticMarkup(view)
  assert.match(html, /class="[^"]*league-history-range/)
  assert.match(html, /type="range"/)
  assert.match(html, /min="1" max="1"/)
  assert.match(html, /value="1"/)
  assert.match(html, /Selected Matchday results/)
  assert.match(html, /League Position History horizontal plot/)
  const history = view.type(view.props)
  const tree = history.type(history.props)
  const slider = nodes(tree, n => n.type === 'input')[0]
  slider.props.onChange({ target: { value: '1' } })
  assert.equal(state.historyMatchday, 1); assert.equal(state.historyFocusedTeamId, 'A'); assert.equal(state.historyPlotScrollLeft, 20)
})

test('every competition uses the same navigation pills and preserves its independent default menu', () => {
  const h = componentHarness('src/screens/CompetitionScreen.tsx', 'CompetitionScreen')
  let state = navigation.defaultScreenState({ name: 'competition' })
  const render = () => h.render({ season: 'S1', screenState: state, onStateChange: next => { state = next }, onCompetitionTypeChange: type => { state = { ...state, competitionType: type } }, onSeason() {}, onNavigate() {} })
  for (const [type, selected, labels] of [['league', 'players', ['Players', 'Table', 'History', 'Matches']], ['cup', 'table', ['Players', 'Table', 'Matches']], ['champions', 'bracket', ['Players', 'Bracket', 'Matches']]]) {
    state = { ...state, competitionType: type }
    const tree = render()
    const menu = nodes(tree, n => n.type?.name === 'RankingMetricTabs' && n.props.label.endsWith(' menu'))[0]
    assert.equal(menu.props.size, 'navigation'); assert.equal(menu.props.value, selected)
    assert.deepEqual(menu.props.options.map(o => o.label), labels)
    const top = nodes(tree, n => n.props?.['aria-label'] === 'Competition type')[0]
    assert.match(top.props.className, /grid-cols-3/)
    const topButtons = nodes(top, n => n.type === 'button')
    assert(topButtons.every(n => n.props.className.includes('rounded-lg py-2 text-xs font-black')))
    menu.props.onChange('matches')
  }
  assert.equal(state.leagueMenu, 'matches'); assert.equal(state.cupMenu, 'matches'); assert.equal(state.championsMenu, 'matches')
})

test('League Overall/Form uses metric-sized pills and keeps Last5 as helper text', () => {
  const h = componentHarness('src/screens/CompetitionScreen.tsx', 'CompetitionScreen')
  let state = { ...navigation.defaultScreenState({ name: 'competition' }), leagueMenu: 'table' }
  const root = h.render({ season: 'S1', screenState: state, onStateChange: next => { state = next }, onCompetitionTypeChange() {}, onSeason() {}, onNavigate() {} })
  const view = nodes(root, n => n.type?.name === 'LeagueView')[0]
  const tree = view.type(view.props)
  const selector = nodes(tree, n => n.type?.name === 'RankingMetricTabs' && n.props.label === 'League table mode')[0]
  assert(selector)
  assert.equal(selector.props.size, undefined)
  assert.equal(selector.props.value, 'overall')
  assert.deepEqual(selector.props.options.map(o => o.label), ['Overall', 'Form'])
  selector.props.onChange('form'); assert.equal(state.leagueTableMode, 'form')
  const form = view.type({ ...view.props, screenState: state })
  assert.match(renderToStaticMarkup(form), /Last 5 League matches only/)
})

test('the slider theme is scoped, provides both browser tracks/thumbs and retains a large input hit area', () => {
  const css = fs.readFileSync('src/index.css', 'utf8')
  for (const pseudo of ['::-webkit-slider-runnable-track', '::-webkit-slider-thumb', '::-moz-range-track', '::-moz-range-progress', '::-moz-range-thumb', ':focus-visible']) assert(css.includes('.league-history-range' + pseudo), pseudo)
  const input = css.match(/\.league-history-range\s*\{([^}]+)\}/)[1]
  assert.match(input, /height:\s*36px/)
  const webkitTrack = css.match(/\.league-history-range::-webkit-slider-runnable-track\s*\{([^}]+)\}/)[1]
  assert.match(webkitTrack, /height:\s*4px/)
  assert.match(webkitTrack, /#27272a/)
  assert.match(webkitTrack, /--league-range-progress/)
  assert.doesNotMatch(input, /touch-action:\s*none|pointer-events:\s*none/)
})
