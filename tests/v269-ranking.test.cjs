require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { positionFilterFamilies } = require('../src/engine/positionScope.ts')
const { awardRacePresentationRows } = require('../src/engine/awardRacePresentation.ts')
const root = path.resolve(__dirname, '..')
function fixture() { const s = performanceFixture(1); s.matches = s.matches.filter(m => m.competitionType === 'league' && m.matchDay <= 2); return s }
test('position groups form one deduplicated union and normalize legacy fullbacks', () => {
  assert.deepEqual(positionFilterFamilies(['st-ss', 'lw-rw', 'st-ss']), ['ST', 'SS', 'LW', 'RW'])
  assert.deepEqual(positionFilterFamilies(['fb', 'lb-rb']), ['LB', 'RB'])
  assert.deepEqual(positionFilterFamilies([]), [])
})
test('Global team selection retains rank gaps, complete statistics and historical membership', () => {
  const state = fixture(), harness = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', state)
  let screenState = { ...defaultScreenState({ name: 'global-ranking' }), metric: 'goals', scope: 'league' }
  const render = () => { const tree = harness.render({ season: 'Season 1', screenState, onStateChange: s => { screenState = s }, onNavigate() {}, onBack() {} }); return nodes(tree, n => n.type?.name === 'VirtualRankingList')[0] }
  const all = render().props.rows
  screenState = { ...screenState, teamIds: [state.teams[0].id, state.teams[1].id] }
  const list = render(), rows = list.props.rows
  const expected = all.filter(r => state.matches.some(m => m.appearances.some(a => a.playerId === r.playerId && screenState.teamIds.includes(a.teamId))))
  assert.deepEqual(rows.map(r => r.playerId), expected.map(r => r.playerId))
  for (const [i, row] of rows.entries()) {
    const original = all.find(r => r.playerId === row.playerId)
    assert.equal(row.goals, original.goals)
    assert.equal(list.props.renderRow(row, i).props.rank, all.indexOf(original) + 1)
  }
  assert(rows.some(r => r.playerId === state.players[8].id), 'transferred player retains recorded old-team membership')
})
test('Award position union is ranked before historical team display selection', () => {
  const state = fixture(), ids = [state.players[9].id, state.players[8].id, state.players[32].id]
  const candidates = ids.map((playerId, i) => ({ playerId, teamId: state.teams[Math.min(i, 1)].id, selectionScore: 100-i, average: 9-i, appearances: 2, minutes: 180, mom: 0, goals: 0, assists: 0, latestRating: 9-i }))
  const all = awardRacePresentationRows(candidates, state.players, state.matches, 'Season 1', 'league', ['st-ss', 'lw-rw'])
  assert.equal(all.length, 3)
  const shown = awardRacePresentationRows(candidates, state.players, state.matches, 'Season 1', 'league', ['st-ss', 'lw-rw'], [state.teams[0].id])
  assert.deepEqual(shown.map(r => [r.candidate.playerId, r.rank]), all.filter(r => ids.slice(0,2).includes(r.candidate.playerId)).map(r => [r.candidate.playerId, r.rank]))
})
test('Global team toggles do not aggregate or sort official rows again', () => {
  const state = fixture(), stats = require('../src/engine/stats.ts')
  let builds = 0, sorts = 0
  const harness = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', state, {
    '../engine/stats': { ...stats, buildGlobalRankingData(...args) { builds++; return stats.buildGlobalRankingData(...args) }, rankGlobalRankingRows(...args) { sorts++; return stats.rankGlobalRankingRows(...args) } },
  })
  let screenState = { ...defaultScreenState({ name: 'global-ranking' }), positionFilters: ['st-ss', 'lw-rw'] }
  const render = () => harness.render({ season: 'Season 1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} })
  render()
  for (const teamIds of [[state.teams[0].id], [state.teams[0].id, state.teams[1].id], [], [state.teams[1].id]]) { screenState = { ...screenState, teamIds }; render() }
  assert.equal(builds, 1)
  assert.equal(sorts, 1)
})
test('historical ranking membership excludes unused substitutes and updates after a real substitution', () => {
  const { historicalRankingTeams } = require('../src/engine/rankingPresentation.ts')
  const appearance = (teamId, role) => ({ playerId: 'p', teamId, role, position: 'ST', matchPosition: 'ST' })
  const match = (id, teamId, role) => ({ id, season: 'S1', date: '2026-01-01', duration: 90, teamId, homeTeamId: teamId, awayTeamId: 'opponent', appearances: [appearance(teamId, role)], events: [] })
  const matches = [match('played', 'Chelsea', 'starter'), match('bench-only', 'Liverpool', 'bench')]
  assert.deepEqual([...historicalRankingTeams(matches).get('p')], ['Chelsea'])
  const edited = matches.map(m => m.id === 'bench-only' ? { ...m, events: [{ id: 'sub', type: 'sub', minute: 60, teamId: 'Liverpool', playerInId: 'p', playerOutId: 'other', position: 'ST' }] } : m)
  assert.deepEqual([...historicalRankingTeams(edited).get('p')], ['Chelsea', 'Liverpool'])
})
test('Global Ranking applies every position/team combination to one union population', () => {
  const positions = ['ST', 'CM', 'LW', 'ST', 'RW']
  const players = positions.map((position, i) => ({ id: `p${i}`, name: `Player ${i}`, position, teamId: i % 2 ? 'B' : 'A', number: i+1 }))
  const teams = ['A', 'B', 'C'].map(id => ({ id, name: id, shortName: id }))
  const matches = players.map((p, i) => ({ id: `m${i}`, season: 'S1', date: '2026-01-01', duration: 90, competitionType: 'league', teamId: p.teamId, homeTeamId: p.teamId, awayTeamId: 'O', appearances: [{ playerId: p.id, teamId: p.teamId, role: 'starter', position: p.position }], events: Array.from({ length: 5-i }, (_, n) => ({ id: `${i}:${n}`, type: 'goal', minute: 10+n, teamId: p.teamId, playerId: p.id })) }))
  const h = screenHarness(root, 'screens/GlobalRankingScreen.tsx', 'GlobalRankingScreen', { players, teams, matches })
  for (const [positionFilters, teamIds, want] of [
    [[], [], [['p0',1],['p1',2],['p2',3],['p3',4],['p4',5]]],
    [['st-ss'], [], [['p0',1],['p3',2]]],
    [['st-ss','lw-rw'], [], [['p0',1],['p2',2],['p3',3],['p4',4]]],
    [[], ['B'], [['p1',2],['p3',4]]],
    [[], ['A','B'], [['p0',1],['p1',2],['p2',3],['p3',4],['p4',5]]],
    [['st-ss'], ['B'], [['p3',2]]],
    [['st-ss','lw-rw'], ['B','C'], [['p3',3]]],
  ]) {
    const screenState = { ...defaultScreenState({ name: 'global-ranking' }), metric: 'goals', positionFilters, teamIds }
    const tree = h.render({ season: 'S1', screenState, onStateChange() {}, onNavigate() {}, onBack() {} })
    const list = nodes(tree, n => n.type?.name === 'VirtualRankingList')[0]
    assert.deepEqual(list.props.rows.map(r => [r.playerId,r.rank]), want, JSON.stringify([positionFilters,teamIds]))
  }
})
test('Award Race unfiltered rows equal independent v268 and presentation filters preserve candidate fields', () => {
  const { baselineRoot } = require('./v269-derived-baseline.cjs')
  const state = fixture(), initial = { ...defaultScreenState({ name: 'award-race' }), season: 'Season 1', scope: 'league' }
  const rowsFor = (h, screenState) => nodes(h.render({ screenState, onStateChange() {}, onNavigate() {}, onBack() {} }), n => n.type?.name === 'AwardRaceRows')[0]?.props.rows ?? []
  const current = screenHarness(root, 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', state)
  const all = rowsFor(current, initial)
  const old = rowsFor(screenHarness(baselineRoot(), 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', state), initial)
  assert(all.length > 0)
  assert.deepEqual(all, old)
  const selected = rowsFor(current, { ...initial, positionFilters: ['st-ss', 'lw-rw'], teamIds: [state.teams[0].id] })
  assert(selected.length > 0)
  for (const row of selected) assert.deepEqual(row.candidate, all.find(r => r.candidate.playerId === row.candidate.playerId).candidate)
})
