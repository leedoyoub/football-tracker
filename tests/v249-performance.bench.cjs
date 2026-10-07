const fs = require('node:fs')
const ts = require('typescript')
const { performance } = require('node:perf_hooks')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { deriveNews } = require('../src/engine/news.ts')
const { buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { buildMatchChangeIndex } = require('../src/engine/matchChangeIndex.ts')

const positions = ['GK', 'LB', 'CB', 'CB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'ST', 'RW']
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))
const players = teams.flatMap(team => positions.map((position, index) => ({ id: `${team.id}${index}`, name: `${team.id}${index}`, teamId: team.id, position, number: index + 1 })))
const matches = teams.flatMap(team => Array.from({ length: 30 }, (_, index) => ({
  id: `${team.id}-${index}`, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: index + 1,
  date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String(index % 28 + 1).padStart(2, '0')}`,
  duration: 90, teamId: team.id, homeTeamId: team.id, awayTeamId: team.id === 'A' ? 'B' : 'A',
  appearances: players.filter(player => player.teamId === team.id).map(player => ({ playerId: player.id, teamId: team.id, role: 'starter', position: player.position, matchPosition: player.position })),
  events: [{ id: `${team.id}-${index}-goal`, type: 'goal', minute: 20, teamId: team.id, playerId: `${team.id}9`, assistPlayerId: `${team.id}8` }],
})))
const scope = { seasons: ['Season 1'], teamIds: [], competition: 'league', positionFilter: 'all' }
const states = []
const sample = (label, callback) => { const started = performance.now(); const value = callback(); console.log(`${label}: ${(performance.now() - started).toFixed(2)} ms`); return value }

if (process.argv.includes('--selected') || process.argv.includes('--single')) {
  const selectedIds = process.argv.includes('--single') ? ['together:attack:2:starts'] : ['goal-combinations', 'mutual-goal-combinations', 'both-scored', 'both-ga', 'duo-ga', 'together:attack:2:starts', 'best-unit:attack:2:goals', 'cb-suppression', 'cb-ga']
  const input = { category: 'combination', players, teams, matches, scope, selectedIds }
  const groups = sample('Records Combination preview cold', () => recordsLeaderboardGroups(input))
  console.log(`Records Combination preview groups: ${groups.length}; rows: ${groups.reduce((total, group) => total + group.rows.length, 0)}`)
  sample('Records Combination preview repeat', () => recordsLeaderboardGroups(input))
  process.exit(0)
}

const groups = sample('Records Combination cold', () => recordsLeaderboardGroups({ category: 'combination', players, teams, matches, scope }))
console.log(`Records Combination groups: ${groups.length}; rows: ${groups.reduce((total, group) => total + group.rows.length, 0)}`)
sample('Records Combination repeat', () => recordsLeaderboardGroups({ category: 'combination', players, teams, matches, scope }))
const index = sample('Global Ranking cold', () => buildGlobalRankingData(players, matches, scopeToRanking(scope), 'rating'))
sample('Global Ranking metric switch', () => rankGlobalRankingRows(index, players, 'goals'))
sample('Global Ranking same metric', () => rankGlobalRankingRows(index, players, 'goals'))
sample('Season Analytics cold', () => buildSeasonAnalytics(teams, players, matches, 'Season 1'))
sample('Season Analytics cached', () => buildSeasonAnalytics(teams, players, matches, 'Season 1'))
sample('News cold', () => deriveNews(players, teams, matches, states))
sample('News cached', () => deriveNews(players, teams, matches, states))
sample('Match Changes cold', () => buildMatchChangeIndex(players, teams, matches, states))
sample('Match Changes cached', () => buildMatchChangeIndex(players, teams, matches, states))

function scopeToRanking(input) { return { seasons: input.seasons, teams: input.teamIds, positions: [] } }
