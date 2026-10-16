const { leagueCopy, unchangedPlayerMarkup } = require('./helpers/v2512-policy-comparison.cjs')
require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes, sourceModule } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const navigation = require('../src/lib/navigation.ts')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-interaction-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline root')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const noop = () => {}
function browser() {
  const frames = new Map(); const idles = new Map(); const entries = new Map(); const listeners = new Map(); let id = 0
  return { frames, idles, entries, listeners, requestAnimationFrame: fn => { frames.set(++id, fn); return id }, cancelAnimationFrame: key => frames.delete(key), requestIdleCallback: fn => { idles.set(++id, fn); return id }, cancelIdleCallback: key => idles.delete(key), addEventListener(type, fn) { const callbacks = listeners.get(type) ?? new Set(); callbacks.add(fn); listeners.set(type, callbacks) }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn) }, dispatch(type) { for (const callback of listeners.get(type) ?? []) callback() }, localStorage: { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) } }
}
async function withBrowser(fn) {
  const prior = { window: global.window, requestAnimationFrame: global.requestAnimationFrame, cancelAnimationFrame: global.cancelAnimationFrame }
  const host = browser(); global.window = host; global.requestAnimationFrame = host.requestAnimationFrame; global.cancelAnimationFrame = host.cancelAnimationFrame
  try { await fn(host) } finally { for (const [key, value] of Object.entries(prior)) { if (value === undefined) delete global[key]; else global[key] = value } }
}
const h = (sourceRoot, name, store) => screenHarness(sourceRoot, `screens/${name}.tsx`, name, store)
function count(object, method, fn) { const original = object[method]; let calls = 0; object[method] = (...args) => { calls++; return original(...args) }; try { fn(() => calls) } finally { object[method] = original } }

test('Home first browser render computes progress/recent only and leaves heavy summaries in independent boundaries', async () => withBrowser(() => {
  const store = performanceFixture(1)
  count(require('../src/engine/latestChanges.ts'), 'deriveLatestChanges', calls => {
    const tree = h(root, 'HomeScreen', store).render({ season: 'Season 1', screenState: navigation.defaultScreenState({ name: 'home' }), onNavigate: noop, onStateChange: noop })
    assert.equal(calls(), 0)
    const sections = [...renderToStaticMarkup(tree).matchAll(/data-home-section="([^"]+)"/g)].map(match => match[1])
    assert.deepEqual(sections, ['recent-matches', 'latest-changes', 'season-leaders', 'season-award-race', 'season-best-xi'])
  })
}))

test('Player Overview first browser render does not build full seasonal awards or global News', async () => withBrowser(() => {
  const store = performanceFixture(1)
  count(require('../src/engine/seasonAnalytics.ts'), 'buildSeasonAnalytics', calls => {
    h(root, 'PlayerDetailScreen', store).render({ playerId: store.players[9].id, season: 'Season 1', screenState: navigation.defaultScreenState({ name: 'player', id: store.players[9].id }), onNavigate: noop, onStateChange: noop, onBack: noop })
    assert.equal(calls(), 0)
  })
}))

test('settled Home and Player Detail retain v2.5.8 markup except approved Rating Details and Positions Played presentation', () => {
  const store = performanceFixture(1)
  for (const [name, view, extra] of [['HomeScreen', { name: 'home' }, {}], ['PlayerDetailScreen', { name: 'player', id: store.players[9].id }, { playerId: store.players[9].id }]]) {
    const props = { season: 'Season 1', screenState: navigation.defaultScreenState(view), onNavigate: noop, onStateChange: noop, onBack: noop, ...extra }
    // This fixture only plays ST. Preserve the complete comparison while applying
    // the explicitly changed copy and precision; low-share coverage lives in v2511.
    const expected = renderToStaticMarkup(h(baseline, name, store).render(props)).replace(/(<summary class="cursor-pointer text-zinc-400">)Rating Details · [A-Z]+ · \d+&#x27;(<\/summary>)/g, '$1Rating Details$2').replace('positions under 10% are hidden.', 'all played positions.').replace('100% · ', '100.0% · ')
    assert.equal(unchangedPlayerMarkup(renderToStaticMarkup(h(root, name, store).render(props))), unchangedPlayerMarkup(expected))
  }
})

test('narrow milestone projection exactly matches canonical global News for every roster ID and missing historical player', () => {
  const s = performanceFixture(2)
  const news = require('../src/engine/news.ts')
  assert.equal(typeof news.derivePlayerMilestones, 'function')
  const expected = require(path.join(baseline, 'src/engine/news.ts')).deriveNews(s.players, s.teams, s.matches)
  const original = JSON.stringify(s)
  for (const id of [...s.players.map(p => p.id), 'missing']) assert.deepStrictEqual(news.derivePlayerMilestones(id, s.players, s.teams, s.matches), expected.filter(item => item.playerId === id && item.milestone), id)
  assert.equal(JSON.stringify(s), original)
  assert.deepStrictEqual(news.deriveNews(s.players, s.teams, s.matches), leagueCopy(expected))
})

test('milestones refresh on immutable record edits/deletes and player transfers without changing IDs or scopes', () => {
  const s = performanceFixture(1); const news = require('../src/engine/news.ts')
  assert.equal(typeof news.derivePlayerMilestones, 'function')
  const old = require(path.join(baseline, 'src/engine/news.ts'))
  for (const matches of [s.matches.slice(0, 48), s.matches.slice(1, 48), s.matches.slice(0, 48).map((m, i) => i ? m : { ...m, events: [] })]) {
    const players = s.players.map((p, i) => i === 9 ? { ...p, teamId: s.teams[1].id, teamIds: [s.teams[1].id] } : p)
    assert.deepStrictEqual(news.derivePlayerMilestones(players[9].id, players, s.teams, matches), old.deriveNews(players, s.teams, matches).filter(item => item.playerId === players[9].id && item.milestone))
  }
})

test('DeferredAnalysis prepares once on idle, uses two-frame fallback and cancels unmounted work', async () => withBrowser(host => {
  assert(fs.existsSync('src/components/DeferredAnalysis.tsx'))
  const idle = screenHarness(root, 'components/DeferredAnalysis.tsx', 'DeferredAnalysis', {})
  const props = { children: 'ready', fallback: 'pending' }
  assert.equal(idle.render(props), 'pending'); const cleanup = idle.effects[0]()
  assert.equal(host.idles.size, 1)
  const callback = [...host.idles.values()][0]; callback(); assert.equal(idle.render(props), 'ready'); cleanup()
  delete host.requestIdleCallback
  const frame = screenHarness(root, 'components/DeferredAnalysis.tsx', 'DeferredAnalysis', {})
  assert.equal(frame.render(props), 'pending'); const cancel = frame.effects[0]()
  let job = [...host.frames.values()].at(-1); host.frames.clear(); job()
  assert.equal(frame.render(props), 'pending')
  job = [...host.frames.values()].at(-1); cancel(); job()
  assert.equal(frame.render(props), 'pending')
}))

test('disabled Cloud Sync returns before serializing unchanged entity collections', async () => {
  const sync = sourceModule(root, 'lib/sync.ts', { './supabase': { isCloudSyncEnabled: false, getSupabase() { throw new Error('Unexpected cloud access') } } }).SyncManager
  const s = performanceFixture(1); let calls = 0; const original = JSON.stringify
  JSON.stringify = (...args) => { calls++; return original(...args) }
  try { await sync.queueStateChange(s, { ...s, draftMatch: { ...s.matches[0], id: 'pending' } }); assert.equal(calls, 0) } finally { JSON.stringify = original }
})

test('enabled Cloud Sync keeps v2.5.8 upsert/delete payload order across raw entity changes', async () => {
  const s = performanceFixture(1)
  const next = { ...s, players: [...s.players.slice(1).map((p, i) => i ? p : { ...p, name: 'renamed' }), { ...s.players[0], id: 'new' }], matches: s.matches.slice(1).map((m, i) => i ? m : { ...m, events: [] }) }
  const run = async base => {
    const sync = sourceModule(base, 'lib/sync.ts', { './supabase': { isCloudSyncEnabled: true, getSupabase() { throw new Error('Queue diff must not fetch cloud') } } }).SyncManager
    const queued = []; sync.queueOperation = async item => queued.push(item)
    await sync.queueStateChange(s, next); return queued
  }
  assert.deepStrictEqual(await run(root), await run(baseline))
})

test('duplicate Draft checkpoints preserve identity, one 450ms timer, changed metadata and final-save suppression', async () => {
  const fixture = performanceFixture(1); const state = { teams: fixture.teams, players: [], matches: [], competitionStates: [] }
  const saved = []; const timers = new Map(); let id = 0
  const oldSet = global.setTimeout; const oldClear = global.clearTimeout
  global.setTimeout = (fn, delay) => { timers.set(++id, { fn, delay }); return id }; global.clearTimeout = key => timers.delete(key)
  try {
    const repository = require('../src/lib/repository.ts')
    const store = screenHarness(root, 'store.tsx', 'StoreProvider', {}, { './lib/auth': { useAuth: () => ({ user: null }) }, './components/StartupBoundary': { BootstrapShell: () => null, StartupRecovery: () => null }, './lib/repository': { ...repository, LocalRepository: { getAppState: async () => state, saveAppState: async next => { saved.push(next); return { primarySaved: true, mirrorSaved: true } } } }, './lib/sync': { SyncManager: { queueStateChange: async () => {}, syncNow: async () => {} } } })
    store.render({ children: null }); store.effects[0](); await Promise.resolve(); await Promise.resolve()
    let value = store.render({ children: null }).props.value
    const draft = { ...fixture.matches[0], id: 'pending', fulltimeOpponentSotAutoLinked: true }
    value.saveDraftMatch(draft); value = store.render({ children: null }).props.value
    const changes = store.stateChanges; const timer = [...timers.values()][0]
    assert.equal(timer.delay, 450)
    value.saveDraftMatch(structuredClone(draft))
    assert.equal(store.stateChanges, changes); assert.equal(timers.size, 1); assert.equal([...timers.values()][0], timer)
    value.saveDraftMatch({ ...draft, fulltimeOpponentSotAutoLinked: false }); value = store.render({ children: null }).props.value
    assert.equal(timers.size, 1); assert.notEqual([...timers.values()][0], timer)
    await value.saveMatchDurably({ ...draft, fulltimeOpponentSotAutoLinked: false }); value = store.render({ children: null }).props.value
    assert.equal(timers.size, 0); assert.equal(value.draftMatch, undefined)
    value.saveDraftMatch(draft); assert.equal(timers.size, 0)
    assert(saved.at(-1).matches.some(m => m.id === 'pending'))
  } finally { global.setTimeout = oldSet; global.clearTimeout = oldClear }
})

test('an identical Draft retries a failed primary save without resetting a pending timer or rewriting a successful checkpoint', async () => {
  const fixture = performanceFixture(1); const state = { teams: fixture.teams, players: [], matches: [], competitionStates: [] }
  const timers = new Map(); let id = 0; let writes = 0
  const oldSet = global.setTimeout; const oldClear = global.clearTimeout
  global.setTimeout = (fn, delay) => { timers.set(++id, { fn, delay }); return id }; global.clearTimeout = key => timers.delete(key)
  try {
    const repository = require('../src/lib/repository.ts')
    const store = screenHarness(root, 'store.tsx', 'StoreProvider', {}, { './lib/auth': { useAuth: () => ({ user: null }) }, './components/StartupBoundary': { BootstrapShell: () => null, StartupRecovery: () => null }, './lib/repository': { ...repository, LocalRepository: { getAppState: async () => state, saveAppState: async () => { if (++writes === 1) throw new Error('temporary primary failure'); return { primarySaved: true, mirrorSaved: true } } } }, './lib/sync': { SyncManager: { queueStateChange: async () => {}, syncNow: async () => {} } } })
    store.render({ children: null }); store.effects[0](); await Promise.resolve(); await Promise.resolve()
    let value = store.render({ children: null }).props.value
    const draft = { ...fixture.matches[0], id: 'retry-draft' }
    value.saveDraftMatch(draft); value = store.render({ children: null }).props.value
    const identity = value.draftMatch; const changes = store.stateChanges
    const first = [...timers.values()][0]; value.saveDraftMatch(structuredClone(draft))
    assert.equal([...timers.values()][0], first)
    timers.clear(); first.fn()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    assert.equal(writes, 1)
    value.saveDraftMatch(structuredClone(draft))
    assert.equal(timers.size, 1, 'failed identical checkpoint must schedule a retry')
    assert.equal([...timers.values()][0].delay, 450)
    // The new global pending/error status is visible; the Draft itself retains
    // its identity and a retry still creates exactly one 450 ms timer.
    assert.equal(store.stateChanges, changes + 2); assert.equal(store.render({ children: null }).props.value.draftMatch, identity)
    const retry = [...timers.values()][0]; timers.clear(); retry.fn()
    for (let i = 0; i < 20; i++) await Promise.resolve()
    assert.equal(writes, 2)
    value.saveDraftMatch(structuredClone(draft)); assert.equal(timers.size, 0)
  } finally { global.setTimeout = oldSet; global.clearTimeout = oldClear }
})

test('an identical Draft resumes its checkpoint after a failed final save cancels the pending timer', async () => {
  const fixture = performanceFixture(1); const state = { teams: fixture.teams, players: [], matches: [], competitionStates: [] }
  const timers = new Map(); let id = 0
  const oldSet = global.setTimeout; const oldClear = global.clearTimeout
  global.setTimeout = (fn, delay) => { timers.set(++id, { fn, delay }); return id }; global.clearTimeout = key => timers.delete(key)
  try {
    const repository = require('../src/lib/repository.ts')
    const store = screenHarness(root, 'store.tsx', 'StoreProvider', {}, { './lib/auth': { useAuth: () => ({ user: null }) }, './components/StartupBoundary': { BootstrapShell: () => null, StartupRecovery: () => null }, './lib/repository': { ...repository, LocalRepository: { getAppState: async () => state, saveAppState: async () => { throw new Error('temporary final failure') } } }, './lib/sync': { SyncManager: { queueStateChange: async () => {}, syncNow: async () => {} } } })
    store.render({ children: null }); store.effects[0](); await Promise.resolve(); await Promise.resolve()
    let value = store.render({ children: null }).props.value
    const draft = { ...fixture.matches[0], id: 'failed-final' }
    value.saveDraftMatch(draft); value = store.render({ children: null }).props.value
    await assert.rejects(value.saveMatchDurably(draft), /temporary final failure/)
    assert.equal(timers.size, 0)
    value.saveDraftMatch(structuredClone(draft)); assert.equal(timers.size, 1)
    assert.equal([...timers.values()][0].delay, 450)
  } finally { global.setTimeout = oldSet; global.clearTimeout = oldClear }
})

test('scroll checkpoints coalesce events, skip duplicates, flush final offsets and reject disposed callbacks', () => {
  const file = 'src/lib/scrollCheckpoint.ts'; assert(fs.existsSync(file))
  const { createScrollCheckpoint, registerScrollCheckpoint, flushScrollCheckpoints } = require('../src/lib/scrollCheckpoint.ts')
  const host = browser(); const commits = []
  const c = createScrollCheckpoint(left => commits.push(left), 0, host.requestAnimationFrame, host.cancelAnimationFrame)
  const unregister = registerScrollCheckpoint(c.flush)
  for (let i = 1; i <= 1000; i++) c.record(i)
  assert.equal(commits.length, 0); assert.equal(host.frames.size, 1)
  while (host.frames.size) { const frame = [...host.frames.values()][0]; host.frames.clear(); frame() }
  assert.deepEqual(commits, [1000])
  c.record(1000); assert.equal(host.frames.size, 0)
  c.record(1250); flushScrollCheckpoints(); assert.deepEqual(commits, [1000, 1250]); assert.equal(host.frames.size, 0)
  c.record(1500); c.dispose(); assert.deepEqual(commits, [1000, 1250, 1500])
  c.record(1700); assert.equal(host.frames.size, 0); unregister()
})

test('continuous frame-by-frame plot motion does not update App state until a quiet frame or explicit navigation flush', () => {
  const { createScrollCheckpoint } = require('../src/lib/scrollCheckpoint.ts')
  const host = browser(); const commits = []
  const c = createScrollCheckpoint(left => commits.push(left), 0, host.requestAnimationFrame, host.cancelAnimationFrame)
  c.record(1)
  for (let i = 2; i < 20; i++) {
    c.record(i)
    const frame = [...host.frames.values()][0]; host.frames.clear(); frame()
    assert.equal(commits.length, 0)
  }
  c.flush(); assert.deepEqual(commits, [19]); c.dispose()
})

test('Position History DOM scroll handler uses the checkpoint and commits through the latest callback', async () => withBrowser(host => {
  const s = performanceFixture(1)
  const analytics = require('../src/engine/seasonAnalytics.ts').buildLeagueHistory(s.teams, s.players, s.matches, 'Season 1')
  const plot = screenHarness(root, 'screens/CompetitionScreen.tsx', 'PositionHistory', {})
  const previous = []; const latest = []
  const props = { analytics, teams: s.teams, teamIds: [s.teams[0].id], plotScrollLeft: 125, onPlotScroll: left => previous.push(left) }
  const tree = plot.render(props)
  const scroller = nodes(tree, n => n.props?.['aria-label'] === 'League Position History horizontal plot')[0]
  const container = { scrollLeft: 125, scrollWidth: 1200, clientWidth: 200 }
  scroller.props.ref.current = container
  const cleanups = plot.effects.map(fn => fn())
  for (let left = 200; left < 240; left++) scroller.props.onScroll({ currentTarget: { scrollLeft: left } })
  assert.deepEqual(previous, []); assert.equal(host.frames.size, 1)
  plot.render({ ...props, onPlotScroll: left => latest.push(left) })
  plot.effects[0]() // Commit-time layout effect updates the callback before navigation.
  require('../src/lib/scrollCheckpoint.ts').flushScrollCheckpoints()
  assert.deepEqual(previous, []); assert.deepEqual(latest, [239])
  assert.equal(host.frames.size, 0)
  container.scrollLeft = 333
  scroller.props.onScroll({ currentTarget: container })
  plot.render({ ...props, plotScrollLeft: 239, onPlotScroll: left => latest.push(left) })
  plot.effects[0](); plot.effects[2]()
  assert.equal(container.scrollLeft, 333, 'an own checkpoint commit must not rewind a newer native scroll')
  cleanups.forEach(fn => fn?.())
}))

test('pagehide persists the latest pending League History offset before the handler returns', async () => withBrowser(host => {
  const s = performanceFixture(1)
  const analytics = require('../src/engine/seasonAnalytics.ts').buildLeagueHistory(s.teams, s.players, s.matches, 'Season 1')
  const plot = screenHarness(root, 'screens/CompetitionScreen.tsx', 'PositionHistory', {})
  const key = 'football-tracker-last-route'
  const screenState = { ...navigation.defaultScreenState({ name: 'competition' }), leagueMenu: 'history', historyPlotScrollLeft: 125 }
  const props = { analytics, teams: s.teams, teamIds: [s.teams[0].id], plotScrollLeft: 125, onPlotScroll: noop, onPersistPlotScroll: left => host.localStorage.setItem(key, JSON.stringify({ version: 2, view: { name: 'competition', season: 'Season 1' }, screenState: { ...screenState, historyPlotScrollLeft: left } })) }
  const tree = plot.render(props)
  const scroller = nodes(tree, n => n.props?.['aria-label'] === 'League Position History horizontal plot')[0]
  const container = { scrollLeft: 125, scrollWidth: 1200, clientWidth: 200 }
  scroller.props.ref.current = container
  const cleanups = plot.effects.map(fn => fn())
  try {
    container.scrollLeft = 377; scroller.props.onScroll({ currentTarget: container })
    host.dispatch('pagehide')
    assert.equal(JSON.parse(host.localStorage.getItem(key)).screenState.historyPlotScrollLeft, 377)
  } finally { cleanups.forEach(fn => fn?.()) }
}))

test('changing compared teams before a quiet frame preserves the latest native offset and navigation checkpoint', async () => withBrowser(() => {
  const s = performanceFixture(1)
  const analytics = require('../src/engine/seasonAnalytics.ts').buildLeagueHistory(s.teams, s.players, s.matches, 'Season 1')
  const plot = screenHarness(root, 'screens/CompetitionScreen.tsx', 'PositionHistory', {})
  const commits = []
  const props = { analytics, teams: s.teams, teamIds: [s.teams[0].id], plotScrollLeft: 125, onPlotScroll: left => commits.push(left) }
  const tree = plot.render(props)
  const scroller = nodes(tree, n => n.props?.['aria-label'] === 'League Position History horizontal plot')[0]
  const container = { scrollLeft: 125, scrollWidth: 1200, clientWidth: 200 }
  scroller.props.ref.current = container
  const cleanups = plot.effects.map(fn => fn())
  try {
    container.scrollLeft = 333; scroller.props.onScroll({ currentTarget: container })
    plot.render({ ...props, teamIds: [s.teams[0].id, s.teams[1].id] }); plot.effects[0](); plot.effects[2]()
    assert.equal(container.scrollLeft, 333, 'team selection must not rewind pending native movement')
    require('../src/lib/scrollCheckpoint.ts').flushScrollCheckpoints()
    assert.deepEqual(commits, [333])
  } finally { cleanups.forEach(fn => fn?.()) }
}))

test('App merges a late plot-only checkpoint with newer Matchday state and flushes before navigate/Back', async () => withBrowser(host => {
  const store = performanceFixture(1)
  const state = { ...navigation.defaultScreenState({ name: 'competition' }), leagueMenu: 'history', historyComparedTeamIds: [store.teams[0].id], historyMatchday: 1, historyPlotScrollLeft: 0 }
  host.entries.set('football-tracker-last-route', JSON.stringify({ version: 2, view: { name: 'competition', season: 'Season 1' }, screenState: state }))
  const overrides = { './store': { useStore: () => store }, './components/StartupBoundary': { BootstrapShell: () => null, StartupRecovery: () => null }, './lib/auth': { useAuth: () => ({ user: null, loading: false, startupError: false }) }, './lib/supabase': { isSupabaseConfigured: false } }
  for (const match of fs.readFileSync('src/App.tsx', 'utf8').matchAll(/import \{ (\w+) \} from '(\.\/screens\/[^']+)'/g)) overrides[match[2]] = { [match[1]]: function ScreenBoundary() {} }
  const app = screenHarness(root, 'App.tsx', 'App', store, overrides)
  app.render({}); app.effects.forEach(fn => fn())
  let tree = app.render({})
  const screen = () => nodes(tree, n => n.props?.screenState?.name === 'competition')[0]
  const original = screen().props.screenState
  screen().props.onStateChange({ ...original, historyMatchday: 2 }); tree = app.render({})
  screen().props.onStateChange({ ...original, historyPlotScrollLeft: 125 }, { historyPlotScrollLeft: 125 }); tree = app.render({})
  assert.equal(screen().props.screenState.historyMatchday, 2)
  assert.equal(screen().props.screenState.historyPlotScrollLeft, 125)
  screen().props.onPersistPlotScroll(377)
  const persisted = JSON.parse(host.localStorage.getItem('football-tracker-last-route'))
  assert.equal(persisted.screenState.historyMatchday, 2, 'lifecycle persistence must keep the latest unrelated screen state')
  assert.equal(persisted.screenState.historyPlotScrollLeft, 377, 'lifecycle persistence must synchronously save the newest plot offset')
  assert(fs.existsSync('src/lib/scrollCheckpoint.ts'))
  const { createScrollCheckpoint, registerScrollCheckpoint } = require('../src/lib/scrollCheckpoint.ts')
  const callback = screen().props.onStateChange
  const c = createScrollCheckpoint(left => callback({ ...original, historyPlotScrollLeft: left }, { historyPlotScrollLeft: left }), 125, host.requestAnimationFrame, host.cancelAnimationFrame)
  const unregister = registerScrollCheckpoint(c.flush)
  c.record(350); screen().props.onNavigate({ name: 'team', id: store.teams[0].id }); tree = app.render({})
  nodes(tree, n => n.props?.screenState?.name === 'team')[0].props.onBack(); tree = app.render({})
  assert.equal(screen().props.screenState.historyPlotScrollLeft, 350)
  assert.equal(screen().props.screenState.historyMatchday, 2)
  c.record(450)
  screen().props.onSeason('Season 2'); tree = app.render({})
  assert.equal(screen().props.screenState.historyPlotScrollLeft, null, 'season reset follows the outgoing checkpoint flush')
  assert.equal(screen().props.screenState.historyMatchday, null)
  assert.equal(host.frames.size, 0)
  c.dispose(); unregister()
}))
