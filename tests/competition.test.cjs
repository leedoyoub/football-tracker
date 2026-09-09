const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { CUP_STAGES, championsCompetition, competitionAssignment, competitionMatches, createChampionsDraw, cupCompetition, leagueCompetition, matchCompetitionType } = require('../src/engine/competition.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
function game(id, season, type, stage, homeTeamId, awayTeamId, homeGoals, awayGoals, pairingId) {
  return { id, season, competitionType: type, competitionStage: stage, competitionPairingId: pairingId, matchDay: 1, date: '2026-01-01', duration: 90, teamId: homeTeamId, homeTeamId, awayTeamId, appearances: [], events: [
    ...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}:h${index}`, type: 'goal', minute: index + 1, teamId: homeTeamId })),
    ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}:a${index}`, type: 'goal', minute: index + 20, teamId: awayTeamId })),
  ] }
}

test('legacy matches safely fall back to League and season/type filtering stays independent', () => {
  const legacy = game('legacy', 'Season 1', undefined, undefined, 'T1', 'OPP', 1, 0)
  const cup = game('cup', 'Season 1', 'cup', 'stage1', 'T1', 'OPP', 2, 0)
  const otherSeason = game('other', 'Season 2', 'league', 'regular', 'T1', 'OPP', 3, 0)
  assert.equal(matchCompetitionType(legacy), 'league')
  assert.deepEqual(competitionMatches([legacy, cup, otherSeason], 'Season 1', 'league').map(match => match.id), ['legacy'])
  assert.deepEqual(competitionMatches([legacy, cup, otherSeason], 'Season 1', 'cup').map(match => match.id), ['cup'])
})

test('League progress uses the least-played team', () => {
  const matches = [
    game('a1', 'Season 1', 'league', 'regular', 'T1', 'T2', 1, 0),
    game('a2', 'Season 1', 'league', 'regular', 'T1', 'T3', 1, 0),
    game('b2', 'Season 1', 'league', 'regular', 'T2', 'T3', 1, 0),
  ]
  assert.equal(leagueCompetition(teams.slice(0, 3), matches, 'Season 1').matchdayProgress, 2)
})

test('Cup completes a stage, eliminates exactly the bottom two, and resets the next table', () => {
  const stage1 = teams.map((team, index) => game(`s1:${index}`, 'Season 1', 'cup', 'stage1', team.id, `OPP:${index}`, index < 14 ? 1 : 0, index < 14 ? 0 : 1))
  const state = cupCompetition(teams, stage1, 'Season 1')
  assert.equal(state.stage, 'stage2')
  assert.deepEqual(new Set(state.eliminatedTeamIds), new Set(['T15', 'T16']))
  assert.equal(state.activeTeamIds.length, 14)
  assert(state.standings.every(row => row.played === 0), 'the next stage table must reset')
})

test('Cup final draw requests one replay and its complete fallback produces one stable champion', () => {
  const matches = []
  let active = teams.map(team => team.id)
  for (const stage of CUP_STAGES) {
    active.forEach((teamId, index) => matches.push(game(`${stage}:${teamId}`, 'Season 1', 'cup', stage, teamId, `OPP:${stage}:${index}`, index < active.length - 2 ? 1 : 0, index < active.length - 2 ? 0 : 1)))
    active = cupCompetition(teams, matches, 'Season 1').activeTeamIds
  }
  assert.equal(active.length, 2)
  matches.push(game('final', 'Season 1', 'cup', 'final', active[0], active[1], 0, 0))
  assert.equal(cupCompetition(teams, matches, 'Season 1').stage, 'finalReplay')
  matches.push(game('replay', 'Season 1', 'cup', 'finalReplay', active[0], active[1], 0, 0))
  const completed = cupCompetition(teams, matches, 'Season 1')
  assert(active.includes(completed.championId))
  assert.equal(cupCompetition(teams, matches, 'Season 1').championId, completed.championId)
})

test('Champions draw is unique, fixed, and advances winners into the fixed quarter-final paths', () => {
  const values = Array.from({ length: 16 }, (_, index) => index / 16)
  let cursor = 0
  const drawIds = createChampionsDraw(teams, () => values[cursor++ % values.length])
  assert.equal(drawIds.length, 16)
  assert.equal(new Set(drawIds).size, 16)
  const draw = { id: 'champions:Season 1', season: 'Season 1', kind: 'champions-draw', teamIds: drawIds }
  const matches = []
  for (let index = 0; index < 8; index++) {
    const [winner, loser] = [drawIds[index * 2], drawIds[index * 2 + 1]]
    matches.push(game(`r16:${index}:1`, 'Season 1', 'champions', 'roundOf16', winner, loser, 1, 0, `roundOf16:${index}`))
    matches.push(game(`r16:${index}:2`, 'Season 1', 'champions', 'roundOf16', loser, winner, 0, 1, `roundOf16:${index}`))
  }
  const bracket = championsCompetition(draw, matches, 'Season 1')
  assert.equal(bracket.currentStage, 'quarterFinal')
  assert.deepEqual(bracket.rounds.quarterFinal.flatMap(pair => pair.teamIds), drawIds.filter((_, index) => index % 2 === 0))
  assert.deepEqual(draw.teamIds, drawIds, 'advancement must not redraw or mutate the persisted bracket')
})

test('Log Match assignment connects a Champions team to its fixed opponent and pairing', () => {
  const draw = { id: 'champions:Season 1', season: 'Season 1', kind: 'champions-draw', teamIds: teams.map(team => team.id) }
  const assignment = competitionAssignment('champions', 'Season 1', 'T1', teams, [], draw)
  assert.deepEqual({ available: assignment.available, stage: assignment.stage, pairingId: assignment.pairingId, opponentTeamId: assignment.opponentTeamId }, { available: true, stage: 'roundOf16', pairingId: 'roundOf16:0', opponentTeamId: 'T2' })
})

test('Competition navigation, season selector, tabs, persistence, and Supabase migration are wired', () => {
  const nav = fs.readFileSync(require.resolve('../src/components/BottomNav.tsx'), 'utf8')
  const screen = fs.readFileSync(require.resolve('../src/screens/CompetitionScreen.tsx'), 'utf8')
  const matchScreen = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  const sync = fs.readFileSync(require.resolve('../src/lib/sync.ts'), 'utf8')
  const migration = fs.readFileSync(require.resolve('../supabase/migrations/20260910120000_add_competitions.sql'), 'utf8')
  assert(nav.includes("id: 'competition'") && !nav.includes("id: 'news'"))
  assert(screen.includes("initialType = 'league'") && screen.includes('Competition season') && screen.includes('ChampionsBracket'))
  assert(matchScreen.includes('competitionType') && matchScreen.includes('competitionStage') && matchScreen.includes('competitionPairingId'))
  assert(sync.includes("competition_states") && sync.includes('competition_type'))
  assert(migration.includes('competition_type') && migration.includes('competition_states'))
})
