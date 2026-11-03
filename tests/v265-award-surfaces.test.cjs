require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const { AWARD_RECORD_METRICS } = require('../src/engine/awardRecords.ts')
const { screenHarness, nodes, sourceModule } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
const teams = [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }]
const match = { id: 'm', season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', homeTeamId: 'A', awayTeamId: 'B', appearances: [], events: [] }
const app = { teams, players: [], matches: [match], competitionStates: [] }
const restored = (view, saved) => loadLastNavigationEntry(app, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view, screenState: { ...defaultScreenState(view), ...saved } }) : null })

test('retired selectors and honor routes restore to existing half or competition scopes', () => {
  const view = { name: 'competition', season: 'S1', competitionType: 'league' }
  assert.equal(defaultScreenState(view).leagueAwardScope, 'first-half')
  assert.equal(restored(view, { bestXiMode: 'monthly', monthlyAwardBlock: 8 }).screenState.leagueAwardScope, 'second-half')
  assert.equal(restored(view, { bestXiMode: 'season' }).screenState.leagueAwardScope, 'league')
  assert.equal(restored({ name: 'records' }, { awardMetricId: 'awards-monthly-player', historyPanel: 'awards', historyBlock: 8 }).screenState.awardMetricId, 'awards-first-half-mvp')
  assert.equal(restored({ name: 'records' }, { historyAwardScope: 'season' }).screenState.historyAwardScope, 'season')
  assert.equal(restored({ name: 'records-leaderboard', category: 'player', leaderboardId: 'awards-champions-final' }, {}).view.leaderboardId, 'awards-champions-mvp')
  assert.equal(restored({ name: 'season-highlight', season: 'S1', kind: 'monthly' }, {}).view.kind, 'awards')
})

test('award record choices count four new half honors and omit retired choices', () => {
  const ids = AWARD_RECORD_METRICS.map(metric => metric.id)
  for (const id of ['first-half-mvp', 'first-half-xi', 'second-half-mvp', 'second-half-xi']) {
    const metric = AWARD_RECORD_METRICS.find(item => item.id === id)
    assert.ok(metric, id)
    assert.equal(metric.accepts({ kind: id, category: 'individual' }), true)
    assert.equal(metric.accepts({ kind: 'league-mvp', category: 'individual' }), false)
  }
  for (const id of ['monthly', 'finals', 'monthly-player', 'monthly-xi', 'champions-round-player', 'champions-round-xi', 'cup-final', 'champions-final']) assert.ok(!ids.includes(id), id)
})

test('League awards tabs preserve selected half when opening and returning from a player', () => {
  const patches = [], candidates = [{ playerId: 'p', average: 7.2, selectionScore: 7.8 }]
  const award = { scopeLabel: 'S1 First Half', complete: false, bestXI: [], statsByPlayer: {}, candidates, playerLabel: 'First Half MVP', teamLabel: 'First Half Best XI' }
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'LeaguePlayers', { competitionStates: [] }, { '../engine/awards': { ...require('../src/engine/awards.ts'), awardResultForScope: () => award } })
  const tree = h.render({ season: 'S1', teams, players: [], matches: [], league: { matches: [] }, screenState: defaultScreenState({ name: 'competition' }), onStateChange: state => patches.push(state), onNavigate() {} })
  const tabs = nodes(tree, node => node.props?.label === 'Best XI view')[0]
  assert.deepEqual(tabs.props.options.map(option => option.label), ['First Half', 'Second Half', 'League Best XI'])
  tabs.props.onChange('second-half')
  assert.equal(patches.at(-1).leagueAwardScope, 'second-half')
  const halfRace = nodes(tree, node => node.type?.name === 'AwardRacePanel' && node.props.awardScope === 'first-half')[0]
  assert.equal(halfRace.props.candidates, candidates)
})

test('History award views expose six controlled scopes and hide unfinalized pitches', () => {
  const patches = []
  const h = screenHarness(root, 'screens/RecordsHistory.tsx', 'RecordsHistory', {})
  const tree = h.render({ ...app, states: [], competition: 'all', panel: 'awards', openSeason: 'S1', awardScope: 'first-half', onPanel() {}, onSeason() {}, onAwardScope: value => patches.push(value), onPlayerOpen() {} })
  const selector = nodes(tree, node => node.props?.label === 'Award history scope')[0]
  const grid = require('../src/components/SeasonUI.tsx').SegmentedControl(selector.props)
  assert.equal(grid.props.style.gridTemplateColumns, 'repeat(3, minmax(0, 1fr))', 'six History scopes use two rows of three on narrow screens')
  assert.ok(selector)
  assert.deepEqual(selector.props.options.map(option => option.label), ['First Half', 'Second Half', 'League', 'Cup', 'Champions', 'Season'])
  selector.props.onChange('season'); assert.deepEqual(patches, ['season'])
  const detail = screenHarness(root, 'screens/RecordsHistory.tsx', 'AwardsDetail', {}, { '../engine/historyReadModels': { ...require('../src/engine/historyReadModels.ts'), historyAwardResultForScope: () => ({ complete: false, bestXI: [], statsByPlayer: {} }) } })
  const output = detail.render({ ...app, states: [], season: 'S1', awardScope: 'first-half', onPlayerOpen() {} })
  assert.equal(nodes(output, node => node.type?.name === 'AwardBestXI').length, 0)
})

test('finalized History scopes retain scorer, assist and goalkeeper summaries beside MVP and XI', () => {
  const player = { id: 'p', name: 'Winner' }, links = []
  const award = { complete: true, bestPlayerId: 'p', playerLabel: 'Player of the League', teamLabel: 'League Best XI', scopeLabel: 'S1 League', bestXI: [], statsByPlayer: { p: { avgRating: 7.25 } }, individualAwards: { scorers: [{ playerId: 'p', value: 12 }], assistLeaders: [{ playerId: 'p', value: 8 }], goalkeepers: [{ playerId: 'p', value: 10, label: 'League Golden Glove' }] } }
  const h = screenHarness(root, 'screens/RecordsHistory.tsx', 'AwardsDetail', {}, { '../engine/historyReadModels': { ...require('../src/engine/historyReadModels.ts'), historyAwardResultForScope: () => award } })
  const tree = h.render({ ...app, players: [player], states: [], season: 'S1', awardScope: 'league', onPlayerOpen: id => links.push(id) })
  assert.equal(nodes(tree, node => node.type === 'h3' && node.props.children === 'Top Scorer').length, 1)
  assert.equal(nodes(tree, node => node.type === 'h3' && node.props.children === 'Assist King').length, 1)
  assert.equal(nodes(tree, node => node.type === 'h3' && node.props.children === 'League Golden Glove').length, 1)
  const winners = nodes(tree, node => node.type === 'button')
  assert.equal(winners.length, 4)
  winners[1].props.onClick(); assert.deepEqual(links, ['p'])
})

test('History preserves a finalized scorer even when nobody qualifies for MVP or XI', () => {
  const ts = require('../src/data/teams.ts').STATIC_TEAMS
  const p = { id: 'short-scorer', name: 'Short Scorer', position: 'ST', teamId: ts[0].id }
  const games = ts.flatMap((team, index) => Array.from({ length: 30 }, (_, day) => ({ ...match, id: `short:${team.id}:${day}`, matchDay: day + 1, teamId: team.id, homeTeamId: team.id, awayTeamId: `opp-${index}`, duration: 90, appearances: index === 0 && day === 0 ? [{ playerId: p.id, teamId: team.id, role: 'starter', position: 'ST', minuteIn: 0, minuteOut: 1 }] : [], events: index === 0 && day === 0 ? [{ id: 'g', type: 'goal', minute: 1, playerId: p.id, teamId: team.id }] : [] })))
  const h = screenHarness(root, 'screens/RecordsHistory.tsx', 'AwardsDetail', {})
  const tree = h.render({ teams: ts, players: [p], matches: games, states: [], season: 'S1', awardScope: 'league', onPlayerOpen() {} })
  assert.equal(nodes(tree, node => node.type?.name === 'AwardBestXI').length, 0)
  assert.equal(nodes(tree, node => node.type === 'h3' && node.props.children === 'Top Scorer').length, 1)
  assert.equal(nodes(tree, node => node.type === 'button' && node.props.children.at(-1) === 'goals').length, 1)
})

test('matchday snapshots and reviews do not evaluate monthly awards', () => {
  let monthlyEvaluations = 0
  const analytics = sourceModule(root, 'engine/seasonAnalytics.ts', { './awards': { performanceAwardResult() { monthlyEvaluations++; return { bestXI: [], statsByPlayer: {}, candidates: [] } } } })
  const result = analytics.buildSeasonAnalytics(teams, [], [match], 'S1')
  assert.equal(result.currentMatchDay, 1)
  assert.equal(result.leagueSnapshots.size, 1)
  assert.equal(monthlyEvaluations, 0)
})

test('half Race filters positions and team standings only within that half and preserves its View All route', () => {
  const candidates = Array.from({ length: 6 }, (_, i) => ({ playerId: 'p' + i, teamId: 'A', average: 7, selectionScore: 7, appearances: 1, mom: 0, minutes: 90, latestRating: 7, goals: 0, assists: 0 }))
  const links = []
  const h = screenHarness(root, 'components/AwardRacePanel.tsx', 'AwardRacePanel', {})
  const player = { id: 'p0', name: 'Player', position: 'GK', teamId: 'A' }
  const first = { ...match, duration: 90, appearances: [{ playerId: 'p0', teamId: 'A', role: 'starter', position: 'ST' }] }
  const second = { ...match, id: 'second', matchDay: 16, duration: 90, appearances: [{ playerId: 'p0', teamId: 'A', role: 'starter', position: 'GK' }] }
  const tree = h.render({ candidates, title: 'First Half Award Race', previewCount: 5, awardScope: 'first-half', season: 'S1', type: 'league', players: [player], teams, matches: [first, second], onNavigate: view => links.push(view) })
  const rows = nodes(tree, node => node.type?.name === 'AwardRaceRows')[0]
  assert.deepEqual(rows.props.status.league.matches.map(item => item.id), ['m'])
  assert.equal(rows.props.rows.find(row => row.candidate.playerId === 'p0').position, 'ST')
  const viewAll = nodes(tree, node => node.type === 'button' && node.props.children === 'View All')[0]
  viewAll.props.onClick()
  assert.equal(links[0].awardScope, 'first-half')
  assert.equal(links[0].competitionType, 'league')
  const { matchesForAwardScope } = require('../src/engine/awardScopes.ts')
  assert.deepEqual(matchesForAwardScope([match, { ...match, id: 'second', matchDay: 16 }], 'S1', 'first-half').map(item => item.id), ['m'])
})

test('News publishes finalized half results and revokes them after a same-array edit', () => {
  const ts = require('../src/data/teams.ts').STATIC_TEAMS
  const p = { id: 'half-news-player', name: 'Half Player', position: 'ST', teamId: ts[0].id }
  const games = ts.flatMap((team, index) => Array.from({ length: 15 }, (_, day) => ({ ...match, id: `${team.id}:${day}`, matchDay: day + 1, teamId: team.id, homeTeamId: team.id, awayTeamId: `opp-${index}`, duration: 90, appearances: index === 0 ? [{ playerId: p.id, teamId: team.id, role: 'starter', position: 'ST' }] : [] })))
  const { deriveNews } = require('../src/engine/news.ts')
  const run = () => deriveNews([p], ts, games, [])
  const published = run()
  assert.ok(published.some(item => item.title === 'Half Player wins First Half MVP'))
  assert.ok(published.some(item => item.title === 'First Half Best XI revealed'))
  assert.ok(!published.some(item => /Month/.test(item.title)))
  games[0] = { ...games[0], matchDay: 16 }
  assert.ok(!run().some(item => item.title === 'Half Player wins First Half MVP'))
})

test('award scope match arrays are stable and update after same-array replacements', () => {
  const { matchesForAwardScope } = require('../src/engine/awardScopes.ts')
  const games = [match, { ...match, id: 'second', matchDay: 16 }]
  const first = matchesForAwardScope(games, 'S1', 'first-half')
  assert.strictEqual(matchesForAwardScope(games, 'S1', 'first-half'), first)
  assert.strictEqual(matchesForAwardScope(games, 'S1', 'season'), matchesForAwardScope(games, 'S1', 'all'))
  games[0] = { ...match, matchDay: 17 }
  const updated = matchesForAwardScope(games, 'S1', 'first-half')
  assert.notStrictEqual(updated, first)
  assert.deepEqual(updated, [])
  assert.deepEqual(first.map(item => item.id), ['m'])
})

test('Race position filters use the player main position across the full award scope after transfer', () => {
  const { awardRacePresentationRows } = require('../src/engine/awardRacePresentation.ts')
  const player = { id: 'transfer', name: 'Transfer', teamId: 'B', position: 'GK' }
  const games = [1, 2, 3].map(day => ({ ...match, id: 'transfer:' + day, matchDay: day, teamId: day === 3 ? 'B' : 'A', homeTeamId: day === 3 ? 'B' : 'A', awayTeamId: 'opp', duration: 90, appearances: [{ playerId: player.id, teamId: day === 3 ? 'B' : 'A', role: 'starter', position: day === 3 ? 'GK' : 'ST' }] }))
  const candidate = { playerId: player.id, teamId: 'B', average: 7, selectionScore: 7, appearances: 3, mom: 0, minutes: 270, latestRating: 7, goals: 0, assists: 0 }
  const rows = awardRacePresentationRows([candidate], [player], games, 'S1', 'league', 'st-ss')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].position, 'ST')
  assert.equal(rows[0].candidate.teamId, 'B')
})

test('official Race panels and full screen describe the same 50 percent minutes eligibility', () => {
  const panel = screenHarness(root, 'components/AwardRacePanel.tsx', 'AwardRacePanel', {}).render({ candidates: [], title: 'Award Race', previewCount: 5, season: 'S1', type: 'league', players: [], teams, matches: [], onNavigate() {} })
  const screen = screenHarness(root, 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', { players: [], teams, matches: [], competitionStates: [] }).render({ screenState: defaultScreenState({ name: 'award-race' }), onStateChange() {}, onNavigate() {}, onBack() {} })
  for (const tree of [panel, screen]) {
    const copy = nodes(tree, node => node.type === 'p' && typeof node.props.children === 'string' && node.props.children.includes('Avg Rating shown'))[0]
    assert.match(copy.props.children, /minimum 50% playing time/)
  }
})

test('competition UI never fills an official XI with four-of-ten appearances while retaining stat awards', () => {
  const ts = require('../src/data/teams.ts').STATIC_TEAMS, teamId = ts[0].id
  const player = { id: 'four-of-ten', name: 'Four of Ten', teamId, position: 'ST' }
  const games = Array.from({ length: 10 }, (_, day) => ({ ...match, id: 'champions:' + day, teamId, homeTeamId: teamId, awayTeamId: 'opponent', duration: 90, competitionType: 'champions', competitionStage: 'roundOf16', matchDay: day + 1, appearances: day < 4 ? [{ playerId: player.id, teamId, role: 'starter', position: 'ST' }] : [], events: day === 0 ? [{ id: 'goal', type: 'goal', teamId, playerId: player.id, minute: 5 }] : [] }))
  const champions = { championId: teamId, runnerUpId: ts[1].id, currentStage: 'final', drawn: true, rounds: { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] } }
  const actual = require('../src/engine/awards.ts').awardsForCompetition('champions', 'S1', ts, [player], games, [], { champions })
  assert.equal(actual.candidates.length, 0)
  assert.equal(actual.complete, true)
  assert.equal(actual.scorers[0].playerId, player.id)
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'CompetitionBestElevens', { competitionStates: [] })
  const tree = h.render({ season: 'S1', type: 'champions', screenState: defaultScreenState({ name: 'competition', competitionType: 'champions' }), players: [player], teams: ts, matches: games, allMatches: games, cup: null, champions, onStateChange() {}, onNavigate() {} })
  assert.equal(nodes(tree, node => node.type?.name === 'BestEleven' && node.props.xi.slots.some(slot => slot.playerId)).length, 0)
  const stats = nodes(tree, node => node.type?.name === 'CompetitionIndividualAwards')[0]
  assert.equal(stats.props.result.complete, true)
  assert.equal(stats.props.result.individualAwards.scorers[0].playerId, player.id)
})
