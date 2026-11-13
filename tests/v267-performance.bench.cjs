process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
const { renderToStaticMarkup } = require('react-dom/server'), assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..'), sha = process.env.V267_BASE_SHA || 'fc6eab2f6ebd672058692b5f037808d2ffa26a03'
const kinds = process.env.V267_KINDS?.split(',') || ['standings-entry', 'league-overall', 'league-history', 'cup-stage', 'player-overview', 'player-matches', 'editor-input', 'records', 'awards', 'news', 'startup-restore']
const samples = Number(process.env.V267_SAMPLES || 11)
const scales = process.env.V267_SCALES ? process.env.V267_SCALES.split(',').map(Number) : [2, 6]
const output = process.env.V267_OUTPUT || 'docs/performance/v2.6.7-cpu.json'
const summary = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const digest = value => createHash('sha256').update(JSON.stringify(value, (_, item) => item instanceof Map ? { entries: [...item] } : item instanceof Set ? [...item] : item)).digest('hex')
const report = { baseSha: sha, node: process.version, cpu: os.cpus()[0].model, samples, method: 'Alternating independent baseline/current deterministic fixtures; isolated process per workflow, module loading/TypeScript transpilation and fixture creation outside timing; GC outside timing. Cold means first data query, warm unchanged query, Player revisit a new hook lifecycle on the same data, edit immutable removal of latest first-team League goal event and rerun. Real screen functions use deterministic hooks; Player measurements include production React settled SSR. CPU/SSR excludes browser paint and deferred scheduling. Before Player Matches is the original combined detail screen. Existing official result fingerprints must agree for comparable workflows. Sort is a new presentation feature measured separately. No real user data or live cloud.', scales: {} }
if (process.env.V267_BASE_SHA) report.method = 'Alternating independent archived baseline/current deterministic fixtures; isolated process per workflow. Module loading, TypeScript transpilation, fixture creation and GC outside timing. Cold first query, warm unchanged query, Player revisit a new hook lifecycle on same data, edit immutable removal of latest first-team League goal event. Player measurements use production settled SSR (all analysis complete), not initial paint. Other workflows engine CPU only. Comparable official outputs must have identical complete JSON SHA256. Both Player sides have separate Overview/Matches. Browser painting/scheduling/storage I/O are separate measurements. No real user data or live cloud.'
const write = value => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(value, null, 2) + '\n') }
function safeRemove(directory) {
  const resolved = fs.realpathSync(directory), allowed = fs.realpathSync(os.tmpdir()) + path.sep
  assert(resolved.startsWith(allowed) && path.basename(resolved).startsWith('football-v267-'))
  fs.rmSync(resolved, { recursive: true, force: true })
}
function workflow(sourceRoot, kind, state, season) {
  const source = file => require(path.join(sourceRoot, 'src', file))
  const noop = () => {}, nav = source('lib/navigation.ts'), analytics = source('engine/seasonAnalytics.ts'), competition = source('engine/competition.ts')
  const store = { ...state, competitionCacheOwner: {}, competitionRevisions: {}, teamCatalogRevision: 0, saveDraftMatch: noop, clearDraftMatch: noop, saveMatchDurably: noop }
  let revision = 0
  const props = { season, onNavigate: noop, onStateChange: noop, onBack: noop, onComplete: noop, onReplace: noop }
  let h, body, scope, selectors, cupTable, records, awards, news, repository, serialized, latest, recap
  if (kind === 'standings-entry') h = screenHarness(sourceRoot, 'screens/StandingsScreen.tsx', 'StandingsScreen', store)
  if (kind === 'league-overall') { h = screenHarness(sourceRoot, 'screens/CompetitionScreen.tsx', 'LeagueView', store); scope = { ...nav.defaultScreenState({ name: 'competition' }), leagueMenu: 'table' }; selectors = source('engine/competitionSelectors.ts') }
  if (kind === 'cup-stage') cupTable = source('lib/cupTable.ts')
  if (kind.startsWith('player-')) { h = screenHarness(sourceRoot, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', store); scope = { ...nav.defaultScreenState({ name: 'player', id: state.players[9].id }), season, tab: kind === 'player-matches' ? 'matches' : 'overview' } }
  if (kind === 'editor-input') { h = screenHarness(sourceRoot, 'screens/NewMatchScreen.tsx', 'NewMatchScreen', store); body = screenHarness(sourceRoot, 'screens/NewMatchScreen.tsx', 'MatchEditor', store) }
  if (kind === 'records') records = source('screens/recordsLeaderboards.ts')
  if (kind === 'awards') awards = source('engine/officialAwards.ts')
  if (kind === 'news') news = source('engine/news.ts')
  if (kind === 'latest-changes') latest = source('engine/latestChanges.ts')
  if (kind === 'season-recap') recap = source('engine/seasonInsights.ts')
  if (kind === 'startup-restore') { repository = source('lib/repository.ts'); serialized = JSON.stringify(state) }
  return {
    comparable: ['league-history', 'cup-stage', 'records', 'awards', 'news', 'latest-changes', 'season-recap', 'startup-restore'].includes(kind),
    remount() { if (kind.startsWith('player-')) h = screenHarness(sourceRoot, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', store) },
    edit() {
      const last = state.matches.findLastIndex(match => match.teamId === state.teams[0].id && match.season === season && match.competitionType === 'league')
      state.matches = state.matches.map((match, index) => index === last ? { ...match, events: match.events.filter(event => event.id !== match.events.findLast(item => item.type === 'goal')?.id) } : match)
      store.matches = state.matches; revision++
      serialized = JSON.stringify(state)
    },
    async run() {
      if (kind === 'standings-entry') return h.render(props)
      if (kind === 'league-overall') {
        const league = selectors.selectLeagueCompetition(store.competitionCacheOwner, state.teams, state.matches, season, revision, 0, undefined, state.players)
        return h.render({ ...props, ...state, league, screenState: scope })
      }
      if (kind === 'league-history') return analytics.buildLeagueHistory(state.teams, state.players, state.matches, season)
      if (kind === 'cup-stage') {
        const cup = competition.cupCompetition(state.teams, state.matches, season, state.players)
        return ['stage1', cup.stage, 'total', 'stage1'].map(selection => cupTable.cupTableModel(state.teams, state.matches, season, state.players, cup, selection))
      }
      if (kind.startsWith('player-')) return renderToStaticMarkup(h.render({ ...props, playerId: state.players[9].id, screenState: scope }))
      if (kind === 'editor-input') {
        const outer = h.render({ ...props, editingMatchId: state.matches[0].id })
        assert.equal(outer.type.name, 'MatchEditor', 'Synthetic historical match must restore into the real editor')
        let tree = body.render(outer.props)
        const live = () => nodes(tree, node => node.type?.name === 'LiveMatchStep')[0]
        assert(live(), 'Edit mode must expose live event controls')
        live().props.onOpen('conceded'); tree = body.render(outer.props)
        for (const minute of ['4', '45']) { live().props.onMinute(minute); tree = body.render(outer.props) }
        live().props.onCancel(); tree = body.render(outer.props)
        return { liveMinute: live().props.liveMinute }
      }
      if (kind === 'records') return records.recordsLeaderboardGroups({ category: 'player', section: 'performance', ...state, states: state.competitionStates, scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' } })
      if (kind === 'awards') return awards.officialSeasonModel(state.teams, state.players, state.matches, state.competitionStates, season).events
      if (kind === 'news') return news.deriveFootballEvents(state.players, state.teams, state.matches, state.competitionStates)
      if (kind === 'latest-changes') return latest.deriveLatestChanges(state.players, state.teams, state.matches, state.competitionStates, season)
      if (kind === 'season-recap') {
        const leaders = recap.startingXILeaders(state.players, state.matches, season)
        return { recap: recap.seasonRecap(state.players, state.matches, season, state.competitionStates, state.teams, leaders), leaders }
      }
      global.localStorage = { getItem: key => key === 'football-tracker-v1' ? serialized : null }
      return repository.LocalRepository.getAppState()
    },
  }
}
;(async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v267-bench-'))
  try {
    if (!process.env.V267_ONLY) {
      for (const [index, kind] of kinds.entries()) {
        const childOutput = path.join(temporary, `${index}.json`)
        execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V267_ONLY: kind, V267_OUTPUT: childOutput }, stdio: 'inherit' })
        const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
        for (const scale of Object.keys(child.scales)) Object.assign(report.scales[scale] ??= {}, child.scales[scale])
        write(report)
      }
      return
    }
    execFileSync('tar', ['-xf', '-', '-C', temporary], { input: execFileSync('git', ['archive', sha, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
    fs.symlinkSync(path.join(root, 'node_modules'), path.join(temporary, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    const kind = process.env.V267_ONLY
    for (const count of scales) {
      const phases = kind.startsWith('player-') ? ['cold', 'warm', 'revisit', 'edit'] : ['cold', 'warm', 'edit']
      const timings = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(phases.map(phase => [phase, []]))])), sizes = { before: [], after: [] }
      for (let sample = 0; sample < samples; sample++) {
        const fingerprints = {}
        for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
          global.gc?.()
          const state = performanceFixture(count), operation = workflow(side === 'before' ? temporary : root, kind, state, `Season ${count}`)
          fingerprints[side] = {}
          for (const phase of phases) {
            if (phase === 'edit') operation.edit()
            if (phase === 'revisit') operation.remount()
            const start = performance.now(), value = await operation.run(); timings[side][phase].push(performance.now() - start)
            if (operation.comparable) fingerprints[side][phase] = digest(value)
            if (kind.startsWith('player-') && phase === 'cold') sizes[side].push({ bytes: Buffer.byteLength(value), domElements: (value.match(/<[a-z][^/>]*>/g) || []).length })
          }
        }
        assert.deepEqual(fingerprints.after, fingerprints.before, `${kind}: official public results differ`)
      }
      const result = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(Object.entries(timings[side]).map(([phase, values]) => [phase, summary(values)]))]))
      if (kind.startsWith('player-')) result.structure = sizes
      report.scales[count] = { [kind]: result }; write(report)
      console.log(`${count} seasons ${kind}: ${result.before.cold.medianMs.toFixed(2)} -> ${result.after.cold.medianMs.toFixed(2)} cold; ${result.before.warm.medianMs.toFixed(2)} -> ${result.after.warm.medianMs.toFixed(2)} warm; ${result.before.edit.medianMs.toFixed(2)} -> ${result.after.edit.medianMs.toFixed(2)} edit`)
    }
  } finally { safeRemove(temporary) }
})().catch(error => { console.error(error); process.exitCode = 1 })
