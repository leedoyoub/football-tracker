require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { teams, game, cupFixture } = require('./helpers/v258-fixture.cjs')
const { cupCompetition } = require('../src/engine/competition.ts')
const { buildLeagueHistory } = require('../src/engine/seasonAnalytics.ts')
const navigation = require('../src/lib/navigation.ts')
const { resetCompetitionSeasonState } = require('../src/lib/competitionScreenState.ts')
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(n => nodes(n, predicate))
  if (!node || typeof node !== 'object') return []
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)]
}
function harness(relativePath, exportName) {
  let cursor = 0
  const state = []; const effects = []
  const react = { ...React, useMemo: fn => fn(), useRef: initial => { const i = cursor++; return state[i] ??= { current: initial } }, useState: initial => {
    const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
    return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next }]
  }, useEffect: fn => effects.push(fn) }
  const filename = path.resolve(relativePath); const compiled = new Module(filename, module)
  compiled.filename = filename; compiled.paths = Module._nodeModulePaths(path.dirname(filename))
  const original = compiled.require.bind(compiled)
  compiled.require = name => name === 'react' ? react : name === '../store' ? { useStore: () => ({}) } : original(name)
  const source = fs.readFileSync(filename, 'utf8').replaceAll('import.meta.env.DEV', 'false') + `\nexports.__testComponent = ${exportName};`
  compiled._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
  return { render(props) { cursor = 0; effects.length = 0; return compiled.exports.__testComponent(props) }, effects }
}
const screenHarness = name => harness('src/screens/CompetitionScreen.tsx', name)
function cupTree(matches, selection = null) {
  return screenHarness('CupView').render({ season: 'S1', teams, tournamentTeams: teams, players: [], matches, cup: cupCompetition(teams, matches, 'S1'), selection, onSelection() {}, onNavigate() {} })
}

test('League History comparison pills remain multi-select with max four, deselection and restored focus/scroll', () => {
  const h = screenHarness('LeagueHistory')
  const matches = [game('league', 'T1', { competitionType: 'league', competitionStage: 'regular' })]
  const analytics = buildLeagueHistory(teams, [], matches, 'S1')
  const before = JSON.stringify(analytics)
  let screenState = { ...navigation.defaultScreenState({ name: 'competition' }), historyComparedTeamIds: ['T1', 'T2', 'T3'], historyFocusedTeamId: 'T2', historyPlotScrollLeft: 240 }
  const render = () => h.render({ analytics, teams, screenState, onStateChange: next => { screenState = next }, onNavigate() {} })
  const pills = tree => nodes(tree, n => n.type === 'button' && /^T\d+$/.test(n.props.children))
  let tree = render(); assert.equal(pills(tree).length, 16)
  assert.match(pills(tree)[0].props.className, /px-3 py-1\.5 text-\[10px\] font-bold/)
  assert.doesNotMatch(pills(tree)[0].props.className, /min-h-10/)
  assert.match(pills(tree)[0].props.className, /bg-emerald-500 text-black/)
  assert(nodes(tree, n => /overflow-x-auto/.test(n.props?.className ?? '')).length)
  pills(tree)[3].props.onClick(); assert.deepEqual(screenState.historyComparedTeamIds, ['T1', 'T2', 'T3', 'T4'])
  tree = render(); pills(tree)[4].props.onClick(); assert.equal(screenState.historyComparedTeamIds.length, 4)
  tree = render(); pills(tree)[0].props.onClick(); assert.deepEqual(screenState.historyComparedTeamIds, ['T2', 'T3', 'T4'])
  const plot = nodes(render(), n => n.type?.name === 'PositionHistory')[0]
  assert.equal(plot.props.focusedTeamId, 'T2'); assert.equal(plot.props.plotScrollLeft, 240)
  const entry = navigation.createNavigationEntry({ name: 'competition' }, screenState)
  const stack = navigation.pushNavigationEntry([entry], { name: 'team', id: 'T2' }, 120)
  assert.deepEqual(navigation.popNavigationEntry(stack).at(-1).screenState, screenState)
  assert.equal(JSON.stringify(analytics), before)
})

test('Cup selector uses award-size labels and original IDs with pinned Total and local-only automatic scroll', () => {
  const h = screenHarness('CupView'); const matches = cupFixture(7)
  let selected = 'stage3'
  const render = () => h.render({ season: 'S1', teams, tournamentTeams: teams, players: [], matches, cup: cupCompetition(teams, matches, 'S1'), selection: selected, onSelection: value => { selected = value }, onNavigate() {} })
  let tree = render(); const tabs = nodes(tree, n => n.type?.name === 'RankingMetricTabs')[0]
  assert.equal(tabs.props.size, 'award')
  assert.deepEqual(tabs.props.options.map(o => [o.value, o.label]), [['stage1', 'S1'], ['stage2', 'S2'], ['stage3', 'S3'], ['stage4', 'S4'], ['stage5', 'S5'], ['stage6', 'S6'], ['stage7', 'S7'], ['final', 'Final']])
  const pills = harness('src/components/RankingRow.tsx', 'RankingMetricTabs')
  const pillTree = pills.render(tabs.props)
  const buttons = nodes(pillTree, n => n.type === 'button')
  const total = buttons.at(-1); assert.equal(total.props.children, 'Total')
  assert.match(buttons[2].props.className, /px-2\.5 py-1 text-\[10px\] font-black bg-emerald-400 text-black/)
  assert.match(buttons[0].props.className, /bg-zinc-800 text-zinc-300/)
  const scroller = nodes(pillTree, n => /overflow-x-auto/.test(n.props?.className ?? ''))[0]
  assert(!nodes(scroller, n => n.type === 'button').includes(total))
  scroller.props.ref.current = { scrollLeft: 0, scrollTop: 350, clientWidth: 100 }
  buttons[2].props.ref.current = { offsetLeft: 150, offsetWidth: 50 }; pills.effects.forEach(fn => fn())
  assert.equal(scroller.props.ref.current.scrollLeft, 100); assert.equal(scroller.props.ref.current.scrollTop, 350)
  total.props.onClick(); assert.equal(selected, 'total')
  tree = render(); assert.equal(nodes(tree, n => n.type?.name === 'RankingMetricTabs')[0].props.value, 'total')
  assert.equal(resetCompetitionSeasonState({ ...navigation.defaultScreenState({ name: 'competition', competitionType: 'cup' }), cupTableStage: 'stage3' }).cupTableStage, null)
  const currentTree = cupTree(matches)
  assert.equal(nodes(currentTree, n => n.type?.name === 'RankingMetricTabs')[0].props.value, 'final')
  const cup = cupCompetition(teams, matches, 'S1')
  matches.push(...cup.activeTeamIds.map(id => game(`final:${id}`, id, { competitionStage: 'final' })))
  const replayTabs = nodes(cupTree(matches), n => n.type?.name === 'RankingMetricTabs')[0]
  assert.deepEqual(replayTabs.props.options.at(-1), { value: 'finalReplay', label: 'Replay' })
  assert.match(renderToStaticMarkup(cupTree(matches)), /Final Replay/)
})

for (const p of [0, 1, 2, 3, 4, 5, 6]) test(`P=${p} renders exactly one line above the first provisional risk row, or none at zero`, () => {
  const tree = cupTree(Array.from({ length: p }, (_, i) => game(`g${i}`, teams[i].id, { ga: i + 1 })))
  const rows = nodes(tree, n => n.type === 'div' && /^T\d+$/.test(n.key ?? ''))
  const lineIndices = rows.flatMap((row, i) => nodes(row, n => n.type === 'div' && /Survival Line$/.test(n.props.children ?? '')).length ? [i] : [])
  assert.deepEqual(lineIndices, p ? [Math.max(0, p - 2)] : [])
  const html = renderToStaticMarkup(tree)
  assert.equal((html.match(/bg-orange-400\/10/g) ?? []).length, Math.min(2, p))
  assert.equal((html.match(/Not Played/g) ?? []).length, 16 - p)
  assert.doesNotMatch(html, /Elimination Draw applies/)
  if (p) assert.match(html, /Provisional Survival Line/)
})

test('completed Stage renders one official line and Final/Replay/Total never render a line', () => {
  const matches = cupFixture(7)
  for (const selection of ['stage1', 'stage2', 'stage7']) {
    const html = renderToStaticMarkup(cupTree(matches, selection))
    assert.equal((html.match(/Survival Line<\/div>/g) ?? []).length, 1)
    assert.doesNotMatch(html, /Provisional Survival Line|At Risk|bg-orange-400\/10/)
  }
  for (const selection of ['final', 'total']) assert.doesNotMatch(renderToStaticMarkup(cupTree(matches, selection)), /Survival Line|At Risk/)
  const cup = cupCompetition(teams, matches, 'S1'); matches.push(...cup.activeTeamIds.map(id => game(`final:${id}`, id, { competitionStage: 'final' })))
  assert.doesNotMatch(renderToStaticMarkup(cupTree(matches, 'finalReplay')), /Survival Line|At Risk/)
  assert.doesNotMatch(renderToStaticMarkup(cupTree(matches, 'total')), /opacity-60|bg-orange-400\/10/)
})

for (const stage of ['roundOf16', 'quarterFinal', 'semiFinal', 'final']) test(`Champions ${stage} dims only the confirmed loser identity, never a partial row loser`, () => {
  const h = screenHarness('ChampionsBracket')
  const pair = { id: `${stage}:0`, stage, teamIds: ['T1', 'T2'], matches: [], requiredMatches: stage === 'final' ? 2 : 3, tied: false, rowWinners: ['T1'], winnerId: undefined }
  const rounds = { roundOf16: [], quarterFinal: [], semiFinal: [], final: [], [stage]: [pair] }
  const opened = []
  const render = () => h.render({ teams: Object.fromEntries(teams.map(t => [t.id, t])), rounds, currentStage: stage, onNavigate: view => opened.push(view) })
  const identities = tree => {
    const roundCards = nodes(tree, n => n.type?.name === 'Round').flatMap(round => round.props.pairs.map(round.props.card))
    return nodes([tree, ...roundCards], n => n.type === 'span' && ['T1', 'T2'].includes(n.key) && /justify-items-center/.test(n.props.className ?? ''))
  }
  assert(identities(render()).every(n => !/opacity-60/.test(n.props.className)))
  pair.winnerId = 'T1'
  let tree = render(); const rows = identities(tree)
  assert.equal(rows.find(n => n.key === 'T2').props.className.includes('opacity-60'), true)
  assert.equal(rows.find(n => n.key === 'T1').props.className.includes('opacity-60'), false)
  const actions = nodes(rows.find(n => n.key === 'T2'), n => n.type?.name === 'TeamIdentityAction')
  assert.equal(actions.length, 2); actions.forEach(action => action.props.onNavigate('T2'))
  assert.deepEqual(opened, [{ name: 'team', id: 'T2' }, { name: 'team', id: 'T2' }])
  const cards = nodes(tree, n => n.type?.name === 'Round').flatMap(round => round.props.pairs.map(round.props.card))
  assert(nodes([tree, ...cards], n => n.type === 'div' && /shadow-lg/.test(n.props.className ?? '')).every(n => !/opacity-60/.test(n.props.className)))
  if (stage === 'roundOf16') {
    rounds.quarterFinal = [{ ...pair, id: 'quarterFinal:0', stage: 'quarterFinal', winnerId: 'T2' }]
    tree = render(); const historical = identities(tree).filter(n => n.key === 'T1')
    assert.equal(historical[0].props.className.includes('opacity-60'), false, 'later elimination must not dim earlier-round winner')
  }
})
