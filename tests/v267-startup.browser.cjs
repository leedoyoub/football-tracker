require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib')
const assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication, ensureBaselineBuild } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const samples = Number(process.env.V267_SAMPLES || 11)
const output = process.argv[2] || 'docs/performance/v2.6.7-startup.json'
const baselineDirectory = process.env.V267_BASELINE_DIST || '.superpowers/sdd/v267/baseline-dist'
const currentDirectory = process.env.V267_CURRENT_DIST || 'dist'
const summary = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const memorySummary = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianBytes: sorted[Math.floor(sorted.length / 2)], p95Bytes: sorted[Math.ceil(sorted.length * .95) - 1], samplesBytes: values } }
function payload(directory) {
  const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8')
  const entry = html.match(/src="([^"]+\.js)"/)[1]
  const data = fs.readFileSync(path.join(directory, entry.replace('/football-tracker/', '')))
  return { entryBytes: data.length, entryGzipBytes: zlib.gzipSync(data).length }
}
;(async () => {
  ensureBaselineBuild(baselineDirectory)
  const fixture = performanceFixture(2), servers = { before: await serveBuild(baselineDirectory), after: await serveBuild(currentDirectory) }
  let browser
  try {
    browser = await launchBrowser()
    const report = { baseSha: 'fc6eab2f6ebd672058692b5f037808d2ffa26a03', browser: path.basename(browser.executable), cpu: os.cpus()[0].model, samples, fixture: { players: fixture.players.length, matches: fixture.matches.length, seasons: 2 }, method: 'Alternating baseline/current production builds on local HTTP without throttling; fresh isolated incognito context per navigation. App frame is first .app-content h1 plus next requestAnimationFrame, excluding synthetic localStorage seed time. FCP is the browser navigation paint entry and may be the loading shell. No real user storage, network conditions or physical mobile device claims. Service worker bypassed to compare release assets.', before: { payload: payload(baselineDirectory), routes: {} }, after: { payload: payload(currentDirectory), routes: {} } }
    report.method += ' Heap is a CDP observation immediately after reading the app-frame marker; deferred work may have begun. It is not peak usage or a leak test.'
    for (const [name, view, screenState] of [
      ['home', { name: 'home' }],
      ['league-overall', { name: 'competition', competitionType: 'league', season: 'Season 2' }, { ...defaultScreenState({ name: 'competition' }), leagueMenu: 'table' }],
      ['player-overview', { name: 'player', id: fixture.players[9].id, season: 'Season 2' }, { name: 'player', season: 'Season 2', competition: 'all', rankTrendMetric: 'rating', tab: 'overview' }],
      ['player-matches', { name: 'player', id: fixture.players[9].id, season: 'Season 2' }, { name: 'player', season: 'Season 2', competition: 'all', rankTrendMetric: 'rating', tab: 'matches' }],
    ]) {
      const times = { before: [], after: [] }, paints = { before: [], after: [] }, heaps = { before: [], after: [] }
      for (let i = 0; i < samples; i++) {
        for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
          const page = await browser.page(seedApplication(fixture, view, screenState), 390)
          await page.navigate(servers[side].url)
          await page.waitFor('window.__v267FirstScreen !== null')
          const measurement = await page.evaluate('({appMs:window.__v267FirstScreen-window.__v267SeedEnd,fcpMs:performance.getEntriesByType("paint").find(e=>e.name==="first-contentful-paint")?.startTime,title:document.querySelector(".app-content h1")?.textContent,seeded:JSON.parse(localStorage.getItem("football-tracker-v1")).matches.length})')
          assert.equal(measurement.seeded, 1152)
          times[side].push(measurement.appMs)
          if (measurement.fcpMs !== undefined) paints[side].push(measurement.fcpMs)
          const metrics = await page.command('Performance.getMetrics')
          heaps[side].push(metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize').value)
          await page.close()
        }
      }
      for (const side of ['before', 'after']) report[side].routes[name] = { appFrame: summary(times[side]), firstContentfulPaint: paints[side].length ? summary(paints[side]) : null, heapUsedAfterAppFrame: memorySummary(heaps[side]) }
      console.log(`${name}: ${report.before.routes[name].appFrame.medianMs.toFixed(1)} -> ${report.after.routes[name].appFrame.medianMs.toFixed(1)} ms`)
      fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    }
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
  } finally { try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) } }
})().catch(error => { console.error(error); process.exitCode = 1 })
