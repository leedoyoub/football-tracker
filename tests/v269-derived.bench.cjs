process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineRoot, BASE_SHA } = require('./v269-derived-baseline.cjs')
const root = path.resolve(__dirname, '..'), beforeRoot = baselineRoot()
const samples = Number(process.env.V269_DERIVED_SAMPLES || 11)
const scales = (process.env.V269_DERIVED_SCALES || '2,6').split(',').map(Number)
const kinds = (process.env.V269_DERIVED_KINDS || 'news,latest-changes,season-recap').split(',')
const output = process.env.V269_DERIVED_OUTPUT || 'docs/performance/v2.6.9-derived.json'
const phases = ['cold', 'warm', 'revisit', 'selection', 'edit']
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const summary = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const report = { baseSha: BASE_SHA, node: process.version, cpu: os.cpus()[0].model, samples,
  method: 'Engine CPU only. Unchanged v255 deterministic 2/6-season fixtures; independent archived complete baseline source. Alternating before/after, isolated process per workflow; module loading, transpilation, fixture creation and explicit GC outside timing. Cold is first query; warm and revisit are unchanged queries from the same source references (a new consumer has no engine-local state). Selection changes News ranking/performance options or Latest Changes/Recap season to Season 1. Edit immutably removes the latest selected-season first-team League goal and returns to original selection. Every phase compares the complete JSON SHA256. No SSR, browser paint, storage I/O or live data.', scales: {} }
const write = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n') }

function workflow(directory, kind, state, season) {
  const source = file => require(path.join(directory, 'src/engine', file + '.ts'))
  const api = source(kind === 'news' ? 'news' : kind === 'latest-changes' ? 'latestChanges' : 'seasonInsights')
  return {
    edit() {
      const index = state.matches.findLastIndex(match => match.teamId === state.teams[0].id && match.season === season && match.competitionType === 'league')
      const selected = state.matches[index], goal = selected.events.findLast(event => event.type === 'goal')
      state.matches = state.matches.map((match, at) => at === index ? { ...match, events: match.events.filter(event => event.id !== goal?.id) } : match)
    },
    run(selection = false) {
      const args = [state.players, state.teams, state.matches, state.competitionStates]
      if (kind === 'news') return api.deriveFootballEvents(...args, selection ? { includeAllRanking: true, includeMatchPerformance: false } : undefined)
      const selectedSeason = selection ? 'Season 1' : season
      if (kind === 'latest-changes') return api.deriveLatestChanges(...args, selectedSeason)
      const leaders = api.startingXILeaders(state.players, state.matches, selectedSeason)
      return { recap: api.seasonRecap(state.players, state.matches, selectedSeason, state.competitionStates, state.teams, leaders), leaders }
    },
  }
}

if (!process.env.V269_DERIVED_ONLY) {
  for (const kind of kinds) {
    const child = path.join(root, '.superpowers/sdd/v269', `derived-bench-${kind}.json`)
    execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V269_DERIVED_ONLY: kind, V269_DERIVED_OUTPUT: child }, stdio: 'inherit' })
    const result = JSON.parse(fs.readFileSync(child, 'utf8'))
    for (const scale of Object.keys(result.scales)) Object.assign(report.scales[scale] ??= {}, result.scales[scale])
    write()
  }
} else {
  const kind = process.env.V269_DERIVED_ONLY
  for (const count of scales) {
    const timings = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(phases.map(phase => [phase, []]))]))
    const fingerprints = []
    // Load each complete module graph before the first measured operation.
    for (const directory of [beforeRoot, root]) workflow(directory, kind, performanceFixture(count), `Season ${count}`)
    for (let sample = 0; sample < samples; sample++) {
      const hashes = {}
      for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        global.gc?.()
        const operation = workflow(side === 'before' ? beforeRoot : root, kind, performanceFixture(count), `Season ${count}`)
        hashes[side] = {}
        for (const phase of phases) {
          if (phase === 'edit') operation.edit()
          const start = performance.now(), value = operation.run(phase === 'selection')
          timings[side][phase].push(performance.now() - start)
          hashes[side][phase] = digest(value)
        }
      }
      assert.deepEqual(hashes.after, hashes.before, `${count} seasons ${kind}: complete outputs differ`)
      fingerprints.push(hashes.after)
    }
    const result = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(phases.map(phase => [phase, summary(timings[side][phase])]))]))
    result.fingerprints = fingerprints
    report.scales[count] = { [kind]: result }; write()
    console.log(`${count} seasons ${kind}: cold ${result.before.cold.medianMs.toFixed(2)} -> ${result.after.cold.medianMs.toFixed(2)}ms; edit ${result.before.edit.medianMs.toFixed(2)} -> ${result.after.edit.medianMs.toFixed(2)}ms; complete phase outputs identical`)
  }
}
