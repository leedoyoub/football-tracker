/* Actual Chromium layout probe using synthetic data and built CSS.
 * Navigation/React handlers are exercised by v266-competition-awards.test.cjs.
 * No user browser profile or saved application data is accessed.
 */
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { pathToFileURL } = require('node:url'), { spawnSync } = require('node:child_process')
const assert = require('node:assert/strict'), { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { uiFixture } = require('./helpers/v265-ui-fixture.cjs')
const { leagueCompetition, cupCompetition } = require('../src/engine/competition.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const browser = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/chromium'].find(fs.existsSync)
assert(browser, 'A local Chromium browser is required')
const cssFile = fs.readdirSync('dist/assets').find(file => /^index-.*\.css$/.test(file))
assert(cssFile, 'Build the application first')
const css = fs.readFileSync(path.join('dist/assets', cssFile), 'utf8')
const root = path.resolve(__dirname, '..'), s = uiFixture(), season = 'Season 1'
const league = leagueCompetition(s.teams, s.matches, season, s.players)
const cup = cupCompetition(s.teams, s.matches, season, s.players)
const fragments = []
for (const scope of ['first-half', 'second-half', 'league', 'cup']) {
  const type = scope === 'cup' ? 'cup' : 'league'
  const state = { ...defaultScreenState({ name: 'competition', competitionType: type }), leagueAwardScope: scope }
  const tree = screenHarness(root, 'screens/CompetitionScreen.tsx', scope === 'cup' ? 'CompetitionBestElevens' : 'LeaguePlayers', s).render({ ...s, season, type, league, cup, champions: null, allMatches: s.matches, screenState: state, onStateChange() {}, onNavigate() {} })
  const race = nodes(tree, node => node.type?.name === 'AwardRacePanel')
  assert.equal(race.length, 1)
  assert(race[0].props.candidates.length > 5)
  const scopeRoute = { name: 'award-race', season, competitionType: type, ...(scope === 'first-half' || scope === 'second-half' ? { awardScope: scope } : {}) }
  const full = screenHarness(root, 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', s).render({ screenState: defaultScreenState(scopeRoute), onStateChange() {}, onNavigate() {}, onBack() {} })
  const preview = screenHarness(root, 'components/AwardRacePanel.tsx', 'AwardRacePanel', s).render(race[0].props)
  assert.deepEqual(nodes(preview, node => node.type?.name === 'AwardRaceRows')[0].props.rows, nodes(full, node => node.type?.name === 'AwardRaceRows')[0].props.rows.slice(0, 5), `${scope}: real-data Top 5 and View All agree`)
  fragments.push([scope, renderToStaticMarkup(tree)], [`${scope}-view-all`, renderToStaticMarkup(full)])
}
const fixtures = [320, 375, 390].flatMap(width => fragments.map(([scope, html]) => `<article data-probe="${scope}" data-width="${width}" style="width:${width}px;padding:16px;box-sizing:border-box">${html}</article>`))
function inspect() {
  const rect = el => el.getBoundingClientRect()
  return [...document.querySelectorAll('article[data-probe]')].map(article => {
    const scope = article.dataset.probe, width = Number(article.dataset.width), errors = []
    const league = article.querySelector('section[aria-label="League Awards"]')
    const area = league || article, tabs = [...area.querySelectorAll('[role="tablist"]')]
    const raceHeadings = [...article.querySelectorAll('h2')].filter(el => el.textContent === 'Award Race')
    const pitches = [...article.querySelectorAll('.pitch-grass')]
    const isFull = scope.endsWith('-view-all')
    if (!isFull) {
      if (raceHeadings.length !== 1) errors.push('Race heading count')
      if (pitches.length !== 1) errors.push('pitch count')
      if (scope !== 'cup') {
        if (!league || tabs.length !== 1) errors.push('League Awards/selector count')
        const buttons = [...(tabs[0]?.querySelectorAll('button') || [])]
        if (buttons.map(el => el.textContent).join('|') !== 'First Half|Second Half|League') errors.push('tab labels')
        const expected = { 'first-half': 'First Half', 'second-half': 'Second Half', league: 'League' }[scope]
        if (buttons.find(el => el.getAttribute('aria-selected') === 'true')?.textContent !== expected) errors.push('selected tab')
        if (new Set(buttons.map(el => rect(el).top)).size !== 1) errors.push('tab rows')
      } else if (tabs.length || /Team of the Stage|Player of the Stage/.test(area.textContent)) errors.push('retired Cup UI')
      if (![...area.querySelectorAll('button')].some(el => el.textContent === 'View All')) errors.push('missing View All')
    }
    for (const pitch of pitches) {
      const cards = [...pitch.children].filter(el => el.tagName === 'BUTTON')
      if (cards.length !== 11) errors.push('XI count')
      for (const card of cards) {
        card.scrollIntoView({ block: 'center' })
        const r = rect(card), p = rect(pitch)
        if (r.left < p.left - 1 || r.right > p.right + 1) errors.push('pitch card clipping')
        if (document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)?.closest('button') !== card) errors.push('pitch hit target')
      }
    }
    if (article.scrollWidth > article.clientWidth + 1) errors.push('horizontal overflow')
    return { scope, width, raceHeadings: raceHeadings.length, pitches: pitches.length, errors }
  })
}
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v266-layout-'))
try {
  const fixture = path.join(tempRoot, 'fixture.html')
  fs.writeFileSync(fixture, `<!doctype html><html><meta charset="utf-8"><style>${css}</style><body style="margin:0;background:#09090b;color:white">${fixtures.join('')}<script>document.body.innerHTML='<pre id="result">'+JSON.stringify((${inspect.toString()})())+'</pre>'</script></body></html>`)
  const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', `--user-data-dir=${path.join(tempRoot, 'profile')}`, '--window-size=1280,960', '--dump-dom', pathToFileURL(fixture).href], { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 32 * 1024 * 1024 })
  assert.equal(result.status, 0, result.stderr || result.error?.message)
  const content = result.stdout.match(/<pre id="result">([\s\S]*?)<\/pre>/)
  assert(content, result.stdout.slice(-1000))
  const cases = JSON.parse(content[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
  const report = { browser: path.basename(browser), stylesheet: cssFile, method: 'Actual isolated Chromium rendering of synthetic real Competition/Race component SSR with built CSS. Handler/navigation tests run separately. No manual full-app, deployed-app or physical-device interaction claim.', cases: cases.length, errors: cases.flatMap(row => row.errors).length, results: cases }
  const output = process.argv[2] || 'docs/performance/v2.6.6-ui.json'
  fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ output, cases: report.cases, errors: report.errors }))
  assert.equal(report.errors, 0, JSON.stringify(cases.filter(row => row.errors.length)))
} finally {
  const resolved = fs.realpathSync(tempRoot), allowed = fs.realpathSync(os.tmpdir()) + path.sep
  assert(resolved.startsWith(allowed) && path.basename(resolved).startsWith('football-v266-layout-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}
