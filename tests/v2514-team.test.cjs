require('./helpers/register-ts.cjs')
const { test, after } = require('node:test'), assert = require('node:assert/strict'), path = require('node:path')
const { baselineSource } = require('./helpers/v2514-baseline.cjs')
const { performanceFixture } = require('./helpers/v255-fixture.cjs')
const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const { renderToStaticMarkup } = require('react-dom/server')
const b = baselineSource(); after(b.cleanup)
const root = path.resolve(__dirname, '..'), noop = () => {}
const oldCompetition = require(path.join(b.directory, 'src/engine/competition.ts'))
const nav = require('../src/lib/navigation.ts')
test('progress presentation keeps exact source meaning with round before eliminated/progress', () => {
  const h = screenHarness(root, 'screens/TeamDetailScreen.tsx', 'competitionProgressLines', {})
  const competitionProgressLines = status => h.render(status)
  for (const round of ['Round of 16', 'Quarter Final', 'Semi Final', 'Final', 'Stage 4']) assert.deepEqual(competitionProgressLines(`Eliminated · ${round}`), [round, 'Eliminated'])
  for (const text of ['Champion', 'Not Started', 'Final Replay', 'Stage 7', 'Unrecognized existing status']) assert.deepEqual(competitionProgressLines(text), [text])
  assert.deepEqual(competitionProgressLines('Round of 16 (2/3)'), ['Round of 16', '2/3'])
})
test('Overview and Matches do not calculate career positions; Players still does', () => {
  const s = performanceFixture(1); let calls = 0
  const actual = require('../src/engine/positionScope.ts')
  const h = screenHarness(root, 'screens/TeamDetailScreen.tsx', 'TeamDetailScreen', s, { '../engine/positionScope': { ...actual, scopedPositionFamilyByPlayer: (...args) => { calls++; return actual.scopedPositionFamilyByPlayer(...args) } } })
  const props = { teamId: s.teams[0].id, season: 'Season 1', onStateChange: noop, onNavigate: noop, onBack: noop }
  const base = nav.defaultScreenState({ name: 'team', id: props.teamId })
  h.render({ ...props, screenState: { ...base, tab: 'overview' } }); h.render({ ...props, screenState: { ...base, tab: 'matches' } }); assert.equal(calls, 0)
  h.render({ ...props, screenState: { ...base, tab: 'players' } }); assert.equal(calls, 1)
})
test('latest standings equal every baseline movement for partial, gapped, edited and deleted days', () => {
  const { latestLeagueStandings } = require('../src/engine/seasonAnalytics.ts')
  const old = require(path.join(b.directory, 'src/engine/seasonAnalytics.ts'))
  const s = performanceFixture(1)
  const scenarios = [[], s.matches.slice(0, 1), s.matches.slice(0, 17), s.matches.slice(0, 32), s.matches, s.matches.filter(m => m.matchDay !== 29), s.matches.slice(0, -1), s.matches.map((m, i) => i === 3 ? { ...m, events: [] } : m)]
  for (const matches of scenarios) {
    const history = old.buildLeagueHistory(s.teams, s.players, matches, 'Season 1')
    assert.deepEqual(latestLeagueStandings(s.teams, s.players, matches, 'Season 1'), history.leagueSnapshots.get(history.currentMatchDay)?.standings ?? [])
  }
})
test('latest standings reuse their compact projection on remount and prefer an existing full History', () => {
  const { latestLeagueStandings, buildLeagueHistory } = require('../src/engine/seasonAnalytics.ts'), s = performanceFixture(1)
  const first = latestLeagueStandings(s.teams, s.players, s.matches, 'Season 1')
  assert.equal(latestLeagueStandings(s.teams, s.players, s.matches, 'Season 1'), first)
  assert.notEqual(latestLeagueStandings(s.teams, s.players, s.matches.slice(), 'Season 1'), first)
  assert.notEqual(latestLeagueStandings(s.teams, s.players.slice(), s.matches, 'Season 1'), first)
  assert.notEqual(latestLeagueStandings(s.teams.slice(), s.players, s.matches, 'Season 1'), first)
  const revision = require('../src/engine/ratingRevision.ts'), oldRevision = revision.RATING_ENGINE_REVISION
  try { revision.RATING_ENGINE_REVISION++; assert.notEqual(latestLeagueStandings(s.teams, s.players, s.matches, 'Season 1'), first) } finally { revision.RATING_ENGINE_REVISION = oldRevision }
  const history = buildLeagueHistory(s.teams, s.players, s.matches, 'Season 1')
  assert.equal(latestLeagueStandings(s.teams, s.players, s.matches, 'Season 1'), history.leagueSnapshots.get(history.currentMatchDay).standings)
})
test('Team Overview selector models preserve all raw records including eliminated cup and Champions actual goals', () => {
  const s = performanceFixture(2), current = require('../src/engine/competition.ts'), selectors = require('../src/engine/competitionSelectors.ts'), owner = {}
  for (const season of ['Season 1', 'Season 2']) {
    const models = { league: selectors.selectLeagueCompetition(owner, s.teams, s.matches, season, 0, 0, undefined, s.players), cup: selectors.selectCupCompetition(owner, s.teams, s.matches, season, 0, 0, s.players), champions: selectors.selectChampionsCompetition(owner, s.competitionStates.find(x => x.season === season), s.matches, season, 0, s.players) }
    for (const team of s.teams) assert.deepEqual(current.teamCompetitionOverview(team.id, s.teams, s.matches, season, s.players, s.competitionStates, models), oldCompetition.teamCompetitionOverview(team.id, s.teams, s.matches, season, s.players, s.competitionStates))
  }
})
test('bulk team facts equal playerSeasonStats for every player/scope including transfers and duplicates', () => {
  const s = performanceFixture(1), stats = require('../src/engine/stats.ts')
  s.matches[0].appearances.push({ ...s.matches[0].appearances[0], teamId: s.teams[1].id })
  for (const scope of [undefined, 'league', 'cup', 'champions']) for (const team of s.teams.slice(0, 3)) {
    const facts = stats.teamPlayerSeasonStats(s.players, s.matches, 'Season 1', team.id, scope)
    for (const p of s.players) {
      const { goals, assists, avgRating, matches } = stats.playerSeasonStats(p, s.players, s.matches, 'Season 1', team.id, scope)
      assert.deepEqual(facts.get(p.id) ?? { goals: 0, assists: 0, avgRating: 0, matches: 0 }, { goals, assists, avgRating, matches })
    }
  }
})
test('long Team Matches uses shared measured cards and short scopes retain all cards', () => {
  const s = performanceFixture(1); const matches = s.matches.filter(m => m.teamId === s.teams[0].id)
  const h = screenHarness(root, 'screens/TeamDetailScreen.tsx', 'TeamDetailScreen', { ...s, matches })
  const props = { teamId: s.teams[0].id, season: 'Season 1', screenState: { ...nav.defaultScreenState({ name: 'team', id: s.teams[0].id }), tab: 'matches' }, onStateChange: noop, onNavigate: noop, onBack: noop }
  // Fixture has 36/team; duplicate IDs safely for a 72-match long list.
  const long = screenHarness(root, 'screens/TeamDetailScreen.tsx', 'TeamDetailScreen', { ...s, matches: [...matches, ...matches.map(m => ({ ...m, id: `extra:${m.id}` }))] })
  const tree = long.render(props)
  assert.equal(nodes(tree, n => n.type?.name === 'VirtualCardList').length, 1)
  const html = renderToStaticMarkup(tree); assert((html.match(/data-card-key=/g) || []).length < 30)
  const shortHtml = renderToStaticMarkup(h.render(props)); assert.equal((shortHtml.match(/data-card-key=/g) || []).length, 0)
  const old = screenHarness(b.directory, 'screens/TeamDetailScreen.tsx', 'TeamDetailScreen', { ...s, matches })
  const oldHtml = renderToStaticMarkup(old.render(props))
  const matchesSection = html => html.slice(html.indexOf('<section class="mt-4">'))
  assert.equal(matchesSection(shortHtml), matchesSection(oldHtml), '40 or fewer results retain the original Matches DOM and card content')
  assert.match(shortHtml, />History<\/button>/, 'approved fourth Team Detail tab remains visible')
})
