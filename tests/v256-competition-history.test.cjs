require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { defaultScreenState, createNavigationEntry, pushNavigationEntry, popNavigationEntry } = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry } = require('../src/lib/lastRoute.ts')
const { buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { cupCompetition, CUP_STAGES } = require('../src/engine/competition.ts')
const fs = require('node:fs')
const results = fs.existsSync('src/lib/competitionResults.ts') ? require('../src/lib/competitionResults.ts') : {}
const tables = fs.existsSync('src/lib/cupTable.ts') ? require('../src/lib/cupTable.ts') : {}
const screenStates = fs.existsSync('src/lib/competitionScreenState.ts') ? require('../src/lib/competitionScreenState.ts') : {}
const teams = Array.from({ length: 16 }, (_, i) => ({ id: `T${i + 1}`, name: `Team ${i + 1}`, shortName: `T${i + 1}` }))
const players = []
function game(id, teamId = 'T1', props = {}) {
  const opponent = props.awayTeamId ?? `OPP-${teamId}`
  const { gf = 1, ga = 0, ...fields } = props
  return { id, season: 'Season 1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-10-01', recordedAt: 1000, duration: 90, teamId, homeTeamId: teamId, awayTeamId: opponent, appearances: [], events: [
    ...Array.from({ length: gf }, (_, i) => ({ id: `${id}:gf:${i}`, type: 'goal', minute: i + 1, teamId })),
    ...Array.from({ length: ga }, (_, i) => ({ id: `${id}:ga:${i}`, type: 'goal', minute: i + 21, teamId: opponent })),
  ], ...fields }
}
const filters = { teamId: null, period: null }

test('competition defaults select Players, Table and Bracket independently', () => {
  const s = defaultScreenState({ name: 'competition', competitionType: 'cup' })
  assert.equal(s.leagueMenu, 'players'); assert.equal(s.cupMenu, 'table'); assert.equal(s.championsMenu, 'bracket')
  assert.equal(s.leagueTableMode, 'overall'); assert.equal(s.cupTableStage, null)
  assert.deepEqual(s.matchFilters, { league: filters, cup: filters, champions: filters })
  assert.notEqual(s.matchFilters.league, s.matchFilters.cup)
})

test('legacy Form migrates to Table/Form and obsolete Cup preview state is ignored', () => {
  const state = { teams, players, matches: [game('old')], competitionStates: [] }
  const saved = { version: 2, view: { name: 'competition', season: 'Season 1' }, screenState: { name: 'competition', competitionType: 'league', tab: 'form', cupViewAll: true, historyMatchday: 4, historyComparedTeamIds: ['T1'] } }
  const restored = loadLastNavigationEntry(state, { getItem: () => JSON.stringify(saved) }).screenState
  assert.equal(restored.leagueMenu, 'table'); assert.equal(restored.leagueTableMode, 'form')
  assert.equal(restored.cupMenu, 'table'); assert.equal(restored.championsMenu, 'bracket')
  assert.equal('cupViewAll' in restored, false)
  assert.deepEqual(restored.historyComparedTeamIds, ['T1'])
})

test('malformed menus and nested filters are restored safely without leaking another competition', () => {
  const state = { teams, players, matches: [game('old')], competitionStates: [] }
  const saved = { version: 2, view: { name: 'competition' }, screenState: { name: 'competition', leagueMenu: 'bracket', cupMenu: 'history', championsMenu: 'table', cupTableStage: 'stage99', matchFilters: { league: { teamId: 'missing', period: '99' }, cup: null, champions: { teamId: 'T2', period: 'semiFinal' } } } }
  const restored = loadLastNavigationEntry(state, { getItem: () => JSON.stringify(saved) }).screenState
  assert.equal(restored.leagueMenu, 'players'); assert.equal(restored.cupMenu, 'table'); assert.equal(restored.championsMenu, 'bracket')
  assert.equal(restored.cupTableStage, null)
  assert.deepEqual(restored.matchFilters.league, filters); assert.deepEqual(restored.matchFilters.cup, filters)
  assert.deepEqual(restored.matchFilters.champions, { teamId: 'T2', period: 'semiFinal' })
})

test('Back preserves all competition menus, Matches filters, history focus and source scroll', () => {
  const s = { ...defaultScreenState({ name: 'competition' }), leagueMenu: 'history', cupMenu: 'matches', historyMatchday: 12, historyComparedTeamIds: ['T1', 'T2'], historyFocusedTeamId: 'T2', historyPlotScrollLeft: 123 }
  s.matchFilters.cup = { teamId: 'T1', period: 'stage2' }
  const source = createNavigationEntry({ name: 'competition' }, s)
  const back = popNavigationEntry(pushNavigationEntry([source], { name: 'match', id: 'one' }, 467))
  assert.equal(back[0].scrollTop, 467); assert.deepEqual(back[0].screenState, s)
})

test('reload preserves a focused automatic History comparison without requiring a manual team selection', () => {
  const state = { teams, players, matches: [game('focus')], competitionStates: [] }
  const saved = { version: 2, view: { name: 'competition', season: 'Season 1' }, screenState: { ...defaultScreenState({ name: 'competition' }), leagueMenu: 'history', historyComparedTeamIds: [], historyFocusedTeamId: 'T1', historyPlotScrollLeft: 114 } }
  const restored = loadLastNavigationEntry(state, { getItem: () => JSON.stringify(saved) }).screenState
  assert.equal(restored.historyFocusedTeamId, 'T1')
  assert.equal(restored.historyPlotScrollLeft, 114)
})

test('season switch resets period selections and filters while preserving independent menus', () => {
  assert.equal(typeof screenStates.resetCompetitionSeasonState, 'function')
  const s = { ...defaultScreenState({ name: 'competition' }), leagueMenu: 'history', cupMenu: 'matches', cupTableStage: 'total', historyMatchday: 12, cupAwardStage: 'stage3' }
  s.matchFilters.cup = { teamId: 'T1', period: 'stage2' }
  const next = screenStates.resetCompetitionSeasonState(s)
  assert.equal(next.leagueMenu, 'history'); assert.equal(next.cupMenu, 'matches')
  assert.equal(next.cupTableStage, null); assert.equal(next.historyMatchday, null); assert.equal(next.cupAwardStage, null)
  assert.deepEqual(next.matchFilters.cup, filters)
})

test('Matches combines recorded team and canonical MD filters, deduplicates and uses newest chronology', () => {
  assert.equal(typeof results.competitionResults, 'function')
  const first = game('first', 'T1', { matchDay: 12, recordedAt: 1000, awayTeamId: 'T2' })
  const second = game('second', 'T1', { matchDay: 12, recordedAt: 2000 })
  const games = [first, game('foreign', 'T1', { season: 'Season 2', matchDay: 12 }), second, game('other-md', 'T1', { matchDay: 11 }), game('opponent-only', 'T2', { matchDay: 12, awayTeamId: 'T1' }), game('cup', 'T1', { competitionType: 'cup', competitionStage: 'stage1' }), second]
  const untouched = JSON.stringify(games)
  assert.deepEqual(results.competitionResults(games, teams, 'Season 1', 'league', { teamId: 'T1', period: '12' }).map(r => r.match.id), ['second', 'first'])
  assert.deepEqual(results.competitionResults(games, teams, 'Season 1', 'league', { teamId: 'T2', period: '12' }).map(r => r.match.id), ['opponent-only'])
  assert.equal(JSON.stringify(games), untouched)
})

test('Champions Round filter includes every series game, canonical assignment and released-player history', () => {
  assert.equal(typeof results.competitionResults, 'function')
  const games = [1, 2, 3].map(n => game(`r16-${n}`, 'T1', { competitionType: 'champions', competitionStage: 'roundOf16', competitionSeriesGame: n, competitionPairingId: 'roundOf16:0', recordedAt: n * 1000, appearances: [{ playerId: 'released', teamId: 'T1', role: 'starter', position: 'ST' }] }))
  const frozen = { ...games[1], competitionType: 'league', competitionStage: 'regular', competitionAssignment: { competitionType: 'champions', stage: 'roundOf16', season: 'Season 1', teamId: 'T1', matchDay: 2, pairingId: 'roundOf16:0', seriesGame: 2 } }
  games[1] = frozen
  assert.deepEqual(results.competitionResults(games, teams, 'Season 1', 'champions', { teamId: 'T1', period: 'roundOf16' }).map(r => r.match.id), ['r16-3', 'r16-2', 'r16-1'])
})

test('MD Results uses recording order instead of match date, handles legacy insertion, edits and deletions', () => {
  assert.equal(typeof results.leagueMatchdayResults, 'function')
  const late = game('late', 'T1', { matchDay: 4, recordedAt: 3000, date: '2020-01-01' })
  const early = game('early', 'T2', { matchDay: 4, recordedAt: 1000, date: '2030-01-01' })
  const games = [late, game('wrong-md', 'T1', { matchDay: 3 }), early, game('middle', 'T3', { matchDay: 4, recordedAt: 2000 })]
  assert.deepEqual(results.leagueMatchdayResults(games, teams, 'Season 1', 4).map(r => r.match.id), ['early', 'middle', 'late'])
  const legacy = [game('z', 'T1', { recordedAt: undefined }), game('a', 'T2', { recordedAt: undefined })]
  assert.deepEqual(results.leagueMatchdayResults(legacy, teams, 'Season 1', 1).map(r => r.match.id), ['z', 'a'])
  const edited = games.map(m => m.id === 'early' ? { ...m, date: '2010-01-01', events: [], updatedAt: 999999 } : m).filter(m => m.id !== 'middle')
  assert.deepEqual(results.leagueMatchdayResults(edited, teams, 'Season 1', 4).map(r => r.match.id), ['early', 'late'])
  assert.equal(results.leagueMatchdayResults(teams.map((t, i) => game(`m${i}`, t.id)), teams, 'Season 1', 1).length, 16)
})

test('League Form uses exactly five newest League games, excludes other seasons/competitions and handles shorter histories', () => {
  const games = [1, 2, 3, 4, 5, 6].map(n => game(`l${n}`, 'T1', { matchDay: n, date: `2026-10-0${n}`, gf: n === 1 ? 8 : 1 }))
  games.push(game('cup', 'T1', { competitionType: 'cup', competitionStage: 'stage1', gf: 9, date: '2026-10-10' }), game('season2', 'T1', { season: 'Season 2', gf: 9, date: '2026-10-11' }), game('short', 'T2', { gf: 0, ga: 2 }))
  const table = buildSeasonAnalytics(teams, players, games.reverse(), 'Season 1').formTable
  const row = table.find(r => r.teamId === 'T1')
  assert.deepEqual([row.played, row.wins, row.draws, row.losses, row.goalsFor, row.goalsAgainst, row.goalDifference, row.points], [5, 5, 0, 0, 5, 0, 5, 15])
  assert.equal(table.find(r => r.teamId === 'T2').played, 1)
  assert.equal(table.find(r => r.teamId === 'T3').played, 0)
})

test('lightweight League table/history retains every official snapshot and cached revisit without player panels', () => {
  const { buildLeagueHistory } = require('../src/engine/seasonAnalytics.ts')
  assert.equal(typeof buildLeagueHistory, 'function')
  const games = [game('day1', 'T1'), game('day2', 'T1', { matchDay: 2 })]
  const model = buildLeagueHistory(teams, players, games, 'Season 1')
  assert.equal(model.currentMatchDay, 2)
  assert.equal(model.leagueSnapshots.get(1).standings.find(r => r.teamId === 'T1').points, 3)
  assert.equal(model.leagueSnapshots.get(2).standings.find(r => r.teamId === 'T1').points, 6)
  assert.equal(buildLeagueHistory(teams, players, games, 'Season 1'), model)
  assert.deepEqual(model.leagueSnapshots, buildSeasonAnalytics(teams, players, games, 'Season 1').leagueSnapshots)
})

test('lightweight History preserves rating-revision cache invalidation', () => {
  const { buildLeagueHistory } = require('../src/engine/seasonAnalytics.ts')
  const revision = require('../src/engine/ratingRevision.ts')
  const originalRevision = revision.RATING_ENGINE_REVISION
  const games = [game('revision')]
  const first = buildLeagueHistory(teams, players, games, 'Season 1')
  try {
    revision.RATING_ENGINE_REVISION++
    assert.notEqual(buildLeagueHistory(teams, players, games, 'Season 1'), first)
  } finally { revision.RATING_ENGINE_REVISION = originalRevision }
})

function cupFixture(stages = 3) {
  const matches = []
  for (const stage of CUP_STAGES.slice(0, stages)) {
    const active = cupCompetition(teams, matches, 'Season 1').activeTeamIds
    for (let i = 0; i < active.length; i++) matches.push(game(`${stage}:${active[i]}`, active[i], { competitionType: 'cup', competitionStage: stage, gf: active.length - i, ga: i }))
  }
  return matches
}

test('Cup current stage displays all 16, freezes previous eliminations and has no arbitrary risk before first game', () => {
  assert.equal(typeof tables.cupTableModel, 'function')
  const matches = cupFixture(2); const cup = cupCompetition(teams, matches, 'Season 1')
  const model = tables.cupTableModel(teams, matches, 'Season 1', players, cup, 'stage3')
  assert.equal(model.rows.length, 16); assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 0)
  assert.equal(model.rows.filter(r => r.state === 'eliminated').length, 4)
  assert.equal(model.rows[0].played, 0)
  assert.equal(model.rows.find(r => r.eliminatedStage === 2).played, 2)
  assert.deepEqual(model.availableStages, ['stage1', 'stage2', 'stage3'])
})

test('completed historical Cup stage retains its official ordering, own statistics and elimination draw without future leakage', () => {
  assert.equal(typeof tables.cupTableModel, 'function')
  const matches = cupFixture(3); const cup = cupCompetition(teams, matches, 'Season 1')
  const before = JSON.stringify(cup)
  const model = tables.cupTableModel(teams, matches, 'Season 1', players, cup, 'stage2')
  assert.equal(model.rows.length, 16); assert.equal(model.complete, true)
  assert.equal(model.rows.filter(r => r.state === 'eliminated').length, 4)
  assert(model.rows.slice(0, 14).every(r => r.played === 1))
  assert(model.rows.slice(14).every(r => r.eliminatedStage === 1 && r.played === 1))
  assert(model.rows.every(r => !r.eliminatedStage || r.eliminatedStage <= 2))
  assert.equal(model.rows.filter(r => r.state === 'at-risk').length, 0)
  assert.equal(JSON.stringify(cup), before)
  assert.equal(tables.cupTableModel(teams, matches, 'Season 1', players, cup, 'stage2'), model, 'unchanged history revisits reuse presentation cache')
  const tiedGames = teams.map(t => game(`tie:${t.id}`, t.id, { competitionType: 'cup', competitionStage: 'stage1', gf: 0, ga: 0 }))
  const tied = cupCompetition(teams, tiedGames, 'Season 1')
  const tiedModel = tables.cupTableModel(teams, tiedGames, 'Season 1', players, tied, 'stage1')
  assert.equal(tiedModel.eliminationDrawTeamIds.length, 16)
  assert.deepEqual(tiedModel.rows.filter(r => r.state === 'eliminated').map(r => r.teamId), tied.rows.filter(r => r.state === 'eliminated').map(r => r.teamId))
})

test('Cup Total combines official placement with cumulative totals and neutral rows', () => {
  assert.equal(typeof tables.cupTableModel, 'function')
  const matches = cupFixture(3); const cup = cupCompetition(teams, matches, 'Season 1')
  const total = tables.cupTableModel(teams, matches, 'Season 1', players, cup, 'total')
  assert.equal(total.rows.length, 16); assert.equal(total.label, 'Provisional Standings')
  assert.deepEqual(total.rows.map(r => r.teamId), cup.rows.map(r => r.teamId))
  assert(total.rows.every(r => r.state === 'normal'))
  assert.equal(total.rows.find(r => r.teamId === cup.activeTeamIds[0]).played, 3)
  assert.equal(total.rows.find(r => r.teamId === cup.activeTeamIds[0]).status, 'Active · Stage 4')
  assert.equal(total.rows.find(r => r.eliminatedStage === 1).played, 1)
})

test('Cup Final and Replay keep official winners, all 16 rows and historical Final statistics', () => {
  assert.equal(typeof tables.cupTableModel, 'function')
  const matches = cupFixture(7); const active = cupCompetition(teams, matches, 'Season 1').activeTeamIds
  matches.push(...active.map(id => game(`final:${id}`, id, { competitionType: 'cup', competitionStage: 'final', gf: 0, ga: 0 })))
  const pending = cupCompetition(teams, matches, 'Season 1')
  assert.equal(pending.stage, 'finalReplay')
  const finalView = tables.cupTableModel(teams, matches, 'Season 1', players, pending, 'final')
  assert.equal(finalView.rows.length, 16); assert(finalView.rows.slice(0, 2).every(r => r.played === 1 && r.state === 'surviving'))
  assert.equal(finalView.replayRequired, true)
  matches.push(...active.map((id, i) => game(`replay:${id}`, id, { competitionType: 'cup', competitionStage: 'finalReplay', gf: 2 - i, ga: i })))
  const complete = cupCompetition(teams, matches, 'Season 1')
  const replay = tables.cupTableModel(teams, matches, 'Season 1', players, complete, 'finalReplay')
  assert.equal(replay.rows[0].teamId, complete.championId); assert.equal(replay.rows[0].status, 'Champion')
  assert.equal(replay.rows[1].status, 'Runner-up'); assert.equal(replay.rows[0].played, 1)
  const total = tables.cupTableModel(teams, matches, 'Season 1', players, complete, 'total')
  assert.equal(total.label, 'Final Standings'); assert.equal(total.rows[0].played, 9)
  assert.equal(total.rows[0].status, 'Champion'); assert.equal(total.rows[1].status, 'Runner-up')
  assert.equal(tables.cupTableModel(teams, matches, 'Season 1', players, complete, 'final').rows[0].status, 'Surviving')
})
