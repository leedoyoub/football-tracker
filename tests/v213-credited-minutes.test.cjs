const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const timeline = require('../src/engine/timeline.ts')
const rating = require('../src/engine/rating.ts')
const { aggregatePlayerStats, buildGlobalRankingData } = require('../src/engine/stats.ts')
const { substituteImpact } = require('../src/engine/substituteImpact.ts')

const player = (id, position = 'CB') => ({ id, name: id, displayName: id, number: 1, teamId: 'A', position })
const appearance = (p, role = 'starter', extra = {}) => ({ playerId: p.id, teamId: 'A', role, position: p.position, matchPosition: p.position, ...extra })
const sub = (minute, playerInId, playerOutId = 'out', position = 'CB') => ({ id: `sub:${minute}:${playerInId}:${playerOutId}`, type: 'sub', minute, teamId: 'A', playerInId, playerOutId, position })
const goal = (id, minute, extra = {}) => ({ id, type: 'goal', minute, teamId: 'A', ...extra })
const game = (id, appearances, events = [], duration = 95) => ({ id, season: 'S1', matchDay: 1, date: '2026-09-16', teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', duration, appearances, events })
const filters = { seasons: ['S1'], teams: [], positions: [] }
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

test('canonical credited minutes clip every true interval to regulation', () => {
  const cases = [
    ['starter to 95', 'starter', [], 90],
    ['starter off at 60', 'starter', [sub(60, 'other', 'p')], 60],
    ['sub 60 to 95', 'bench', [sub(60, 'p')], 30],
    ['sub 85 to 95', 'bench', [sub(85, 'p')], 5],
    ['sub 90 to 95', 'bench', [sub(90, 'p')], 0],
    ['sub 92 to 95', 'bench', [sub(92, 'p')], 0],
    ['starter off at 92', 'starter', [sub(92, 'other', 'p')], 90],
    ['80 to 93', 'bench', [sub(80, 'p'), sub(93, 'other', 'p')], 10],
  ]
  for (const [label, role, events, expected] of cases) {
    const p = player('p'), match = game(label, [appearance(p, role)], events)
    assert.equal(timeline.creditedMinutesPlayed(match, match.appearances[0]), expected, label)
    assert.equal(rating.ratePlayerMatch(match, p)?.minutes, expected, label)
  }
})

test('true stoppage timeline preserves position and event attribution while credited projection does not', () => {
  const p = player('p'), match = game('position', [appearance(p, 'starter', { positionHistory: [{ minute: 92, position: 'ST' }] })], [goal('late', 94, { playerId: 'p' })])
  const before = JSON.stringify(match)
  assert.equal(timeline.normalizeMatchTimeline(match).end, 95)
  assert.deepEqual(timeline.creditedPositionSegments(match, match.appearances[0]).map(row => [row.position, row.enter, row.exit]), [['CB', 0, 90]])
  assert.equal(timeline.matchPositionAtEvent(match, match.appearances[0], match.events[0]), 'ST')
  const result = rating.ratePlayerMatch(match, p)
  assert.equal(result.minutes, 90); assert.equal(result.goals, .85)
  assert.deepEqual(rating.matchScore(match), { home: 1, away: 0 })
  assert.equal(JSON.stringify(match), before)
})

test('a stoppage-only substitute is a rated appearance, unlike an unused substitute', () => {
  const p = player('p', 'ST'), unused = player('unused', 'ST')
  const match = game('late-sub', [appearance(p, 'bench'), appearance(unused, 'bench')], [sub(92, 'p', 'out', 'ST'), goal('late', 94, { playerId: 'p' })])
  const result = rating.ratePlayerMatch(match, p)
  assert(result); assert.equal(result.minutes, 0); assert.equal(result.goals, .85)
  assert.equal(timeline.hasPitchAppearance(match, match.appearances[0]), true)
  assert.equal(rating.ratePlayerMatch(match, unused), null)
  const stats = aggregatePlayerStats(p, [p, unused], [match])
  assert.deepEqual([stats.matches, stats.subs, stats.minutes, stats.goals], [1, 1, 0, 1])
  const impact = substituteImpact(p, [match])
  assert.deepEqual([impact.summary.apps, impact.summary.minutes, impact.summary.goals], [1, 0, 1])
  assert.equal(impact.summary.gaPer90, 0)
  assert.equal(buildGlobalRankingData([p], [match], filters, 'goals/90')[0].value, 0)
})

test('historical global minutes, per-90 values, and the 60-minute qualifier use credited time', () => {
  const p = player('p')
  const first = game('first', [appearance(p)], [goal('g1', 94, { playerId: 'p' })])
  const second = game('second', [appearance(p, 'bench')], [sub(60, 'p'), goal('g2', 95, { assistPlayerId: 'p' })])
  const row = buildGlobalRankingData([p], [first, second], filters, 'rating')[0]
  assert.deepEqual([row.minutes, row.goals, row.assists], [120, 1, 1])
  near(buildGlobalRankingData([p], [first, second], filters, 'goals/90')[0].value, .75)
  near(buildGlobalRankingData([p], [first, second], filters, 'assists/90')[0].value, .75)
  near(buildGlobalRankingData([p], [first, second], filters, 'g+a/90')[0].value, 1.5)
  const short = game('short', [appearance(p, 'bench')], [sub(35, 'p')])
  const shortRow = buildGlobalRankingData([p], [short], filters, 'sotAllowed')[0]
  assert.equal(shortRow.minutes, 55); assert.equal(shortRow.sotAllowedAppearances, 0)
})

test('stoppage saves and concessions remain real events, but SOT shares cap at 90', () => {
  const keeper = player('gk', 'GK'), cb = player('cb', 'CB')
  const match = game('keeper', [appearance(keeper), appearance(cb)], [
    { id: 'save', type: 'save', minute: 94, teamId: 'A', playerId: 'gk', count: 1 },
    goal('against', 94, { teamId: 'B' }),
  ])
  const keeperRating = rating.ratePlayerMatch(match, keeper), cbRating = rating.ratePlayerMatch(match, cb)
  assert.equal(keeperRating.minutes, 90); assert.equal(keeperRating.saves, .25); assert.equal(keeperRating.conceded, -.35)
  assert.equal(cbRating.minutes, 90); assert.equal(cbRating.conceded, -.35)
  const normalPlayer = player('normal'), extendedPlayer = player('extended')
  const normal = game('normal', [appearance(normalPlayer)], [], 90)
  const extended = game('extended', [appearance(extendedPlayer)], [], 95)
  near(rating.ratePlayerMatch(normal, normalPlayer).noConceded, rating.ratePlayerMatch(extended, extendedPlayer).noConceded)
})

test('MOM minute tie-break treats 90 and 95 true-minute starters as equal credited minutes', () => {
  const a = player('a'), b = player('b')
  const match = game('mom', [appearance(a), appearance(b)], [sub(90, 'other', 'b')])
  assert.equal(rating.ratePlayerMatch(match, a).minutes, 90)
  assert.equal(rating.ratePlayerMatch(match, b).minutes, 90)
  assert(['a', 'b'].includes(rating.getMatchManOfTheMatch(match, [a, b])))
})

test('Match Detail reads its player-minute display from the canonical rating minutes', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/MatchDetailScreen.tsx'), 'utf8')
  assert(source.includes('Player minutes'))
  assert(source.includes('ratings[appearance.playerId].minutes'))
  assert(source.includes('stoppage-time events remain in the timeline'))
})
