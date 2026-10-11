require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..')
const ref = '2cb89aa3de0afcd59d844e0786d31eb9eba2d183'
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v255-baseline-'))
let archive
try { archive = execFileSync('git', ['archive', ref, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) }
catch (cause) { throw new Error(`The independent v2.5.4 baseline ${ref} must exist in Git history. Use a full clone (or fetch the history) before running equivalence tests.`, { cause }) }
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const before = file => require(path.join(baseline, 'src', file))
const current = file => require(path.join(root, 'src', file))
const s = performanceFixture()
function equal(file, fn, ...args) { assert.deepStrictEqual(current(file)[fn](...args), before(file)[fn](...args), `${file}:${fn}`) }

test('realistic benchmark history is accepted by the unchanged durable-state validator', () => {
  assert.equal(current('lib/validation.ts').validateState(s), true)
  assert.equal(s.teams.length, 16); assert.equal(s.players.length, 367); assert.equal(s.matches.length, 1152)
})

test('v2.5.4 whole-object equivalence: every match rating, MOM, goal types, manual/legacy SOT and defence', () => {
  for (const match of s.matches) {
    equal('engine/rating.ts', 'rateMatch', match, s.players)
    equal('engine/rating.ts', 'getMatchManOfTheMatch', match, s.players)
    equal('engine/goalTypes.ts', 'classifyGoalTypes', match)
    equal('engine/opponentSot.ts', 'opponentSot', match, match.teamId)
    for (const appearance of match.appearances) equal('engine/defensiveRanking.ts', 'defensiveMatchFacts', match, appearance)
  }
})

test('v2.5.4 whole-object equivalence: all 30 History days, monthly awards, rankings, Best XI and competitions', () => {
  for (const season of ['Season 1', 'Season 2']) {
    equal('engine/seasonAnalytics.ts', 'buildSeasonAnalytics', s.teams, s.players, s.matches, season)
    equal('engine/competition.ts', 'leagueCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'cupCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'championsCompetition', s.competitionStates.find(d => d.season === season), s.matches, season, s.players)
    equal('engine/awards.ts', 'seasonAwards', season, s.teams, s.players, s.matches, s.competitionStates)
    for (const metric of ['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom', 'saves', 'cleanSheets', 'sotAllowed', 'defenderGaPer90', 'goalkeeperGaPer90']) {
      equal('engine/stats.ts', 'buildGlobalRankingData', s.players, s.matches, { seasons: [season], teams: [], positions: [] }, metric)
    }
    for (const type of ['league', 'cup', 'champions']) equal('engine/awards.ts', 'competitionAwardResult', type, season, s.teams, s.players, s.matches, s.competitionStates)
  }
})

test('v2.5.4 whole-object equivalence: Player Detail, representative positions, Rank Trend and scoped fallbacks', () => {
  for (const scope of [{}, { seasons: ['Season 2'] }, { seasons: ['Missing'], teams: [s.teams[0].id] }]) {
    equal('engine/positionScope.ts', 'scopedPositionFamilyByPlayer', s.players, s.matches, scope)
    equal('engine/positionScope.ts', 'scopedAwardFamilyByPlayer', s.players, s.matches, scope)
  }
  for (const player of [s.players[0], s.players[8], s.players[9], s.players[15]]) {
    equal('engine/playerDerived.ts', 'derivePlayerScope', player, s.players, s.matches, { season: 'Season 2' })
    equal('engine/playerDerived.ts', 'playerAppearanceMatches', player, s.matches)
    equal('engine/playerDerived.ts', 'playerPersonalRecords', player, s.players, s.matches)
    equal('engine/stats.ts', 'playerSeasonStats', player, s.players, s.matches, 'Season 2', s.teams[0].id, 'league')
    for (const metric of ['rating', 'goals', 'sotAllowed', 'goalkeeperGaPer90']) equal('engine/playerRankTrend.ts', 'playerRankTrend', player.id, s.players, s.matches, 'Season 2', 'all', metric)
  }
})

test('v2.5.4 whole-object equivalence: every Records leaderboard and Chemistry candidate', () => {
  for (const category of ['player', 'team', 'combination']) {
    const games = category === 'combination' ? s.matches.filter(m => m.teamId === s.teams[0].id).slice(0, 6) : s.matches
    equal('screens/recordsLeaderboards.ts', 'recordsLeaderboardGroups', { category, players: s.players, teams: s.teams, matches: games, scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' } })
  }
  const games = s.matches.slice(0, 64)
  for (const kind of ['duo', 'attack', 'midfield', 'cb', 'fullback', 'backFour']) equal('engine/analytics.ts', 'combinationStats', s.players, games, {}, kind)
  equal('engine/analytics.ts', 'playerChemistry', s.players[9], s.players, games, {})
})

test('v2.5.4 whole-object equivalence: News IDs/order, Latest Changes and Match Detail What Changed', () => {
  equal('engine/news.ts', 'deriveNews', s.players, s.teams, s.matches, s.competitionStates)
  equal('engine/latestChanges.ts', 'deriveLatestChanges', s.players, s.teams, s.matches, s.competitionStates)
  equal('engine/matchChangeIndex.ts', 'buildMatchChangeIndex', s.players, s.teams, s.matches, s.competitionStates)
})

test('v2.5.4 whole-object equivalence: edits/deletions, historical removals, changed draw, empty and unsorted legacy inputs', () => {
  const games = structuredClone(s.matches.slice(0, 48)).reverse()
  games[0].events = games[0].events.filter(e => e.type !== 'sub')
  games[0].appearances[7].positionHistory = []
  games.splice(3, 1)
  const players = s.players.slice().reverse().filter(p => p.id !== s.players[9].id)
  const draws = s.competitionStates.map(d => ({ ...d, teamIds: d.teamIds.slice().reverse() }))
  equal('engine/seasonAnalytics.ts', 'buildSeasonAnalytics', s.teams, players, games, 'Season 1')
  equal('engine/news.ts', 'deriveNews', players, s.teams, games, draws)
  equal('engine/latestChanges.ts', 'deriveLatestChanges', players, s.teams, games, draws)
  equal('engine/seasonAnalytics.ts', 'buildSeasonAnalytics', [], [], [], 'Season 1')
  equal('engine/stats.ts', 'buildGlobalRankingData', [], [], { seasons: [], teams: [], positions: [] }, 'rating')
})
