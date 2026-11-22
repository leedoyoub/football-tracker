require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { root, work, base, baselineRoot, cappedMomFixture } = require('./helpers/v2612-mom-fixture.cjs')
const baseline = baselineRoot()
const samples = Number(process.env.V2612_SAMPLES || 3)
const kinds = (process.env.V2612_WORKFLOWS || 'single-mom,season-mom,ranking-switch,player-detail,records,award-race,news-latest,match-changes,recap').split(',')
const output = process.env.V2612_OUTPUT || path.join(work, 'performance.json')
const api = (directory, name) => require(path.join(directory, 'src', name + '.ts'))
const { screenHarness } = require('./helpers/v259-harness.cjs')

function fixture(seasons) {
  const { state, capped, keeper, striker } = cappedMomFixture(seasons)
  const capIds = new Set()
  state.matches = state.matches.map(match => {
    if (match.teamId !== state.teams[0].id || match.competitionType !== 'league' || match.matchDay > 2) return match
    capIds.add(match.id)
    return { ...capped(match.id, match.season, match.matchDay), date: match.date, recordedAt: match.recordedAt }
  })
  return { state, capIds, keeper, striker, season: `Season ${seasons}` }
}

function verify(seasons) {
  const { state, capIds, striker } = fixture(seasons)
  const previous = api(baseline, 'engine/rating'), current = api(root, 'engine/rating')
  const expected = api(baseline, 'engine/momSelection').selectMomCandidate
  let changed = 0, capTies = 0
  for (const match of state.matches) {
    const rows = previous.rateMatch(match, state.players)
    assert.deepEqual(current.rateMatch(match, state.players), rows)
    const oldWinner = previous.getMatchManOfTheMatch(match, state.players)
    const newWinner = current.getMatchManOfTheMatch(match, state.players)
    const capped = rows.filter(row => row.raw === 10)
    if (capped.length < 2) {
      assert.equal(newWinner, oldWinner)
      continue
    }
    capTies++
    const max = Math.max(...capped.map(row => row.preClamp))
    const candidates = capped.filter(row => row.preClamp === max).map(row => {
      const appearance = match.appearances.find(a => a.playerId === row.playerId)
      const goals = match.events.filter(event => event.type === 'goal' && !event.ownGoal && previous.isOnPitchAtEvent(match, appearance, event))
      return { playerId: row.playerId, position: row.position, average: row.raw, minutes: row.minutes,
        goals: goals.filter(event => event.playerId === row.playerId).length, assists: goals.filter(event => event.assistPlayerId === row.playerId).length }
    })
    assert.equal(newWinner, expected(candidates, match.id))
    if (capIds.has(match.id)) assert.equal(newWinner, striker)
    changed += Number(oldWinner !== newWinner)
  }
  assert(changed >= capIds.size)
  const official = directory => {
    const r = api(directory, 'engine/stats'), selection = { seasons: [], teams: [], positions: [] }
    return r.rankGlobalRankingRows(r.buildGlobalRankingData(state.players, state.matches, selection, 'rating'), state.players, 'rating').map(({ mom: _mom, ...row }) => row)
  }
  assert.deepEqual(official(root), official(baseline))
  return { matches: state.matches.length, capTies, changed, identicalRatingBreakdownsAndOfficialRatingRank: true }
}

function workflow(directory, kind, { state, striker, season, capIds }) {
  const { matches, players, teams, competitionStates } = state
  const source = name => api(directory, 'engine/' + name)
  const game = matches.find(match => capIds.has(match.id))
  if (kind === 'single-mom' || kind === 'season-mom') {
    const { getMatchManOfTheMatch, rateMatch } = source('rating')
    // Single-game timing excludes its already calculated rating breakdowns.
    if (kind === 'single-mom') {
      rateMatch(game, players)
      return () => getMatchManOfTheMatch(game, players)
    }
    return () => matches.map(match => getMatchManOfTheMatch(match, players))
  }
  if (kind === 'ranking-switch') {
    const { buildGlobalRankingData, rankGlobalRankingRows } = source('stats')
    const filters = { seasons: [season], teams: [], positions: [] }
    buildGlobalRankingData(players, matches, filters, 'rating')
    return () => rankGlobalRankingRows(buildGlobalRankingData(players, matches, filters, 'mom'), players, 'mom')
  }
  if (kind === 'player-detail') {
    const h = screenHarness(directory, 'screens/PlayerDetailScreen.tsx', 'PlayerOverview', state)
    const { defaultScreenState } = api(directory, 'lib/navigation')
    const noAction = () => {}
    const props = {
      player: players.find(player => player.id === striker), players, teams, matches, competitionStates,
      selectedSeason: season, competition: 'all',
      playerScopedMatches: matches.filter(match => match.season === season && match.appearances.some(row => row.playerId === striker)),
      screenState: defaultScreenState({ name: 'player', id: striker, season }), onNavigate: noAction, onStateChange: noAction,
    }
    return () => h.render(props)
  }
  if (kind === 'records') {
    const { recordsLeaderboardGroups } = api(directory, 'screens/recordsLeaderboards')
    return () => recordsLeaderboardGroups({ ...state, category: 'player', scope: { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }, selectedIds: ['mom'] })
  }
  if (kind === 'award-race') {
    const { seasonAwards } = source('awards')
    return () => seasonAwards(season, teams, players, matches, competitionStates).candidates
  }
  if (kind === 'news-latest') {
    const { deriveFootballEvents } = source('news'), { deriveLatestChanges } = source('latestChanges')
    return () => [deriveFootballEvents(players, teams, matches, competitionStates), deriveLatestChanges(players, teams, matches, competitionStates, season)]
  }
  if (kind === 'match-changes') {
    const { buildMatchChangeIndex } = source('matchChangeIndex')
    return () => buildMatchChangeIndex(players, teams, matches, competitionStates)
  }
  const { seasonRecap, startingXILeaders } = source('seasonInsights')
  return () => seasonRecap(players, matches, season, competitionStates, teams, startingXILeaders(players, matches, season))
}

const summary = values => {
  const ordered = values.slice().sort((a, b) => a - b)
  return { median: ordered[Math.floor(ordered.length / 2)], p95: ordered[Math.ceil(ordered.length * .95) - 1], samples: values }
}
const report = { base, node: process.version, samples, scales: {} }
for (const seasons of [2, 6]) {
  const scale = report.scales[seasons] = { equivalence: verify(seasons), timings: {} }
  for (const kind of kinds) {
    const cold = { before: [], after: [] }, warm = { before: [], after: [] }
    for (let i = 0; i < samples; i++) for (const side of i % 2 ? ['after', 'before'] : ['before', 'after']) {
      global.gc?.()
      const run = workflow(side === 'before' ? baseline : root, kind, fixture(seasons))
      const start = performance.now()
      run()
      cold[side].push(performance.now() - start)
      const again = performance.now()
      run()
      warm[side].push(performance.now() - again)
    }
    const timings = scale.timings[kind] = Object.fromEntries(['before', 'after'].map(side => [side, { cold: summary(cold[side]), warm: summary(warm[side]) }]))
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    console.log(`${seasons} seasons ${kind}: ${timings.before.cold.median.toFixed(3)} → ${timings.after.cold.median.toFixed(3)} ms`)
  }
}
