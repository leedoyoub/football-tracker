require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { players, teams, cases } = require('./helpers/v2610-saves-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { playerAppearanceMatches } = require('../src/engine/playerDerived.ts')
const { validateState } = require('../src/lib/validation.ts')
// Persisted fixtures must satisfy the unchanged storage validator. Malformed
// event/role inputs are tested directly at the read-time boundary in the suite.
const fixture = performanceFixture(1), examples = cases().filter(c => ['zero', 'legacy-one', 'count-six', 'mixed-six', 'legacy-no-minute', 'changed-position', 'substitute', 'all-contributions'].includes(c.match.id)).map(c => ['changed-position', 'substitute'].includes(c.match.id) ? { ...c, match: { ...c.match, events: c.match.events.filter(e => e.id !== 'before' && e.id !== 'after') } } : c)
const matches = examples.map(c => c.match)
const view = { name: 'player', id: 'p' }, state = { ...defaultScreenState(view), season: 'S1', tab: 'matches' }
const output = process.env.V2610_SAVES_OUTPUT || '.superpowers/sdd/v2610/player-saves-ui.json'
const badgeSelector = 'span[aria-label$=" saves"]'
;(async () => {
  const server = await serveBuild('dist'), browser = await launchBrowser(), results = []
  try {
    for (const width of [320, 375, 390, 1280]) for (const savedPlayer of [false, true]) {
      const data = { ...fixture, players: savedPlayer ? players.slice(1) : players, teams: teams.map((t, i) => ({ ...fixture.teams[i], ...t })), matches, competitionStates: [] }
      assert(validateState(JSON.parse(JSON.stringify(data))), 'browser seed must pass normal storage validation')
      const ordered = savedPlayer ? matches : playerAppearanceMatches(players[0], matches)
      const expected = ordered.flatMap(m => { const want = examples.find(c => c.match.id === m.id).want; return want ? [`🧤 ${want}`] : [] })
      const seed = `if(location.protocol==='http:'&&!sessionStorage.getItem('saves-seeded')){sessionStorage.setItem('saves-seeded','1');${seedApplication(data, view, state)}}`
      const page = await browser.page(seed, width)
      try {
        await page.navigate(server.url)
        await page.waitFor(`document.querySelectorAll('${badgeSelector}').length===${expected.length}`)
        const badges = await page.evaluate(`Array.from(document.querySelectorAll('${badgeSelector}'),el=>({text:el.textContent,nowrap:getComputedStyle(el).whiteSpace,inside:el.getBoundingClientRect().right<=el.closest('article,button').getBoundingClientRect().right+1}))`)
        assert.deepEqual(badges.map(b => b.text), expected)
        assert(badges.every(b => b.nowrap === 'nowrap' && b.inside))
        const bounds = await page.evaluate('({width:innerWidth,body:document.documentElement.scrollWidth,client:document.querySelector(".app-content").clientWidth,scroll:document.querySelector(".app-content").scrollWidth})')
        assert(bounds.body <= bounds.width + 1 && bounds.scroll <= bounds.client + 1)
        if (!savedPlayer) {
          const index = ordered.findIndex(m => m.id === 'all-contributions')
          const contribution = await page.evaluate(`(()=>{const article=document.querySelectorAll('.app-content article')[${index}];return {icons:article.querySelector('.mt-1.flex').textContent,rating:article.querySelector('b').textContent,tone:article.querySelector('b').className}})()`)
          assert.equal(contribution.icons, '⚽👟🧤 2'); assert(contribution.rating.endsWith(' ★')); assert.equal(contribution.tone, 'text-blue-300')
        }
        const first = savedPlayer ? '.app-content section .space-y-2 > button' : '.app-content article > button'
        await page.evaluate(`document.querySelector(${JSON.stringify(first)}).click()`)
        await page.waitFor('JSON.parse(localStorage.getItem("football-tracker-last-route")).view.name==="match"')
        assert.equal(await page.evaluate('JSON.parse(localStorage.getItem("football-tracker-last-route")).view.id'), ordered[0].id)
        await page.evaluate('document.querySelector(".detail-back button").click()')
        await page.waitFor(`document.querySelectorAll('${badgeSelector}').length===${expected.length}`)
        if (width === 320 && !savedPlayer) { fs.mkdirSync('.superpowers/sdd/v2610', { recursive: true }); await page.screenshot('.superpowers/sdd/v2610/player-saves-320.png') }
        // Persist an immutable edit in this synthetic device, then verify a
        // genuine reload reads the new count rather than stale derived data.
        await page.evaluate('(() => { const data = JSON.parse(localStorage.getItem("football-tracker-v1")); data.matches = data.matches.map(match => match.id === "count-six" ? { ...match, events: match.events.map(event => ({ ...event, count: 9 })) } : match); localStorage.setItem("football-tracker-v1", JSON.stringify(data)) })()')
        await page.reload()
        const edited = ordered.flatMap(m => { const want = m.id === 'count-six' ? 9 : examples.find(c => c.match.id === m.id).want; return want ? [`🧤 ${want}`] : [] })
        await page.waitFor(`JSON.stringify(Array.from(document.querySelectorAll('${badgeSelector}'),el=>el.textContent))===${JSON.stringify(JSON.stringify(edited))}`)
        results.push({ width, savedPlayer, badges: expected, bounds, navigation: true, editedCountAfterReload: 9, momAndContributions: !savedPlayer })
        console.log(`${width}px saved-player=${savedPlayer} passed`)
      } finally { await page.close() }
    }
    assert.deepEqual(browser.exceptions, [])
    fs.mkdirSync(require('node:path').dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify({ method: 'Isolated production Chromium; hand-checked save fixtures, 320/375/390/1280px, registered and absent-player paths. No real user data or physical device.', results, runtimeErrors: browser.exceptions }, null, 2)+'\n')
  } catch (error) { console.error(JSON.stringify(browser.exceptions)); throw error }
  finally { try { await browser.close() } finally { await server.close() } }
})().catch(error => { console.error(error); process.exitCode = 1 })
