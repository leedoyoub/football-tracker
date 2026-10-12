require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-targets-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline root')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
function operations(sourceRoot) {
  const source = file => require(path.join(sourceRoot, 'src', file))
  const news = source('engine/news.ts')
  const trend = source('engine/playerRankTrend.ts')
  const sync = sourceModule(sourceRoot, 'lib/sync.ts', { './supabase': { isCloudSyncEnabled: false, getSupabase() { throw new Error('Disabled sync must not access Supabase') } } }).SyncManager
  return {
    'Player milestone projection CPU': s => news.derivePlayerMilestones ? news.derivePlayerMilestones(s.players[9].id, s.players, s.teams, s.matches) : news.deriveNews(s.players, s.teams, s.matches).filter(item => item.playerId === s.players[9].id && item.milestone),
    'Disabled Cloud Sync diff CPU': s => sync.queueStateChange(s, { ...s, draftMatch: { ...s.matches.at(-1), id: 'benchmark-draft' } }),
    'Rank Trend rating CPU': s => trend.playerRankTrend(s.players[9].id, s.players, s.matches, 'Season 2', 'all', 'rating'),
    'Rank Trend GK GA CPU': s => trend.playerRankTrend(s.players[0].id, s.players, s.matches, 'Season 2', 'all', 'goalkeeperGaPer90'),
  }
}
const summary = xs => { const sorted = xs.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(xs.length / 2)], p95Ms: sorted[Math.ceil(xs.length * .95) - 1], samplesMs: xs } }
;(async () => {
  const ops = { before: operations(baseline), after: operations(root) }
  const names = process.env.V259_ONLY ? process.env.V259_ONLY.split('|') : Object.keys(ops.before)
  const samples = Number(process.env.V259_SAMPLES || 7)
  const output = process.env.V259_TARGET_OUTPUT || path.join(root, 'docs/performance/v2.5.9-targets.json')
  const result = { baseSha: '090d6f07d7d9910b41fd1fbb05382dcf0d884258', samples, node: process.version, cpu: os.cpus()[0].model, method: 'paired alternating CPU queries; canonical full News fallback in v2.5.8; Cloud Sync deliberately disabled using the actual queueStateChange implementation', before: {}, after: {} }
  for (const name of names) {
    const values = { before: { cold: [], revisit: [] }, after: { cold: [], revisit: [] } }
    for (let i = 0; i < samples; i++) {
      const s = performanceFixture()
      for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
        let started = performance.now(); await ops[side][name](s); values[side].cold.push(performance.now() - started)
        started = performance.now(); await ops[side][name](s); values[side].revisit.push(performance.now() - started)
      }
      if (global.gc) global.gc()
    }
    for (const side of ['before', 'after']) result[side][name] = { cold: summary(values[side].cold), revisit: summary(values[side].revisit) }
    console.log(`${name}: ${result.before[name].cold.medianMs.toFixed(2)} -> ${result.after[name].cold.medianMs.toFixed(2)} cold; ${result.before[name].revisit.medianMs.toFixed(2)} -> ${result.after[name].revisit.medianMs.toFixed(2)} revisit`)
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  }
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => fs.rmSync(baseline, { recursive: true, force: true }))
