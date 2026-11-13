require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication, delay } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const output = process.argv[2] || 'docs/performance/v2.6.8-swipe-ui.json'
const fixture = performanceFixture(2), results = []
const frames = page => page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
const title = page => page.evaluate('document.querySelector(".app-content h1")?.textContent')
const button = async (page, name) => {
  await page.evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().toLowerCase()===${JSON.stringify(name.toLowerCase())});if(!b)throw Error('Missing button '+${JSON.stringify(name)});b.click()})()`)
  await frames(page)
}
async function swipe(page, { x = 10, y = 380, dx = 120, dy = 4, cancel = false, mouse = false } = {}) {
  if (mouse) {
    await page.command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
    await page.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x + dx, y: y + dy, button: 'left', buttons: 1 })
    await page.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x + dx, y: y + dy, button: 'left', clickCount: 1 })
  } else {
    await page.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await page.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    for (const step of [.25, .5, .75, 1]) await page.command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + dx * step, y: y + dy * step, id: 1 }] })
    await page.command('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] })
  }
  await frames(page)
}
const instrumentation = `window.__edgeListeners={};
for(const method of ['addEventListener','removeEventListener']){const original=EventTarget.prototype[method];EventTarget.prototype[method]=function(type,fn,options){if(this instanceof Element&&this.classList.contains('app-content')&&['touchmove','touchend'].includes(type)){const set=window.__edgeListeners[type]||=new Set();if(method==='addEventListener'&&options?.passive===false)set.add(fn);else if(method==='removeEventListener')set.delete(fn)}return original.call(this,type,fn,options)}}`
const listeners = page => page.evaluate('Object.fromEntries(Object.entries(window.__edgeListeners).map(([k,v])=>[k,v.size]))')
;(async () => {
  const server = await serveBuild('dist')
  let browser
  try {
    browser = await launchBrowser()
    console.log('Isolated Chromium connected')
    async function open(view, width, screenState = defaultScreenState(view), extra = '') {
      const seed = `if(location.protocol==='http:'&&!sessionStorage.getItem('v268-seeded')){sessionStorage.setItem('v268-seeded','true');${seedApplication(fixture, view, screenState)}}`
      const page = await browser.page(seed + '\n' + instrumentation + '\n' + extra, width)
      await page.navigate(server.url)
      await page.waitFor('!!document.querySelector(".app-content h1")')
      await frames(page)
      return page
    }
    for (const width of process.env.V268_WIDTH ? [Number(process.env.V268_WIDTH)] : [320, 375, 390]) {
      const routes = [
        { name: 'player', id: fixture.players[9].id, season: 'Season 2' },
        { name: 'match', id: fixture.matches[0].id }, { name: 'team', id: fixture.teams[0].id },
        { name: 'global-ranking', season: 'Season 2' }, { name: 'award-race' },
        { name: 'records-leaderboard', category: 'player', leaderboardId: 'goals' },
        { name: 'results' }, { name: 'latest-changes', season: 'Season 2' },
        { name: 'season-recap', season: 'Season 2' }, { name: 'season-highlight', season: 'Season 2', kind: 'news' }, { name: 'chemistry' },
      ]
      for (const view of routes) {
        if (process.env.V268_ROUTE && process.env.V268_ROUTE !== view.name) continue
        console.log(`${width}px ${view.name}`)
        const page = await open(view, width)
        const before = await title(page)
        if (process.env.V268_ROUTE) await page.evaluate(`window.__touchLog=[];for(const name of ['touchstart','touchmove','touchend','touchcancel'])document.addEventListener(name,e=>window.__touchLog.push({name,cancelable:e.cancelable,prevented:e.defaultPrevented,points:[...e.touches].map(t=>({x:t.clientX,y:t.clientY,id:t.identifier})),target:e.target.className,overlays:[...document.querySelectorAll('[aria-expanded=true],[role=dialog]')].map(e=>e.outerHTML.slice(0,100))}))`)
        const counts = await listeners(page)
        // VirtualCardList also owns passive touch listeners; count only the
        // non-passive move/end pair installed by edge Back.
        assert(Object.values(counts).every(n => n === 1) && counts.touchend === 1, JSON.stringify(counts))
        await swipe(page)
        if (process.env.V268_ROUTE) console.log(await page.evaluate('window.__touchLog'))
        if (await title(page) === before) console.log(await page.evaluate(`(()=>{let e=document.elementFromPoint(10,380),rows=[];while(e){rows.push({tag:e.tagName,label:e.getAttribute('aria-label'),class:e.className,overflowX:getComputedStyle(e).overflowX});e=e.parentElement}return rows})()`))
        await page.waitFor(`document.querySelector('.app-content h1')?.textContent!==${JSON.stringify(before)}`)
        assert(Object.values(await listeners(page)).every(n => n === 0), 'Listeners must be removed after returning to a root screen')
        const bounds = await page.evaluate('({client:document.querySelector(".app-content").clientWidth,scroll:document.querySelector(".app-content").scrollWidth,body:document.documentElement.scrollWidth,viewport:innerWidth})')
        assert(bounds.scroll <= bounds.client + 1 && bounds.body <= bounds.viewport + 1)
        results.push({ area: 'route-back', width, route: view.name, before, after: await title(page), listenersCleaned: true, bounds })
        await page.close()
      }
      console.log(`${width}px team History disclosures`)
      const historyView = { name: 'team', id: fixture.teams[0].id }
      const historyPage = await open(historyView, width, { ...defaultScreenState(historyView), tab: 'history' })
      assert(await historyPage.evaluate('!!document.querySelector("button[aria-expanded=true]:not([aria-haspopup])")'))
      const historyTitle = await title(historyPage)
      await swipe(historyPage)
      await historyPage.waitFor(`document.querySelector('.app-content h1')?.textContent!==${JSON.stringify(historyTitle)}`)
      results.push({ area: 'team-history-disclosures-allow-back', width }); await historyPage.close()
      console.log(`${width}px player restoration`)
      const player = { name: 'player', id: fixture.players[9].id, season: 'Season 2' }
      const state = { ...defaultScreenState(player), season: 'Season 2', tab: 'matches', competition: 'league' }
      const page = await open(player, width, state)
      const same = await title(page)
      for (const input of [{ dx: 35 }, { x: 60 }, { dx: 8, dy: -80 }, { cancel: true }, { mouse: true }]) {
        await swipe(page, input); assert.equal(await title(page), same, JSON.stringify(input))
      }
      await page.evaluate('document.querySelector(".app-content").scrollTop=300')
      await frames(page)
      const top = await page.evaluate('document.querySelector(".app-content").scrollTop')
      await page.evaluate('document.querySelector(".app-content article button").click()')
      await page.waitFor('!![...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="EDIT MATCH")')
      await swipe(page)
      await page.waitFor(`document.querySelector('[aria-label="Player detail section"] [aria-selected=true]')?.textContent==='Matches'`)
      await page.waitFor(`Math.abs(document.querySelector('.app-content').scrollTop-${top})<2`)
      assert.equal(await page.evaluate(`document.querySelector('[aria-label="Player detail competition"] [aria-pressed=true]')?.textContent`), 'League')
      await page.reload()
      await page.waitFor(`document.querySelector('[aria-label="Player detail section"] [aria-selected=true]')?.textContent==='Matches'`)
      assert.equal(await page.evaluate(`document.querySelector('[aria-label="Player detail competition"] [aria-pressed=true]')?.textContent`), 'League')
      await page.waitFor(`Math.abs(document.querySelector('.app-content').scrollTop-${top})<2`)
      await page.screenshot(`.superpowers/sdd/v268/player-matches-${width}.png`)
      results.push({ area: 'player-scroll-tab-filter-refresh', width, restoredTop: top, ignoredInputs: 5 })
      await page.close()

      const matchPage = await open({ name: 'match', id: fixture.matches[0].id }, width)
      const matchTitle = await title(matchPage)
      await button(matchPage, 'Delete Match')
      await matchPage.waitFor('!!document.querySelector("[role=dialog]")')
      await swipe(matchPage); assert.equal(await title(matchPage), matchTitle)
      assert(await matchPage.evaluate('!!document.querySelector("[role=dialog]")'))
      results.push({ area: 'modal-blocks-back', width })
      await matchPage.close()

      const ranking = await open({ name: 'global-ranking', season: 'Season 2' }, width)
      const rankTitle = await title(ranking)
      await ranking.evaluate('document.querySelector("button[aria-haspopup=menu]").click()')
      await frames(ranking); await swipe(ranking); assert.equal(await title(ranking), rankTitle)
      await ranking.evaluate('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))'); await frames(ranking)
      await button(ranking, 'Goals')
      await ranking.evaluate(`(()=>{const node=document.querySelector('[aria-label="Swipe ranking metrics"]');const t=(x)=>new Touch({identifier:1,target:node,clientX:x,clientY:300});node.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[t(20)]}));node.dispatchEvent(new TouchEvent('touchend',{bubbles:true,changedTouches:[t(130)],touches:[]}))})()`)
      await frames(ranking); assert.equal(await title(ranking), rankTitle)
      assert.equal(await ranking.evaluate(`document.querySelector('[aria-label="Global ranking metric"] [aria-pressed=true]')?.textContent`), 'Rating')
      results.push({ area: 'filter-and-metric-swipe-conflicts', width })
      await button(ranking, 'Goals')
      await ranking.evaluate(`(()=>{const root=document.querySelector('.app-content > div'),p=new Touch({identifier:1,target:root,clientX:10,clientY:380});root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[p]}))})()`)
      await ranking.evaluate(`document.querySelector('button[aria-label$=" player details"]').click()`)
      await ranking.waitFor(`!!document.querySelector('[aria-label="Player detail section"]')`)
      const replacedTitle = await title(ranking)
      await ranking.evaluate(`(()=>{const root=document.querySelector('.app-content > div'),p=new Touch({identifier:1,target:root,clientX:130,clientY:382});root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[p],cancelable:true}))})()`)
      await frames(ranking); assert.equal(await title(ranking), replacedTitle)
      assert.equal((await listeners(ranking)).touchend, 1)
      results.push({ area: 'active-touch-route-change-cancels', width })
      await swipe(ranking)
      await ranking.waitFor(`!!document.querySelector('[aria-label="Global ranking metric"]')`)
      assert.equal(await ranking.evaluate(`document.querySelector('[aria-label="Global ranking metric"] [aria-pressed=true]')?.textContent`), 'Goals')
      results.push({ area: 'ranking-metric-restored-after-player-back', width })
      await ranking.close()

      const recordsView = { name: 'records-leaderboard', category: 'player', leaderboardId: 'goals', competition: 'league', positionFilter: 'st-ss', seasonIds: ['Season 2'], teamIds: [fixture.teams[0].id] }
      const records = await open(recordsView, width)
      const savedScope = await records.evaluate(`JSON.parse(localStorage.getItem('football-tracker-last-route')).screenState`)
      await records.evaluate(`document.querySelector('button[aria-label$=" player details"]').click()`)
      await records.waitFor(`!!document.querySelector('[aria-label="Player detail section"]')`)
      await swipe(records)
      await records.waitFor(`!!document.querySelector('[aria-label="Records leaderboard seasons: Season 2"]')`)
      assert.deepEqual(await records.evaluate(`JSON.parse(localStorage.getItem('football-tracker-last-route')).screenState`), savedScope)
      results.push({ area: 'records-scope-restored-after-player-back', width }); await records.close()

      const interruptions = await open({ name: 'results' }, width)
      const interruptionTitle = await title(interruptions)
      await interruptions.evaluate(`(()=>{const root=document.querySelector('.app-content > div'),nav=document.querySelector('.app-bottom-nav');const p=new Touch({identifier:1,target:root,clientX:10,clientY:380}),q=new Touch({identifier:2,target:nav,clientX:30,clientY:830});root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[p]}));nav.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[p,q]}));nav.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[p],changedTouches:[q]}));const end=new Touch({identifier:1,target:root,clientX:130,clientY:382});root.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,touches:[end],cancelable:true}));root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end],cancelable:true}))})()`)
      await frames(interruptions); assert.equal(await title(interruptions), interruptionTitle)
      results.push({ area: 'second-finger-outside-content-cancels', width })
      await interruptions.evaluate(`(async()=>{const root=document.querySelector('.app-content > div'),p=new Touch({identifier:1,target:root,clientX:10,clientY:380});root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[p]}));const modal=document.createElement('div');modal.setAttribute('role','dialog');modal.style.cssText='position:fixed;inset:0';document.body.append(modal);await Promise.resolve();modal.remove();await Promise.resolve();const end=new Touch({identifier:1,target:root,clientX:130,clientY:382});root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end],cancelable:true}))})()`)
      await frames(interruptions); assert.equal(await title(interruptions), interruptionTitle)
      results.push({ area: 'popup-opening-and-closing-cancels', width })
      for (const eventName of ['blur', 'pagehide']) {
        await interruptions.evaluate(`(()=>{const root=document.querySelector('.app-content > div'),p=new Touch({identifier:1,target:root,clientX:10,clientY:380});root.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[p]}));window.dispatchEvent(new Event(${JSON.stringify(eventName)}));const end=new Touch({identifier:1,target:root,clientX:130,clientY:382});root.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[end],cancelable:true}))})()`)
        await frames(interruptions); assert.equal(await title(interruptions), interruptionTitle)
        results.push({ area: `active-touch-${eventName}-cancels`, width })
      }
      await interruptions.close()

      const editor = await open({ name: 'edit-match', id: fixture.matches[0].id }, width)
      assert(Object.values(await listeners(editor)).every(n => n === 0))
      const editorTitle = await title(editor); await swipe(editor); assert.equal(await title(editor), editorTitle)
      results.push({ area: 'editor-excluded', width })
      await editor.close()
    }
    // This is an adapter check in Chromium, not a Safari device claim.
    const native = await open({ name: 'match', id: fixture.matches[0].id }, 390, undefined, `Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone) AppleWebKit Safari'});Object.defineProperty(navigator,'platform',{get:()=> 'iPhone'});`)
    assert(Object.values(await listeners(native)).every(n => n === 0))
    const nativeTitle = await title(native); await swipe(native); assert.equal(await title(native), nativeTitle)
    results.push({ area: 'ios-browser-native-adapter', physicalSafari: false }); await native.close()
    const standalone = await open({ name: 'match', id: fixture.matches[0].id }, 390, undefined, `Object.defineProperty(navigator,'userAgent',{get:()=> 'Mozilla/5.0 (iPhone) AppleWebKit Safari'});Object.defineProperty(navigator,'standalone',{get:()=>true});`)
    assert.equal((await listeners(standalone)).touchend, 1)
    const standaloneTitle = await title(standalone); await swipe(standalone)
    await standalone.waitFor(`document.querySelector('.app-content h1')?.textContent!==${JSON.stringify(standaloneTitle)}`)
    results.push({ area: 'ios-standalone-custom-adapter', physicalPWA: false }); await standalone.close()
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
    fs.writeFileSync(output, JSON.stringify({ method: 'Isolated real production Chromium, CDP touch/mouse sequences at 320/375/390px, synthetic data. No physical iOS/Safari/Android device validation.', cases: results.length, errors: browser.exceptions, results }, null, 2) + '\n')
    console.log(JSON.stringify({ output, cases: results.length, errors: browser.exceptions.length }))
  } catch (error) { console.error('UI case failed:', error.message); throw error }
  finally { try { if (browser) await browser.close() } finally { await server.close() } }
})().catch(error => { console.error(error); process.exitCode = 1 })
