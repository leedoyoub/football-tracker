require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { launchBrowser, serveBuild, seedApplication } = require('./helpers/v267-browser.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')

const click = (page, text, selector = '.app-content button') => page.evaluate(`(() => {
  const button = [...document.querySelectorAll(${JSON.stringify(selector)})].find(item => item.textContent.trim().startsWith(${JSON.stringify(text)}));
  if (!button) throw new Error('Missing button ' + ${JSON.stringify(text)});
  button.click();
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`)
const layout = page => page.evaluate(`(() => {
  const body = document.querySelector('.app-content');
  return [body.clientWidth, body.scrollWidth, innerWidth, document.documentElement.scrollWidth];
})()`)
async function checkWidth(page) {
  const [client, scroll, viewport, documentWidth] = await layout(page)
  assert.ok(scroll <= client && documentWidth <= viewport, `Horizontal overflow: ${client}/${scroll}, ${viewport}/${documentWidth}`)
}

;(async () => {
  const app = process.env.V280_PUBLIC_URL ? { url: process.env.V280_PUBLIC_URL, close() {} } : await serveBuild('dist')
  const seed = (...args) => seedApplication(...args).replace("location.protocol === 'http:'", `location.origin === ${JSON.stringify(new URL(app.url).origin)}`)
  let browser
  try {
    browser = await launchBrowser()
    const fixture = performanceFixture(1)
    for (const width of [320, 390]) {
      const page = await browser.page(seed(fixture, { name: 'records' }), width)
      await page.navigate(app.url)
      await page.waitFor(String.raw`document.querySelectorAll('[aria-label="Records archive"] button').length === 6`)
      await checkWidth(page)
      await click(page, 'Hall of Fame')
      await page.waitFor('document.body.textContent.includes("All-time Best XI") && document.body.textContent.includes("Career Score")')
      await checkWidth(page)
      await click(page, 'Career Rankings')
      const breakdown = 'button[aria-label^="Show Career Score breakdown"]'
      await page.waitFor(`!!document.querySelector(${JSON.stringify(breakdown)})`)
      await page.evaluate(`document.querySelector(${JSON.stringify(breakdown)}).click()`)
      await page.waitFor('document.body.textContent.includes("available minutes")')
      await click(page, '‹ Records')
      await click(page, 'Teams')
      await page.waitFor(String.raw`document.body.textContent.includes("Most Matches Played") && /P \d+W \d+D \d+L \d+/.test(document.body.textContent)`)
      await click(page, 'Historic Matches')
      await click(page, 'Biggest Win')
      await page.waitFor('document.querySelector("h1").textContent === "Biggest Win"')
      const rank = 'button[aria-label^="Records ranking mode"]'
      const widthOfToggle = () => page.evaluate(`document.querySelector(${JSON.stringify(rank)}).getBoundingClientRect().width`)
      const before = await widthOfToggle()
      await click(page, 'Filtered', rank)
      assert.equal(await widthOfToggle(), before)
      const overall = String.raw`!!document.querySelector('[aria-label="Records ranking mode: Overall"]')`
      await page.waitFor(overall)
      await checkWidth(page)
      const score = 'button[aria-label^="Open match against"]'
      const scroll = 'document.querySelector(".app-content").scrollTop'
      await page.evaluate(`${scroll} = 480`)
      await page.waitFor(`${scroll} > 400`)
      const top = await page.evaluate(scroll)
      await page.evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(score)})).find(button => {
        const viewport = document.querySelector('.app-content').getBoundingClientRect();
        const rect = button.getBoundingClientRect();
        return rect.top >= viewport.top && rect.bottom <= viewport.bottom;
      }).click()`)
      await page.waitFor('!' + overall.slice(2))
      await click(page, 'Back', '.app-content button, header button')
      await page.waitFor(overall)
      await page.waitFor(`Math.abs(${scroll} - ${top}) < 4`)
      await click(page, '‹ Back to Records')
      await page.waitFor('document.querySelector("h1").textContent === "Teams"')
      await click(page, '‹ Records')
      await click(page, 'History')
      await click(page, 'Season 1')
      await page.waitFor('document.body.textContent.includes("Team Records") && document.body.textContent.includes("In progress")')
      await checkWidth(page)
      await click(page, '‹ Records')
      await click(page, 'Combinations')
      await click(page, 'Find Partner')
      await click(page, fixture.players[0].name, '[aria-label="Find Partner"] button')
      const pair = 'button[aria-label^="Open partnership with"]'
      await page.waitFor(`!!document.querySelector(${JSON.stringify(pair)})`)
      await page.evaluate(`document.querySelector(${JSON.stringify(pair)}).click()`)
      await page.waitFor('document.body.textContent.includes("Combined G+A") && document.body.textContent.includes("Match evidence")')
      await checkWidth(page)
      await click(page, 'Back')
      await page.waitFor(`!!document.querySelector(${JSON.stringify(pair)})`)
      await page.close()
      const teamView = { name: 'team', id: fixture.teams[0].id }
      const team = await browser.page(seed(fixture, teamView, { ...defaultScreenState(teamView), tab: 'history' }), width)
      await team.navigate(app.url)
      await team.waitFor('document.body.textContent.includes("All-time Team Record") && document.body.textContent.includes("Historic Matches")')
      await checkWidth(team)
      await team.close()
      const admin = await browser.page(seed(fixture, { name: 'data-management' }), width)
      await admin.navigate(app.url)
      await admin.waitFor('document.querySelector("h1")?.textContent === "Data Management"')
      await click(admin, 'Data Integrity')
      await admin.waitFor(String.raw`document.body.textContent.includes("No issues found.") || /\d+ errors/.test(document.body.textContent)`)
      await checkWidth(admin)
      await admin.close()
      const awardsView = { name: 'award-race', season: 'Season 1', competitionType: 'all' }
      const awards = await browser.page(seed(fixture, awardsView), width)
      await awards.navigate(app.url)
      await awards.waitFor(`document.body.textContent.includes("Ballon d'Or")`)
      await checkWidth(awards)
      await awards.close()
      console.log(`Records, Hall of Fame, match evidence, scroll restoration, Team History, partnerships, Ballon d'Or and Data Integrity verified at ${width}px`)
    }
  } finally {
    await browser?.close()
    await app.close()
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
