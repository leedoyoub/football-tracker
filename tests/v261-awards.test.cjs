require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { awardsForCompetition, seasonAwards } = require('../src/engine/awards.ts')
const { officialAwardsForSeason, officialSeasonModel, awardEventDetail } = require('../src/engine/officialAwards.ts')
const { seasonRecap } = require('../src/engine/seasonInsights.ts')
const { historyTimelineForSeason, historyAwardsForSeason } = require('../src/engine/historyReadModels.ts')
const { STATIC_TEAMS } = require('../src/data/teams.ts')
const { sourceModule, screenHarness, nodes } = require('./helpers/v259-harness.cjs')
const root = require('node:path').resolve(__dirname, '..')
const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, displayName: id, teamId, position, number: 9 })
const app = (p, extra = {}) => ({ playerId: p.id, teamId: p.teamId, position: p.position, matchPosition: p.position, role: 'starter', ...extra })
const game = (id, ps, extra = {}) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'A', awayTeamId: 'B', appearances: ps.map(p => app(p)), events: [], ...extra })
const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id }))
const ids = rows => rows.map(row => row.playerId).sort()

test('two and three shared scorers and assisters survive competition, season, recap and timeline projections', () => {
  for (const count of [2, 3]) {
    const ps = Array.from({ length: count }, (_, i) => player(`p${i}`, i === 2 ? 'B' : 'A'))
    const helpers = ps.map(p => player(`helper:${p.id}`, p.teamId, 'CM'))
    const players = [...ps, ...helpers]
    const matches = ps.map((p, i) => game(`match${i}`, [p, helpers[i]], { homeTeamId: p.teamId, awayTeamId: 'opponent', events: [
      ...[10, 20].map(minute => ({ id: `goal${i}:${minute}`, type: 'goal', minute, teamId: p.teamId, playerId: p.id })),
      { id: `assisted${i}`, type: 'goal', minute: 30, teamId: p.teamId, playerId: helpers[i].id, assistPlayerId: p.id },
    ] }))
    const expected = ps.map(p => p.id).sort()
    for (const type of ['league', 'cup', 'champions']) {
      const scoped = matches.map(m => ({ ...m, competitionType: type, competitionStage: type === 'league' ? 'regular' : type === 'cup' ? 'stage1' : 'roundOf16' }))
      const award = awardsForCompetition(type, 'S1', teams, players, scoped, [])
      assert.deepEqual(ids(award.scorers), expected)
      assert.deepEqual(ids(award.assistLeaders), expected)
      assert.strictEqual(award.scorer, award.scorers[0])
      assert.strictEqual(award.assists, award.assistLeaders[0])
    }
    const season = seasonAwards('S1', teams, players, matches, [])
    assert.deepEqual(ids(season.goldenBootWinners), expected)
    assert.deepEqual(ids(season.assistLeaderWinners), expected)
    const recap = seasonRecap(players, matches, 'S1', [], teams)
    assert.deepEqual(recap.awards.find(a => a.id === 'scorer').playerIds.slice().sort(), expected)
    assert.deepEqual(recap.awards.find(a => a.id === 'assists').playerIds.slice().sort(), expected)
    const history = historyTimelineForSeason(teams, players, matches, [], 'S1')
    assert.deepEqual(ids(history.scorers), expected)
    assert.deepEqual(ids(history.assistLeaders), expected)
  }
})

test('League Golden Glove shares clean-sheet maximum despite different ratios, minutes and save statistics', () => {
  for (const count of [2, 3]) {
    const ps = Array.from({ length: count }, (_, i) => player(`g${i}`, i % 2 ? 'B' : 'A', 'GK'))
    const matches = ps.map((p, i) => game(`clean${i}`, [p], { homeTeamId: p.teamId, awayTeamId: 'opponent', events: [{ id: `save${i}`, type: 'save', minute: 20, playerId: p.id, teamId: p.teamId, count: i + 1 }] }))
    matches.push(game('conceded', [ps[0]], { events: [{ id: 'against', type: 'goal', minute: 20, teamId: 'B' }] }))
    const award = awardsForCompetition('league', 'S1', teams, ps, matches, [])
    assert.deepEqual(ids(award.goalkeepers), ps.map(p => p.id).sort())
    assert(award.goalkeepers.every(w => w.value === 1))
    assert.strictEqual(award.goalkeeper, award.goalkeepers[0])
    for (const type of ['cup', 'champions']) {
      const scoped = matches.map(m => ({ ...m, competitionType: type, competitionStage: type === 'cup' ? 'stage1' : 'roundOf16' }))
      assert.equal(awardsForCompetition(type, 'S1', teams, ps, scoped, []).goalkeepers.length, 1)
    }
  }
})

test('empty scopes emit no winners and zero maxima retain all existing eligible participants', () => {
  const empty = awardsForCompetition('league', 'S1', teams, [], [], [])
  assert.deepEqual([empty.scorers, empty.assistLeaders, empty.goalkeepers], [[], [], []])
  const ps = [player('a', 'A', 'GK'), player('b', 'B', 'GK')]
  const matches = ps.map((p, i) => game(`zero${i}`, [p], { homeTeamId: p.teamId, awayTeamId: 'opponent', events: [{ id: `against${i}`, type: 'goal', minute: 20, teamId: 'opponent' }] }))
  const zero = awardsForCompetition('league', 'S1', teams, ps, matches, [])
  for (const rows of [zero.scorers, zero.assistLeaders, zero.goalkeepers]) { assert.deepEqual(ids(rows), ['a', 'b']); assert(rows.every(w => w.value === 0)) }
})

function finalizedLeague() {
  const ps = [player('old-a', STATIC_TEAMS[0].id, 'GK'), player('old-b', STATIC_TEAMS[0].id, 'GK'), player('old-c', STATIC_TEAMS[1].id, 'GK')]
  const matches = STATIC_TEAMS.flatMap((team, ti) => Array.from({ length: 30 }, (_, day) => {
    const participants = ps.filter(p => p.teamId === team.id)
    return game(`league:${ti}:${day}`, participants, { teamId: team.id, homeTeamId: team.id, awayTeamId: `opponent:${ti}`, matchDay: day + 1, date: '2026-01-01' })
  }))
  return { ps, matches }
}

test('finalized historical events include every recipient once, with stable IDs and team-at-award after transfer bench registration', () => {
  const { ps, matches } = finalizedLeague()
  const moved = ps.map(p => ({ ...p, teamId: STATIC_TEAMS[2].id, position: 'ST' }))
  const bench = game('later-bench', [], { date: '2026-12-01', competitionType: 'cup', competitionStage: 'stage1', homeTeamId: STATIC_TEAMS[2].id, awayTeamId: 'opponent', appearances: moved.map(p => app(p, { role: 'bench' })) })
  const all = [...matches, bench], states = []
  const model = officialSeasonModel(STATIC_TEAMS, moved, all, states, 'S1')
  assert.deepEqual(model.status, require('../src/engine/competition.ts').competitionSeasonStatus(STATIC_TEAMS, all, 'S1', moved, undefined))
  const events = model.events
  for (const kind of ['league-scorer', 'league-assists', 'league-gk']) {
    const recipients = events.filter(e => e.kind === kind)
    assert.deepEqual(ids(recipients), ps.map(p => p.id).sort())
    for (const e of recipients) assert.equal(e.teamId, ps.find(p => p.id === e.playerId).teamId)
    assert.equal(new Set(recipients.map(e => e.id)).size, 3)
  }
  const replay = officialAwardsForSeason(STATIC_TEAMS, moved.slice().reverse(), all.slice().reverse(), [], 'S1')
  assert.deepEqual(events.filter(e => /league-(scorer|assists|gk)$/.test(e.kind)).map(e => e.id).sort(), replay.filter(e => /league-(scorer|assists|gk)$/.test(e.kind)).map(e => e.id).sort())
  const history = historyAwardsForSeason(STATIC_TEAMS, moved, all, states, 'S1', 'league')[0]
  assert.deepEqual(ids(history.goalkeepers), ps.map(p => p.id).sort())
  assert(!officialAwardsForSeason(STATIC_TEAMS, moved, all.filter(m => m.id !== 'league:0:0'), [], 'S1').some(e => e.kind === 'league-scorer'))
})

test('award event time detail identifies finals, months and round stages from canonical kind/period', () => {
  const event = { season: 'S12', teamId: 'A', kind: 'cup-final' }
  assert.equal(awardEventDetail(event, teams), 'Season 12 · Final')
  assert.equal(awardEventDetail({ ...event, kind: 'champions-final' }, teams), 'Season 12 · Final')
  assert.equal(awardEventDetail({ ...event, kind: 'monthly-player', period: 3 }, teams), 'Season 12-3')
  assert.equal(awardEventDetail({ ...event, kind: 'champions-round-player', period: 'quarterFinal' }, teams), 'Season 12 · Quarter-finals')
})

test('finalized integrated season publishes one event per shared scorer/assister and retains one season MVP/GK', () => {
  const { ps, matches } = finalizedLeague()
  const competition = require('../src/engine/competition.ts')
  // Isolate the publication contract after the canonical all-competition gate.
  const official = sourceModule(root, 'engine/officialAwards.ts', { './competition': { ...competition, competitionSeasonStatus: (...args) => ({ ...competition.competitionSeasonStatus(...args), complete: true }) } })
  const events = official.officialAwardsForSeason(STATIC_TEAMS, ps, matches, [], 'S1')
  for (const kind of ['season-scorer', 'season-assists']) assert.deepEqual(ids(events.filter(e => e.kind === kind)), ps.map(p => p.id).sort())
  assert.equal(events.filter(e => e.kind === 'season-mvp').length, 1)
  assert.equal(events.filter(e => e.kind === 'season-gk').length, 1)
  assert(events.filter(e => e.kind.startsWith('season-')).every(e => e.competition === 'all'))
})

test('Records Timeline visibly renders every shared scorer and assister', () => {
  const ps = [player('visible-a'), player('visible-b', 'B')]
  const matches = [game('zero-ties', ps)]
  const h = screenHarness(root, 'screens/RecordsHistory.tsx', 'TimelineDetail', {})
  const tree = h.render({ season: 'S1', openBlock: null, onBlock() {}, onPlayerOpen() {}, players: ps, teams, matches, states: [] })
  for (const label of ['Golden Boot', 'Assist Leader']) {
    const fact = nodes(tree, n => n.props?.label === label)[0]
    for (const p of ps) assert(fact.props.value.includes(p.name))
  }
})

test('finalized Competition Awards display and navigate every co-winner; unfinished and empty scopes stay unpublished', () => {
  const ps = [player('winner-a'), player('winner-b', 'B')]
  const winners = ps.map(p => ({ playerId: p.id, teamId: p.teamId, label: 'League Golden Glove', value: 2 }))
  const destinations = []
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'CompetitionIndividualAwards', {})
  const result = { complete: true, individualAwards: { scorers: winners, assistLeaders: winners, goalkeepers: winners } }
  const props = { result, season: 'S1', type: 'league', players: ps, teams, onNavigate: view => destinations.push(view) }
  const tree = h.render(props)
  const buttons = nodes(tree, n => n.type === 'button')
  assert.equal(buttons.length, 6)
  for (const button of buttons) button.props.onClick()
  assert.deepEqual(destinations.map(d => d.id).sort(), ['winner-a', 'winner-a', 'winner-a', 'winner-b', 'winner-b', 'winner-b'])
  assert(destinations.every(d => d.season === 'S1' && d.competitionType === 'league'))
  assert.equal(h.render({ ...props, result: { ...result, complete: false } }), null)
  assert.equal(h.render({ ...props, result: undefined }), null)
  assert.equal(nodes(h.render({ ...props, result: { complete: true, individualAwards: { scorers: [], assistLeaders: [], goalkeepers: [] } } }), n => n.type === 'button').length, 0)
})

test('completed competitions still show unrestricted scorer/assist/GK winners when nobody meets MVP eligibility', () => {
  const { defaultScreenState } = require('../src/lib/navigation.ts')
  const p = player('short-sample', 'A', 'GK')
  const matches = [game('played', [p], { competitionType: 'cup', competitionStage: 'stage1' }), ...[2, 3, 4].map(i => game(`missed${i}`, [], { competitionType: 'cup', competitionStage: 'stage1' }))]
  const cup = { championId: 'A', runnerUpId: 'B', eliminatedAtByTeam: {}, activeTeamIds: ['A', 'B'], eliminatedTeamIds: [], stage: 'final' }
  const h = screenHarness(root, 'screens/CompetitionScreen.tsx', 'CompetitionBestElevens', { competitionStates: [] })
  const tree = h.render({ season: 'S1', type: 'cup', screenState: { ...defaultScreenState({ name: 'competition' }), bestXiMode: 'competition' }, onStateChange() {}, players: [p], teams, matches, allMatches: matches, cup, champions: null, onNavigate() {} })
  const awards = nodes(tree, n => n.type?.name === 'CompetitionIndividualAwards')[0]
  assert.equal(awards.props.result.complete, true)
  assert.deepEqual(ids(awards.props.result.individualAwards.scorers), [p.id])
})

test('Recap gives each co-winner a separate player navigation action', () => {
  const ps = [player('recap-a'), player('recap-b', 'B')]
  const matches = [game('recap', ps)]
  const destinations = []
  const h = screenHarness(root, 'screens/SeasonRecapScreen.tsx', 'SeasonRecapScreen', { players: ps, teams, matches, competitionStates: [{ kind: 'season-complete', season: 'S1' }] })
  const tree = h.render({ season: 'S1', onBack() {}, onNavigate: view => destinations.push(view) })
  const buttons = nodes(tree, n => n.type === 'button' && n.props['data-award-recipient'])
  assert(buttons.length >= 4)
  for (const button of buttons) button.props.onClick()
  assert(destinations.some(d => d.id === ps[0].id))
  assert(destinations.some(d => d.id === ps[1].id))
})
