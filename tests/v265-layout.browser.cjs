/* Reuses the existing v264 headless Chromium / real CSS probe approach.
 * node tests/v265-layout.browser.cjs [report.json]
 * Isolated synthetic SSR fixtures/profile; never controls a user browser.
 */
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { pathToFileURL } = require('node:url'), { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict'), React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { uiFixture } = require('./helpers/v265-ui-fixture.cjs')
const { awardResultForScope } = require('../src/engine/awards.ts')
const { teamHistoryBestXI } = require('../src/engine/teamHistory.ts')
const { teamBestEleven } = require('../src/engine/stats.ts')
const { AwardBestXI } = require('../src/components/AwardBestXI.tsx')
const { Pitch } = require('../src/components/Pitch.tsx')
const { SegmentedControl } = require('../src/components/SeasonUI.tsx')
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(file => fs.existsSync(file))
assert(browser, 'A local Chromium browser is required')
const cssFile = fs.readdirSync('dist/assets').find(file => /^index-.*\.css$/.test(file))
assert(cssFile, 'Build the application before this probe')
const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8'), s = uiFixture()
const scopes = ['first-half', 'second-half', 'league', 'cup', 'champions', 'season']
const results = scopes.map(scope => [scope, awardResultForScope(scope, 'Season 1', s.teams, s.players, s.matches, s.competitionStates)])
const history = teamHistoryBestXI(s.players, s.matches, { teamId: s.teams[0].id, season: 'Season 1', competition: 'all' })
const latest = teamBestEleven(s.players, s.matches, s.teams[0].id, 'Season 1')
const latestSlots = latest.slots.map(slot => ({ ...slot, avgRating: history.statsByPlayer[slot.playerId]?.avgRating ?? 0 }))
assert.equal(history.formation.label, '4-2-1-3')
const fixtures = []
for (const width of [288, 320, 375, 390]) {
  for (const [scope, result] of results) {
    assert.equal(result.bestXI.filter(slot => slot.playerId).length, 11)
    const html = renderToStaticMarkup(React.createElement(AwardBestXI, { title: result.teamLabel, result, players: s.players, teams: s.teams, onPlayerOpen() {} }))
    fixtures.push(`<section data-scope="${scope}" data-width="${width}" style="width:${width}px">${html}</section>`)
  }
  fixtures.push(`<section data-scope="team-history" data-width="${width}" style="width:${width}px">${renderToStaticMarkup(React.createElement(Pitch, { slots: history.bestXI, players: s.players, teams: s.teams, statsByPlayer: history.statsByPlayer, showPositionBadge: false, presentation: 'history', showEmptySlots: true, onSlotClick() {} }))}</section>`)
  fixtures.push(`<section data-scope="latest-xi-reference" data-width="${width}" style="width:${width}px">${renderToStaticMarkup(React.createElement(Pitch, { slots: latestSlots, players: s.players, teams: s.teams, statsByPlayer: history.statsByPlayer, showPositionBadge: false, presentation: 'history', onSlotClick() {} }))}</section>`)
  const options = ['First Half', 'Second Half', 'League', 'Cup', 'Champions', 'Season'].map((label, i) => ({ value: scopes[i], label }))
  fixtures.push(`<section data-scope="history-tabs" data-width="${width}" style="width:${width}px">${renderToStaticMarkup(React.createElement(SegmentedControl, { label: 'Award history scope', value: 'league', options, columns: 3, onChange() {} }))}</section>`)
}
function inspect() {
  const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
  const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1
  const rows = [...document.querySelectorAll('section[data-scope]')].map(section => {
    section.scrollIntoView({ block: 'start' })
    const tabs = section.querySelector('[role="tablist"]')
    if (tabs) {
      const buttons = [...tabs.children], rects = buttons.map(box)
      return { scope: section.dataset.scope, width: Number(section.dataset.width), columns: getComputedStyle(tabs).gridTemplateColumns.split(' ').length, rows: new Set(rects.map(r => r.top)).size, errors: rects.flatMap((r, i) => rects.slice(i + 1).filter(q => overlap(r, q)).map(() => 'overlapping-tab')) }
    }
    const pitch = section.querySelector('.pitch-grass'), pb = box(pitch)
    const cards = [...pitch.children].filter(element => element.tagName === 'BUTTON')
    const rects = cards.map(box), errors = [], transparentHitboxOverlaps = []
    const visible = cards.map(card => [...card.querySelectorAll('[class]')].filter(element => element.classList.contains('h-10') && element.classList.contains('w-10') || element.classList.contains('h-[18px]') || element.classList.contains('bg-black/70') || element.classList.contains('bg-black/80')).map(element => ({ box: box(element), text: element.textContent })))
    rects.forEach((r, i) => {
      if (r.left < pb.left || r.right > pb.right || r.top < pb.top || r.bottom > pb.bottom) errors.push(`card-outside:${i}`)
      for (const [j, q] of rects.entries()) if (j > i && overlap(r, q)) transparentHitboxOverlaps.push(`${i}:${j}`)
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
      if (hit?.closest('button') !== cards[i]) errors.push(`hit-target:${i}`)
      for (const piece of visible[i]) {
        const v = piece.box
        if (v.left < pb.left || v.right > pb.right || v.top < pb.top || v.bottom > pb.bottom) errors.push(`visible-outside:${i}:${piece.text}`)
        const pieceHit = document.elementFromPoint((v.left + v.right) / 2, (v.top + v.bottom) / 2)
        if (pieceHit?.closest('button') !== cards[i]) errors.push(`visible-hit-target:${i}:${piece.text}`)
        for (let j = i + 1; j < visible.length; j++) for (const other of visible[j]) if (overlap(v, other.box)) errors.push(`visible-overlap:${i}:${j}`)
      }
    })
    return { scope: section.dataset.scope, width: Number(section.dataset.width), cards: cards.length, aspect: +(pb.width / pb.height).toFixed(3), transparentHitboxOverlaps, errors }
  })
  document.body.innerHTML = `<pre id="result">${JSON.stringify(rows)}</pre>`
}
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v265-layout-'))
try {
  const fixture = path.join(tempRoot, 'fixture.html')
  fs.writeFileSync(fixture, `<!doctype html><html><meta charset="utf-8"><style>${css}</style><body style="margin:16px;background:#09090b;color:white">${fixtures.join('')}<script>(${inspect.toString()})()</script></body></html>`)
  const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${path.join(tempRoot, 'profile')}`, '--window-size=1280,960', '--dump-dom', pathToFileURL(fixture).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  const content = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  assert(content, result.stdout.slice(-1000))
  const cases = JSON.parse(content[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
  const inheritedNarrowLimits = cases.filter(row => row.width < 320 && row.errors.length)
  const report = { browser: path.basename(browser), stylesheet: cssFile, method: 'Actual Chromium rendering of canonical selected XI / Latest XI SSR with built application CSS; visible bounds and hit targets. History must equal the unchanged Latest XI geometry, including disclosed inherited limits. Navigation callbacks are separately exercised by UI harness tests. No physical-device or deployed-app interaction claim.', cases: cases.length, errors: cases.flatMap(row => row.errors).length, inheritedNarrowLimits, results: cases }
  const output = process.argv[2] || 'docs/performance/v2.6.5-layout.json'
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, cases: report.cases, errors: report.errors }))
  for (const row of cases) {
    if (row.scope === 'history-tabs') { assert.equal(row.columns, 3); assert.equal(row.rows, 2) }
    else { assert.equal(row.cards, 11); assert(Math.abs(row.aspect - .75) < .001) }
  }
  assert.equal(cases.filter(row => row.width >= 320).flatMap(row => row.errors).length, 0, 'All tested visible pieces and hit targets fit at 320px and above')
  assert.equal(cases.flatMap(row => row.errors).filter(error => !error.startsWith('visible-overlap:')).length, 0, 'No card/visible clipping or failed hit centers at any tested width')
  for (const row of cases.filter(row => row.scope === 'team-history')) {
    const reference = cases.find(other => other.scope === 'latest-xi-reference' && other.width === row.width)
    assert.deepEqual({ cards: row.cards, aspect: row.aspect, overlaps: row.transparentHitboxOverlaps, errors: row.errors }, { cards: reference.cards, aspect: reference.aspect, overlaps: reference.transparentHitboxOverlaps, errors: reference.errors }, 'History preserves the existing Team Players pitch geometry and limits')
  }
} finally {
  const resolved = fs.realpathSync(tempRoot), allowed = fs.realpathSync(os.tmpdir()) + path.sep
  assert(resolved.startsWith(allowed) && path.basename(resolved).startsWith('football-v265-layout-'))
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
