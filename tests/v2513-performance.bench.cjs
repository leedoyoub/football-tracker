process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness } = require('./helpers/v259-harness.cjs')
const { baselineSource } = require('./helpers/v2513-baseline.cjs')
const { renderToStaticMarkup } = require('react-dom/server')
const baseline = baselineSource()
const samples = Number(process.env.V2513_SAMPLES || 5)
const timed = fn => { const t = performance.now(); const result = fn(); return { ms: performance.now() - t, result } }
function run(root, count = 367, seasons = 2, matchCount) {
  const s = performanceFixture(seasons)
  if (matchCount) s.matches = s.matches.slice(0, matchCount)
  if (count < s.players.length) s.players = s.players.slice(0, count)
  while (s.players.length < count) { const p = s.players[s.players.length % 367]; s.players.push({ ...p, id: `extra:${s.players.length}`, name: `Extra ${s.players.length}` }) }
  const nav = require(path.join(root, 'src/lib/navigation.ts'))
  const stats = require(path.join(root, 'src/engine/stats.ts'))
  const records = require(path.join(root, 'src/screens/recordsLeaderboards.ts'))
  const measurements = {}, structure = {}
  const noop = () => {}
  const render = (screen, props) => {
    // Detail cold entry must not inherit Players' eager/lazy role-cache work.
    const screenStore = screen === 'PlayerDetailScreen' ? structuredClone(s) : s
    const h = screenHarness(root, `screens/${screen}.tsx`, screen, screenStore)
    const first = timed(() => h.render(props)), again = timed(() => h.render(props))
    measurements[`${screen} first CPU`] = first.ms; measurements[`${screen} repeat CPU`] = again.ms
    if (screen !== 'PlayerDetailScreen') {
      const ssr = timed(() => renderToStaticMarkup(first.result)); measurements[`${screen} SSR`] = ssr.ms
      structure[screen] = { domNodes: (ssr.result.match(/<[a-z][^/>]*>/g) || []).length, bytes: Buffer.byteLength(ssr.result) }
    }
    if (screen === 'PlayersScreen') {
      measurements['Players search and render'] = timed(() => renderToStaticMarkup(h.render({ ...props, screenState: { ...props.screenState, search: 'arsenal' } }))).ms
      measurements['Players filter and render'] = timed(() => renderToStaticMarkup(h.render({ ...props, screenState: { ...props.screenState, filters: { seasons: ['Season 1'], teams: [s.teams[0].id], positions: [] } } }))).ms
    }
    if (screen === 'PlayerDetailScreen') {
      const reentry = screenHarness(root, `screens/${screen}.tsx`, screen, screenStore)
      measurements['Player Detail remount CPU'] = timed(() => reentry.render(props)).ms
      const next = screenHarness(root, `screens/${screen}.tsx`, screen, screenStore)
      measurements['Player Detail next player remount CPU'] = timed(() => next.render({ ...props, playerId: s.players[10].id, screenState: nav.defaultScreenState({ name: 'player', id: s.players[10].id }) })).ms
    }
  }
  render('ResultsScreen', { onNavigate: noop, onBack: noop })
  render('PlayersScreen', { screenState: nav.defaultScreenState({ name: 'players' }), onStateChange: noop, onNavigate: noop })
  const comp = screenHarness(root, 'components/CompetitionMatches.tsx', 'CompetitionMatches', {})
  const cm = timed(() => renderToStaticMarkup(comp.render({ season: 'Season 1', type: 'league', matches: s.matches, teams: s.teams, filters: { teamId: null, period: null }, onFiltersChange: noop, onNavigate: noop })))
  measurements['CompetitionMatches SSR'] = cm.ms; structure.CompetitionMatches = { domNodes: (cm.result.match(/<[a-z][^/>]*>/g) || []).length }
  render('PlayerDetailScreen', { playerId: s.players[9].id, season: 'Season 1', screenState: nav.defaultScreenState({ name: 'player', id: s.players[9].id }), onStateChange: noop, onNavigate: noop, onBack: noop })
  const input = { category: 'player', section: 'awards', ...s, states: s.competitionStates, scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' } }
  const cold = timed(() => records.recordsLeaderboardGroups(input)); measurements['Awards Records cold'] = cold.ms
  measurements['Awards Records warm'] = timed(() => records.recordsLeaderboardGroups(input)).ms
  const history = performanceFixture(seasons)
  measurements['Team History cold'] = timed(() => records.recordsLeaderboardGroups({ ...input, ...history, states: history.competitionStates, category: 'team', section: 'awards' })).ms
  const team = s.teams[0].id, roster = s.players.filter(p => p.teamId === team)
  const badgePath = path.join(root, 'src/engine/seasonGoalContributions.ts')
  const badges = fs.existsSync(badgePath) ? require(badgePath).seasonGoalContributions : null
  measurements['New Match season badges'] = timed(() => badges ? badges(roster, s.matches, 'Season 1', team, 'league') : roster.map(p => stats.playerSeasonStats(p, s.players, s.matches, 'Season 1', team, 'league'))).ms
  return { measurements, structure, fixture: { players: s.players.length, matches: s.matches.length, seasons, extraPlayersHaveMatches: count <= 367 } }
}
function summary(values) { const sorted = [...values].sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samples: values } }
try {
  const report = { baseSha: baseline.BASE_SHA, node: process.version, cpu: os.cpus()[0].model, method: 'Alternating independent archived/current graphs, production React SSR and screen CPU; not browser layout/FPS. Detail uses independent cold data to exclude earlier directory role-cache priming. Explicit GC between sides when --expose-gc is enabled. Extra directory players above 367 have no recorded appearances.', explicitGc: !!global.gc, before: {}, after: {}, sizes: [] }
  const values = { before: {}, after: {} }
  for (let sample = 0; sample < samples; sample++) for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
    global.gc?.()
    const r = run(side === 'before' ? baseline.directory : baseline.root)
    for (const [k, v] of Object.entries(r.measurements)) (values[side][k] ??= []).push(v)
    report[side].structure = r.structure; report.fixture = r.fixture
  }
  for (const side of ['before', 'after']) report[side].timings = Object.fromEntries(Object.entries(values[side]).map(([k, v]) => [k, summary(v)]))
  for (const [players, seasons, matches] of [[100, 1, 100], [300, 2, 500], [500, 3, 1728]]) report.sizes.push({ players, seasons, before: run(baseline.directory, players, seasons, matches), after: run(baseline.root, players, seasons, matches) })
  const output = process.env.V2513_OUTPUT || 'docs/performance/v2.5.13.json'
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  for (const key of Object.keys(values.before)) console.log(key, report.before.timings[key].medianMs.toFixed(3), '->', report.after.timings[key].medianMs.toFixed(3))
  console.log('DOM', JSON.stringify({ before: report.before.structure, after: report.after.structure }))
} finally { baseline.cleanup() }
