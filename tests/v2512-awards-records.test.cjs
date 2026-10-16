const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { awardsForCompetition, finalPlayerAward } = require('../src/engine/awards.ts')
const { getMatchManOfTheMatch } = require('../src/engine/rating.ts')
const player = (id, position = 'GK', teamId = 'A') => ({ id, name: id, displayName: id, position, teamId, number: 1 })
const app = (p, extra = {}) => ({ playerId: p.id, teamId: p.teamId, role: 'starter', position: p.position, matchPosition: p.position, ...extra })
const game = (id, appearances, extra = {}) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances, events: [], ...extra })
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))

test('brief GK and defender appearances have unrestricted valid rate statistics', () => {
  const gk = player('gk'), cb = player('cb', 'CB')
  const match = game('brief', [app(gk, { role: 'sub' }), app(cb, { role: 'sub' })], { events: [{ id: 'sub-gk', type: 'sub', minute: 89, playerInId: gk.id, teamId: 'A' }, { id: 'sub-cb', type: 'sub', minute: 89, playerInId: cb.id, teamId: 'A' }, { id: 'save', type: 'save', minute: 89, playerId: gk.id, teamId: 'A', count: 1 }, { id: 'goal', type: 'goal', minute: 89.5, teamId: 'B' }] })
  const rows = buildGlobalRankingData([gk, cb], [match, game('missed', [])], { seasons: [], teams: [], positions: [] }, 'rating')
  assert.equal(rankGlobalRankingRows(rows, [gk, cb], 'goalkeeperGaPer90')[0]?.value, 90)
  assert.equal(rankGlobalRankingRows(rows, [gk, cb], 'defenderGaPer90')[0]?.value, 90)
  assert.equal(rankGlobalRankingRows(rows, [gk, cb], 'savePercentage')[0]?.value, 50)
})

test('League Golden Glove counts clean sheets without the forty-percent gate', () => {
  const keeper = player('brief-gk')
  const matches = [game('g1', [app(keeper, { role: 'sub' })], { events: [{ id: 'sub', type: 'sub', minute: 89, playerInId: keeper.id, teamId: 'A' }] }), ...[2, 3, 4, 5].map(n => game(`g${n}`, [], { matchDay: n }))]
  const award = awardsForCompetition('league', 'S1', teams, [keeper], matches, [], { league: { complete: false, standings: [] } })
  assert.equal(award.goalkeeper?.playerId, keeper.id)
  assert.equal(award.goalkeeper?.label, 'League Golden Glove')
  assert.equal(award.goalkeeper?.value, 1)
})

test('final award shares canonical MOM priorities and stable complete ties', () => {
  const ps = [player('z', 'ST'), player('a', 'ST'), player('defender', 'CB')]
  const match = game('cup-final', ps.map(p => app(p)), { competitionType: 'cup', competitionStage: 'final' })
  assert.equal(finalPlayerAward(ps, [match])?.playerId, getMatchManOfTheMatch(match, ps))
  assert.equal(finalPlayerAward(ps.slice().reverse(), [match])?.playerId, getMatchManOfTheMatch(match, ps))
  assert.equal(finalPlayerAward(ps, [match])?.playerId, 'defender')
})

module.exports = { player, app, game, teams }

const { STATIC_TEAMS } = require('../src/data/teams.ts')
const official = (...args) => require('../src/engine/officialAwards.ts').officialAwardsForSeason(...args)
function leagueFixture(days = 30) {
  const p = player('career', 'ST', STATIC_TEAMS[0].id)
  const matches = STATIC_TEAMS.flatMap((team, ti) => Array.from({ length: days }, (_, i) => game(`league:${ti}:${i}`, ti === 0 ? [app(p)] : [], { teamId: team.id, homeTeamId: team.id, awayTeamId: `opponent-${ti}`, matchDay: i + 1, events: ti === 0 ? [{ id: `goal:${i}`, type: 'goal', minute: 10, teamId: team.id, playerId: p.id }] : [] })))
  return { p, matches }
}
test('official career events exclude unfinished blocks, deduplicate, and use competition appearances for titles', () => {
  const { p, matches } = leagueFixture(3)
  assert.equal(official(STATIC_TEAMS, [p], matches.slice(1), [], 'S1').length, 0)
  const players = [p], states = []
  const events = official(STATIC_TEAMS, players, matches, states, 'S1')
  assert.deepEqual(events.map(e => e.kind).sort(), ['monthly-player', 'monthly-xi'])
  assert(events.every(e => e.finalized && e.teamId === p.teamId && e.period === 1))
  assert.equal(new Set(events.map(e => e.id)).size, events.length)
  assert.strictEqual(official(STATIC_TEAMS, players, matches, states, 'S1'), events)
  const completed = leagueFixture()
  const cupOnly = player('cup-only', 'ST', completed.p.teamId)
  const games = [...completed.matches, game('cup-only', [app(cupOnly)], { homeTeamId: cupOnly.teamId, teamId: cupOnly.teamId, competitionType: 'cup', competitionStage: 'stage1' })]
  const all = official(STATIC_TEAMS, [{ ...completed.p, teamId: 'new-team' }, cupOnly], games, [], 'S1')
  assert(all.some(e => e.kind === 'championship' && e.playerId === completed.p.id && e.competition === 'league' && e.teamId === completed.p.teamId))
  assert(!all.some(e => e.kind === 'championship' && e.playerId === cupOnly.id && e.competition === 'league'))
  const edited = games.filter(m => m.id !== 'league:0:0')
  assert(!official(STATIC_TEAMS, [completed.p, cupOnly], edited, [], 'S1').some(e => e.kind === 'league-mvp'))
})

test('award Records share totals, filters, historical teams and official season results', () => {
  const { recordsLeaderboardGroups } = require('../src/screens/recordsLeaderboards.ts')
  const { p, matches } = leagueFixture()
  const input = { category: 'player', section: 'awards', players: [{ ...p, teamId: 'new' }], teams: STATIC_TEAMS, matches, states: [], scope: { seasons: ['S1'], teamIds: [p.teamId], competition: 'all', positionFilter: 'st-ss' } }
  const groups = recordsLeaderboardGroups(input)
  const n = id => groups.find(g => g.id === id)?.rows[0]?.numeric
  assert.equal(n('awards-individual'), 24)
  assert.equal(n('awards-championships'), 1)
  assert.equal(n('awards-total'), 25)
  assert.equal(n('awards-monthly'), 20)
  assert.equal(recordsLeaderboardGroups({ ...input, scope: { ...input.scope, competition: 'cup' } }).find(g => g.id === 'awards-individual')?.rows.length, 0)
  assert.equal(recordsLeaderboardGroups({ ...input, scope: { ...input.scope, positionFilter: 'gk' } }).find(g => g.id === 'awards-individual')?.rows.length, 0)
  const history = recordsLeaderboardGroups({ ...input, category: 'team' })
  assert.equal(history.find(g => g.id === 'history-league-titles')?.rows[0]?.numeric, 1)
  assert.equal(history.find(g => g.id === 'history-league-points')?.rows[0]?.numeric, 90)
  assert.match(history.find(g => g.id === 'history-league-points')?.rows[0]?.detail ?? '', /S1/)
})

test('career UI groups awards into accessible disclosures with historical details', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const { PlayerCareerAwards } = require('../src/components/PlayerCareerAwards.tsx')
  const { p, matches } = leagueFixture()
  const html = renderToStaticMarkup(React.createElement(PlayerCareerAwards, { playerId: p.id, players: [p], teams: STATIC_TEAMS, matches, states: [] }))
  assert.match(html, /Individual Awards/)
  assert.match(html, /Team Honors/)
  assert.match(html, /Championships/)
  assert.match(html, /Runner-up Finishes/)
  assert.match(html, /<details/)
  assert.match(html, /Player of the Month.*?×10/s)
  assert.match(html, /Season 1-10/)
  assert.doesNotMatch(html, /MD 28|Most MOM|Best Duo/)
  assert.match(html, /Real Madrid/)
})

test('Champions round selector excludes Final and uses the shared AwardBestXI pitch', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
  const { defaultScreenState } = require('../src/lib/navigation.ts')
  const path = require('node:path')
  const matches = ['roundOf16', 'quarterFinal', 'semiFinal', 'final'].map((stage, i) => game(stage, [], { competitionType: 'champions', competitionStage: stage, matchDay: i + 1 }))
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/CompetitionScreen.tsx', 'CompetitionBestElevens', { competitionStates: [] })
  const tree = h.render({ season: 'S1', type: 'champions', screenState: { ...defaultScreenState({ name: 'competition' }), bestXiMode: 'period', championsAwardRound: 'final' }, onStateChange() {}, players: [], teams, matches, allMatches: matches, cup: null, champions: { rounds: { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] } }, onNavigate() {} })
  const selector = nodes(tree, n => n.props?.ariaLabel === 'Champions round')[0]
  assert.deepEqual(selector.props.options.map(o => o.value), ['roundOf16', 'quarterFinal', 'semiFinal'])
  assert.equal(selector.props.value, 'semiFinal')
  assert(nodes(tree, n => n.props?.children === 'In progress').length || JSON.stringify(tree).includes('In progress'))
})

test('full Records uses bounded virtual rows and retains historical season details', () => {
  const { screenHarness, nodes } = require('./helpers/v259-harness.cjs')
  const { defaultScreenState } = require('../src/lib/navigation.ts')
  const path = require('node:path')
  const rows = Array.from({ length: 350 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, rank: i + 1, numeric: 1, value: '1', detail: 'Season 2 · Champion' }))
  const h = screenHarness(path.resolve(__dirname, '..'), 'screens/RecordsLeaderboardScreen.tsx', 'RecordsLeaderboardScreen', { players: [], teams: [], matches: [], competitionStates: [] }, { './recordsLeaderboards': { recordsLeaderboardGroups: () => [{ id: 'awards-total', title: 'Most Total Honors', rows, applicableFilters: {} }] } })
  const tree = h.render({ screenState: { ...defaultScreenState({ name: 'records-leaderboard', category: 'player', leaderboardId: 'awards-total' }), leaderboardId: 'awards-total' }, onStateChange() {}, onNavigate() {}, onBack() {} })
  assert.equal(nodes(tree, n => n.type?.name === 'VirtualRankingList').length, 1)
  assert.equal(nodes(tree, n => n.props?.children === '1').length, 0)
})

function cupFixture(replay = false) {
  const { cupCompetition, CUP_STAGES } = require('../src/engine/competition.ts')
  const matches = []
  for (const stage of CUP_STAGES) {
    const active = cupCompetition(STATIC_TEAMS, matches, 'S1').activeTeamIds
    active.forEach((id, i) => matches.push(game(`${stage}:${id}`, [], { teamId: id, homeTeamId: id, awayTeamId: `opp:${id}`, competitionType: 'cup', competitionStage: stage, events: Array.from({ length: active.length - i }, (_, n) => ({ id: `${stage}:${id}:${n}`, type: 'goal', minute: n + 1, teamId: id })) })))
  }
  const active = cupCompetition(STATIC_TEAMS, matches, 'S1').activeTeamIds
  const ps = active.map((id, i) => player(`finalist:${i}`, 'ST', id))
  for (const p of ps) matches.push(game(`final:${p.id}`, [app(p)], { teamId: p.teamId, homeTeamId: p.teamId, awayTeamId: `opp:${p.teamId}`, competitionType: 'cup', competitionStage: 'final', events: replay ? [] : [{ id: p.id, type: 'goal', minute: 10, teamId: p.teamId, playerId: p.id }] }))
  return { matches, ps }
}
function championsFixture() {
  const { championsCompetition } = require('../src/engine/competition.ts')
  const states = [{ id: 'draw', kind: 'champions-draw', season: 'S1', teamIds: STATIC_TEAMS.map(t => t.id) }]
  const ps = STATIC_TEAMS.map((t, i) => player(`champion:${i}`, i % 2 ? 'GK' : 'ST', t.id))
  const matches = []
  for (const stage of ['roundOf16', 'quarterFinal', 'semiFinal', 'final']) {
    const model = championsCompetition(states[0], matches, 'S1', ps)
    for (const pair of model.rounds[stage]) for (const id of pair.teamIds) for (let n = 1; n <= (stage === 'final' ? 2 : 3); n++) {
      const p = ps.find(p => p.teamId === id)
      matches.push(game(`${stage}:${id}:${n}`, [app(p)], { teamId: id, homeTeamId: id, awayTeamId: `opp:${id}`, competitionType: 'champions', competitionStage: stage, competitionPairingId: pair.id, competitionSeriesGame: n, events: [{ id: `g:${stage}:${id}:${n}`, type: 'goal', minute: 10, teamId: id, playerId: p.id }] }))
    }
  }
  return { matches, ps, states }
}
test('Champions publishes R16/QF/SF only when every series finishes and final MVP after two games per side', () => {
  const { matches, ps, states } = championsFixture()
  const all = official(STATIC_TEAMS, ps, matches, states, 'S1')
  assert.equal(all.filter(e => e.kind === 'champions-round-player').length, 3)
  assert.equal(all.filter(e => e.kind === 'champions-final').length, 1)
  assert(!all.some(e => e.kind === 'champions-round-xi' && e.period === 'final'))
  const partial = official(STATIC_TEAMS, ps, matches.slice(0, -1), states, 'S1')
  assert(!partial.some(e => e.kind === 'champions-final' || e.kind === 'champions-mvp'))
  const missingR16 = matches.filter(m => m.id !== matches[0].id)
  assert(!official(STATIC_TEAMS, ps, missingR16, states, 'S1').some(e => e.kind === 'champions-round-player' && e.period === 'roundOf16'))
  assert.equal(all.filter(e => e.category === 'championship').length, 1)
  assert.equal(all.filter(e => e.category === 'runner-up').length, 1)
})

test('Cup replay combines finals for MVP, publishes only after resolution, and counts one final appearance', () => {
  const { matches, ps } = cupFixture(true)
  assert(!official(STATIC_TEAMS, ps, matches, [], 'S1').some(e => e.kind === 'cup-final'))
  const replay = ps.map((p, i) => game(`replay:${p.id}`, [app(p)], { teamId: p.teamId, homeTeamId: p.teamId, awayTeamId: `opp:${p.teamId}`, competitionType: 'cup', competitionStage: 'finalReplay', events: i ? [] : [{ id: 'winner', type: 'goal', minute: 10, teamId: p.teamId, playerId: p.id }] }))
  const all = [...matches, ...replay]
  const model = require('../src/engine/officialAwards.ts').officialSeasonModel(STATIC_TEAMS, ps, all, [], 'S1')
  assert.equal(model.events.filter(e => e.kind === 'cup-final').length, 1)
  assert.equal(model.events.find(e => e.kind === 'cup-final').playerId, finalPlayerAward(ps, all.filter(m => ['final', 'finalReplay'].includes(m.competitionStage))).playerId)
  assert.equal(model.teamResults.filter(r => r.competition === 'cup' && r.finalAppearance).length, 2)
})

test('season GK average excludes outfield-only games and adds the integrated team performance bonus', () => {
  const { seasonAwards } = require('../src/engine/awards.ts')
  const keeper = player('mixed', 'ST')
  const games = [game('gk', [app(keeper, { matchPosition: 'GK', position: 'GK' })]), game('outfield', [app(keeper)], { events: [{ id: 'goal', type: 'goal', minute: 10, teamId: 'A', playerId: keeper.id }] })]
  const result = seasonAwards('S1', teams, [keeper], games, [])
  assert.equal(result.goalkeeper?.value, require('../src/engine/rating.ts').ratePlayerMatch(games[0], keeper).raw)
  assert(Math.abs(result.goalkeeper.awardScore - result.goalkeeper.value - .26) < 1e-10)
  const ineligible = seasonAwards('S1', teams, [keeper], [...games, ...[3, 4, 5].map(i => game(`empty:${i}`, []))], [])
  assert.equal(ineligible.goalkeeper, undefined)
})

test('unused bench registration after transfer cannot move historical scorer and GK awards', () => {
  const { p, matches } = leagueFixture()
  const laterTeam = STATIC_TEAMS[1].id
  const later = game('unused-new-team', [app(p, { teamId: laterTeam, role: 'bench' })], { date: '2027-01-01', teamId: laterTeam, homeTeamId: laterTeam, awayTeamId: 'other', matchDay: 30 })
  const beforeTransfer = matches.filter(m => !(m.teamId === laterTeam && m.matchDay === 30))
  const events = official(STATIC_TEAMS, [{ ...p, teamId: laterTeam }], [...beforeTransfer, later], [], 'S1')
  assert.equal(events.find(e => e.kind === 'league-scorer')?.teamId, p.teamId)
  assert.equal(events.find(e => e.kind === 'league-scorer')?.position, 'ST')
  const keeper = { ...p, position: 'GK' }
  const keeperGames = beforeTransfer.map(m => ({ ...m, events: [], appearances: m.appearances.map(a => ({ ...a, position: 'GK', matchPosition: 'GK' })) }))
  const gkEvents = official(STATIC_TEAMS, [keeper], [...keeperGames, later], [], 'S1')
  assert.equal(gkEvents.find(e => e.kind === 'league-gk')?.teamId, p.teamId)
})

test('completed integrated awards retain Season labels and never appear in a single competition scope', () => {
  const league = leagueFixture(), cup = cupFixture(false), champions = championsFixture()
  cup.matches[cup.matches.length - 1].events = []
  const keeper = player('season-keeper', 'GK', league.p.teamId)
  const leagueGames = league.matches.map(m => m.teamId === keeper.teamId ? { ...m, appearances: [...m.appearances, app(keeper)] } : m)
  const players = [league.p, keeper, ...cup.ps, ...champions.ps]
  const matches = [...leagueGames, ...cup.matches, ...champions.matches]
  const events = official(STATIC_TEAMS, players, matches, champions.states, 'S1')
  assert.equal(events.find(e => e.kind === 'season-mvp')?.label, 'Player of the Season')
  assert.equal(events.find(e => e.kind === 'season-gk')?.label, 'Goalkeeper of the Season')
  assert(events.filter(e => e.kind.startsWith('season-')).every(e => e.competition === 'all'))
  assert.equal(events.filter(e => /golden-glove/.test(e.kind)).length, 0)
  const { assertPolicyEquivalence } = require('./helpers/v2512-policy-comparison.cjs')
  assert.throws(() => assertPolicyEquivalence({ label: 'Player of the League' }, { label: 'Player of the Season' }, 'integrated', 'label'), /unchanged policy fields/)
})

test('League clean-sheet ratio breaks ties while Cup and Champions GK awards retain forty-percent eligibility', () => {
  const a = player('regular-gk'), b = player('brief-gk', 'GK', 'B')
  const matches = [game('clean-a', [app(a)]), game('conceded-a', [app(a)], { events: [{ id: 'against', type: 'goal', minute: 10, teamId: 'B' }] }), game('clean-b', [app(b)])]
  const league = awardsForCompetition('league', 'S1', teams, [a, b], matches, [], { league: { complete: false, standings: [] } })
  assert.equal(league.goalkeeper.playerId, b.id)
  for (const type of ['cup', 'champions']) {
    const games = matches.map(m => ({ ...m, competitionType: type, competitionStage: type === 'cup' ? 'stage1' : 'roundOf16' }))
    const model = type === 'cup' ? { cup: { activeTeamIds: ['A', 'B'], eliminatedAtByTeam: {}, stage: 'stage1' } } : { champions: { currentStage: 'roundOf16', rounds: { roundOf16: [{ teamIds: ['A', 'B'] }], quarterFinal: [], semiFinal: [], final: [] } } }
    assert.equal(awardsForCompetition(type, 'S1', teams, [a, b], games, [], model).goalkeeper.playerId, a.id)
  }
})

test('zero role minutes and no save denominator remain unavailable in ordinary rankings', () => {
  const keeper = player('no-shots'), striker = player('striker', 'ST')
  const matches = [game('zero-shots', [app(keeper), app(striker)])]
  const rows = buildGlobalRankingData([keeper, striker], matches, { seasons: [], teams: [], positions: [] }, 'rating')
  assert.equal(rankGlobalRankingRows(rows, [keeper, striker], 'savePercentage').length, 0)
  assert.equal(rankGlobalRankingRows(rows, [keeper, striker], 'defenderGaPer90').length, 0)
  assert.equal(rankGlobalRankingRows(rows, [keeper, striker], 'goalkeeperGaPer90')[0].value, 0)
})
