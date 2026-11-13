require('./helpers/register-ts.cjs')
const fs = require('node:fs'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { positionFilterFamilies } = require('../src/engine/positionScope.ts')
const fixture = performanceFixture(2), results = []
const frames = page => page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
const screen = page => page.evaluate('JSON.parse(localStorage.getItem("football-tracker-last-route")).screenState')
const triggerSelector = label => `button[aria-haspopup="menu"][aria-label^="${label}:"]`
async function open(page, label) {
  await page.evaluate(`document.querySelector(${JSON.stringify(triggerSelector(label))}).click()`)
  await frames(page)
}
async function option(page, label, text) {
  await page.evaluate(`(()=>{const menu=document.querySelector(${JSON.stringify(`[role="menu"][aria-label="${label} filter"]`)});const option=[...menu.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!option)throw Error('missing '+${JSON.stringify(text)});option.click()})()`)
  await frames(page)
}
async function escape(page) {
  await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await frames(page)
}
async function checkBounds(page) {
  const bounds = await page.evaluate('({viewport:innerWidth,body:document.documentElement.scrollWidth,client:document.querySelector(".app-content").clientWidth,scroll:document.querySelector(".app-content").scrollWidth})')
  assert(bounds.body <= bounds.viewport + 1 && bounds.scroll <= bounds.client + 1, JSON.stringify(bounds))
  const popup = await page.evaluate('(()=>{const r=document.querySelector("[role=menu]")?.getBoundingClientRect();return r?{left:r.left,right:r.right}:null})()')
  if (popup) assert(popup.left >= -1 && popup.right <= bounds.viewport + 1, JSON.stringify(popup))
}
;(async () => {
  const server = await serveBuild('dist'); let browser
  try {
    browser = await launchBrowser()
    for (const width of [320, 375, 390, 1280]) for (const kind of ['global-ranking', 'award-race', 'records', 'records-leaderboard']) {
      console.log(`${width}px ${kind}`)
      const view = kind === 'records-leaderboard' ? { name: kind, category: 'player', leaderboardId: 'goals' } : { name: kind, season: 'Season 2' }
      const state = { ...defaultScreenState(view), ...(kind === 'global-ranking' ? { metric: 'goals', scope: 'league' } : {}), ...(kind === 'award-race' ? { scope: 'league' } : {}) }
      const seed = `if(location.protocol==='http:'&&!sessionStorage.getItem('v269-seeded')){sessionStorage.setItem('v269-seeded','true');${seedApplication(fixture, view, state)}}`
      const page = await browser.page(seed, width)
      try {
        await page.navigate(server.url); await page.waitFor('!!document.querySelector(".app-content h1")'); await frames(page)
        const positionLabel = kind === 'global-ranking' ? 'Global Ranking position' : kind === 'award-race' ? 'Award Race position' : kind === 'records' ? 'Player Records position' : 'Records leaderboard position'
        const teamLabel = kind === 'global-ranking' ? 'Global Ranking team' : kind === 'award-race' ? 'Award Race team' : kind === 'records' ? 'Records team' : 'Records leaderboard team'
        await open(page, positionLabel)
        assert.equal(await page.evaluate('document.activeElement.getAttribute("role")'), 'menuitemcheckbox')
        await option(page, positionLabel, 'ST/SS'); await option(page, positionLabel, 'LW/RW')
        assert.deepEqual((await screen(page)).positionFilters, ['st-ss', 'lw-rw'])
        assert.equal(await page.evaluate(`document.querySelector(${JSON.stringify(triggerSelector(positionLabel))}).textContent.trim()`), 'Position (2) ⌄')
        await checkBounds(page); await escape(page)
        assert.equal(await page.evaluate(`document.activeElement===document.querySelector(${JSON.stringify(triggerSelector(positionLabel))})`), true)
        await open(page, teamLabel)
        for (const team of fixture.teams.slice(0, 2)) await option(page, teamLabel, team.shortName)
        let selected = await screen(page)
        assert.deepEqual(selected.teamIds ?? selected.filterTeamIds, fixture.teams.slice(0, 2).map(t => t.id))
        await checkBounds(page); await escape(page)
        if (kind === 'global-ranking' || kind === 'records-leaderboard') {
          const expected = kind === 'global-ranking'
            ? rankGlobalRankingRows(buildGlobalRankingData(fixture.players, fixture.matches.filter(m => m.season === 'Season 2' && m.competitionType === 'league'), { seasons: [], teams: [], positions: positionFilterFamilies(['st-ss', 'lw-rw']) }, 'rating'), fixture.players, 'goals').map((row, i) => ({ id: row.playerId, rank: i+1, value: String(row.value) }))
            : recordsLeaderboardGroups({ ...fixture, category: 'player', scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all', positionFilters: ['st-ss', 'lw-rw'] }, selectedIds: ['goals'] })[0].rows.map(row => ({ id: row.id, rank: row.rank, value: row.value }))
          const actual = await page.evaluate(`([...document.querySelectorAll('[data-virtual-row]')].map(el=>({id:el.dataset.virtualRow,rank:Number(el.querySelector('b').textContent.replace('#','')),value:el.querySelector('b:last-child').textContent})))`)
          assert(actual.length > 0)
          for (const row of actual) assert.deepEqual(row, expected.find(item => item.id === row.id))
          if (kind === 'records-leaderboard') {
            const overlaps = await page.evaluate(`([...document.querySelectorAll('[data-virtual-row] button[aria-label$=" player details"]')].filter(button=>button.getBoundingClientRect().right>button.parentElement.getBoundingClientRect().right+1).map(button=>button.textContent))`)
            assert.deepEqual(overlaps, [], 'record identity must truncate inside its column')
          }
        }
        const playerButton = await page.evaluate(`!!document.querySelector('button[aria-label$=" player details"]')`)
        if (playerButton) {
          const original = await screen(page)
          await page.evaluate(`document.querySelector('button[aria-label$=" player details"]').click()`)
          await page.waitFor(`!!document.querySelector('[aria-label="Player detail section"]')`)
          await page.evaluate('document.querySelector(".detail-back button").click()')
          await page.waitFor(`!!document.querySelector(${JSON.stringify(triggerSelector(positionLabel))})`); await frames(page)
          assert.deepEqual(await screen(page), original)
        }
        // No fixture or route reseeding: exercise the actual persisted device state.
        await page.reload(); await page.waitFor('!!document.querySelector(".app-content h1")'); await frames(page)
        assert.deepEqual((await screen(page)).positionFilters, ['st-ss', 'lw-rw'])
        assert.deepEqual((await screen(page)).teamIds ?? (await screen(page)).filterTeamIds, fixture.teams.slice(0, 2).map(t => t.id))
        await open(page, positionLabel); await option(page, positionLabel, 'All'); await escape(page)
        assert.deepEqual((await screen(page)).positionFilters, [])
        await open(page, teamLabel); await option(page, teamLabel, 'All teams'); await escape(page)
        assert.deepEqual((await screen(page)).teamIds ?? (await screen(page)).filterTeamIds, [])
        if (width === 320 && kind === 'records-leaderboard') {
          await open(page, positionLabel); await option(page, positionLabel, 'ST/SS'); await option(page, positionLabel, 'LW/RW')
          await page.screenshot('.superpowers/sdd/v269/ranking-320.png'); await escape(page)
        }
        results.push({ width, kind, multiSelect: true, keyboardFocus: true, reset: true, reload: true, playerBack: playerButton, bounds: true })
      } finally { await page.close() }
    }
    assert.deepEqual(browser.exceptions, [])
    const report = { method: 'Production isolated Chromium, unchanged 2-season fixture, functional UI checks at 320/375/390/1280px; not a timing benchmark.', results, runtimeErrors: browser.exceptions }
    fs.writeFileSync('docs/performance/v2.6.9-ranking-ui.json', JSON.stringify(report, null, 2)+'\n')
  } finally { try { if (browser) await browser.close() } finally { await server.close() } }
})().catch(error => { console.error(error); process.exitCode = 1 })
