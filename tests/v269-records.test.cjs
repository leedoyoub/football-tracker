require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { buildPlayerRecordLeaderboards } = require('../src/engine/playerRecords.ts')
const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
const { baselineRoot } = require('./helpers/v269-records-baseline.cjs')
const path = require('node:path')

function fixture() {
  const teams = ['A', 'B', 'C'].map(id => ({ id, name: id }))
  const players = ['ST', 'CM', 'LW', 'ST', 'RW'].map((position, index) => ({ id: `p${index}`, name: `Player ${index}`, teamId: index === 0 ? 'C' : teams[index % 3].id, teamIds: index === 0 ? ['C'] : [], position, number: index + 1 }))
  players[3].teamId = ''; players[3].teamIds = []
  const matches = players.map((player, index) => ({ id: `m${index}`, season: 'S1', date: '2026-01-01', duration: 90, teamId: teams[index % 3].id, homeTeamId: teams[index % 3].id, awayTeamId: 'opponent', competitionType: 'league', matchDay: 1, appearances: [{ playerId: player.id, teamId: teams[index % 3].id, position: player.position, matchPosition: player.position, role: 'starter' }], events: Array.from({ length: 5 - index }, (_, event) => ({ id: `g${index}:${event}`, type: 'goal', minute: 10 + event, teamId: teams[index % 3].id, playerId: player.id })) }))
  return { teams, players, matches }
}

test('Records position union ranks once before historical-team display and retains complete totals', () => {
  const state = fixture(), get = selected => recordsLeaderboardGroups({ ...state, category: 'player', scope: { ...scope, ...selected }, selectedIds: ['goals'] })[0].rows
  const full = get({})
  assert.deepEqual(full.map(row => [row.id, row.numeric, row.rank]), [['p0', 5, 1], ['p1', 4, 2], ['p2', 3, 3], ['p3', 2, 4], ['p4', 1, 5]])
  assert.deepEqual(get({ teamIds: ['A'] }), full.filter(row => ['p0', 'p3'].includes(row.id)), 'transfer/release uses historical team and rank gaps')
  const union = get({ positionFilters: ['st-ss', 'lw-rw', 'st-ss'] })
  assert.deepEqual(union.map(row => [row.id, row.rank]), [['p0', 1], ['p2', 2], ['p3', 3], ['p4', 4]])
  assert.deepEqual(get({ positionFilters: ['st-ss', 'lw-rw'], teamIds: ['A', 'B'] }), union.filter(row => ['p0', 'p3', 'p4'].includes(row.id)))
  assert.deepEqual(get({ positionFilter: 'st-ss' }), get({ positionFilters: ['st-ss'] }))
  assert.deepEqual(get({ positionFilter: 'cm', positionFilters: [] }), full, 'explicit empty selection overrides legacy scalar')
  assert.deepEqual(get({ teamIds: ['unknown'] }), [])
  assert.deepEqual(get({ seasons: ['other'], teamIds: ['A'] }), [])
})

test('a player recorded at multiple historical teams retains all season/competition totals and representative position', () => {
  const state = fixture()
  const original = state.matches[0]
  state.matches.push({ ...original, id: 'transfer', season: 'S2', homeTeamId: 'B', teamId: 'B', appearances: [{ ...original.appearances[0], teamId: 'B', position: 'CM', matchPosition: 'CM', positionHistory: [{ minute: 60, position: 'ST' }] }], events: original.events.slice(0, 3).map(event => ({ ...event, id: `transfer:${event.id}`, teamId: 'B' })) })
  const get = selected => recordsLeaderboardGroups({ ...state, category: 'player', scope: { ...scope, ...selected }, selectedIds: ['goals'] })[0].rows
  const full = get({})
  assert.equal(full.find(row => row.id === 'p0').numeric, 8)
  assert.deepEqual(get({ teamIds: ['A'] }).find(row => row.id === 'p0'), full.find(row => row.id === 'p0'))
  assert.deepEqual(get({ teamIds: ['B'] }).find(row => row.id === 'p0'), full.find(row => row.id === 'p0'))
  const st = get({ positionFilters: ['st-ss'] })
  assert(st.some(row => row.id === 'p0'))
  assert.deepEqual(get({ positionFilters: ['st-ss'], teamIds: ['B'] }).find(row => row.id === 'p0'), st.find(row => row.id === 'p0'), 'team selection cannot change historical representative ST to CM')
  assert(!get({ seasons: ['S1'], teamIds: ['B'] }).some(row => row.id === 'p0'))
  assert.equal(get({ seasons: ['S2'], positionFilters: ['cm'], teamIds: ['B'] }).find(row => row.id === 'p0').numeric, 3)
})

test('single player leaderboard avoids unrequested MOM, streak, goal classification and defensive calculations', () => {
  const observed = [
    [require('../src/engine/rating.ts'), 'getMatchManOfTheMatch'],
    [require('../src/engine/seasonInsights.ts'), 'playerStreaks'],
    [require('../src/engine/goalTypes.ts'), 'goalTypeTotals'],
    [require('../src/engine/goalTypes.ts'), 'classifyGoalTypes'],
    [require('../src/engine/playerMatchFacts.ts'), 'playerGoalkeeperFacts'],
    [require('../src/engine/stats.ts'), 'buildGlobalRankingData'],
  ]
  let calls = 0
  const originals = observed.map(([module, key]) => { const original = module[key]; module[key] = (...args) => { calls++; return original(...args) }; return original })
  try {
    const state = fixture()
    const groups = buildPlayerRecordLeaderboards(state.players, state.matches, {}, ['goals'])
    assert.deepEqual(groups.map(group => group.id), ['goals'])
    assert.equal(calls, 0, 'goals-only entry must not build unrelated record facts')
  } finally { observed.forEach(([module, key], index) => { module[key] = originals[index] }) }
})

test('player award Records preserve complete honor counts and ranks for historical team display', () => {
  const state = performanceFixture(1)
  state.competitionStates.push({ id: 'completed', season: 'Season 1', kind: 'season-complete' })
  const input = { ...state, states: state.competitionStates, category: 'player', section: 'awards', scope }
  const full = recordsLeaderboardGroups(input)
  const teamId = state.teams[0].id
  const ids = new Set(state.matches.flatMap(match => match.appearances.filter(row => row.teamId === teamId).map(row => row.playerId)))
  const selected = recordsLeaderboardGroups({ ...input, scope: { ...scope, teamIds: [teamId] } })
  assert.deepEqual(selected, full.map(group => ({ ...group, rows: group.rows.filter(row => ids.has(row.id)) })))
  const union = recordsLeaderboardGroups({ ...input, scope: { ...scope, positionFilters: ['st-ss', 'lw-rw'] } })
  assert.notDeepEqual(union, full)
})

test('player Records team toggles reuse official facts and immutable historical edits invalidate them', () => {
  const state = fixture()
  const before = buildPlayerRecordLeaderboards(state.players, state.matches, scope, ['goals'])
  const rating = require('../src/engine/rating.ts'), original = rating.ratePlayerMatch
  let calls = 0
  rating.ratePlayerMatch = (...args) => { calls++; return original(...args) }
  try {
    buildPlayerRecordLeaderboards(state.players, state.matches, { ...scope, teamIds: ['A'] }, ['goals'])
    buildPlayerRecordLeaderboards(state.players, state.matches, { ...scope, teamIds: ['B', 'A'] }, ['goals'])
    assert.equal(calls, 0)
  } finally { rating.ratePlayerMatch = original }
  const edited = state.matches.map((match, index) => index ? match : { ...match, events: [] })
  const after = buildPlayerRecordLeaderboards(state.players, edited, scope, ['goals'])
  assert.notDeepEqual(after, before)
  state.matches[0] = edited[0]
  assert.deepEqual(buildPlayerRecordLeaderboards(state.players, state.matches, scope, ['goals']), after)
})

test('every Records group and direct leaderboard equals independent v2.6.8 before and after historical edits', () => {
  const baseline = require(path.join(baselineRoot(), 'src/screens/recordsLeaderboards.ts')).recordsLeaderboardGroups
  const baselineUnits = require(path.join(baselineRoot(), 'src/engine/unitRecords.ts')).buildUnitRecords
  const currentUnits = require('../src/engine/unitRecords.ts').buildUnitRecords
  const state = performanceFixture(2)
  const activeTeams = new Set(state.teams.slice(0, 2).map(team => team.id))
  state.matches = state.matches.map(match => activeTeams.has(match.teamId) && (match.competitionType !== 'league' || match.matchDay <= 6) ? match : { ...match, appearances: [] })
  const activePlayers = new Set(state.matches.flatMap(match => match.appearances.map(row => row.playerId)))
  state.players = state.players.filter(player => activePlayers.has(player.id))
  state.competitionStates.push(...['Season 1', 'Season 2'].map(season => ({ id: `complete:${season}`, kind: 'season-complete', season })))
  function compare(current, label) {
    const results = []
    for (const teamIds of [[], [state.teams[0].id]]) for (const requested of [undefined, new Set(['attack:2']), new Set(['defence:3', 'cb:2'])]) {
      assert.deepEqual(currentUnits(current.players, current.matches, teamIds, requested), baselineUnits(current.players, current.matches, teamIds, requested), `${label}: every raw UnitRecord field; ${teamIds}/${requested ? [...requested] : 'all'}`)
    }
    for (const category of ['player', 'team', 'combination']) for (const section of category === 'combination' ? ['performance'] : ['performance', 'awards']) {
      const input = { ...current, states: current.competitionStates, category, section, scope }
      const expected = baseline(input), actual = recordsLeaderboardGroups(input)
      assert.deepEqual(actual, expected, `${label}: every ${category}/${section} row, value, rank, detail and order`)
      if (label === 'original') for (const group of expected) assert.deepEqual(recordsLeaderboardGroups({ ...input, selectedIds: [group.id] }), [group], `${label}: direct ${category}/${section}/${group.id}`)
      results.push(actual)
    }
    return results
  }
  const original = compare(state, 'original')
  const edited = { ...state, matches: state.matches.map((match, index) => index ? match : { ...match, events: match.events.filter(event => event.type !== 'goal') }) }
  assert.notDeepEqual(compare(edited, 'edit'), original)
  const deleted = { ...state, matches: state.matches.slice(1) }
  assert.notDeepEqual(compare(deleted, 'delete'), original)
})

test('requested unit scopes retain complete catalog values and reuse the existing unit cache', () => {
  const state = performanceFixture(1)
  state.matches = state.matches.filter(match => match.teamId === state.teams[0].id && match.competitionType === 'league' && match.matchDay <= 2)
  // Eager unit precomputation reduced helper calls but regressed real timings;
  // retain the original engine/cache and protect requested-scope output instead.
  const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
  const full = buildUnitRecords(state.players, state.matches, [])
  const selected = buildUnitRecords(state.players, state.matches, [], new Set(['attack:2']))
  assert(full.length > 10)
  assert.deepEqual(selected, full.filter(row => row.position === 'attack' && row.size === 2))
  assert.strictEqual(buildUnitRecords(state.players, state.matches, [], new Set(['attack:2'])), selected)
})

test('player metric and position switches reuse the same canonical appearance facts', () => {
  const state = fixture()
  const goals = buildPlayerRecordLeaderboards(state.players, state.matches, scope, ['goals'])
  const rating = require('../src/engine/rating.ts'), original = rating.ratePlayerMatch
  let calls = 0
  rating.ratePlayerMatch = (...args) => { calls++; return original(...args) }
  try {
    const assists = buildPlayerRecordLeaderboards(state.players, state.matches, scope, ['assists'])
    assert.deepEqual(assists[0].rows, [])
    assert.deepEqual(buildPlayerRecordLeaderboards(state.players, state.matches, { ...scope, positionFilters: ['st-ss'] }, ['goals'])[0].rows.map(row => row.playerId), ['p0', 'p3'])
    assert.equal(calls, 0, 'metric/position selection must reuse canonical player appearance facts')
  } finally { rating.ratePlayerMatch = original }
  assert.equal(goals[0].rows.length, 5)
})

test('legacy same-date streaks preserve independent baseline chronology and saved insertion ties', () => {
  const state = fixture(), base = state.matches[0], player = state.players[0]
  const games = [true, false, true].map((scored, index) => ({ ...base, id: `legacy:${index}`, date: index === 2 ? '2026-01-02' : '2026-01-01', events: scored ? [{ ...base.events[0], id: `legacy:goal:${index}` }] : [] }))
  const baseline = require(path.join(baselineRoot(), 'src/engine/playerRecords.ts')).buildPlayerRecordLeaderboards
  const selectedIds = ['good-streak', 'scoring-streak', 'ga-streak']
  const expected = baseline([player], games, scope).filter(group => selectedIds.includes(group.id))
  assert.equal(expected.find(group => group.id === 'scoring-streak').rows[0].numeric, 2, 'independent release orders tied Jan 1 games before the later Jan 2 goal')
  assert.deepEqual(buildPlayerRecordLeaderboards([player], games, scope, selectedIds), expected)
  const reordered = [games[1], games[0], games[2]]
  assert.deepEqual(buildPlayerRecordLeaderboards([player], reordered, scope, selectedIds), baseline([player], reordered, scope).filter(group => selectedIds.includes(group.id)), 'same-date source insertion order must remain significant')
})
