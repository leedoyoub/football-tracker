require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { baselineRoot, base, root, work } = require('./helpers/v2611-baseline.cjs')
const samples = Number(process.env.V2611_CPU_SAMPLES || 5)
const workflows = (process.env.V2611_CPU_WORKFLOWS || 'validation,player-all,player-direct,combination,chemistry,changes,recap,home').split(',')
const sides = (process.env.V2611_CPU_SIDES || 'before,after').split(',')
const baseline = baselineRoot()
const output = process.env.V2611_CPU_OUTPUT || path.join(work, 'cpu.json')
const data = { base, node: process.version, cpu: require('node:os').cpus()[0].model, samples, scales: {} }

function workflow(directory, kind, state, years) {
  const source = file => require(path.join(directory, 'src', file + '.ts'))
  const { matches, players, teams, competitionStates } = state
  const season = 'Season ' + years
  if (kind === 'validation') {
    const { validateState } = source('lib/validation')
    return () => {
      assert(validateState(state))
      return true
    }
  }
  if (kind === 'changes') {
    const { buildMatchChangeIndex } = source('engine/matchChangeIndex')
    return () => [...buildMatchChangeIndex(players, teams, matches, competitionStates)]
  }
  if (kind === 'chemistry') {
    const { combinationStats, sortCombinationsByOnPitch } = source('engine/analytics')
    return () => {
      const result = ['duo', 'attack', 'midfield', 'cb', 'fullback', 'backFour'].map(kind => combinationStats(players, matches, { season }, kind))
      return [...result, sortCombinationsByOnPitch(result[0], 'onPitchGA90')]
    }
  }
  if (kind === 'recap') {
    const { seasonRecap, startingXILeaders } = source('engine/seasonInsights')
    return () => {
      const leaders = startingXILeaders(players, matches, season)
      return { leaders, recap: seasonRecap(players, matches, season, competitionStates, teams, leaders) }
    }
  }
  if (kind === 'home') {
    const { deriveFootballEvents } = source('engine/news')
    const { deriveLatestChanges } = source('engine/latestChanges')
    return () => [deriveFootballEvents(players, teams, matches, competitionStates), deriveLatestChanges(players, teams, matches, competitionStates, season)]
  }
  const { recordsLeaderboardGroups } = source('screens/recordsLeaderboards')
  return () => recordsLeaderboardGroups({
    category: kind === 'combination' ? 'combination' : 'player', players, teams, matches,
    scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' },
    selectedIds: kind === 'player-direct' ? ['goals'] : undefined,
  })
}

function summary(values) {
  const sorted = values.slice().sort((a, b) => a - b)
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.ceil(sorted.length * .95) - 1], samples: values }
}

for (const kind of workflows) for (const years of [2, 6]) {
  const cold = Object.fromEntries(sides.map(side => [side, []]))
  const warm = Object.fromEntries(sides.map(side => [side, []]))
  const retained = Object.fromEntries(sides.map(side => [side, []]))
  const hashes = {}
  for (let i = 0; i < samples; i++) for (const side of i % 2 ? sides.slice().reverse() : sides) {
    global.gc?.()
    const run = workflow(side === 'before' ? baseline : root, kind, performanceFixture(years), years)
    global.gc?.()
    const beforeHeap = process.memoryUsage().heapUsed
    const start = performance.now()
    const result = run()
    cold[side].push(performance.now() - start)
    const again = performance.now()
    run()
    warm[side].push(performance.now() - again)
    const hash = createHash('sha256').update(JSON.stringify(result)).digest('hex')
    if (hashes.cold) assert.equal(hash, hashes.cold, `${years} ${kind} ${side}`)
    hashes.cold = hash
    global.gc?.()
    retained[side].push(process.memoryUsage().heapUsed - beforeHeap)
  }
  const result = Object.fromEntries(sides.map(side => [side, { cold: summary(cold[side]), warm: summary(warm[side]), retainedHeapDeltaBytes: retained[side] }]))
  ;(data.scales[years] ??= {})[kind] = { ...result, hash: hashes.cold }
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n')
  console.log(`${years} seasons ${kind}: ${sides.map(side => result[side].cold.median.toFixed(1)).join(' → ')} ms`)
}
