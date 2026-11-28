require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { teamMetrics } = require('../src/engine/teamMetrics.ts')
const { teamHistoricMatchRecords } = require('../src/engine/teamHistoricMatches.ts')
const { finalizedTeamPlacements, teamSeasonRecords } = require('../src/engine/teamCompetitionResults.ts')
const { STATIC_TEAMS: teams } = require('../src/data/teams.ts')

const ids = teams.map(team => team.id)

function game(id, home, away, goalTeams = [], overrides = {}) {
  return {
    id, season: 'Season 1', matchDay: 1, date: '2026-01-01', duration: 90,
    homeTeamId: home, awayTeamId: away, appearances: [],
    events: goalTeams.map((teamId, index) => ({ id: `${id}:${index}`, type: 'goal', minute: index + 1, teamId })),
    ...overrides,
  }
}

test('career Played equals the official sum of wins, draws and losses, with Champions ownership and Cup replays', () => {
  const matches = [
    game('win', 'A', 'B', ['A']), game('loss', 'B', 'A', ['B']),
    game('final', 'A', 'B', [], { competitionType: 'cup', competitionStage: 'final' }),
    game('replay', 'B', 'A', ['A'], { competitionType: 'cup', competitionStage: 'finalReplay' }),
    game('ours', 'A', 'B', [], { competitionType: 'champions', teamId: 'A' }),
    game('theirs', 'B', 'A', ['B'], { competitionType: 'champions', teamId: 'B' }),
  ]
  const record = teamMetrics({ id: 'A', name: 'A' }, matches)
  assert.deepEqual([record.played, record.wins, record.draws, record.losses], [5, 2, 2, 1])
  assert.equal(record.winRate, 40)
  assert.equal(record.ppg, 1.6)
  assert.deepEqual(record.streaks, { winning: 1, unbeaten: 3, scoring: 1, cleanSheet: 3, losing: 1, winless: 2 })
})

test('legacy same-date team streaks preserve the release order without reversing form badges', () => {
  const team = { id: 'A', name: 'A' }
  const matches = [
    game('first', 'A', 'B', ['A']),
    game('same-day-win', 'A', 'B', ['A'], { date: '2026-01-02' }),
    game('same-day-loss', 'A', 'B', ['B'], { date: '2026-01-02' }),
    game('last', 'A', 'B', ['B'], { date: '2026-01-03' }),
  ]
  const result = teamMetrics(team, matches)
  assert.equal(result.streaks.winning, 1)
  assert.deepEqual(result.streakMatchIds.winning, [['first'], ['same-day-win']])
  assert.deepEqual(result.form, ['L', 'L', 'W', 'W'])
})

test('historic match rows preserve both team perspectives, chronology, and only provable comeback deficits', () => {
  const first = game('comeback', 'B', 'A', [], { events: [
    { id: 'f', type: 'goal', minute: 10, sequence: 4, teamId: 'A' },
    { id: 'b', type: 'goal', minute: 10, sequence: 2, teamId: 'A', ownGoal: true },
    { id: 'c', type: 'goal', minute: 10, sequence: 3, teamId: 'A' },
    { id: 'a', type: 'goal', minute: 10, sequence: 1, teamId: 'B' },
    { id: 'd', type: 'goal', minute: 10, sequence: 5, teamId: 'A' },
  ] })
  const second = game('big-win', 'A', 'B', ['A', 'A', 'A', 'A'])
  const incomplete = game('unknown-minute', 'A', 'B', ['B', 'A', 'A'])
  delete incomplete.events[0].minute
  const unknownSide = game('unknown-side', 'A', 'B', ['C', 'B', 'A', 'A'])
  const champions = game('champions', 'A', 'B', ['A'], { teamId: 'A', competitionType: 'champions' })
  const groups = teamHistoricMatchRecords([first, first, second, incomplete, unknownSide, champions], ['A', 'B'])
  const rows = id => groups.find(group => group.id === id).rows
  assert.deepEqual(rows('biggest-comeback').map(row => [row.match.id, row.teamId, row.numeric]), [['comeback', 'A', 2]])
  assert.equal(rows('biggest-win').filter(row => row.teamId === 'A').length, 5)
  assert.equal(rows('biggest-defeat').some(row => row.match.id === 'champions'), false)
  assert.deepEqual(rows('biggest-defeat').filter(row => row.match.id === 'big-win').map(row => [row.teamId, row.opponentId, row.goalsFor, row.goalsAgainst, row.numeric]), [['B', 'A', 0, 4, 4]])
})

function cupFixture() {
  const matches = []
  for (let stage = 1; stage <= 7; stage++) {
    for (const [index, id] of ids.slice(0, 18 - stage * 2).entries()) {
      matches.push(game(`cup:${stage}:${id}`, id, `opponent:${id}`, Array(ids.length - index).fill(id), { competitionType: 'cup', competitionStage: `stage${stage}` }))
    }
  }
  matches.push(game('cup:final', ids[0], ids[1], [], { competitionType: 'cup', competitionStage: 'final' }))
  return matches
}

function championsFixture() {
  const matches = []
  let active = ids
  for (const stage of ['roundOf16', 'quarterFinal', 'semiFinal', 'final']) {
    for (let index = 0; index < active.length; index += 2) {
      const pairing = `${stage}:${index / 2}`
      matches.push(game(`${pairing}:1`, active[index], active[index + 1], [active[index]], { competitionType: 'champions', competitionStage: stage, competitionPairingId: pairing }))
      if (stage !== 'final') matches.push(game(`${pairing}:2`, active[index + 1], active[index], [active[index]], { competitionType: 'champions', competitionStage: stage, competitionPairingId: pairing }))
    }
    active = active.filter((_, index) => index % 2 === 0)
  }
  return matches
}

test('final placements follow Cup eliminations and Champions series before granting top-four or top-eight credit', () => {
  const draw = [{ kind: 'champions-draw', season: 'Season 1', teamIds: ids }]
  const cup = cupFixture()
  const champions = championsFixture()
  assert.deepEqual(finalizedTeamPlacements(teams, [], [...cup, ...champions.slice(0, -1)], draw), [])
  const replay = game('cup:replay', ids[1], ids[0], [ids[0]], { competitionType: 'cup', competitionStage: 'finalReplay' })
  const results = finalizedTeamPlacements(teams, [], [...cup, replay, ...champions], draw)
  const get = (competition, id) => results.find(row => row.competition === competition && row.teamId === id)
  const places = (competition, indices) => indices.map(index => get(competition, ids[index]).place)
  assert.deepEqual(places('cup', [0, 1, 2, 3, 4, 5, 6, 7]), [1, 2, 3, 3, 4, 4, 4, 4])
  assert.ok(get('cup', ids[8]).place > 4)
  assert.deepEqual(places('champions', [0, 8, 4, 12, 2, 6, 10, 14]), [1, 2, 3, 3, 4, 4, 4, 4])
  assert.equal(get('champions', ids[4]).label, 'Semi-final')
  assert.equal(get('champions', ids[2]).label, 'Quarter-final')
  assert.ok(get('champions', ids[1]).place > 4)
  assert.equal(results.length, 32)

  const scope = { competition: 'cup', seasons: [], teamIds: [ids[0], ids[2], ids[15]] }
  const conceded = teamSeasonRecords(teams, [], [...cup, replay], [], scope, ['season-conceded'])[0].rows
  assert.deepEqual(conceded.map(row => [row.teamId, row.numeric, row.comparisonGroup]), [[ids[0], 0, 9], [ids[2], 0, 7], [ids[15], 0, 1]])
})

test('season records keep every completed League campaign and separate results with different fixture counts', () => {
  const league = (season, count) => ids.flatMap((id, index) => Array.from({ length: count }, (_, day) => game(`${season}:${id}:${day}`, id, `opponent:${id}`, index === 0 ? [id] : [], { season, matchDay: day + 1, teamId: id })))
  const matches = [...league('Season 1', 30), ...league('Season 2', 30), ...league('Season 3', 29)]
  const scope = { competition: 'league', seasons: [], teamIds: [ids[0]] }
  const records = teamSeasonRecords(teams, [], matches, [], scope)
  const rows = id => records.find(group => group.id === id).rows
  assert.deepEqual(rows('history-league-points').map(row => [row.season, row.numeric]).sort(), [['Season 1', 90], ['Season 2', 90]])
  assert.deepEqual(rows('season-conceded').map(row => [row.season, row.numeric, row.comparisonGroup]).sort(), [['Season 1', 0, 30], ['Season 2', 0, 30]])
  assert.deepEqual(rows('season-win-rate').map(row => [row.season, row.numeric]).sort(), [['Season 1', 100], ['Season 2', 100]])
})

test('Team History exposes each tied match and links finalized results to the exact season and competition', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
  const teamId = ids[0]
  const older = game('win1', teamId, ids[1], [teamId, teamId])
  const newer = game('win2', ids[1], teamId, [teamId, teamId], { date: '2026-01-02' })
  const links = []
  const states = [{ kind: 'champions-draw', season: 'Season 1', teamIds: ids }]
  const props = {
    teamId, season: 'Season 1', teams, players: [], matches: [older, newer, ...championsFixture()], states,
    onNavigate: view => links.push(view), onStateChange: patch => Object.assign(props.screenState, patch),
    screenState: { historyMenu: 'honors', historyDisclosures: [] },
  }
  const history = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {})
  const { renderToStaticMarkup } = require('react-dom/server')
  const render = () => history.render(props)
  const markup = renderToStaticMarkup(render())
  assert.match(markup, /All-time Team Record/)
  assert.match(markup, /Best Competition Results/)
  assert.match(markup, /Historic Matches/)
  const result = nodes(render(), node => node.type === 'button' && node.props['aria-label'] === 'Open Season 1 Champions result')[0]
  result.props.onClick()
  const matches = nodes(render(), node => node.type === 'button' && node.props['aria-label'] === 'Show all 2 Biggest Win matches')
  matches[0].props.onClick()
  for (const row of nodes(render(), node => node.type === 'button' && node.props['aria-label']?.startsWith('Open Biggest Win match'))) row.props.onClick()
  assert.deepEqual(links, [{ name: 'competition', season: 'Season 1', competitionType: 'champions' }, { name: 'match', id: 'win2' }, { name: 'match', id: 'win1' }])
})
