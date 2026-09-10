const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const rating = require('../src/engine/rating.ts')
const timeline = require('../src/engine/timeline.ts')
const stats = require('../src/engine/stats.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { substituteImpact } = require('../src/engine/substituteImpact.ts')
const { combinationStats, onPitchStats } = require('../src/engine/analytics.ts')
const { playerForm } = require('../src/engine/seasonInsights.ts')
const { rebuildLiveHistory } = require('../src/screens/liveHistory.ts')
const { moveSubstitution } = require('../src/screens/matchLineup.ts')
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const player = (id = 'p', position = 'CB') => ({ id, name: id, displayName: id, number: 4, teamId: 'A', position, rating: 6.5 })
const app = (p, role = 'starter', extra = {}) => ({ playerId: p.id, teamId: 'A', role, position: p.position, matchPosition: p.position, ...extra })
const goal = (id, minute, extra = {}) => ({ id, type: 'goal', teamId: 'B', minute, ...extra })
const sub = (minute, playerInId = 'p', playerOutId = 'out', extra = {}) => ({ id: `sub-${minute}-${playerInId}`, type: 'sub', teamId: 'A', minute, playerInId, playerOutId, position: 'CB', ...extra })
const game = (p, events = [], extra = {}) => ({ id: 'm', season: 'S1', matchDay: 1, date: '2020-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [app(p)], events, ...extra })
const filters = { seasons: [], teams: [], positions: [] }

function gerardFixture() {
  const p = { ...player('gerard', 'LB'), name: 'Gerard Martín' }
  const m = game(p, [10, 20, 30, 40].map(minute => goal(`own-${minute}`, minute, { teamId: 'A' })).concat([sub(77, p.id, 'out'), goal('g89', 89), goal('g90', 90)]), { appearances: [app(p, 'bench')], manOfMatchPlayerId: 'obsolete-mom' })
  return { p, m }
}

test('Gerard Martín: both 89 and 90 count after entering CB at 77 in a 4–2 win', () => {
  const { p, m } = gerardFixture(), before = JSON.stringify({ p, m })
  const result = rating.ratePlayerMatch(m, p), trace = rating.tracePlayerMatchRating(m, p)
  assert.deepEqual(rating.matchScore(m), { home: 4, away: 2 })
  assert.deepEqual(trace.concededGoals.map(row => [row.minute, row.onPitch, row.position, row.penalty]), [[89, true, 'CB', -.25], [90, true, 'CB', -.25]])
  assert.deepEqual([result.enter, result.exit, result.minutes], [77, 90, 13])
  near(result.conceded, -.5); near(result.result, .1); near(result.noConceded, .14235)
  near(result.raw, 6.24235); near(trace.componentSum, result.preClamp)
  assert.equal(result.rating.toFixed(1), '6.2'); assert.equal(trace.opponentSot, 2)
  assert.equal(JSON.stringify({ p, m }), before)
})

for (const [label, role, events, minutes, penalty] of [
  ['full appearance includes final goal', 'starter', [goal('end', 90)], 90, -.25],
  ['starter leaves before goal', 'starter', [sub(65, 'next', 'p'), goal('late', 70)], 65, 0],
  ['late substitute excludes earlier goal', 'bench', [goal('before', 76), sub(77), goal('late', 89), goal('end', 90)], 13, -.5],
  ['five-minute appearance has no penalty eligibility threshold', 'bench', [sub(85), goal('late', 89)], 5, -.25],
  ['substitute exits again', 'bench', [sub(60), goal('on', 70), sub(80, 'next', 'p'), goal('off', 85)], 20, -.25],
  ['multiple goals and one result modifier', 'starter', [goal('one', 15), goal('two', 25), goal('three', 35)], 90, -.75],
]) test(label, () => {
  const p = player(), m = game(p, events, { appearances: [app(p, role)] }), r = rating.ratePlayerMatch(m, p)
  assert.equal(r.minutes, minutes); near(r.conceded, penalty); near(r.result, -.1)
})
test('unused bench has no rating', () => { const p = player(); assert.equal(rating.ratePlayerMatch(game(p, [], { appearances: [app(p, 'bench')] }), p), null) })
test('position lookup at full time does not resurrect a substituted-off player', () => {
  const p = player(), m = game(p, [sub(65, 'next', 'p')])
  assert.equal(timeline.matchPositionAt(m, m.appearances[0], 90), undefined)
})

for (const [initial, history, minutes, expected] of [
  ['CB', [{ minute: 70, position: 'CDM' }], [80], [-.1]],
  ['LB', [{ minute: 60, position: 'CB' }], [75], [-.25]],
  ['CM', [{ minute: 70, position: 'CM' }, { minute: 30, position: 'CB' }], [20, 50, 80], [-.08, -.25, -.08]],
]) test(`${initial} position history uses chronological event-time coefficients`, () => {
  const p = player('p', initial), m = game(p, minutes.map((minute, i) => goal(String(i), minute)), { appearances: [app(p, 'starter', { positionHistory: history })] })
  assert.deepEqual(rating.tracePlayerMatchRating(m, p).concededGoals.map(row => row.penalty), expected)
})
for (const [field, expected] of [['playerId', 1.35], ['assistPlayerId', .75], ['neither', 0]]) test(`LB → CB direct contribution ${field} at 75`, () => {
  const p = player('p', 'LB'), m = game(p, [goal('g', 75, { teamId: 'A', [field]: 'p' })], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 60, position: 'CB' }] })] })
  const r = rating.ratePlayerMatch(m, p)
  near(field === 'playerId' ? r.goals : field === 'assistPlayerId' ? r.assists : r.teamGoals, expected)
  near(r.teamGoals, 0)
})
test('uninvolved goal bonus changes with position and excludes scorer/assister', () => {
  const p = player('p', 'LB'), m = game(p, [goal('g1', 30, { teamId: 'A' }), goal('g2', 70, { teamId: 'A' }), goal('g3', 80, { teamId: 'A', playerId: 'p' }), goal('g4', 85, { teamId: 'A', assistPlayerId: 'p' })], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 60, position: 'CM' }] })] })
  near(rating.ratePlayerMatch(m, p).teamGoals, .15)
})
test('SOT suppression splits 60 CB / 30 CDM with full precision', () => {
  const p = player(), m = game(p, [goal('g', 80)], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 60, position: 'CDM' }] })] })
  const trace = rating.tracePlayerMatchRating(m, p)
  near(trace.sotBonus, (1.35 * 60 / 90 + .5 * 30 / 90) * .86)
  near(trace.suppressionIntervals.reduce((sum, row) => sum + row.bonus, 0), trace.sotBonus)
})
for (const first of [true, false]) test(`same-minute substitution ${first ? 'before' : 'after'} goal`, () => {
  const p = player(), events = first ? [sub(77), goal('same', 77)] : [goal('same', 77), sub(77)]
  const m = game(p, events, { appearances: [app(p, 'bench')] })
  near(rating.ratePlayerMatch(m, p).conceded, first ? -.25 : 0)
})
for (const first of [true, false]) test(`same-minute explicit position change ${first ? 'before' : 'after'} goal`, () => {
  const p = player(), m = game(p, [goal('same', 70, { sequence: first ? 2 : 1 })], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 70, position: 'CDM', sequence: first ? 1 : 2 }] })] })
  near(rating.ratePlayerMatch(m, p).conceded, first ? -.1 : -.25)
})
for (const first of [true, false]) test(`legacy tactical move follows associated substitution ${first ? 'before' : 'after'} same-minute goal`, () => {
  const p = player(), change = sub(70, 'other-in', 'other-out')
  const m = game(p, first ? [change, goal('g', 70)] : [goal('g', 70), change], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 70, position: 'CDM' }] })] })
  near(rating.ratePlayerMatch(m, p).conceded, first ? -.1 : -.25)
})
test('explicit event sequence overrides array order and mixed legacy events have a total order', () => {
  const p = player(), m = game(p, [goal('g', 77, { sequence: 9 }), sub(77, 'p', 'out', { sequence: 2 }), goal('unsequenced', 77)], { appearances: [app(p, 'bench')] })
  near(rating.ratePlayerMatch(m, p).conceded, -.5)
  const events = timeline.orderedEvents(m).map(row => row.event)
  for (let i = 0; i < events.length; i++) for (let j = i + 1; j < events.length; j++) assert(timeline.compareEvents(m, events[i], events[j]) < 0)
})
for (const minute of [91, 95, 99]) test(`stoppage-time goal at ${minute} remains at its real minute`, () => {
  const p = player(), m = game(p, [sub(90), goal('end', minute)], { appearances: [app(p, 'bench')] })
  const r = rating.ratePlayerMatch(m, p)
  assert.equal(r.minutes, minute - 90); near(r.conceded, -.25)
  assert.equal(timeline.normalizeMatchTimeline(m).end, minute)
})
test('multiple position intervals cannot exceed the 1.0 minutes factor in stoppage time', () => {
  const p = player(), m = game(p, [goal('end', 99)], { appearances: [app(p, 'starter', { positionHistory: [{ minute: 60, position: 'CDM' }] })] })
  near(rating.ratePlayerMatch(m, p).noConceded, (1.35 * 60 / 99 + .5 * 39 / 99) * .86)
})
test('supported repeated on/off intervals exclude bench gaps from minutes and goals', () => {
  const p = player(), m = game(p, [sub(20, 'other', 'p'), goal('gap', 30), sub(40), goal('on', 50), sub(60, 'next', 'p'), goal('off', 70)])
  const r = rating.ratePlayerMatch(m, p)
  assert.equal(r.minutes, 40); near(r.conceded, -.25)
  assert.deepEqual(timeline.pitchIntervals(m, m.appearances[0]).map(row => [row.enter, row.exit]), [[0, 20], [40, 60]])
})
test('multi-GK match uses each keeper’s on-pitch GA and all own-team untimed saves for SOT', () => {
  const a = player('a', 'GK'), b = player('b', 'GK'), defender = player('d')
  const m = game(a, [goal('early', 20), sub(60, 'b', 'a', { position: 'GK' }), goal('late', 90), { id: 's1', type: 'save', teamId: 'A', playerId: 'a', count: 4 }, { id: 's2', type: 'save', teamId: 'A', playerId: 'b', count: 3 }], { appearances: [app(a), app(b, 'bench'), app(defender)] })
  const before = JSON.stringify(m)
  near(rating.ratePlayerMatch(m, a).conceded, -.25); near(rating.ratePlayerMatch(m, b).conceded, -.25)
  near(rating.ratePlayerMatch(m, a).saves, 1); near(rating.ratePlayerMatch(m, b).saves, .66)
  assert.equal(rating.opponentSotProxy(m, 'A'), 9)
  near(rating.ratePlayerMatch(m, defender).noConceded, 1.35 * .23)
  assert.equal(JSON.stringify(m), before)
})
for (const [saves, conceded, perSave] of [[4, 1, .25], [3, 2, .22], [2, 3, .20], [1, 4, .16], [1, 5, .12], [0, 0, 0]]) test(`GK save band ${saves}/${saves + conceded} is finite`, () => {
  const p = player('p', 'GK'), m = game(p, Array.from({ length: conceded }, (_, i) => goal(`g${i}`, i + 1)).concat(saves ? [{ id: 's', type: 'save', teamId: 'A', playerId: 'p', count: saves }] : []))
  const r = rating.ratePlayerMatch(m, p)
  near(r.saves, saves * perSave); near(r.base, 7.1); assert(Number.isFinite(r.raw))
})
test('legacy tactical appearance aliases, missing matchPosition, minimal goals and stored ratings normalize without writes', () => {
  const p = player(), m = game(p, [sub(77, 'p', 'out', { position: 'LCB' }), goal('g89', 89), goal('g90', 90)], { appearances: [{ playerId: 'p', teamId: 'A', position: 'LB', role: 'bench' }] })
  const before = JSON.stringify({ p, m }), r = rating.ratePlayerMatch(m, p)
  assert.equal(r.position, 'CB'); near(r.conceded, -.5)
  assert.notEqual(r.raw, p.rating); assert.equal(JSON.stringify({ p, m }), before)
})

const mutations = {
  'goal add': m => ({ ...m, events: [...m.events, goal('new', 85)] }),
  'goal delete': m => ({ ...m, events: m.events.filter(row => row.id !== 'g90') }),
  'assist edit': m => ({ ...m, events: [...m.events, goal('assist', 80, { teamId: 'A', assistPlayerId: 'gerard' })] }),
  'save add': m => ({ ...m, appearances: [...m.appearances, app(player('keeper', 'GK'))], events: [...m.events, { id: 's', type: 'save', teamId: 'A', playerId: 'keeper', count: 3 }] }),
  'substitution edit': m => ({ ...m, events: m.events.map(row => row.type === 'sub' ? { ...row, minute: 85 } : row) }),
  'position edit': m => ({ ...m, appearances: m.appearances.map(row => ({ ...row, positionHistory: [{ minute: 80, position: 'CDM' }] })) }),
  'lineup edit': m => ({ ...m, appearances: m.appearances.map(row => ({ ...row, role: 'starter', matchPosition: 'CM' })) }),
  'result edit': m => ({ ...m, events: m.events.filter(row => row.teamId !== 'A' || row.type === 'sub') }),
}
for (const [name, edit] of Object.entries(mutations)) test(`${name} invalidates rating and scope stats for the edited Match only`, () => {
  const { p, m } = gerardFixture(), players = [p], matches = [m], untouched = { ...m, id: 'untouched' }
  const old = rating.ratePlayerMatch(m, p), stable = rating.ratePlayerMatch(untouched, p), before = derivePlayerScope(p, players, matches)
  const updated = edit(m), after = rating.ratePlayerMatch(updated, p)
  assert.notStrictEqual(after, old); assert.notEqual(after.raw, old.raw)
  assert.notStrictEqual(derivePlayerScope(p, players, [updated]), before)
  assert.strictEqual(rating.ratePlayerMatch(untouched, p), stable)
})
test('rating-engine revision invalidates derived cache without changing raw Match data', () => {
  const { p, m } = gerardFixture(), before = JSON.stringify(m)
  const a = rating.ratePlayerMatch(m, p)
  assert.strictEqual(rating.ratePlayerMatch(m, { ...p, rating: 1 }), a)
  const b = rating.ratePlayerMatch(m, p, rating.RATING_ENGINE_REVISION + 1)
  assert.notStrictEqual(a, b); assert.deepEqual(a, b)
  assert.strictEqual(rating.ratePlayerMatch(m, p, rating.RATING_ENGINE_REVISION + 1), b)
  assert.equal(JSON.stringify(m), before)
})
test('all historical consumers reuse the same precise Gerard rating despite obsolete Player.rating and MOM fields', () => {
  const { p, m } = gerardFixture(), players = [p], matches = [m], r = rating.ratePlayerMatch(m, p)
  const scope = derivePlayerScope(p, players, matches), global = stats.buildGlobalRankingData(players, matches, filters, 'rating')[0]
  assert.strictEqual(rating.rateMatch(m, players)[0], r); assert.strictEqual(scope.appearances[0].rating, r); assert.strictEqual(global.ratings[0], r)
  for (const number of [scope.averageRating, global.avgRating, stats.aggregatePlayerStats(p, players, matches).avgRating, rating.tracePlayerMatchRating(m, p).raw, playerForm(p, matches).last5Average, substituteImpact(p, matches).summary.averageRating]) near(number, 6.24235)
  assert.equal(rating.getMatchManOfTheMatch(m, players), p.id)
  near(stats.unifiedBestEleven(players, matches, 'S1').slots.find(row => row.playerId === p.id).avgRating, r.raw)
})
test('clamp is shared by Player Detail, MOM, Rankings and Best XI while pre-clamp components remain visible', () => {
  const p = player('p', 'ST'), m = game(p, Array.from({ length: 10 }, (_, i) => goal(String(i), i + 1, { teamId: 'A', playerId: 'p' })))
  const r = rating.ratePlayerMatch(m, p); assert(r.preClamp > 10); assert.equal(r.raw, 10); assert.equal(r.rating, 10)
  assert.equal(derivePlayerScope(p, [p], [m]).averageRating, 10)
  assert.equal(stats.buildGlobalRankingData([p], [m], filters, 'rating')[0].avgRating, 10)
  near(rating.tracePlayerMatchRating(m, p).componentSum, r.preClamp)
})
test('GF/GA, combination and substitute impact share the inclusive end and ordered boundary', () => {
  const { p, m } = gerardFixture(), mate = player('mate'), players = [p, mate]
  const updated = { ...m, appearances: [...m.appearances, app(mate)] }
  assert.equal(onPitchStats(players, [updated], {}).find(row => row.playerId === p.id).goalsAgainst, 2)
  assert.equal(combinationStats(players, [updated], {}, 'duo')[0].goalsAgainst, 2)
  assert.equal(substituteImpact(p, [updated]).summary.goalsAgainst, 2)
})
test('legacy partnership statistics attribute final-minute goals and reject off-pitch assists', () => {
  const p = player(), mate = player('mate')
  const m = game(p, [goal('before', 76, { teamId: 'A', playerId: 'p', assistPlayerId: 'mate' }), sub(77), goal('end', 90, { teamId: 'A', playerId: 'p', assistPlayerId: 'mate' })], { appearances: [app(p, 'bench'), app(mate)] })
  const result = stats.partnershipStats('p', 'mate', [m], 'S1')
  assert.equal(result.goalsTogether, 1); assert.equal(result.assistsBtoA, 1)
})
test('historical Match and Player Detail actually render the same 6.2 single-match value', () => {
  const { p, m } = gerardFixture(), React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const path = require.resolve('../src/store.tsx'), previous = require.cache[path]
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { useStore: () => ({ players: [p], matches: [m], teams: [], deleteMatch() {} }) } }
  try {
    const { MatchDetailScreen } = require('../src/screens/MatchDetailScreen.tsx')
    const { PlayerDetailScreen } = require('../src/screens/PlayerDetailScreen.tsx')
    const matchHtml = renderToStaticMarkup(React.createElement(MatchDetailScreen, { matchId: m.id, onNavigate() {} }))
    const playerHtml = renderToStaticMarkup(React.createElement(PlayerDetailScreen, { playerId: p.id, season: 'S1', onNavigate() {}, onBack() {} }))
    assert.match(matchHtml, />6\.2</); assert.match(playerHtml, />6\.2</); assert.match(playerHtml, />6\.24</)
  } finally { if (previous) require.cache[path] = previous; else delete require.cache[path] }
})
test('live history accepts stoppage-time subs and validates goals in saved order', () => {
  const before = goal('before', 77, { teamId: 'A', playerId: 'out' }), change = sub(77)
  assert.doesNotThrow(() => rebuildLiveHistory({ CB: 'out' }, ['out', 'p'], [before, change], {}, { CB: 'CB' }))
  assert.throws(() => rebuildLiveHistory({ CB: 'out' }, ['out', 'p'], [change, before], {}, { CB: 'CB' }))
  assert.doesNotThrow(() => rebuildLiveHistory({ CB: 'out' }, ['out', 'p'], [sub(95)], {}, { CB: 'CB' }))
})
test('new live tactical moves record position order relative to earlier and later same-minute goals', () => {
  const baseline = { slotAssignments: { CB: 'p', CDM: 'mate' }, homeBench: [], events: [goal('before', 70)], positionHistories: {}, checkpoint: { slotAssignments: { CB: 'p', CDM: 'mate' }, homeBench: [] } }
  const moved = moveSubstitution(baseline, { group: 'starting', id: 'CB' }, { group: 'starting', id: 'CDM' }, baseline.slotAssignments, { CB: 'CB', CDM: 'CDM' }, 70, 'A', () => 'unused')
  const p = player(), after = goal('after', 70, { sequence: timeline.nextTimelineSequence(moved.events, moved.positionHistories) })
  const m = game(p, [...moved.events, after], { appearances: [app(p, 'starter', { positionHistory: moved.positionHistories.p })] })
  assert.deepEqual(rating.tracePlayerMatchRating(m, p).concededGoals.map(row => row.penalty), [-.25, -.1])
})
test('624-match replay shares cached timeline and rating objects on warm passes', t => {
  const players = Array.from({ length: 22 }, (_, i) => player(`p${i}`, i === 0 ? 'GK' : 'CB'))
  const matches = Array.from({ length: 624 }, (_, i) => game(players[0], [goal('late', 90)], { id: `m${i}`, appearances: players.map(p => app(p)) }))
  const start = performance.now(), cold = matches.map(m => rating.rateMatch(m, players)), coldMs = performance.now() - start
  const warmStart = performance.now(), warm = matches.map(m => rating.rateMatch(m, players)), warmMs = performance.now() - warmStart
  assert.strictEqual(cold[400][10], warm[400][10]); assert.strictEqual(timeline.normalizeMatchTimeline(matches[0]), timeline.normalizeMatchTimeline(matches[0]))
  t.diagnostic(`624 matches × 22 players: cold ${coldMs.toFixed(2)} ms; warm ${warmMs.toFixed(2)} ms`)
})
