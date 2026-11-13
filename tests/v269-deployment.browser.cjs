const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { launchBrowser } = require('./helpers/v267-browser.cjs')
;(async () => {
  const browser = await launchBrowser()
  try {
    const page = await browser.page('', 390)
    await page.command('Network.setBypassServiceWorker', { bypass: false })
    await page.navigate('https://leedoyoub.github.io/football-tracker/')
    // A fresh public session starts at the anonymous/sign-in choice. Exercise
    // the existing local-only entry instead of assuming saved device consent.
    await page.waitFor('!!document.querySelector(".app-content footer") || [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Continue without signing in")', 60000)
    const anonymousEntry = await page.evaluate('(() => { const button = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Continue without signing in"); if (!button) return false; button.click(); return true })()')
    await page.waitFor('document.querySelector(".app-content footer")?.textContent.includes("v2.6.9")', 60000)
    const result = await page.evaluate('({url:location.href,title:document.querySelector(".app-content h1")?.textContent,versionFooter:document.querySelector(".app-content footer").textContent,serviceWorkerScript: navigator.serviceWorker.getRegistration().then(r=>r?.active?.scriptURL)})')
    // Promise-valued properties are resolved explicitly for the JSON evidence.
    result.serviceWorkerScript = await page.evaluate('navigator.serviceWorker.ready.then(r=>r.active?.scriptURL)')
    assert(result.versionFooter.includes('v2.6.9'))
    assert(result.serviceWorkerScript.endsWith('/sw.js?v=2.6.9'))
    assert.deepEqual(browser.exceptions, [])
    const output = process.env.V269_DEPLOYMENT_OUTPUT || '.superpowers/sdd/v269/deployment.json'
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify({ checkedAt: new Date().toISOString(), method: 'Fresh isolated production Chromium context, actual public GitHub Pages URL, no fixture and no user profile. Choose the existing anonymous local entry when shown; read visible Home footer and active service-worker URL.', anonymousEntry, ...result, runtimeErrors: browser.exceptions }, null, 2)+'\n')
    console.log(JSON.stringify(result))
    await page.close()
  } finally { await browser.close() }
})().catch(error=>{ console.error(error); process.exitCode=1 })
