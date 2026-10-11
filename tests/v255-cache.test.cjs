require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const rating = require('../src/engine/rating.ts')
const competition = require('../src/engine/competition.ts')
const facts = require('../src/engine/playerMatchFacts.ts')
const positions = require('../src/engine/positionScope.ts')

test('rated participants and MOM reuse the unchanged timeline and roster without enumerating players', () => {
  const state = performanceFixture(1); const match = state.matches[0]
  let reads = 0
  const players = new Proxy(state.players, { get(target, key, receiver) { if (/^\d+$/.test(String(key))) reads++; return Reflect.get(target, key, receiver) } })
  const first = rating.rateMatch(match, players)
  const mom = rating.getMatchManOfTheMatch(match, players)
  reads = 0
  assert.deepEqual(rating.rateMatch(match, players), first)
  assert.equal(rating.getMatchManOfTheMatch(match, players), mom)
  assert.equal(reads, 0, 'warm calculations must not rescan the full roster')
  const copy = rating.rateMatch(match, players); copy.reverse(); copy.pop()
  assert.deepEqual(rating.rateMatch(match, players), first, 'consumer array mutations must not poison cached order')
})

test('League computes ratings once per match, preserving exact team averages', () => {
  const s = performanceFixture(1); const games = s.matches.slice(0, 32)
  const original = rating.rateMatch
  let calls = 0
  rating.rateMatch = (...args) => { calls++; return original(...args) }
  try {
    const result = competition.leagueCompetition(s.teams, games, 'Season 1', s.players)
    assert.equal(calls, games.length, 'each team must share the same match ratings')
    for (const row of result.standings) {
      const values = games.flatMap(match => original(match, s.players).filter(r => match.appearances.some(a => a.playerId === r.playerId && a.teamId === row.teamId)).map(r => r.raw))
      assert.equal(row.averageRating, values.length ? values.reduce((total, v) => total + v, 0) / values.length : 0)
    }
  } finally { rating.rateMatch = original }
})

test('rating and MOM rebuild after timeline replacement, roster replacement, removal and reorder', () => {
  const s = performanceFixture(1); const match = s.matches[0]
  const baseline = rating.rateMatch(match, s.players)
  const reversed = s.players.slice().reverse()
  assert.deepEqual(rating.rateMatch(match, reversed).map(r => r.playerId), baseline.map(r => r.playerId).reverse())
  const removed = s.players.filter(p => p.id !== baseline[0].playerId)
  assert(!rating.rateMatch(match, removed).some(r => r.playerId === baseline[0].playerId))
  match.events = [...match.events, { id: 'new-goal', type: 'goal', minute: 30, teamId: match.teamId, playerId: s.players[8].id }]
  const updated = rating.rateMatch(match, s.players)
  assert.notDeepEqual(updated, baseline)
  const copy = { ...match, events: structuredClone(match.events), appearances: structuredClone(match.appearances) }
  assert.deepEqual(updated, rating.rateMatch(copy, s.players))
  assert.equal(rating.getMatchManOfTheMatch(match, s.players), rating.getMatchManOfTheMatch(copy, s.players))
})

test('appearance index shares ordered historical lookups and protects its rows from consumer mutations', () => {
  const s = performanceFixture(1); const id = s.players[8].id
  const expected = s.matches.filter(m => m.appearances.some(a => a.playerId === id))
  assert.deepEqual(facts.matchesWithPlayerAppearance(id, s.matches), expected)
  const result = facts.matchesWithPlayerAppearance(id, s.matches); result.length = 0
  assert.deepEqual(facts.matchesWithPlayerAppearance(id, s.matches), expected)
  const edited = s.matches.filter(m => m !== expected[0])
  assert.deepEqual(facts.matchesWithPlayerAppearance(id, edited), expected.slice(1))
  assert.deepEqual(facts.matchesWithPlayerAppearance('retired-missing', s.matches), [])
  s.matches[0] = { ...s.matches[0], appearances: [] }
  assert.deepEqual(facts.matchesWithPlayerAppearance(id, s.matches), expected.slice(1), 'same collection replacement must invalidate the index')
})

test('position and award families share minute analysis across equal scopes and career fallback', () => {
  const s = performanceFixture(1); let reads = 0
  const timeline = require('../src/engine/timeline.ts'); const original = timeline.creditedPositionSegments
  timeline.creditedPositionSegments = (...args) => { reads++; return original(...args) }
  try {
  const first = positions.scopedPositionFamilyByPlayer(s.players, s.matches, { seasons: ['Season 1'] })
  positions.scopedAwardFamilyByPlayer(s.players, s.matches, { seasons: ['Season 1'] })
  reads = 0
  const again = positions.scopedPositionFamilyByPlayer(s.players, s.matches, { seasons: ['Season 1'] })
  positions.scopedAwardFamilyByPlayer(s.players, s.matches, { seasons: ['Season 1'] })
  assert.deepEqual(again, first)
  assert.equal(reads, 0, 'scope reuse must not aggregate appearance minutes again')
  again.clear()
  assert.deepEqual(positions.scopedPositionFamilyByPlayer(s.players, s.matches, { seasons: ['Season 1'] }), first)
  const empty = positions.scopedPositionFamilyByPlayer(s.players, s.matches, { seasons: ['Missing'] })
  assert.deepEqual(empty, positions.scopedPositionFamilyByPlayer(s.players, s.matches, {}))
  } finally { timeline.creditedPositionSegments = original }
})

test('Records analyzes each rated player-match goal totals and each player streak only once', () => {
  const s = performanceFixture(1); const games = s.matches.slice(0, 32)
  const goals = require('../src/engine/goalTypes.ts'); const insights = require('../src/engine/seasonInsights.ts')
  const originalGoals = goals.goalTypeTotals; const originalStreaks = insights.playerStreaks
  let goalCalls = 0; let streakCalls = 0
  goals.goalTypeTotals = (...args) => { goalCalls++; return originalGoals(...args) }
  insights.playerStreaks = (...args) => { streakCalls++; return originalStreaks(...args) }
  try {
    require('../src/engine/playerRecords.ts').buildPlayerRecordLeaderboards(s.players, games)
    const perPlayer = s.players.map(p => games.filter(m => rating.ratePlayerMatch(m, p)).length)
    assert.equal(goalCalls, perPlayer.reduce((sum, n) => sum + n, 0))
    assert.equal(streakCalls, perPlayer.filter(n => n > 0).length)
  } finally { goals.goalTypeTotals = originalGoals; insights.playerStreaks = originalStreaks }
})

test('Chemistry repeats reuse the combination calculation without touching timeline facts', () => {
  const s = performanceFixture(1); const games = s.matches.slice(0, 32)
  const analytics = require('../src/engine/analytics.ts'); const timeline = require('../src/engine/timeline.ts')
  const original = timeline.creditedPositionSegments
  let reads = 0
  timeline.creditedPositionSegments = (...args) => { reads++; return original(...args) }
  try {
    const first = analytics.combinationStats(s.players, games, { season: 'Season 1' }, 'duo')
    reads = 0
    const again = analytics.combinationStats(s.players, games, { season: 'Season 1' }, 'duo')
    assert.deepEqual(again, first)
    assert.equal(reads, 0, 'revisit must reuse combinations')
    again[0].playerIds.reverse(); again[0].togetherMinutes = -1; again.pop()
    assert.deepEqual(analytics.combinationStats(s.players, games, { season: 'Season 1' }, 'duo'), first)
    const changed = games.slice(1)
    assert.notDeepEqual(analytics.combinationStats(s.players, changed, { season: 'Season 1' }, 'duo'), first)
  } finally { timeline.creditedPositionSegments = original }
})

test('scoped minute and Chemistry caches notice event/appearance replacement on existing Match objects', () => {
  const s = performanceFixture(1); const match = s.matches[0]; const games = [match]
  const analytics = require('../src/engine/analytics.ts')
  const first = analytics.combinationStats(s.players, games, {}, 'duo')
  positions.scopedPositionFamilyByPlayer(s.players, games, {})
  match.appearances = match.appearances.map(a => a.playerId === s.players[8].id ? { ...a, position: 'CM', matchPosition: 'CM' } : a)
  assert.equal(positions.scopedPositionFamilyByPlayer(s.players, games, {}).get(s.players[8].id), 'CM')
  match.events = []
  assert.notDeepEqual(analytics.combinationStats(s.players, games, {}, 'duo'), first)
})

test('Chemistry does not normalize timelines outside the requested season', () => {
  const s = performanceFixture(2)
  const analytics = require('../src/engine/analytics.ts'); const timeline = require('../src/engine/timeline.ts')
  const original = timeline.normalizeMatchTimeline; let unrelated = 0
  timeline.normalizeMatchTimeline = (match, ...args) => { if (match.season !== 'Season 2') unrelated++; return original(match, ...args) }
  try {
    analytics.combinationStats(s.players, s.matches, { season: 'Season 2' }, 'duo')
    assert.equal(unrelated, 0)
  } finally { timeline.normalizeMatchTimeline = original }
})

test('scope caches evict old combinations and minute queries at their documented limits', () => {
  const s = performanceFixture(1); const games = s.matches.slice(0, 1)
  const analytics = require('../src/engine/analytics.ts'); const timeline = require('../src/engine/timeline.ts')
  const original = timeline.creditedPositionSegments; let reads = 0
  timeline.creditedPositionSegments = (...args) => { reads++; return original(...args) }
  try {
    const first = analytics.combinationStats(s.players, games, {}, 'duo')
    for (const team of s.teams) analytics.combinationStats(s.players, games, { teamId: team.id }, 'duo')
    reads = 0
    assert.deepEqual(analytics.combinationStats(s.players, games, {}, 'duo'), first)
    assert(reads > 0, 'the seventeenth query evicts the first combination scope')
    const families = positions.scopedAwardFamilyByPlayer(s.players, games, {})
    for (let i = 0; i < 64; i++) positions.scopedAwardFamilyByPlayer(s.players, games, { seasons: [`Missing ${i}`] })
    reads = 0
    assert.deepEqual(positions.scopedAwardFamilyByPlayer(s.players, games, {}), families)
    assert(reads > 0, 'the sixty-fifth query evicts the first minute scope')
  } finally { timeline.creditedPositionSegments = original }
})
