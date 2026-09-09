const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText, filename)
const stats = require('../src/engine/stats.ts')
const keeper = { id: 'keeper', name: 'Keeper', number: 1, position: 'GK', teamId: 'C', teamIds: ['C'] }
const field = { id: 'field', name: 'Field', number: 10, position: 'CM', teamId: 'A' }
const bench = { id: 'bench', name: 'Bench', number: 12, position: 'CM', teamId: 'A' }
const other = { id: 'other', name: 'Other keeper', number: 2, position: 'GK', teamId: 'B' }
const players = [keeper, field, bench, other]
function match(id, season, teamId, count) {
  return { id, season, matchDay: Number(id.replace(/\D/g, '')) || 1, date: '2026-09-01', duration: 90, teamId, homeTeamId: teamId, awayTeamId: 'opponent',
    appearances: [{ playerId: keeper.id, teamId, role: 'starter', position: 'GK', matchPosition: 'GK' }, { playerId: field.id, teamId, role: 'starter', position: 'CM' }],
    events: [{ id: `${id}-save`, type: 'save', teamId, playerId: keeper.id, minute: 20, count }],
  }
}
const records = [match('m1', 'S1', 'A', 2), match('m2', 'S1', 'A', 4), match('m3', 'S1', 'B', 3), match('m4', 'S2', 'A', 5), match('m5', 'S2', 'B', 7)]
const filters = (seasons = [], teams = []) => ({ seasons, teams, positions: [] })
const rank = (matches = records, filter = filters()) => stats.getLeaderboard(players, matches, filter, 'saves')
const total = (filter = filters()) => rank(records, filter).find(row => row.playerId === keeper.id)?.value ?? 0
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
freeze(records); freeze(players)

test('save event count is the source of truth: 3 saves, optional legacy count/minute, and 2 + 4 accumulation', () => {
  assert.equal(rank([match('one', 'S1', 'A', 3)])[0].value, 3)
  assert.equal(stats.aggregatePlayerStats(keeper, players, records.slice(0, 2)).saves, 6)
  const legacy = match('legacy', 'S1', 'A', undefined)
  delete legacy.events[0].minute
  legacy.events.push({ ...legacy.events[0], id: 'another' })
  assert.equal(stats.aggregatePlayerStats(keeper, players, [legacy]).saves, 2)
})

test('seasons are OR, teams are OR, season and historical team filters are AND', () => {
  assert.equal(total(), 21)
  assert.equal(total(filters(['S1'])), 9)
  assert.equal(total(filters(['S2'])), 12)
  assert.equal(total(filters(['S1', 'S2'])), 21)
  assert.equal(total(filters([], ['A'])), 11)
  assert.equal(total(filters([], ['B'])), 10)
  assert.equal(total(filters([], ['A', 'B'])), 21)
  assert.equal(total(filters(['S1'], ['A'])), 6)
  assert.equal(total(filters(['S1'], ['B'])), 3)
  assert.equal(total(filters(['S2'], ['A', 'B'])), 12)
  assert.equal(total(filters([], ['C'])), 0, 'current membership is not historical membership')
  assert.equal(stats.playerSeasonStats(keeper, players, records, 'S1', 'A').saves, 6)
  assert.equal(stats.playerSeasonStats(keeper, players, records, 'S1', 'B').saves, 3)
})

test('legacy two-team match: selecting either team cannot include the other goalkeeper', () => {
  const legacy = match('legacy', 'S1', 'A', 3)
  delete legacy.teamId
  legacy.awayTeamId = 'B'
  legacy.appearances.push({ playerId: other.id, teamId: 'B', position: 'GK', role: 'starter' })
  legacy.events.push({ id: 'away-save', type: 'save', playerId: other.id, teamId: 'B', count: 4 })
  assert.deepEqual(rank([legacy], filters([], ['A'])).map(row => [row.playerId, row.value]), [['keeper', 3]])
  assert.deepEqual(rank([legacy], filters([], ['B'])).map(row => [row.playerId, row.value]), [['other', 4]])
  assert.deepEqual(rank([legacy], filters([], ['A', 'B'])).map(row => [row.playerId, row.value]), [['other', 4], ['keeper', 3]])
})

test('only actual GK appearances count; substitute time boundaries and event teamId are respected', () => {
  const game = match('sub', 'S1', 'A', 3)
  game.appearances.push({ playerId: bench.id, teamId: 'A', position: 'CM', matchPosition: 'GK', role: 'bench' })
  game.events.push({ id: 'sub', type: 'sub', playerOutId: keeper.id, playerInId: bench.id, teamId: 'A', minute: 60, position: 'GK' })
  for (const [id, playerId, teamId, minute, count] of [
    ['entered', bench.id, 'A', 60, 2], ['too-early', bench.id, 'A', 59, 50], ['off', keeper.id, 'A', 60, 50],
    ['end', bench.id, 'A', 90, 50], ['wrong-team', bench.id, 'B', 65, 50], ['field', field.id, 'A', 65, 50],
  ]) game.events.push({ id, type: 'save', playerId, teamId, minute, count })
  assert.equal(stats.aggregatePlayerStats(keeper, players, [game]).saves, 3)
  assert.equal(stats.aggregatePlayerStats(bench, players, [game]).saves, 2)
  assert.equal(stats.aggregatePlayerStats(field, players, [game]).saves, 0)
  assert.deepEqual(rank([game]).map(row => [row.playerId, row.value]), [['keeper', 3], ['bench', 2]])
  game.events = game.events.filter(event => event.type !== 'sub')
  assert.equal(stats.aggregatePlayerStats(bench, players, [game]).saves, 0)
  assert(!rank([game]).some(row => row.playerId === bench.id))
  game.appearances[0].matchPosition = 'CM'
  assert.equal(stats.aggregatePlayerStats(keeper, players, [game]).saves, 0, 'base GK playing outfield must not receive saves')
})

test('invalid counts and phantom player events do not create saves or ranking rows', () => {
  const game = match('invalid', 'S1', 'A', 3)
  for (const count of [-1, 0, 1.5, NaN, Infinity]) game.events.push({ ...game.events[0], id: String(count), count })
  game.events.push({ ...game.events[0], id: 'phantom', playerId: other.id, count: 99 })
  assert.equal(stats.aggregatePlayerStats(keeper, players, [game]).saves, 3)
  assert(!rank([game]).some(row => row.playerId === other.id))
})

test('derived statistics recalculate under the active rating engine without mutating inputs', () => {
  const sample = records.map(game => ({ ...game, events: [...game.events, { id: `${game.id}-goal`, type: 'goal', teamId: game.teamId, playerId: field.id, assistPlayerId: keeper.id, minute: 40 }] }))
  freeze(sample)
  const output = [
    ...players.map(player => stats.aggregatePlayerStats(player, players, sample)),
    ...['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom', 'goals/90', 'assists/90', 'g+a/90', 'ga/90', 'cleanSheets'].flatMap(metric =>
      [filters(), filters(['S1'], ['A']), filters(['S2'], ['B'])].map(filter => stats.getLeaderboard(players, sample, filter, metric))),
    stats.teamSeasonStats('A', sample, 'S1'), stats.partnershipStats(keeper.id, field.id, sample, 'S1'),
    stats.globalRankings(players, sample, 'S1'), stats.bestEleven(players, sample, 'S1'), stats.unifiedBestEleven(players, sample, 'S1'), stats.teamBestEleven(players, sample, 'A', 'S1'),
  ]
  assert(output.length > 0)
  assert.equal(JSON.stringify(sample), JSON.stringify(records.map(game => ({ ...game, events: [...game.events, { id: `${game.id}-goal`, type: 'goal', teamId: game.teamId, playerId: field.id, assistPlayerId: keeper.id, minute: 40 }] }))))
})
