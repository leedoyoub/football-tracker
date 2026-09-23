const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { POSITION_RULES, ratePlayerMatch, sotMultiplier } = require('../src/engine/rating.ts')

const near = (actual, expected) => assert(Math.abs(actual - expected) < 1e-9, `${actual} !== ${expected}`)
const player = (id, position, teamId = 'A') => ({ id, name: id, displayName: id, teamId, position, number: 1 })
const appearance = (item) => ({ playerId: item.id, teamId: item.teamId, role: 'starter', position: item.position, matchPosition: item.position })
function game(players, events = []) {
  return { id: `m:${events.length}:${players.map(item => item.id).join(':')}`, season: 'S1', competitionType: 'league', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', teamId: 'A', appearances: players.map(appearance), events }
}
function suppressionFixture(position, saves) {
  const subject = player(`subject:${position}`, position)
  const keeper = player(`keeper:${position}`, 'GK')
  return { subject, match: game([subject, keeper], saves ? [{ id: `save:${position}`, type: 'save', minute: 20, teamId: 'A', playerId: keeper.id, count: saves }] : []) }
}

test('v2.3.3 release metadata and revision-10 table contain exactly the approved changes', () => {
  assert.equal(APP_VERSION, '2.3.3')
  assert.equal(require('../package.json').version, '2.3.3')
  assert.equal(RATING_ENGINE_REVISION, 10)
  const expected = { LM: [.06, .25], RM: [.06, .25], CM: [.08, .30], LCM: [.08, .30], RCM: [.08, .30], CDM: [.06, .80], LDM: [.06, .80], RDM: [.06, .80] }
  for (const [position, values] of Object.entries(expected)) assert.deepEqual([POSITION_RULES[position].teamGoal, POSITION_RULES[position].suppressionMax], values, position)
  assert.deepEqual([POSITION_RULES.ST.goal, POSITION_RULES.CB.suppressionMax, POSITION_RULES.GK.assist], [.9, 1.3, 1])
})

test('revision-10 keeps the SOT curve and applies approved suppression ceilings', () => {
  assert.equal(sotMultiplier(0), 1); assert.equal(sotMultiplier(3), .62); assert.equal(sotMultiplier(10), .20)
  for (const [position, maximum] of [['LM', .25], ['RM', .25], ['CM', .30], ['LCM', .30], ['RCM', .30], ['CDM', .80], ['LDM', .80], ['RDM', .80]]) {
    const zero = suppressionFixture(position, 0)
    const three = suppressionFixture(position, 3)
    near(ratePlayerMatch(zero.match, zero.subject).noConceded, maximum)
    near(ratePlayerMatch(three.match, three.subject).noConceded, maximum * .62)
  }
})

test('revision-10 team-goal bonus excludes scorer and assister', () => {
  for (const [position, expected] of [['LM', .06], ['CM', .08], ['CDM', .06]]) {
    const subject = player(`subject:${position}`, position)
    const scorer = player(`scorer:${position}`, 'ST')
    const assister = player(`assister:${position}`, 'CAM')
    const neutral = game([subject, scorer, assister], [{ id: `goal:${position}`, type: 'goal', minute: 20, teamId: 'A', playerId: scorer.id, assistPlayerId: assister.id }])
    near(ratePlayerMatch(neutral, subject).teamGoals, expected)
    near(ratePlayerMatch(neutral, scorer).teamGoals, 0)
    near(ratePlayerMatch(neutral, assister).teamGoals, 0)
  }
})
