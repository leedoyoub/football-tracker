process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness } = require('./helpers/v259-harness.cjs')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { renderToStaticMarkup } = require('react-dom/server')
const baseline = baselineSource(), samples = Number(process.env.V2514_SAMPLES || 7)
const noop = () => {}
const timed = fn => { const start = performance.now(), result = fn(); return { ms: performance.now() - start, result } }
function run(root, size = [367, 2, 1152]) {
  const values = {}, structure = {}, heapStart = process.memoryUsage().heapUsed
  const fixture = () => {
    const s = performanceFixture(size[1]); s.matches = s.matches.slice(0, size[2])
    s.players = s.players.slice(0, size[0])
    while (s.players.length < size[0]) s.players.push({ ...s.players[0], id: `extra:${s.players.length}` })
    return { ...s, competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0 }
  }
  const nav = require(path.join(root, 'src/lib/navigation.ts'))
  const engine = file => require(path.join(root, 'src', file))
  function project(label, make) {
    const s = fixture(), operation = make(s)
    values[`${label} cold`] = timed(operation).ms; values[`${label} warm`] = timed(operation).ms
  }
  function screen(label, name, makeProps, next) {
    const s = fixture(), props = { season: 'Season 1', onNavigate: noop, onBack: noop, onStateChange: noop, ...makeProps(s) }
    const h = screenHarness(root, `screens/${name}.tsx`, name, s)
    values[`${label} cold`] = timed(() => h.render(props)).ms
    values[`${label} warm`] = timed(() => h.render(props)).ms
    const ssr = timed(() => renderToStaticMarkup(h.render(props)))
    values[`${label} SSR`] = ssr.ms
    structure[label] = { nodes: (ssr.result.match(/<[a-z][^/>]*>/g) || []).length, bytes: Buffer.byteLength(ssr.result) }
    if (next) values[`${label} filter`] = timed(() => renderToStaticMarkup(h.render(next(props, s)))).ms
  }
  for (const tab of ['overview', 'players', 'matches']) screen(`Team ${tab}`, 'TeamDetailScreen', s => ({ teamId: s.teams[0].id, screenState: { ...nav.defaultScreenState({ name: 'team', id: s.teams[0].id }), tab } }), p => ({ ...p, screenState: { ...p.screenState, playersCompetition: 'cup', matchesCompetition: 'cup', bestPlayersMetric: 'goals' } }))
  screen('Team matches long', 'TeamDetailScreen', s => {
    s.matches.push(...s.matches.filter(m => m.season === 'Season 1' && m.teamId === s.teams[0].id).map(m => ({ ...m, id: `long:${m.id}` })))
    return { teamId: s.teams[0].id, screenState: { ...nav.defaultScreenState({ name: 'team', id: s.teams[0].id }), tab: 'matches' } }
  })
  project('Match Changes', s => () => engine('engine/matchChangeIndex.ts').buildMatchChangeIndex(s.players, s.teams, s.matches, s.competitionStates))
  screen('Recap locked', 'SeasonRecapScreen', () => ({}))
  project('Recap complete', s => { const states = [...s.competitionStates, { id: 'complete', kind: 'season-complete', season: 'Season 1' }]; return () => engine('engine/seasonInsights.ts').seasonRecap(s.players, s.matches, 'Season 1', states, s.teams) })
  screen('Comparison', 'ComparisonScreen', s => ({ screenState: { ...nav.defaultScreenState({ name: 'comparison' }), leftId: s.players[8].id, rightId: s.players[9].id } }), p => ({ ...p, screenState: { ...p.screenState, competition: 'cup' } }))
  project('Chemistry onPitch', s => () => engine('engine/analytics.ts').onPitchStats(s.players, s.matches, { season: 'Season 1' }))
  project('Chemistry combinations', s => () => engine('engine/analytics.ts').combinationStats(s.players, s.matches, { season: 'Season 1' }, 'duo'))
  project('Records units', s => () => engine('engine/unitRecords.ts').buildUnitRecords(s.players, s.matches, [], new Set(['attack:2', 'attack:3', 'attack:4'])))
  project('Home Latest Changes', s => () => engine('engine/latestChanges.ts').deriveLatestChanges(s.players, s.teams, s.matches, s.competitionStates, 'Season 1'))
  screen('Highlight News', 'SeasonHighlightScreen', () => ({ kind: 'news' }))
  screen('Latest Changes list', 'LatestChangesScreen', () => ({}))
  project('Player restore', s => { const storage = { getItem: () => JSON.stringify({ version: 2, view: { name: 'player', id: s.players[9].id }, screenState: { name: 'player', season: 'Season 1', competition: 'all', rankTrendMetric: 'goals' } }) }; return () => engine('lib/lastRoute.ts').loadLastNavigationEntry(s, storage) })
  project('League History', s => () => engine('engine/seasonAnalytics.ts').buildLeagueHistory(s.teams, s.players, s.matches, 'Season 1'))
  project('Season Analytics', s => () => engine('engine/seasonAnalytics.ts').buildSeasonAnalytics(s.teams, s.players, s.matches, 'Season 1'))
  return { values, structure, heapDeltaBytes: process.memoryUsage().heapUsed - heapStart }
}
const summary = values => { const sorted = [...values].sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samples: values } }
try {
  const report = { baseSha: baseline.BASE_SHA, node: process.version, cpu: os.cpus()[0].model, samples, explicitGc: !!global.gc, method: 'Alternating archived/current source graphs; fresh deterministic data per workload per sample. Screen harness temporary modules have no retaining parent. Screen hook CPU and production React SSR, not browser layout/FPS. Records units requests attack 2/3/4; extra players >367 have no appearances. Heap deltas are allocation observations, not retained app heap.', before: {}, after: {}, sizes: [] }
  const output = process.env.V2514_OUTPUT || 'docs/performance/v2.5.14.json'
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const checkpoint = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  const sides = process.env.V2514_BASELINE_ONLY ? ['before'] : ['before', 'after'], all = { before: {}, after: {} }
  for (let i = 0; i < samples; i++) for (const side of i % 2 ? [...sides].reverse() : sides) {
    global.gc?.(); const r = run(side === 'before' ? baseline.directory : baseline.root)
    for (const [k, v] of Object.entries(r.values)) (all[side][k] ??= []).push(v)
    report[side].structure = r.structure; (report[side].heapDeltas ??= []).push(r.heapDeltaBytes)
    report[side].timings = Object.fromEntries(Object.entries(all[side]).map(([k, values]) => [k, summary(values)]))
    checkpoint()
    console.log(`sample ${i + 1}/${samples} ${side}`)
  }
  for (const side of sides) report[side].timings = Object.fromEntries(Object.entries(all[side]).map(([k, values]) => [k, summary(values)]))
  if (!process.env.V2514_BASELINE_ONLY) for (const size of [[100, 1, 100], [300, 2, 500], [500, 3, 1728]]) {
    const item = { size, before: [], after: [] }; report.sizes.push(item)
    for (let i = 0; i < 5; i++) for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) { global.gc?.(); item[side].push(run(side === 'before' ? baseline.directory : baseline.root, size)); checkpoint(); console.log(`size ${size.join('/')} ${i + 1}/5 ${side}`) }
  }
  report.complete = true; checkpoint()
  for (const key of Object.keys(all.before)) console.log(key, report.before.timings[key].medianMs.toFixed(3), '->', report.after.timings?.[key]?.medianMs.toFixed(3) ?? 'baseline')
} finally { baseline.cleanup() }
