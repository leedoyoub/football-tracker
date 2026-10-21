/* Reproducible real Chromium layout probe. Run after npm run build:
 * node tests/v264-layout.browser.cjs [output.json]
 * Uses an isolated temporary browser profile and deletes its own fixture/profile.
 */
require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { pathToFileURL } = require('node:url')
const { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict')
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { Pitch } = require('../src/components/Pitch.tsx')
const { teamHistoryLayout } = require('../src/engine/teamHistoryLayout.ts')

const browser = process.env.CHROME_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
].find(file => fs.existsSync(file))
assert.ok(browser, 'Set CHROME_PATH to a Chromium browser executable')
const cssFile = fs.readdirSync('dist/assets').find(file => /^index-.*\.css$/.test(file))
assert.ok(cssFile, 'Run npm run build first to generate the real app stylesheet')
const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8')
const shapes = [[4, 3, 3], [4, 4, 2], [3, 5, 2], [4, 5, 1], [5, 4, 1], [5, 3, 2], [3, 4, 3], [2, 6, 2], [1, 7, 2], [1, 1, 8], [0, 9, 1], [0, 10, 0], [5, 5, 0]]
const fixtures = []
for (const width of [264, 320, 375, 390]) for (const shape of shapes) for (const scenario of ['standard', 'vacant-retired', 'three-digit', 'four-digit']) {
  const slots = [['GK', 1], ['DEF', shape[0]], ['MID', shape[1]], ['FW', shape[2]]].flatMap(([group, count]) => Array.from({ length: count }, (_, index) => ({ slot: `${group}-${index}`, displayPosition: group, position: { GK: 'GK', DEF: 'CB', MID: 'CM', FW: 'ST' }[group], matchPosition: group === 'GK' ? 'GK' : 'CM', playerId: `${group}-${index}`, teamId: 'T', matches: 4, avgRating: 10 })))
  if (scenario === 'vacant-retired') slots[2].playerId = null
  const players = slots.filter((slot, index) => slot.playerId && !(scenario === 'vacant-retired' && index === 3)).map(slot => ({ id: slot.playerId, name: 'Ronaldo', fullName: 'Cristiano Ronaldo dos Santos Aveiro', displayName: 'A Very Long Player Name', number: 99 }))
  const value = scenario === 'four-digit' ? 9999 : scenario === 'three-digit' ? 999 : 99
  const statsByPlayer = Object.fromEntries(slots.filter(slot => slot.playerId).map(slot => [slot.playerId, { goals: value, assists: value, saves: value }]))
  const html = renderToStaticMarkup(React.createElement(Pitch, { slots: teamHistoryLayout(slots, statsByPlayer), players, teams: [{ id: 'T', name: 'Team', abbreviation: 'TM' }], presentation: 'team-history', showPositionBadge: false, showAwardTeamCrest: true, showEmptySlots: true, showGoalkeeperSaves: true, statsByPlayer, motmPlayerId: slots[1].playerId, onSlotClick: () => {} }))
  fixtures.push(`<section data-shape="${shape.join('-')}" data-width="${width}" data-scenario="${scenario}" style="width:${width}px">${html}</section>`)
}

function inspect() {
  const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
  const overlaps = (a, b) => a.left < b.right - .01 && a.right > b.left + .01 && a.top < b.bottom - .01 && a.bottom > b.top + .01
  const results = []
  for (const section of document.querySelectorAll('section')) {
    section.scrollIntoView({ block: 'start' })
    const pitch = section.firstElementChild, pb = box(pitch)
    const cards = [...pitch.children].filter(element => element.tagName === 'BUTTON' || element.getAttribute('role') === 'img')
    const pieces = cards.map((card, index) => ({ index, label: card.getAttribute('aria-label'), click: card.tagName === 'BUTTON' ? box(card) : null, items: [...card.querySelectorAll('[class]')].filter(element => element.classList.contains('h-10') || element.classList.contains('h-[18px]') || element.classList.contains('h-4') || element.classList.contains('bg-black/80') || element.textContent === 'Vacant').map(element => ({ element, text: element.textContent, kind: element.classList.contains('h-10') ? 'icon' : element.classList.contains('h-[18px]') ? 'rating' : element.classList.contains('bg-black/80') ? 'ga' : element.textContent === 'Vacant' ? 'vacant-name' : element.tagName === 'DIV' ? 'name' : 'crest', box: box(element) })) }))
    const errors = [], hitErrors = []
    for (const piece of pieces) {
      for (const item of [...(piece.click ? [{ kind: 'click', box: piece.click }] : []), ...piece.items]) {
        const b = item.box
        if (b.left < pb.left + 1 - .1 || b.right > pb.right - 1 + .1 || b.top < pb.top + 1 - .1 || b.bottom > pb.bottom - 1 + .1) errors.push({ type: 'border', index: piece.index, kind: item.kind, text: item.text, box: b })
      }
      const ga = piece.items.filter(item => item.kind === 'ga')
      if (ga.length === 2 && overlaps(ga[0].box, ga[1].box)) errors.push({ type: 'internal-ga', index: piece.index })
      if (piece.click) {
        for (const item of [{ kind: 'click', box: piece.click }, ...piece.items]) {
          const x = (item.box.left + item.box.right) / 2, y = (item.box.top + item.box.bottom) / 2
          const hit = document.elementFromPoint(x, y)
          if (hit?.closest('button') !== cards[piece.index]) hitErrors.push({ index: piece.index, kind: item.kind, text: item.text, hit: hit?.closest('button')?.getAttribute('aria-label') ?? hit?.tagName ?? null })
        }
      }
    }
    for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i], b = pieces[j]
      for (const first of [...(a.click ? [{ kind: 'click', box: a.click }] : []), ...a.items]) for (const second of [...(b.click ? [{ kind: 'click', box: b.click }] : []), ...b.items]) {
        if (overlaps(first.box, second.box)) errors.push({ type: 'neighbor', first: i, second: j, kinds: [first.kind, second.kind], overlapWidth: Math.min(first.box.right, second.box.right) - Math.max(first.box.left, second.box.left), overlapHeight: Math.min(first.box.bottom, second.box.bottom) - Math.max(first.box.top, second.box.top) })
      }
    }
    const sizes = pieces.flatMap(piece => piece.items).map(item => ({ kind: item.kind, text: item.text, width: item.box.width, height: item.box.height, box: item.box }))
    results.push({ shape: section.dataset.shape, width: Number(section.dataset.width), scenario: section.dataset.scenario, pitch: { width: pb.width, height: pb.height, innerWidth: pb.width - 2, innerHeight: pb.height - 2 }, cardCount: cards.length, errors, hitErrors, sizes: results.length === 0 || section.dataset.scenario === 'three-digit' && section.dataset.shape === '4-3-3' && section.dataset.width === '264' || section.dataset.scenario === 'four-digit' && section.dataset.shape === '4-5-1' && section.dataset.width === '264' ? sizes : undefined })
  }
  document.body.innerHTML = `<pre id="result">${JSON.stringify(results)}</pre>`
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v264-layout-'))
try {
  const fixture = path.join(tempRoot, 'fixture.html')
  fs.writeFileSync(fixture, `<!doctype html><html><meta charset="utf-8"><style>${css}</style><body>${fixtures.join('')}<script>(${inspect.toString()})()</script></body></html>`)
  const result = spawnSync(browser, ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', `--user-data-dir=${path.join(tempRoot, 'profile')}`, '--window-size=800,700', '--dump-dom', pathToFileURL(fixture).href], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true, timeout: 60000 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  const match = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  assert.ok(match, result.stdout.slice(-2000))
  const results = JSON.parse(match[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
  const regular = results.filter(row => ['standard', 'vacant-retired'].includes(row.scenario))
  const report = { browser: path.basename(browser), stylesheet: cssFile, method: 'Chromium headless actual app SSR + built CSS; bounding rectangles and elementFromPoint for each icon/rating/crest/name/GA/click center; not a physical touch-device test', testedCases: results.length, regularCases: regular.length, regularErrors: regular.reduce((sum, row) => sum + row.errors.length + row.hitErrors.length, 0), extremeCasesWithOverlap: results.filter(row => row.errors.length || row.hitErrors.length).map(row => ({ width: row.width, shape: row.shape, scenario: row.scenario, collisions: row.errors.length, hitFailures: row.hitErrors.length, first: row.errors[0] })), results }
  const output = process.argv[2] || 'docs/performance/v2.6.4-layout.json'
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, testedCases: report.testedCases, regularCases: report.regularCases, regularErrors: report.regularErrors, extremeCasesWithOverlap: report.extremeCasesWithOverlap.length }, null, 2))
  assert.equal(report.regularErrors, 0, 'Standard and vacant cards must not overlap or lose hit targets')
  assert.equal(results.filter(row => row.width >= 320).reduce((sum, row) => sum + row.errors.length + row.hitErrors.length, 0), 0, 'All tested counts fit at320px and above')
  assert.equal(results.reduce((sum, row) => sum + row.errors.filter(error => error.type === 'border' || error.type === 'internal-ga').length, 0), 0, 'All tested counts, including9999, remain visible within the border and separated within each GA row')
} finally {
  const resolved = fs.realpathSync(tempRoot), allowed = fs.realpathSync(os.tmpdir()) + path.sep
  assert.ok(resolved.startsWith(allowed) && path.basename(resolved).startsWith('football-v264-layout-'), 'Cleanup remains inside the verified temporary fixture directory')
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
