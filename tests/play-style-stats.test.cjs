const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { formatPlayStyleAverage, opponentPlayStylePerformance } = require('../src/engine/playStyleStats.ts')
const teams = [
  { id: 'ours', name: 'Ours', shortName: 'OUR', abbreviation: 'OUR', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white', playStyle: 'possession' },
  { id: 'pos', name: 'Possession', shortName: 'POS', abbreviation: 'POS', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white', playStyle: 'possession' },
  { id: 'short', name: 'Short', shortName: 'SHO', abbreviation: 'SHO', visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white', playStyle: 'short-pass-counter' },
  { id: 'long', name: 'Long', shortName: 'LON', abbreviation: 'LON', visualStyle: 'solid', primaryColor: 'green', jerseyNumberColor: 'white', playStyle: 'long-pass-counter' },
]
function match(id, homeTeamId, awayTeamId, homeGoals, awayGoals) { return { id, season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'ours', homeTeamId, awayTeamId, appearances: [], events: [...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}:h${index}`, type: 'goal', minute: index + 1, teamId: homeTeamId })), ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}:a${index}`, type: 'goal', minute: index + 20, teamId: awayTeamId }))] } }
const row = (rows, style) => rows.find(item => item.style === style)

test('opponent play-style performance aggregates completed saved matches by opponent style', () => {
  const matches = [match('p1', 'ours', 'pos', 2, 1), match('p2', 'pos', 'ours', 1, 3), match('short', 'ours', 'short', 1, 2), match('long', 'long', 'ours', 0, 2), { id: 'future', homeTeamId: 'ours', awayTeamId: 'pos', events: null, appearances: [] }]
  const rows = opponentPlayStylePerformance(matches, teams)
  assert.deepEqual(row(rows, 'possession'), { style: 'possession', label: 'Possession', matches: 2, goalsFor: 5, goalsAgainst: 2, averageGoalsFor: 2.5, averageGoalsAgainst: 1 })
  assert.deepEqual(row(rows, 'short-pass-counter'), { style: 'short-pass-counter', label: 'Short-Pass Counter', matches: 1, goalsFor: 1, goalsAgainst: 2, averageGoalsFor: 1, averageGoalsAgainst: 2 })
  assert.deepEqual(row(rows, 'long-pass-counter'), { style: 'long-pass-counter', label: 'Long-Pass Counter', matches: 1, goalsFor: 2, goalsAgainst: 0, averageGoalsFor: 2, averageGoalsAgainst: 0 })
})

test('opponent play-style performance handles zero matches and recalculates after match edits and deletion', () => {
  const original = [match('one', 'ours', 'pos', 1, 1)]
  assert.equal(row(opponentPlayStylePerformance(original, teams), 'long-pass-counter').averageGoalsFor, null)
  const edited = [{ ...original[0], events: match('edited', 'ours', 'pos', 3, 2).events }]
  assert.deepEqual([row(opponentPlayStylePerformance(edited, teams), 'possession').goalsFor, row(opponentPlayStylePerformance(edited, teams), 'possession').goalsAgainst], [3, 2])
  assert.equal(row(opponentPlayStylePerformance([], teams), 'possession').matches, 0)
})

test('play-style average display rounds to two decimals and renders no-data neutrally', () => {
  assert.equal(formatPlayStyleAverage(1.6666), '1.67')
  assert.equal(formatPlayStyleAverage(.5), '0.50')
  assert.equal(formatPlayStyleAverage(null), '—')
})
