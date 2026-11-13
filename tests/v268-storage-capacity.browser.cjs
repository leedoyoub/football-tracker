require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
;(async () => {
  const server = await serveBuild('dist'), results = []
  let browser
  try {
    browser = await launchBrowser()
    for (const seasons of [2, 6]) {
      const fixture = performanceFixture(seasons), payload = JSON.stringify(fixture)
      const seed = `if(location.protocol==='http:'){const previous='previous verified value';localStorage.setItem('football-tracker-v1',previous);try{localStorage.setItem('football-tracker-v1',${JSON.stringify(payload)});window.__capacity={saved:true,matches:JSON.parse(localStorage.getItem('football-tracker-v1')).matches.length}}catch(error){window.__capacity={saved:false,error:error.name,message:error.message,previousPreserved:localStorage.getItem('football-tracker-v1')===previous}}}`
      const page = await browser.page(seed, 390)
      // An SVG navigation supplies the same HTTP origin without starting App.
      await page.navigate(server.url + 'favicon.svg')
      await page.waitFor('!!window.__capacity')
      const actual = await page.evaluate('window.__capacity')
      if (seasons === 2) { assert.equal(actual.saved, true); assert.equal(actual.matches, 1152) }
      else { assert.equal(actual.saved, false); assert.equal(actual.error, 'QuotaExceededError'); assert.equal(actual.previousPreserved, true) }
      results.push({ seasons, matches: fixture.matches.length, jsonUtf8Bytes: Buffer.byteLength(payload), jsonCodeUnits: payload.length, ...actual })
      await page.close()
    }
    assert.equal(browser.exceptions.length, 0)
    fs.writeFileSync('docs/performance/v2.6.8-storage-capacity.json', JSON.stringify({ method: 'Native Chromium localStorage, fresh isolated context per unchanged existing fixture, no quota override/compression/in-memory storage shim. Same serialized fixture applies to both releases. Failing setItem must preserve the previous value. This is capacity validation, not a performance speed claim.', results }, null, 2) + '\n')
    console.log(JSON.stringify(results))
  } finally { try { if (browser) await browser.close() } finally { await server.close() } }
})().catch(error => { console.error(error); process.exitCode = 1 })
