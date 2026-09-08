const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
const { ratePlayerMatch, matchPositionSegments, matchPositionAt } = require('../src/engine/rating.ts')
const { aggregatePlayerStats, getLeaderboard } = require('../src/engine/stats.ts')
const player = Object.freeze({ id: 'p', name: 'Player', position: 'CM', teamId: 'A', number: 10 })
const game = (position = 'CM', history = [{ minute: 60, position: 'CAM' }]) => ({
  id: 'match', season: 'S1', matchDay: 1, date: '2026-09-01', homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', duration: 90,
  appearances: [{ playerId: 'p', teamId: 'A', position: player.position, matchPosition: position, role: 'starter', positionHistory: history }], events: [],
})
const goal = (minute, props = {}) => ({ id: String(minute), type: 'goal', minute, teamId: 'A', ...props })
const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)

test('goal, assist, team goal and concession weights follow each event position; clean intervals also split at position changes', () => {
  const match = game()
  match.events = [goal(30, { playerId: 'p' }), goal(70, { playerId: 'p', goalType: 'wonder' }),
    goal(40, { playerId: 'teammate', assistPlayerId: 'p' }), goal(80, { playerId: 'teammate', assistPlayerId: 'p', goalType: 'assist-led' }),
    goal(10, { playerId: 'teammate' }), goal(65, { playerId: 'teammate' }), goal(20, { teamId: 'B' }), goal(75, { teamId: 'B' })]
  const rating = ratePlayerMatch(match, player)
  near(rating.goals, 1.1 + 1)
  near(rating.assists, .7 + .7)
  near(rating.teamGoals, .15 + .05)
  near(rating.conceded, -.2 - .1)
  const clean = .3 * ((20 / 90) ** 2 + (40 / 90) ** 2) + .15 * ((15 / 90) ** 2 + (15 / 90) ** 2)
  near(rating.noConceded, clean)
  near(rating.raw, 6.5 + .1 + 2.1 + 1.4 + .2 - .3 + clean)
  assert.equal(rating.minutes, 90); assert.equal(rating.base, 6.5)
  assert.equal(player.position, 'CM')
})

test('boundary minute belongs to the new position and a position change does not restart first-goal/assist or concession tiers', () => {
  const match = game('ST', [{ minute: 60, position: 'SS' }])
  match.events = [goal(20, { playerId: 'p' }), goal(60, { playerId: 'p' }), goal(30, { assistPlayerId: 'p' }), goal(70, { assistPlayerId: 'p' })]
  near(ratePlayerMatch(match, player).goals, .85 + .9)
  near(ratePlayerMatch(match, player).assists, .55 + .6)
  assert.equal(matchPositionAt(match, match.appearances[0], 59), 'ST')
  assert.equal(matchPositionAt(match, match.appearances[0], 60), 'SS')
  const defence = game('CAM', [{ minute: 60, position: 'CM' }])
  defence.events = [goal(70, { teamId: 'B' }), goal(20, { teamId: 'B' })]
  near(ratePlayerMatch(defence, player).conceded, -.1 - .3)
})

test('timeline is clipped to actual appearance, sorted without mutation, and redundant aliases do not split a clean interval', () => {
  const match = game('CM', [{ minute: 60, position: 'LCM' }])
  assert.deepEqual(matchPositionSegments(match, match.appearances[0]), [{ enter: 0, exit: 90, position: 'CM' }])
  near(ratePlayerMatch(match, player).noConceded, .3)
  match.appearances[0].role = 'bench'
  assert.equal(ratePlayerMatch(match, player), null)
  match.events = [{ id: 'on', type: 'sub', teamId: 'A', playerOutId: 'first', playerInId: 'p', position: 'CM', minute: 30 }, { id: 'off', type: 'sub', teamId: 'A', playerOutId: 'p', playerInId: 'next', position: 'CAM', minute: 80 }]
  match.appearances[0].positionHistory = [{ minute: 85, position: 'GK' }, { minute: 60, position: 'CAM' }]
  const original = JSON.stringify(match)
  assert.deepEqual(matchPositionSegments(match, match.appearances[0]), [{ enter: 30, exit: 60, position: 'CM' }, { enter: 60, exit: 80, position: 'CAM' }])
  assert.equal(ratePlayerMatch(match, player).minutes, 50)
  assert.equal(JSON.stringify(match), original)
})

test('GK save rewards and Saves statistics use the same timeline when an existing player switches into GK', () => {
  const match = game('CM', [{ minute: 60, position: 'GK' }])
  match.events = [{ id: 'early', type: 'save', teamId: 'A', playerId: 'p', minute: 20, count: 5 }, { id: 'late', type: 'save', teamId: 'A', playerId: 'p', minute: 70, count: 3 }, goal(10, { playerId: 'p' }), goal(65, { playerId: 'p' }), goal(75, { assistPlayerId: 'p' })]
  near(ratePlayerMatch(match, player).saves, .9)
  near(ratePlayerMatch(match, player).goals, 1.1)
  near(ratePlayerMatch(match, player).assists, 0)
  assert.equal(aggregatePlayerStats(player, [player], [match]).saves, 3)
  assert.equal(getLeaderboard([player], [match], { seasons: [], teams: [], positions: [] }, 'saves')[0].value, 3)
})

test('empty histories preserve legacy contributions exactly, including multiple legacy save counts', () => {
  const match = game('GK', undefined)
  delete match.appearances[0].positionHistory
  match.events = [2, 4, 1].map((count, index) => ({ id: String(index), type: 'save', teamId: 'A', playerId: 'p', count }))
  const before = ratePlayerMatch(match, player)
  assert.equal(before.saves, 7 * .3)
  match.appearances[0].positionHistory = []
  assert.deepEqual(ratePlayerMatch(match, player), before)
})

test('multiple corrections at the same minute keep only the final position and never invent a clean-sheet break', () => {
  const match = game('CM', [{ minute: 60, position: 'CAM' }, { minute: 60, position: 'CM' }])
  assert.deepEqual(matchPositionSegments(match, match.appearances[0]), [{ enter: 0, exit: 90, position: 'CM' }])
  near(ratePlayerMatch(match, player).noConceded, .3)
})


test('historical wonder, legacy wondergoal and assist-led flags have no rating effect and remain untouched', () => {
  for (const flags of [{ goalType: 'wonder' }, { wondergoal: true }, { goalType: 'assist-led' }]) {
    const match = game('CM', [])
    match.events = [goal(20, { playerId: 'p', ...flags }), goal(40, { playerId: 'other', assistPlayerId: 'p', ...flags })]
    const before = JSON.stringify(match)
    const normal = { ...match, events: match.events.map(({ goalType, wondergoal, ...event }) => ({ ...event, goalType: 'normal' })) }
    assert.deepEqual(ratePlayerMatch(match, player), ratePlayerMatch(normal, player))
    assert.equal(JSON.stringify(match), before)
    near(ratePlayerMatch(match, player).goals, 1.1)
    near(ratePlayerMatch(match, player).assists, .7)
  }
})
