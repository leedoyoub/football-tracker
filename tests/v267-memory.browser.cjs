require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication, ensureBaselineBuild } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const samples = Number(process.env.V267_SAMPLES || 11), output = process.argv[2] || 'docs/performance/v2.6.7-memory.json'
const summarize = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianBytes: sorted[Math.floor(sorted.length / 2)], p95Bytes: sorted[Math.ceil(sorted.length * .95) - 1], samplesBytes: values } }
;(async () => {
  const fixture = performanceFixture(2), servers = { before: await serveBuild(ensureBaselineBuild()), after: await serveBuild('dist') }
  let browser
  try {
    browser = await launchBrowser()
    const values = { before: [], after: [] }, nodes = { before: [], after: [] }
    const view = { name: 'player', id: fixture.players[9].id, season: 'Season 2' }, state = { name: 'player', season: 'Season 2', competition: 'all', rankTrendMetric: 'rating', tab: 'matches' }
    for (let sample = 0; sample < samples; sample++) for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
      const page = await browser.page(seedApplication(fixture, view, state), 390)
      await page.navigate(servers[side].url)
      await page.waitFor(side === 'before' ? '[...document.querySelectorAll("h2")].some(el=>el.textContent==="Career Personal Records")' : '[...document.querySelectorAll("h2")].some(el=>el.textContent==="Matches")')
      await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      await page.command('HeapProfiler.collectGarbage')
      const metrics = await page.command('Performance.getMetrics')
      values[side].push(metrics.metrics.find(metric => metric.name === 'JSHeapUsedSize').value)
      nodes[side].push(await page.evaluate('document.querySelectorAll(".app-content *").length'))
      await page.close()
    }
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
    const report = { baseSha: 'fc6eab2f6ebd672058692b5f037808d2ffa26a03', browser: path.basename(browser.executable), samples, fixture: { players: fixture.players.length, matches: fixture.matches.length, seasons: 2 }, method: 'Alternating isolated incognito contexts, selected Player Matches path. Baseline is its original combined Overview/Matches screen; await settled content, then two animation frames and forced V8 garbage collection before CDP JSHeapUsedSize observation. Measures retained JS heap of different intended screen workloads, not peak/browser-total memory or a long-term leak test. No timing claims from this run.', before: summarize(values.before), after: summarize(values.after), domElements: nodes }
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify({ output, beforeMiB: report.before.medianBytes / 1048576, afterMiB: report.after.medianBytes / 1048576 }))
  } finally { try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) } }
})().catch(error => { console.error(error); process.exitCode = 1 })
