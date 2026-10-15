require('./helpers/register-ts.cjs')
const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { scopedMetricRanks } = require('../src/engine/seasonAnalytics.ts')
const { scopedPositionFamilyByPlayer } = require('../src/engine/positionScope.ts')
const { matchCompetitionType } = require('../src/engine/competitionContext.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const root = path.resolve(__dirname, '..')
const players = [
  { id: 'a', teamId: 'C', name: 'Moved player', position: 'ST', number: 1 },
  { id: 'b', teamId: 'A', name: 'Alpha player', position: 'CM', number: 2 },
  { id: 'c', teamId: 'B', name: 'Beta player', position: 'CB', number: 3 },
]
const teams = ['A', 'B', 'C', 'O'].map(id => ({ id, name: id, shortName: id }))
const match = (id, season, type, teamId, position, scorer) => ({ id, season, competitionType: type, competitionStage: type === 'cup' ? 'stage1' : type === 'champions' ? 'roundOf16' : 'regular', matchDay: 1, date: `2026-01-${String(id).padStart(2, '0')}`, duration: 90, teamId, homeTeamId: teamId, awayTeamId: 'O', appearances: players.filter(p => p.id === 'a' || p.teamId === teamId).map(p => ({ playerId: p.id, teamId, position: p.position, matchPosition: position, role: 'starter' })), events: scorer ? [{ id: `g${id}`, type: 'goal', teamId, playerId: scorer, minute: 20 }] : [] })
const matches = [match(1, 'S1', 'league', 'A', 'CAM', 'a'), match(2, 'S1', 'league', 'A', 'CAM', 'a'), match(3, 'S1', 'league', 'A', 'CAM', 'a'), match(4, 'S2', 'league', 'A', 'RW', 'b'), match(5, 'S2', 'cup', 'B', 'LW', 'a'), match(6, 'S2', 'champions', 'B', 'CM', 'c')]
const store = { players, teams, matches, competitionStates: [] }
const noop = () => {}
function renderComparison(season, competition, teamId) {
  return screenHarness(root, 'screens/ComparisonScreen.tsx', 'ComparisonScreen', store).render({ season, screenState: { ...defaultScreenState({ name: 'comparison' }), leftId: 'a', rightId: 'b', competition, teamId }, onStateChange: noop, onNavigate: noop })
}

for (const competition of ['league', 'cup', 'champions', 'all']) test(`Comparison ${competition} ranks and statistics match canonical and Player Detail scope`, () => {
  const tree = renderComparison('S2', competition, null)
  const values = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'ComparisonValue')
  const detail = screenHarness(root, 'screens/PlayerDetailScreen.tsx', 'PlayerDetailScreen', store).render({ playerId: 'a', season: 'S2', screenState: { ...defaultScreenState({ name: 'player', id: 'a' }), season: 'S2', competition }, onStateChange: noop, onNavigate: noop, onBack: noop })
  const detailRanks = nodes(detail, n => typeof n.type === 'function' && n.type.name === 'Overview')[0].props.ranks.rating
  const scope = matches.filter(m => m.season === 'S2' && (competition === 'all' || matchCompetitionType(m) === competition))
  const ranking = rankGlobalRankingRows(buildGlobalRankingData(players, scope, { seasons: ['S2'], teams: [], positions: [] }, 'rating'), players, 'rating')
  const families = scopedPositionFamilyByPlayer(players, scope, {})
  for (const [index, player] of [players[0], players[1]].entries()) {
    const get = label => values.filter(n => n.props.metric.label === label)[index].props.value
    const data = derivePlayerScope(player, players, matches, { season: 'S2', competition })
    const ranks = scopedMetricRanks(ranking, players, player.id, families)
    const historicalTeamId = data.appearances.at(-1)?.appearance.teamId
    const teamRows = historicalTeamId ? rankGlobalRankingRows(buildGlobalRankingData(players, scope, { seasons: ['S2'], teams: [historicalTeamId], positions: [] }, 'rating'), players, 'rating') : []
    assert.equal(get('Overall Rank'), ranks.overall)
    assert.equal(get('Position Rank'), ranks.position)
    assert.equal(get('Team Rank'), scopedMetricRanks(teamRows, players, player.id).team)
    assert.equal(get('Goals'), data.goals); assert.equal(get('Assists'), data.assists)
    if (index === 0) assert.deepEqual([get('Overall Rank'), get('Position Rank'), get('Team Rank')], [detailRanks.overall, detailRanks.position, detailRanks.team])
  }
})

test('Comparison team filter respects recorded membership and empty season has no ranks', () => {
  for (const season of ['S2', 'Missing']) for (const teamId of ['A', 'B', 'C']) {
    const tree = renderComparison(season, 'all', teamId)
    const values = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'ComparisonValue')
    const scoped = matches.filter(m => m.season === season)
    const ranking = rankGlobalRankingRows(buildGlobalRankingData(players, scoped, { seasons: [season], teams: [teamId], positions: [] }, 'rating'), players, 'rating')
    assert.equal(values.find(n => n.props.metric.label === 'Overall Rank').props.value, scopedMetricRanks(ranking, players, 'a').overall)
    if (season === 'Missing' || teamId === 'C') assert.equal(values.find(n => n.props.metric.label === 'Team Rank').props.value, null)
  }
})

test('Comparison selector role labels use the selected season, competition and historical team', () => {
  for (const [competition, expected] of [['league', 'RW'], ['cup', 'LW'], ['champions', 'CM']]) {
    const tree = renderComparison('S2', competition, null)
    const selector = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'PlayerSelect')[0]
    assert.equal(selector.props.representative.get('a'), expected)
  }
})
