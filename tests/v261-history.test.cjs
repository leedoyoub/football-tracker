require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const history = require('../src/engine/teamHistory.ts')

function fixture() {
  const players = [
    { id: 'gk', name: 'Keeper', teamId: 'B', position: 'ST' },
    { id: 'released', name: 'Released', teamId: '', position: 'GK' },
    { id: 'rare', name: 'Rare', teamId: 'A', position: 'ST' },
    { id: 'bench', name: 'Bench', teamId: 'A', position: 'LB' },
    { id: 'other', name: 'Other', teamId: 'B', position: 'CB' },
  ]
  const matches = Array.from({ length: 5 }, (_, i) => ({
    id: `A:${i}`, season: 'Season 1', matchDay: i + 1, date: `2026-01-0${i + 1}`, duration: 90,
    teamId: 'A', homeTeamId: 'A', awayTeamId: 'opponent', competitionType: i === 4 ? 'cup' : 'league', competitionStage: i === 4 ? 'stage1' : 'regular',
    appearances: [
      { playerId: 'gk', teamId: 'A', role: 'starter', position: 'GK', matchPosition: 'GK' },
      { playerId: 'released', teamId: 'A', role: 'starter', position: 'CAM', matchPosition: 'CAM' },
      { playerId: 'rare', teamId: 'A', role: i === 0 ? 'starter' : 'bench', position: 'ST', matchPosition: 'ST' },
      { playerId: 'bench', teamId: 'A', role: 'bench', position: 'LB', matchPosition: 'LB' },
    ],
    events: [{ id: `goal:${i}`, type: 'goal', minute: 20, teamId: 'A', playerId: 'released', assistPlayerId: 'gk' }],
  }))
  matches.push({ ...structuredClone(matches[0]), id: 'B:0', teamId: 'B', homeTeamId: 'B', appearances: [{ playerId: 'other', teamId: 'B', role: 'starter', position: 'CB' }, { playerId: 'gk', teamId: 'B', role: 'bench', position: 'ST' }], events: [] })
  return { players, matches }
}

test('team individual honors deduplicate IDs, retain future kinds and order counts, latest period, ID', () => {
  const event = (id, playerId, season, period, extra = {}) => ({ id, kind: 'new-kind', label: 'Future Award', playerId, teamId: 'A', season, period, competition: 'league', category: 'individual', finalized: true, ...extra })
  const events = [event('a1', 'a', 'Season 1', 1), event('a1', 'a', 'Season 1', 1), event('a2', 'a', 'Season 2', 1), event('b', 'b', 'Season 2', 3), event('c', 'c', 'Season 2', 2), event('d', 'd', 'Season 2', 2), event('title', 'x', 'Season 3', 1, { category: 'championship' })]
  const groups = history.groupTeamIndividualHonors(events)
  assert.equal(groups.length, 1); assert.equal(groups[0].count, 5)
  assert.deepEqual(groups[0].players.map(row => row.playerId), ['a', 'b', 'c', 'd'])
  assert.equal(history.teamAwardMomentLabel(event('final', 'a', 'Season 2', undefined, { kind: 'cup-final' })), 'Season 2 · Final')
  assert.equal(history.teamAwardMomentLabel(event('month', 'a', 'Season 2', 3)), 'Season 2-3')
  assert.equal(history.teamAwardMomentLabel(event('round', 'a', 'Season 2', 'quarterFinal')), 'Season 2 · QF')
})

test('four team records use appearance attribution, include released/transferred players and omit unused bench', () => {
  const { players, matches } = fixture()
  const groups = history.teamHistoryRecords(players, matches, { teamId: 'A', season: null, competition: 'all' })
  assert.deepEqual(groups.map(group => group.metric), ['goals', 'assists', 'appearances', 'cleanSheets'])
  const appearances = groups.find(group => group.metric === 'appearances').rows
  assert.deepEqual(appearances.map(row => [row.playerId, row.value, row.rank]), [['gk', 5, 1], ['released', 5, 1], ['rare', 1, 3]])
  assert.deepEqual(groups[3].rows.map(row => [row.playerId, row.value]), [['gk', 5]])
  const league = history.teamHistoryRecords(players, matches, { teamId: 'A', season: 'Season 1', competition: 'league' })
  assert.equal(league[0].rows.find(row => row.playerId === 'released').value, 4)
  assert.strictEqual(history.teamHistoryRecords(players, matches, { teamId: 'A', season: null, competition: 'all' }), groups, 'immutable scoped results reused')
})

test('team season XI uses actual roles, ceil 40% team games, vacancies and no duplicate player', () => {
  const { players, matches } = fixture()
  const result = history.teamHistoryBestXI(players, matches, { teamId: 'A', season: 'Season 1', competition: 'all' })
  assert.equal(result.teamMatches, 5); assert.equal(result.minimumAppearances, 2)
  assert.equal(result.bestXI.length, 11)
  assert.equal(result.bestXI[0].playerId, 'gk')
  assert(result.bestXI.some(slot => slot.playerId === 'released' && ['LCM', 'CM', 'RCM'].includes(slot.slot)))
  assert(!result.bestXI.some(slot => ['rare', 'other', 'bench'].includes(slot.playerId)))
  const selected = result.bestXI.flatMap(slot => slot.playerId ? [slot.playerId] : [])
  assert.equal(selected.length, new Set(selected).size)
  assert(result.bestXI.some(slot => slot.playerId === null))
  assert.equal(result.events, undefined)
  const boundary = { id: 'boundary', name: 'Boundary', teamId: 'B', position: 'ST' }
  const changed = matches.map((match, index) => index < 2 ? { ...match, appearances: [...match.appearances, { playerId: boundary.id, teamId: 'A', role: 'starter', position: 'RB' }] } : match)
  const atBoundary = history.teamHistoryBestXI([...players, boundary], changed, { teamId: 'A', season: 'Season 1', competition: 'all' })
  assert.equal(atBoundary.bestXI.find(slot => slot.slot === 'RB').playerId, boundary.id)
})

test('early season History shows progress without provisional championships or individual honors', () => {
  const { players, matches } = fixture()
  const teams = [{ id: 'A', name: 'A', shortName: 'A' }, { id: 'B', name: 'B', shortName: 'B' }]
  const honors = history.teamHistoryHonors(teams, players, matches, [], 'A', 'all')
  assert.equal(honors.championships, 0); assert.equal(honors.runnerUps, 0)
  assert.match(honors.seasonHistory[0].results.find(row => row.competition === 'league').status, /In progress/)
  assert(!honors.individual.some(group => group.kind.startsWith('season-')))
  const cup = history.teamHistoryHonors(teams, players, matches, [], 'A', 'cup')
  assert.deepEqual(cup.seasonHistory[0].results.map(row => row.competition), ['cup'])
  assert(cup.individual.every(group => group.players.every(player => player.events.every(event => event.competition === 'cup' && event.teamId === 'A'))))
})

test('Honors reuses canonical season competition models for progress without a second derivation', () => {
  const { sourceModule } = require('./helpers/v259-harness.cjs'), path = require('node:path')
  const status = { league: {}, cup: {}, champions: {} }, { players, matches } = fixture()
  let forwarded
  const engine = sourceModule(path.resolve(__dirname, '..'), 'engine/teamHistory.ts', {
    './officialAwards': { officialAwardSeasons: () => ['Season 1'], officialSeasonModel: () => ({ status, teamResults: [] }) },
    './teamAwardRecords': { scopedIndividualAwardEvents: () => [] },
    './competition': { matchCompetitionType: match => match.competitionType, teamCompetitionOverview: (...args) => { forwarded = args[6]; return { league: { rank: 1 }, cup: { status: 'Stage 1' }, champions: { status: 'Not Started' } } } },
  })
  engine.teamHistoryHonors([], players, matches, [], 'A', 'all')
  assert.strictEqual(forwarded, status)
})

test('Team History state survives detail Back and legacy defaults safely', () => {
  const nav = require('../src/lib/navigation.ts')
  const view = { name: 'team', id: 'A' }, defaults = nav.defaultScreenState(view)
  assert.equal(defaults.historyCompetition, 'all'); assert.equal(defaults.historyMenu, 'honors')
  assert.deepEqual(defaults.historyDisclosures, [])
  const state = { ...defaults, tab: 'history', historyMenu: 'records', historyCompetition: 'cup', historySeason: 'Season 1', historyRecordsMode: 'all-time', historyExpandedRecords: ['goals'], historyDisclosures: ['individual', 'kind:cup-scorer'] }
  const pushed = nav.pushNavigationEntry([nav.createNavigationEntry(view, state)], { name: 'player', id: 'gk' }, 640)
  assert.deepEqual(nav.popNavigationEntry(pushed)[0], nav.createNavigationEntry(view, state, 640))
  const route = require('../src/lib/lastRoute.ts'), { players, matches } = fixture()
  const app = { teams: [{ id: 'A' }], players, matches, competitionStates: [] }
  const storage = { getItem: () => JSON.stringify({ version: 2, view, screenState: state }) }
  assert.deepEqual(route.loadLastNavigationEntry(app, storage).screenState, state)
  const legacy = { getItem: () => JSON.stringify({ version: 2, view, screenState: { name: 'team', tab: 'history', historyMenu: 'invalid', historyCompetition: 'invalid', historyExpandedRecords: ['minutes', 'goals', 'goals'] } }) }
  const restored = route.loadLastNavigationEntry(app, legacy).screenState
  assert.equal(restored.historyMenu, 'honors'); assert.equal(restored.historyCompetition, 'all')
  assert.deepEqual(restored.historyExpandedRecords, ['goals'])
})

test('menu switches calculate only their selected model and award player navigation is separate from disclosure', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs'), path = require('node:path')
  const nav = require('../src/lib/navigation.ts'), { players, matches } = fixture()
  let calls = [], patches = [], destinations = []
  const event = { id: 'award', kind: 'cup-final', label: 'Cup Player of the Final', playerId: 'released', teamId: 'A', season: 'Season 1', competition: 'cup', category: 'individual', finalized: true }
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {}, { '../engine/teamHistory': {
    ...history,
    teamHistoryHonors: () => { calls.push('honors'); return { championships: 0, runnerUps: 0, finals: 0, seasonHistory: [], individual: history.groupTeamIndividualHonors([event]) } },
    teamHistoryRecords: () => { calls.push('records'); return [] },
    teamHistoryBestXI: () => { calls.push('best-xi'); return { bestXI: [], statsByPlayer: {}, teamMatches: 0, minimumAppearances: 0 } },
  } })
  const props = { teamId: 'A', season: 'Season 1', teams: [{ id: 'A' }], players, matches, states: [], onStateChange: patch => patches.push(patch), onNavigate: view => destinations.push(view) }
  const base = nav.defaultScreenState({ name: 'team', id: 'A' })
  const tree = h.render({ ...props, screenState: { ...base, historyDisclosures: ['individual', 'kind:cup-final'] } })
  assert.deepEqual(calls, ['honors'])
  const name = nodes(tree, n => n.type === 'button' && n.props.children === 'Released')[0]
  name.props.onClick(); assert.equal(destinations[0].id, 'released'); assert.equal(patches.length, 0)
  const moment = nodes(tree, n => n.type === 'button' && n.props['aria-label']?.includes('award moments'))[0]
  moment.props.onClick(); assert.equal(destinations.length, 1)
  assert(patches[0].historyDisclosures.includes('kind:cup-final:player:released'))
  h.render({ ...props, screenState: { ...base, historyMenu: 'records' } })
  h.render({ ...props, screenState: { ...base, historyMenu: 'best-xi' } })
  assert.deepEqual(calls, ['honors', 'records', 'best-xi'])
})

test('season disclosures are independent and award kind counts are visible before opening players', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs'), path = require('node:path')
  const nav = require('../src/lib/navigation.ts'), { players, matches } = fixture()
  const event = { id: 'award', kind: 'cup-final', label: 'Cup Player of the Final', playerId: 'released', teamId: 'A', season: 'Season 1', competition: 'cup', category: 'individual', finalized: true }
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {}, { '../engine/teamHistory': { ...history, teamHistoryHonors: () => ({ championships: 0, runnerUps: 0, finals: 0, seasonHistory: ['Season 2', 'Season 1'].map(season => ({ season, results: [{ competition: 'league', status: 'In progress' }] })), individual: history.groupTeamIndividualHonors([event]) }) } })
  const patches = [], base = nav.defaultScreenState({ name: 'team', id: 'A' })
  const props = { teamId: 'A', season: 'Season 1', teams: [{ id: 'A' }], players, matches, states: [], onStateChange: patch => patches.push(patch), onNavigate: () => {} }
  const tree = h.render({ ...props, screenState: base })
  const seasonButtons = nodes(tree, n => n.type === 'button' && Array.isArray(n.props.children) && /^Season \d$/.test(n.props.children[0]))
  assert.equal(seasonButtons.length, 2); assert(seasonButtons.every(n => n.props['aria-expanded'] === false))
  seasonButtons[0].props.onClick(); assert.deepEqual(patches[0].historyDisclosures, ['season:Season 2'])
  const kinds = nodes(tree, n => n.type === 'button' && Array.isArray(n.props.children) && n.props.children[0]?.props?.children === 'Cup Player of the Final')
  assert.equal(kinds.length, 1); assert.equal(kinds[0].props['aria-expanded'], false)
  assert.equal(nodes(tree, n => n.type === 'button' && n.props.children === 'Released').length, 0)
  const expanded = h.render({ ...props, screenState: { ...base, historyDisclosures: patches[0].historyDisclosures } })
  assert.equal(nodes(expanded, n => n.type === 'span' && n.props.children === 'In progress').length, 1)
})

test('records preview three rows, virtualize only the expanded metric and Best XI uses the shared pitch data and player action', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs'), path = require('node:path')
  const nav = require('../src/lib/navigation.ts'), { players, matches } = fixture()
  const additions = ['extra-1', 'extra-2'].map(id => ({ id, name: id, teamId: 'A', position: 'LB' }))
  players.push(...additions)
  for (const match of matches.filter(match => match.teamId === 'A')) match.appearances.push(...additions.map(player => ({ playerId: player.id, teamId: 'A', role: 'starter', position: 'LB' })))
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/TeamHistory.tsx', 'TeamHistory', {})
  let screenState = { ...nav.defaultScreenState({ name: 'team', id: 'A' }), historyMenu: 'records' }
  const destinations = []
  const props = { teamId: 'A', season: 'Season 1', teams: [{ id: 'A' }], players, matches, states: [], onStateChange: patch => { screenState = { ...screenState, ...patch } }, onNavigate: view => destinations.push(view) }
  const section = (tree, title) => nodes(tree, n => n.type === 'section' && nodes(n.props.children, child => child.type === 'h3' && child.props.children === title).length === 1).at(-1)
  let tree = h.render({ ...props, screenState })
  assert.equal(nodes(section(tree, 'Most Goals'), n => n.type?.name === 'RankingRow').length, 3)
  assert.equal(nodes(tree, n => n.type?.name === 'VirtualRankingList').length, 0)
  nodes(section(tree, 'Most Goals'), n => n.type === 'button' && n.props.children === 'View All')[0].props.onClick()
  tree = h.render({ ...props, screenState })
  const virtual = nodes(tree, n => n.type?.name === 'VirtualRankingList')
  assert.equal(virtual.length, 1); assert.equal(virtual[0].props.rows.length, 5)
  assert.equal(nodes(section(tree, 'Most Assists'), n => n.type?.name === 'RankingRow').length, 3)
  const row = virtual[0].props.renderRow(virtual[0].props.rows[0]); row.props.onClick()
  assert.equal(destinations.length, 1)
  nodes(section(tree, 'Most Assists'), n => n.type === 'button' && n.props.children === 'View All')[0].props.onClick()
  tree = h.render({ ...props, screenState })
  assert.equal(nodes(tree, n => n.type?.name === 'VirtualRankingList').length, 1)
  assert.equal(nodes(section(tree, 'Most Goals'), n => n.type?.name === 'RankingRow').length, 3)
  tree = h.render({ ...props, screenState: { ...screenState, historyMenu: 'best-xi' } })
  const pitch = nodes(tree, n => n.type?.name === 'AwardBestXI')[0]
  assert.strictEqual(pitch.props.result, history.teamHistoryBestXI(players, matches, { teamId: 'A', season: 'Season 1', competition: 'all' }))
  assert.equal(pitch.props.result.bestXI[0].playerId, 'gk')
  pitch.props.onPlayerOpen('gk'); assert.equal(destinations[1].id, 'gk')
  assert.equal(nodes(tree, n => n.type?.name === 'VirtualRankingList').length, 0)
})
