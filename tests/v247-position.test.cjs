const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJS } }).outputText, filename)

const { positionFamily, positionFilterFamilies, scopedPositionFamilyByPlayer } = require('../src/engine/positionScope.ts')
const { scopedMetricRanks } = require('../src/engine/seasonAnalytics.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const players = [
  { id: 'left', teamId: 'A', position: 'CM', name: 'Left' },
  { id: 'right', teamId: 'A', position: 'RB', name: 'Right' },
  { id: 'idle', teamId: 'A', position: 'LCM', name: 'Idle' },
]
function match(id, season, teamId, roles) {
  return { id, season, date: '2025-01-01', duration: 90, homeTeamId: teamId, awayTeamId: 'Z', events: [], appearances: roles.map(([playerId, position, minutes]) => ({ playerId, teamId, position, role: 'starter', exitMinute: minutes })) }
}

test('fullback sides and tactical aliases use canonical families', () => {
  for (const [role, family] of Object.entries({ LB: 'LB', LWB: 'LB', RB: 'RB', RWB: 'RB', LCB: 'CB', RCB: 'CB', LAM: 'CAM', RAM: 'CAM', LCM: 'CM', RCM: 'CM', LDM: 'CDM', RDM: 'CDM' })) assert.equal(positionFamily(role), family)
  assert.deepEqual(positionFilterFamilies('lb-rb'), ['LB', 'RB'])
  assert.equal(positionFilterFamilies('lb-rb').includes('CB'), false)
})

test('credited minutes override registration, with scoped and career fallback', () => {
  const games = [
    match('a', 'Old', 'A', [['left', 'CAM', 90], ['right', 'RB', 90]]),
    match('b', 'Old', 'A', [['left', 'CAM', 90]]),
    match('c', 'New', 'B', [['left', 'CM', 90]]),
  ]
  assert.equal(scopedPositionFamilyByPlayer(players, games, {}).get('left'), 'CAM')
  assert.equal(scopedPositionFamilyByPlayer(players, games, { seasons: ['New'], teams: ['B'] }).get('left'), 'CM')
  assert.equal(scopedPositionFamilyByPlayer(players, games, { seasons: ['New'], teams: ['A'] }).get('left'), 'CAM')
  assert.equal(scopedPositionFamilyByPlayer(players, games, {}).get('idle'), 'CM')
  assert.equal(scopedPositionFamilyByPlayer(players, games, {}).get('right'), 'RB')
})

test('representative family refreshes after history replacement and deletion on the same collection', () => {
  const roster = [{ id: 'p', teamId: 'A', position: 'CM', name: 'Edited player' }]
  const games = [match('a', 'S', 'A', [['p', 'CAM', 90]])]
  assert.equal(scopedPositionFamilyByPlayer(roster, games, {}).get('p'), 'CAM')
  games[0] = match('a', 'S', 'A', [['p', 'RW', 90]])
  assert.equal(scopedPositionFamilyByPlayer(roster, games, {}).get('p'), 'RW')
  games.splice(0, 1)
  assert.equal(scopedPositionFamilyByPlayer(roster, games, {}).get('p'), 'CM')
})

test('LB and LWB minutes aggregate without merging RB', () => {
  const games = [match('a', 'S', 'A', [['left', 'LB', 90]]), match('b', 'S', 'A', [['left', 'LWB', 90]]), match('c', 'S', 'A', [['left', 'RB', 90]])]
  assert.equal(scopedPositionFamilyByPlayer(players, games, {}).get('left'), 'LB')
  assert.ok(![...scopedPositionFamilyByPlayer(players, games, {}).values()].includes('FB'))
})

test('position rank separates left and right within each paired filter', () => {
  const ranked = ['rb', 'rw', 'rm', 'lb', 'lw', 'lm'].map(playerId => ({ playerId, teamId: 'A' }))
  const roster = ranked.map(row => ({ ...row, id: row.playerId, position: row.playerId.toUpperCase(), name: row.playerId }))
  const families = new Map(roster.map(player => [player.id, positionFamily(player.position)]))
  for (const role of ['lb', 'lw', 'lm']) assert.equal(scopedMetricRanks(ranked, roster, role, families).position, 1)
  for (const role of ['rb', 'rw', 'rm']) assert.equal(scopedMetricRanks(ranked, roster, role, families).position, 1)
})

test('match rating keeps the actual role when representative role differs', () => {
  const player = { id: 'p', teamId: 'A', position: 'CAM', name: 'Wide in this match' }
  const game = match('wing', 'S', 'A', [['p', 'RW', 90]])
  assert.equal(scopedPositionFamilyByPlayer([player], [game], {}).get('p'), 'RW')
  assert.equal(ratePlayerMatch(game, player).position, 'RW')
  assert.equal(player.position, 'CAM')
})
