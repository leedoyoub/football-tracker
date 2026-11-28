require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { historicalRankingTeams } = require('../src/engine/rankingPresentation.ts')

const mode = 'button[aria-label^="Ranking mode:"]'
const storedState = 'JSON.parse(localStorage.getItem("football-tracker-last-route"))?.screenState'
const table = `[...document.querySelectorAll('[data-virtual-row]')].map(row=>({
  id: row.dataset.virtualRow,
  rank: Number(row.querySelector('b').textContent.replace('#','')),
  value: row.querySelector('b:last-child').textContent
}))`

async function click(page, selector, label) {
  await page.evaluate(`(() => {
    const elements = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const match = ${label === undefined} ? elements[0] : elements.find(el => el.textContent.trim() === ${JSON.stringify(label)});
    if (!match) throw new Error('Missing ' + ${JSON.stringify(label ?? selector)});
    match.click();
  })()`)
}

;(async () => {
  const fixture = performanceFixture(1)
  const view = { name: 'global-ranking', season: 'Season 1', competitionType: 'league' }
  const screenState = defaultScreenState(view)
  const team = fixture.teams[0]
  const games = fixture.matches.filter(match => match.season === view.season && match.competitionType === 'league')
  const index = buildGlobalRankingData(fixture.players, games, { seasons: [], teams: [], positions: [] }, 'rating')
  const membership = historicalRankingTeams(games, true)
  const expected = rankGlobalRankingRows(index, fixture.players, 'appearances')
    .map((row, index) => ({ row, rank: index + 1 }))
    .filter(({ row }) => ['ST', 'SS'].includes(row.scopedPositionFamily) && membership.get(row.playerId)?.has(team.id))
    .map(({ row, rank }) => ({ id: row.playerId, rank, value: String(row.value) }))
  const server = process.env.V280_PUBLIC_URL ? { url: process.env.V280_PUBLIC_URL, close() {} } : await serveBuild(process.argv[2] ?? 'dist')
  const origin = JSON.stringify(new URL(server.url).origin)
  const seed = `if (location.origin === ${origin} && !sessionStorage.getItem('ranking-fixture-seeded')) {
    sessionStorage.setItem('ranking-fixture-seeded', 'true');
    ${seedApplication(fixture, view, screenState).replace("location.protocol === 'http:'", `location.origin === ${origin}`)}
  }`
  let browser
  try {
    browser = await launchBrowser()
    for (const width of [320, 390]) {
      const page = await browser.page(seed, width)
      try {
        await page.navigate(server.url)
        await page.waitFor(`document.querySelector(${JSON.stringify(mode)})?.textContent === 'Filtered'`)
        const metrics = '[aria-label="Global ranking metric"] button'
        const labels = await page.evaluate(`[...document.querySelectorAll(${JSON.stringify(metrics)})].map(button=>button.textContent)`)
        assert.deepEqual(labels.slice(3, 7), ['G+A', 'Appearances', 'Minutes', 'MOM'])
        await click(page, metrics, 'Appearances')
        await page.waitFor(`${storedState}?.metric === 'appearances'`)
        await click(page, 'button[aria-haspopup="menu"][aria-label^="Global Ranking position:"]')
        await click(page, '[aria-label="Global Ranking position filter"] button', 'ST/SS')
        await click(page, 'button[aria-haspopup="menu"][aria-label^="Global Ranking position:"]')
        await click(page, 'button[aria-haspopup="menu"][aria-label^="Global Ranking team:"]')
        await click(page, '[aria-label="Global Ranking team filter"] button', team.shortName)
        await click(page, 'button[aria-haspopup="menu"][aria-label^="Global Ranking team:"]')
        await page.waitFor(`${storedState}?.teamIds?.[0] === ${JSON.stringify(team.id)}`)
        const filtered = await page.evaluate(table)
        assert(filtered.length)
        assert.deepEqual(filtered, expected.slice(0, filtered.length).map((row, index) => ({ ...row, rank: index + 1 })))
        const buttonLayout = `(() => {
          const button = document.querySelector(${JSON.stringify(mode)});
          const position = document.querySelector('button[aria-haspopup="menu"][aria-label^="Global Ranking position:"]');
          const team = document.querySelector('button[aria-haspopup="menu"][aria-label^="Global Ranking team:"]');
          return [button, position, team].map(el => {
            const {x, y, width, height} = el.getBoundingClientRect();
            return {x, y, width, height};
          });
        })()`
        const before = await page.evaluate(buttonLayout)
        assert(before[0].x < before[1].x && before[1].x < before[2].x)
        assert.equal(new Set(before.map(rect => rect.y)).size, 1)
        assert.equal(new Set(before.map(rect => rect.height)).size, 1)
        await click(page, mode)
        await page.waitFor(`${storedState}?.rankMode === 'overall'`)
        assert.equal(await page.evaluate(`document.querySelectorAll(${JSON.stringify(mode)}).length`), 1)
        assert.deepEqual(await page.evaluate(buttonLayout), before)
        assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), true)
        assert.deepEqual(await page.evaluate(table), expected.slice(0, filtered.length))
        assert(expected.some((row, index) => row.rank !== index + 1))
        await click(page, '[data-virtual-row] button[aria-label$=" player details"]')
        await page.waitFor('!!document.querySelector(".detail-back button")')
        await click(page, '.detail-back button')
        await page.waitFor(`document.querySelector(${JSON.stringify(mode)})?.textContent === 'Overall'`)
        await page.reload()
        await page.waitFor(`document.querySelector(${JSON.stringify(mode)})?.textContent === 'Overall'`)
        assert.deepEqual(await page.evaluate(table), expected.slice(0, filtered.length))
        console.log(`Ranking modes, Appearances, geometry, back navigation and reload passed at ${width}px`)
      } finally {
        await page.close()
      }
    }
    assert.deepEqual(browser.exceptions, [])
  } finally {
    try { await browser?.close() } finally { await server.close() }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
