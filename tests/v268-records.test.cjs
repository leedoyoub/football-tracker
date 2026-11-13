require('./helpers/register-ts.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
const { buildUnitRecords } = require('../src/engine/unitRecords.ts')
const { recordsScopedMatches } = require('../src/engine/recordsScope.ts')
const { seasonRecap, startingXILeaders } = require('../src/engine/seasonInsights.ts')
const path = require('node:path')
const { baselineRoot } = require('./helpers/v268-baseline.cjs')

const scope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
function smallFixture() {
  const state = performanceFixture(1)
  state.matches = state.matches.filter(match => match.teamId === state.teams[0].id && match.competitionType === 'league' && match.matchDay <= 4)
  state.players = state.players.filter(player => state.matches.some(match => match.appearances.some(row => row.playerId === player.id)))
  return state
}
function observedMatches(matches) {
  let reads = 0
  return { matches: matches.map(match => new Proxy(match, { get(target, property) {
    if (property === 'events' || property === 'appearances') reads++
    return Reflect.get(target, property)
  } })), get reads() { return reads } }
}

// Replacing the scoped array on a metric change must not defeat the existing
// combination cache and re-read every timeline for duo/CB calculations.
test('Records metric changes reuse the unchanged combination source timelines', () => {
  const state = smallFixture(), observed = observedMatches(state.matches)
  const input = { ...state, matches: observed.matches, category: 'combination', scope }
  const ids = ['goal-combinations', 'duo-ga', 'cb-suppression', 'cb-ga', 'together:attack:2:starts', 'best-unit:attack:2:goals']
  const first = recordsLeaderboardGroups({ ...input, selectedIds: ids })
  const firstReads = observed.reads
  const second = recordsLeaderboardGroups({ ...input, selectedIds: ids.map(id => id === 'together:attack:2:starts' ? 'together:attack:2:minutes' : id) })
  assert.deepEqual(second.find(group => group.id === 'duo-ga'), first.find(group => group.id === 'duo-ga'))
  assert(observed.reads - firstReads < firstReads / 4, `metric switch read ${observed.reads - firstReads} timeline inputs after ${firstReads} initial reads`)
})

// The same attack-pair data supplies starts, minutes and PPG; requesting a
// different presentation must not recalculate shared on-pitch intervals.
test('unit metrics reuse requested football facts until match or roster input changes', () => {
  const state = smallFixture(), observed = observedMatches(state.matches)
  const first = buildUnitRecords(state.players, observed.matches, [], new Set(['attack:2']))
  assert(first.some(row => row.starts === 4 && row.minutes > 0))
  const firstReads = observed.reads
  const second = buildUnitRecords(state.players, observed.matches, [], new Set(['attack:2']))
  assert.deepEqual(second, first)
  assert.equal(observed.reads - firstReads, 0, 'unchanged unit queries should not read match payloads')
  const edited = observed.matches.map((match, index) => index ? match : { ...match, events: [] })
  const changed = buildUnitRecords(state.players, edited, [], new Set(['attack:2']))
  assert.notDeepEqual(changed, first)
  observed.matches[0] = edited[0]
  assert.deepEqual(buildUnitRecords(state.players, observed.matches, [], new Set(['attack:2'])), changed, 'legacy item replacement invalidates the unit cache')
})

// Reopening a completed recap keeps the expensive player/split/XI facts; an
// immutable historical edit must still produce new awards and XI aggregates.
test('Season Recap revisits reuse derived facts and invalidate historical edits', () => {
  const state = smallFixture(), observed = observedMatches(state.matches)
  const states = [{ id: 'complete', kind: 'season-complete', season: 'Season 1' }]
  const leaders = startingXILeaders(state.players, observed.matches, 'Season 1')
  const first = seasonRecap(state.players, observed.matches, 'Season 1', states, state.teams, leaders)
  const firstReads = observed.reads
  const second = seasonRecap(state.players, observed.matches, 'Season 1', states, state.teams, startingXILeaders(state.players, observed.matches, 'Season 1'))
  assert.deepEqual(second, first)
  assert.equal(observed.reads - firstReads, 0, 'unchanged recap revisits should not read match payloads')
  const edited = observed.matches.map((match, index) => index ? match : { ...match, events: [] })
  const changed = seasonRecap(state.players, edited, 'Season 1', states, state.teams)
  assert.notDeepEqual(changed, first)
  assert.notDeepEqual(startingXILeaders(state.players, edited, 'Season 1'), leaders)
  observed.matches[0] = edited[0]
  assert.deepEqual(seasonRecap(state.players, observed.matches, 'Season 1', states, state.teams), changed, 'legacy item replacement invalidates recap facts')
})

test('stable Records scope invalidates replaced and removed historical matches', () => {
  const state = smallFixture()
  const selectedScope = { ...scope, seasons: ['Season 1'], competition: 'league' }
  assert.equal(recordsScopedMatches(state.matches, selectedScope, 'combination').length, 4)
  state.matches[0] = { ...state.matches[0], season: 'Season 2' }
  assert.equal(recordsScopedMatches(state.matches, selectedScope, 'combination').length, 3)
  state.matches.pop()
  assert.equal(recordsScopedMatches(state.matches, selectedScope, 'combination').length, 2)
})

function comparisonFixture() {
  const state = performanceFixture(2)
  // Keep the full competition calendar and varied scores, with a small active
  // roster. This exercises finalized League honors without making every scope
  // comparison regenerate hundreds of unrelated partnership combinations.
  const activeTeams = new Set(state.teams.slice(0, 2).map(team => team.id))
  state.matches = state.matches.map(match => activeTeams.has(match.teamId) && (match.competitionType !== 'league' || match.matchDay <= 6) ? match : { ...match, appearances: [] })
  const knownIds = new Set(state.matches.flatMap(match => match.appearances.map(row => row.playerId)))
  state.players = state.players.filter(player => knownIds.has(player.id))
  state.competitionStates = [...state.competitionStates, ...['Season 1', 'Season 2'].map(season => ({ id: `complete:${season}`, kind: 'season-complete', season }))]
  return state
}

// Independent git-archive modules catch any changed rows, ranks, history labels,
// names, detail strings, group order or official recipients across every catalog.
test('all Records catalogs and Season Recap equal v2.6.7 for filter scopes and historical mutations', () => {
  const archived = baselineRoot()
  const baselineRecords = require(path.join(archived, 'src/screens/recordsLeaderboards.ts')).recordsLeaderboardGroups
  const baselineInsights = require(path.join(archived, 'src/engine/seasonInsights.ts'))
  const state = comparisonFixture()
  const scopes = [
    scope,
    { ...scope, seasons: ['Season 1'] },
    { ...scope, seasons: ['Season 2'] },
    { ...scope, seasons: ['Season 2', 'Season 1'] },
    { ...scope, seasons: ['missing'] },
    { ...scope, teamIds: [state.teams[0].id] },
    { ...scope, teamIds: state.teams.slice(0, 2).map(team => team.id) },
    { ...scope, teamIds: ['missing'] },
    ...['league', 'cup', 'champions'].map(competition => ({ ...scope, competition })),
    ...['gk', 'cb', 'lb-rb', 'fb', 'cdm', 'cm', 'lm-rm', 'cam', 'lw-rw', 'st-ss'].map(positionFilter => ({ ...scope, positionFilter })),
    { ...scope, seasons: ['Season 1'], teamIds: [state.teams[0].id], competition: 'league', positionFilter: 'cb' },
  ]
  function compareRecords(currentState, selectedScopes, label) {
    const result = []
    for (const selectedScope of selectedScopes) for (const category of ['player', 'team', 'combination']) for (const section of category === 'combination' ? ['performance'] : ['performance', 'awards']) {
      const input = { ...currentState, states: currentState.competitionStates, category, section, scope: selectedScope }
      // v2.6.9 intentionally makes player team selection display-only. Keep
      // independent official equality for the full ranking and project its
      // historical membership instead of preserving the former renumbering.
      let before = baselineRecords(category === 'player' ? { ...input, scope: { ...selectedScope, teamIds: [] } } : input)
      if (category === 'player' && selectedScope.teamIds.length) {
        const ids = new Set(currentState.matches.filter(match => (!selectedScope.seasons.length || selectedScope.seasons.includes(match.season)) && (selectedScope.competition === 'all' || match.competitionType === selectedScope.competition)).flatMap(match => match.appearances.filter(row => selectedScope.teamIds.includes(row.teamId)).map(row => row.playerId)))
        before = before.map(group => ({ ...group, rows: group.rows.filter(row => ids.has(row.id)) }))
      }
      const after = recordsLeaderboardGroups(input)
      assert.deepEqual(after, before, `${label} ${category}/${section} ${JSON.stringify(selectedScope)}`)
      if (selectedScope === scope) result.push(after)
    }
    return result
  }
  function compareRecaps(currentState, label) {
    return ['Season 1', 'Season 2'].map(season => {
      const beforeXI = baselineInsights.startingXILeaders(currentState.players, currentState.matches, season)
      const afterXI = startingXILeaders(currentState.players, currentState.matches, season)
      assert.deepEqual(afterXI, beforeXI, `${label} ${season} XI`)
      const args = [currentState.players, currentState.matches, season, currentState.competitionStates, currentState.teams]
      const after = seasonRecap(...args, afterXI)
      assert.deepEqual(after, baselineInsights.seasonRecap(...args, beforeXI), `${label} ${season} Recap`)
      return after
    })
  }
  const original = compareRecords(state, scopes, 'original')
  const combinations = original.at(-1)
  for (const group of combinations) {
    const input = { ...state, category: 'combination', scope, selectedIds: [group.id] }
    assert.deepEqual(recordsLeaderboardGroups(input), baselineRecords(input), `direct combination leaderboard ${group.id}`)
  }
  const originalRecaps = compareRecaps(state, 'original')
  const editIndex = state.matches.findIndex(match => match.season === 'Season 1' && match.teamId === state.teams[0].id && match.matchDay === 1)
  const edited = { ...state, matches: state.matches.map((match, index) => index === editIndex ? { ...match, events: match.events.filter(event => event.type !== 'goal') } : match) }
  assert.notDeepEqual(compareRecords(edited, [scope], 'historical edit'), original)
  assert.notDeepEqual(compareRecaps(edited, 'historical edit'), originalRecaps)
  const deleted = { ...state, matches: state.matches.filter((_, index) => index !== editIndex) }
  assert.notDeepEqual(compareRecords(deleted, [scope], 'historical delete'), original)
  assert.notDeepEqual(compareRecaps(deleted, 'historical delete'), originalRecaps)
  const transferred = { ...state, players: state.players.map((player, index) => index < 3 ? { ...player, position: index === 0 ? 'ST' : 'GK', teamId: state.teams[2].id, teamIds: [state.teams[2].id] } : player) }
  compareRecords(transferred, [scope, scopes[5], scopes.at(-1)], 'transfer and position edit')
  compareRecaps(transferred, 'transfer and position edit')
  compareRecaps({ ...state, competitionStates: state.competitionStates.filter(item => item.kind !== 'season-complete') }, 'completion removed')
})
