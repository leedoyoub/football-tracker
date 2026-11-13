require('./helpers/register-ts.cjs')
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const { baselineRoot } = require('./v269-derived-baseline.cjs')
const root = path.resolve(__dirname, '..'), beforeRoot = baselineRoot()
const source = (directory, file) => require(path.join(directory, 'src/engine', file + '.ts'))
const kinds = ['duo', 'attack', 'midfield', 'cb', 'fullback', 'backFour']

test('each combination query reads a recorded player interval once per match and team', () => {
  const state = performanceFixture(1), games = state.matches.slice(0, 4), rating = source(root, 'rating')
  for (const kind of kinds) {
    const reads = new Map()
    const api = sourceModule(root, 'engine/analytics.ts', { './rating': { ...rating,
      creditedPositionSegments(match, appearance) {
        const key = JSON.stringify([match.id, appearance.teamId, appearance.playerId])
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return rating.creditedPositionSegments(match, appearance)
      },
    } })
    const actual = api.combinationStats(state.players, games, {}, kind)
    assert.deepEqual(actual, source(beforeRoot, 'analytics').combinationStats(state.players, games, {}, kind))
    assert.ok(reads.size > 0)
    assert.equal(Math.max(...reads.values()), 1, `${kind} repeats canonical interval traversal`)
  }
})

function equalDerived(state, label, allEvents = true) {
  const args = [state.players, state.teams, state.matches, state.competitionStates]
  const current = source(root, 'news'), previous = source(beforeRoot, 'news')
  assert.deepEqual(current.deriveNews(...args), previous.deriveNews(...args), `${label}: all News fields and ordering`)
  for (const includeAllRanking of allEvents ? [false, true] : [false]) for (const includeMatchPerformance of allEvents ? [false, true] : [true]) {
    const options = { includeAllRanking, includeMatchPerformance }
    assert.deepEqual(current.deriveFootballEvents(...args, options), previous.deriveFootballEvents(...args, options), `${label}: events ${JSON.stringify(options)}`)
  }
  const season = state.matches.at(-1)?.season ?? 'Season 1'
  for (const scope of [undefined, season]) assert.deepEqual(source(root, 'latestChanges').deriveLatestChanges(...args, scope), source(beforeRoot, 'latestChanges').deriveLatestChanges(...args, scope), `${label}: Latest Changes ${scope}`)
  const recapArgs = [state.players, state.matches, season, state.competitionStates, state.teams]
  assert.deepEqual(source(root, 'seasonInsights').seasonRecap(...recapArgs), source(beforeRoot, 'seasonInsights').seasonRecap(...recapArgs), `${label}: full Recap`)
  assert.deepEqual(source(root, 'seasonInsights').startingXILeaders(state.players, state.matches, season), source(beforeRoot, 'seasonInsights').startingXILeaders(state.players, state.matches, season), `${label}: Starting XI`)
  for (const kind of kinds) assert.deepEqual(source(root, 'analytics').combinationStats(state.players, state.matches, { season }, kind), source(beforeRoot, 'analytics').combinationStats(state.players, state.matches, { season }, kind), `${label}: complete ${kind} rows`)
}

test('v268 independent source matches every News event, Latest Changes, Recap and combination in two/six seasons', () => {
  for (const seasons of [2, 6]) equalDerived(performanceFixture(seasons), `${seasons} seasons`)
})

test('derived results preserve historical edits, deletions, transfers, duplicate identities and completed seasons', () => {
  const state = performanceFixture(1)
  state.matches = state.matches.slice(0, 48)
  equalDerived(state, 'initial')
  state.matches[0] = { ...state.matches[0], events: [] }
  equalDerived(state, 'same-array historical replacement')
  state.matches.splice(1, 1)
  equalDerived(state, 'same-array deletion')
  state.matches.push({ ...state.matches[2], id: 'historical-added-match', recordedAt: .5 })
  equalDerived(state, 'historical addition')
  state.players[9] = { ...state.players[9], teamId: state.teams[2].id, position: 'GK', displayName: 'Renamed transfer' }
  state.players.push({ ...state.players[0], position: 'ST' })
  state.matches[1] = { ...state.matches[1], appearances: [...state.matches[1].appearances, { ...state.matches[1].appearances[0], position: 'ST' }] }
  state.competitionStates.push({ id: 'complete-season-1', kind: 'season-complete', season: 'Season 1' })
  equalDerived(state, 'duplicate IDs, transfer and season completion')
})
