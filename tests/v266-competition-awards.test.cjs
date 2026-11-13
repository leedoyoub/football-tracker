require('./helpers/register-ts.cjs')
const { test } = require('node:test'), assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const nav = require('../src/lib/navigation.ts')
const { normalizeCompetitionScreenState, resetCompetitionSeasonState } = require('../src/lib/competitionScreenState.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const actualAwards = require('../src/engine/awards.ts')
const root = path.resolve(__dirname, '..'), view = { name: 'competition', season: 'S1', competitionType: 'league' }
const teams = [{ id: 'A', name: 'A' }]
const players = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `Player ${i}`, teamId: 'A', position: 'ST', number: i + 1 }))
const candidates = players.map((p, i) => ({ playerId: p.id, teamId: 'A', family: 'ATT', average: 7 + i / 10, selectionScore: 9 - i / 100, minutes: 90, appearances: 1, mom: 0, latestRating: 7, goals: 0, assists: 0 }))
const result = scope => ({ scopeLabel: `S1 ${scope}`, playerLabel: `${scope} MVP`, teamLabel: `${scope} Best XI`, bestPlayerId: 'p0', complete: scope !== 'second-half', bestXI: [{ slot: 'ST', playerId: 'p0', avgRating: 7, matches: 1 }], candidates, statsByPlayer: { p0: { avgRating: 7, goals: 0, assists: 0 } }, individualAwards: { scorers: [], assistLeaders: [], goalkeepers: [] } })
const scopeResults = Object.fromEntries(['first-half', 'second-half', 'league'].map(scope => [scope, result(scope)]))
const app = { teams, players, matches: [{ id: 'm', season: 'S1', date: '2026-01-01', homeTeamId: 'A', awayTeamId: 'opponent', teamId: 'A', matchDay: 1, appearances: [], events: [] }], competitionStates: [{ id: 's', season: 'S1', kind: 'season-complete', teamIds: [] }] }
const restored = saved => loadLastNavigationEntry(app, { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view, screenState: saved }) : null })

test('v266 League is the default for missing/invalid scopes and obsolete XI modes are ignored', () => {
  const base = nav.defaultScreenState(view)
  assert.equal(base.leagueAwardScope, 'league')
  assert(!('bestXiMode' in base)); assert(!('cupAwardStage' in base))
  for (const scope of [undefined, null, '', 'monthly', 'deleted']) {
    const saved = { leagueAwardScope: scope, bestXiMode: 'monthly', monthlyAwardBlock: 9, cupAwardStage: 'stage7' }
    assert.equal(normalizeCompetitionScreenState(saved, base, ['A']).leagueAwardScope, 'league')
    const entry = restored(saved)
    assert.equal(entry.screenState.leagueAwardScope, 'league')
    assert(!('cupAwardStage' in entry.screenState)); assert(!('bestXiMode' in entry.screenState))
  }
})

test('v266 every valid saved scope survives legacy fields, season resets, player and Race round trips', () => {
  for (const scope of ['first-half', 'second-half', 'league']) {
    const state = { ...nav.defaultScreenState(view), leagueAwardScope: scope }
    assert.equal(restored({ ...state, bestXiMode: 'season', cupAwardStage: 'final' }).screenState.leagueAwardScope, scope)
    assert.equal(resetCompetitionSeasonState(state).leagueAwardScope, scope)
    const entry = nav.createNavigationEntry(view, state)
    for (const destination of [{ name: 'player', id: 'p0' }, { name: 'award-race', season: 'S1', competitionType: 'league', ...(scope === 'league' ? {} : { awardScope: scope }) }]) {
      const stack = nav.navigateBrowseEntry([entry], destination, 240)
      assert.deepEqual(nav.popNavigationEntry(stack), [{ ...entry, scrollTop: 240 }])
    }
  }
})

for (const scope of ['first-half', 'second-half', 'league']) test(`v266 ${scope} has one League Awards selector and one shared Race/XI result`, () => {
  const patches = [], destinations = [], calls = []
  const award = scopeResults[scope]
  const overrides = { '../engine/awards': { ...actualAwards, awardsForCompetition: () => scopeResults.league, competitionAwardResult() { calls.push('individual'); return scopeResults.league }, awardResultForScope(selected) { calls.push(selected); return scopeResults[selected] } } }
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'LeaguePlayers', app, overrides)
  const state = { ...nav.defaultScreenState(view), leagueAwardScope: scope }
  const tree = h.render({ ...app, season: 'S1', league: { matches: [] }, screenState: state, onStateChange: next => patches.push(next), onNavigate: next => destinations.push(next) })
  assert.equal(nodes(tree, n => n.type === 'h2' && n.props.children === 'League Awards').length, 1)
  const selectors = nodes(tree, n => n.type?.name === 'SegmentedControl')
  assert.equal(selectors.length, 1)
  assert.deepEqual(selectors[0].props.options.map(o => o.label), ['First Half', 'Second Half', 'League'])
  assert.equal(selectors[0].props.value, scope)
  selectors[0].props.onChange('second-half'); assert.equal(patches.at(-1).leagueAwardScope, 'second-half')
  const races = nodes(tree, n => n.type?.name === 'AwardRacePanel'), pitches = nodes(tree, n => n.type?.name === 'AwardBestXI')
  assert.equal(races.length, 1); assert.equal(pitches.length, 1)
  assert.strictEqual(races[0].props.candidates, award.candidates)
  assert.strictEqual(pitches[0].props.result, award)
  assert.equal(races[0].props.previewCount, 5)
  assert.equal(races[0].props.awardScope, scope === 'league' ? undefined : scope)
  assert.equal(nodes(tree, n => n.type === 'p' && JSON.stringify(n.props.children).includes(award.complete ? 'Finalized' : 'In progress')).length, 1)
  assert.deepEqual(calls, ['individual', scope], 'evaluate the selected scope once for both views')
  pitches[0].props.onPlayerOpen('p0'); assert.deepEqual(destinations.at(-1), { name: 'player', id: 'p0', season: 'S1', competitionType: 'league' })
  const panel = screenHarness(root, 'components/AwardRacePanel.tsx', 'AwardRacePanel', app).render(races[0].props)
  const topRows = nodes(panel, n => n.type?.name === 'AwardRaceRows')[0].props.rows
  assert.deepEqual(topRows.map(row => row.candidate.playerId), ['p0', 'p1', 'p2', 'p3', 'p4'])
  nodes(panel, n => n.type === 'button' && n.props.children === 'View All')[0].props.onClick()
  const route = destinations.at(-1)
  assert.equal(route.awardScope, scope === 'league' ? undefined : scope)
  const full = screenHarness(root, 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', app, overrides).render({ screenState: nav.defaultScreenState(route), onStateChange() {}, onNavigate() {}, onBack() {} })
  const fullRows = nodes(full, n => n.type?.name === 'AwardRaceRows')[0].props.rows
  assert.deepEqual(topRows, fullRows.slice(0, 5))
})

test('v266 empty selected periods keep one Race and the existing XI empty state', () => {
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'LeaguePlayers', app, { '../engine/awards': { ...actualAwards, competitionAwardResult: () => scopeResults.league, awardResultForScope: () => undefined } })
  const tree = h.render({ ...app, season: 'S1', league: { matches: [] }, screenState: { ...nav.defaultScreenState(view), leagueAwardScope: 'second-half' }, onStateChange() {}, onNavigate() {} })
  assert.equal(nodes(tree, n => n.type?.name === 'AwardRacePanel').length, 1)
  assert.equal(nodes(tree, n => n.type?.name === 'AwardBestXI').length, 0)
  assert.equal(nodes(tree, n => n.type?.name === 'Empty' && n.props.text === 'Not available yet.').length, 1)
})

test('v266 a retained legacy team does not change finalized League XI or View All results', () => {
  const s = require('./helpers/v265-ui-fixture.cjs').uiFixture()
  s.teams.push({ id: 'legacy-unused', name: 'Legacy unused', shortName: 'LEG' })
  const season = 'Season 1'
  const league = require('../src/engine/competition.ts').leagueCompetition(s.teams, s.matches, season, s.players)
  assert.equal(league.complete, false, 'the general standings model retains legacy teams')
  const canonical = actualAwards.awardResultForScope('league', season, s.teams, s.players, s.matches, s.competitionStates)
  assert.equal(canonical.complete, true, 'official scope is complete for all sixteen official teams')
  const tree = screenHarness(root, 'screens/CompetitionScreen.tsx', 'LeaguePlayers', s).render({ ...s, season, league, screenState: nav.defaultScreenState({ ...view, season }), onStateChange() {}, onNavigate() {} })
  const pitch = nodes(tree, n => n.type?.name === 'AwardBestXI')[0]
  const race = nodes(tree, n => n.type?.name === 'AwardRacePanel')[0]
  assert.strictEqual(pitch.props.result, canonical)
  assert.strictEqual(race.props.candidates, canonical.candidates)
  assert.equal(nodes(tree, n => n.type === 'p' && JSON.stringify(n.props.children).includes('Finalized')).length, 1)
  const fullRoute = { name: 'award-race', season, competitionType: 'league' }
  const full = screenHarness(root, 'screens/AwardRaceScreen.tsx', 'AwardRaceScreen', s).render({ screenState: nav.defaultScreenState(fullRoute), onStateChange() {}, onNavigate() {}, onBack() {} })
  const panel = screenHarness(root, 'components/AwardRacePanel.tsx', 'AwardRacePanel', s).render(race.props)
  assert.deepEqual(nodes(panel, n => n.type?.name === 'AwardRaceRows')[0].props.rows, nodes(full, n => n.type?.name === 'AwardRaceRows')[0].props.rows.slice(0, 5))
})

test('v266 legacy Cup stage state never calculates stage XI and retains official Cup outputs', () => {
  const s = require('./helpers/v265-ui-fixture.cjs').uiFixture()
  const cup = require('../src/engine/competition.ts').cupCompetition(s.teams, s.matches, 'Season 1', s.players)
  const canonical = actualAwards.competitionAwardResult('cup', 'Season 1', s.teams, s.players, s.matches, s.competitionStates, { cup })
  let stageCalls = 0
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'CompetitionBestElevens', s, { '../engine/awards': { ...actualAwards, performanceAwardResult(...args) { stageCalls++; return actualAwards.performanceAwardResult(...args) } } })
  const tree = h.render({ season: 'Season 1', type: 'cup', ...s, allMatches: s.matches, cup, champions: null, screenState: { ...nav.defaultScreenState(view), bestXiMode: 'period', cupAwardStage: 'stage1' }, onStateChange() {}, onNavigate() {} })
  assert.equal(stageCalls, 0)
  assert.equal(nodes(tree, n => n.type?.name === 'SegmentedControl' || n.type?.name === 'AwardScopeSelector').length, 0)
  const pitches = nodes(tree, n => n.type?.name === 'BestEleven')
  assert.equal(pitches.length, 1); assert.equal(pitches[0].props.title, 'Cup Best XI')
  assert.deepEqual(pitches[0].props.xi.slots, canonical.bestXI)
  assert.equal(pitches[0].props.bestPlayerId, canonical.bestPlayerId)
  assert.deepEqual(nodes(tree, n => n.type?.name === 'AwardRacePanel')[0].props.candidates, canonical.candidates)
  assert.deepEqual(nodes(tree, n => n.type?.name === 'CompetitionIndividualAwards')[0].props.result.individualAwards, canonical.individualAwards)
})

test('v266 official scoring, publication, Team History, shared race and pitch remain byte-equivalent to v265', () => {
  // v269 extends the full Race screen's presentation filters; independent
  // unfiltered screen row/candidate parity is checked in v269-ranking.
  // All official scoring, panel, pitch and qualification source locks stay exact.
  for (const file of ['engine/awards.ts', 'engine/awardEvaluation.ts', 'engine/awardRules.ts', 'engine/officialAwards.ts', 'engine/awardPolicy.ts', 'engine/rating.ts', 'engine/ratingRevision.ts', 'engine/competition.ts', 'engine/teamHistorySelection.ts', 'components/Pitch.tsx', 'components/awardBestXIProps.ts', 'components/AwardBestXI.tsx', 'components/AwardRacePanel.tsx']) {
    const old = execFileSync('git', ['show', `5347394:src/${file}`], { encoding: 'utf8' }).replaceAll('\r', '')
    const current = fs.readFileSync(path.join(root, 'src', file), 'utf8').replaceAll('\r', '')
    // v268 indexes historical registrations once; the entire shared scoring,
    // qualification, weighting, deduplication and tie-selection code stays exact.
    // The independent result check below also protects the changed input index.
    const sharedScoring = source => {
      const start = source.indexOf('/** Shared individual facts')
      assert(start >= 0)
      return source.slice(start)
    }
    assert.equal(file === 'engine/awardEvaluation.ts' ? sharedScoring(current) : current, file === 'engine/awardEvaluation.ts' ? sharedScoring(old) : old, file)
  }
})

test('v268 indexed participation preserves every official candidate field across scopes and historical edits', () => {
  const baseline = require(path.join(require('./helpers/v268-baseline.cjs').baselineRoot(), 'src/engine/awardEvaluation.ts'))
  const current = require('../src/engine/awardEvaluation.ts')
  const s = require('./helpers/v255-fixture.cjs').performanceFixture(1)
  const compare = label => {
    for (const type of ['all', 'league', 'cup', 'champions']) {
      const games = s.matches.filter(m => type === 'all' || m.competitionType === type)
      const args = [s.players, games, s.matches, (competition, teamId) => (s.teams.findIndex(t => t.id === teamId) + 1) * ({ league: .01, cup: .02, champions: .03 }[competition]), { league: .7, cup: .2, champions: .4 }]
      assert.deepEqual(current.evaluateOfficialCandidates(...args), baseline.evaluateOfficialCandidates(...args), `${label}: ${type}`)
    }
  }
  compare('original')
  s.matches[0] = { ...s.matches[0], events: [] }
  compare('same-array historical replacement')
  s.matches.splice(1, 1)
  s.players[9] = { ...s.players[9], teamId: s.teams[2].id, position: 'GK' }
  compare('historical deletion and player transfer')
})
