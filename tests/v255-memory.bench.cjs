require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { rateMatch, getMatchManOfTheMatch } = require('../src/engine/rating.ts')
const { combinationStats } = require('../src/engine/analytics.ts')
const { scopedAwardFamilyByPlayer } = require('../src/engine/positionScope.ts')
const { matchesWithPlayerAppearance } = require('../src/engine/playerMatchFacts.ts')
if (!global.gc) throw new Error('Run with node --expose-gc')
const tick = () => new Promise(resolve => setImmediate(resolve))
async function collect() { for (let i = 0; i < 4; i++) { await tick(); global.gc() } }
function exercise() {
  const state = performanceFixture()
  for (const match of state.matches) { rateMatch(match, state.players); getMatchManOfTheMatch(match, state.players) }
  combinationStats(state.players, state.matches, { season: 'Season 2', teamId: state.teams[0].id }, 'duo')
  scopedAwardFamilyByPlayer(state.players, state.matches, {})
  matchesWithPlayerAppearance(state.players[0].id, state.matches)
  return [new WeakRef(state.matches), new WeakRef(state.players)]
}
;(async () => {
  exercise(); await collect() // Exclude module/JIT warm-up from the starting heap.
  const startingHeapBytes = process.memoryUsage().heapUsed
  const refs = []
  for (let i = 0; i < 12; i++) { refs.push(...exercise()); await collect() }
  await collect()
  const result = { node: process.version, snapshots: 12, watchedCollections: refs.length, survivingCollections: refs.filter(ref => ref.deref()).length, startingHeapBytes, finalHeapBytes: process.memoryUsage().heapUsed, caveat: 'Node forced-GC probe of new engine caches; not a browser heap/leak proof or peak-memory measurement.' }
  console.log(JSON.stringify(result, null, 2))
  if (process.env.V255_MEMORY_OUTPUT) fs.writeFileSync(process.env.V255_MEMORY_OUTPUT, JSON.stringify(result, null, 2))
})().catch(error => { console.error(error); process.exitCode = 1 })
