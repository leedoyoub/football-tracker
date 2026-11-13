require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { performance } = require('node:perf_hooks')
const assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineRoot, BASE_SHA } = require('./helpers/v268-baseline.cjs')

const root = path.resolve(__dirname, '..')
const samples = Number(process.env.V268_SAMPLES || 11)
const scales = (process.env.V268_SCALES || '2,6').split(',').map(Number)
const output = process.env.V268_OUTPUT || 'docs/performance/v2.6.8-records.json'
const kinds = ['combination-metrics', 'season-recap']
const summary = values => {
  const sorted = values.slice().sort((a, b) => a - b)
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values }
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const report = {
  baseSha: BASE_SHA,
  node: process.version,
  cpu: os.cpus()[0].model,
  samples,
  method: 'Independent complete git-archive v2.6.7/current modules. Alternating before/after order per sample with independent cloned deterministic fixtures. Separate process per workflow; source loading, fixture creation, JSON hashing and explicit GC are outside timing. CPU engine work only, excludes React/browser rendering. Cold is first selected query; warm repeats unchanged selection; revisit recreates query arguments on the same saved arrays; historical edit immutably removes the first goal of the first-team Season 1 League opener. Combination minutes/PPG switch only Together metric and reuse the same football scope. Recap includes startingXILeaders plus seasonRecap; synthetic completion markers unlock the engine path while fixture competition histories remain unchanged. Each phase result must hash exactly equal to the independent baseline.',
  scales: {},
}
function writeReport(value) {
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, JSON.stringify(value, null, 2) + '\n')
}
function workflow(sourceRoot, kind, state) {
  const source = file => require(path.join(sourceRoot, 'src', file))
  const records = source('screens/recordsLeaderboards.ts')
  const insights = source('engine/seasonInsights.ts')
  const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
  const selected = metric => ['goal-combinations', 'mutual-goal-combinations', 'both-scored', 'both-ga', 'duo-ga', `together:attack:2:${metric}`, 'best-unit:attack:2:goals', 'cb-suppression', 'cb-ga']
  let metric = 'starts'
  const run = () => kind === 'combination-metrics'
    ? records.recordsLeaderboardGroups({ category: 'combination', ...state, states: state.competitionStates, scope: { ...scope }, selectedIds: selected(metric) })
    : insights.seasonRecap(state.players, state.matches, 'Season 1', state.competitionStates, state.teams, insights.startingXILeaders(state.players, state.matches, 'Season 1'))
  return {
    run,
    phases: kind === 'combination-metrics' ? ['cold', 'minutes', 'ppg', 'warm', 'revisit', 'edit'] : ['cold', 'warm', 'revisit', 'edit'],
    prepare(phase) {
      if (phase === 'minutes') metric = 'minutes'
      if (phase === 'ppg') metric = 'ppg'
      if (phase === 'revisit') metric = 'starts'
      if (phase === 'edit') {
        const target = state.matches.findIndex(match => match.season === 'Season 1' && match.competitionType === 'league' && match.teamId === state.teams[0].id)
        assert(target >= 0)
        state.matches = state.matches.map((match, index) => index === target ? { ...match, events: match.events.filter(event => event.id !== match.events.find(item => item.type === 'goal')?.id) } : match)
      }
    },
  }
}

function measure(kind) {
  const archived = baselineRoot()
  // Load/transpile all production source before any timed calculations.
  for (const sourceRoot of [archived, root]) for (const file of ['screens/recordsLeaderboards.ts', 'engine/seasonInsights.ts']) require(path.join(sourceRoot, 'src', file))
  for (const count of scales) {
    const timings = { before: {}, after: {} }
    const hashes = { before: {}, after: {} }
    for (let sample = 0; sample < samples; sample++) {
      const fixture = performanceFixture(count)
      fixture.competitionStates = [...fixture.competitionStates, ...Array.from({ length: count }, (_, index) => ({ id: `bench:complete:${index}`, kind: 'season-complete', season: `Season ${index + 1}` }))]
      const results = {}
      for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        const instance = workflow(side === 'before' ? archived : root, kind, structuredClone(fixture))
        results[side] = {}
        for (const phase of instance.phases) {
          instance.prepare(phase)
          global.gc?.()
          const started = performance.now()
          const value = instance.run()
          const elapsed = performance.now() - started
          ;(timings[side][phase] ??= []).push(elapsed)
          const hash = digest(value)
          ;(hashes[side][phase] ??= []).push(hash)
          results[side][phase] = hash
        }
      }
      assert.deepEqual(results.after, results.before, `${count} seasons ${kind} sample ${sample + 1}: official result hashes must remain identical`)
      console.log(`${count} seasons ${kind}: verified sample ${sample + 1}/${samples}`)
    }
    report.scales[count] = { [kind]: { ...Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(Object.entries(timings[side]).map(([phase, values]) => [phase, { ...summary(values), hashes: hashes[side][phase] }]))])), exactHashes: true } }
    writeReport(report)
  }
}

function main() {
  assert(Number.isInteger(samples) && samples > 0, 'V268_SAMPLES must be positive')
  assert(scales.every(value => Number.isInteger(value) && value > 0), 'V268_SCALES must contain positive season counts')
  if (process.env.V268_RECORDS_ONLY) {
    assert(kinds.includes(process.env.V268_RECORDS_ONLY))
    measure(process.env.V268_RECORDS_ONLY)
    return
  }
  baselineRoot()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v268-records-'))
  try {
    for (const kind of kinds) {
      const childOutput = path.join(temporary, `${kind}.json`)
      execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V268_RECORDS_ONLY: kind, V268_OUTPUT: childOutput }, stdio: 'inherit' })
      const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
      for (const count of scales) report.scales[count] = { ...report.scales[count], ...child.scales[count] }
      writeReport(report)
    }
  } finally {
    const resolved = fs.realpathSync(temporary)
    assert(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('football-v268-records-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}

try { main() } catch (error) { console.error(error); process.exitCode = 1 }
