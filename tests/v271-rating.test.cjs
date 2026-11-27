require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { getMatchManOfTheMatch, rateMatch, ratePlayerMatch, saveBonusPerSave, sotMultiplier, tracePlayerMatchRating } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, unifiedBestEleven } = require('../src/engine/stats.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')

const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`)
const player = (id, position) => ({ id, name: id, teamId: 'new-team', number: 1, position, rating: 3 })
const appearance = (id, position, extra = {}) => ({ playerId: id, teamId: 'A', position, matchPosition: position, role: 'starter', ...extra })
const match = (appearances, events = [], extra = {}) => ({ id: 'historic', season: 'S1', date: '2025-01-01', matchDay: 1, duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances, events, manOfMatchPlayerId: 'stored-winner', ...extra })
const goal = (id, minute, teamId = 'B', extra = {}) => ({ id, type: 'goal', minute, teamId, ...extra })
const save = (count, playerId = 'p', minute) => ({ id: `save-${playerId}-${minute}`, type: 'save', teamId: 'A', playerId, count, minute })
const sub = (minute, playerInId, playerOutId, position = 'CB') => ({ id: `sub-${minute}`, type: 'sub', teamId: 'A', minute, playerInId, playerOutId, position })

const coefficients = [
  ['ST SS LST RST', .80, .50, 0, 0, 0],
  ['LW RW', 1, .65, .04, 0, 0],
  ['CAM LAM RAM LCAM RCAM', 1, .65, .02, 0, 0],
  ['LM RM', 1.05, .65, .05, -.10, .30],
  ['CM LCM RCM', 1.05, .65, .07, -.08, .25],
  ['CDM LDM RDM', 1.15, .70, .06, -.15, .85],
  ['LB RB LWB RWB', 1.25, .70, .03, -.25, 1],
  ['CB LCB RCB', 1.35, .75, 0, -.35, 1.40],
  ['GK', 1.50, 1, 0, -.30, 0],
]

for (const [positions, scored, assisted, teamGoal, conceded, maxBonus] of coefficients) {
  for (const position of positions.split(' ')) test(`${position} uses the v2.7.1 coefficients for actual match events`, () => {
    const p = player('p', 'ST')
    const lineup = [appearance('p', position)]
    const game = match(lineup, [goal('a', 1, 'A', { playerId: 'p' }), goal('b', 2, 'A', { assistPlayerId: 'p' }), goal('c', 3, 'A'), goal('d', 4, 'B', { concededGoalCausePlayerId: 'p' })])
    const row = ratePlayerMatch(game, p)
    assert.deepEqual([row.goals, row.assists, row.teamGoals, row.conceded, row.concededCause], [scored, assisted, teamGoal, conceded, -.30])
    near(ratePlayerMatch(match(lineup), p).noConceded, maxBonus)
  })
}

test('SOT suppression follows the linear curve and floors at zero', () => {
  const exposed = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 2.5, 9.75]
  const multipliers = [1, .9, .8, .7, .6, .5, .4, .3, .2, .1, 0, 0, .75, .025]
  exposed.forEach((count, i) => near(sotMultiplier(count), multipliers[i]))
})

test('half-specific manual SOT follows the active position across early, halftime and late substitutions', () => {
  const p = player('p', 'CB')
  for (const [entry, expected] of [[15, .6533333333333333], [45, .28], [60, .1866666666666667]]) {
    const game = match([appearance('p', 'CB', { role: 'bench' })], [sub(entry, 'p', 'out')], { halftimeOpponentSot: 1, fulltimeOpponentSot: 4 })
    near(ratePlayerMatch(game, p).noConceded, expected)
  }
  const changes = [{ minute: 15, position: 'LCB' }, { minute: 30, position: 'CM' }, { minute: 60, position: 'CDM' }, { minute: 75, position: 'CB' }]
  const game = match([appearance('p', 'CB', { positionHistory: changes })], [], { halftimeOpponentSot: 1, fulltimeOpponentSot: 4 })
  const trace = tracePlayerMatchRating(game, p)
  assert.deepEqual(trace.suppressionIntervals.map(row => [row.position, row.minutes, row.sot90]), [['CB', 30, 2], ['CM', 30, 4], ['CDM', 15, 6], ['CB', 15, 6]])
  near(trace.sotBonus, (1.4 * .8 + .25 * .6) / 3 + (.85 + 1.4) * .4 / 6)
})

test('redundant same-position boundaries never duplicate a timed legacy save or alter the SOT floor', () => {
  const p = player('p', 'CB')
  const lineup = [appearance('p', 'CB'), appearance('keeper', 'GK')]
  const events = [save(6, 'keeper', 45)]
  const unbroken = match(lineup, events)
  const split = match([{ ...lineup[0], positionHistory: [{ minute: 45, position: 'LCB' }] }, lineup[1]], events)
  near(ratePlayerMatch(unbroken, p).noConceded, .56)
  near(ratePlayerMatch(split, p).noConceded, .56)
})

test('stoppage-only defenders get event penalties and zero suppression minutes', () => {
  const p = player('p', 'CB')
  const game = match([appearance('p', 'CB', { role: 'bench' })], [sub(92, 'p', 'out'), goal('late', 95)])
  const row = ratePlayerMatch(game, p)
  assert.deepEqual([row.minutes, row.noConceded, row.conceded], [0, 0, -.35])
})

test('save-rate samples interpolate continuously with a cap at 80%', () => {
  const samples = [[0, .20], [.1, .225], [.2, .25], [.3, .270], [.4, .29], [.5, .305], [.6, .32], [.7, .335], [.75, .3425], [.8, .35], [.9, .35], [1, .35]]
  samples.forEach(([rate, bonus]) => near(saveBonusPerSave(rate), bonus))
  for (const rate of [.2, .4, .6, .8]) {
    near(saveBonusPerSave(rate - 1e-11), saveBonusPerSave(rate))
    near(saveBonusPerSave(rate + 1e-11), saveBonusPerSave(rate))
  }
})

test('GK save rate uses the historical GK role and actual saves even when manual SOT disagrees', () => {
  const first = player('first', 'CM'), next = player('next', 'GK')
  const lineup = [appearance('first', 'GK', { positionHistory: [{ minute: 30, position: 'CM' }] }), appearance('next', 'GK', { role: 'bench' })]
  const events = [goal('gk-goal', 10), save(1, 'first', 20), goal('field-goal', 40), save(5, 'first', 41), sub(45, 'next', 'first', 'GK'), goal('next-goal', 70), save(3, 'next', 80)]
  const game = match(lineup, events, { halftimeOpponentSot: 2, fulltimeOpponentSot: 3 })
  const differentSot = { ...game, halftimeOpponentSot: 30, fulltimeOpponentSot: 70 }
  for (const m of [game, differentSot]) {
    near(ratePlayerMatch(m, first).saves, .305)
    near(ratePlayerMatch(m, next).saves, 3 * .3425)
  }
  for (const [goals, saves, expected] of [[0, 0, 0], [3, 0, 0], [0, 3, 1.05]]) {
    const noShots = match([appearance('next', 'GK')], [...Array.from({ length: goals }, (_, i) => goal(`g${i}`, i + 1)), ...(saves ? [save(saves, 'next')] : [])])
    const row = ratePlayerMatch(noShots, next)
    near(row.saves, expected)
    near(row.conceded, goals * -.30)
  }
})

test('SOT-only and GK-save-only revisions refresh MOM, historical average, rankings and Best XI', () => {
  const defender = player('d', 'CB'), keeper = { ...player('k', 'GK'), teamId: undefined }
  const players = [defender, keeper]
  const game = match([appearance('d', 'CB'), appearance('k', 'GK')], [save(1, 'k')], { halftimeOpponentSot: 0, fulltimeOpponentSot: 0 })
  const matches = [game]
  const filter = { seasons: ['S1'], teams: [], positions: [] }
  const history = () => derivePlayerScope(defender, players, matches, { teamIds: ['A'] })
  const ranking = () => buildGlobalRankingData(players, matches, filter, 'rating')
  assert.equal(getMatchManOfTheMatch(game, players), 'd')
  near(history().averageRating, 7.9)
  assert.equal(ranking()[0].playerId, 'd')
  const stableRating = ratePlayerMatch(game, defender)
  assert.equal(rateMatch(game, players)[0], stableRating)
  game.fulltimeOpponentSot = 10
  assert.equal(getMatchManOfTheMatch(game, players), 'k')
  near(ratePlayerMatch(game, defender).raw, 6.5)
  matches[0] = { ...game }
  near(history().averageRating, 6.5)
  assert.equal(ranking()[0].playerId, 'k')
  near(unifiedBestEleven(players, matches, 'S1').slots.find(slot => slot.playerId === 'd').avgRating, 6.5)
  matches[0] = { ...matches[0], events: [save(10, 'k')] }
  assert.equal(derivePlayerScope(keeper, players, matches).averageRating, 10)
  assert.equal(derivePlayerScope(keeper, players, matches).mom, 1)
  const restored = JSON.parse(JSON.stringify(matches))
  assert.equal(ranking()[0].avgRating, 10)
  assert.equal(derivePlayerScope(keeper, players, restored).averageRating, 10)
  matches.splice(0, 1)
  assert.equal(history().apps, 0)
  assert.equal(derivePlayerScope(keeper, players, matches).mom, 0)
})
