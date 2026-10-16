// Production JSX avoids development owner-stack capture inside render callbacks.
// The shipped application uses the same production React runtime.
process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { performance } = require('node:perf_hooks')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineSource } = require('./helpers/v2511-baseline.cjs')
const baseline = baselineSource()
const samples = Number(process.env.V2511_SAMPLES || 7)
const summarize = values => { const sorted = values.slice().sort((a,b) => a-b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const timed = fn => { const t = performance.now(); const value = fn(); return { ms: performance.now() - t, value } }
const result = { baseSha: baseline.BASE_SHA, node: process.version, reactMode: process.env.NODE_ENV, cpu: os.cpus()[0].model, samples, method: 'Alternating baseline/current independent source graphs and deterministic synthetic stores, production React. Hook harness measures screen CPU; React server rendering measures SSR CPU and emitted DOM structure. These are not browser commits, layout, paint, FPS or input latency.', before: {}, after: {} }
function run(root) {
  const stats = require(path.join(root, 'src/engine/stats.ts'))
  const analytics = require(path.join(root, 'src/engine/seasonAnalytics.ts'))
  const nav = require(path.join(root, 'src/lib/navigation.ts'))
  const s = performanceFixture()
  const matches = s.matches.filter(m => m.season === 'Season 2')
  const filter = { seasons: ['Season 2'], teams: [], positions: [] }
  const build = timed(() => stats.buildGlobalRankingData(s.players, matches, filter, 'rating'))
  const buildAgain = timed(() => stats.buildGlobalRankingData(s.players, matches, filter, 'rating'))
  const rank = timed(() => stats.rankGlobalRankingRows(build.value, s.players, 'rating'))
  const rankAgain = timed(() => stats.rankGlobalRankingRows(build.value, s.players, 'rating'))
  if (buildAgain.value !== build.value || rankAgain.value !== rank.value) throw new Error('Cache identity changed')
  const history = timed(() => analytics.buildSeasonAnalytics(s.teams, s.players, s.matches, 'Season 2'))
  const movement = timed(() => analytics.rankingMovement(history.value.playerSnapshots.get(history.value.currentMatchDay), history.value.playerSnapshots.get(history.value.currentMatchDay - 1), 'goals'))
  const h = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', s)
  const props = { season: 'Season 2', onNavigate() {}, onStateChange() {}, onBack() {} }
  const values = { 'build facts cold': build.ms, 'build facts cache hit': buildAgain.ms, 'rank cold': rank.ms, 'rank cache hit': rankAgain.ms, 'League analytics cold': history.ms, 'League movement': movement.ms }
  const filteredStore = performanceFixture()
  const filtered = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', filteredStore)
  values['position-filtered League first screen CPU'] = timed(() => filtered.render({ ...props, screenState: { ...nav.defaultScreenState({ name: 'global-ranking' }), scope: 'league', positionFilter: 'gk' } })).ms
  const structure = {}
  for (const scope of ['all', 'league', 'cup', 'champions']) {
    const state = { ...nav.defaultScreenState({ name: 'global-ranking' }), scope }
    for (const [i, metric] of ['rating', 'goals', 'assists', 'rating', 'goals', 'assists'].entries()) {
      const screen = timed(() => h.render({ ...props, screenState: { ...state, metric } }))
      const ssr = timed(() => renderToStaticMarkup(screen.value))
      const key = `${scope} ${metric} ${i < 3 ? 'first' : 'repeat'}`
      values[`${key} screen CPU`] = screen.ms; values[`${key} SSR CPU`] = ssr.ms
      structure[key] = { domNodes: (ssr.value.match(/<[a-z][^/>]*>/g) || []).length, playerRows: (ssr.value.match(/aria-posinset=/g) || []).length || (ssr.value.match(/min-h-13/g) || []).length, bytes: Buffer.byteLength(ssr.value) }
    }
  }
  return { values, structure, fixture: { players: s.players.length, matches: s.matches.length, rankedPlayers: rank.value.length } }
}
try {
  const measurements = { before: {}, after: {} }
  for (let i = 0; i < samples; i++) {
    for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
      const runResult = run(side === 'before' ? baseline.directory : baseline.root)
      for (const [key, value] of Object.entries(runResult.values)) (measurements[side][key] ??= []).push(value)
      result[side].structure = runResult.structure; result.fixture = runResult.fixture
    }
  }
  for (const side of ['before', 'after']) result[side].timings = Object.fromEntries(Object.entries(measurements[side]).map(([key, values]) => [key, summarize(values)]))
  const output = path.join(baseline.root, 'docs/performance/v2.5.11-ranking.json')
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  for (const key of ['build facts cold', 'build facts cache hit', 'rank cold', 'rank cache hit', 'League analytics cold', 'League movement', 'all goals repeat screen CPU', 'all goals repeat SSR CPU', 'league goals repeat SSR CPU']) console.log(key, result.before.timings[key].medianMs.toFixed(3), '->', result.after.timings[key].medianMs.toFixed(3))
  console.log('Structure:', JSON.stringify({ before: result.before.structure['all goals repeat'], after: result.after.structure['all goals repeat'], fixture: result.fixture }))
} finally { baseline.cleanup() }
