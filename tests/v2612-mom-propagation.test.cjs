require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { baselineRoot, root, cappedMomFixture } = require('./helpers/v2612-mom-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const archived = baselineRoot()
const api = (directory, file) => require(path.join(directory, 'src', file + '.ts'))
const before = file => api(archived, file)
const after = file => api(root, file)
const season = 'Season 1'
const filters = { seasons: [season], teams: [], positions: [] }
const scope = { seasons: [season], teamIds: [], competition: 'all', positionFilter: 'all' }

function history(days = 10) {
  const { state, capped, keeper, striker, defender } = cappedMomFixture()
  const players = state.players.filter(p => [keeper, striker, defender].includes(p.id))
  const teams = state.teams.slice(0, 1)
  const matches = Array.from({ length: days }, (_, i) => capped(`capped-${i + 1}`, season, i + 1))
  return { players, teams, matches, keeper, striker, defender, capped }
}

function model(load, { players, teams, matches, striker, keeper }) {
  const stats = load('engine/stats')
  const ranking = stats.buildGlobalRankingData(players, matches, filters, 'rating')
  const states = []
  const recap = load('engine/seasonInsights').seasonRecap(players, matches, season, states, teams)
  const records = load('screens/recordsLeaderboards').recordsLeaderboardGroups({ category: 'player', players, teams, matches, scope, selectedIds: ['mom', 'highest-rating', 'ten'] })
  const news = load('engine/news').deriveFootballEvents(players, teams, matches, states).filter(row => row.id.startsWith('season-mom:'))
  const latest = load('engine/latestChanges').deriveLatestChanges(players, teams, matches, states, season).flatMap(group => group.items).filter(item => item.id.startsWith('season-mom:'))
  const matchChanges = load('engine/matchChangeIndex').buildMatchChangeIndex(players, teams, matches, states)
  const player = id => load('engine/playerDerived').derivePlayerScope(players.find(p => p.id === id), players, matches, { season })
  return { ranking, records, momRanking: stats.rankGlobalRankingRows(ranking, players, 'mom'), recap, news, latest, matchChanges, striker: player(striker), keeper: player(keeper),
    history: load('engine/historyReadModels').historyTimelineForSeason(teams, players, matches, states, season) }
}

test('the historical winner moves across leaderboards, player details, milestones, Recap and History', () => {
  const input = history()
  const raw = JSON.stringify(input.matches)
  const old = model(before, input), current = model(after, input)
  for (const [result, winner, runner] of [[old, input.keeper, input.striker], [current, input.striker, input.keeper]]) {
    assert.equal(result.momRanking[0].playerId, winner)
    assert.equal(result.momRanking[0].mom, 10)
    assert.equal(result.ranking.find(row => row.playerId === runner).mom, 0)
    assert.equal(result.ranking.find(row => row.playerId === input.defender).mom, 0)
    assert.equal(result.records.find(group => group.id === 'mom').rows[0].id, winner)
    assert.equal(result.history.mom.playerId, winner)
    assert.deepEqual(result.recap.awards.find(award => award.id === 'mom').playerIds, [winner])
    assert.deepEqual(result.news.map(row => row.playerId), [winner])
    assert.deepEqual(result.latest.map(row => row.playerId), [winner])
    assert(result.matchChanges.get('capped-10').some(group => group.playerId === winner && group.items.some(item => item.id === `season-mom:${season}:${winner}:10`)))
  }
  assert.deepEqual([old.striker.mom, old.keeper.mom], [0, 10])
  assert.deepEqual([current.striker.mom, current.keeper.mom], [10, 0])
  const revisedRecords = structuredClone(old.records.filter(group => group.id !== 'mom'))
  const defenderRecord = revisedRecords.find(group => group.id === 'highest-rating').rows.find(row => row.id === input.defender)
  assert.equal(defenderRecord.numeric, 6.88)
  Object.assign(defenderRecord, { numeric: 6.6, value: '6.60', detail: '6.60 canonical raw rating' })
  assert.deepEqual(current.records.filter(group => group.id !== 'mom'), revisedRecords)
  for (const name of ['averageRating', 'goodMatchRate', 'goodMatches']) {
    assert.equal(current.striker[name], old.striker[name])
    assert.equal(current.keeper[name], old.keeper[name])
  }
  assert.equal(JSON.stringify(input.matches), raw)
})

test('competition, monthly, half-season and season awards use new MOM counts with the existing scoring and final tie policy', () => {
  const { teams, players, matches, keeper, striker, defender } = history(30)
  const full = cappedMomFixture().state
  const wholeLeague = [...matches, ...full.matches.filter(match => match.teamId !== teams[0].id && match.competitionType === 'league')]
  const states = [{ id: 'completed:1', kind: 'season-complete', season, teamIds: [teams[0].id] }]
  const read = load => {
    const awards = load('engine/awards')
    const league = awards.awardsForCompetition('league', season, teams, players, matches, states)
    return { league, season: awards.seasonAwards(season, teams, players, matches, states),
      first: awards.awardResultForScope('first-half', season, teams, players, matches, states),
      second: awards.awardResultForScope('second-half', season, teams, players, matches, states),
      month: load('engine/seasonAnalytics').monthlyAwardForBlock(teams, players, matches, season, 1),
      events: load('engine/officialAwards').officialSeasonModel(full.teams, players, wholeLeague, states, season).events,
      final: awards.finalPlayerAward(players, matches.slice(0, 1)) }
  }
  const old = read(before), current = read(after)
  for (const [value, winner] of [[old, keeper], [current, striker]]) {
    assert.equal(value.league.mvp.playerId, winner)
    assert.equal(value.season.ballon.playerId, winner)
    assert.equal(value.first.bestPlayerId, winner)
    assert.equal(value.second.bestPlayerId, winner)
    assert.equal(value.month.bestPlayerId, winner)
    for (const kind of ['league-mvp', 'first-half-mvp', 'second-half-mvp']) {
      assert.equal(value.events.find(event => event.kind === kind)?.playerId, winner)
    }
  }
  assert.equal(old.season.ballon.awardScore, current.season.ballon.awardScore)
  assert.equal(old.league.mvp.awardScore, current.league.mvp.awardScore)
  assert.equal(current.league.candidates.find(row => row.playerId === striker).mom, 30)
  const defenderSlot = old.season.bestXI.find(slot => slot.playerId === defender)
  assert.equal(defenderSlot.avgRating.toFixed(2), '6.88')
  assert.deepEqual(current.season.bestXI, old.season.bestXI.map(slot => slot === defenderSlot ? { ...slot, avgRating: Array(30).fill(6.6).reduce((sum, value) => sum + value, 0) / 30 } : slot))
  assert.deepEqual(old.final, current.final)
  assert.equal(current.final.playerId, keeper)
})

test('career and competition scopes recalculate after edits, deletion and a roster transfer', () => {
  const { players, teams, matches, keeper, striker, capped } = history()
  const states = []
  const player = players.find(p => p.id === striker)
  player.teamId = 'transferred'; player.teamIds = ['transferred']
  matches.push(capped('cup', season, 1, 'cup'), capped('second-season', 'Season 2', 1))
  const { derivePlayerScope } = after('engine/playerDerived')
  const read = () => derivePlayerScope(player, players, matches, { season, competition: 'league', teamIds: [teams[0].id] })
  assert.equal(derivePlayerScope(player, players, matches).mom, 12)
  assert.equal(derivePlayerScope(player, players, matches, { season, competition: 'cup' }).mom, 1)
  assert.equal(read().mom, 10)
  assert.equal(read(), read())
  const original = matches[0]
  matches[0] = { ...original, events: original.events.map(event => event.type === 'save' ? { ...event, count: 24 } : event) }
  assert.equal(read().mom, 9)
  assert.equal(derivePlayerScope(players.find(p => p.id === keeper), players, matches).mom, 1)
  assert(!after('engine/latestChanges').deriveLatestChanges(players, teams, matches.slice(0, 10), states, season).some(group => group.items.some(item => item.id.endsWith(`:${striker}:10`))))
  const remaining = matches.slice(1)
  assert.equal(derivePlayerScope(player, [...players], remaining).mom, 11)
  assert.equal(derivePlayerScope(player, players, remaining, { season, competition: 'league' }).mom, 9)
})

test('Comparison displays the new MOM counts while all other displayed values are preserved', () => {
  const input = history()
  const props = { season, screenState: { name: 'comparison', season, teamId: null, competition: 'league', leftId: input.keeper, rightId: input.striker }, onNavigate() {}, onStateChange() {} }
  const rows = directory => nodes(screenHarness(directory, 'screens/ComparisonScreen.tsx', 'ComparisonScreen', input).render(props), n => n.type?.name === 'ComparisonValue')
    .map(n => [n.props.metric.label, n.props.text])
  const old = rows(archived), current = rows(root)
  assert.deepEqual(old.filter(row => row[0] === 'MOM'), [['MOM', '10'], ['MOM', '0']])
  assert.deepEqual(current.filter(row => row[0] === 'MOM'), [['MOM', '0'], ['MOM', '10']])
  assert.deepEqual(current.filter(row => row[0] !== 'MOM'), old.filter(row => row[0] !== 'MOM'))
})

test('MOM policy invalidates dependent caches and preserves rating-only caches', () => {
  const policy = after('engine/momPolicy')
  const { players, teams, matches, striker } = history()
  const states = []
  const rating = after('engine/rating')
  const records = after('engine/playerRecords')
  const query = [
    () => after('engine/stats').buildGlobalRankingData(players, matches, filters, 'mom'),
    () => after('engine/playerDerived').derivePlayerScope(players.find(p => p.id === striker), players, matches),
    () => records.buildPlayerRecordLeaderboards(players, matches, {}, ['mom']),
    () => after('engine/officialAwards').officialSeasonModel(teams, players, matches, states, season),
    () => after('engine/seasonAnalytics').currentPlayerRankingSnapshots(players, matches, season),
    () => after('engine/latestChanges').deriveLatestChanges(players, teams, matches, states, season),
    () => after('engine/matchChangeIndex').buildMatchChangeIndex(players, teams, matches, states),
    () => after('engine/seasonInsights').seasonRecap(players, matches, season, states, teams),
  ]
  const independent = [
    () => rating.ratePlayerMatch(matches[0], players[0]),
    () => records.buildPlayerRecordLeaderboards(players, matches, {}, ['highest-rating']),
    () => after('engine/seasonAnalytics').buildLeagueHistory(teams, players, matches, season),
    () => after('engine/seasonInsights').startingXILeaders(players, matches, season),
  ]
  const prior = query.map(fn => fn()), retained = independent.map(fn => fn())
  const revision = policy.MOM_POLICY_REVISION
  try {
    query.forEach((fn, i) => assert.equal(fn(), prior[i]))
    policy.MOM_POLICY_REVISION++
    query.forEach((fn, i) => assert.notEqual(fn(), prior[i]))
    independent.forEach((fn, i) => assert.equal(fn(), retained[i]))
  } finally { policy.MOM_POLICY_REVISION = revision }
})
