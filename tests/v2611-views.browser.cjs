require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { launchBrowser, delay } = require('./helpers/v267-browser.cjs')
const { instrumentationSeed } = require('./v268-profiler.browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { build, action, button, click, select, type, work } = require('./v2611-editor.browser.cjs')
const sides = (process.env.V2611_EDITOR_SIDES || 'before,after').split(',')
const repeats = Number(process.env.V2611_VIEW_SAMPLES || 3)
const output = process.env.V2611_VIEW_OUTPUT || path.join(work, 'views.json')

async function visit(browser, server, data, view, run, ready) {
  const page = await browser.page(instrumentationSeed({ state: data, view, screenState: defaultScreenState(view) }), 390)
  try {
    await page.command('Network.setBlockedURLs', { urls: ['https://*'] })
    await page.navigate(server.url)
    await page.waitFor(ready)
    return await run(page)
  } finally { await page.close() }
}

async function timing(page) {
  return page.evaluate(`(() => {
    const m = window.__v268Profile;
    return {
      firstScreen: window.__v267FirstScreen - window.__v267SeedEnd,
      observedAfterSeed: performance.now() - window.__v267SeedEnd,
      maxRender: Math.max(0, ...m.commits.map(c => c.actualDuration)),
      maxTask: Math.max(0, ...m.longTasks.filter(t => t.startedAt >= window.__v267SeedEnd).map(t => t.duration)),
      viewportElements: document.querySelectorAll('.app-content *').length,
      cards: document.querySelectorAll('.app-content article').length,
    };
  })()`)
}

async function key(page, name, code) {
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: name, code: name, windowsVirtualKeyCode: code, ...(name === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: name, code: name, windowsVirtualKeyCode: code })
  await action(page, 'void 0')
}

async function measure(browser, server, data) {
  const match = data.matches.findLast(match => match.competitionType === 'league')
  const changes = await visit(browser, server, data, { name: 'match', id: match.id }, async page => {
    const trigger = "[...document.querySelectorAll('summary')].find(el=>el.textContent.startsWith('What Changed'))"
    const initial = await action(page, click(trigger))
    await page.waitFor(`${trigger}.textContent.includes(' · ')`)
    const text = await page.evaluate(`${trigger}.closest('details').innerText`)
    await action(page, click(trigger))
    const reopen = await action(page, click(trigger))
    await page.waitFor(`${trigger}.textContent.includes(' · ')`)
    assert.equal(await page.evaluate(`${trigger}.closest('details').innerText`), text)
    return { initial, reopen, text }
  }, "document.body.innerText.includes('What Changed')")
  const ids = data.players.slice(0, 12).map(p => p.id)
  const comparison = await visit(browser, server, data, { name: 'comparison', season: 'Season 2', leftId: ids[7], rightId: ids[9] }, async page => {
    const change = []
    for (const p of data.players.slice(10, 14)) {
      const target = select(`[aria-label="Left player"] button[data-virtual-row="${p.id}"]`)
      await action(page, type('Left player search', p.name), `!!${target}`)
      change.push(await action(page, click(target), `${target}.className.includes('bg-emerald')`))
    }
    return { change, metrics: await page.evaluate("[...document.querySelectorAll('.app-content span[aria-label]')].map(el=>el.getAttribute('aria-label'))") }
  }, "!!document.querySelector('input[aria-label=\"Left player search\"]')")
  const chemistry = await visit(browser, server, data, { name: 'chemistry' }, async page => {
    const initial = await timing(page)
    const read = "document.querySelector('.app-content article p')?.innerText"
    const original = await page.evaluate(read)
    const summary = select('.app-content article details summary')
    await page.evaluate(`${summary}.focus()`)
    await key(page, 'Enter', 13)
    await page.waitFor(`${summary}.parentElement.open`, 3000)
    const lastMounted = await page.evaluate("Number(Array.from(document.querySelectorAll('[data-card-index]')).at(-1)?.dataset.cardIndex ?? 0)")
    if (lastMounted) {
      for (let index = 1; index <= lastMounted + 2; index++) {
        await key(page, 'Tab', 9)
        assert.equal(await page.evaluate("Number(document.activeElement.closest('[data-card-index]')?.dataset.cardIndex)"), index)
      }
      await action(page, "document.querySelector('.app-content').scrollTop = 0")
      await page.waitFor(`!!${summary} && ${summary}.parentElement.open`)
    }
    const sort = await action(page, click(button('On-pitch GF/90')))
    const first = await page.evaluate(read)
    await action(page, "document.querySelector('.app-content').scrollTop = 14000")
    await delay(100)
    await action(page, "document.querySelector('.app-content').scrollTop = 0")
    assert.equal(await page.evaluate(read), first)
    const sorted = await timing(page)
    return { initial, sort, sorted, first, original, keyboardCrossedWindow: Boolean(lastMounted) }
  }, "!!document.querySelector('.app-content article details')")
  const recap = await visit(browser, server, data, { name: 'season-recap', season: 'Season 2' }, timing, "!!document.querySelector('.app-content h1')")
  const home = await visit(browser, server, data, { name: 'home' }, async page => {
    const initial = await timing(page)
    await page.waitFor("!document.querySelector('[data-home-section][aria-label^=Loading]')")
    return { initial, completed: await timing(page) }
  }, "!!document.querySelector('[data-home-section=recent-matches]')")
  return { changes, comparison, chemistry, recap, home }
}

;(async () => {
  const servers = {}, collected = {}
  let browser
  try {
    for (const side of sides) {
      servers[side] = await build(side)
      collected[side] = []
    }
    browser = await launchBrowser()
    for (let i = 0; i < repeats; i++) for (const side of i % 2 ? sides.slice().reverse() : sides) {
      collected[side].push(await measure(browser, servers[side], performanceFixture(2)))
      console.log(`${side} derived screens ${i + 1}/${repeats}`)
    }
    if (collected.before && collected.after) for (let i = 0; i < repeats; i++) {
      assert.deepEqual(collected.before[i].changes.text, collected.after[i].changes.text)
      assert.deepEqual(collected.before[i].comparison.metrics, collected.after[i].comparison.metrics)
      assert.equal(collected.before[i].chemistry.first, collected.after[i].chemistry.first)
      assert.equal(collected.before[i].chemistry.original, collected.after[i].chemistry.original)
      assert.equal(collected.after[i].chemistry.keyboardCrossedWindow, true)
    }
    assert.deepEqual(browser.exceptions, [])
    fs.writeFileSync(output, JSON.stringify(collected, null, 2) + '\n')
  } finally {
    try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
