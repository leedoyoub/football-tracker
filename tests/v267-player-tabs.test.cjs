require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test'), path = require('node:path'), fs = require('node:fs')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const nav = require('../src/lib/navigation.ts')
const { resolvePlayerDestination } = require('../src/lib/playerNavigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..'), noop = () => {}
function fixture() { const s = performanceFixture(2); s.matches = s.matches.filter(m => m.teamId === s.teams[0].id || m.teamId === s.teams[2].id); return s }
function props(s, extra = {}) { const id = (s.players[9] ?? s.players[0]).id; return { playerId: id, season: 'Season 1', screenState: { ...nav.defaultScreenState({ name: 'player', id }), season: 'Season 1' }, onStateChange: noop, onNavigate: noop, onBack: noop, ...extra } }
function detail(s, p, overrides) { return screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', s, overrides).render(p) }

test('player defaults and source destinations initialize Overview and independent scroll offsets', () => {
  const state = nav.defaultScreenState({ name: 'player', id: 'p' })
  assert.equal(state.tab, 'overview'); assert.deepEqual(state.tabScrollTop, { overview: 0, matches: 0 })
  const resolved = resolvePlayerDestination({ name: 'player', id: 'p' }, { name: 'player', id: 'other' }, { ...state, season: 'Season 2', competition: 'cup', tab: 'matches' }, 'Season 1', [])
  assert.equal(resolved.screenState.tab, 'overview'); assert.equal(resolved.screenState.season, 'Season 2'); assert.equal(resolved.screenState.competition, 'cup')
})

test('restored legacy/invalid tabs normalize; saved Matches offsets and removed roster IDs survive', () => {
  const s = fixture(), id = s.players[9].id
  const restore = (screenState, playerId = id) => loadLastNavigationEntry(s, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view: { name: 'player', id: playerId }, screenState: { name: 'player', season: 'Season 1', competition: 'league', ...screenState } }) : null })
  for (const tab of [undefined, 'bad', null]) assert.equal(restore({ tab }).screenState.tab, 'overview')
  const entry = restore({ tab: 'matches', tabScrollTop: { overview: 1500, matches: 240 } })
  assert.equal(entry.scrollTop, 240); assert.deepEqual(entry.screenState.tabScrollTop, { overview: 1500, matches: 240 })
  assert.deepEqual(restore({ tab: 'matches', tabScrollTop: { overview: -1, matches: Infinity } }).screenState.tabScrollTop, { overview: 0, matches: 0 })
  const missingId = s.matches.find(m => m.teamId === s.teams[2].id).appearances[10].playerId
  assert.equal(restore({ tab: 'matches' }, missingId).view.id, missingId)
})

test('tab changes capture outgoing scroll, use incoming offset and retain exact detail identity', () => {
  let entries = [nav.createNavigationEntry({ name: 'player', id: 'p' })]
  entries = nav.changePlayerTab(entries, 'matches', 1800)
  assert.equal(entries.at(-1).scrollTop, 0); assert.equal(entries.at(-1).screenState.tabScrollTop.overview, 1800)
  entries = nav.navigateBrowseEntry(entries, { name: 'match', id: 'm' }, 260)
  entries = nav.popNavigationEntry(entries)
  assert.equal(entries[0].scrollTop, 260); assert.equal(entries[0].screenState.tabScrollTop.matches, 260)
  entries = nav.changePlayerTab(entries, 'overview', 260)
  assert.equal(entries[0].scrollTop, 1800)
  entries = nav.navigateBrowseEntry(entries, { name: 'player', id: 'p' }, 1800)
  assert.equal(entries.length, 1); assert.equal(entries[0].screenState.tab, 'overview')
  entries = nav.changePlayerTab(entries, 'matches', 1900)
  assert.equal(entries[0].scrollTop, 260)
})

test('Matches never invokes Overview selectors and Overview never builds match history', () => {
  const s = fixture(), calls = []
  const derived = require('../src/engine/playerDerived.ts'), ranks = require('../src/engine/playerDetailRanks.ts')
  const overrides = { '../engine/playerDetailRanks': { ...ranks, playerDetailRankingScope: (...a) => { calls.push('ranks'); return ranks.playerDetailRankingScope(...a) } }, '../engine/playerDerived': { ...derived, derivePlayerScope: (...a) => { calls.push('derive'); return derived.derivePlayerScope(...a) }, playerAppearanceMatches: (...a) => { calls.push('history'); return derived.playerAppearanceMatches(...a) }, playerCareerTimeline: (...a) => { calls.push('career'); return derived.playerCareerTimeline(...a) } } }
  for (const [module, method] of [['analytics', 'playerChemistry'], ['seasonInsights', 'playerStreaks'], ['news', 'derivePlayerMilestones'], ['playerRankTrend', 'playerRankTrend'], ['nextMilestones', 'careerNextMilestones']]) {
    const engine = require(`../src/engine/${module}.ts`)
    overrides[`../engine/${module}`] = { ...engine, [method]: (...args) => { calls.push(method); return engine[method](...args) } }
  }
  const { PlayerCareerAwards } = require('../src/components/PlayerCareerAwards.tsx')
  overrides['../components/PlayerCareerAwards'] = { PlayerCareerAwards: props => { calls.push('awards'); return PlayerCareerAwards(props) } }
  const p = props(s); renderToStaticMarkup(detail(s, { ...p, screenState: { ...p.screenState, tab: 'matches' } }, overrides))
  assert.deepEqual(calls, ['history'])
  calls.length = 0; const html = renderToStaticMarkup(detail(s, p, overrides))
  assert.ok(calls.includes('ranks')); assert.ok(calls.includes('derive')); assert.ok(calls.includes('career')); assert.ok(!calls.includes('history'))
  for (const method of ['playerChemistry', 'playerStreaks', 'derivePlayerMilestones', 'playerRankTrend', 'careerNextMilestones', 'awards']) assert.ok(calls.includes(method), method)
  for (const section of ['Recent Form', 'Rank Trend', 'Active Streaks', 'Career awards', 'Position Stats', 'Positions Played', 'Team Performance When Starting', 'Role Impact', 'Goal Types', 'Player Chemistry', 'Career Timeline', 'Next Milestones', 'Career Personal Records']) assert.ok(html.includes(section), section)
  assert.ok(!html.includes('Actual appearances in the selected scope.'))
})

test('Matches rating disclosure keeps trace and timeline lazy, with direct match calculation source', () => {
  const s = fixture(), player = s.players[9], match = s.matches.find(m => m.season === 'Season 1'), ratingEngine = require('../src/engine/rating.ts'), timeline = require('../src/engine/timeline.ts')
  const calls = [], rating = ratingEngine.ratePlayerMatch(match, player)
  const h = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'RatingDetails', s, {
    '../engine/rating': { ...ratingEngine, tracePlayerMatchRating: (...a) => { calls.push('trace'); return ratingEngine.tracePlayerMatchRating(...a) } },
    '../engine/timeline': { ...timeline, matchDisplayPositionSegments: (...a) => { calls.push('timeline'); return timeline.matchDisplayPositionSegments(...a) } },
  })
  const p = { player, match, rating }; let tree = h.render(p)
  assert.deepEqual(calls, []); assert.ok(!renderToStaticMarkup(tree).includes('Calculation source'))
  tree.props.onToggle({ currentTarget: { open: true } }); tree = h.render(p)
  assert.deepEqual(calls, ['trace', 'timeline'])
  const html = renderToStaticMarkup(tree)
  for (const label of ['Position timeline', 'Conceded goals', 'SOT suppression', 'Final Raw Rating', 'Displayed Rating', 'direct match rating']) assert.ok(html.includes(label), label)
  assert.ok(!html.includes('scope cache'))
})

test('Matches retains actual appearance order, rating details, filters, and original routes after transfer/release', () => {
  const s = fixture(), { playerAppearanceMatches } = require('../src/engine/playerDerived.ts'), { matchCompetitionType } = require('../src/engine/competitionContext.ts')
  for (const player of [s.players[8], s.players[9], s.players[15]]) {
    const destinations = [], p = props(s, { playerId: player.id, onNavigate: v => destinations.push(v) }); p.screenState = { ...p.screenState, tab: 'matches', competition: 'cup' }
    const shell = detail(s, p), child = nodes(shell, n => n.type?.name === 'PlayerMatches')[0]
    assert.ok(child, 'separately mounted Matches content')
    const content = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerMatches', s).render(child.props)
    const rows = nodes(content, n => n.type?.name === 'MatchRow')
    const expected = playerAppearanceMatches(player, s.matches.filter(m => m.season === 'Season 1' && matchCompetitionType(m) === 'cup'))
    assert.deepEqual(rows.map(n => n.props.match.id), expected.map(m => m.id))
    const html = renderToStaticMarkup(content); assert.equal(html.includes('Rating Details'), expected.length > 0); assert.ok(!html.includes('Rank Trend'))
    if (!expected.length) continue
    const row = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'MatchRow', s).render(rows[0].props)
    nodes(row, n => n.type === 'button')[0].props.onClick(); assert.deepEqual(destinations[0], { name: 'match', id: expected[0].id })
  }
})

test('removed-roster Matches preserves every saved record and ID, stats, filter state and original fallback order', () => {
  const s = fixture(), id = s.matches.find(m => m.teamId === s.teams[2].id).appearances[10].playerId
  const routes = [], changes = [], p = props(s, { playerId: id, onNavigate: v => routes.push(v), onStateChange: v => changes.push(v) })
  p.screenState = { ...p.screenState, tab: 'matches', rankTrendMetric: 'goals', competition: 'league' }
  const shell = detail(s, p), saved = nodes(shell, n => n.type?.name === 'SavedPlayerMatches')[0]
  const content = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'SavedPlayerMatches', s).render(saved.props)
  const expected = s.matches.filter(m => m.season === 'Season 1' && m.competitionType === 'league' && m.appearances.some(a => a.playerId === id))
  const buttons = nodes(content, n => n.type === 'button')
  assert.deepEqual(buttons.map(n => n.key), expected.map(m => m.id)); assert.equal(buttons.length, 30)
  buttons[0].props.onClick(); assert.deepEqual(routes[0], { name: 'match', id: expected[0].id })
  const html = renderToStaticMarkup(shell); assert.ok(html.includes('Rating unavailable')); assert.ok(!html.includes('Rating Details')); assert.ok(html.includes("90&#x27;"))
  nodes(shell, n => n.props?.label === 'Player detail competition')[0].props.onChange('cup')
  assert.equal(changes[0].competition, 'cup'); assert.equal(changes[0].tab, 'matches'); assert.equal(changes[0].rankTrendMetric, 'rating')
})

test('shared scrolling Back retains callbacks and tabs use their normal top offset', () => {
  let backs = 0
  const tree = screenHarness(root, 'components/DetailBack.tsx', 'DetailBack', {}).render({ onBack: () => backs++ })
  nodes(tree, n => n.type === 'button')[0].props.onClick(); assert.equal(backs, 1)
  assert.ok(renderToStaticMarkup(tree).includes('detail-back'))
  const css = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
  assert.doesNotMatch(tree.props.className, /\bsticky\b/)
  assert.doesNotMatch(css, /--detail-back-height/)
  for (const screen of ['Player', 'Match', 'Team']) {
    const source = fs.readFileSync(path.join(root, `src/screens/${screen}DetailScreen.tsx`), 'utf8')
    assert.match(source, /<DetailBack onBack=\{onBack\}/); assert.doesNotMatch(source, /stickyOffset="var\(--detail-back-height\)"/)
  }
  const regular = screenHarness(root, 'components/SeasonUI.tsx', 'SegmentedControl', {}).render({ label: 'Other', value: 'a', options: [{ value: 'a', label: 'A' }], onChange: noop, sticky: true })
  assert.ok(regular.props.className.includes('top-0')); assert.equal(regular.props.style.top, undefined)
})

test('zero-minute selected scope keeps the career position in the shared profile', () => {
  const player = { id: 'p', name: 'Player', position: 'ST', number: 1, teamId: 'A' }
  const match = (id, season, role, matchPosition) => ({ id, season, date: '2026-01-01', matchDay: 1, duration: 90, competitionType: 'league', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', events: [], appearances: [{ playerId: 'p', teamId: 'A', position: 'ST', matchPosition, role }] })
  const s = { players: [player], teams: [], matches: [match('old', 'Season 1', 'starter', 'CAM'), match('unused', 'Season 2', 'bench', 'ST')] }
  const shell = detail(s, props(s, { playerId: 'p', season: 'Season 2', screenState: { ...nav.defaultScreenState({ name: 'player', id: 'p' }), season: 'Season 2', tab: 'matches' } }))
  const header = nodes(shell, n => n.type === 'header')[0]
  assert.ok(renderToStaticMarkup(header).includes('CAM'))
})

test('App captures tab scroll before replacement and immediate navigation/Back restore the selected tab offset', () => {
  const s = fixture(), p = props(s), targets = []
  const initial = nav.createNavigationEntry({ name: 'player', id: p.playerId }, { ...p.screenState, tabScrollTop: { overview: 1200, matches: 220 } }, 1200)
  const overrides = {
    './store': { useStore: () => s },
    './lib/auth': { useAuth: () => ({ user: {}, loading: false }) },
    './lib/supabase': { isSupabaseConfigured: false },
    './lib/localMode': { loadLocalModePreference: () => true },
    './lib/startup': { startupScreen: () => 'ready', shouldRestoreLastRoute: () => true, canUseApp: () => true },
    './lib/lastRoute': { loadLastNavigationEntry: () => initial, saveLastRoute: noop },
    './lib/scrollRestoration': { restoreScrollWhenReachable: (surface, top, _request, _cancel, _frames, options) => { targets.push(top); surface.scrollTop = top; options.onSettled(); return noop } },
  }
  // App callbacks are exercised with their real hooks and navigation helpers;
  // unrelated child pages are inert and never read storage or cloud modules.
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  for (const match of source.matchAll(/import \{ ([^}]+) \} from '(\.\/(?:screens\/[^']+|components\/(?:BottomNav|FloatingScrollToTop|StartupBoundary)))'/g)) overrides[match[2]] = Object.fromEntries(match[1].split(',').map(name => [name.trim(), function AppChild() {}]))
  const h = screenHarness(root, 'App.tsx', 'App', s, overrides)
  let tree = h.render({}); h.effects[0](); tree = h.render({})
  const surface = { scrollTop: 1200 }, surfaceNode = nodes(tree, n => n.props?.className?.includes('app-content'))[0]
  surfaceNode.props.ref.current = surface; h.effects[4]()
  let player = nodes(tree, n => n.props?.playerId === p.playerId && n.props?.screenState)[0]
  player.props.onStateChange({ ...player.props.screenState, tab: 'matches' })
  player.props.onNavigate({ name: 'match', id: s.matches[0].id })
  tree = h.render({})
  const match = nodes(tree, n => n.props?.matchId === s.matches[0].id && n.props?.screenState)[0]
  match.props.onBack(); tree = h.render({}); player = nodes(tree, n => n.props?.playerId === p.playerId && n.props?.screenState)[0]
  assert.equal(player.props.screenState.tab, 'matches'); assert.equal(player.props.screenState.tabScrollTop.overview, 1200); assert.equal(player.props.screenState.tabScrollTop.matches, 220)
  h.effects[4](); assert.equal(surface.scrollTop, 220)
  surface.scrollTop = 330
  player.props.onStateChange({ ...player.props.screenState, tab: 'overview' })
  tree = h.render({}); h.effects[4](); assert.equal(surface.scrollTop, 1200)
  player = nodes(tree, n => n.props?.playerId === p.playerId && n.props?.screenState)[0]
  assert.equal(player.props.screenState.tabScrollTop.matches, 330)
  assert.deepEqual(targets, [1200, 220, 1200])
})

function pendingRestorationApp() {
  const s = fixture(), p = props(s), frames = new Map(), listeners = new Map(); let nextFrame = 0
  const surface = { scrollTop: 1200, scrollHeight: 3000, clientHeight: 600,
    addEventListener: (type, fn) => { const callbacks = listeners.get(type) ?? new Set(); callbacks.add(fn); listeners.set(type, callbacks) },
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
  }
  const emit = (type, detail = {}) => { for (const callback of listeners.get(type) ?? []) callback({ type, ...detail }) }
  const frame = () => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback() }
  const restoration = require('../src/lib/scrollRestoration.ts')
  const initial = nav.createNavigationEntry({ name: 'player', id: p.playerId }, { ...p.screenState, tabScrollTop: { overview: 1200, matches: 220 } }, 1200)
  const overrides = {
    './store': { useStore: () => s }, './lib/auth': { useAuth: () => ({ user: {}, loading: false }) }, './lib/supabase': { isSupabaseConfigured: false }, './lib/localMode': { loadLocalModePreference: () => true },
    './lib/startup': { startupScreen: () => 'ready', shouldRestoreLastRoute: () => true, canUseApp: () => true }, './lib/lastRoute': { loadLastNavigationEntry: () => initial, saveLastRoute: noop },
    './lib/scrollRestoration': { restoreScrollWhenReachable: (container, top, _request, _cancel, maxFrames, options) => restoration.restoreScrollWhenReachable(container, top, callback => { frames.set(++nextFrame, callback); return nextFrame }, id => frames.delete(id), maxFrames, options) },
  }
  const source = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  for (const match of source.matchAll(/import \{ ([^}]+) \} from '(\.\/(?:screens\/[^']+|components\/(?:BottomNav|FloatingScrollToTop|StartupBoundary)))'/g)) overrides[match[2]] = Object.fromEntries(match[1].split(',').map(name => [name.trim(), function AppChild() {}]))
  const h = screenHarness(root, 'App.tsx', 'App', s, overrides)
  let tree = h.render({}), cleanup
  h.effects[0](); tree = h.render({}); nodes(tree, n => n.props?.className?.includes('app-content'))[0].props.ref.current = surface
  const commit = () => { cleanup?.(); cleanup = h.effects[4]() }
  const render = () => { tree = h.render({}); return tree }
  const player = () => nodes(tree, n => n.props?.playerId === p.playerId && n.props?.screenState)[0]
  commit(); frame()
  const switchToMatches = () => { player().props.onStateChange({ ...player().props.screenState, tab: 'matches' }); render(); commit() }
  const navigateBack = () => {
    player().props.onNavigate({ name: 'match', id: s.matches[0].id }); render(); commit()
    nodes(tree, n => n.props?.matchId === s.matches[0].id && n.props?.screenState)[0].props.onBack(); render(); commit()
    return player().props.screenState
  }
  return { surface, emit, frame, switchToMatches, navigateBack, player, render, commit, frames, listeners }
}

test('postcommit navigation before the restoration frame preserves the incoming player tab target', () => {
  const app = pendingRestorationApp(); app.switchToMatches()
  assert.equal(app.surface.scrollTop, 1200)
  const state = app.navigateBack(); assert.equal(state.tabScrollTop.matches, 220)
  app.frame(); assert.equal(app.surface.scrollTop, 220)
})

test('deferred content clamps keep the logical tab target through navigation and filter rerenders', () => {
  const app = pendingRestorationApp(); app.surface.scrollHeight = 650; app.switchToMatches(); app.frame()
  assert.equal(app.surface.scrollTop, 50)
  const current = app.player(); current.props.onStateChange({ ...current.props.screenState, rankTrendMetric: 'goals' }); app.render(); app.commit()
  const state = app.navigateBack(); assert.equal(state.tabScrollTop.matches, 220)
  app.surface.scrollHeight = 1500; app.frame(); assert.equal(app.surface.scrollTop, 220)
  app.surface.scrollTop = 310
  assert.equal(app.navigateBack().tabScrollTop.matches, 310, 'settled restoration releases its logical override')
})

test('deliberate player scroll input cancels a clamped restoration and supersedes its logical target', () => {
  for (const [type, event] of [['wheel', { deltaY: 30 }], ['touchmove', {}], ['keydown', { key: 'PageDown' }], ['keydown', { key: 'ArrowDown', target: { tagName: 'BUTTON' } }], [require('../src/lib/scrollMotion.ts').APP_SCROLL_TO_TOP, {}]]) {
    const app = pendingRestorationApp(); app.surface.scrollHeight = 650; app.switchToMatches(); app.frame()
    app.emit(type, event); app.surface.scrollTop = 35; app.surface.scrollHeight = 1500; app.frame()
    assert.equal(app.surface.scrollTop, 35, type)
    assert.equal(app.navigateBack().tabScrollTop.matches, 35, type)
  }
})

test('restoration ignores horizontal/consumed/form input and removes listeners on completion or effect cleanup', () => {
  const app = pendingRestorationApp(); app.surface.scrollHeight = 650; app.switchToMatches(); app.frame()
  for (const [type, event] of [['wheel', { deltaY: 0, deltaX: 30 }], ['wheel', { deltaY: 30, defaultPrevented: true }], ['keydown', { key: 'Enter' }], ['keydown', { key: 'ArrowDown', target: { tagName: 'SELECT' } }], ['keydown', { key: ' ', target: { tagName: 'BUTTON' } }]]) app.emit(type, event)
  app.surface.scrollHeight = 1500; app.frame(); assert.equal(app.surface.scrollTop, 220)
  assert.equal([...app.listeners.values()].flatMap(set => [...set]).length, 0)
  const { restoreScrollWhenReachable } = require('../src/lib/scrollRestoration.ts')
  let callback, settled = 0, removed = 0
  const surface = { scrollTop: 0, scrollHeight: 600, clientHeight: 600, addEventListener: noop, removeEventListener: () => removed++ }
  const stop = restoreScrollWhenReachable(surface, 220, fn => { callback = fn; return 1 }, noop, 2, { cancelOnUserInput: true, onSettled: () => settled++ })
  callback(); assert.equal(settled, 0); callback(); assert.equal(settled, 1); assert.equal(removed, 4)
  callback(); assert.equal(settled, 1, 'completion is idempotent')
  stop()
  const cancel = restoreScrollWhenReachable(surface, 220, fn => { callback = fn; return 1 }, noop, 2, { cancelOnUserInput: true, onSettled: () => settled++ })
  cancel(); callback(); assert.equal(settled, 1, 'effect cleanup cancels without reporting a reached target')
})
