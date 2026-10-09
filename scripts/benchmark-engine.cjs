const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  module._compile(output, filename)
}

const root = path.resolve(__dirname, '..')
const fromRoot = relative => require(path.join(root, 'src', relative))
const { playerSeasonStats, buildGlobalRankingData, clearGlobalRankingCache } = fromRoot('engine/stats.ts')
const { combinationStats } = fromRoot('engine/analytics.ts')
const { leagueCompetition } = fromRoot('engine/competition.ts')
const { buildSeasonAnalytics } = fromRoot('engine/seasonAnalytics.ts')
const { seasonAwards } = fromRoot('engine/awards.ts')

const formations = [
  ['GK', 'GK'], ['LB', 'LB'], ['LCB', 'CB'], ['RCB', 'CB'], ['RB', 'RB'],
  ['CDM', 'CDM'], ['CM', 'CM'], ['CAM', 'CAM'], ['LW', 'LW'], ['ST', 'ST'], ['RW', 'RW'],
]
const teams = Array.from({ length: 16 }, (_, index) => ({
  id: `team-${index + 1}`, name: `Club ${index + 1}`, shortName: `C${index + 1}`,
  abbreviation: `C${index + 1}`, visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white',
}))
const players = teams.flatMap(team => formations.map(([slot, position], index) => ({
  id: `${team.id}-${slot}`, teamId: team.id, teamIds: [team.id], name: `${team.name} ${slot}`,
  position, number: index + 1, rating: 80,
})))

function schedule() {
  const order = teams.map(team => team.id)
  const rounds = []
  for (let day = 1; day <= 30; day++) {
    const games = []
    for (let index = 0; index < 8; index++) {
      let homeTeamId = order[index]
      let awayTeamId = order[15 - index]
      if (day > 15) [homeTeamId, awayTeamId] = [awayTeamId, homeTeamId]
      games.push({ homeTeamId, awayTeamId, matchDay: day })
    }
    rounds.push(games)
    const fixed = order[0]
    const rotating = order.slice(1)
    rotating.unshift(rotating.pop())
    order.splice(0, order.length, fixed, ...rotating)
  }
  return rounds.flat()
}

const fixtures = schedule()
function makeMatches(count) {
  return Array.from({ length: count }, (_, index) => {
    const seasonIndex = Math.floor(index / fixtures.length)
    const fixture = fixtures[index % fixtures.length]
    const season = `Season ${seasonIndex + 1}`
    const appearances = formations.map(([slot, position]) => ({
      playerId: `${fixture.homeTeamId}-${slot}`, teamId: fixture.homeTeamId,
      position, matchPosition: slot, role: 'starter',
    }))
    const homeGoals = index % 4 === 0 ? 2 : index % 3 === 0 ? 0 : 1
    const awayGoals = index % 5 === 0 ? 2 : index % 2
    const events = [
      ...Array.from({ length: homeGoals }, (_, goal) => ({
        id: `event-${index}-h-${goal}`, type: 'goal', minute: 14 + goal * 20,
        teamId: fixture.homeTeamId, playerId: `${fixture.homeTeamId}-ST`,
      })),
      ...Array.from({ length: awayGoals }, (_, goal) => ({
        id: `event-${index}-a-${goal}`, type: 'goal', minute: 28 + goal * 25,
        teamId: fixture.awayTeamId,
      })),
    ]
    return {
      id: `match-${index + 1}`, season, competitionType: 'league', competitionStage: 'regular',
      matchDay: fixture.matchDay, date: `202${seasonIndex}-01-${String(fixture.matchDay).padStart(2, '0')}`,
      homeTeamId: fixture.homeTeamId, awayTeamId: fixture.awayTeamId, teamId: fixture.homeTeamId,
      duration: 90, halftimeOpponentSot: 2, fulltimeOpponentSot: 4, appearances, events,
    }
  })
}

function digest(value) {
  return require('node:crypto').createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
function elapsed(fn) {
  const start = process.hrtime.bigint()
  const result = fn()
  return { ms: Number(process.hrtime.bigint() - start) / 1e6, result }
}
function summarize(value) {
  if (Array.isArray(value)) return { length: value.length, hash: digest(value) }
  return { hash: digest(value) }
}
function measure(label, fn, rounds = 3) {
  const times = []
  let output
  for (let index = 0; index < rounds; index++) {
    if (global.gc) global.gc()
    const sample = elapsed(fn)
    times.push(sample.ms)
    output = summarize(sample.result)
  }
  const sorted = times.slice().sort((a, b) => a - b)
  return { label, medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)), minMs: Number(sorted[0].toFixed(2)), maxMs: Number(sorted.at(-1).toFixed(2)), output }
}

function benchmark(size) {
  const matches = makeMatches(size)
  const season = matches.at(-1)?.season ?? 'Season 1'
  const teamAppearances = new Map()
  for (const match of matches) teamAppearances.set(`${match.season}:${match.teamId}`, (teamAppearances.get(`${match.season}:${match.teamId}`) ?? 0) + 1)
  if ([...teamAppearances.values()].some(count => count > 30)) throw new Error(`Realistic cap exceeded at ${size}`)
  const allAwards = []
  const combinations = []
  const filter = { seasons: [season], teams: [], positions: [] }
  if (global.gc) global.gc()
  const beforeHeap = process.memoryUsage().heapUsed
  const results = []
  results.push(measure('global-ranking-cold', () => {
    clearGlobalRankingCache()
    return buildGlobalRankingData(players, matches, filter, 'rating')
  }))
  results.push(measure('global-ranking-warm', () => buildGlobalRankingData(players, matches, filter, 'rating')))
  results.push(measure('global-ranking-new-array', () => buildGlobalRankingData(players, [...matches], filter, 'rating')))
  results.push(measure('league-standings', () => leagueCompetition(teams, matches, season, players).standings))
  results.push(measure('season-analytics-cold', () => buildSeasonAnalytics(teams, players, [...matches], season)))
  buildSeasonAnalytics(teams, players, matches, season)
  results.push(measure('season-analytics-warm', () => buildSeasonAnalytics(teams, players, matches, season)))
  results.push(measure('player-season-stats-all', () => players.map(player => playerSeasonStats(player, players, matches, season))))
  results.push(measure('combination-stats-six-kinds', () => {
    const rows = ['duo', 'attack', 'midfield', 'cb', 'fullback', 'backFour'].map(kind => combinationStats(players, matches, filter, kind))
    combinations.push(...rows.map(row => row.length))
    return rows
  }, Number(process.env.BENCHMARK_COMBO_ROUNDS) || 3))
  results.push(measure('season-awards-cold', () => {
    const states = []
    const value = seasonAwards(season, teams, players, [...matches], states)
    allAwards.push(value)
    return value
  }))
  const serializedMatches = JSON.stringify(matches)
  results.push(measure('json-save-restore-proxy', () => JSON.parse(serializedMatches)))
  if (global.gc) global.gc()
  const afterHeap = process.memoryUsage().heapUsed
  return { size, seasonCount: Math.ceil(size / fixtures.length), fixturesPerSeason: fixtures.length, maximumRecordedMatchesPerTeamSeason: Math.max(0, ...teamAppearances.values()), heapDeltaBytes: afterHeap - beforeHeap, combinationRows: combinations.at(-1), results }
}

module.exports = { teams, players, fixtures, makeMatches, benchmark }

if (require.main === module) {
  const sizes = process.argv.slice(2).map(Number).filter(value => Number.isInteger(value) && value > 0)
  const selectedSizes = sizes.length ? sizes : [100, 500, 1000]
  const output = { node: process.version, platform: `${process.platform}-${process.arch}`, gcExposed: Boolean(global.gc), fixturesPerSeason: fixtures.length, benchmarks: selectedSizes.map(benchmark) }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}
