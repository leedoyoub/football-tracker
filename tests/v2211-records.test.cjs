const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')

const player = (id, position = 'ST') => ({ id, name: id, displayName: id, fullName: `Player ${id}`, number: 9, position, teamId: 'A' })
const match = (id, p, goals = 0, extras = {}) => ({
  id, season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, competitionType: 'league',
  homeTeamId: 'A', awayTeamId: 'B', appearances: [{ playerId: p.id, teamId: 'A', role: 'starter', position: p.position, matchPosition: p.position }],
  events: [...Array.from({ length: goals }, (_, index) => ({ id: `${id}:g:${index}`, type: 'goal', minute: index + 1, teamId: 'A', playerId: p.id })), ...(extras.events ?? [])],
})

test('canonical occurrence boards count scored-in, braces 2+, and hat-tricks 3+ without zero rows', () => {
  const one = player('one'), two = player('two'), three = player('three'), zero = player('zero')
  const boards = buildPlayerRecordLeaderboards([one, two, three, zero], [match('one', one, 1), match('two', two, 2), match('three', three, 3), match('zero', zero, 0)], {})
  const byId = id => boards.find(board => board.id === id)
  assert.deepEqual(boards.slice(2, 5).map(board => board.id), ['matches-scored-in', 'braces', 'hat-tricks'])
  assert.deepEqual(byId('matches-scored-in').rows.map(row => [row.playerId, row.numeric]), [['one', 1], ['three', 1], ['two', 1]])
  assert.deepEqual(byId('braces').rows.map(row => row.playerId).sort(), ['three', 'two'])
  assert.deepEqual(byId('hat-tricks').rows.map(row => row.playerId), ['three'])
  assert(!byId('matches-scored-in').rows.some(row => row.playerId === 'zero'))
})

test('canonical individual model owns rating, clean-sheet, save, and remaining approved boards', () => {
  const keeper = player('keeper', 'GK')
  const games = [match('clean', keeper, 0, { events: [{ id: 'save', type: 'save', teamId: 'A', playerId: keeper.id, count: 4 }] })]
  const boards = buildPlayerRecordLeaderboards([keeper], games, {})
  const ids = boards.map(board => board.id)
  for (const id of ['good', 'eight', 'nine', 'ten', 'clean-sheets', 'saves', 'mom', 'four-goals', 'three-assists', 'four-ga', 'highest-rating']) assert(ids.includes(id), id)
  assert.equal(boards.find(board => board.id === 'clean-sheets').rows[0].numeric, 1)
  assert.equal(boards.find(board => board.id === 'saves').rows[0].numeric, 4)
})

test('expanded Player Records has no 50-row cap and includes a 51st row', () => {
  const players = Array.from({ length: 52 }, (_, index) => player(`p${String(index).padStart(2, '0')}`))
  const matches = players.map((p, index) => match(`m${index}`, p, 1))
  const rows = buildPlayerRecordLeaderboards(players, matches, {}).find(board => board.id === 'goals').rows
  assert.equal(rows.length, 52)
  assert.equal(rows[50].rank, 1)
  const screen = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  assert(!screen.includes('group.rows.slice(0, 50)'))
  assert(screen.includes('buildPlayerRecordLeaderboards'))
})

test('team lowest goals conceded board follows clean sheets and excludes teams with no matches', () => {
  const screen = fs.readFileSync(require.resolve('../src/screens/RecordsScreen.tsx'), 'utf8')
  const clean = screen.indexOf("group('clean-sheets', 'Most Clean Sheets'")
  const lowest = screen.indexOf("group('ga-rate', 'Lowest Goals Conceded per Match'")
  assert(clean >= 0 && lowest > clean)
  assert(screen.includes('.filter(row => row.summary.games.length)'))
})
