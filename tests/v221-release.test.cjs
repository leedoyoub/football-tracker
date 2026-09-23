const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const rating = require('../src/engine/rating.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { APP_VERSION } = require('../src/config.ts')
const {
  buildSeasonAnalytics, isLeagueMatchdayComplete, monthlyBlockForMatchday,
  monthlyBlockRange, raceHistory, rankMovement, rankingMovement,
} = require('../src/engine/seasonAnalytics.ts')
const {
  buildAwardBestXI, championsProgressBonus, cupProgressBonus, isAwardEligible,
  leaguePositionBonus, participationRatio, ratingAwardScore,
} = require('../src/engine/awards.ts')
const { monthlyAwardScore } = require('../src/engine/awardRules.ts')
const { deriveNews } = require('../src/engine/news.ts')

const teams = [{ id: 'A', name: 'Alpha', shortName: 'A' }, { id: 'B', name: 'Beta', shortName: 'B' }]
const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, fullName: id, teamId, number: 9, position })
const appearance = (p, role = 'starter') => ({ playerId: p.id, teamId: p.teamId, role, position: p.position, matchPosition: p.position })
const goal = (id, teamId, playerId, assistPlayerId) => ({ id, type: 'goal', minute: 20, teamId, playerId, assistPlayerId })
function game(day, options = {}) {
  return {
    id: options.id ?? `m${day}`, season: 'S1', matchDay: day,
    date: `2026-01-${String(day).padStart(2, '0')}`, duration: options.duration ?? 90,
    competitionType: options.competitionType ?? 'league', competitionStage: options.competitionStage ?? 'regular',
    homeTeamId: 'A', awayTeamId: 'B', appearances: options.appearances ?? [], events: options.events ?? [],
    ...(options.teamId ? { teamId: options.teamId } : {}),
  }
}

test('v2.3.1 metadata and the finalized revision-9 position table are exact', () => {
  assert.equal(APP_VERSION, '2.3.1'); assert.equal(require('../package.json').version, '2.3.1'); assert.equal(RATING_ENGINE_REVISION, 9)
  const expected = {
    LB: [.04, 1], LWB: [.04, 1], RB: [.04, 1], RWB: [.04, 1],
    CDM: [.06, .50], LDM: [.06, .50], RDM: [.06, .50],
    CM: [.07, .25], LCM: [.07, .25], RCM: [.07, .25], LM: [.05, .15], RM: [.05, .15],
    CB: [0, 1.3], LCB: [0, 1.3], RCB: [0, 1.3], CAM: [.05, 0], LW: [.05, 0], RW: [.05, 0], ST: [0, 0], GK: [0, 0],
  }
  for (const [position, [teamGoal, suppressionMax]] of Object.entries(expected)) assert.deepEqual([rating.POSITION_RULES[position].teamGoal, rating.POSITION_RULES[position].suppressionMax], [teamGoal, suppressionMax], position)
  assert.equal(rating.normalizePositionFamily('LAM'), 'CAM'); assert.equal(rating.normalizePositionFamily('RAM'), 'CAM')
})

test('monthly blocks are Matchday-based and cover exactly MD1 through MD30', () => {
  assert.equal(monthlyBlockForMatchday(0), null); assert.equal(monthlyBlockForMatchday(31), null)
  for (let day = 1; day <= 30; day++) assert.equal(monthlyBlockForMatchday(day), Math.ceil(day / 3))
  assert.deepEqual(monthlyBlockRange(1), { id: 1, startMatchDay: 1, endMatchDay: 3 })
  assert.deepEqual(monthlyBlockRange(10), { id: 10, startMatchDay: 28, endMatchDay: 30 })
})

test('one completion helper gates monthly finalization across partial MD3 and MD6', () => {
  const p = player('p')
  const full = day => game(day, { appearances: [appearance(p)] })
  const partial = day => game(day, { teamId: 'A', appearances: [appearance(p)] })
  assert.equal(isLeagueMatchdayComplete(teams, [partial(3)], 'S1', 3), false)
  assert.equal(isLeagueMatchdayComplete(teams, [full(3)], 'S1', 3), true)
  assert.equal(buildSeasonAnalytics(teams, [p], [full(1), full(2)], 'S1').latestMonthlyAwards, undefined)
  assert.equal(buildSeasonAnalytics(teams, [p], [full(1), full(2), partial(3)], 'S1').latestMonthlyAwards, undefined)
  const month1 = buildSeasonAnalytics(teams, [p], [full(1), full(2), full(3)], 'S1')
  assert.equal(month1.latestMonthlyAwards.block.id, 1)
  const partialSix = buildSeasonAnalytics(teams, [p], [1, 2, 3, 4, 5].map(full).concat(partial(6)), 'S1')
  assert.equal(partialSix.latestMonthlyAwards.block.id, 1)
  const fullSix = buildSeasonAnalytics(teams, [p], [1, 2, 3, 4, 5, 6].map(full), 'S1')
  assert.equal(fullSix.latestMonthlyAwards.block.id, 2)
})

test('monthly eligibility uses ceil(50%), counts a stoppage-only appearance, and has no table bonus', () => {
  assert.equal(isAwardEligible(1, 3), false); assert.equal(isAwardEligible(2, 3), true); assert.equal(isAwardEligible(3, 3), true)
  assert.equal(isAwardEligible(5, 11), false); assert.equal(isAwardEligible(6, 11), true)
  assert.equal(isAwardEligible(2, 5), false); assert.equal(isAwardEligible(3, 5), true)
  assert.equal(monthlyAwardScore(7.42), 7.42)
  const p = player('late')
  const late = day => game(day, { duration: 95, appearances: [appearance(p, 'bench')], events: [{ id: `sub${day}`, type: 'sub', minute: 92, teamId: 'A', playerInId: p.id, playerOutId: 'out', position: 'ST' }] })
  const analytics = buildSeasonAnalytics(teams, [p], [game(1), late(2), late(3)], 'S1')
  assert.equal(analytics.latestMonthlyAwards.playerOfMonth.playerId, p.id)
  assert.equal(analytics.latestMonthlyAwards.playerOfMonth.appearances, 2)
  assert.equal(analytics.latestMonthlyAwards.playerOfMonth.minutes, 0)
})

test('all award Best XIs share strict 4-3-3 families including tactical aliases', () => {
  const positions = ['GK', 'LWB', 'LCB', 'RCB', 'RWB', 'LDM', 'CM', 'CAM', 'LW', 'LST', 'RW']
  const players = positions.map((position, index) => player(`p${index}`, 'A', position))
  const ranked = players.map((p, index) => ({ row: { playerId: p.id, teamId: 'A', historicalTeamId: 'A', ratings: [{ raw: 8 - index / 100 }], minutes: 90 }, score: 8 - index / 100 }))
  const awardMatches = [{ ...game(1), appearances: players.map(p => appearance(p)) }]
  const xi = buildAwardBestXI(players, ranked, awardMatches)
  assert.deepEqual(xi.map(slot => slot.slot), ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW'])
  assert(xi.every(slot => slot.playerId)); assert.equal(new Set(xi.map(slot => slot.playerId)).size, 11)
})

test('League, Champions and Cup award bonuses and participation scaling are exact', () => {
  assert.deepEqual(Array.from({ length: 16 }, (_, index) => leaguePositionBonus(index + 1)), [.15, .12, .10, .08, .05, .05, .02, .02, 0, 0, 0, 0, 0, 0, 0, 0])
  assert.deepEqual(['roundOf16', 'quarterFinal', 'semiFinal', 'runnerUp', 'champion'].map(championsProgressBonus), [0, .07, .14, .22, .30])
  assert.deepEqual(['stage1', 'stage2', 'stage3', 'stage4', 'stage5', 'stage6', 'stage7', 'runnerUp', 'champion'].map(cupProgressBonus), [0, .03, .06, .09, .12, .15, .18, .22, .30])
  assert.equal(participationRatio(450, 10), .5); assert.equal(participationRatio(1000, 10), 1)
  assert(Math.abs(ratingAwardScore(7.4, .3, 450, 10) - 7.55) < 1e-10)
})

test('rank movement is snapshot-to-snapshot and neutral without a prior rank', () => {
  assert.equal(rankMovement(2, 4), 2); assert.equal(rankMovement(5, 2), -3); assert.equal(rankMovement(1, undefined), null)
  const current = { rows: new Map([['goals', [{ playerId: 'A' }, { playerId: 'B' }]]]) }
  const previous = { rows: new Map([['goals', [{ playerId: 'B' }, { playerId: 'A' }]]]) }
  assert.deepEqual([...rankingMovement(current, previous, 'goals')], [['A', 1], ['B', -1]])
  assert.deepEqual([...rankingMovement(current, undefined, 'goals')], [['A', null], ['B', null]])
})

test('historical standings, form and race snapshots exclude future or wrong-competition data and invalidate on edit', () => {
  const p = player('p')
  const league = [1, 2, 3, 4, 5, 6].map(day => game(day, { appearances: [appearance(p)], events: day === 1 ? [goal('b1', 'B')] : [goal(`a${day}`, 'A', p.id)] }))
  const cup = game(7, { id: 'cup', competitionType: 'cup', competitionStage: 'stage1', appearances: [appearance(p)], events: [goal('cup-b', 'B')] })
  const analytics = buildSeasonAnalytics(teams, [p], [...league, cup], 'S1')
  assert.equal(analytics.leagueSnapshots.get(1).standings.find(row => row.teamId === 'A').points, 0)
  assert.equal(analytics.leagueSnapshots.get(2).standings.find(row => row.teamId === 'A').points, 3)
  assert.deepEqual([analytics.formTable.find(row => row.teamId === 'A').played, analytics.formTable.find(row => row.teamId === 'A').points], [3, 9])
  const goals = raceHistory(analytics, 'goals', [p.id])[0].points
  assert.deepEqual(goals.map(point => point.value), [0, 1, 2, 3, 4, 5])
  const averages = raceHistory(analytics, 'rating', [p.id])[0].points
  assert(averages.every(point => point.value >= 3 && point.value <= 10))
  assert.strictEqual(buildSeasonAnalytics(teams, [p], [...league, cup], 'S1') === analytics, false)
  const edited = league.map(match => match.matchDay === 1 ? { ...match, events: [goal('a1-edited', 'A', p.id)] } : match)
  const rebuilt = buildSeasonAnalytics(teams, [p], edited, 'S1')
  assert.equal(rebuilt.leagueSnapshots.get(1).standings.find(row => row.teamId === 'A').points, 3)
  assert.equal(raceHistory(rebuilt, 'goals', [p.id])[0].points.at(-1).value, 6)
})

test('single-match performance News uses stable one-article thresholds', () => {
  const p = player('star')
  const rare = events => deriveNews([p], teams, [game(1, { appearances: [appearance(p)], events })]).filter(item => item.id.startsWith('rare:'))
  assert.match(rare([goal('g1', 'A', p.id), goal('g2', 'A', p.id), goal('g3', 'A', p.id)])[0].title, /hat-trick|scores 3/)
  assert.equal(rare([goal('g1', 'A', p.id), goal('g2', 'A', p.id), goal('against', 'B')]).length, 0)
  assert.equal(rare([goal('a1', 'A', 'other', p.id), goal('a2', 'A', 'other', p.id), goal('a3', 'A', 'other', p.id)]).length, 1)
  const highPlayer = player('high', 'A', 'GK')
  const high = deriveNews([highPlayer], teams, [game(1, { appearances: [appearance(highPlayer)], events: [goal('h1', 'A', highPlayer.id), goal('h2', 'A', highPlayer.id), goal('h3', 'B')] })]).filter(item => item.id.startsWith('rare:'))
  assert.equal(high.length, 1); assert.equal(high[0].id, 'rare:m1:high:performance')
  const keeper = player('keeper', 'A', 'GK')
  const keeperNews = deriveNews([keeper], teams, [game(1, { appearances: [appearance(keeper)], events: [{ id: 's', type: 'save', teamId: 'A', playerId: keeper.id, count: 5 }] })]).filter(item => item.id.startsWith('rare:'))
  assert.equal(keeperNews.length, 1); assert.match(keeperNews[0].title, /5 saves.*clean sheet/)
})

test('mobile screen hierarchy, compare mode, cached snapshots and navigation memory stay structural', () => {
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  const competition = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const team = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  const playerDetail = fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8')
  const matchDetail = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  for (const token of ['screenState.leaderMetric', 'Global Ranking', 'News', 'slice(0, 5)', 'slice(0, 4)', 'seasonMatches']) assert(home.includes(token), token)
  for (const token of ['screenState.competitionType', 'screenState.rankingMetric', "label: 'Players'", "label: 'Table'", "label: 'Form'", "label: 'History'", 'Team of the Month', 'Race History']) assert(competition.includes(token), token)
  for (const token of ['screenState.bestPlayersMetric', "label: 'Overview'", "label: 'Matches'", "label: 'Players'", 'Roster management', 'Latest XI', 'Bench', 'RANKING_METRICS']) assert(team.includes(token), token)
  for (const token of ['RankedMetric', 'Overall rank', 'Position-family rank', 'Team rank', 'Season avg', 'Last 5 avg', 'Active Streaks', 'Awards']) assert(playerDetail.includes(token), token)
  for (const token of ['Match Facts', 'Lineup', 'Ratings', 'What Changed', 'Top 3 Ratings']) assert(matchDetail.includes(token), token)
  const p = player('cached')
  const players = [p]
  const matches = [game(1, { appearances: [appearance(p)] })]
  assert.strictEqual(buildSeasonAnalytics(teams, players, matches, 'S1'), buildSeasonAnalytics(teams, players, matches, 'S1'))
})
