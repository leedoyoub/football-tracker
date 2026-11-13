require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict'), { test } = require('node:test'), path = require('node:path')
const { baselineRoot } = require('./helpers/v268-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { sourceModule, screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
function fixture() {
  const state = performanceFixture(1), teamIds = new Set(state.teams.slice(0, 3).map(team => team.id))
  state.players = state.players.filter(player => teamIds.has(player.id.split(':')[0]))
  state.matches = state.matches.filter(match => teamIds.has(match.teamId) && match.matchDay <= 4)
  const target = state.players[9], moved = state.matches.find(match => match.teamId === state.teams[1].id && match.competitionType === 'league' && match.matchDay === 4)
  moved.appearances.push({ playerId: target.id, teamId: moved.teamId, role: 'bench', position: 'CB', matchPosition: 'CB' })
  moved.events.push({ id: 'transfer-sub', type: 'sub', minute: 85, teamId: moved.teamId, playerInId: target.id, playerOutId: moved.appearances[2].playerId, position: 'CB' })
  target.teamId = ''; target.teamIds = []; target.position = 'GK'
  return state
}

test('Detail core ranks do not derive unrelated defensive samples', () => {
  const defensive = require('../src/engine/defensiveRanking.ts'), original = defensive.defensiveMatchFacts
  let samples = 0
  defensive.defensiveMatchFacts = (...args) => { samples++; return original(...args) }
  try {
    const state = fixture(), { playerDetailRankingScope } = sourceModule(root, 'engine/playerDetailRanks.ts')
    const ranks = playerDetailRankingScope(state.players, state.matches, 'Season 1', 'all').ranksFor(state.players[9].id, state.teams[0].id)
    assert.equal(ranks.goals.team, 2)
    assert.equal(samples, 0, 'rating/goals/assists ranks have no defensive metric dependency')
  } finally { defensive.defensiveMatchFacts = original }
})

for (const duplicate of ['roster', 'match']) test(`Detail ranks preserve independent v2.6.7 results with duplicate ${duplicate} IDs`, () => {
  const state = performanceFixture(1), teamId = state.teams[0].id
  state.matches = state.matches.filter(match => match.teamId === teamId && match.competitionType === 'league' && match.matchDay <= 2)
  if (duplicate === 'roster') state.players.push({ ...state.players[0] })
  else state.matches[1] = { ...state.matches[1], id: state.matches[0].id, events: [] }
  const legacy = require(path.join(baselineRoot(), 'src/engine/playerDetailRanks.ts')), current = require('../src/engine/playerDetailRanks.ts')
  const before = legacy.playerDetailRankingScope(state.players, state.matches, 'Season 1', 'league')
  const after = current.playerDetailRankingScope(state.players, state.matches, 'Season 1', 'league')
  if (duplicate === 'roster') assert.deepEqual(before.ranksFor(state.players[0].id, teamId).rating, { overall: 3, position: 2, team: 3 })
  for (const player of state.players) for (const team of [undefined, teamId]) assert.deepEqual(after.ranksFor(player.id, team), before.ranksFor(player.id, team), `${duplicate}:${player.id}:${team}`)
})

test('Rank Trend updates dominant families only for changed appearance minutes', () => {
  const positions = require('../src/engine/positionScope.ts'), original = positions.dominantPositionFamily
  let scans = 0
  positions.dominantPositionFamily = (...args) => { scans++; return original(...args) }
  try {
    const state = fixture(), { playerRankTrend } = sourceModule(root, 'engine/playerRankTrend.ts')
    const points = playerRankTrend(state.players[9].id, state.players, state.matches, 'Season 1', 'all', 'goals')
    assert(points.length > 5)
    const appearances = state.matches.reduce((count, match) => count + match.appearances.filter(row => state.players.some(player => player.id === row.playerId)).length, 0)
    assert(scans <= appearances, `must not scan all registered players for every historical point: ${scans} > ${appearances}`)
  } finally { positions.dominantPositionFamily = original }
})

test('Rank Trend metric changes reuse chronological appearance facts', () => {
  const facts = require('../src/engine/playerMatchFacts.ts'), original = facts.playerGoalEvents
  let visits = 0
  facts.playerGoalEvents = (...args) => { visits++; return original(...args) }
  try {
    const state = fixture(), { playerRankTrend } = sourceModule(root, 'engine/playerRankTrend.ts'), id = state.players[9].id
    const goals = playerRankTrend(id, state.players, state.matches, 'Season 1', 'all', 'goals')
    const first = visits
    const assists = playerRankTrend(id, state.players, state.matches, 'Season 1', 'all', 'assists')
    assert.equal(goals.length, assists.length)
    assert.equal(visits, first, 'switching core metrics reuses raw goal/assist/rating/position facts')
  } finally { facts.playerGoalEvents = original }
})

test('current ranking movement matches independent full-season snapshots after edits, deletion and position changes', () => {
  const legacy = require(path.join(baselineRoot(), 'src/engine/seasonAnalytics.ts')), current = require('../src/engine/seasonAnalytics.ts')
  const state = fixture(), variants = [state, { ...state, matches: state.matches.slice(1) }, { ...state, matches: state.matches.map((match, index) => index ? match : { ...match, events: match.events.filter(event => event.type !== 'goal') }) }, { ...state, players: state.players.map((player, index) => index ? player : { ...player, position: 'CB' }) }, { ...state, matches: state.matches.filter(match => match.matchDay !== 3) }, { ...state, matches: [] }]
  for (const value of variants) {
    const expected = legacy.buildSeasonAnalytics(value.teams, value.players, value.matches, 'Season 1')
    const actual = current.currentPlayerRankingSnapshots(value.players, value.matches, 'Season 1')
    assert.equal(actual.currentMatchDay, expected.currentMatchDay)
    assert.deepEqual(actual.current, expected.playerSnapshots.get(expected.currentMatchDay))
    assert.deepEqual(actual.previous, expected.playerSnapshots.get(expected.currentMatchDay - 1))
    for (const metric of ['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom', 'saves']) assert.deepEqual(current.rankingMovement(actual.current, actual.previous, metric), legacy.rankingMovement(expected.playerSnapshots.get(expected.currentMatchDay), expected.playerSnapshots.get(expected.currentMatchDay - 1), metric))
  }
})

test('ranking scopes invalidate legacy same-array replacements and deletions without losing historical points', () => {
  const baseline = baselineRoot(), oldRanks = require(path.join(baseline, 'src/engine/playerDetailRanks.ts')), oldTrend = require(path.join(baseline, 'src/engine/playerRankTrend.ts'))
  const ranks = require('../src/engine/playerDetailRanks.ts'), trend = require('../src/engine/playerRankTrend.ts'), analytics = require('../src/engine/seasonAnalytics.ts')
  const state = fixture(), id = state.players[9].id
  const read = () => {
    const scope = ranks.playerDetailRankingScope(state.players, state.matches, 'Season 1', 'all')
    return { scope, ranks: scope.ranksFor(id, state.teams[0].id), points: trend.playerRankTrend(id, state.players, state.matches, 'Season 1', 'all', 'goals'), movement: analytics.currentPlayerRankingSnapshots(state.players, state.matches, 'Season 1') }
  }
  let prior = read()
  const index = state.matches.findIndex(match => match.competitionType === 'league' && match.matchDay === 2)
  state.matches[index] = { ...state.matches[index], events: [] }
  for (const mutate of [() => {}, () => { state.matches.splice(index, 1) }, () => { state.players[9] = { ...state.players[9], position: 'LB' } }]) {
    mutate()
    const actual = read(), expectedScope = oldRanks.playerDetailRankingScope(state.players.slice(), state.matches.slice(), 'Season 1', 'all')
    assert.notStrictEqual(actual.scope, prior.scope)
    assert.notStrictEqual(actual.points, prior.points)
    assert.notStrictEqual(actual.movement, prior.movement)
    assert.deepEqual(actual.ranks, expectedScope.ranksFor(id, state.teams[0].id))
    assert.deepEqual(actual.points, oldTrend.playerRankTrend(id, state.players.slice(), state.matches.slice(), 'Season 1', 'all', 'goals'))
    prior = actual
  }
})

test('Detail ranks and every historical Rank Trend point match independent v2.6.7 in all competition scopes and immutable mutations', () => {
  const baseline = baselineRoot(), oldRanks = require(path.join(baseline, 'src/engine/playerDetailRanks.ts')), oldTrend = require(path.join(baseline, 'src/engine/playerRankTrend.ts'))
  const ranks = require('../src/engine/playerDetailRanks.ts'), trend = require('../src/engine/playerRankTrend.ts')
  const state = fixture(), editIndex = state.matches.findIndex(match => match.competitionType === 'league' && match.matchDay === 2)
  const edited = state.matches.map((match, index) => index === editIndex ? { ...match, events: match.events.filter(event => event.type !== 'goal'), appearances: match.appearances.map((appearance, i) => i === 9 ? { ...appearance, matchPosition: 'CB', positionHistory: [{ minute: 30, position: 'GK' }] } : appearance) } : match)
  const variants = [state, { ...state, matches: edited }, { ...state, matches: edited.filter((_, index) => index !== editIndex) }, { ...state, matches: [...edited, { ...edited[editIndex], id: 'added-later', matchDay: 5, recordedAt: 9999 }] }, { ...state, players: state.players.map((player, index) => index === 9 ? { ...player, position: 'LB', teamId: state.teams[1].id } : player) }]
  for (const [index, value] of variants.entries()) for (const competition of ['all', 'league', 'cup', 'champions']) {
    const before = oldRanks.playerDetailRankingScope(value.players, value.matches, 'Season 1', competition), after = ranks.playerDetailRankingScope(value.players, value.matches, 'Season 1', competition)
    assert.deepEqual(after.families, before.families)
    for (const player of value.players) for (const team of [undefined, ...value.teams.slice(0, 3).map(team => team.id)]) assert.deepEqual(after.ranksFor(player.id, team), before.ranksFor(player.id, team), `${index}:${competition}:${player.id}:${team}`)
    for (const id of [value.players[0].id, value.players[2].id, value.players[9].id, value.players[15].id, 'missing']) for (const metric of ['rating', 'goals', 'assists', 'g+a', 'sotAllowed', 'defenderGaPer90', 'cleanSheets', 'saves', 'goalkeeperGaPer90']) assert.deepEqual(trend.playerRankTrend(id, value.players, value.matches, 'Season 1', competition, metric), oldTrend.playerRankTrend(id, value.players, value.matches, 'Season 1', competition, metric), `${index}:${competition}:${id}:${metric}`)
  }
})

test('Player detail sticky tabs use normal top offset for active and historical players', () => {
  const state = fixture(), { defaultScreenState } = require('../src/lib/navigation.ts')
  for (const id of [state.players[9].id, 'removed-player']) {
    const tree = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', state).render({ playerId: id, screenState: { ...defaultScreenState({ name: 'player', id }), season: 'Season 1', tab: 'matches' }, onStateChange() {}, onNavigate() {}, onBack() {} })
    const tabs = nodes(tree, node => node.props?.label === 'Player detail section')[0]
    assert(tabs); assert.equal(tabs.props.stickyOffset, undefined)
  }
})
