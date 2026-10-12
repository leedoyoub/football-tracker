require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { test, after } = require('node:test')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const root = path.resolve(__dirname, '..')
const baseline = fs.mkdtempSync(path.join(os.tmpdir(), 'football-v259-scaling-'))
if (!path.resolve(baseline).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Unexpected baseline path')
execFileSync('tar', ['-xf', '-', '-C', baseline], { input: execFileSync('git', ['archive', '090d6f07d7d9910b41fd1fbb05382dcf0d884258', 'src'], { cwd: root, maxBuffer: 16 * 1024 * 1024 }) })
fs.symlinkSync(path.join(root, 'node_modules'), path.join(baseline, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
after(() => fs.rmSync(baseline, { recursive: true, force: true }))
const old = file => require(path.join(baseline, 'src', file))
const trend = require('../src/engine/playerRankTrend.ts')
const metrics = ['rating', 'goals', 'assists', 'g+a', 'sotAllowed', 'defenderGaPer90', 'cleanSheets', 'saves', 'goalkeeperGaPer90']

test('Rank Trend skips team-opportunity traversal for core and count metrics while defensive eligibility keeps it', () => {
  const s = performanceFixture(1); s.matches = s.matches.slice(0, 64)
  const facts = require('../src/engine/defensiveRanking.ts'); const original = facts.teamOpportunityMinutesFromIndex
  let calls = 0; facts.teamOpportunityMinutesFromIndex = (...args) => { calls++; return original(...args) }
  try {
    for (const metric of ['rating', 'goals', 'assists', 'g+a', 'cleanSheets', 'saves', 'sotAllowed']) trend.playerRankTrend(s.players[9].id, s.players, s.matches, 'Season 1', 'all', metric)
    assert.equal(calls, 0)
    trend.playerRankTrend(s.players[0].id, s.players, s.matches, 'Season 1', 'all', 'goalkeeperGaPer90')
    assert(calls > 0)
  } finally { facts.teamOpportunityMinutesFromIndex = original }
})

test('Rank Trend compares each candidate with the target instead of repeatedly sorting all-player populations', () => {
  const s = performanceFixture(1)
  const stats = require('../src/engine/stats.ts'); const original = stats.compareCoreLeaderboardRows
  let calls = 0; stats.compareCoreLeaderboardRows = (...args) => { calls++; return original(...args) }
  try {
    const points = trend.playerRankTrend(s.players[9].id, s.players, s.matches, 'Season 1', 'all', 'rating')
    assert(points.length > 20)
    assert(calls <= points.length * s.players.length * 2, `${calls} comparisons exceed linear target ranking`)
  } finally { stats.compareCoreLeaderboardRows = original }
})

test('all Rank Trend metrics preserve every Overall/Position/Team point across seasons, competitions and historical positions', () => {
  const s = performanceFixture(2); const snapshot = JSON.stringify(s)
  for (const player of [s.players[0], s.players[2], s.players[9], s.players[15]]) for (const season of ['Season 1', 'Season 2']) for (const competition of ['all', 'league', 'cup', 'champions']) for (const metric of metrics) {
    assert.deepStrictEqual(trend.playerRankTrend(player.id, s.players, s.matches, season, competition, metric), old('engine/playerRankTrend.ts').playerRankTrend(player.id, s.players, s.matches, season, competition, metric), `${player.id}:${season}:${competition}:${metric}`)
  }
  assert.equal(JSON.stringify(s), snapshot)
})

test('Rank Trend is exact after edits/deletes, player transfer/removal and fallback registration positions', () => {
  const s = performanceFixture(1)
  const matches = s.matches.slice(0, 80).map((m, i) => i ? m : { ...m, events: m.events.slice(0, 2) }).reverse().slice(1)
  for (const players of [s.players.filter((_, i) => i !== 10), s.players.map((p, i) => i === 9 ? { ...p, position: undefined, teamId: s.teams[1].id } : p)]) for (const metric of metrics) {
    assert.deepStrictEqual(trend.playerRankTrend(players[9].id, players, matches, 'Season 1', 'all', metric), old('engine/playerRankTrend.ts').playerRankTrend(players[9].id, players, matches, 'Season 1', 'all', metric))
  }
})

function teamsFor(s, mask) { return [s.teams[0].id, ...s.teams.slice(1, 8).filter((_, i) => mask & (1 << i)).map(t => t.id)] }
for (const [name, capacity] of [['Global Ranking', 64], ['Rank Trend', 64], ['Player Derived', 32], ['Player Records', 32]]) test(`${name} query cache is bounded, preserves a recent O(1) identity hit and recomputes evicted queries exactly`, () => {
  const s = performanceFixture(1); s.matches = []
  const query = i => {
    const teamIds = teamsFor(s, i)
    if (name === 'Global Ranking') return require('../src/engine/stats.ts').buildGlobalRankingData(s.players, s.matches, { seasons: [], teams: teamIds, positions: [] }, 'rating')
    if (name === 'Rank Trend') return trend.playerRankTrend(s.players[i].id, s.players, s.matches, 'Season 1', 'all', 'rating')
    if (name === 'Player Derived') return require('../src/engine/playerDerived.ts').derivePlayerScope(s.players[9], s.players, s.matches, { teamIds })
    return require('../src/engine/playerRecords.ts').buildPlayerRecordLeaderboards(s.players, s.matches, { teamIds })
  }
  const first = query(0)
  for (let i = 1; i <= capacity; i++) query(i)
  const recent = query(capacity); assert.equal(query(capacity), recent)
  const again = query(0); assert.notEqual(again, first); assert.deepStrictEqual(again, first)
})
