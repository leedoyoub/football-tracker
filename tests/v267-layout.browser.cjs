require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication, delay, ensureBaselineBuild } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { cupCompetition } = require('../src/engine/competition.ts')
const output = process.argv[2] || 'docs/performance/v2.6.7-ui.json'
const root = path.resolve(__dirname, '..'), fixture = performanceFixture(2), results = []
const metrics = [['P', 'played', 'desc'], ['W', 'wins', 'desc'], ['D', 'draws', 'desc'], ['L', 'losses', 'asc'], ['GF', 'goalsFor', 'desc'], ['GA', 'goalsAgainst', 'asc'], ['GD', 'goalDifference', 'desc'], ['Pts', 'points', 'desc']]
const selectedPlayerTab = '[aria-label="Player detail section"] [aria-selected=true]'
const playerCompetitionButtons = '[aria-label="Player detail competition"] button'
const selectedPlayerCompetition = '[aria-label="Player detail competition"] [aria-pressed=true]'
const click = (page, selector) => page.evaluate(`(()=>{const start=performance.now();document.querySelector(${JSON.stringify(selector)}).click();return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(performance.now()-start))))})()`)
async function namedButton(page, text) {
  await page.evaluate(`([...document.querySelectorAll('button')].find(el=>el.textContent.trim()===${JSON.stringify(text)}) || (()=>{throw Error('Missing button '+${JSON.stringify(text)})})()).click(); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`)
}
async function setField(page, label, value, tag = 'input') {
  await page.evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(`${tag}[aria-label="${label}"]`)}); Object.getOwnPropertyDescriptor(${tag === 'select' ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype,'value').set.call(el,${JSON.stringify(value)}); el.dispatchEvent(new Event(${JSON.stringify(tag === 'select' ? 'change' : 'input')},{bubbles:true}));})()`)
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
}
function cupGame(id, teamId, stage, gf, ga) {
  const opponent = `external:${teamId}`
  return { id, season: 'Season 1', competitionType: 'cup', competitionStage: stage, matchDay: stage === 'final' ? 8 : stage === 'finalReplay' ? 9 : Number(stage.replace('stage', '')), teamId, homeTeamId: teamId, awayTeamId: opponent, date: '2026-10-01', duration: 90, appearances: [], events: [...Array.from({ length: gf }, (_, i) => ({ id: `${id}:f:${i}`, type: 'goal', minute: i + 1, teamId })), ...Array.from({ length: ga }, (_, i) => ({ id: `${id}:a:${i}`, type: 'goal', minute: i + 30, teamId: opponent }))] }
}
function cupState(mode) {
  const state = { ...fixture, matches: [] }
  if (mode === 'partial') { state.matches = fixture.teams.slice(0, 4).map((team, i) => cupGame(`partial:${team.id}`, team.id, 'stage1', i + 1, i)); return state }
  const stages = mode === 'complete' || mode === 'draw' ? 1 : 7
  for (let n = 1; n <= stages; n++) {
    const active = cupCompetition(state.teams, state.matches, 'Season 1', state.players).activeTeamIds
    active.forEach((id, i) => state.matches.push(cupGame(`s${n}:${id}`, id, `stage${n}`, mode === 'draw' ? 0 : active.length - i, mode === 'draw' ? 0 : i)))
  }
  if (mode === 'replay' || mode === 'champion') {
    let active = cupCompetition(state.teams, state.matches, 'Season 1', state.players).activeTeamIds
    active.forEach(id => state.matches.push(cupGame(`final:${id}`, id, 'final', 1, 1)))
    if (mode === 'champion') { active = cupCompetition(state.teams, state.matches, 'Season 1', state.players).activeTeamIds; active.forEach((id, i) => state.matches.push(cupGame(`replay:${id}`, id, 'finalReplay', 2 - i, i))) }
  }
  return state
}
const geometry = `(()=>{const table=document.querySelector('.app-content table'),r=table.getBoundingClientRect();return {width:r.width,height:r.height,columns:[...table.querySelectorAll('thead th')].map(el=>el.getBoundingClientRect().width),font:getComputedStyle(table).fontSize,rowHeight:table.querySelector('tbody tr').getBoundingClientRect().height}})()`
const leagueRows = `([...document.querySelectorAll('.app-content table tbody tr[data-team-id]')].map(row=>{const cells=[...row.querySelectorAll('td')],goals=cells[6].textContent.split('-').map(Number);return {teamId:row.dataset.teamId,rank:Number(cells[0].dataset.officialRank),played:Number(cells[2].textContent),wins:Number(cells[3].textContent),draws:Number(cells[4].textContent),losses:Number(cells[5].textContent),goalsFor:goals[0],goalsAgainst:goals[1],goalDifference:Number(cells[7].textContent),points:Number(cells[8].textContent)}}))`
const cupRows = `([...document.querySelectorAll('.app-content table tbody tr[data-team-id]')].map(row=>{const cells=[...row.querySelectorAll('td')],wdl=cells[3].textContent.split('-').map(Number),goals=cells[4].textContent.split('-').map(Number);return {teamId:row.dataset.teamId,rank:Number(cells[0].dataset.officialRank),played:Number(cells[2].textContent),wins:wdl[0],draws:wdl[1],losses:wdl[2],goalsFor:goals[0],goalsAgainst:goals[1],goalDifference:Number(cells[5].textContent),points:Number(cells[6].textContent)}}))`
async function bounds(page) {
  return page.evaluate(`(()=>{const owner=document.querySelector('.app-content');return {client:owner.clientWidth,scroll:owner.scrollWidth,body:document.documentElement.scrollWidth,viewport:innerWidth}})()`)
}
;(async () => {
  const servers = { before: await serveBuild(ensureBaselineBuild()), after: await serveBuild('dist') }
  let browser
  try {
    browser = await launchBrowser()
    for (const width of [320, 375, 390, 1280]) {
      const view = { name: 'competition', competitionType: 'league', season: 'Season 2' }, state = { ...defaultScreenState(view), leagueMenu: 'table' }
      const before = await browser.page(seedApplication(fixture, view, state), width)
      await before.navigate(servers.before.url); await before.waitFor('!!document.querySelector(".app-content table")')
      const originalGeometry = await before.evaluate(geometry); await before.close()
      const page = await browser.page(seedApplication(fixture, view, state), width)
      await page.navigate(servers.after.url); await page.waitFor(`!!document.querySelector(${JSON.stringify('button[aria-label="Sort by GF"]')})`)
      const currentGeometry = await page.evaluate(geometry)
      assert.deepEqual(currentGeometry, originalGeometry, `League geometry changed at ${width}px`)
      const official = await page.evaluate(leagueRows)
      const sortFrameMs = []
      for (const [label, metric, direction] of metrics) {
        for (const selected of [direction, direction === 'desc' ? 'asc' : 'desc']) {
          sortFrameMs.push(await click(page, `button[aria-label="Sort by ${label}"]`))
          const rows = await page.evaluate(leagueRows)
          const expected = official.slice().sort((a, b) => (selected === 'asc' ? a[metric] - b[metric] : b[metric] - a[metric]) || a.rank - b.rank)
          assert.deepEqual(rows, expected, `${width}px ${label} ${selected}`)
        }
      }
      const resetFrameMs = await click(page, 'button[aria-label="Restore official ranking"]'); assert.deepEqual(await page.evaluate(leagueRows), official)
      await namedButton(page, 'Form'); await page.waitFor('!!document.querySelector(".app-content table")')
      assert.equal(await page.evaluate('document.querySelectorAll("th[aria-sort=ascending],th[aria-sort=descending]").length'), 0)
      await page.evaluate(`document.querySelector(${JSON.stringify('button[aria-label="Sort by GA"]')}).focus()`)
      assert.equal(await page.evaluate('document.activeElement.getAttribute("aria-label")'), 'Sort by GA')
      await page.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
      await page.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
      await delay(30)
      assert.equal(await page.evaluate('document.querySelector("th[aria-sort=ascending]")?.textContent'), 'GF-GA')
      const size = await bounds(page); assert(size.scroll <= size.client + 1 && size.body <= size.viewport + 1)
      results.push({ area: 'league', width, geometry: currentGeometry, metricDirections: 16, sortFrameMs, resetFrameMs, officialReset: true, formScopeReset: true, keyboard: true, bounds: size })
      await page.close()

      for (const mode of ['partial', 'complete', 'draw', 'replay', 'champion']) {
        const data = cupState(mode), cupView = { name: 'competition', competitionType: 'cup', season: 'Season 1' }
        const screen = { ...defaultScreenState(cupView), cupMenu: 'table', cupTableStage: mode === 'complete' || mode === 'draw' ? 'stage1' : mode === 'champion' ? 'total' : mode === 'replay' ? 'final' : null }
        const cupPage = await browser.page(seedApplication(data, cupView, screen), width)
        await cupPage.navigate(servers.after.url); await cupPage.waitFor(`!!document.querySelector(${JSON.stringify('button[aria-label="Sort by GF"]')})`)
        const statuses = await cupPage.evaluate('[...document.querySelectorAll("tr[data-team-id]")].map(el=>({id:el.dataset.teamId,state:el.dataset.cupState,rank:el.querySelector("td").dataset.officialRank,status:el.querySelector("small").textContent}))')
        const text = await cupPage.evaluate('document.querySelector(".app-content").textContent')
        if (mode === 'partial') assert(/At Risk/.test(text) && /Not Played/.test(text) && /Provisional Survival Line/.test(text), text)
        if (mode === 'complete') assert(/Eliminated/.test(text) && /Surviving/.test(text) && /Survival Line/.test(text))
        if (mode === 'draw') assert(/Elimination Draw/.test(text))
        if (mode === 'replay') assert(/Final Replay required/.test(text))
        if (mode === 'champion') assert(/Champion/.test(text) && /Runner-up/.test(text))
        const lineCount = await cupPage.evaluate('document.querySelectorAll("tr[data-survival-line]").length')
        if (mode === 'partial') {
          const officialCup = await cupPage.evaluate(cupRows)
          for (const [label, metric, direction] of metrics) for (const selected of [direction, direction === 'desc' ? 'asc' : 'desc']) {
            await click(cupPage, `button[aria-label="Sort by ${label}"]`)
            const expected = officialCup.slice().sort((a, b) => (selected === 'asc' ? a[metric] - b[metric] : b[metric] - a[metric]) || a.rank - b.rank)
            assert.deepEqual(await cupPage.evaluate(cupRows), expected, `Cup ${width}px ${label} ${selected}`)
          }
          await click(cupPage, 'button[aria-label="Restore official ranking"]'); assert.deepEqual(await cupPage.evaluate(cupRows), officialCup)
        }
        await click(cupPage, 'button[aria-label="Sort by GF"]')
        assert.equal(await cupPage.evaluate('document.querySelectorAll("tr[data-survival-line]").length'), 0)
        if (lineCount) assert.match(await cupPage.evaluate('document.querySelector("[role=status]").textContent'), /Official boundary before #/)
        const sortedStatuses = await cupPage.evaluate('[...document.querySelectorAll("tr[data-team-id]")].map(el=>({id:el.dataset.teamId,state:el.dataset.cupState,rank:el.querySelector("td").dataset.officialRank,status:el.querySelector("small").textContent}))')
        assert.deepEqual(sortedStatuses.sort((a, b) => a.id.localeCompare(b.id)), statuses.sort((a, b) => a.id.localeCompare(b.id)))
        const widths = await cupPage.evaluate('[...document.querySelectorAll("thead th")].map(el=>el.getBoundingClientRect().width)')
        assert.equal(widths[3], 42); assert.equal(widths[4], 44)
        const cupSize = await bounds(cupPage); assert(cupSize.scroll <= cupSize.client + 1 && cupSize.body <= cupSize.viewport + 1)
        const icon = await cupPage.evaluate('document.querySelector("tbody td:nth-child(2) button > span")?.getBoundingClientRect().width')
        results.push({ area: 'cup', width, mode, statuses: statuses.length, originalSurvivalLines: lineCount, statusPreserved: true, columns: widths, iconWidth: icon, bounds: cupSize })
        if (width === 390 && mode === 'partial') await cupPage.screenshot(path.join(root, '.superpowers/sdd/v267/cup-sorted.png'))
        await cupPage.close()
      }

      const originalMatch = fixture.matches.at(-1), matchView = { name: 'match', id: originalMatch.id }
      const editPage = await browser.page(seedApplication(fixture, matchView, defaultScreenState(matchView)), width)
      await editPage.navigate(servers.after.url)
      await editPage.waitFor(`!![...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='EDIT MATCH')`)
      await namedButton(editPage, 'EDIT MATCH')
      await editPage.waitFor(`!!document.querySelector(${JSON.stringify('button[aria-label="Edit match details"]')})`)
      await click(editPage, 'button[aria-label="Edit match details"]')
      await editPage.waitFor(`!!document.querySelector(${JSON.stringify('[role="dialog"][aria-label="Edit match details"]')})`)
      await setField(editPage, 'Competition', 'league', 'select'); await setField(editPage, 'Season', 'Season 3')
      await setField(editPage, 'Match date', '2026-11-10'); await setField(editPage, 'Opponent display name', 'Updated opponent')
      const dialogSize = await editPage.evaluate('(()=>{const el=document.querySelector("[role=dialog] > div"),r=el.getBoundingClientRect();return {left:r.left,right:r.right,scroll:el.scrollWidth,client:el.clientWidth,viewport:innerWidth}})()')
      assert(dialogSize.left >= 0 && dialogSize.right <= width && dialogSize.scroll <= dialogSize.client + 1)
      await namedButton(editPage, 'Apply details')
      assert.match(await editPage.evaluate(`document.querySelector(${JSON.stringify('button[aria-label="Edit match details"]')}).textContent`), /League/)
      assert.deepEqual(await editPage.evaluate(`JSON.parse(localStorage.getItem('football-tracker-v1')).matches.find(m=>m.id===${JSON.stringify(originalMatch.id)}).events`), originalMatch.events, 'Local metadata acceptance must not alter durable events')
      if (width === 390) {
        await editPage.command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
        await namedButton(editPage, 'END MATCH')
        await editPage.waitFor(`!!document.querySelector(${JSON.stringify('[role="dialog"][aria-label="End match"]')})`)
        await namedButton(editPage, 'SAVE & FINISH MATCH')
        await editPage.waitFor(`!document.querySelector(${JSON.stringify('button[aria-label="Edit match details"]')}) && !![...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='EDIT MATCH')`)
        const saved = await editPage.evaluate(`JSON.parse(localStorage.getItem('football-tracker-v1')).matches.find(m=>m.id===${JSON.stringify(originalMatch.id)})`)
        assert.equal(saved.competitionType, 'league'); assert.equal(saved.season, 'Season 3'); assert.equal(saved.competitionAssignment.competitionType, 'league')
        assert.equal(saved.competitionPairingId, undefined); assert.equal(saved.competitionSeriesGame, undefined)
        assert.equal(saved.recordedAt, originalMatch.recordedAt); assert.deepEqual(saved.events, originalMatch.events); assert.deepEqual(saved.appearances, originalMatch.appearances)
        assert.equal(saved.date, '2026-11-10'); assert.equal(saved.opponentName, 'Updated opponent')
        const mirrored = await editPage.evaluate(`new Promise((resolve,reject)=>{const request=indexedDB.open('FootballTrackerDB',2);request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('data','readonly'),read=tx.objectStore('data').get('football-tracker-v1');read.onerror=()=>reject(read.error);read.onsuccess=()=>resolve(read.result.matches.find(m=>m.id===${JSON.stringify(originalMatch.id)}));tx.oncomplete=()=>db.close();}})`)
        assert.deepEqual(mirrored, saved, 'Offline IndexedDB mirror must retain the canonical same-ID record')
      } else {
        await namedButton(editPage, '← Cancel')
        const saved = await editPage.evaluate(`JSON.parse(localStorage.getItem('football-tracker-v1')).matches.find(m=>m.id===${JSON.stringify(originalMatch.id)})`)
        assert.equal(saved.competitionType, 'champions'); assert.deepEqual(saved.events, originalMatch.events)
      }
      results.push({ area: 'match-metadata', width, dialogBounds: dialogSize, canonicalChampionsToLeagueSave: width === 390, offlinePrimaryAndIndexedDB: width === 390, cancelledWithoutDurableChanges: width !== 390, eventsPreserved: true })
      await editPage.close()

      const playerView = { name: 'player', id: fixture.players[9].id, season: 'Season 2' }
      const playerPage = await browser.page(seedApplication(fixture, playerView, { ...defaultScreenState(playerView), season: 'Season 2' }), width)
      await playerPage.navigate(servers.after.url)
      await playerPage.waitFor('[...document.querySelectorAll("h2")].some(el=>el.textContent==="Career Personal Records")')
      const overviewHeadings = await playerPage.evaluate('[...document.querySelectorAll("h2")].map(el=>el.textContent)')
      for (const heading of ['Overview', 'Recent Form', 'Rank Trend', 'Active Streaks', 'Position Stats', 'Positions Played', 'Team Performance When Starting', 'Role Impact', 'Goal Types', 'Player Chemistry', 'Career Timeline', 'Next Milestones', 'Career Personal Records']) assert(overviewHeadings.includes(heading), heading)
      assert(!overviewHeadings.includes('Matches'), 'Overview must not mount Match History')
      const overviewTop = await playerPage.evaluate('document.querySelector(".app-content").scrollTop=650; new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector(".app-content").scrollTop))))')
      const sticky = await playerPage.evaluate(`(()=>{const back=document.querySelector('.detail-back'),tabs=document.querySelector(${JSON.stringify('[aria-label="Player detail section"]')}),b=back.getBoundingClientRect(),t=tabs.getBoundingClientRect(),button=back.querySelector('button'),r=button.getBoundingClientRect();return {backTop:b.top,backBottom:b.bottom,tabTop:t.top,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('button')===button}})()`)
      assert(sticky.backBottom < 0 && Math.abs(sticky.tabTop) <= 1 && !sticky.hit)
      const toMatchesMs = await click(playerPage, '[aria-label="Player detail section"] button:nth-child(2)')
      await playerPage.waitFor(`document.querySelector(${JSON.stringify(selectedPlayerTab)})?.textContent==='Matches'`)
      assert.equal(await playerPage.evaluate('document.querySelector(".app-content").scrollTop'), 0)
      assert.equal(await playerPage.evaluate('[...document.querySelectorAll("h2")].some(el=>el.textContent==="Player Chemistry")'), false)
      await playerPage.evaluate(`([...document.querySelectorAll(${JSON.stringify(playerCompetitionButtons)})].find(el=>el.textContent==='League')).click()`)
      await playerPage.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      const matchesTop = await playerPage.evaluate('document.querySelector(".app-content").scrollTop=420; new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(document.querySelector(".app-content").scrollTop))))')
      await click(playerPage, '.app-content article button')
      await playerPage.waitFor(`!![...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='EDIT MATCH')`)
      await click(playerPage, '.detail-back button')
      await playerPage.waitFor(`document.querySelector(${JSON.stringify(selectedPlayerTab)})?.textContent==='Matches'`)
      await playerPage.waitFor(`Math.abs(document.querySelector('.app-content').scrollTop-${matchesTop})<2`)
      assert.equal(await playerPage.evaluate(`document.querySelector(${JSON.stringify(selectedPlayerCompetition)})?.textContent`), 'League')
      const toOverviewMs = await click(playerPage, '[aria-label="Player detail section"] button:first-child')
      await playerPage.waitFor(`Math.abs(document.querySelector('.app-content').scrollTop-${overviewTop})<2`)
      const playerSize = await bounds(playerPage); assert(playerSize.scroll <= playerSize.client + 1 && playerSize.body <= playerSize.viewport + 1)
      if (width === 390) await playerPage.screenshot(path.join(root, '.superpowers/sdd/v267/player-overview.png'))
      results.push({ area: 'player-tabs', width, sticky, overviewTop, matchesTop, tabFilterAndScrollRoundTrip: true, toMatchesMs, toOverviewMs, bounds: playerSize })
      await playerPage.close()

      const teamView = { name: 'team', id: fixture.teams[0].id }
      const teamPage = await browser.page(seedApplication(fixture, teamView, defaultScreenState(teamView)), width)
      await teamPage.navigate(servers.after.url); await teamPage.waitFor('!!document.querySelector(".detail-back")')
      await teamPage.evaluate('document.querySelector(".app-content").scrollTop=300; new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      const teamSticky = await teamPage.evaluate(`(()=>{const b=document.querySelector('.detail-back').getBoundingClientRect(),t=document.querySelector(${JSON.stringify('[aria-label="Team detail section"]')}).getBoundingClientRect();return {backTop:b.top,backBottom:b.bottom,tabTop:t.top}})()`)
      assert(teamSticky.backBottom < 0 && Math.abs(teamSticky.tabTop) <= 1)
      results.push({ area: 'team-back', width, sticky: teamSticky }); await teamPage.close()
    }
    fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify({ browser: path.basename(browser.executable), method: 'Real production app, synthetic localStorage seed, isolated incognito contexts, actual DOM clicks/keyboard at 320/375/390px mobile and 1280px desktop; baseline League geometry compared exactly. No real user profile/storage or physical device.', cases: results.length, errors: browser.exceptions, results }, null, 2) + '\n')
    assert.equal(browser.exceptions.length, 0, JSON.stringify(browser.exceptions))
    console.log(JSON.stringify({ output, cases: results.length, errors: browser.exceptions.length }))
  } finally { try { if (browser) await browser.close() } finally { await Promise.all(Object.values(servers).map(server => server.close())) } }
})().catch(error => { console.error(error); process.exitCode = 1 })
