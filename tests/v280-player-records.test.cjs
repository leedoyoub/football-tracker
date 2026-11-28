require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { recordBreakers } = require('../src/engine/recordBreakers.ts')

const p = { id: 'p', teamId: 'A', name: 'P', position: 'ST' }
const q = { ...p, id: 'q' }
const match = (id, season, player, goals, more = {}) => ({
  id, season, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', duration: 90, date: `2026-01-0${id}`, matchDay: +id,
  appearances: [{ playerId: player.id, teamId: 'A', position: 'ST', role: 'starter' }],
  events: Array.from({ length: goals }, (_, index) => ({ id: `${id}-${index}`, type: 'goal', teamId: 'A', playerId: player.id, minute: 10 + index })),
  ...more,
})

test('match and season records keep repeated appearances by one player with unique evidence', () => {
  const matches = [match('1', 'S1', p, 2), match('2', 'S1', q, 2), match('3', 'S2', p, 1)]
  const records = buildPlayerRecordLeaderboards([p, q], matches, {}, ['highest-goals', 'season-goals'])
  const singles = records.find(group => group.id === 'highest-goals')
  assert.deepEqual(singles.rows.map(row => [row.playerId, row.matchId, row.rank]), [['p', '1', 1], ['q', '2', 1], ['p', '3', 3]])
  const seasons = records.find(group => group.id === 'season-goals')
  assert.deepEqual(seasons.rows.map(row => [row.playerId, row.season, row.rank]), [['p', 'S1', 1], ['q', 'S1', 1], ['p', 'S2', 3]])
})

test('streak evidence survives unused benches and crosses season boundaries', () => {
  const bench = { playerId: p.id, teamId: 'A', position: 'ST', role: 'bench' }
  const matches = [match('1', 'S1', p, 1), match('2', 'S1', p, 0, { appearances: [bench] }), match('3', 'S2', p, 1)]
  const [group] = buildPlayerRecordLeaderboards([p], matches, {}, ['scoring-streak'])
  assert.equal(group.rows[0].numeric, 2)
  assert.deepEqual(group.rows[0].streakMatchIds, [['1', '3']])
})

test('a played outfield match ends a GK streak and all equal longest runs retain their evidence', () => {
  const clean = id => match(id, 'S1', p, 0, { appearances: [{ playerId: p.id, teamId: 'A', position: 'GK', role: 'starter' }] })
  const matches = [clean('1'), clean('2'), match('3', 'S1', p, 0), clean('4'), clean('5')]
  const [group] = buildPlayerRecordLeaderboards([p], matches, {}, ['clean-sheet-streak'])
  assert.equal(group.rows[0].numeric, 2)
  assert.deepEqual(group.rows[0].streakMatchIds, [['1', '2'], ['4', '5']])
})

test('record history distinguishes first marks, ties, strict breaks and same-array revisions', () => {
  const matches = [match('1', 'S1', p, 1), match('2', 'S1', q, 1), match('3', 'S2', p, 2)]
  const highGoals = () => recordBreakers([p, q], matches).filter(row => row.recordId === 'highest-goals')
  assert.deepEqual(highGoals().map(row => [row.match.id, row.previous, row.value, row.tied]), [['3', 1, 2, false], ['2', 1, 1, true]])
  matches[0] = match('1', 'S1', p, 3)
  assert.deepEqual(highGoals(), [])
  matches.splice(0, 1)
  assert.deepEqual(highGoals().map(row => [row.match.id, row.previous, row.value, row.tied]), [['3', 1, 2, false]])
})
