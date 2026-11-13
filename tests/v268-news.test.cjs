require('./helpers/register-ts.cjs')
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { sourceModule } = require('./helpers/v259-harness.cjs')
const { baselineRoot } = require('./helpers/v268-baseline.cjs')
const root = path.resolve(__dirname, '..'), beforeRoot = baselineRoot()
const source = (directory, file) => require(path.join(directory, 'src/engine', file + '.ts'))

test('official award participation visits selected historical team records without scanning every player against the league', () => {
  const state = performanceFixture(1), games = state.matches.slice(0, 48), args = [state.players, games, games, () => .15, { league: 1 }]
  const original = Set.prototype.has
  const memberships = {}
  let expected
  for (const [side, directory] of [['before', beforeRoot], ['after', root]]) {
    const api = sourceModule(directory, 'engine/awardEvaluation.ts')
    let reads = 0
    Set.prototype.has = function (value) {
      if (this.size === games.length && value && typeof value === 'object' && 'appearances' in value) reads++
      return original.call(this, value)
    }
    let actual
    try { actual = api.evaluateOfficialCandidates(...args) } finally { Set.prototype.has = original }
    if (expected) assert.deepEqual(actual, expected, 'all official candidate facts, participation gates and scores')
    expected = actual
    memberships[side] = reads
  }
  assert.ok(memberships.after < memberships.before / 4, JSON.stringify(memberships))
})

test('unchanged football-event selections reuse contribution work across reopen and semantically equal options', () => {
  const state = performanceFixture(1), args = [state.players, state.teams, state.matches.slice(0, 16), state.competitionStates]
  const facts = source(root, 'playerMatchFacts')
  let reads = 0
  const api = sourceModule(root, 'engine/news.ts', { './playerMatchFacts': { ...facts,
    playerGoalEvents(...values) { reads++; return facts.playerGoalEvents(...values) },
    playerAssistEvents(...values) { reads++; return facts.playerAssistEvents(...values) },
  } })
  const expected = source(beforeRoot, 'news').deriveFootballEvents(...args)
  assert.deepEqual(api.deriveFootballEvents(...args), expected)
  assert.ok(reads > 0, 'cold projection reads canonical contributions')
  reads = 0
  assert.deepEqual(api.deriveFootballEvents(...args, { includeAllRanking: false, includeMatchPerformance: true }), expected)
  assert.equal(reads, 0, 'reopening an unchanged event selection avoids repeated contribution traversal')
})

test('award scopes reuse season chronology, registration evidence and credited minutes until a historical revision changes', () => {
  const state = performanceFixture(1), seasonGames = state.matches.slice(0, 32), timeline = source(root, 'timeline')
  let reads = 0
  const api = sourceModule(root, 'engine/awardEvaluation.ts', { './timeline': { ...timeline,
    creditedMinutesPlayed(...args) { reads++; return timeline.creditedMinutesPlayed(...args) },
  } })
  const baseline = source(beforeRoot, 'awardEvaluation')
  for (const day of [1, 2]) {
    const games = seasonGames.filter(match => match.matchDay === day), args = [state.players, games, seasonGames, () => .15, { league: 1 }]
    assert.deepEqual(api.evaluateOfficialCandidates(...args), baseline.evaluateOfficialCandidates(...args))
    if (day === 1) { assert.equal(reads, 32 * 23, 'first scope reads each recorded registration once'); reads = 0 }
  }
  assert.equal(reads, 0, 'a different half or competition scope reuses unchanged season registration facts')
  seasonGames[0] = { ...seasonGames[0], events: [] }
  const args = [state.players, seasonGames, seasonGames, () => .15, { league: 1 }]
  assert.deepEqual(api.evaluateOfficialCandidates(...args), baseline.evaluateOfficialCandidates(...args))
  assert.equal(reads, 32 * 23, 'same-array historical replacement rebuilds the shared season facts')
})

test('News gates unfinished half scopes before candidate evaluation and retains every finalized half article', () => {
  for (const days of [6, 15]) {
    const state = performanceFixture(1)
    state.matches = state.matches.filter(match => match.competitionType === 'league' && match.matchDay <= days)
    const awards = source(root, 'awards'), scopes = []
    const api = sourceModule(root, 'engine/news.ts', { './awards': { ...awards,
      awardResultForScope(...args) { scopes.push(args[0]); return awards.awardResultForScope(...args) },
    } })
    const args = [state.players, state.teams, state.matches, state.competitionStates]
    assert.deepEqual(api.deriveNews(...args), source(beforeRoot, 'news').deriveNews(...args), `through day ${days}`)
    assert.deepEqual(scopes, days === 15 ? ['first-half'] : [], 'only finalized halves need candidate projection for News')
  }
})

test('award stint indexes preserve transfers, unknown registration gaps, duplicate identities and competition opportunity slots', () => {
  const current = source(root, 'awardEvaluation'), baseline = source(beforeRoot, 'awardEvaluation')
  for (let seed = 0; seed < 4; seed++) {
    const clubs = ['A', 'B', 'C', 'D']
    const players = Array.from({ length: 20 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}`, teamId: index % 2 ? '' : 'released', position: ['GK', 'CB', 'CM', 'ST'][index % 4] }))
    const seasonGames = []
    for (let day = 1; day <= 12; day++) for (const [teamIndex, teamId] of clubs.entries()) {
      const dual = (day + seed) % 5 === 0, opponent = clubs[(teamIndex + 1) % 4]
      const appearances = players.flatMap((player, index) => {
        const owner = clubs[(index + Math.floor((day + seed) / 3)) % 4]
        return ((owner === teamId || dual && owner === opponent) && (index + day) % 4 !== 0) ? [{ playerId: player.id, teamId: owner, role: index % 7 ? 'starter' : 'bench', position: player.position, matchPosition: player.position }] : []
      })
      const type = ['league', 'cup', 'champions'][(day + seed) % 3]
      seasonGames.push({ id: `${day}:${teamId}`, season: 'S1', date: day % 7 ? `2026-01-${String(day).padStart(2, '0')}` : '', recordedAt: seasonGames.length + 1, duration: 90,
        teamId: dual ? undefined : teamId, homeTeamId: teamId, awayTeamId: opponent, matchDay: day, competitionType: type,
        competitionStage: type === 'league' ? 'regular' : type === 'cup' ? 'stage1' : 'roundOf16', competitionSeriesGame: type === 'champions' ? day % 3 + 1 : undefined, appearances, events: [] })
    }
    seasonGames.splice(7, 0, { ...seasonGames[6], appearances: seasonGames[5].appearances, recordedAt: 7.5 })
    seasonGames.splice(12, 0, seasonGames[10])
    players.push({ ...players[0], position: 'ST' })
    for (const scope of ['all', 'league', 'cup', 'champions']) {
      const games = seasonGames.filter(match => scope === 'all' || match.competitionType === scope)
      const args = [players, games, seasonGames, (type, teamId) => (clubs.indexOf(teamId) + 1) * ({ league: .015, cup: .03, champions: .06 }[type]), { league: .7, cup: .3, champions: .6 }]
      assert.deepEqual(current.evaluateOfficialCandidates(...args), baseline.evaluateOfficialCandidates(...args), `seed ${seed}, ${scope}`)
    }
  }
})

function allFeedSelections(state, label) {
  const args = [state.players, state.teams, state.matches, state.competitionStates]
  const current = source(root, 'news'), baseline = source(beforeRoot, 'news')
  assert.deepEqual(current.deriveNews(...args), baseline.deriveNews(...args), `${label}: every News article`)
  for (const includeAllRanking of [false, true]) for (const includeMatchPerformance of [false, true]) {
    const options = { includeAllRanking, includeMatchPerformance }
    assert.deepEqual(current.deriveFootballEvents(...args, options), baseline.deriveFootballEvents(...args, options), `${label}: ${JSON.stringify(options)}`)
  }
  const latest = source(root, 'latestChanges'), oldLatest = source(beforeRoot, 'latestChanges')
  for (const season of [undefined, ...new Set(state.matches.map(match => match.season))]) assert.deepEqual(latest.deriveLatestChanges(...args, season), oldLatest.deriveLatestChanges(...args, season), `${label}: Latest Changes ${season}`)
}

test('independent v267 release source matches every article and event in two and six seasons', () => {
  for (const seasons of [2, 6]) allFeedSelections(performanceFixture(seasons), `${seasons} seasons`)
})

test('all event selections and Latest Changes invalidate historical edits, additions, deletions and roster/state replacements', () => {
  const state = performanceFixture(1)
  state.matches = state.matches.slice(0, 96)
  allFeedSelections(state, 'original')
  const args = [state.players, state.teams, state.matches, state.competitionStates]
  const current = source(root, 'news'), latest = source(root, 'latestChanges')
  const original = current.deriveFootballEvents(...args), originalChanges = latest.deriveLatestChanges(...args)
  state.matches[0] = { ...state.matches[0], events: [] }
  allFeedSelections(state, 'same-array early match replacement')
  assert.notDeepEqual(current.deriveFootballEvents(...args), original)
  assert.notDeepEqual(latest.deriveLatestChanges(...args), originalChanges)
  state.matches.push({ ...state.matches[2], id: 'added-historical-match', recordedAt: .5 })
  allFeedSelections(state, 'historical addition')
  state.matches.splice(1, 1)
  allFeedSelections(state, 'historical deletion')
  state.players[9] = { ...state.players[9], teamId: state.teams[2].id, displayName: 'Transferred and renamed', position: 'GK' }
  state.teams[0] = { ...state.teams[0], name: 'Preserved team edit' }
  state.competitionStates[0] = { ...state.competitionStates[0], teamIds: state.competitionStates[0].teamIds.slice().reverse() }
  allFeedSelections(state, 'same-length roster/team/draw replacements')
  state.players.splice(0, 1)
  allFeedSelections(state, 'deleted player')
})
