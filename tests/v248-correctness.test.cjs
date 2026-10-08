const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { recordedTeamId, isRecordedForTeam, recordedOpponentId, teamPerspectiveScore, teamsCreditedWithResult } = require('../src/engine/matchPerspective.ts')
const { teamMetrics } = require('../src/engine/teamMetrics.ts')
const { seasonStandings } = require('../src/engine/standings.ts')
const { competitionIdentityForMatch, normalizeMatchCompetitionIdentity } = require('../src/engine/competitionContext.ts')
const { getNextMatchDayForTeam } = require('../src/engine/match.ts')
const { leagueCompetition, competitionAssignment, teamCompetitionGoals, compareChampionsSeriesRow } = require('../src/engine/competition.ts')
const { isLeagueMatchdayComplete, monthlyAwardForBlock, monthlyAwardForStartedBlock, buildSeasonAnalytics } = require('../src/engine/seasonAnalytics.ts')
const { prepareImportData } = require('../src/lib/repository.ts')
const navigation = require('../src/lib/navigation.ts')
const { resolvePlayerDestination } = require('../src/lib/playerNavigation.ts')
const { latestAppearanceTeamId } = require('../src/engine/playerDetailScope.ts')
const { playerCareerTimeline } = require('../src/engine/playerDerived.ts')
const { LAST_ROUTE_STORAGE_KEY, saveLastRoute, loadLastNavigationEntry } = require('../src/lib/lastRoute.ts')
const { recordsScopedMatches } = require('../src/engine/recordsScope.ts')
const { buildGlobalRankingData, latestTeamMatch } = require('../src/engine/stats.ts')
const { combinationStats, startingPPG } = require('../src/engine/analytics.ts')
const { awardCandidatesForScope, competitionAwardResult } = require('../src/engine/awards.ts')
const { recentMatchPositions } = require('../src/screens/recentMatches.ts')
const { matchRoleLabel } = require('../src/screens/matchDetailPosition.ts')
const { historyTimelineForSeason } = require('../src/engine/historyReadModels.ts')
const { seasonAwards } = require('../src/engine/awards.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')
const { deriveNews } = require('../src/engine/news.ts')
const { buildMatchChangeIndex } = require('../src/engine/matchChangeIndex.ts')
const { classifyGoalEvents } = require('../src/engine/seasonInsights.ts')
const { derivedResults } = require('../src/lib/results.ts')

const team = id => ({ id, name: id })
const game = (id, type, owner, home, away, homeGoals, awayGoals) => ({
  id, season: 'Season 1', competitionType: type, competitionStage: type === 'league' ? 'regular' : 'roundOf16',
  matchDay: 1, date: '2026-01-01', duration: 90, teamId: owner, homeTeamId: home, awayTeamId: away,
  appearances: [], events: [
    ...Array.from({ length: homeGoals }, (_, index) => ({ id: `${id}:h${index}`, type: 'goal', minute: index + 1, teamId: home })),
    ...Array.from({ length: awayGoals }, (_, index) => ({ id: `${id}:a${index}`, type: 'goal', minute: index + 30, teamId: away })),
  ],
})

test('away recorded team gets its own score and home opponent identity', () => {
  const match = game('away', 'champions', 'A', 'B', 'A', 1, 3)
  assert.equal(recordedTeamId(match), 'A')
  assert.equal(recordedOpponentId(match), 'B')
  assert.deepEqual(teamPerspectiveScore(match, 'A'), { goalsFor: 3, goalsAgainst: 1, outcome: 'W' })
  assert.equal(teamPerspectiveScore(match, 'B'), undefined)
  assert.equal(isRecordedForTeam(match, 'B'), false)
  assert.deepEqual(teamsCreditedWithResult(match), ['A'])
})

test('Champions opponent gets no result, form, or team metrics from another team record', () => {
  const match = game('champions', 'champions', 'A', 'B', 'A', 1, 3)
  const owner = teamMetrics(team('A'), [match])
  const opponent = teamMetrics(team('B'), [match])
  assert.deepEqual([owner.games.length, owner.wins, owner.goals, owner.conceded, owner.form], [1, 1, 3, 1, ['W']])
  assert.deepEqual([opponent.games.length, opponent.wins, opponent.goals, opponent.conceded, opponent.form], [0, 0, 0, 0, []])
  const rows = seasonStandings([team('A'), team('B')], [match], 'Season 1')
  assert.equal(rows.find(row => row.teamId === 'A').played, 1)
  assert.equal(rows.find(row => row.teamId === 'B').played, 0)
  assert.equal(latestTeamMatch([match], 'B', 'Season 1'), undefined)
})

test('direct League fixture credits both teams with opposite results', () => {
  const match = game('league', 'league', 'A', 'B', 'A', 1, 3)
  assert.deepEqual(teamsCreditedWithResult(match), ['B', 'A'])
  assert.deepEqual(teamPerspectiveScore(match, 'B'), { goalsFor: 1, goalsAgainst: 3, outcome: 'L' })
  assert.equal(seasonStandings([team('A'), team('B')], [match], 'Season 1').find(row => row.teamId === 'B').played, 1)
  assert.equal(buildSeasonAnalytics([team('A'), team('B')], [], [match], 'Season 1').formTable.find(row => row.teamId === 'B').losses, 1)
})

test('away owned legacy assignment identifies the home opponent without changing the score sides', () => {
  const match = game('legacy-away', 'champions', 'A', 'B', 'A', 1, 3)
  const identity = competitionIdentityForMatch(match)
  assert.equal(identity.opponentTeamId, 'B')
  const normalized = normalizeMatchCompetitionIdentity(match)
  assert.equal(normalized.homeTeamId, 'B')
  assert.equal(normalized.awayTeamId, 'A')
  assert.equal(normalized.competitionAssignment.opponentTeamId, 'B')
})

test('Champions bracket and Team Detail goals keep an away recorded score', () => {
  const away = game('away-score', 'champions', 'A', 'B', 'A', 1, 3)
  const home = game('home-score', 'champions', 'B', 'B', 'A', 2, 0)
  assert.deepEqual(teamCompetitionGoals('A', [away], 'Season 1', 'champions'), { goalsFor: 3, goalsAgainst: 1 })
  assert.equal(compareChampionsSeriesRow('A', away, 'B', home, []), 'A')
  assert.equal(compareChampionsSeriesRow('C', away, 'B', home, []), undefined)
  assert.deepEqual(derivedResults([away], [team('A'), team('B')]).map(row => [row.teamId, row.opponentId, row.goalsFor, row.goalsAgainst, row.outcome]), [['A', 'B', 3, 1, 'W']])
})

test('League next match fills the first missing team slot', () => {
  const matches = [game('md1', 'league', 'A', 'A', 'O', 1, 0), game('md3', 'league', 'A', 'A', 'O', 1, 0)]
  matches[1].matchDay = 3
  assert.deepEqual(getNextMatchDayForTeam('A', matches, [], 'league', 'Season 1'), { season: 'Season 1', matchDay: 2 })
})

test('duplicate and missing League slots cannot complete a season or Matchday', () => {
  const matches = Array.from({ length: 30 }, (_, index) => ({ ...game(`m${index}`, 'league', 'A', 'A', 'B', 1, 0), matchDay: index === 29 ? 29 : index + 1 }))
  assert.equal(leagueCompetition([team('A'), team('B')], matches, 'Season 1').complete, false)
  assert.equal(isLeagueMatchdayComplete([team('A')], matches, 'Season 1', 29), false)
  assert.equal(competitionAssignment('league', 'Season 1', 'A', [team('A'), team('B')], matches).available, true)
})

test('import rejects duplicate stable IDs and repeated player appearances within a match', () => {
  const base = () => ({
    teams: [{ id: 'A', name: 'A' }], players: [{ id: 'P', name: 'P' }],
    matches: [{ ...game('m', 'league', 'A', 'A', 'O', 0, 0), appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'CM' }], events: [{ id: 'e', type: 'goal', teamId: 'A', minute: 1 }] }],
    competitionStates: [{ id: 's', season: 'Season 1', kind: 'season-complete', teamIds: [] }],
  })
  const duplicate = [
    state => state.teams.push({ ...state.teams[0] }),
    state => state.players.push({ ...state.players[0] }),
    state => state.matches.push({ ...state.matches[0] }),
    state => state.competitionStates.push({ ...state.competitionStates[0] }),
    state => state.matches[0].events.push({ ...state.matches[0].events[0] }),
    state => state.matches[0].appearances.push({ ...state.matches[0].appearances[0] }),
  ]
  for (const change of duplicate) { const state = base(); change(state); assert.throws(() => prepareImportData(JSON.stringify(state)), /Invalid JSON structure/) }
  const wrongOwner = base(); wrongOwner.teams.push({ id: 'B', name: 'B' }); wrongOwner.matches[0].teamId = 'B'
  assert.throws(() => prepareImportData(JSON.stringify(wrongOwner)), /Invalid JSON structure/)
})

test('player destination keeps visible season and competition without the source team filter', () => {
  const source = { name: 'global-ranking', season: 'Season 2', competitionType: 'cup', teamId: 'A' }
  const result = resolvePlayerDestination({ name: 'player', id: 'P', teamId: 'A' }, source, { name: 'global-ranking', scope: 'cup' }, 'Season 1', [])
  assert.deepEqual(result.view, { name: 'player', id: 'P' })
  assert.deepEqual(result.screenState, { name: 'player', season: 'Season 2', competition: 'cup', rankTrendMetric: 'rating' })
  const comparison = resolvePlayerDestination({ name: 'player', id: 'P' }, { name: 'comparison', season: 'Season 1' }, { ...navigation.defaultScreenState({ name: 'comparison' }), season: 'Season 2', competition: 'champions' }, 'Season 1', [])
  assert.deepEqual(comparison.screenState, { name: 'player', season: 'Season 2', competition: 'champions', rankTrendMetric: 'rating' })
  const hiddenTeamFilters = resolvePlayerDestination({ name: 'player', id: 'P' }, { name: 'team', id: 'A' }, { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), tab: 'players', bestPlayersSeason: 'Season 2', bestPlayersCompetition: 'cup' }, 'Season 1', [])
  assert.deepEqual(hiddenTeamFilters.screenState, { name: 'player', season: 'Season 1', competition: 'all', rankTrendMetric: 'rating' })
  const players = resolvePlayerDestination({ name: 'player', id: 'P' }, { name: 'players' }, { ...navigation.defaultScreenState({ name: 'players' }), filters: { seasons: ['Season 2'], teams: ['A'], positions: [] } }, 'Season 1', [])
  assert.deepEqual(players.screenState, { name: 'player', season: 'Season 2', competition: 'all', rankTrendMetric: 'rating' })
  const history = resolvePlayerDestination({ name: 'player', id: 'P' }, { name: 'records' }, { ...navigation.defaultScreenState({ name: 'records' }), category: 'history', historySeason: 'Season 2', filterSeasonIds: ['Season 3'], competition: 'cup' }, 'Season 1', [])
  assert.deepEqual(history.screenState, { name: 'player', season: 'Season 2', competition: 'cup', rankTrendMetric: 'rating' })
})

test('same player navigation compares current screen scope rather than stale view values', () => {
  const staleView = { name: 'player', id: 'P', season: 'Season 1', competitionType: 'cup' }
  const changed = navigation.createNavigationEntry(staleView, { name: 'player', season: 'Season 2', competition: 'league', teamId: null })
  const entries = [changed, navigation.createNavigationEntry({ name: 'team', id: 'A' })]
  const desired = { name: 'player', season: 'Season 1', competition: 'cup', teamId: null }
  assert.equal(navigation.navigateBrowseEntry(entries, { name: 'player', id: 'P' }, 0, desired).length, 3)
  assert.equal(navigation.navigateBrowseEntry(entries, { name: 'player', id: 'P' }, 0, changed.screenState).length, 1)
})

test('Team Rank uses the latest actual appearance in scope and has no roster fallback', () => {
  const first = { ...game('first', 'league', 'A', 'A', 'O', 0, 0), date: '2026-01-01', appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'CM' }] }
  const second = { ...game('second', 'league', 'B', 'B', 'O', 0, 0), date: '2026-02-01', appearances: [{ playerId: 'P', teamId: 'B', role: 'starter', position: 'CM' }] }
  assert.equal(latestAppearanceTeamId('P', [second, first]), 'B')
  assert.equal(latestAppearanceTeamId('P', []), undefined)
})

test('Player Detail renders the same scoped facts from Home and Team entry paths', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const player = { id: 'P', name: 'P', teamId: 'B', position: 'CM', number: 8 }
  const first = { ...game('first-render', 'league', 'A', 'A', 'O', 0, 0), appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'CM' }] }
  const second = { ...game('second-render', 'league', 'B', 'B', 'O', 1, 0), date: '2026-02-01', matchDay: 2, appearances: [{ playerId: 'P', teamId: 'B', role: 'starter', position: 'CM' }] }
  const emptySeason = { ...game('empty-render', 'league', 'A', 'A', 'O', 0, 0), season: 'Season 2' }
  const storePath = require.resolve('../src/store.tsx')
  const priorStore = require.cache[storePath]
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ teams: [team('A'), team('B')], players: [player], matches: [first, second, emptySeason], competitionStates: [] }) } }
  try {
    const { PlayerDetailScreen } = require('../src/screens/PlayerDetailScreen.tsx')
    const home = resolvePlayerDestination({ name: 'player', id: 'P', season: 'Season 1', competitionType: 'league' }, { name: 'home' }, { name: 'home' }, 'Season 1', [first, second])
    const fromTeam = resolvePlayerDestination({ name: 'player', id: 'P' }, { name: 'team', id: 'A' }, { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), bestPlayersSeason: 'Season 1', bestPlayersCompetition: 'league' }, 'Season 1', [first, second])
    const render = state => renderToStaticMarkup(React.createElement(PlayerDetailScreen, { playerId: 'P', season: 'Season 1', screenState: state, onStateChange() {}, onNavigate() {}, onBack() {} }))
    assert.deepEqual(home.screenState, fromTeam.screenState)
    assert.equal(render(home.screenState), render(fromTeam.screenState))
    assert.match(render({ name: 'player', season: 'Season 2', competition: 'league', teamId: null }), /aria-label="Team rank —"/)
  } finally {
    if (priorStore) require.cache[storePath] = priorStore
    else delete require.cache[storePath]
    delete require.cache[require.resolve('../src/screens/PlayerDetailScreen.tsx')]
  }
})

test('career timeline orders same-season team stints by appearance chronology', () => {
  const player = { id: 'P', name: 'P', teamId: 'B', position: 'CM' }
  const appearances = teamId => [{ playerId: 'P', teamId, role: 'starter', position: 'CM' }]
  const later = { ...game('later', 'league', 'B', 'B', 'O', 0, 0), date: '2026-02-01', appearances: appearances('B') }
  const earlier = { ...game('earlier', 'league', 'A', 'A', 'O', 0, 0), date: '2026-01-01', appearances: appearances('A') }
  assert.deepEqual(playerCareerTimeline(player, [player], [later, earlier]).map(row => row.teamId), ['A', 'B'])
})

test('career timeline preserves a return transfer within the same season', () => {
  const player = { id: 'P', name: 'P', teamId: 'A', position: 'CM' }
  const matches = ['A', 'B', 'A'].map((teamId, index) => ({ ...game(`stint${index}`, 'league', teamId, teamId, 'O', 0, 0), date: `2026-0${index + 1}-01`, appearances: [{ playerId: 'P', teamId, role: 'starter', position: 'CM' }] }))
  assert.deepEqual(playerCareerTimeline(player, [player], matches).map(row => row.teamId), ['A', 'B', 'A'])
})

test('last route restores validated player scope and keeps a valid route when one field is stale', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const state = { teams: [{ id: 'A' }], players: [{ id: 'P' }], matches: [{ id: 'm', season: 'Season 2' }] }
  saveLastRoute({ name: 'player', id: 'P', season: 'Season 1', teamId: 'A' }, undefined, storage, { name: 'player', season: 'Season 2', competition: 'cup', teamId: 'A' })
  assert.equal(JSON.parse(values.get(LAST_ROUTE_STORAGE_KEY)).version, 2)
  assert.deepEqual(loadLastNavigationEntry(state, storage), navigation.createNavigationEntry({ name: 'player', id: 'P' }, { name: 'player', season: 'Season 2', competition: 'cup', rankTrendMetric: 'rating' }))
  values.set(LAST_ROUTE_STORAGE_KEY, JSON.stringify({ version: 2, view: { name: 'player', id: 'P' }, screenState: { name: 'player', season: 'missing', competition: 'cup', teamId: 'A' } }))
  assert.deepEqual(loadLastNavigationEntry(state, storage).screenState, { name: 'player', season: null, competition: 'cup', rankTrendMetric: 'rating' })
})

test('last route preserves supported analytical destinations and their current filters', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const state = { teams: [{ id: 'A' }], players: [{ id: 'P' }, { id: 'Q' }], matches: [{ id: 'm', season: 'Season 2' }] }
  const cases = [
    [{ name: 'competition', season: 'Season 2', competitionType: 'cup' }, { ...navigation.defaultScreenState({ name: 'competition' }), competitionType: 'cup', tab: 'history' }, 'cup', 'competitionType'],
    [{ name: 'global-ranking', season: 'Season 2' }, { ...navigation.defaultScreenState({ name: 'global-ranking' }), scope: 'champions', metric: 'goals', teamId: 'A' }, 'goals', 'metric'],
    [{ name: 'comparison', leftId: 'P', rightId: 'Q', season: 'Season 2' }, { ...navigation.defaultScreenState({ name: 'comparison' }), leftId: 'P', rightId: 'Q', season: 'Season 2', competition: 'cup' }, 'cup', 'competition'],
    [{ name: 'records-leaderboard', category: 'player', leaderboardId: 'goals' }, { ...navigation.defaultScreenState({ name: 'records-leaderboard', category: 'player', leaderboardId: 'goals' }), filterSeasonIds: ['Season 2'], filterTeamIds: ['A'] }, 'Season 2', 'filterSeasonIds'],
    [{ name: 'latest-changes', season: 'Season 2' }, { name: 'latest-changes' }, 'Season 2', 'viewSeason'],
    [{ name: 'season-highlight', season: 'Season 2', kind: 'monthly' }, { name: 'season-highlight' }, 'monthly', 'viewKind'],
  ]
  for (const [view, screenState, expected, field] of cases) {
    saveLastRoute(view, undefined, storage, screenState)
    const restored = loadLastNavigationEntry(state, storage)
    assert.equal(restored.view.name, view.name)
    assert.equal(field === 'viewSeason' ? restored.view.season : field === 'viewKind' ? restored.view.kind : field === 'filterSeasonIds' ? restored.screenState[field][0] : restored.screenState[field], expected)
  }
})

test('last route restores Records, Team, and Match tabs with valid filters', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const state = { teams: [{ id: 'A' }], players: [{ id: 'P' }], matches: [{ id: 'm', season: 'Season 2' }] }
  const cases = [
    [{ name: 'records' }, { ...navigation.defaultScreenState({ name: 'records' }), category: 'history', competition: 'cup', filterSeasonIds: ['Season 2'], historyPanel: 'awards', historySeason: 'Season 2' }, 'history', 'category'],
    [{ name: 'team', id: 'A' }, { ...navigation.defaultScreenState({ name: 'team', id: 'A' }), tab: 'matches', bestPlayersSeason: 'Season 2', matchesCompetition: 'champions' }, 'matches', 'tab'],
    [{ name: 'match', id: 'm' }, { name: 'match', tab: 'ratings' }, 'ratings', 'tab'],
  ]
  for (const [view, screenState, expected, field] of cases) {
    saveLastRoute(view, undefined, storage, screenState)
    assert.equal(loadLastNavigationEntry(state, storage).screenState[field], expected)
  }
})

test('last route keeps valid Competition panel selections and drops stale entity filters', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const state = { teams: [{ id: 'A' }], players: [{ id: 'P' }], matches: [{ id: 'm', season: 'Season 2' }] }
  const view = { name: 'competition', season: 'Season 2', competitionType: 'league' }
  const screenState = { ...navigation.defaultScreenState(view), tab: 'history', bestXiMode: 'monthly', monthlyAwardBlock: 2, historyMatchday: 3, historyComparedTeamIds: ['A', 'missing'], comparedPlayerIds: ['P', 'missing'] }
  saveLastRoute(view, undefined, storage, screenState)
  const restored = loadLastNavigationEntry(state, storage).screenState
  assert.deepEqual([restored.tab, restored.bestXiMode, restored.monthlyAwardBlock, restored.historyMatchday, restored.historyComparedTeamIds, restored.comparedPlayerIds], ['history', 'period', 2, 3, ['A'], undefined])
})

test('Records Insights ignores hidden season and team filters, and team records use recorded identity', () => {
  const champion = game('champion', 'champions', 'A', 'B', 'A', 1, 3)
  const other = { ...game('other', 'league', 'B', 'B', 'A', 0, 0), season: 'Season 2' }
  const filters = { seasons: ['Season 2'], teamIds: ['B'], competition: 'all' }
  assert.deepEqual(recordsScopedMatches([champion, other], filters, 'insights').map(match => match.id), ['champion', 'other'])
  assert.deepEqual(recordsScopedMatches([champion, other], { ...filters, seasons: [], competition: 'champions' }, 'team').map(match => match.id), [])
  assert.deepEqual(recordsScopedMatches([other], { seasons: [], teamIds: ['A'], competition: 'league' }, 'team').map(match => match.id), ['other'])
})

test('Players search and filters share one navigation state across reload', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  const state = { teams: [{ id: 'A' }], players: [{ id: 'P' }], matches: [{ id: 'm', season: 'Season 2' }] }
  const view = { name: 'players' }
  const screenState = { name: 'players', search: 'p', filters: { seasons: ['Season 2'], teams: ['A'], positions: ['CB'] } }
  saveLastRoute(view, undefined, storage, screenState)
  assert.deepEqual(loadLastNavigationEntry(state, storage).screenState, screenState)
})

test('monthly award remains live when MD2 is missing between MD1 and MD3', () => {
  const matches = [game('md1', 'league', 'A', 'A', 'O', 1, 0), { ...game('md3', 'league', 'A', 'A', 'O', 1, 0), matchDay: 3 }]
  assert.equal(monthlyAwardForBlock([team('A')], [], matches, 'Season 1', 1), undefined)
  assert.equal(monthlyAwardForStartedBlock([team('A')], [], matches, 'Season 1', 1).finalized, false)
})

test('League analytics uses the frozen logical MatchDay instead of a stale top-level field', () => {
  const match = { ...game('frozen-md', 'league', 'A', 'A', 'O', 1, 0), matchDay: 1, competitionAssignment: { competitionType: 'league', season: 'Season 1', teamId: 'A', stage: 'regular', matchDay: 3 } }
  assert.equal(isLeagueMatchdayComplete([team('A')], [match], 'Season 1', 1), false)
  assert.equal(isLeagueMatchdayComplete([team('A')], [match], 'Season 1', 3), true)
  assert.equal(buildSeasonAnalytics([team('A')], [], [match], 'Season 1').currentMatchDay, 3)
})

test('Biggest Win excludes a larger loss on the same Matchday', () => {
  const loss = game('loss', 'league', 'A', 'A', 'O', 0, 5)
  const win = game('win', 'league', 'B', 'B', 'O', 2, 0)
  const review = buildSeasonAnalytics([team('A'), team('B')], [], [loss, win], 'Season 1').latestReview
  assert.deepEqual(review.biggestWin, { matchId: 'win', margin: 2 })
})

test('defender SOT eligibility uses credited defender minutes', () => {
  const player = { id: 'P', name: 'P', teamId: 'A', position: 'CM' }
  const match = { ...game('role', 'league', 'A', 'A', 'O', 0, 0), halftimeOpponentSot: 2, fulltimeOpponentSot: 8, appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'CM', positionHistory: [{ minute: 70, position: 'CB' }] }] }
  const row = buildGlobalRankingData([player], [match], { seasons: ['Season 1'], teams: [], positions: [] }, 'rating')[0]
  assert.equal(row.sotAllowedAppearances, 0)
})

test('CB partnership SOT uses the actual 60–90 overlap in the second half', () => {
  const players = ['P', 'Q'].map(id => ({ id, name: id, teamId: 'A', position: 'CB' }))
  const match = { ...game('overlap', 'league', 'A', 'A', 'O', 0, 0), halftimeOpponentSot: 2, fulltimeOpponentSot: 8, appearances: players.map(player => ({ playerId: player.id, teamId: 'A', role: 'bench', position: 'CB' })), events: players.map((player, index) => ({ id: `sub${index}`, type: 'sub', teamId: 'A', minute: 60, playerOutId: `old${index}`, playerInId: player.id, position: 'CB' })) }
  const row = combinationStats(players, [match], {}, 'cb')[0]
  assert.equal(row.togetherMinutes, 30)
  assert.equal(row.weightedOpponentSot, 4)
})

test('Starting PPG cannot use wins from matches where the pair did not start together', () => {
  assert.equal(startingPPG({ startsTogether: 1, startingWins: 1, startingDraws: 0, wins: 3, draws: 0 }), 3)
})

test('GK qualification keeps short appearance saves out of qualifying rate sample', () => {
  const keeper = { id: 'GK', name: 'GK', teamId: 'A', position: 'GK' }
  const full = { ...game('full', 'league', 'A', 'A', 'O', 0, 1), appearances: [{ playerId: 'GK', teamId: 'A', role: 'starter', position: 'GK' }], events: [{ id: 'goal', type: 'goal', minute: 45, teamId: 'O' }, { id: 'save', type: 'save', minute: 20, teamId: 'A', playerId: 'GK', count: 2 }] }
  const short = { ...game('short', 'league', 'A', 'A', 'O', 0, 0), matchDay: 2, appearances: [{ playerId: 'GK', teamId: 'A', role: 'bench', position: 'GK' }], events: [{ id: 'sub', type: 'sub', minute: 60, teamId: 'A', playerOutId: 'old', playerInId: 'GK', position: 'GK' }, { id: 'save9', type: 'save', minute: 70, teamId: 'A', playerId: 'GK', count: 9 }] }
  const row = buildGlobalRankingData([keeper], [full, short], { seasons: ['Season 1'], teams: [], positions: [] }, 'rating')[0]
  assert.equal(row.goalkeeperMinutes, 120)
  assert.equal(row.qualifyingGoalkeeperMinutes, 90)
  assert.equal(row.qualifyingGoalkeeperAppearances, 1)
  assert.equal(row.qualifyingSaves, 2)
  assert.equal(row.qualifyingConceded, 1)
})

test('Champions opponent records cannot inflate the forty-percent award denominator', () => {
  const player = { id: 'P', name: 'P', teamId: 'B', position: 'ST' }
  const owned = [1, 2].map(day => ({ ...game(`b${day}`, 'champions', 'B', 'B', 'A', 0, 0), matchDay: day, appearances: [{ playerId: 'P', teamId: 'B', role: 'starter', position: 'ST' }] }))
  const opponent = [1, 2, 3, 4].map(day => ({ ...game(`a${day}`, 'champions', 'A', 'A', 'B', 0, 0), matchDay: day }))
  assert.equal(awardCandidatesForScope([player], [...owned, ...opponent]).some(candidate => candidate.playerId === 'P'), true)
})

test('same-minute position changes appear in both recent matches and match detail', () => {
  const appearance = { playerId: 'P', teamId: 'A', role: 'bench', position: 'CM', matchPosition: 'CM', positionHistory: [{ minute: 60, sequence: 3, position: 'RW' }, { minute: 60, sequence: 2, position: 'CAM' }] }
  const events = [{ id: 'on', type: 'sub', teamId: 'A', minute: 30, sequence: 1, playerOutId: 'Q', playerInId: 'P', position: 'CM' }]
  const match = { ...game('positions', 'league', 'A', 'A', 'O', 0, 0), appearances: [appearance], events }
  assert.equal(recentMatchPositions(match, appearance), 'CM → CAM → RW')
  assert.equal(matchRoleLabel(appearance, events), 'CM → CAM → RW')
})

test('a same-minute post-substitution position move remains visible in Recent Matches', () => {
  const appearance = { playerId: 'P', teamId: 'A', role: 'bench', position: 'CM', matchPosition: 'CM', positionHistory: [{ minute: 60, sequence: 3, position: 'RW' }, { minute: 60, sequence: 2, position: 'CAM' }] }
  const events = [{ id: 'on', type: 'sub', teamId: 'A', minute: 60, sequence: 1, playerOutId: 'Q', playerInId: 'P', position: 'CM' }]
  const match = { ...game('entry-positions', 'league', 'A', 'A', 'O', 0, 0), appearances: [appearance], events }
  assert.equal(recentMatchPositions(match, appearance), 'CM → CAM → RW')
})

test('Records History Team of the Season uses the official season award XI', () => {
  const players = [{ id: 'P', name: 'P', teamId: 'A', position: 'ST' }]
  const teams = [team('A')]
  const matches = [1, 2, 3].map(day => ({ ...game(`award${day}`, 'league', 'A', 'A', 'O', 0, 0), matchDay: day, appearances: day === 1 ? [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'ST' }] : [] }))
  const official = seasonAwards('Season 1', teams, players, matches, [])
  const history = historyTimelineForSeason(teams, players, matches, [], 'Season 1')
  assert.deepEqual(history.bestXI, official.bestXI.flatMap(slot => slot.playerId ? [slot.playerId] : []))
})

test('award article anchor follows recording chronology on the same date', () => {
  const player = { id: 'P', name: 'P', teamId: 'A', position: 'ST' }
  const first = { ...game('z-earlier', 'league', 'A', 'A', 'O', 0, 0), recordedAt: 100, appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'ST' }] }
  const second = { ...game('a-later', 'league', 'A', 'A', 'O', 0, 0), recordedAt: 200, matchDay: 2, appearances: [{ playerId: 'P', teamId: 'A', role: 'starter', position: 'ST' }] }
  assert.equal(competitionAwardResult('league', 'Season 1', [team('A')], [player], [first, second], []).anchorMatch.id, 'a-later')
})

test('Champions opponent results do not advance News team streaks', () => {
  const matches = Array.from({ length: 5 }, (_, index) => ({ ...game(`news${index}`, 'champions', 'A', 'A', 'B', 0, 1), matchDay: index + 1, date: `2026-01-0${index + 1}` }))
  const news = deriveNews([], [team('A'), team('B')], matches)
  assert.equal(news.some(item => item.id.startsWith('team-win-streak:Season 1:B:')), false)
  const changes = buildMatchChangeIndex([], [team('A'), team('B')], matches)
  assert.equal([...changes.values()].flat().some(group => group.items.some(item => item.id.startsWith('team-win-streak:Season 1:B:'))), false)
})

test('same-minute goal classification follows event sequence', () => {
  const match = { ...game('ordered-goals', 'league', 'A', 'A', 'B', 0, 0), events: [{ id: 'later', type: 'goal', teamId: 'B', minute: 10, sequence: 2 }, { id: 'earlier', type: 'goal', teamId: 'A', minute: 10, sequence: 1 }] }
  assert.deepEqual(classifyGoalEvents(match).map(row => [row.eventId, row.scoreBefore]), [['earlier', { home: 0, away: 0 }], ['later', { home: 1, away: 0 }]])
})

test('integrity reports stable IDs, logical slots, assignments, and invalid manual SOT', () => {
  const teams = [team('A'), team('A')]
  const players = [{ id: 'P' }, { id: 'P' }]
  const first = { ...game('one', 'league', 'A', 'A', 'O', 0, 0), matchDay: 1, halftimeOpponentSot: 5, fulltimeOpponentSot: 3, competitionAssignment: { competitionType: 'league', season: 'Season 1', teamId: 'A', stage: 'regular', matchDay: 31 } }
  const duplicate = { ...game('two', 'league', 'A', 'A', 'O', 0, 0), matchDay: 1 }
  const gap = { ...game('three', 'league', 'A', 'A', 'O', 0, 0), matchDay: 3 }
  const outOfRange = { ...game('four', 'league', 'A', 'A', 'O', 0, 0), matchDay: 31 }
  const states = [{ id: 'draw', season: 'Season 1', kind: 'season-complete', teamIds: [] }, { id: 'draw', season: 'Season 1', kind: 'season-complete', teamIds: [] }]
  const messages = auditDataIntegrity([first, duplicate, gap, outOfRange], players, teams, states).issues.map(issue => issue.message)
  for (const fragment of ['Duplicate stable team ID', 'Duplicate stable player ID', 'Duplicate stable competition state ID', 'Duplicate League slot', 'League slot gap', 'out of range', 'Invalid competition assignment', 'Opponent SOT']) assert.equal(messages.some(message => message.includes(fragment)), true, fragment)
})

test('integrity detects Champions and Cup logical duplicates without editing saved records', () => {
  const champion = { ...game('c1', 'champions', 'A', 'A', 'B', 0, 0), competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1 }
  const repeat = { ...champion, id: 'c2' }
  const invalid = { ...champion, id: 'c3', competitionSeriesGame: 4 }
  const cup = { ...game('u1', 'cup', 'A', 'A', 'B', 0, 0), competitionStage: 'stage1' }
  const cupRepeat = { ...cup, id: 'u2' }
  const matches = [champion, repeat, invalid, cup, cupRepeat]
  const before = JSON.stringify(matches)
  const messages = auditDataIntegrity(matches, [], [team('A'), team('B')]).issues.map(issue => issue.message)
  assert.equal(messages.some(message => message.includes('Duplicate Champions logical slot')), true)
  assert.equal(messages.some(message => message.includes('Invalid Champions series game')), true)
  assert.equal(messages.some(message => message.includes('Duplicate Cup logical slot')), true)
  assert.equal(JSON.stringify(matches), before)
})

test('integrity detects a registered owner outside the fixture and an independent opponent lineup', () => {
  const wrongOwner = game('wrong-owner', 'league', 'C', 'A', 'B', 0, 0)
  const opponentLineup = { ...game('opponent-lineup', 'champions', 'A', 'A', 'B', 0, 0), appearances: [{ playerId: 'P', teamId: 'B', role: 'starter', position: 'CM' }] }
  const messages = auditDataIntegrity([wrongOwner, opponentLineup], [{ id: 'P' }], [team('A'), team('B'), team('C')]).issues.map(issue => issue.message)
  assert.equal(messages.some(message => message.includes('Recorded team is not a side')), true)
  assert.equal(messages.some(message => message.includes('independent opponent lineup')), true)
})
