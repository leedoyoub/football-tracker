require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
;(async () => {
  const fixture = performanceFixture(2)
  const view = { name: 'player', id: fixture.players[9].id, season: 'Season 2' }
  const state = { ...defaultScreenState(view), tab: 'matches', season: 'Season 2', competition: 'league' }
  const server = await serveBuild('dist')
  let browser
  try {
    browser = await launchBrowser()
    const page = await browser.page(`if(location.protocol==='http:'&&!sessionStorage.getItem('v268-seeded')){sessionStorage.setItem('v268-seeded','true');${seedApplication(fixture, view, state)}}`, 390)
    await page.command('Network.setBypassServiceWorker', { bypass: false })
    await page.navigate(server.url)
    const selected = `document.querySelector('[aria-label="Player detail section"] [aria-selected=true]')?.textContent==='Matches'`
    await page.waitFor(selected)
    await page.evaluate('navigator.serviceWorker.ready.then(()=>true)')
    await page.waitFor('!!navigator.serviceWorker.controller')
    // Populate the existing worker's hashed JS/CSS cache through a controlled load.
    await page.reload(); await page.waitFor(selected)
    await page.waitFor(`caches.keys().then(async keys=>{const name=keys.find(k=>k.startsWith('football-tracker-'));if(!name)return false;const urls=(await (await caches.open(name)).keys()).map(r=>r.url);return ['.js','.css'].every(extension=>urls.some(url=>url.includes('/assets/')&&url.endsWith(extension)))})`)
    const cachedAssets = await page.evaluate(`caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('football-tracker-')).map(async name=>({name,urls:(await (await caches.open(name)).keys()).map(request=>request.url)}))))`)
    const before = await page.evaluate(`JSON.parse(localStorage.getItem('football-tracker-v1')).matches.map(m=>m.id)`)
    await page.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await page.reload(); await page.waitFor(selected)
    const result = await page.evaluate(`({competition:document.querySelector('[aria-label="Player detail competition"] [aria-pressed=true]')?.textContent,matches:JSON.parse(localStorage.getItem('football-tracker-v1')).matches.map(m=>m.id),controller:!!navigator.serviceWorker.controller})`)
    assert.deepEqual(result.matches, before); assert.equal(result.competition, 'League'); assert.equal(result.controller, true)
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
    fs.writeFileSync('docs/performance/v2.6.8-offline.json', JSON.stringify({ method: 'Isolated production Chromium, actual service worker with bypass disabled, JS/CSS cache primed online then CDP offline reload with a new-document barrier; synthetic data only. Does not claim physical installed iOS PWA validation.', offlineReload: true, tabAndCompetitionRestored: true, storedMatchCount: result.matches.length, allStoredIdsPreserved: true, cachedAssets, errors: browser.exceptions }, null, 2) + '\n')
    console.log('Offline service worker reload, route filters and 1152 stored match IDs passed')
    await page.close()
  } catch (error) { console.error('Offline test failed:', error.message); throw error }
  finally { try { if (browser) await browser.close() } finally { await server.close() } }
})().catch(error => { console.error(error); process.exitCode = 1 })
