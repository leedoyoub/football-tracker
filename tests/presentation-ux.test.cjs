const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
let owner
const hooks = { ...React,
  useState(initial) { const h = owner, i = h.cursor++; if (!(i in h.state)) h.state[i] = typeof initial === 'function' ? initial() : initial; return [h.state[i], value => { h.state[i] = typeof value === 'function' ? value(h.state[i]) : value }] },
  useMemo(fn) { return fn() }, useRef(value) { return { current: value } },
}
const load = Module._load
Module._load = function(name, parent, main) {
  if (name === 'react') return hooks
  if (name === '../store' || name === './store') return { useStore: () => owner.store }
  return load.call(this, name, parent, main)
}
const { ratePlayerMatch, POSITION_RULES } = require('../src/engine/rating.ts')
const { unifiedBestEleven, aggregatePlayerStats } = require('../src/engine/stats.ts')
const { PlayersScreen } = require('../src/screens/PlayersScreen.tsx')
const { RankingsScreen } = require('../src/screens/RankingsScreen.tsx')
const { HomeScreen } = require('../src/screens/HomeScreen.tsx')
const { PlayerDetailScreen } = require('../src/screens/PlayerDetailScreen.tsx')
const { playerFullName, playerDisplayName } = require('../src/components/ui.tsx')
const { APP_VERSION } = require('../src/config.ts')
const player = (id, position = 'ST') => ({ id, name: 'Legacy ' + id, fullName: 'Complete Name ' + id, displayName: 'Short ' + id, position, number: 9, teamId: 'A', teamIds: ['A', 'B'] })
const match = (id, players, props = {}) => ({ id, season: 'S1', matchDay: 1, date: '2026-09-01', duration: 90, homeTeamId: 'A', awayTeamId: 'OPP', teamId: 'A', appearances: players.map(p => ({ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position })), events: [], ...props })
const goal = (id, minute, props = {}) => ({ id, type: 'goal', teamId: 'A', minute, ...props })
const near = (a, b) => assert(Math.abs(a-b) < 1e-10, `${a} != ${b}`)
function nodes(n, predicate) { if (Array.isArray(n)) return n.flatMap(c => nodes(c, predicate)); if (!n || typeof n !== 'object') return []; return [...(predicate(n) ? [n] : []), ...nodes(n.props?.children, predicate)] }
function text(n) { return Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n == null ? '' : String(n) }
function screen(Component, store, props = {}) { const h = { cursor: 0, state: [], store }; const render = () => { owner = h; h.cursor = 0; return Component({ season: 'S1', onSeason() {}, onNavigate() {}, onBack() {}, ...props }) }; return { render } }
const teams = [{ id: 'A', name: 'Team A', shortName: 'A' }, { id: 'B', name: 'Team B', shortName: 'B' }]

test('ST always receives .85 per goal and .55 per assist for starters, subs and position changes', () => {
  const p = player('p')
  for (const position of ['ST', 'LST', 'RST']) {
    for (const role of ['starter', 'bench']) {
      const m = match('m', [p]); m.appearances[0] = { ...m.appearances[0], role, matchPosition: position }
      m.events = [goal('g1', 20, { playerId: 'p' }), goal('g2', 50, { playerId: 'p' }), goal('a1', 60, { assistPlayerId: 'p' })]
      if (role === 'bench') m.events.unshift({ id: 'sub', type: 'sub', teamId: 'A', minute: 10, playerOutId: 'other', playerInId: 'p', position })
      const before = JSON.stringify(m); const r = ratePlayerMatch(m, p)
      near(r.goals, 1.7); near(r.assists, .55); near(r.goals + r.assists, 2.25)
      assert.equal(JSON.stringify(m), before)
      m.events = m.events.filter(e => e.id !== 'g2'); near(ratePlayerMatch(m, p).goals, .85)
    }
  }
  const switched = match('switch', [p]); switched.appearances[0].matchPosition = 'CM'; switched.appearances[0].positionHistory = [{ minute: 30, position: 'ST' }]
  switched.events = [goal('goal', 40, { playerId: 'p' }), goal('assist', 50, { assistPlayerId: 'p' })]
  near(ratePlayerMatch(switched, p).goals, .85); near(ratePlayerMatch(switched, p).assists, .55)
})

test('non-ST scoring rules, including SS first contributions, are preserved', () => {
  for (const position of Object.keys(POSITION_RULES).filter(p => !['ST', 'LST', 'RST'].includes(p))) {
    const p = player('p', position), m = match('m', [p]); m.events = [goal('g', 20, { playerId: 'p' }), goal('a', 30, { assistPlayerId: 'p' })]
    const r = ratePlayerMatch(m, p)
    near(r.goals, position === 'SS' ? .7 : POSITION_RULES[position].goal)
    near(r.assists, position === 'SS' ? .4 : POSITION_RULES[position].assist)
  }
})

for (const recent of [true, false]) test(`${recent ? 'TOTW' : 'TOTY'} selects the best LB, two CBs and RB and never fills missing defenders from another role`, () => {
  const players = [player('lb', 'LB'), player('lb-best', 'LB'), player('cb0', 'CB'), player('cb1', 'CB'), player('cb2', 'CB'), player('rb', 'RB'), player('rb-best', 'RB')]
  const matches = [1,2,3].map(day => match(String(day), players, { matchDay: day, events: [goal('1', 10, { playerId: 'cb1' }), goal('2', 20, { playerId: 'cb2' }), goal('3', 30, { playerId: 'cb2' }), goal('4', 40, { playerId: 'lb-best' }), goal('5', 50, { playerId: 'rb-best' })] }))
  const before = JSON.stringify(matches)
  const defence = unifiedBestEleven(players, matches, 'S1', recent).slots.filter(s => ['LB','LCB','RCB','RB'].includes(s.slot))
  assert.deepEqual(defence.map(s => s.playerId), ['lb-best','cb2','cb1','rb-best'])
  const missing = unifiedBestEleven(players.filter(p => p.position !== 'LB'), matches, 'S1', recent).slots
  assert.equal(missing.find(s => s.slot === 'LB').playerId, null)
  assert.deepEqual(missing.filter(s => ['LCB','RCB'].includes(s.slot)).map(s => s.playerId), ['cb2','cb1'])
  assert.equal(JSON.stringify(matches), before)
})

test('list and ranking names use Full Name, compact helpers retain Display Name, and search matches both', () => {
  const p = player('p'), store = { teams, players: [p], matches: [match('m', [p])] }
  assert.equal(playerFullName(p), 'Complete Name p'); assert.equal(playerDisplayName(p), 'Short p')
  assert.equal(playerFullName({ ...p, fullName: ' ' }), 'Legacy p')
  for (const Component of [PlayersScreen, RankingsScreen, HomeScreen, PlayerDetailScreen]) {
    const tree = screen(Component, store, { playerId: p.id }).render()
    assert(text(tree).includes('Complete Name p'), Component.name)
    assert(!text(tree).includes('Short p'), Component.name)
  }
  const h = screen(PlayersScreen, store)
  for (const query of ['oMpLeTe nA', 'HORT P', 'not found']) {
    const input = nodes(h.render(), n => n.props?.['aria-label'] === 'Search players')[0]
    input.props.onChange({ target: { value: query } })
    assert.equal(text(h.render()).includes('Complete Name p'), query !== 'not found')
  }
})

test('player recent matches include unused bench in multi-team chronological order without adding appearances to stats', () => {
  const p = player('p', 'CM')
  const played = match('played', [p], { matchDay: 38, createdAt: '2026-09-02' })
  const bench = match('unused', [p], { teamId: 'B', homeTeamId: 'B', matchDay: 1, createdAt: '2026-09-03', appearances: [{ playerId: 'p', teamId: 'B', position: 'CM', role: 'bench' }] })
  const sub = match('sub', [p], { createdAt: '2026-09-01', appearances: [{ playerId: 'p', teamId: 'A', position: 'CM', role: 'bench' }], events: [{ id: 'on', type: 'sub', teamId: 'A', minute: 60, playerOutId: 'other', playerInId: 'p', position: 'CAM' }] })
  const store = { players: [p], teams, matches: [played, bench, sub] }, before = JSON.stringify(store)
  const tree = screen(PlayerDetailScreen, store, { playerId: 'p' }).render()
  const rows = nodes(tree, n => n.type === 'button' && n.key && ['unused','played','sub'].includes(n.key))
  assert.deepEqual(rows.map(n => n.key), ['unused','played','sub'])
  assert(text(rows[0]).includes('Bench')); assert(!text(rows[0]).includes('CM'))
  assert.equal(text(nodes(rows[0], n => n.props?.className?.includes('text-lg font-bold'))[0]), '-')
  assert.equal(text(nodes(rows[2], n => n.props?.['aria-label'] === 'Match positions')[0]), 'CAM')
  assert.equal(ratePlayerMatch(bench, p), null)
  const stats = aggregatePlayerStats(p, [p], store.matches); assert.equal(stats.matches, 2); assert.equal(stats.minutes, 120)
  assert.equal(JSON.stringify(store), before)
})

test('Home footer reads the central version after all content, and common layout reserves nav plus safe area', () => {
  const tree = screen(HomeScreen, { players: [], matches: [], teams }).render()
  const footer = nodes(tree, n => n.type === 'footer')[0]
  assert.equal(text(footer), 'Football Tracker \u00b7 v' + APP_VERSION)
  assert.equal(tree.props.children.filter(Boolean).at(-1), footer)
  const css = fs.readFileSync(require.resolve('../src/index.css'), 'utf8')
  assert(css.includes('env(safe-area-inset-bottom, 0px)'))
  assert.match(css, /\.app-content\s*\{[^}]*padding-bottom:\s*calc\(var\(--nav-height\)/)
  assert.match(css, /\.app-bottom-nav\s*\{[^}]*height:\s*var\(--nav-height\)/)
  const app = fs.readFileSync(require.resolve('../src/App.tsx'), 'utf8')
  assert(app.includes('app-content no-scrollbar min-h-0 flex-1 overflow-y-auto'))
})
