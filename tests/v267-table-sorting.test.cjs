require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { renderToStaticMarkup } = require('react-dom/server')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { projectStandings, nextStandingSort } = require('../src/lib/standingSort.ts')
const root = path.resolve(__dirname, '..')
const metrics = ['played', 'wins', 'draws', 'losses', 'goalsFor', 'goalsAgainst', 'goalDifference', 'points']
const teams = ['A', 'B', 'C'].map(id => ({ id, name: `Full Team ${id}`, shortName: id }))
const rows = [3, 1, 2].map((rank, index) => ({ teamId: teams[index].id, rank, played: 3 - index, wins: index, draws: 1 + index, losses: index, goalsFor: 4 + index, goalsAgainst: 2 - index, goalDifference: 2 + index * 2, points: index * 3, movement: index - 1 }))
const ids = rows => rows.map(row => row.teamId)

for (const metric of metrics) test(`v267 ${metric} sorts both ways, uses official ranks for ties and never mutates facts`, () => {
  const input = structuredClone(rows), before = structuredClone(input)
  const descending = !['losses', 'goalsAgainst'].includes(metric)
  const first = nextStandingSort(null, metric)
  assert.equal(first.direction, descending ? 'desc' : 'asc')
  assert.equal(first.metric, metric)
  const expected = input.slice().sort((a, b) => (descending ? b[metric] - a[metric] : a[metric] - b[metric]) || a.rank - b.rank)
  assert.deepEqual(ids(projectStandings(input, first)), ids(expected))
  assert.deepEqual(ids(projectStandings(input, nextStandingSort(first, metric))), ids(expected.slice().sort((a, b) => (descending ? a[metric] - b[metric] : b[metric] - a[metric]) || a.rank - b.rank)))
  const tied = input.map(row => ({ ...row, [metric]: 7 }))
  assert.deepEqual(projectStandings(tied, first).map(row => row.rank), [1, 2, 3])
  assert.deepEqual(input, before)
  assert.notEqual(projectStandings(input, first), input)
  assert.strictEqual(projectStandings(input, first)[0], input.find(row => row.teamId === expected[0].teamId))
  assert.deepEqual(projectStandings(input, nextStandingSort(first, 'rank')), input)
})

test('v267 selecting another stat uses its default direction', () => {
  assert.deepEqual(nextStandingSort({ metric: 'wins', direction: 'asc' }, 'goalsAgainst'), { metric: 'goalsAgainst', direction: 'asc' })
  assert.deepEqual(nextStandingSort({ metric: 'losses', direction: 'desc' }, 'points'), { metric: 'points', direction: 'desc' })
})

test('v267 League clickable headers preserve geometry, official ranks, navigation and reset on scope changes', () => {
  const destinations = [], h = screenHarness(root, 'components/StandingsTable.tsx', 'StandingsTable', {})
  const props = { standings: rows, teams, compact: true, sortScope: 'S1:overall', onTeamNavigate: id => destinations.push(id) }
  let tree = h.render(props)
  const select = metric => nodes(tree, node => node.type?.name === 'StandingSortButton' && node.props.metric === metric)[0].props.onSort(metric)
  select('wins'); tree = h.render(props)
  assert.deepEqual(nodes(tree, node => node.type === 'tr' && node.props['data-team-id']).map(node => node.props['data-team-id']), ['C', 'B', 'A'])
  assert.deepEqual(nodes(tree, node => node.type === 'td' && node.props['data-official-rank']).map(node => node.props['data-official-rank']), [2, 1, 3])
  nodes(tree, node => node.type?.name === 'TeamLink')[0].props.onNavigate('C')
  assert.deepEqual(destinations, ['C'])
  let html = renderToStaticMarkup(tree)
  for (const token of ['table-fixed text-[11px]', 'w-11 text-center', 'w-6 py-2.5', 'GF', 'GA', 'Full Team C', 'aria-sort="descending"']) assert(html.includes(token), token)
  assert.equal(nodes(tree, node => node.type === 'th').length, 9)
  tree = h.render({ ...props, sortScope: 'S1:form' })
  assert.deepEqual(nodes(tree, node => node.type === 'tr' && node.props['data-team-id']).map(node => node.props['data-team-id']), ids(rows))
  h.effects.forEach(effect => effect())
  tree = h.render(props)
  assert.deepEqual(nodes(tree, node => node.type === 'tr' && node.props['data-team-id']).map(node => node.props['data-team-id']), ids(rows))
})

test('v267 Cup sorting preserves statuses, official boundary and compound columns without rerunning the model', () => {
  const model = { selection: 'stage1', complete: false, provisional: true, rows: rows.map((row, i) => ({ ...row, state: i === 0 ? 'surviving' : i === 1 ? 'at-risk' : 'not-played', status: i === 0 ? 'Surviving' : i === 1 ? 'At Risk' : 'Not Played' })) }
  const before = structuredClone(model)
  const h = screenHarness(root, 'components/CupStandingsTable.tsx', 'CupStandingsTable', {})
  const props = { model, teams, sortScope: 'S1:stage1', onTeamNavigate() {} }
  let tree = h.render(props), html = renderToStaticMarkup(tree)
  assert.match(html, /Provisional Survival Line/)
  assert.equal(nodes(tree, node => node.props?.['data-survival-line'] === true).length, 1)
  nodes(tree, node => node.type?.name === 'StandingSortButton' && node.props.metric === 'goalsFor')[0].props.onSort('goalsFor')
  tree = h.render(props); html = renderToStaticMarkup(tree)
  assert.equal(nodes(tree, node => node.props?.['data-survival-line'] === true).length, 0)
  assert.match(html, /Provisional Survival Line.*Official boundary before #1/)
  for (const token of ['Surviving', 'At Risk', 'Not Played', 'Full Team', 'w-[42px]', 'w-11', 'bg-orange-400/10']) assert(html.includes(token), token)
  assert.deepEqual(model, before)
  for (const metric of metrics) assert(nodes(tree, node => node.type?.name === 'StandingSortButton' && node.props.metric === metric).length, metric)
  nodes(tree, node => node.type?.name === 'StandingSortButton' && node.props.metric === 'rank')[0].props.onSort('rank')
  tree = h.render(props)
  assert.equal(nodes(tree, node => node.props?.['data-survival-line'] === true).length, 1)
})

test('v267 Overall and standalone Standings use current/previous ranks without materializing History or awards', () => {
  const actual = require('../src/engine/seasonAnalytics.ts'), calls = []
  const overrides = { '../engine/seasonAnalytics': { ...actual,
    buildLeagueHistory() { throw Error('Overall must not build History') },
    buildSeasonAnalytics() { throw Error('Standings must not build player analytics') },
    latestLeagueStandings() { calls.push('latest'); return rows },
  } }
  const state = require('../src/lib/navigation.ts').defaultScreenState({ name: 'competition' })
  const league = { standings: rows, matches: [], complete: false, matchdayProgress: 1 }
  const props = { season: 'S1', teams, players: [], matches: [], league, screenState: { ...state, leagueMenu: 'table' }, onStateChange() {}, onNavigate() {} }
  const overall = screenHarness(root, 'screens/CompetitionScreen.tsx', 'LeagueView', {}, overrides).render(props)
  assert.strictEqual(nodes(overall, node => node.type?.name === 'StandingsTable')[0].props.standings, rows)
  const full = screenHarness(root, 'screens/StandingsScreen.tsx', 'StandingsScreen', { teams, players: [], matches: [] }, overrides).render(props)
  assert.strictEqual(nodes(full, node => node.type?.name === 'StandingsTable')[0].props.standings, rows)
  assert.deepEqual(calls, ['latest', 'latest'])
})
