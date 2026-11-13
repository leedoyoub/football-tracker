// Functional browser checks; performance benchmarks run separately and serially.
require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), fs = require('node:fs')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { playerAppearanceMatches } = require('../src/engine/playerDerived.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { playerForm } = require('../src/engine/playerForm.ts')
const { getMatchManOfTheMatch, ratePlayerMatch } = require('../src/engine/rating.ts')
const fixture = performanceFixture(2), player = fixture.players[11]
const view = { name: 'player', id: player.id }, state = { ...defaultScreenState(view), season: 'Season 1', tab: 'matches' }
const expected = playerAppearanceMatches(player, fixture.matches.filter(m => m.season === 'Season 1'))
const graphExpected = playerForm(derivePlayerScope(player, fixture.players, fixture.matches, { season: 'Season 1', competition: 'all' }).appearances).points
const plotSelector = '[aria-label="Recent Form horizontal plot"]'
const frames = page => page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
const route = page => page.evaluate('JSON.parse(localStorage.getItem("football-tracker-last-route")).view')
const back = async page => { await page.evaluate('document.querySelector(".detail-back button").click()'); await page.waitFor(`!!document.querySelector('${plotSelector}')`); await frames(page) }
async function graphPoint(page, index, kind = 'circle') {
  return page.evaluate(`(()=>{const plot=document.querySelector('${plotSelector}'),group=plot.querySelectorAll('g[role=button]')[${index}],point=group.querySelector('${kind}');point.scrollIntoView({block:'center',inline:'center'});const r=point.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,label:group.getAttribute('aria-label')}})()`)
}
async function click(page, point) {
  await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
}
;(async () => {
  let server, browser, report
  const results = []
  try {
    if (!process.env.V269_PLAYER_URL) server = await serveBuild('dist')
    browser = await launchBrowser()
    for (const width of (process.env.V269_PLAYER_WIDTHS || '320,375,390,1280').split(',').map(Number)) {
      console.log(`${width}px Player Matches`)
      const page = await browser.page(seedApplication(fixture, view, state), width)
      try {
        await page.navigate(process.env.V269_PLAYER_URL || server.url)
        await page.waitFor('document.querySelectorAll(".app-content article").length===36')
        const badges = await page.evaluate('[...document.querySelectorAll(".app-content article > button b")].map(b=>({text:b.textContent,tone:b.className}))')
        assert.deepEqual(badges, expected.map(match => ({ text: ratePlayerMatch(match, player).rating.toFixed(1) + (getMatchManOfTheMatch(match, fixture.players) === player.id ? ' ★' : ''), tone: getMatchManOfTheMatch(match, fixture.players) === player.id ? 'text-blue-300' : require('../src/components/ui.tsx').ratingTone(ratePlayerMatch(match, player).rating) })))
        const momBadges = badges.filter(badge => badge.text.endsWith(' ★')).length
        assert(momBadges > 0 && momBadges < badges.length, 'the unchanged fixture must exercise MOM and normal badges')
        const dom = await page.evaluate('({cards:document.querySelectorAll(".app-content article").length,elements:document.querySelectorAll(".app-content *").length,details:document.querySelectorAll(".app-content article details").length})')
        await page.evaluate('document.querySelector(".app-content article details summary").click()')
        await page.waitFor('document.querySelector(".app-content article details[open]")?.textContent.includes("Final Raw Rating")')
        await page.evaluate(`document.querySelector('[aria-label="Player detail section"] button').click()`)
        console.log(`${width}px Recent Form controls`)
        await page.waitFor(`document.querySelectorAll('${plotSelector} g[role=button]').length===36`)
        await frames(page)
        assert.equal(await page.evaluate(`document.querySelector('${plotSelector}').parentElement.querySelectorAll('button').length`), 0)
        const labels = await page.evaluate(`(()=>{const p=document.querySelector('${plotSelector}');return [...p.querySelectorAll('g[role=button]')].map(g=>g.getAttribute('aria-label'))})()`)
        // Mouse drag that ends on an adjacent label must not activate a match.
        const point = await graphPoint(page, 20)
        await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
        await page.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x + 30, y: point.y, button: 'left', buttons: 1 })
        await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x + 30, y: point.y, button: 'left', clickCount: 1 })
        await frames(page); assert.equal((await route(page)).name, 'player')
        // A real browser touch scroll remains horizontal and does not go Back.
        const touchPoint = await graphPoint(page, 20)
        const beforeScroll = await page.evaluate(`document.querySelector('${plotSelector}').scrollLeft`)
        await page.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
        await page.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: touchPoint.x, y: touchPoint.y, id: 1 }] })
        for (const dx of [20, 40, 60, 80]) await page.command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: touchPoint.x + dx, y: touchPoint.y, id: 1 }] })
        await page.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await frames(page); assert.equal((await route(page)).name, 'player')
        const afterScroll = await page.evaluate(`document.querySelector('${plotSelector}').scrollLeft`)
        assert(afterScroll < beforeScroll, `horizontal touch scroll must move: ${beforeScroll} -> ${afterScroll}`)
        await page.evaluate(`new Promise(resolve=>{const p=document.querySelector('${plotSelector}');let last=p.scrollLeft,quiet=0;const check=()=>{quiet=Math.abs(p.scrollLeft-last)<0.5?quiet+1:0;last=p.scrollLeft;if(quiet>=8)resolve();else requestAnimationFrame(check)};requestAnimationFrame(check)})`)
        const tapPoint = await graphPoint(page, 13, 'text')
        await frames(page)
        await page.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tapPoint.x, y: tapPoint.y, id: 1 }] })
        await page.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitFor('JSON.parse(localStorage.getItem("football-tracker-last-route")).view.name==="match"')
        assert.equal((await route(page)).id, graphExpected[13].match.id, 'touch tap opens the exact graph match')
        await back(page)
        await page.command('Emulation.setTouchEmulationEnabled', { enabled: false })
        console.log(`${width}px exact graph routes`)
        // Both visible numbers and dots retain exact match identity.
        for (const [index, kind] of [[5, 'text'], [17, 'circle']]) {
          await click(page, await graphPoint(page, index, kind))
          await page.waitFor('JSON.parse(localStorage.getItem("football-tracker-last-route")).view.name==="match"')
          const destination = await route(page), match = fixture.matches.find(m => m.id === destination.id)
          assert(labels[index].startsWith(match.date + ' · '))
          assert.equal(destination.id, graphExpected[index].match.id, `point ${index}: ${labels[index]}`)
          await back(page)
        }
        for (const key of ['Enter', ' ']) {
          await graphPoint(page, 11)
          await page.evaluate(`document.querySelectorAll('${plotSelector} g[role=button]')[11].focus()`)
          await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === ' ' ? 'Space' : 'Enter', windowsVirtualKeyCode: key === ' ' ? 32 : 13 })
          await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === ' ' ? 'Space' : 'Enter', windowsVirtualKeyCode: key === ' ' ? 32 : 13 })
          await page.waitFor('JSON.parse(localStorage.getItem("football-tracker-last-route")).view.name==="match"')
          assert.equal((await route(page)).id, graphExpected[11].match.id)
          await back(page)
        }
        const bounds = await page.evaluate('({viewport:innerWidth,body:document.documentElement.scrollWidth,client:document.querySelector(".app-content").clientWidth,scroll:document.querySelector(".app-content").scrollWidth})')
        assert(bounds.body <= bounds.viewport + 1 && bounds.scroll <= bounds.client + 1)
        results.push({ width, dom, momBadges, normalBadges: badges.length - momBadges, horizontalScroll: { before: beforeScroll, after: afterScroll }, touchTapExactMatch: true, mouseAndKeyboardExactMatches: true, bounds })
      } catch (error) { console.error(`${width}px failed: ${error.message}`); throw error }
      finally { await page.close() }
    }
    assert.deepEqual(browser.exceptions, [])
    report = { method: 'Real isolated Chromium, unchanged 2-season fixture, selected season has 36 Matches. Functional checks, not performance timing.', results, runtimeErrors: browser.exceptions }
    fs.writeFileSync('docs/performance/v2.6.9-player-ui.json', JSON.stringify(report, null, 2) + '\n')
    console.log(JSON.stringify(report, null, 2))
  } finally {
    try {
      if (browser) await browser.close()
    } catch (error) {
      // Antivirus/Windows profile handles may outlive Chromium. Keep this
      // narrowly scoped to the existing verified-path cleanup subprocess and
      // record it explicitly; never swallow a failed functional check.
      if (!report || error.code !== 'ETIMEDOUT' || error.syscall !== 'spawnSync powershell.exe' || !error.spawnargs?.some(arg => arg.includes('Unsafe profile cleanup path'))) throw error
      report.cleanupWarning = 'Isolated Chromium exited; native PowerShell temporary-profile cleanup timed out and is deferred.'
      fs.writeFileSync('docs/performance/v2.6.9-player-ui.json', JSON.stringify(report, null, 2) + '\n')
      console.warn(report.cleanupWarning)
    } finally { if (server) await server.close() }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
