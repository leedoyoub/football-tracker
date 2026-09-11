const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { formatPlayStyleAverage, formatPlayStylePercentage, trackedTeamPlayStylePerformance } = require('../src/engine/playStyleStats.ts')
const teams = [
  { id: 'ours', name: 'Ours', shortName: 'OUR', abbreviation: 'OUR', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white', playStyle: 'possession' },
  { id: 'pos', name: 'Possession', shortName: 'POS', abbreviation: 'POS', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white', playStyle: 'possession' },
  { id: 'short', name: 'Short', shortName: 'SHO', abbreviation: 'SHO', visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white', playStyle: 'short-pass-counter' },
  { id: 'long', name: 'Long', shortName: 'LON', abbreviation: 'LON', visualStyle: 'solid', primaryColor: 'green', jerseyNumberColor: 'white', playStyle: 'long-pass-counter' },
]
function match(id, homeTeamId, awayTeamId, homeGoals, awayGoals) { return { id, season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'ours', homeTeamId, awayTeamId, appearances: [], events: [...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}:h${index}`, type: 'goal', minute: index + 1, teamId: homeTeamId })), ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}:a${index}`, type: 'goal', minute: index + 20, teamId: awayTeamId }))] } }
const row = (rows, style) => rows.find(item => item.style === style)

test('tracked-team style, not opponent style, groups historical home and away matches', () => {
  const trackedTeams = [...teams, { ...teams[0], id: 'barcelona', playStyle: 'possession' }, { ...teams[0], id: 'liverpool', playStyle: 'short-pass-counter' }]
  const matches = [
    { ...match('barca-home', 'barcelona', 'long', 3, 1), teamId: 'barcelona' },
    { ...match('liverpool-away', 'pos', 'liverpool', 2, 1), teamId: 'liverpool' },
    { ...match('barca-draw', 'barcelona', 'short', 2, 2), teamId: 'barcelona' },
  ]
  const rows = trackedTeamPlayStylePerformance(matches, trackedTeams)
  assert.deepEqual(row(rows, 'possession'), { style: 'possession', label: 'Possession', matches: 2, goalsFor: 5, goalsAgainst: 3, wins: 1, draws: 1, losses: 0, winPercentage: 50, drawPercentage: 50, lossPercentage: 0, averageGoalsFor: 2.5, averageGoalsAgainst: 1.5 })
  assert.deepEqual(row(rows, 'short-pass-counter'), { style: 'short-pass-counter', label: 'Short-Pass Counter', matches: 1, goalsFor: 1, goalsAgainst: 2, wins: 0, draws: 0, losses: 1, winPercentage: 0, drawPercentage: 0, lossPercentage: 100, averageGoalsFor: 1, averageGoalsAgainst: 2 })
  assert.equal(row(rows, 'long-pass-counter').matches, 0, 'opponent styles never decide a card')
})

test('tracked-team play-style performance handles unknown styles, edits, deletion, and zero matches', () => {
  const original = [match('one', 'ours', 'pos', 1, 1)]
  assert.equal(row(trackedTeamPlayStylePerformance(original, teams), 'long-pass-counter').averageGoalsFor, null)
  const edited = [{ ...original[0], events: match('edited', 'ours', 'pos', 3, 2).events }]
  assert.deepEqual([row(trackedTeamPlayStylePerformance(edited, teams), 'possession').goalsFor, row(trackedTeamPlayStylePerformance(edited, teams), 'possession').goalsAgainst], [3, 2])
  assert.equal(row(trackedTeamPlayStylePerformance([], teams), 'possession').matches, 0)
  assert.equal(row(trackedTeamPlayStylePerformance([{ ...original[0], teamId: 'unknown' }], teams), 'possession').matches, 0)
})

test('play-style average display rounds to two decimals and renders no-data neutrally', () => {
  assert.equal(formatPlayStyleAverage(1.6666), '1.67')
  assert.equal(formatPlayStyleAverage(.5), '0.50')
  assert.equal(formatPlayStyleAverage(null), '—')
  assert.equal(formatPlayStylePercentage(50), '50%')
  assert.equal(formatPlayStylePercentage(null), '—')
})
