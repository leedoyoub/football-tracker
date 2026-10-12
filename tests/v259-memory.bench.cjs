require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
if (!global.gc) throw new Error('Run with --expose-gc')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-memory-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline path')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const collect = async () => { for (let i = 0; i < 4; i++) { await new Promise(resolve => setImmediate(resolve)); global.gc() } }
function operations(sourceRoot) {
  const source = file => require(path.join(sourceRoot, 'src', file))
  return {
    'Global Ranking query scopes': (s, i) => source('engine/stats.ts').buildGlobalRankingData(s.players, s.matches, { seasons: ['Season 1'], teams: teamIds(s, i), positions: [] }, 'rating'),
    'Rank Trend player scopes': (s, i) => source('engine/playerRankTrend.ts').playerRankTrend(s.players[i].id, s.players, s.matches, 'Season 1', 'all', 'rating'),
    'Player Derived scopes': (s, i) => source('engine/playerDerived.ts').derivePlayerScope(s.players[9], s.players, s.matches, { season: 'Season 1', teamIds: teamIds(s, i) }),
    'Player Records scopes': (s, i) => source('engine/playerRecords.ts').buildPlayerRecordLeaderboards(s.players, s.matches, { seasons: ['Season 1'], teamIds: teamIds(s, i) }),
  }
}
function teamIds(s, mask) { return [s.teams[0].id, ...s.teams.slice(1, 8).filter((_, i) => mask & (1 << i)).map(team => team.id)] }
;(async () => {
  const queries = Number(process.env.V259_MEMORY_QUERIES || 128)
  const samples = Number(process.env.V259_MEMORY_SAMPLES || 3)
  const output = process.env.V259_MEMORY_OUTPUT || path.join(root, 'docs/performance/v2.5.9-memory.json')
  const ops = { before: operations(baseline), after: operations(root) }
  let warm = performanceFixture(1); warm.matches = []
  for (const side of ['before', 'after']) for (const run of Object.values(ops[side])) run(warm, 0)
  warm = null; await collect()
  const result = { baseSha: '090d6f07d7d9910b41fd1fbb05382dcf0d884258', queries, samples, node: process.version, caveat: 'Forced-GC Node probe of active-snapshot query retention, not browser heap, peak memory or a universal leak proof. Fixture is intentionally restricted to64 matches to isolate cached query objects.', before: {}, after: {} }
  for (const name of Object.keys(ops.before)) {
    for (const side of ['before', 'after']) result[side][name] = []
    for (let sample = 0; sample < samples; sample++) for (const side of sample % 2 ? ['after', 'before'] : ['before', 'after']) {
      const s = performanceFixture(1); s.matches = s.matches.slice(0, 64)
      global.__v259MemoryFixture = s // Keep only the active snapshot, not query results, alive across GC.
      await collect(); const startingHeapBytes = process.memoryUsage().heapUsed
      const references = []
      for (let i = 0; i < queries; i++) references.push(new WeakRef(ops[side][name](s, i)))
      await collect()
      const finalHeapBytes = process.memoryUsage().heapUsed
      result[side][name].push({ retainedResults: references.filter(ref => ref.deref()).length, startingHeapBytes, finalHeapBytes, retainedHeapDeltaBytes: finalHeapBytes - startingHeapBytes })
      delete global.__v259MemoryFixture
      await collect()
    }
    console.log(`${name}: ${result.before[name].map(x => x.retainedResults).join(',')} -> ${result.after[name].map(x => x.retainedResults).join(',')} retained query results`)
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
  }
  const exerciseDroppedSnapshot = () => {
    const s = performanceFixture(1); s.matches = s.matches.slice(0, 64)
    for (const run of Object.values(ops.after)) for (let i = 0; i < 16; i++) run(s, i)
    require(path.join(root, 'src/engine/news.ts')).derivePlayerMilestones(s.players[9].id, s.players, s.teams, s.matches, s.competitionStates)
    return [s.matches, s.players, s.teams, s.competitionStates].map(value => new WeakRef(value))
  }
  const dropped = []
  for (let i = 0; i < 12; i++) { dropped.push(...exerciseDroppedSnapshot()); await collect() }
  await collect()
  result.releasedSnapshots = { snapshots: 12, watchedCollections: dropped.length, survivingCollections: dropped.filter(ref => ref.deref()).length }
  console.log(`Released snapshots: ${result.releasedSnapshots.survivingCollections}/${dropped.length} collections retained`)
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
})().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => { delete global.__v259MemoryFixture; fs.rmSync(baseline, { recursive: true, force: true }) })
