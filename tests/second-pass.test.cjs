const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { GOOD_RATING_THRESHOLD, isGoodRating } = require('../src/engine/constants.ts')
const { classifyGoalTypes } = require('../src/engine/goalTypes.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')

const player = { id: 'cb', name: 'CB', fullName: 'CB', displayName: 'CB', position: 'CB', number: 4, teamId: 'A' }
const base = (events) => ({ id: 'm', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: [{ playerId: 'cb', teamId: 'A', role: 'bench', position: 'CB', matchPosition: 'CB' }], events })

test('second-pass regression: CB entering at 77 receives both later conceded-goal penalties', () => {
  const match = base([
    { id: 'on', type: 'sub', minute: 77, teamId: 'A', playerOutId: 'out', playerInId: 'cb', position: 'CB' },
    { id: 'g80', type: 'goal', minute: 80, teamId: 'B' },
    { id: 'g87', type: 'goal', minute: 87, teamId: 'B' },
  ])
  const rating = ratePlayerMatch(match, player)
  assert.equal(rating.minutes, 13)
  assert.equal(rating.noConceded, 1.35 * .73 * 13 / 90)
  assert.equal(rating.conceded, -.5)
  assert.equal(rating.result, -.1)
  assert(Math.abs(rating.raw - 6.04235) < 1e-10)
  assert.equal(rating.rating.toFixed(1), '6.0')
})

test('same-minute event ordering preserves saved legacy order', () => {
  const before = base([{ id: 'goal', type: 'goal', minute: 77, teamId: 'B' }, { id: 'on', type: 'sub', minute: 77, teamId: 'A', playerOutId: 'out', playerInId: 'cb', position: 'CB' }])
  const after = base([{ id: 'on', type: 'sub', minute: 77, teamId: 'A', playerOutId: 'out', playerInId: 'cb', position: 'CB' }, { id: 'goal', type: 'goal', minute: 77, teamId: 'B' }])
  assert.equal(ratePlayerMatch(before, player).conceded, 0)
  assert.equal(ratePlayerMatch(after, player).conceded, -.25)
})

test('good rating threshold is centrally 7.2', () => {
  assert.equal(GOOD_RATING_THRESHOLD, 7.2)
  assert.equal(isGoodRating(7.19), false)
  assert.equal(isGoodRating(7.2), true)
})

test('goal types retain score-state semantics and late drama is not cosmetic', () => {
  const match = { ...base([
    { id: 'away', type: 'goal', minute: 10, teamId: 'B' },
    { id: 'equal', type: 'goal', minute: 89, teamId: 'A', playerId: 'cb' },
    { id: 'lead', type: 'goal', minute: 90, teamId: 'A', playerId: 'cb' },
  ]), appearances: [] }
  const goals = classifyGoalTypes(match)
  assert(goals[1].tags.includes('equalizer') && goals[1].tags.includes('lateDrama'))
  assert(goals[2].tags.includes('goAhead') && goals[2].tags.includes('comeback') && goals[2].tags.includes('winning') && goals[2].tags.includes('lateDrama'))
})
