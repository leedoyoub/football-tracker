require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..')
const ref = '964922fe647b136096bd5646bd9462ce665c06a9'
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v2510-baseline-'))
let archive
try { archive = execFileSync('git', ['archive', ref, 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) }
catch (cause) { throw new Error(`The independent v2.5.9 baseline ${ref} must exist in Git history. Use a full clone (or fetch the history) before running equivalence tests.`, { cause }) }
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: archive })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const before = file => require(path.join(baseline, 'src', file))
const current = file => require(path.join(root, 'src', file))
const s = performanceFixture()
function equal(file, fn, ...args) {
  const actual = current(file)[fn](...args)
  const original = before(file)[fn](...args)
  assert.deepStrictEqual(actual, original, `${file}:${fn}`)
}

test('realistic benchmark history is accepted by the unchanged durable-state validator', () => {
  assert.equal(current('lib/validation.ts').validateState(s), true)
  assert.equal(s.teams.length, 16); assert.equal(s.players.length, 367); assert.equal(s.matches.length, 1152)
})

test('v2.5.9 whole-object equivalence: every match rating, MOM, goal types, manual/legacy SOT and defence', () => {
  for (const match of s.matches) {
    equal('engine/rating.ts', 'rateMatch', match, s.players)
    equal('engine/rating.ts', 'getMatchManOfTheMatch', match, s.players)
    equal('engine/goalTypes.ts', 'classifyGoalTypes', match)
    equal('engine/opponentSot.ts', 'opponentSot', match, match.teamId)
    for (const appearance of match.appearances) equal('engine/defensiveRanking.ts', 'defensiveMatchFacts', match, appearance)
  }
})

test('v2.5.9 whole-object equivalence: all 30 History days, monthly awards, rankings, Best XI and competitions', () => {
  for (const season of ['Season 1', 'Season 2']) {
    equal('engine/seasonAnalytics.ts', 'buildSeasonAnalytics', s.teams, s.players, s.matches, season)
    equal('engine/competition.ts', 'leagueCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'cupCompetition', s.teams, s.matches, season, s.players)
    equal('engine/competition.ts', 'championsCompetition', s.competitionStates.find(d => d.season === season), s.matches, season, s.players)
    equal('engine/awards.ts', 'seasonAwards', season, s.teams, s.players, s.matches, s.competitionStates)
    const metrics = current('lib/rankingMetrics.ts').RANKING_METRICS
    assert.deepStrictEqual(metrics, before('lib/rankingMetrics.ts').RANKING_METRICS)
    const oldStats = before('engine/stats.ts'); const newStats = current('engine/stats.ts')
    for (const metric of [...metrics.map(row => row.value), 'goalsConceded']) {
      const filters = { seasons: [season], teams: [], positions: [] }
      const oldRows = oldStats.buildGlobalRankingData(s.players, s.matches, filters, metric)
      const newRows = newStats.buildGlobalRankingData(s.players, s.matches, filters, metric)
      assert.deepStrictEqual(newRows, oldRows, `ranking facts: ${metric}`)
      assert.deepStrictEqual(newStats.rankGlobalRankingRows(newRows, s.players, metric), oldStats.rankGlobalRankingRows(oldRows, s.players, metric), `ranking order: ${metric}`)
    }
    for (const type of ['league', 'cup', 'champions']) equal('engine/awards.ts', 'competitionAwardResult', type, season, s.teams, s.players, s.matches, s.competitionStates)
  }
})

test('v2.5.9 whole-object equivalence: Player Detail, representative positions, Rank Trend and scoped fallbacks', () => {
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

test('v2.5.9 whole-object equivalence: every Records leaderboard and Chemistry candidate', () => {
  for (const category of ['player', 'team', 'combination']) {
    const games = category === 'combination' ? s.matches.filter(m => m.teamId === s.teams[0].id).slice(0, 6) : s.matches
    equal('screens/recordsLeaderboards.ts', 'recordsLeaderboardGroups', { category, players: s.players, teams: s.teams, matches: games, scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' } })
  }
  const games = s.matches.slice(0, 64)
  for (const kind of ['duo', 'attack', 'midfield', 'cb', 'fullback', 'backFour']) equal('engine/analytics.ts', 'combinationStats', s.players, games, {}, kind)
  equal('engine/analytics.ts', 'playerChemistry', s.players[9], s.players, games, {})
})

test('v2.5.9 whole-object equivalence: News IDs/order, Latest Changes and Match Detail What Changed', () => {
  equal('engine/news.ts', 'deriveNews', s.players, s.teams, s.matches, s.competitionStates)
  equal('engine/latestChanges.ts', 'deriveLatestChanges', s.players, s.teams, s.matches, s.competitionStates)
  equal('engine/matchChangeIndex.ts', 'buildMatchChangeIndex', s.players, s.teams, s.matches, s.competitionStates)
})

test('v2.5.9 whole-object equivalence: edits/deletions, historical removals, changed draw, empty and unsorted legacy inputs', () => {
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

test('v2.5.9 Cup equivalence includes every pending/completed stage, Final, Replay and neutral Total', () => {
  const { teams, game, cupFixture } = require('./helpers/v258-fixture.cjs')
  const complete = cupFixture(7)
  const finalists = before('engine/competition.ts').cupCompetition(teams, complete, 'S1').activeTeamIds
  const final = finalists.map(id => game(`final:${id}`, id, { competitionStage: 'final' }))
  const replay = finalists.map((id, i) => game(`replay:${id}`, id, { competitionStage: 'finalReplay', gf: 2 - i }))
  const scenarios = [[], ...Array.from({ length: 7 }, (_, i) => cupFixture(i + 1)), ...Array.from({ length: 7 }, (_, i) => cupFixture(i + 1).slice(0, -1)), [...complete, ...final], [...complete, ...final, ...replay], teams.map(t => game(t.id, t.id))]
  for (const matches of scenarios) {
    equal('engine/competition.ts', 'cupCompetition', teams, matches, 'S1')
    const cup = current('engine/competition.ts').cupCompetition(teams, matches, 'S1')
    const choices = before('lib/cupTable.ts').cupTableModel(teams, matches, 'S1', [], cup, null).availableStages
    for (const selection of [null, ...choices, 'total']) equal('lib/cupTable.ts', 'cupTableModel', teams, matches, 'S1', [], cup, selection)
  }
})

test('v2.5.9 exact read models survive replace/import/add/edit/delete and roster reference changes', () => {
  const imported = JSON.parse(JSON.stringify(s))
  const edits = imported.matches.slice(0, 48).map((m, i) => i ? m : { ...m, events: m.events.slice(0, 2) })
  const variants = [imported, { ...imported, matches: edits }, { ...imported, matches: edits.slice(1) }, { ...imported, matches: [...edits, { ...edits[0], id: 'new-match' }] }, { ...imported, players: imported.players.map((p, i) => i === 9 ? { ...p, teamId: imported.teams[1].id } : p), matches: edits }]
  for (const state of variants) {
    equal('engine/playerDerived.ts', 'derivePlayerScope', state.players[9], state.players, state.matches)
    equal('engine/playerRecords.ts', 'buildPlayerRecordLeaderboards', state.players, state.matches, {})
    equal('engine/news.ts', 'deriveNews', state.players, state.teams, state.matches, state.competitionStates)
    equal('engine/stats.ts', 'buildGlobalRankingData', state.players, state.matches, { seasons: [], teams: [], positions: [] }, 'rating')
  }
})
