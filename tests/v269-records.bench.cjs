require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const { createHash } = require('node:crypto')
const assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineRoot, BASE_SHA } = require('./helpers/v269-records-baseline.cjs')
const root = path.resolve(__dirname, '..')
const samples = Number(process.env.V269_RECORDS_SAMPLES || 11)
const scales = (process.env.V269_RECORDS_SCALES || '2,6').split(',').map(Number)
const output = process.env.V269_RECORDS_OUTPUT || 'docs/performance/v2.6.9-records.json'
const kinds = (process.env.V269_RECORDS_KINDS || 'player-all,player-direct,combination-all,combination-metrics').split(',')
const summary = values => {
  const sorted = values.slice().sort((a, b) => a - b)
  return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values }
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const report = { baseSha: BASE_SHA, node: process.version, cpu: os.cpus()[0].model, samples, method: 'Independent complete git-archive v2.6.8/current modules, unchanged v255 2/6-season fixtures, one isolated process per workflow, alternating before/after sample order. Transpilation, deterministic fixture creation/cloning, hashing and explicit GC excluded from timings. CPU engine only. Cold requests the entire catalog or a single player goals/combination attack-pair starts leaderboard. Warm/revisit reuse saved array identity; metric switches to assists/minutes; player team selection measures a display projection of full official ranks on both versions, preserving intentional v2.6.9 semantics for exact comparisons; position selects ST/SS. Edit removes the first goal in the Season 1 League opener with immutable match replacement. All returned rows, ranks, strings and catalog order are SHA-256 compared, including complete unfiltered catalogs.', scales: {} }

function writeReport(value) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(value, null, 2) + '\n') }

function workflow(sourceRoot, kind, state) {
  const records = require(path.join(sourceRoot, 'src/screens/recordsLeaderboards.ts'))
  const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
  let metric = kind === 'player-direct' ? ['goals'] : kind === 'combination-metrics' ? ['together:attack:2:starts'] : undefined
  const category = kind.startsWith('player') ? 'player' : 'combination'
  let teamIds = []
  return {
    phases: category === 'player' ? ['cold', 'warm', 'revisit', 'metric', 'team', 'position', 'edit'] : ['cold', 'warm', 'revisit', 'metric', 'edit'],
    prepare(phase) {
      if (phase === 'metric') metric = category === 'player' ? ['assists'] : ['together:attack:2:minutes']
      if (phase === 'team') teamIds = state.teams.slice(0, 2).map(team => team.id)
      if (phase === 'position') scope.positionFilter = 'st-ss'
      if (phase === 'edit') {
        const target = state.matches.findIndex(match => match.season === 'Season 1' && match.competitionType === 'league' && match.teamId === state.teams[0].id)
        assert(target >= 0)
        state.matches = state.matches.map((match, index) => index === target ? { ...match, events: match.events.filter(event => event.id !== match.events.find(item => item.type === 'goal')?.id) } : match)
      }
    },
    run() {
      // The archived release narrowed player totals by team. Give both engines
      // the same official population and include display filtering in timing.
      const result = records.recordsLeaderboardGroups({ category, ...state, scope: { ...scope, teamIds: sourceRoot === root ? teamIds : [] }, selectedIds: metric })
      if (!teamIds.length || sourceRoot === root) return result
      const ids = new Set(state.matches.filter(match => !scope.seasons.length || scope.seasons.includes(match.season)).flatMap(match => match.appearances.filter(row => teamIds.includes(row.teamId)).map(row => row.playerId)))
      return result.map(group => ({ ...group, rows: group.rows.filter(row => ids.has(row.id)) }))
    },
  }
}

function measure(kind) {
  const archived = baselineRoot()
  for (const sourceRoot of [archived, root]) require(path.join(sourceRoot, 'src/screens/recordsLeaderboards.ts'))
  for (const count of scales) {
    const timings = { before: {}, after: {} }, hashes = { before: {}, after: {} }, heaps = { before: {}, after: {} }
    for (let sample = 0; sample < samples; sample++) {
      const fixture = performanceFixture(count), results = {}
      for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        const instance = workflow(side === 'before' ? archived : root, kind, structuredClone(fixture))
        results[side] = {}
        for (const phase of instance.phases) {
          instance.prepare(phase); global.gc?.()
          const started = performance.now(), value = instance.run(), elapsed = performance.now() - started
          ;(timings[side][phase] ??= []).push(elapsed)
          global.gc?.()
          ;(heaps[side][phase] ??= []).push(process.memoryUsage().heapUsed)
          const hash = digest(value)
          ;(hashes[side][phase] ??= []).push(hash)
          results[side][phase] = hash
        }
      }
      assert.deepEqual(results.after, results.before, `${count} seasons ${kind} sample ${sample + 1}`)
      console.log(`${count} seasons ${kind}: verified sample ${sample + 1}/${samples}`)
    }
    report.scales[count] = { [kind]: { ...Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(Object.entries(timings[side]).map(([phase, values]) => [phase, { ...summary(values), retainedProcessHeapBytes: heaps[side][phase], hashes: hashes[side][phase] }]))])), exactHashes: true } }
    writeReport(report)
  }
}

function main() {
  assert(Number.isInteger(samples) && samples > 0)
  assert(scales.every(count => Number.isInteger(count) && count > 0))
  if (process.env.V269_RECORDS_ONLY) { assert(kinds.includes(process.env.V269_RECORDS_ONLY)); measure(process.env.V269_RECORDS_ONLY); return }
  baselineRoot()
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v269-records-'))
  try {
    for (const kind of kinds) {
      const childOutput = path.join(temporary, `${kind}.json`)
      execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V269_RECORDS_ONLY: kind, V269_RECORDS_OUTPUT: childOutput }, stdio: 'inherit' })
      const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
      for (const count of scales) report.scales[count] = { ...report.scales[count], ...child.scales[count] }
      writeReport(report)
    }
  } finally {
    const resolved = fs.realpathSync(temporary)
    assert(resolved.startsWith(fs.realpathSync(os.tmpdir()) + path.sep) && path.basename(resolved).startsWith('football-v269-records-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}
try { main() } catch (error) { console.error(error); process.exitCode = 1 }
