require('./helpers/register-ts.cjs')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { performance } = require('node:perf_hooks')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(process.env.V255_SOURCE_ROOT || path.join(__dirname, '..'))
function makeOperations(sourceRoot) {
const source = file => require(path.join(sourceRoot, 'src', file))
const rating = source('engine/rating.ts')
const stats = source('engine/stats.ts')
const competition = source('engine/competition.ts')
const selectors = source('engine/competitionSelectors.ts')
const positions = source('engine/positionScope.ts')
const records = source('screens/recordsLeaderboards.ts')
const derived = source('engine/playerDerived.ts')
const trend = source('engine/playerRankTrend.ts')
const analytics = source('engine/analytics.ts')
const goalTypes = source('engine/goalTypes.ts')
const seasons = source('engine/seasonAnalytics.ts')
const news = source('engine/news.ts')
const changes = source('engine/matchChangeIndex.ts')
const latest = source('engine/latestChanges.ts')
const { LocalRepository } = source('lib/repository.ts')
const season = 'Season 2'
const filter = { seasons: [season], teams: [], positions: [] }
return {
  'Rating + MOM': s => s.matches.map(m => [rating.rateMatch(m, s.players), rating.getMatchManOfTheMatch(m, s.players)]),
  'Home derivation': s => [news.deriveNews(s.players, s.teams, s.matches, s.competitionStates), latest.deriveLatestChanges(s.players, s.teams, s.matches, s.competitionStates, season)],
  'Teams progress derivation': s => competition.competitionSeasonStatus(s.teams, s.matches, season, s.players, s.competitionStates[1]),
  'Player Detail derivation': s => [derived.derivePlayerScope(s.players[9], s.players, s.matches, { season }), derived.playerPersonalRecords(s.players[9], s.players, s.matches), stats.buildGlobalRankingData(s.players, s.matches, filter, 'rating')],
  'Players history queries': s => s.players.map(p => derived.playerAppearanceMatches(p, s.matches)),
  'Rank Trend': s => trend.playerRankTrend(s.players[9].id, s.players, s.matches, season, 'all'),
  'League derivation': s => selectors.selectLeagueCompetition(s, s.teams, s.matches, season, 0, 0, undefined, s.players),
  'Cup derivation': s => selectors.selectCupCompetition(s, s.teams, s.matches, season, 0, 0, s.players),
  'Champions derivation': s => selectors.selectChampionsCompetition(s, s.competitionStates[1], s.matches, season, 0, s.players),
  'League History derivation': s => seasons.buildSeasonAnalytics(s.teams, s.players, s.matches, season),
  'Global Ranking': s => stats.buildGlobalRankingData(s.players, s.matches, filter, 'rating'),
  'Global Ranking filters': s => stats.buildGlobalRankingData(s.players, s.matches, { ...filter, teams: [s.teams[0].id], positions: ['ST'] }, 'goals'),
  'Records player': s => records.recordsLeaderboardGroups({ category: 'player', ...s, scope: { seasons: [season], teamIds: [], competition: 'all', positionFilter: 'all' } }),
  'Records combination': s => records.recordsLeaderboardGroups({ category: 'combination', ...s, scope: { seasons: [season], teamIds: [], competition: 'all', positionFilter: 'all' }, selectedIds: ['together:attack:2:starts', 'best-unit:attack:3:goals'] }),
  'Chemistry': s => analytics.playerChemistry(s.players[9], s.players, s.matches, { season }),
  'Representative positions': s => [positions.scopedPositionFamilyByPlayer(s.players, s.matches, {}), positions.scopedPositionFamilyByPlayer(s.players, s.matches, { seasons: [season] }), positions.scopedAwardFamilyByPlayer(s.players, s.matches, { seasons: [season] })],
  'Log Match season stats': s => s.players.slice(0, 23).map(p => stats.playerSeasonStats(p, s.players, s.matches, season, s.teams[0].id, 'league')),
  'Goal type queries': s => s.matches.slice(-50).flatMap(m => m.appearances.map(a => goalTypes.goalTypeTotals(m, a.playerId, a.teamId))),
  'Match Detail derivation': s => [rating.rateMatch(s.matches.at(-1), s.players), changes.lookupMatchChanges(s.players, s.teams, s.matches, s.competitionStates, s.matches.at(-1).id)],
  'Draft primary save': async s => {
    const entries = new Map(); global.localStorage = { getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) }
    return LocalRepository.saveAppState({ ...s, draftMatch: { ...s.matches.at(-1), id: 'synthetic-draft' } })
  },
}
}
const operations = makeOperations(root)
const samples = Number(process.env.V255_SAMPLES || 7)
const selected = process.env.V255_ONLY ? process.env.V255_ONLY.split('|') : Object.keys(operations)
const result = { sourceRoot: root, node: process.version, cpu: os.cpus()[0].model, samples, fixture: { teams: 16, rosterSize: 23, seasons: 2, matches: 1152, currentPlayers: 367 }, timings: {} }
const summarize = values => { const sorted = values.slice().sort((a, b) => a - b); return { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], samplesMs: values } }
;(async () => {
  if (process.env.V255_BASELINE_ROOT) {
    const baseline = makeOperations(path.resolve(process.env.V255_BASELINE_ROOT))
    const paired = { ...result, method: 'alternating before/after within each sample; same fixture; isolated module graphs', before: {}, after: {} }
    delete paired.timings
    for (const name of selected) {
      const values = { before: { cold: [], revisit: [] }, after: { cold: [], revisit: [] } }
      for (let i = 0; i < samples; i++) {
        const state = performanceFixture()
        for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
          const run = (side === 'before' ? baseline : operations)[name]
          let started = performance.now(); await run(state); values[side].cold.push(performance.now() - started)
          started = performance.now(); await run(state); values[side].revisit.push(performance.now() - started)
        }
        if (global.gc) global.gc()
      }
      for (const side of ['before', 'after']) paired[side][name] = { cold: summarize(values[side].cold), revisit: summarize(values[side].revisit) }
      console.log(`${name}: ${paired.before[name].cold.medianMs.toFixed(2)} -> ${paired.after[name].cold.medianMs.toFixed(2)}ms cold; ${paired.before[name].revisit.medianMs.toFixed(2)} -> ${paired.after[name].revisit.medianMs.toFixed(2)}ms revisit`)
      if (process.env.V255_OUTPUT) fs.writeFileSync(process.env.V255_OUTPUT, JSON.stringify(paired, null, 2))
    }
    return
  }
  for (const name of selected) {
    const run = operations[name]; if (!run) throw new Error(`Unknown operation ${name}`)
    const cold = []; const warm = []
    for (let i = 0; i < samples; i++) {
      const state = performanceFixture()
      let started = performance.now(); await run(state); cold.push(performance.now() - started)
      started = performance.now(); await run(state); warm.push(performance.now() - started)
      if (global.gc) global.gc()
    }
    result.timings[name] = { cold: summarize(cold), revisit: summarize(warm) }
    console.log(`${name}: cold median ${result.timings[name].cold.medianMs.toFixed(2)}ms, p95 ${result.timings[name].cold.p95Ms.toFixed(2)}ms; revisit ${result.timings[name].revisit.medianMs.toFixed(2)}ms`)
    if (process.env.V255_OUTPUT) fs.writeFileSync(process.env.V255_OUTPUT, JSON.stringify(result, null, 2))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
