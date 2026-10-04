const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { derivePlayerScope, playerAppearanceMatches } = require('../src/engine/playerDerived.ts')
const { aggregatePlayerStats, buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const { playerStreaks } = require('../src/engine/seasonInsights.ts')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { teamGoalkeeperSaves } = require('../src/engine/opponentSot.ts')
const { playerAssistEvents, playerGoalEvents, playerSaveCount, playerGoalkeeperFacts } = require('../src/engine/playerMatchFacts.ts')
const { POSITION_RULES, ratePlayerMatch } = require('../src/engine/rating.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { createNavigationEntry, navigateBrowseEntry } = require('../src/lib/navigation.ts')
const { goalTypeTotals } = require('../src/engine/goalTypes.ts')
const { matchStory } = require('../src/engine/matchStory.ts')
const { teamMetrics } = require('../src/engine/teamMetrics.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')
const { deriveNews } = require('../src/engine/news.ts')
const { matchChangesForMatch } = require('../src/engine/matchChanges.ts')
const { scopedPositionFamilyByPlayer } = require('../src/engine/positionScope.ts')
const { buildSeasonAnalytics, scopedMetricRanks } = require('../src/engine/seasonAnalytics.ts')
const { historyTimelineForSeason } = require('../src/engine/historyReadModels.ts')
const { seasonRecap } = require('../src/engine/seasonInsights.ts')
const { seasonAwards } = require('../src/engine/awards.ts')
const { matchContributionSequences } = require('../src/engine/matchContributionSequences.ts')

const player = (id, position = 'GK', teamId = 'A') => ({ id, name: id, displayName: id, position, teamId, number: 1 })
const appearance = (id, teamId = 'A', position = 'GK', role = 'starter') => ({ playerId: id, teamId, position, matchPosition: position, role })
const match = (id, date, appearances, events = [], competitionType = 'league') => ({ id, date, season: 'Season 1', competitionType, matchDay: 1, duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'B', appearances, events })
const save = (id, count, playerId = 'P', teamId = 'A', minute = 20) => ({ id, type: 'save', count, playerId, teamId, minute })
const goal = (id, playerId = 'P', teamId = 'A', minute = 20) => ({ id, type: 'goal', playerId, teamId, minute })
const group = (groups, id) => groups.find(item => item.id === id)

test('zero and positive save counts agree across Player Detail, ranking, Records and team totals', () => {
  const keeper = player('P')
  const games = [match('zero', '2026-01-01', [appearance('P')], [save('s0', 0)]), match('three', '2026-01-02', [appearance('P')], [save('s3', 3)])]
  const derived = derivePlayerScope(keeper, [keeper], games, { season: 'Season 1', competition: 'league' })
  const ranking = buildGlobalRankingData([keeper], games, { seasons: ['Season 1'], teams: [], positions: [] }, 'saves')
  const records = buildPlayerRecordLeaderboards([keeper], games)
  assert.equal(derived.saves, 3)
  assert.equal(rankGlobalRankingRows(ranking, [keeper], 'saves')[0].saves, 3)
  assert.equal(group(records, 'saves').rows[0].numeric, 3)
  assert.equal(teamGoalkeeperSaves(games[0], 'A'), 0)
  assert.equal(teamGoalkeeperSaves(games[1], 'A'), 3)
})

test('same-scope appearances, contributions, ratings and GK facts agree across consumers', () => {
  const keeper = player('P')
  const striker = player('Q', 'ST')
  const games = [
    match('first', '2026-01-01', [appearance('P'), appearance('Q', 'A', 'ST')], [
      { ...goal('scored'), assistPlayerId: 'Q' },
      { ...goal('assisted', 'Q', 'A', 40), assistPlayerId: 'P' },
      save('two', 2),
    ]),
    match('second', '2026-01-02', [appearance('P')], [save('one', 1), goal('conceded', undefined, 'B', 50)]),
    match('bench', '2026-01-03', [appearance('P', 'A', 'GK', 'bench')]),
  ]
  const players = [keeper, striker]
  const scope = { seasons: ['Season 1'], teams: [], positions: [] }
  const detail = derivePlayerScope(keeper, players, games, { season: 'Season 1', competition: 'league' })
  const row = buildGlobalRankingData(players, games, scope, 'rating').find(item => item.playerId === 'P')
  const comparison = aggregatePlayerStats(keeper, players, games)
  const records = buildPlayerRecordLeaderboards(players, games, { seasons: ['Season 1'], competition: 'league' })
  assert(row)
  for (const key of ['matches', 'minutes', 'goals', 'assists', 'mom', 'goodMatches', 'saves']) {
    const detailValue = key === 'matches' ? detail.apps : key === 'goodMatches' ? detail.goodMatches : detail[key]
    assert.equal(row[key], detailValue, key)
    assert.equal(comparison[key], detailValue, `comparison ${key}`)
  }
  assert.equal(row.avgRating, detail.averageRating)
  assert.equal(comparison.avgRating, detail.averageRating)
  assert.equal(row.cleanSheets, detail.cleanSheets)
  assert.equal(row.goalkeeperConceded, detail.goalkeeperConceded)
  assert.equal(rankGlobalRankingRows(buildGlobalRankingData(players, games, scope, 'savePercentage'), players, 'savePercentage').find(item => item.playerId === 'P').value, detail.savePercentage)
  for (const [id, value] of [['goals', detail.goals], ['assists', detail.assists], ['mom', detail.mom], ['good', detail.goodMatches], ['saves', detail.saves], ['clean-sheets', detail.cleanSheets]]) {
    assert.equal(group(records, id).rows.find(item => item.playerId === 'P')?.numeric ?? 0, value, `Records ${id}`)
  }
  assert.equal(playerGoalEvents(games[0], games[0].appearances[0]).length, 1)
  assert.equal(playerAssistEvents(games[0], games[0].appearances[0]).length, 1)
})

test('wrong-team player goal is excluded from all player projections while match score remains intact', () => {
  const striker = player('P', 'ST')
  const game = match('wrong-team', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('wrong', 'P', 'B')])
  assert.equal(derivePlayerScope(striker, [striker], [game]).goals, 0)
  assert.equal(buildGlobalRankingData([striker], [game], { seasons: ['Season 1'], teams: [], positions: [] }, 'goals')[0].goals, 0)
  assert.equal(aggregatePlayerStats(striker, [striker], [game]).goals, 0)
  assert.equal(group(buildPlayerRecordLeaderboards([striker], [game]), 'goals').rows.length, 0)
  assert.equal(Object.values(goalTypeTotals(game, 'P')).slice(0, 5).reduce((sum, value) => sum + value, 0), 0)
})

test('League, Cup and Champions navigation scopes resolve distinct player goal totals', () => {
  const striker = player('P', 'ST')
  const leagues = [match('l1', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('l1')]), match('l2', '2026-01-02', [appearance('P', 'A', 'ST')], [goal('l2')])]
  const cup = match('c', '2026-01-03', [appearance('P', 'A', 'ST')], [goal('c')], 'cup')
  const champions = match('h', '2026-01-04', [appearance('P', 'A', 'ST')], [goal('h1'), goal('h2', 'P', 'A', 30), goal('h3', 'P', 'A', 40)], 'champions')
  for (const [competition, expected] of [['league', 2], ['cup', 1], ['champions', 3]]) {
    const route = createNavigationEntry({ name: 'player', id: 'P', season: 'Season 1', competitionType: competition })
    assert.equal(derivePlayerScope(striker, [striker], [...leagues, cup, champions], { season: route.screenState.season, competition: route.screenState.competition }).goals, expected)
  }
})

test('REV12 preserves the striker reference rating and non-CB coefficients', () => {
  const striker = player('P', 'ST')
  const game = match('rating', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('g')])
  assert.equal(RATING_ENGINE_REVISION, 12)
  assert.equal(POSITION_RULES.ST.goal, 0.9)
  assert.equal(POSITION_RULES.CB.suppressionMax, 1.3)
  assert.equal(POSITION_RULES.GK.assist, 1)
  assert.equal(ratePlayerMatch(game, striker).raw, 7.5)
})

test('a field role clean match cannot create a goalkeeper clean sheet', () => {
  const mixed = player('P', 'CM')
  const games = [match('keeper', '2026-01-01', [appearance('P')]), match('field', '2026-01-02', [appearance('P', 'A', 'CM')])]
  const derived = derivePlayerScope(mixed, [mixed], games)
  const ranked = rankGlobalRankingRows(buildGlobalRankingData([mixed], games, { seasons: ['Season 1'], teams: [], positions: [] }, 'rating'), [mixed], 'cleanSheets')
  const records = buildPlayerRecordLeaderboards([mixed], games)
  assert.equal(derived.cleanSheets, 1)
  assert.equal(ranked[0].value, 1)
  assert.equal(group(records, 'clean-sheets').rows[0].numeric, 1)
  assert.equal(playerStreaks(mixed, games).find(row => row.key === 'cleanSheets').best, 1)
  assert.equal(playerStreaks(mixed, games).find(row => row.key === 'cleanSheets').current, 0)
})

test('an unused bench listing does not count as a match or break a scoring streak', () => {
  const striker = player('P', 'ST')
  const games = [match('first', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('g1')]), match('bench', '2026-01-02', [appearance('P', 'A', 'ST', 'bench')]), match('last', '2026-01-03', [appearance('P', 'A', 'ST')], [goal('g2')])]
  assert.equal(derivePlayerScope(striker, [striker], games).apps, 2)
  assert.deepEqual(playerAppearanceMatches(striker, games).map(row => row.id), ['last', 'first'])
  assert.equal(playerStreaks(striker, games).find(row => row.key === 'goals').best, 2)
})

test('team Records keep only the selected team as a result entity', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [match('one', '2026-01-01', [appearance('PA', 'A', 'ST'), appearance('PB', 'B', 'ST')], [goal('ga', 'PA', 'A')])]
  const scope = { seasons: ['Season 1'], teamIds: ['A'], competition: 'all', positionFilter: 'all' }
  const rows = recordsLeaderboardGroups({ category: 'team', players: [player('PA', 'ST'), player('PB', 'ST', 'B')], teams, matches: games, scope })
  assert.deepEqual(group(rows, 'wins').rows.map(row => row.id), ['A'])
})

test('save validation uses the event-time goalkeeper role and rejects malformed counts', () => {
  const row = { ...appearance('P', 'A', 'CM'), positionHistory: [{ minute: 45, position: 'GK' }] }
  const game = match('mixed', '2026-01-01', [row, appearance('Q', 'B', 'ST')], [
    save('before', 2, 'P', 'A', 20), save('after', 3, 'P', 'A', 60),
    save('wrong-team', 2, 'P', 'B', 70), save('field', 2, 'Q', 'B', 70),
    { ...save('undated', 2), minute: undefined }, save('fractional', 1.5, 'P', 'A', 70),
  ])
  assert.equal(playerSaveCount(game, row), 5)
  assert.equal(teamGoalkeeperSaves(game, 'A'), 5)
  assert.equal(teamGoalkeeperSaves(game, 'B'), 0)
  assert.equal(playerGoalkeeperFacts(game, row).minutes, 45)
})

test('navigation preserves a ranking player scope and distinguishes another scope', () => {
  const source = createNavigationEntry({ name: 'global-ranking', season: 'Season 2', competitionType: 'cup', teamId: 'A' })
  const cup = { name: 'player', id: 'P', season: 'Season 2', competitionType: 'cup', teamId: 'A' }
  const league = { name: 'player', id: 'P', season: 'Season 2', competitionType: 'league' }
  const opened = navigateBrowseEntry([source], cup, 0)
  assert.equal(opened[1].screenState.season, 'Season 2')
  assert.equal(opened[1].screenState.competition, 'cup')
  assert.equal(opened[1].screenState.teamId, 'A')
  assert.equal(navigateBrowseEntry(opened, league, 0).length, 3)
  assert.equal(navigateBrowseEntry(opened, cup, 0).length, 2)
})

test('player goal types reject a scorer who was off pitch', () => {
  const striker = player('P', 'ST')
  const game = match('goals', '2026-01-01', [appearance('P', 'A', 'ST', 'bench')], [
    goal('invalid', 'P', 'A', 10),
    { id: 'on', type: 'sub', teamId: 'A', playerInId: 'P', playerOutId: 'Q', minute: 30 },
    goal('valid', 'P', 'A', 60),
  ])
  game.appearances.push(appearance('Q', 'A', 'ST'))
  assert.equal(derivePlayerScope(striker, [striker], [game]).goals, 1)
  assert.equal(Object.values(goalTypeTotals(game, 'P')).slice(0, 5).reduce((sum, value) => sum + value, 0), 1)
})

test('match story uses only validated saves and player goals for performance tags', () => {
  const keeper = player('P')
  const game = match('story', '2026-01-01', [appearance('P'), appearance('Q', 'A', 'GK', 'bench')], [
    { id: 'sub', type: 'sub', teamId: 'A', playerInId: 'Q', playerOutId: 'P', minute: 45 },
    save('invalid', 6, 'P', 'A', 70),
  ])
  const tags = matchStory(game, [keeper]).tags
  assert.equal(tags.includes('High-Save GK Performance'), false)
})

test('team form follows canonical date chronology when matchday and storage order disagree', () => {
  const team = { id: 'A', name: 'A' }
  const games = [match('late', '2026-01-03', [], [goal('late-goal', 'P', 'A')]), match('early', '2026-01-01', [], [], 'cup'), match('middle', '2026-01-02', [], [], 'champions')]
  games[0].matchDay = 1; games[1].matchDay = 30; games[2].matchDay = 12
  assert.deepEqual(teamMetrics(team, games).games.map(row => row.id), ['late', 'middle', 'early'])
})

test('integrity accepts a zero total-save event but diagnoses malformed counts', () => {
  const keeper = player('P')
  const game = match('integrity', '2026-01-01', [appearance('P')], [save('zero', 0), save('fraction', 1.5)])
  const report = auditDataIntegrity([game], [keeper], [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }])
  assert.equal(report.issues.some(issue => issue.message.includes('Save count') && issue.message.includes('malformed')), true)
  assert.equal(report.issues.some(issue => issue.message.includes('zero')), false)
})

test('team-filtered combination Records do not include opponent pairs', () => {
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const players = [player('PA', 'ST'), player('PB1', 'ST', 'B'), player('PB2', 'CAM', 'B')]
  const game = match('pairs', '2026-01-01', [appearance('PA', 'A', 'ST'), appearance('PB1', 'B', 'ST'), appearance('PB2', 'B', 'CAM')], [
    { ...goal('opponent', 'PB1', 'B'), assistPlayerId: 'PB2' },
  ])
  const rows = recordsLeaderboardGroups({ category: 'combination', players, teams, matches: [game], scope: { seasons: ['Season 1'], teamIds: ['A'], competition: 'all', positionFilter: 'all' } })
  assert.equal(rows.some(section => section.rows.some(row => row.playerIds?.some(id => id.startsWith('PB')))), false)
})

test('career saves milestone follows the same validated total as Records', () => {
  const keeper = player('P')
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [match('first', '2026-01-01', [appearance('P')], [save('ninety-nine', 99)]), match('zero', '2026-01-02', [appearance('P')], [save('none', 0)]), match('hundred', '2026-01-03', [appearance('P')], [save('one', 1)])]
  const record = group(buildPlayerRecordLeaderboards([keeper], games), 'saves').rows[0]
  assert.equal(record.numeric, 100)
  assert.equal(deriveNews([keeper], teams, games).some(item => item.id === 'career-saves:P:100' && item.matchId === 'zero'), false)
  assert.equal(deriveNews([keeper], teams, games).some(item => item.id === 'career-saves:P:100' && item.matchId === 'hundred'), true)
  assert.equal(matchChangesForMatch([keeper], teams, games, [], 'zero').some(row => row.detail.includes('100 career saves')), false)
  assert.equal(matchChangesForMatch([keeper], teams, games, [], 'hundred').some(row => row.detail.includes('100 career saves')), true)
})

test('a transferred player has the same team-scoped goals in ranking and Player Detail', () => {
  const transferred = player('P', 'ST', 'B')
  const games = [match('at-a', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('a')]), match('at-b', '2026-01-02', [appearance('P', 'B', 'ST')], [goal('b', 'P', 'B')])]
  const rows = buildGlobalRankingData([transferred], games, { seasons: ['Season 1'], teams: ['A'], positions: [] }, 'goals')
  const detail = derivePlayerScope(transferred, [transferred], games, { season: 'Season 1', competition: 'league', teamIds: ['A'] })
  assert.equal(rows[0].goals, 1)
  assert.equal(rows[0].matches, 1)
  assert.equal(detail.goals, 1)
  assert.equal(detail.apps, 1)
})

test('Player Detail team rank recomputes the latest team stint instead of grouping career totals', () => {
  const transferred = player('P', 'ST', 'B'); const rival = player('Q', 'ST', 'B')
  const atA = match('at-a', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('a1'), goal('a2', 'P', 'A', 30), goal('a3', 'P', 'A', 40)])
  const atB = match('at-b', '2026-01-02', [appearance('P', 'B', 'ST'), appearance('Q', 'B', 'ST')], [goal('p', 'P', 'B'), goal('q1', 'Q', 'B', 30), goal('q2', 'Q', 'B', 40)])
  const players = [transferred, rival]; const games = [atA, atB]
  const all = rankGlobalRankingRows(buildGlobalRankingData(players, games, { seasons: ['Season 1'], teams: [], positions: [] }, 'goals'), players, 'goals')
  const team = rankGlobalRankingRows(buildGlobalRankingData(players, games, { seasons: ['Season 1'], teams: ['B'], positions: [] }, 'goals'), players, 'goals')
  assert.deepEqual(all.map(row => row.playerId), ['P', 'Q'])
  assert.deepEqual(team.map(row => row.playerId), ['Q', 'P'])
  assert.equal(scopedMetricRanks(team, players, 'P').team, 2)
  assert.match(fs.readFileSync(require.resolve('../src/screens/PlayerDetailScreen.tsx'), 'utf8'), /team: scopedMetricRanks\(teamRankingRows\[metric\]/)
})

test('position rank uses the dominant played family in the selected historical scope', () => {
  const changed = player('P', 'CM')
  const rival = player('Q', 'CDM')
  const games = [match('old', '2026-01-01', [appearance('P', 'A', 'CDM'), appearance('Q', 'A', 'CDM')])]
  const families = scopedPositionFamilyByPlayer([changed, rival], games, { teams: [] })
  const ranked = rankGlobalRankingRows(buildGlobalRankingData([changed, rival], games, { seasons: ['Season 1'], teams: [], positions: [] }, 'rating'), [changed, rival], 'rating')
  assert.equal(families.get('P'), 'CDM')
  assert.equal(ranked.find(row => row.playerId === 'P').scopedPositionFamily, 'CDM')
  assert.notEqual(scopedMetricRanks(ranked, [changed, rival], 'P', families).position, null)
})

test('Comparison Last 5 follows match dates instead of storage order', () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const striker = player('P', 'ST')
  const byDate = Array.from({ length: 6 }, (_, index) => match(`m${index + 1}`, `2026-01-0${index + 1}`, [appearance('P', 'A', 'ST')], index === 0 ? [goal('g1'), goal('g2', 'P', 'A', 30), goal('g3', 'P', 'A', 40)] : []))
  const games = [byDate[5], ...byDate.slice(0, 5)]
  const storePath = require.resolve('../src/store.tsx')
  const original = require.cache[storePath]
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { useStore: () => ({ players: [striker], teams: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], matches: games }) } }
  try {
    const { ComparisonScreen } = require('../src/screens/ComparisonScreen.tsx')
    const html = renderToStaticMarkup(React.createElement(ComparisonScreen, { season: 'Season 1', screenState: { name: 'comparison', leftId: 'P', rightId: '', season: 'Season 1', competition: 'all', teamId: null }, onStateChange() {}, onNavigate() {} }))
    assert.match(html, />6\.50<\/span><span class="text-zinc-500">Last 5 Avg<\/span>/)
  } finally {
    if (original) require.cache[storePath] = original
    else delete require.cache[storePath]
  }
})

test('League Rating Race History uses the current ranking population', () => {
  const striker = player('P', 'ST')
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const games = [match('first', '2026-01-01', [appearance('P', 'A', 'ST')]), match('second', '2026-01-02', []), match('third', '2026-01-03', [])]
  games.forEach((game, index) => { game.matchDay = index + 1 })
  const ranked = rankGlobalRankingRows(buildGlobalRankingData([striker], games, { seasons: ['Season 1'], teams: [], positions: [] }, 'rating'), [striker], 'rating')
  const history = buildSeasonAnalytics(teams, [striker], games, 'Season 1').playerSnapshots.get(3).rows.get('rating')
  assert.deepEqual(ranked.map(row => row.playerId), ['P'])
  assert.deepEqual(history.map(row => row.playerId), ['P'])
})

test('History top scorer uses the ranking tie break', () => {
  const players = [player('A', 'ST'), player('Z', 'ST')]
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const game = match('tie', '2026-01-01', [appearance('A', 'A', 'ST'), appearance('Z', 'A', 'ST')], [goal('a-goal', 'A'), { ...goal('z-goal', 'Z', 'A', 40), assistPlayerId: 'Z' }])
  const ranked = rankGlobalRankingRows(buildGlobalRankingData(players, [game], { seasons: ['Season 1'], teams: [], positions: [] }, 'rating'), players, 'goals')
  const history = historyTimelineForSeason(teams, players, [game], [], 'Season 1')
  assert.equal(history.scorer.playerId, ranked[0].playerId)
})

test('Season Recap reuses the canonical season award winners', () => {
  const players = [player('A', 'ST'), player('Z', 'ST')]
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  const game = match('recap', '2026-01-01', [appearance('A', 'A', 'ST'), appearance('Z', 'A', 'ST')], [goal('a-goal', 'A'), { ...goal('z-goal', 'Z', 'A', 40), assistPlayerId: 'Z' }])
  const official = seasonAwards('Season 1', teams, players, [game], [])
  const recap = seasonRecap(players, [game], 'Season 1', [], teams)
  assert.equal(recap.awards.find(row => row.id === 'scorer').playerIds[0], official.goldenBoot.playerId)
  assert.equal(recap.awards.find(row => row.id === 'assists').playerIds[0], official.assistLeader.playerId)
  assert.deepEqual(recap.bestXI.map(row => row.playerId), official.bestXI.map(row => row.playerId))
})

test('Golden Glove counts a clean GK interval even when the player later concedes in the field', () => {
  const keeper = player('P', 'GK')
  const row = { ...appearance('P'), positionHistory: [{ minute: 45, position: 'CM' }] }
  const game = match('mixed-award', '2026-01-01', [row], [goal('opponent', 'X', 'B', 70)])
  const teams = [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }]
  assert.equal(derivePlayerScope(keeper, [keeper], [game]).cleanSheets, 1)
  assert.equal(seasonAwards('Season 1', teams, [keeper], [game], []).goldenGlove.value, 1)
})

test('Match Changes contribution ordinals omit invalid legacy player goals', () => {
  const game = match('contributions', '2026-01-01', [appearance('P', 'A', 'ST')], [goal('valid'), goal('wrong-team', 'P', 'B', 40)])
  assert.deepEqual(matchContributionSequences([game], game.id).P.goals, [1])
})
