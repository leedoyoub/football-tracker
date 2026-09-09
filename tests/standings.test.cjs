const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const ext of ['.ts', '.tsx']) require.extensions[ext] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { seasonStandings, standingForTeam } = require('../src/engine/standings.ts')
const { MatchTimeline } = require('../src/components/MatchTimeline.tsx')

const teams = ['A', 'B', 'C', 'D'].map(id => ({ id, name: `Team ${id}`, shortName: id }))
const match = (id, season, homeTeamId, awayTeamId, home, away) => ({ id, season, matchDay: 1, date: '2026-01-01', homeTeamId, awayTeamId, duration: 90, appearances: [], events: [
  ...Array.from({ length: home }, (_, i) => ({ id: `${id}-h${i}`, type: 'goal', minute: 10 + i, teamId: homeTeamId })),
  ...Array.from({ length: away }, (_, i) => ({ id: `${id}-a${i}`, type: 'goal', minute: 50 + i, teamId: awayTeamId })),
] })
function content(node) { return Array.isArray(node) ? node.map(content).join('') : node && typeof node === 'object' ? content(node.props?.children) : node == null ? '' : String(node) }

test('standings calculate all columns from matches and order Pts, GD, then GF', () => {
  const games = [match('one', 'S1', 'A', 'B', 2, 0), match('two', 'S1', 'A', 'C', 1, 1), match('three', 'S1', 'B', 'C', 3, 0), match('other', 'S2', 'D', 'A', 9, 0)]
  const table = seasonStandings(teams, games, 'S1')
  assert.deepEqual(table.map(row => [row.teamId, row.rank, row.played, row.wins, row.draws, row.losses, row.goalsFor, row.goalsAgainst, row.goalDifference, row.points]), [
    ['A', 1, 2, 1, 1, 0, 3, 1, 2, 4], ['B', 2, 2, 1, 0, 1, 3, 2, 1, 3], ['C', 3, 2, 0, 1, 1, 1, 4, -3, 1], ['D', 4, 0, 0, 0, 0, 0, 0, 0, 0],
  ])
  assert.equal(standingForTeam(table, 'B').rank, 2)
  const tied = seasonStandings(teams.slice(0, 2), [match('tie', 'S1', 'A', 'B', 0, 0)], 'S1')
  assert.deepEqual(tied.map(row => row.rank), [1, 1])
})

test('standings recalculate from the supplied current match array after an edit or deletion', () => {
  const original = [match('m', 'S1', 'A', 'B', 1, 0)]
  assert.equal(seasonStandings(teams, original, 'S1')[0].teamId, 'A')
  const edited = [match('m', 'S1', 'A', 'B', 0, 2)]
  assert.equal(seasonStandings(teams, edited, 'S1')[0].teamId, 'B')
  assert.deepEqual(seasonStandings(teams, [], 'S1').map(row => row.points), [0, 0, 0, 0])
})

test('timeline is chronological and preserves saved order for same-minute events', () => {
  const players = [{ id: 'scorer', name: 'Mbappe', displayName: 'Mbappe' }, { id: 'assist', name: 'Bellingham', displayName: 'Bellingham' }, { id: 'out', name: 'Vinicius', displayName: 'Vinicius' }, { id: 'in', name: 'Rodrygo', displayName: 'Rodrygo' }]
  const tree = MatchTimeline({ players, teamId: 'A', events: [
    { id: 'late', type: 'goal', minute: 81, teamId: 'A', playerId: 'assist' },
    { id: 'sub', type: 'sub', minute: 67, teamId: 'A', playerOutId: 'out', playerInId: 'in', position: 'RW' },
    { id: 'conceded', type: 'goal', minute: 54, teamId: 'B' },
    { id: 'goal', type: 'goal', minute: 21, teamId: 'A', playerId: 'scorer', assistPlayerId: 'assist' },
    { id: 'same-minute', type: 'goal', minute: 67, teamId: 'B' },
  ] })
  const output = content(tree)
  assert(output.indexOf("21'") < output.indexOf("54'") && output.indexOf("54'") < output.indexOf('Vinicius') && output.indexOf('Vinicius') < output.lastIndexOf('CONCEDED') && output.lastIndexOf('CONCEDED') < output.indexOf("81'"))
  assert(output.includes('Mbappe') && output.includes('Bellingham') && output.includes('Rodrygo'))
})

test('League competition preview and the full table are wired to the central standings engine', () => {
  const competition = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const full = fs.readFileSync(require.resolve('../src/screens/StandingsScreen.tsx'), 'utf8')
  assert(competition.includes('league.standings.slice(0, 8)') && competition.includes('StandingsTable'))
  assert(full.includes('seasonStandings') && full.includes('StandingsTable'))
})
