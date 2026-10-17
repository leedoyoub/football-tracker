process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path')
const { performance } = require('node:perf_hooks')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness } = require('./helpers/v259-harness.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const b = baselineSource(), noop = () => {}, values = { before: {}, after: {} }
const timed = fn => { const t = performance.now(); fn(); return performance.now() - t }
const summary = samples => { const s = samples.slice().sort((a, b) => a - b); return { medianMs: s[3], p95Ms: s[6], samples } }
try {
  for (let i = 0; i < 7; i++) for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
    global.gc?.()
    const root = side === 'before' ? b.directory : b.root, nav = require(path.join(root, 'src/lib/navigation.ts'))
    for (const tab of ['overview', 'players', 'matches', 'comparison']) {
      const store = { ...performanceFixture(2), competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0 }
      const name = tab === 'comparison' ? 'ComparisonScreen' : 'TeamDetailScreen'
      const props = { season: 'Season 1', teamId: store.teams[0].id, onNavigate: noop, onBack: noop, onStateChange: noop,
        screenState: tab === 'comparison' ? { ...nav.defaultScreenState({ name: 'comparison' }), leftId: store.players[9].id, rightId: store.players[10].id } : { ...nav.defaultScreenState({ name: 'team', id: store.teams[0].id }), tab } }
      const mount = () => screenHarness(root, `screens/${name}.tsx`, name, store)
      const first = mount()
      let initial
      const cold = timed(() => { initial = first.render(props) })
      ;(values[side][`${tab} cold CPU`] ??= []).push(cold)
      let html
      ;(values[side][`${tab} cold SSR`] ??= []).push(timed(() => { html = renderToStaticMarkup(initial) }))
      ;(values[side][`${tab} DOM nodes`] ??= []).push((html.match(/<[a-z][^/>]*>/g) || []).length)
      const h = mount()
      const ms = timed(() => renderToStaticMarkup(h.render(props)))
      ;(values[side][`${tab} warm remount CPU+SSR`] ??= []).push(ms)
      if (tab === 'overview') (values[side]['Best Players metric CPU+SSR'] ??= []).push(timed(() => renderToStaticMarkup(h.render({ ...props, screenState: { ...props.screenState, bestPlayersMetric: 'goals' } }))))
      if (tab === 'comparison') (values[side]['Comparison selection CPU+SSR'] ??= []).push(timed(() => renderToStaticMarkup(h.render({ ...props, screenState: { ...props.screenState, leftId: store.players[8].id } }))))
    }
    console.log(`remount ${i + 1}/7 ${side}`)
  }
  const report = { baseSha: b.BASE_SHA, node: process.version, method: 'New hook lifecycle on same data after fully warming first mount/SSR; independent archived/current graphs, alternating sides; milliseconds include production React SSR, not browser layout.', before: {}, after: {} }
  for (const side of ['before', 'after']) report[side] = Object.fromEntries(Object.entries(values[side]).map(([key, samples]) => [key, key.endsWith('DOM nodes') ? { medianCount: [...samples].sort((a, b) => a - b)[3], samples } : summary(samples)]))
  fs.writeFileSync('docs/performance/v2.5.14-remount.json', JSON.stringify(report, null, 2) + '\n')
  for (const key of Object.keys(report.before)) console.log(key, (report.before[key].medianMs ?? report.before[key].medianCount).toFixed(3), '->', (report.after[key].medianMs ?? report.after[key].medianCount).toFixed(3))
} finally { b.cleanup() }
