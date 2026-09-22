const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { classifyGoalTypes, goalTypeTotals } = require('../src/engine/goalTypes.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')

const game = (events) => ({ id: 'goal-types', season: 'Season 1', matchDay: 1, date: '2026-09-20', duration: 90, homeTeamId: 'H', awayTeamId: 'A', appearances: [], events })
const goal = (id, minute, teamId, playerId, extra = {}) => ({ id, minute, sequence: Number(id.replace(/\D/g, '')) || undefined, type: 'goal', teamId, playerId, ...extra })

test('v2.2.13 classifies every credited goal into exactly one requested base type using stable score replay', () => {
  const match = game([
    goal('1', 1, 'H', 'P1'), goal('2', 2, 'A'), goal('3', 3, 'A'), goal('4', 4, 'A'),
    goal('5', 4, 'H', 'P1'), goal('6', 5, 'H', 'P1'), goal('7', 6, 'H', 'P1'), goal('8', 91, 'H', 'P1'), goal('9', 95, 'H', 'P1'),
    goal('10', 92, 'A', 'OWN', { ownGoal: true }),
  ])
  const totals = goalTypeTotals(match, 'P1', 'H')
  assert.deepEqual(totals, { opening: 1, equalizer: 1, goAhead: 1, leadExtending: 2, deficitReducing: 1, gameWinning: 1, comeback: 1, stoppageTime: 2 })
  assert.equal(totals.opening + totals.equalizer + totals.goAhead + totals.leadExtending + totals.deficitReducing, 6)
  assert.equal(classifyGoalTypes(match).filter(row => row.event.playerId === 'OWN').length, 0)
})

test('v2.2.13 does not call a normal go-ahead a comeback and has no game winner in a draw', () => {
  const match = game([goal('1', 10, 'H', 'P1'), goal('2', 20, 'A'), goal('3', 30, 'H', 'P1'), goal('4', 40, 'A')])
  const totals = goalTypeTotals(match, 'P1', 'H')
  assert.equal(totals.comeback, 0)
  assert.equal(totals.gameWinning, 0)
  assert.equal(totals.goAhead, 1)
})

test('v2.2.13 consumes comeback opportunities and only rearms them after a team trails and equalizes again', () => {
  const match = game([
    goal('1', 1, 'A'), goal('2', 2, 'H', 'P1'), goal('3', 3, 'H', 'P1'), // 0-1, 1-1, 2-1 comeback
    goal('4', 4, 'A'), goal('5', 5, 'H', 'P1'), // 2-2, 3-2 normal go-ahead
    goal('6', 6, 'A'), goal('7', 7, 'A'), goal('8', 8, 'H', 'P1'), goal('9', 9, 'H', 'P1'), // 3-3, 3-4, 4-4, 5-4 new comeback
  ])
  const rows = classifyGoalTypes(match)
  const row = (id) => rows.find(entry => entry.event.id === id)
  assert.equal(row('3').tags.includes('comeback'), true)
  assert.equal(row('5').tags.includes('comeback'), false)
  assert.equal(row('9').tags.includes('comeback'), true)
})

test('v2.2.13 applies own-goal score changes to comeback sequence state without crediting an own goal', () => {
  const match = game([
    goal('1', 1, 'A'),
    goal('2', 2, 'A', 'OWN', { ownGoal: true }), // A own goal: H equalizes but receives no credit
    goal('3', 3, 'H', 'P1'),
  ])
  const rows = classifyGoalTypes(match)
  assert.equal(rows.some(entry => entry.event.id === '2'), false)
  assert.equal(rows.find(entry => entry.event.id === '3').tags.includes('comeback'), true)
})

test('v2.2.13 exposes only the requested goal-type record leaderboards without zero-value leaders', () => {
  const player = { id: 'P1', name: 'Player', displayName: 'Player', number: 9, position: 'ST', teamId: 'H', teamIds: ['H'] }
  const match = game([goal('1', 91, 'H', 'P1')])
  match.appearances = [{ playerId: 'P1', teamId: 'H', role: 'starter', position: 'ST', minuteIn: 0, minuteOut: 90 }]
  const groups = buildPlayerRecordLeaderboards([player], [match])
  const goalGroups = groups.filter(group => ['game-winning-goals', 'comeback-goals', 'equalizers', 'opening-goals', 'stoppage-time-goals'].includes(group.id))
  assert.deepEqual(goalGroups.map(group => group.id), ['game-winning-goals', 'comeback-goals', 'equalizers', 'opening-goals', 'stoppage-time-goals'])
  assert.equal(goalGroups.find(group => group.id === 'comeback-goals').rows.length, 0)
})
