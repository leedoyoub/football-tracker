require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const { renderToStaticMarkup } = require('react-dom/server')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-workflows-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline root')
const archive = execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 })
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const summarize = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
function operations(sourceRoot, s) {
  const source = file => require(path.join(sourceRoot, 'src', file))
  const navigation = source('lib/navigation.ts')
  const store = { ...s, competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0, saveDraftMatch() {}, saveMatchDurably() {}, clearDraftMatch() {} }
  const noop = () => {}
  const props = { season: 'Season 2', onNavigate: noop, onStateChange: noop, onBack: noop, onBackToTeam: noop, onReplace: noop, onComplete: noop }
  const screen = (file, name, view, extra = {}) => {
    const h = screenHarness(sourceRoot, `screens/${file}.tsx`, name, store)
    const p = { ...props, screenState: navigation.defaultScreenState(view), ...extra }
    return () => h.render(p)
  }
  const players = screenHarness(sourceRoot, 'screens/PlayersScreen.tsx', 'PlayersScreen', store)
  const playerState = navigation.defaultScreenState({ name: 'players' })
  const seasonFilters = { seasons: ['Season 2'], teams: [], positions: [] }
  const search = filtered => () => {
    for (const query of ['S', 'Sy', 'Syn', 'Synthetic', 'Synthetic england', 'Synthetic 0', '']) players.render({ ...props, screenState: { ...playerState, search: query, filters: filtered ? seasonFilters : playerState.filters } })
  }
  const results = screen('ResultsScreen', 'ResultsScreen', { name: 'results' })
  const editor = screenHarness(sourceRoot, 'screens/NewMatchScreen.tsx', 'NewMatchScreen', store)
  const editorBody = screenHarness(sourceRoot, 'screens/NewMatchScreen.tsx', 'MatchEditor', store)
  const logMatch = () => { const node = editor.render({ ...props, teamId: s.teams[0].id, requestedSeason: 'Season 2' }); return typeof node.type === 'function' && node.type.name === 'MatchEditor' ? editorBody.render(node.props) : node }
  const rankings = screen('GlobalRankingScreen', 'GlobalRankingScreen', { name: 'global-ranking', season: 'Season 2' })
  const season = kind => screen('SeasonHighlightScreen', 'SeasonHighlightScreen', { name: 'season-highlight', season: 'Season 2', kind }, { kind })
  const homeSettled = screen('HomeScreen', 'HomeScreen', { name: 'home' })
  const playerSettled = screen('PlayerDetailScreen', 'PlayerDetailScreen', { name: 'player', id: s.players[9].id }, { playerId: s.players[9].id })
  return {
    'Home screen CPU': screen('HomeScreen', 'HomeScreen', { name: 'home' }),
    'Teams logo screen CPU': screen('TeamsScreen', 'TeamsScreen', { name: 'teams' }),
    'Players continuous search CPU': search(false),
    'Players season search CPU': search(true),
    'Team Overview CPU': screen('TeamDetailScreen', 'TeamDetailScreen', { name: 'team', id: s.teams[0].id }, { teamId: s.teams[0].id }),
    'Player Detail first screen CPU': screen('PlayerDetailScreen', 'PlayerDetailScreen', { name: 'player', id: s.players[9].id }, { playerId: s.players[9].id }),
    'Home settled SSR CPU': () => renderToStaticMarkup(homeSettled()),
    'Player Detail settled SSR CPU': () => renderToStaticMarkup(playerSettled()),
    'Season Highlight News CPU': season('news'),
    'Season Highlight Monthly CPU': season('monthly'),
    'Season Highlight Review CPU': season('review'),
    'Global Ranking screen CPU': rankings,
    'Match Facts CPU': screen('MatchDetailScreen', 'MatchDetailScreen', { name: 'match', id: s.matches.at(-1).id }, { matchId: s.matches.at(-1).id }),
    'Log Match mount CPU': logMatch,
    'Results SSR CPU': () => { const html = renderToStaticMarkup(results()); return { bytes: Buffer.byteLength(html), domNodes: (html.match(/<[a-z][^/>]*>/g) ?? []).length } },
    'Cup Stage transitions CPU': () => {
      const cup = source('engine/competitionSelectors.ts').selectCupCompetition(store.competitionCacheOwner, s.teams, s.matches, 'Season 2', 0, 0, s.players)
      const table = source('lib/cupTable.ts')
      return ['stage1', cup.stage, 'total', 'stage1', cup.stage].map(selection => table.cupTableModel(s.teams, s.matches, 'Season 2', s.players, cup, selection))
    },
    'Startup local primary restore CPU': async () => {
      const value = JSON.stringify(s)
      global.localStorage = { getItem: key => key === 'football-tracker-v1' ? value : null }
      return source('lib/repository.ts').LocalRepository.getAppState()
    },
  }
}
;(async () => {
  const names = process.env.V259_ONLY ? process.env.V259_ONLY.split('|') : Object.keys(operations(root, performanceFixture()))
  const samples = Number(process.env.V259_SAMPLES || 7)
  const output = process.env.V259_WORKFLOW_OUTPUT || path.join(root, 'docs/performance/v2.5.9-workflows.json')
  const evidence = { baseSha: '090d6f07d7d9910b41fd1fbb05382dcf0d884258', node: process.version, cpu: os.cpus()[0].model, samples, method: 'alternating independent baseline/current graphs; real screen functions with deterministic hook lifecycle; SSR is server rendering, not browser commit/paint', before: {}, after: {} }
  // Keep one workflow's module graph/JIT lifetime per process. The aggregate
  // runner otherwise accumulates test harness modules until Node's heap limit.
  if (!process.env.V259_ONLY) {
    evidence.isolatedProcessPerWorkflow = true
    for (const [index, name] of names.entries()) {
      const childOutput = path.join(baseline, `workflow-${index}.json`)
      execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V259_ONLY: name, V259_WORKFLOW_OUTPUT: childOutput }, stdio: 'inherit' })
      const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
      Object.assign(evidence.before, child.before); Object.assign(evidence.after, child.after)
      if (child.resultsStructure) evidence.resultsStructure = child.resultsStructure
      fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
    }
    return
  }
  for (const name of names) {
    const values = { before: { cold: [], revisit: [] }, after: { cold: [], revisit: [] } }
    for (let i = 0; i < samples; i++) {
      const s = performanceFixture()
      const ops = { before: operations(baseline, s), after: operations(root, s) }
      for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
        let started = performance.now(); const result = await ops[side][name](); values[side].cold.push(performance.now() - started)
        if (name === 'Results SSR CPU') evidence.resultsStructure = result
        started = performance.now(); await ops[side][name](); values[side].revisit.push(performance.now() - started)
      }
      if (global.gc) global.gc()
    }
    for (const side of ['before', 'after']) evidence[side][name] = { cold: summarize(values[side].cold), revisit: summarize(values[side].revisit) }
    console.log(`${name}: ${evidence.before[name].cold.medianMs.toFixed(2)} -> ${evidence.after[name].cold.medianMs.toFixed(2)} cold; ${evidence.before[name].revisit.medianMs.toFixed(2)} -> ${evidence.after[name].revisit.medianMs.toFixed(2)} revisit`)
    fs.writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
  }
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(baseline, { recursive: true, force: true }))
