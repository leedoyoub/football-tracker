require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { scopedIndividualAwardEvents, teamIndividualAwardRecordGroups } = require('../src/engine/teamAwardRecords.ts')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { STATIC_TEAMS } = require('../src/data/teams.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = path.resolve(__dirname, '..')
const scope = { seasons: [], competition: 'all', teamIds: [], positionFilter: 'all' }
const event = (id, teamId, kind, extra = {}) => ({ id, playerId: id, teamId, kind, label: kind === 'monthly-xi' ? 'Team of the Month' : 'Future Honor', season: 'S1', competition: 'league', category: 'individual', finalized: true, ...extra })

// Would catch duplicate IDs or team achievements leaking into individual totals.
test('team award totals count each finalized recipient once and dynamically include new kinds', () => {
  const teams = ['A', 'B', 'C'].map(id => ({ id, name: id }))
  const a = event('a', 'A', 'monthly-xi'), b = event('b', 'A', 'future-award'), c = event('c', 'B', 'future-award')
  const groups = teamIndividualAwardRecordGroups([a, a, b, c, event('title', 'C', 'championship', { category: 'championship' }), event('pending', 'C', 'future-award', { finalized: false })], teams)
  assert.deepEqual(groups[0].rows.map(r => [r.id, r.numeric, r.rank]), [['A', 2, 1], ['B', 1, 2]])
  assert.deepEqual(groups.find(g => g.id === 'team-awards:future-award').rows.map(r => [r.id, r.numeric, r.rank]), [['A', 1, 1], ['B', 1, 1]])
  assert.equal(groups.find(g => g.id === 'team-awards:monthly-xi').title, 'Most Team of the Month Selections')
})

function fixture() {
  const players = ['GK', 'CB', 'CM', 'ST'].map((position, i) => ({ id: `winner-${i}`, name: `Player ${i}`, displayName: `Player ${i}`, position, number: i + 1, teamId: STATIC_TEAMS[i].id }))
  const matches = STATIC_TEAMS.flatMap((team, ti) => Array.from({ length: 3 }, (_, day) => ({ id: `${ti}:${day}`, season: 'S1', date: `2026-01-0${day + 1}`, duration: 90, teamId: team.id, homeTeamId: team.id, awayTeamId: `opp-${ti}`, competitionType: 'league', competitionStage: 'regular', matchDay: day + 1, appearances: players[ti] ? [{ playerId: players[ti].id, teamId: team.id, role: 'starter', position: players[ti].position, matchPosition: players[ti].position }] : [], events: [] })))
  return { teams: STATIC_TEAMS, players, matches, states: [] }
}

test('scoped canonical index preserves former teams, filters finalized scopes and invalidates edits', () => {
  const f = fixture(), transferred = f.players.map(p => ({ ...p, teamId: 'new-club', teamIds: ['new-club'] }))
  const events = scopedIndividualAwardEvents(f.teams, transferred, f.matches, f.states, scope)
  assert.equal(events.filter(e => e.kind === 'monthly-xi').length, 4)
  assert(events.every(e => e.teamId !== 'new-club'))
  assert.strictEqual(scopedIndividualAwardEvents(f.teams, transferred, f.matches, f.states, scope), events)
  assert.equal(scopedIndividualAwardEvents(f.teams, transferred, f.matches, f.states, { ...scope, competition: 'cup' }).length, 0)
  assert.equal(scopedIndividualAwardEvents(f.teams, transferred, f.matches, f.states, { ...scope, seasons: ['S2'] }).length, 0)
  const selected = scopedIndividualAwardEvents(f.teams, transferred, f.matches, f.states, { ...scope, teamIds: [f.players[0].teamId] })
  assert.equal(selected.filter(e => e.kind === 'monthly-xi').length, 1)
  assert.equal(scopedIndividualAwardEvents(f.teams, transferred, f.matches.slice(1), f.states, scope).length, 0)
})

test('team awards Records keep the 17 existing honor groups and add canonical totals', () => {
  const f = fixture(), groups = recordsLeaderboardGroups({ category: 'team', section: 'awards', ...f, scope })
  assert.equal(groups.filter(g => g.id.startsWith('history-')).length, 17)
  assert.equal(groups.find(g => g.id === 'team-awards-individual').rows.reduce((n, r) => n + r.numeric, 0), 5)
  assert.equal(groups.find(g => g.id === 'team-awards:monthly-xi').rows.reduce((n, r) => n + r.numeric, 0), 4)
  assert.equal(recordsLeaderboardGroups({ category: 'team', section: 'awards', ...f, scope: { ...scope, competition: 'cup' } }).find(g => g.id === 'team-awards-individual').rows.length, 0)
})

test('Honors Hub exposes all 17 previews, grouped categories and total awards before expanding kinds', () => {
  const f = fixture(), navigation = []
  const h = screenHarness(root, 'screens/RecordsScreen.tsx', 'RecordsRankingPreviews', {})
  const tree = h.render({ category: 'team', ...f, filters: { seasons: [], teams: [], positions: [] }, competition: 'all', positionFilter: 'all', screenState: { ...defaultScreenState({ name: 'records' }), recordsMode: 'awards' }, onSelectionChange() {}, onNavigate: v => navigation.push(v) })
  const sections = nodes(tree, n => n.type === 'section')
  for (const id of ['history-titles', 'history-league-titles', 'history-cup-titles', 'history-champions-titles', 'history-runner-ups', 'history-league-runner-ups', 'history-cup-runner-ups', 'history-champions-runner-ups', 'history-finals', 'history-cup-finals', 'history-champions-finals', 'history-league-finish', 'history-league-points', 'history-league-wins', 'history-league-gd', 'history-cup-finish', 'history-champions-finish', 'team-awards-individual']) assert(sections.some(n => n.key === id), id)
  assert.equal(nodes(tree, n => n.type === 'h2' && n.props.children === 'Championships').length, 1)
  assert.equal(nodes(tree, n => n.type === 'h2' && n.props.children === 'Individual Awards').length, 1)
  const total = sections.find(n => n.key === 'team-awards-individual')
  const viewAll = nodes(total, n => n.type === 'button' && n.props.children === 'View All')[0]
  assert(viewAll)
  viewAll.props.onClick()
  assert.equal(navigation[0].leaderboardId, 'team-awards-individual')
  assert.equal(navigation[0].category, 'team')
})

test('team individual award View All resolves the awards section and virtualizes the full list', () => {
  const f = fixture(), h = screenHarness(root, 'screens/RecordsLeaderboardScreen.tsx', 'RecordsLeaderboardScreen', { ...f, competitionStates: f.states })
  const tree = h.render({ screenState: defaultScreenState({ name: 'records-leaderboard', category: 'team', leaderboardId: 'team-awards-individual' }), onStateChange() {}, onNavigate() {}, onBack() {} })
  const lists = nodes(tree, n => typeof n.type === 'function' && n.type.name === 'VirtualRankingList')
  assert.equal(lists.length, 1)
  assert.equal(lists[0].props.rows.length, 4)
})
