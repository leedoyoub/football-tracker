const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { GOALKEEPER_BASE_RATING, getMatchManOfTheMatch, ratePlayerMatch, saveBonusPerSave, sotMultiplier } = require('../src/engine/rating.ts')
const { aggregatePlayerStats } = require('../src/engine/stats.ts')
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const player = (id = 'p', position = 'CM') => ({ id, name: id, position, teamId: 'A', number: 1 })
const game = (p, position = p.position, props = {}) => ({ id: 'm', season: 'S', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: p.id, teamId: 'A', position, matchPosition: position, role: 'starter' }], events: [], ...props })
const goal = (minute, props = {}) => ({ id: `g${minute}`, type: 'goal', minute, teamId: 'A', ...props })

test('final direct goal and assist coefficients apply at event positions', () => {
  const st = player('st', 'ST'), cb = player('cb', 'CB')
  const stMatch = game(st); stMatch.events = [goal(10, { playerId: 'st' }), goal(20, { assistPlayerId: 'st' })]
  const cbMatch = game(cb); cbMatch.events = [goal(10, { playerId: 'cb' }), goal(20, { assistPlayerId: 'cb' })]
  near(ratePlayerMatch(stMatch, st).goals, .85); near(ratePlayerMatch(stMatch, st).assists, .5)
  near(ratePlayerMatch(cbMatch, cb).goals, 1.35); near(ratePlayerMatch(cbMatch, cb).assists, .75)
})

test('uninvolved team goals exclude scorer and assister and use event-time position', () => {
  const p = player(); const match = game(p)
  match.appearances[0].positionHistory = [{ minute: 30, position: 'CDM' }]
  match.events = [goal(10, { playerId: 'p' }), goal(20, { playerId: 'mate', assistPlayerId: 'p' }), goal(40, { playerId: 'mate' })]
  near(ratePlayerMatch(match, p).teamGoals, .10)
  const cb = player('cb', 'CB'); const cbMatch = game(cb); cbMatch.events = [goal(20, { playerId: 'mate' })]
  near(ratePlayerMatch(cbMatch, cb).teamGoals, 0)
})

test('SOT curve and minute-prorated suppression use the finalized values', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 10].map(sotMultiplier), [1, .86, .73, .62, .45, .20])
  for (const [minutes, expected] of [[30, .45], [45, .675], [60, .9], [90, 1.35]]) {
    const cb = player(`cb${minutes}`, 'CB'); const match = game(cb); match.appearances[0].role = 'bench'; match.events = [{ id: 'on', type: 'sub', minute: 90 - minutes, teamId: 'A', playerOutId: 'out', playerInId: cb.id, position: 'CB' }]
    near(ratePlayerMatch(match, cb).noConceded, expected)
  }
})

test('conceded penalties honor on-pitch event-time position and individual cause', () => {
  const cb = player('cb', 'CB'); const off = game(cb); off.events = [{ id: 'off', type: 'sub', minute: 30, teamId: 'A', playerOutId: 'cb', playerInId: 'x', position: 'CB' }, goal(40, { teamId: 'B' })]
  near(ratePlayerMatch(off, cb).conceded, 0)
  const sub = player('sub', 'CB'); const after = game(sub); after.appearances[0].role = 'bench'; after.events = [goal(20, { teamId: 'B' }), { id: 'on', type: 'sub', minute: 30, teamId: 'A', playerOutId: 'x', playerInId: 'sub', position: 'CB' }]
  near(ratePlayerMatch(after, sub).conceded, 0)
  const changed = player('changed', 'CB'); const match = game(changed); match.appearances[0].positionHistory = [{ minute: 50, position: 'CDM' }]; match.events = [goal(20, { teamId: 'B' }), goal(60, { teamId: 'B', concededGoalCausePlayerId: 'changed' })]
  near(ratePlayerMatch(match, changed).conceded, -.35); near(ratePlayerMatch(match, changed).concededCause, -.3)
  for (const [position, penalty] of [['LB', -.2], ['CDM', -.1], ['CM', -.08], ['LM', -.04]]) { const p = player(position, position); const m = game(p); m.events = [goal(30, { teamId: 'B' })]; near(ratePlayerMatch(m, p).conceded, penalty) }
})

test('GK base and save-rate bands are derived safely from saves and conceded goals', () => {
  const gk = player('gk', 'GK'); const empty = game(gk)
  assert.equal(ratePlayerMatch(empty, gk).base, GOALKEEPER_BASE_RATING); near(ratePlayerMatch(empty, gk).saves, 0)
  assert.deepEqual([.8, .6, .4, .2, 0].map(saveBonusPerSave), [.25, .22, .20, .16, .12])
  const match = game(gk); match.events = [{ id: 's', type: 'save', teamId: 'A', playerId: 'gk', minute: 20, count: 4 }, goal(30, { teamId: 'B' })]
  near(ratePlayerMatch(match, gk).saves, 1); near(ratePlayerMatch(match, gk).conceded, -.25)
})

test('historical rating derivation is raw-data-safe, clamped, and drives averages and MOM', () => {
  const p = player('p', 'ST'), other = player('other', 'ST'); const one = game(p); one.appearances.push({ playerId: 'other', teamId: 'A', position: 'ST', matchPosition: 'ST', role: 'starter' }); one.events = [goal(20, { playerId: 'p' })]
  const two = { ...one, id: 'm2', events: [goal(20, { playerId: 'other' }), goal(30, { playerId: 'other' }), goal(40, { playerId: 'other' }), goal(50, { playerId: 'other' }), goal(60, { playerId: 'other' })] }
  const before = JSON.stringify([one, two]); assert.equal(getMatchManOfTheMatch(one, [p, other]), 'p'); assert.equal(getMatchManOfTheMatch(two, [p, other]), 'other')
  const stats = aggregatePlayerStats(p, [p, other], [one, two]); near(stats.avgRating, (ratePlayerMatch(one, p).raw + ratePlayerMatch(two, p).raw) / 2)
  assert.equal(ratePlayerMatch(two, other).rating, 10); assert.equal(JSON.stringify([one, two]), before)
})
