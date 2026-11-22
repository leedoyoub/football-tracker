require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { launchBrowser, serveBuild, seedApplication, ensureBaselineBuild } = require('./helpers/v267-browser.cjs')
const { cappedMomFixture, base, work } = require('./helpers/v2612-mom-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { validateState } = require('../src/lib/validation.ts')
const { state, capped, keeper, striker } = cappedMomFixture(2)
const original = state.matches[0]
const changed = { ...capped(original.id, original.season, original.matchDay), date: original.date, recordedAt: original.recordedAt }
state.matches[0] = changed
assert(validateState(state))
const output = process.env.V2612_UI_OUTPUT || path.join(work, 'mom-ui.json')
const stored = "JSON.parse(localStorage.getItem('football-tracker-v1'))"
const route = "JSON.parse(localStorage.getItem('football-tracker-last-route')).view"
const heading = label => `[...document.querySelectorAll('.app-content h1,.app-content h2')].some(el=>el.textContent.trim()===${JSON.stringify(label)})`
const button = label => `[...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(label)})`
const matchMom = "[...document.querySelectorAll('.app-content small')].find(el=>el.textContent==='Man of the Match')?.parentElement.querySelector('button')"
const playerName = id => state.players.find(player => player.id === id).name

async function seeded(browser, server, width, view, screenState, data = state) {
  const seed = `if(location.protocol==='http:'&&!sessionStorage.getItem('v2612-seeded')){sessionStorage.setItem('v2612-seeded','1');${seedApplication(data, view, screenState)}}`
  const page = await browser.page(seed, width)
  await page.command('Network.setBlockedURLs', { urls: ['https://*'] })
  await page.navigate(server.url)
  return page
}

async function verifyMatch(browser, server, width, winner) {
  const view = { name: 'match', id: changed.id }
  const page = await seeded(browser, server, width, view, defaultScreenState(view))
  try {
    const text = JSON.stringify(playerName(winner))
    const correctMom = `${matchMom}?.textContent===${text}`
    await page.waitFor(correctMom)
    const prior = await page.evaluate(`${stored}.matches.find(match=>match.id===${JSON.stringify(changed.id)})`)
    await page.reload()
    await page.waitFor(correctMom)
    assert.deepEqual(await page.evaluate(`${stored}.matches.find(match=>match.id===${JSON.stringify(changed.id)})`), prior)
    assert.deepEqual(prior.events, changed.events)
    await page.evaluate(`${matchMom}.click()`)
    await page.waitFor(`${route}.name==='player' && ${route}.id===${JSON.stringify(winner)}`)
  } finally { await page.close() }
}

async function verifyPlayer(browser, server, width, id, winner) {
  const view = { name: 'player', id, season: changed.season }
  const state = { ...defaultScreenState(view), season: changed.season, competition: 'league' }
  const page = await seeded(browser, server, width, view, state)
  try {
    await page.waitFor(heading('Recent Form'))
    const initialMs = await page.evaluate('performance.now() - window.__v267SeedEnd')
    await page.evaluate(`${button('Matches')}.click()`)
    await page.waitFor(heading('Matches'))
    const read = await page.evaluate(`[...document.querySelectorAll('.app-content article')].flatMap(article=>{
      const match = article.querySelector('button'), rating = article.querySelector('b');
      return match && rating?.textContent.startsWith('10.0') ? [{
        rating: rating.textContent, blue: rating.classList.contains('text-blue-300'),
        saves: article.querySelector('[aria-label="10 saves"]')?.textContent,
      }] : [];
    })`)
    assert.deepEqual(read, [{ rating: id === winner ? '10.0 ★' : '10.0', blue: id === winner, ...(id === keeper ? { saves: '🧤 10' } : {}) }])
    return initialMs
  } finally { await page.close() }
}

async function verifyLeaderboard(browser, server, width, winner, name) {
  const view = name === 'global-ranking' ? { name, season: changed.season } : { name, category: 'player', leaderboardId: 'mom' }
  const screenState = { ...defaultScreenState(view), ...(name === 'global-ranking' ? { metric: 'rating', scope: 'league' } : {}) }
  const page = await seeded(browser, server, width, view, screenState, { ...state, matches: [changed], competitionStates: [] })
  try {
    const first = "document.querySelector('.app-content [data-virtual-row]')"
    await page.waitFor(`!!${first}`)
    if (name === 'global-ranking') {
      await page.evaluate(`${button('MOM')}.click()`)
      await page.waitFor("JSON.parse(localStorage.getItem('football-tracker-last-route')).screenState.metric==='mom'")
    }
    await page.waitFor(`${first}?.dataset.virtualRow===${JSON.stringify(winner)}`)
    assert.equal(await page.evaluate(`Number(${first}.querySelector('b').textContent.replace('#',''))`), 1)
    assert.match(await page.evaluate(`${first}.querySelector('b:last-child').textContent`), /^1(?:\s|$)/)
  } finally { await page.close() }
}

;(async () => {
  const before = ensureBaselineBuild(path.join(work, 'before-dist'), base)
  const servers = { before: await serveBuild(before), after: await serveBuild('dist') }
  let browser
  try {
    browser = await launchBrowser()
    const results = []
    for (const width of [320, 390, 1280]) for (const side of ['before', 'after']) {
      const winner = side === 'before' ? keeper : striker
      await verifyMatch(browser, servers[side], width, winner)
      const overviewMs = {}
      for (const id of [keeper, striker]) overviewMs[id] = await verifyPlayer(browser, servers[side], width, id, winner)
      for (const name of ['global-ranking', 'records-leaderboard']) await verifyLeaderboard(browser, servers[side], width, winner, name)
      results.push({ side, width, winner, overviewMs })
      console.log(`${side} ${width}px verified Match Detail, both 10.0 ratings, MOM star, saves, reload and leaderboards`)
    }
    assert.deepEqual(browser.exceptions, [])
    fs.writeFileSync(output, JSON.stringify({ base, matchCount: state.matches.length, results, runtimeErrors: browser.exceptions }, null, 2) + '\n')
  } finally {
    try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
