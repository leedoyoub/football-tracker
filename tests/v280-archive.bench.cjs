// Usage: node --expose-gc tests/v280-archive.bench.cjs <v2.7.1 source directory> [samples] [workflows]
// Place the baseline under the repository so both versions resolve the same dependencies.
require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')

const root = path.resolve(__dirname, '..')
assert(process.argv[2] && global.gc, 'Supply v2.7.1 source and use --expose-gc')
const baseline = path.resolve(process.argv[2])
assert.notEqual(baseline, root)
assert.equal(require(path.join(baseline, 'package.json')).version, '2.7.1')
const samples = Number(process.argv[3] ?? 5)
assert(Number.isInteger(samples) && samples > 0)
const allKinds = ['records', 'hall', 'combination', 'team', 'awards', 'ranking', 'player', 'log']
const kinds = process.argv[4]?.split(',') ?? allKinds
assert(kinds.every(kind => allKinds.includes(kind)), `Known workflows: ${allKinds.join(', ')}`)
const noop = () => {}
const controls = { onNavigate: noop, onStateChange: noop, onBack: noop, onReplace: noop, onComplete: noop }

function editHistoricMatch(store, teamId) {
  const index = store.matches.findIndex(match => match.season === 'Season 1' && match.teamId === teamId && match.competitionType === 'league')
  const match = store.matches[index]
  const goal = match.events.find(event => event.type === 'goal' && event.playerId)
  assert(goal)
  const edited = store.matches.slice()
  edited[index] = { ...match, events: match.events.filter(event => event !== goal) }
  return () => { store.matches = edited }
}

function workflow(directory, count, kind) {
  const store = { ...performanceFixture(count), saveMatchDurably: noop, saveDraftMatch: noop, clearDraftMatch: noop }
  const current = directory === root
  const source = name => require(path.join(directory, 'src', name))
  const screen = (name, component = name) => screenHarness(directory, `screens/${name}.tsx`, component, store)
  const { defaultScreenState } = source('lib/navigation.ts')
  const season = `Season ${count}`, teamId = store.teams[0].id, playerId = store.players[9].id
  const props = { ...controls, season, teamId, playerId }
  const withData = () => ({ ...props, ...store, states: store.competitionStates })
  const renderChild = (tree, component, h) => {
    const child = nodes(tree, node => node.type?.name === component)[0]
    assert(child, `Expected ${component} to mount`)
    return h.render(child.props)
  }
  const phases = []
  const add = (label, run) => phases.push({ label, run })

  if (kind === 'records') {
    const screenState = defaultScreenState({ name: 'records' })
    const records = screen('RecordsScreen')
    const previewComponent = current ? 'RankingPreviews' : 'RecordsRankingPreviews'
    const previews = screen('RecordsScreen', previewComponent)
    const edit = editHistoricMatch(store, teamId)
    const run = patch => {
      const next = { ...screenState, ...patch }
      const tree = records.render({ ...props, screenState: next })
      return next.category === 'index' ? tree : renderChild(tree, previewComponent, previews)
    }
    add('Records entry', () => run())
    if (current) add('Players first open', () => run({ category: 'player' }))
    add('Teams switch', () => run({ category: 'team' }))
    add('Players switch back', () => run({ category: 'player' }))
    add('Player competition and season filter', () => run({ category: 'player', competition: 'league', filterSeasonIds: [season] }))
    add('Player records after past edit', () => {
      edit()
      return run({ category: 'player' })
    })
  } else if (kind === 'hall' && current) {
    const hall = screen('HallOfFame')
    const edit = editHistoricMatch(store, teamId)
    const run = panel => hall.render({ ...withData(), panel, onPanel: noop, onCareerPlayer: noop })
    add('Hall of Fame overview', () => run('overview'))
    add('Career Rankings switch', () => run('career'))
    add('Career Rankings after past edit', () => {
      edit()
      return run('career')
    })
  } else if (kind === 'combination' && current) {
    const partnership = screen('PartnershipScreen')
    const view = { name: 'partnership', playerIds: [store.players[8].id, playerId], recordId: 'goal-combinations' }
    const run = () => partnership.render({ view, ...controls })
    add('Combination detail entry', run)
    add('Combination detail unchanged', run)
  } else if (kind === 'team') {
    const overview = screen('TeamDetailScreen')
    const bestPlayers = screen('TeamDetailScreen', 'TeamBestPlayers')
    const screenState = defaultScreenState({ name: 'team', id: teamId })
    const history = screen('TeamHistory')
    add('Team Detail overview', () => renderChild(overview.render({ ...props, screenState }), 'TeamBestPlayers', bestPlayers))
    add('Team History honors entry', () => history.render({ ...withData(), screenState }))
    add('Team History records switch', () => history.render({ ...withData(), screenState: { ...screenState, historyMenu: 'records' } }))
  } else if (kind === 'awards') {
    const { officialAwardsForSeason } = source('engine/officialAwards.ts')
    const run = () => officialAwardsForSeason(store.teams, store.players, store.matches, store.competitionStates, 'Season 1')
    const edit = editHistoricMatch(store, teamId)
    add('Official awards first calculation', run)
    add('Official awards unchanged', run)
    add('Official awards after past edit', () => {
      edit()
      return run()
    })
  } else if (kind === 'ranking') {
    const screenState = defaultScreenState({ name: 'global-ranking', season, competitionType: 'league' })
    const ranking = screen('GlobalRankingScreen')
    const run = metric => ranking.render({ ...props, screenState: { ...screenState, metric } })
    add('Global Ranking rating entry', () => run('rating'))
    add('Global Ranking goals switch', () => run('goals'))
    add('Global Ranking rating switch back', () => run('rating'))
    if (current) add('Global Ranking appearances switch', () => run('appearances'))
  } else if (kind === 'player') {
    const detail = screen('PlayerDetailScreen')
    const overview = screen('PlayerDetailScreen', 'PlayerOverview')
    const screenState = defaultScreenState({ name: 'player', id: playerId })
    add('Player Detail overview', () => renderChild(detail.render({ ...props, screenState }), 'PlayerOverview', overview))
  } else if (kind === 'log') {
    const outer = screen('NewMatchScreen')
    const editor = screen('NewMatchScreen', 'MatchEditor')
    add('Log Match entry', () => {
      const tree = outer.render({ ...controls, requestedSeason: season, teamId })
      assert.equal(tree.type.name, 'MatchEditor')
      return editor.render(tree.props)
    })
  }
  return { phases, matches: store.matches.length, players: store.players.length }
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2
}

function measure(directory, count, kind) {
  const operation = workflow(directory, count, kind)
  if (!operation.phases.length) return null
  // Keep the fixture and mounted hooks reachable across both collections.
  // Otherwise V8 may clear dead local references during the second GC.
  globalThis.footballV280MeasuredOperation = operation
  try {
    global.gc()
    const before = process.memoryUsage().heapUsed
    const timings = operation.phases.map(({ label, run }) => {
      const start = performance.now()
      const value = run()
      const elapsed = performance.now() - start
      assert(value, `${kind}: ${label} did not render a result`)
      return [label, elapsed]
    })
    global.gc()
    return { timings, retainedDeltaBytes: process.memoryUsage().heapUsed - before, matches: operation.matches, players: operation.players }
  } finally {
    delete globalThis.footballV280MeasuredOperation
  }
}

const report = {
  baseline, node: process.version, cpu: os.cpus()[0].model, samples,
  method: 'Separate instances of the same deterministic fixture with alternating side order. Measures screen CPU with mocked hooks and the visible data-producing child, or official awards engine CPU. Past edits remove a credited goal from the Season 1 opener with immutable replacement. Heap delta after explicit GC estimates settled incremental Node heap with the current fixture and models reachable. Results vary with JIT and shared process state.',
  scales: {},
}

for (const count of [2, 6]) {
  const scale = report.scales[count] = { workflows: {} }
  for (const kind of kinds) {
    // Load and transpile modules, and prime compiled code on a separate fixture.
    for (const directory of [baseline, root]) {
      for (const phase of workflow(directory, 1, kind).phases) assert(phase.run())
    }
    const values = { baseline: {}, candidate: {} }, heap = { baseline: [], candidate: [] }
    for (let sample = 0; sample < samples; sample++) {
      const order = sample % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate']
      for (const side of order) {
        const result = measure(side === 'baseline' ? baseline : root, count, kind)
        if (!result) continue
        scale.matches = result.matches
        scale.players = result.players
        for (const [label, elapsed] of result.timings) {
          ;(values[side][label] ??= []).push(elapsed)
        }
        heap[side].push(result.retainedDeltaBytes)
      }
    }
    scale.workflows[kind] = Object.fromEntries(Object.keys(values).map(side => [side, {
      timings: Object.fromEntries(Object.entries(values[side]).map(([label, values]) => [label, { medianMs: median(values), samplesMs: values }])),
      retainedDeltaBytes: heap[side].length ? median(heap[side]) : null,
    }]))
    console.error(`Measured ${count} seasons ${kind}`)
  }
}
console.log(JSON.stringify(report, null, 2))
