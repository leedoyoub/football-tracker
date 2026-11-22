require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { launchBrowser, serveBuild } = require('./helpers/v267-browser.cjs')
const { instrumentationSeed, draftFixture } = require('./v268-profiler.browser.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { validateState } = require('../src/lib/validation.ts')
const { playerSaveCount } = require('../src/engine/playerMatchFacts.ts')
const { action, button, click, editTarget, field, select, type, work } = require('./v2611-editor.browser.cjs')
const output = process.env.V2611_REGRESSION_OUTPUT || path.join(work, 'editor-regression.json')
const sot = select('button[aria-label="Opponent SOT"]')
const primary = "JSON.parse(localStorage.getItem('football-tracker-v1'))"
const currentMatch = id => `${primary}.matches.find(match => match.id === ${JSON.stringify(id)})`

async function named(page, label, verify) { return action(page, click(button(label)), verify) }
async function openSot(page) { await action(page, click(sot), `!!${field('Full Match SOT')}`) }
async function input(page, label, value) {
  const target = field(label)
  await action(page, `${target}.focus(); ${type(label, value)}`, `${target}.value === ${JSON.stringify(String(value))} && document.activeElement === ${target}`)
}

async function openPage(browser, server, state, view, width) {
  assert(validateState(state))
  const seed = `if (location.protocol === 'http:' && !sessionStorage.getItem('v2611-seeded')) {
    sessionStorage.setItem('v2611-seeded', 'true');
    ${instrumentationSeed({ state, view, screenState: defaultScreenState(view) })}
  }`
  const page = await browser.page(seed, width)
  await page.command('Network.setBlockedURLs', { urls: ['https://*'] })
  if (width < 768) await page.command('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
  await page.navigate(server.url)
  return page
}

async function editEvent(page, kind, label, minute, saveLabel) {
  await action(page, click(editTarget(kind)), `!!${button('EDIT')}`)
  await named(page, 'EDIT', `!!${field(label)}`)
  await input(page, label, '')
  await input(page, label, minute)
  await action(page, `${field(label)}.blur()`)
  const result = await named(page, saveLabel, `!${field(label)}`)
  return result
}

async function editSaved(browser, server, fixture, width) {
  const state = fixture.state
  delete state.draftMatch
  const original = state.matches.find(match => match.competitionType === 'league')
  const baseSave = original.events.find(event => event.type === 'save')
  const opposingKeeper = { playerId: 'historic-opposing-keeper', teamId: original.awayTeamId, role: 'starter', position: 'GK', matchPosition: 'GK' }
  const otherSave = { id: 'other-save', type: 'save', playerId: opposingKeeper.playerId, teamId: opposingKeeper.teamId, count: 2 }
  original.appearances = [...original.appearances, opposingKeeper]
  original.events = [...original.events, { ...baseSave, id: 'legacy-timed-save', minute: 18, count: undefined }, otherSave,
    { id: 'unattributed-legacy-goal', type: 'goal', minute: 26, teamId: original.teamId, wondergoal: true }]
  const expected = baseSave.count + 1
  const page = await openPage(browser, server, state, { name: 'match', id: original.id }, width)
  try {
    await page.waitFor(`!!${button('EDIT MATCH')}`)
    await named(page, 'EDIT MATCH', `!!${sot}`)
    const otherSaveRow = "[...document.querySelectorAll('button')].find(el=>el.textContent.startsWith('Save:') && el.textContent.includes('historic-opposing-keeper'))"
    await action(page, click(otherSaveRow), "!!document.querySelector('[aria-label=\"Recorded save\"]') && !document.querySelector('[aria-label=\"Total saves\"]')")
    await named(page, 'CLOSE')
    await openSot(page)
    await input(page, 'Full Match SOT', '')
    await named(page, 'DONE')
    await named(page, 'END MATCH', `${field('Total saves')}.value === '${expected}'`)
    await named(page, 'SAVE & FINISH MATCH')
    await page.waitFor(`!!${button('OPEN SOT')}`)
    assert.equal(await page.evaluate(`${currentMatch(original.id)}.fulltimeOpponentSot`), original.fulltimeOpponentSot)
    await named(page, 'OPEN SOT', `!!${field('Full Match SOT')} && !${field('Total saves')}`)
    await input(page, '1H SOT', '4')
    await input(page, 'Full Match SOT', '11')
    await named(page, 'DONE')
    await editEvent(page, 'Goal', 'Goal Time', 22, 'SAVE GOAL')
    await editEvent(page, 'Goal · Opponent own goal', 'Goal Time', 28, 'SAVE GOAL')
    await editEvent(page, 'Conceded', 'Conceded Goal Time', 12, 'SAVE CONCEDED GOAL')
    await editEvent(page, 'Substitution', 'Substitution Time', 59, 'SAVE')
    await action(page, click(editTarget('Goal')), `!!${button('EDIT')}`)
    await named(page, 'EDIT', `!!${field('Goal Time')}`)
    await input(page, 'Goal Time', 25)
    await named(page, 'CANCEL', `!${field('Goal Time')}`)
    await named(page, 'END MATCH', `${field('Total saves')}.value === '${expected}'`)
    await input(page, 'Total saves', '1')
    await input(page, 'Total saves', '10')
    await page.evaluate(`(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'football-tracker-v1') throw new DOMException('Synthetic retry test', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      window.restorePrimaryWrites = () => { Storage.prototype.setItem = original; };
    })()`)
    await named(page, 'SAVE & FINISH MATCH')
    await page.waitFor("document.body.innerText.includes('Primary storage save failed')")
    assert.equal(await page.evaluate(`${currentMatch(original.id)}.fulltimeOpponentSot`), original.fulltimeOpponentSot)
    assert.equal(await page.evaluate(`${field('Total saves')}.value`), '10')
    await page.evaluate('window.restorePrimaryWrites()')
    const save = await named(page, 'SAVE & FINISH MATCH')
    await page.waitFor(`!!${button('EDIT MATCH')}`)
    const saved = await page.evaluate(currentMatch(original.id))
    assert.equal(saved.halftimeOpponentSot, 4)
    assert.equal(saved.fulltimeOpponentSot, 11)
    assert.equal(saved.events.find(event => event.id.endsWith(':equalizer')).minute, 22)
    assert.equal(saved.events.find(event => event.id.endsWith(':opener')).minute, 12)
    assert.equal(saved.events.find(event => event.id.endsWith(':sub')).minute, 59)
    assert.equal(saved.events.find(event => event.id === 'legacy-timed-save').minute, 18)
    assert.equal(saved.events.find(event => event.id === 'legacy-timed-save').count, undefined)
    assert.deepEqual(saved.events.find(event => event.id === otherSave.id), otherSave)
    assert.deepEqual(saved.events.find(event => event.id === 'unattributed-legacy-goal'), { ...original.events.at(-1), minute: 28 })
    assert.equal(playerSaveCount(saved, saved.appearances[0]), 10)
    await page.reload()
    await page.waitFor(`!!${button('EDIT MATCH')}`)
    assert.deepEqual(await page.evaluate(currentMatch(original.id)), saved)
    return { width, save, events: saved.events.length, retryAndReload: true }
  } finally { await page.close() }
}

async function freshAndResume(browser, server, fixture, width) {
  const state = fixture.state
  delete state.draftMatch
  const teamId = state.teams[0].id
  const page = await openPage(browser, server, state, { name: 'new-match', teamId, season: 'Season 3' }, width)
  try {
    await page.waitFor(`${button('CONTINUE')} && !${button('CONTINUE')}.disabled`)
    await named(page, 'CONTINUE', `!!${sot}`)
    await openSot(page)
    await input(page, '1H SOT', '1')
    assert.equal(await page.evaluate(`${field('Full Match SOT')}.value`), '1')
    await named(page, 'DONE')
    await named(page, 'CONCEDED', `!!${field('Conceded Goal Time')}`)
    await input(page, 'Conceded Goal Time', '10')
    await named(page, 'SAVE CONCEDED GOAL')
    await page.waitFor(`${primary}.draftMatch?.fulltimeOpponentSot === 1 && ${primary}.draftMatch.events.length === 1`)
    const draft = await page.evaluate(`${primary}.draftMatch`)
    assert.equal(draft.fulltimeOpponentSotAutoLinked, true)
    await page.reload()
    await page.waitFor(`!!${button('Resume Draft')} || !!${sot}`)
    if (await page.evaluate(`!!${button('Resume Draft')}`)) await named(page, 'Resume Draft', `!!${sot}`)
    await openSot(page)
    assert.equal(await page.evaluate(`${field('Full Match SOT')}.value`), '1')
    await named(page, 'DONE')
    await named(page, 'END MATCH')
    await input(page, 'Total saves', '0')
    await named(page, 'SAVE & FINISH MATCH')
    await page.waitFor(`!!${button('EDIT MATCH')}`)
    const saved = await page.evaluate(currentMatch(draft.id))
    assert.equal(saved.fulltimeOpponentSot, 1)
    assert.equal(saved.fulltimeOpponentSotAutoLinked, undefined)
    assert.equal(saved.events.find(event => event.type === 'goal').minute, 10)
    assert.equal(saved.events.find(event => event.type === 'save').count, 0)
    assert.equal(await page.evaluate(`${primary}.draftMatch === undefined`), true)
    await named(page, 'EDIT MATCH', `!!${sot}`)
    await openSot(page)
    await input(page, '1H SOT', '2')
    assert.equal(await page.evaluate(`${field('Full Match SOT')}.value`), '1')
    return { width, freshResumeAndSave: true, matchCount: state.matches.length + 1 }
  } finally { await page.close() }
}

;(async () => {
  const server = await serveBuild('dist'), browser = await launchBrowser()
  const results = []
  try {
    for (const width of [320, 390, 1280]) {
      results.push(await editSaved(browser, server, draftFixture(2, width), width))
      results.push(await freshAndResume(browser, server, draftFixture(2, width), width))
      console.log(`${width}px saved edit, retry, fresh and resumed match passed`)
    }
    assert.deepEqual(browser.exceptions, [])
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n')
  } finally {
    try { await browser.close() } finally { await server.close() }
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
