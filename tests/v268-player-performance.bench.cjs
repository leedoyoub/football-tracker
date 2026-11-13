process.env.NODE_ENV = 'production'
require('./helpers/register-ts.cjs')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process'), { createHash } = require('node:crypto')
const { performanceFixture } = require('./helpers/v255-fixture.cjs'), { baselineRoot, BASE_SHA } = require('./helpers/v268-baseline.cjs')
const root = path.resolve(__dirname, '..'), kinds = ['detail-ranks', 'ranking-movement', 'rank-trend']
const samples = Number(process.env.V268_SAMPLES || 11), scales = process.env.V268_SCALES ? process.env.V268_SCALES.split(',').map(Number) : [2, 6]
const output = process.env.V268_OUTPUT || path.join(root, 'docs/performance/v2.6.8-player.json')
const report = { baseSha: BASE_SHA, node: process.version, cpu: os.cpus()[0].model, samples, method: 'Independent archived v2.6.7/current modules; independent deterministic fixtures, alternating side order per sample; isolated child per operation. Fixture creation, module loading and GC outside timing. Engine CPU only, no SSR/browser rendering. Cold first query, warm identical query, metric switches Rating to Goals for Rank Trend, revisit requests Rating again on the same source arrays (engine reuse, not a React remount), edit replaces latest first-team league match removing its last goal via new array and requests original Rating. Every phase compares complete public results with SHA256 (Map/Set order retained).', scales: {} }
const digest = value => createHash('sha256').update(JSON.stringify(value, (_, item) => item instanceof Map ? { entries: [...item] } : item instanceof Set ? [...item] : item)).digest('hex')
const summary = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
const write = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n') }
function workflow(sourceRoot, kind, state, season, baseline) {
  const source = file => require(path.join(sourceRoot, 'src/engine', file + '.ts'))
  const ranks = source('playerDetailRanks'), trend = source('playerRankTrend'), analytics = source('seasonAnalytics'), scope = source('playerDetailScope')
  const playerId = state.players[9].id
  return {
    edit() {
      const index = state.matches.findLastIndex(match => match.teamId === state.teams[0].id && match.season === season && match.competitionType === 'league')
      state.matches = state.matches.map((match, i) => i === index ? { ...match, events: match.events.filter(event => event.id !== match.events.findLast(event => event.type === 'goal')?.id) } : match)
    },
    run(phase) {
      if (kind === 'detail-ranks') {
        const value = ranks.playerDetailRankingScope(state.players, state.matches, season, 'all')
        return { ranks: value.ranksFor(playerId, scope.latestAppearanceTeamId(playerId, value.games)), families: value.families }
      }
      if (kind === 'rank-trend') return trend.playerRankTrend(playerId, state.players, state.matches, season, 'all', phase === 'metric' ? 'goals' : 'rating')
      const snapshots = baseline ? analytics.buildSeasonAnalytics(state.teams, state.players, state.matches, season) : analytics.currentPlayerRankingSnapshots(state.players, state.matches, season)
      const current = baseline ? snapshots.playerSnapshots.get(snapshots.currentMatchDay) : snapshots.current, previous = baseline ? snapshots.playerSnapshots.get(snapshots.currentMatchDay - 1) : snapshots.previous
      return { current, previous, movement: new Map(['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom'].map(metric => [metric, analytics.rankingMovement(current, previous, metric)])) }
    },
  }
}
if (!process.env.V268_PLAYER_ONLY) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v268-player-'))
  try {
    for (const kind of kinds) {
      const childOutput = path.join(directory, kind + '.json')
      execFileSync(process.execPath, ['--expose-gc', __filename], { cwd: root, env: { ...process.env, V268_PLAYER_ONLY: kind, V268_OUTPUT: childOutput }, stdio: 'inherit' })
      const child = JSON.parse(fs.readFileSync(childOutput, 'utf8'))
      for (const [scale, operations] of Object.entries(child.scales)) Object.assign(report.scales[scale] ??= {}, operations)
      write()
    }
  } finally {
    const resolved = fs.realpathSync(directory), allowed = fs.realpathSync(os.tmpdir()) + path.sep
    assert(resolved.startsWith(allowed) && path.basename(resolved).startsWith('football-v268-player-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  }
} else {
  const kind = process.env.V268_PLAYER_ONLY
  assert(kinds.includes(kind))
  const baseline = baselineRoot()
  for (const count of scales) {
    const phases = ['cold', 'warm', ...(kind === 'rank-trend' ? ['metric'] : []), 'revisit', 'edit']
    const timings = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(phases.map(phase => [phase, []]))]))
    for (let sample = 0; sample < samples; sample++) {
      const fingerprints = {}
      for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
        global.gc?.()
        const state = performanceFixture(count), operation = workflow(side === 'before' ? baseline : root, kind, state, `Season ${count}`, side === 'before')
        fingerprints[side] = {}
        for (const phase of phases) {
          if (phase === 'edit') operation.edit()
          const started = performance.now(), value = operation.run(phase)
          timings[side][phase].push(performance.now() - started)
          fingerprints[side][phase] = digest(value)
        }
      }
      assert.deepEqual(fingerprints.after, fingerprints.before, `${count} seasons ${kind}: public results differ`)
    }
    const result = Object.fromEntries(['before', 'after'].map(side => [side, Object.fromEntries(Object.entries(timings[side]).map(([phase, values]) => [phase, summary(values)]))]))
    report.scales[count] = { [kind]: result }; write()
    console.log(`${count} seasons ${kind}: cold ${result.before.cold.medianMs.toFixed(2)} -> ${result.after.cold.medianMs.toFixed(2)} ms; edit ${result.before.edit.medianMs.toFixed(2)} -> ${result.after.edit.medianMs.toFixed(2)} ms`)
  }
}
