const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJS } }).outputText, filename)

const { playerForm } = require('../src/engine/playerForm.ts')
const { nextMilestones, careerNextMilestones } = require('../src/engine/nextMilestones.ts')
const { teamForm, teamMomentumDirection } = require('../src/engine/teamForm.ts')
const { playerRankTrend } = require('../src/engine/playerRankTrend.ts')
const { awardsForCompetition, competitionAwardResult } = require('../src/engine/awards.ts')
const { derivePlayerScope } = require('../src/engine/playerDerived.ts')
const { ratePlayerMatch } = require('../src/engine/rating.ts')
const { buildGlobalRankingData, rankGlobalRankingRows } = require('../src/engine/stats.ts')
const { scopedMetricRanks } = require('../src/engine/seasonAnalytics.ts')
const { scopedPositionFamilyByPlayer } = require('../src/engine/positionScope.ts')

const player = (id, teamId = 'A', position = 'ST') => ({ id, name: id, teamId, position, number: 9 })
const appearance = (id, teamId = 'A', position = 'ST') => ({ playerId: id, teamId, role: 'starter', position, matchPosition: position })
const match = (id, day, appearances = [], options = {}) => ({ id, season: options.season ?? 'S1', competitionType: options.competition ?? 'league', competitionStage: 'regular', matchDay: day, date: `2026-01-${String(day).padStart(2, '0')}`, duration: 90, homeTeamId: options.home ?? 'A', awayTeamId: options.away ?? 'B', teamId: options.recorded ?? 'A', appearances, events: options.events ?? [] })
const goal = (id, teamId, playerId) => ({ id, type: 'goal', minute: 20, teamId, playerId })

test('Player Form uses chronological actual appearances and raw ratings in the selected scope', () => {
  const rows = [
    { match: match('later', 5), rating: { raw: 8.25 } },
    { match: match('earlier', 1), rating: { raw: 7.25 } },
    { match: match('middle', 3), rating: { raw: 7.5 } },
  ]
  const form = playerForm(rows)
  assert.deepEqual(form.recent.map(row => row.match.id), ['later', 'middle', 'earlier'])
  assert.equal(form.count, 3)
  assert.equal(form.average, (8.25 + 7.5 + 7.25) / 3)
  assert.equal(form.delta, 0)
  assert.equal(playerForm([]).average, null)
})

test('Player Form excludes unused bench and other season or competition records', () => {
  const striker = player('a')
  const bench = { ...appearance('a'), role: 'bench' }
  const games = [
    match('league', 1, [appearance('a')]),
    match('unused', 2, [bench]),
    match('cup', 3, [appearance('a')], { competition: 'cup' }),
    match('old', 4, [appearance('a')], { season: 'S0' }),
  ]
  const scoped = derivePlayerScope(striker, [striker], games, { season: 'S1', competition: 'league' })
  const form = playerForm(scoped.appearances)
  assert.equal(form.count, 1)
  assert.equal(form.recent[0].match.id, 'league')
  assert.equal(form.average, ratePlayerMatch(games[0], striker).raw)
})

test('Player Form plots every selected-scope appearance from oldest to newest while Last 5 stays recent', () => {
  const striker = player('a')
  const league = Array.from({ length: 13 }, (_, index) => match(`league-${index + 1}`, index + 1, [appearance('a')]))
  const games = [...league, match('cup', 14, [appearance('a')], { competition: 'cup' }), match('old-season', 15, [appearance('a')], { season: 'S0' })]
  const scoped = derivePlayerScope(striker, [striker], games.slice().reverse(), { season: 'S1', competition: 'league' })
  const form = playerForm(scoped.appearances)
  assert.deepEqual(form.points.map(row => row.match.id), league.map(row => row.id))
  assert.deepEqual(form.recent.map(row => row.match.id), league.slice(-5).reverse().map(row => row.id))
  assert.equal(form.recentAverage, form.recent.reduce((sum, row) => sum + row.rating.raw, 0) / 5)
})

test('Career milestone targets advance past exact achievements and prioritize progress ratio', () => {
  const rows = nextMilestones({ apps: 96, goals: 50, assists: 8, mom: 0, cleanSheets: 0, saves: 0 }, false)
  assert.equal(rows[0].label, '100 Apps')
  assert.equal(rows[0].remaining, 4)
  assert(rows.some(row => row.label === '75 Goals' && row.remaining === 25))
  assert(rows.some(row => row.label === '10 Assists' && row.remaining === 2))
  assert.equal(rows.length, 3)
  assert.deepEqual(nextMilestones({ apps: 20, goals: 0, assists: 0, mom: 1, cleanSheets: 6, saves: 46 }, true).map(row => row.metric), ['saves', 'apps', 'cleanSheets'])
  assert.deepEqual(nextMilestones({ apps: 0, goals: 0, assists: 0, mom: 0, cleanSheets: 0, saves: 0 }, false), [])
})

test('Career milestones include every season even when a detail view has one selected season', () => {
  const striker = player('a')
  const games = [match('old', 1, [appearance('a')], { season: 'S0' }), match('new', 2, [appearance('a')], { season: 'S1' })]
  const rows = careerNextMilestones(striker, [striker], games)
  assert.equal(rows.find(row => row.metric === 'apps').current, 2)
})

test('Team Form uses recorded Champions perspective, chronology, and scoped season comparison', () => {
  const players = [player('a')]
  const games = [
    match('latest', 3, [appearance('a')], { home: 'B', away: 'A', recorded: 'A', events: [goal('g3', 'A', 'a')] }),
    match('foreign-champions', 2, [appearance('a', 'B')], { competition: 'champions', home: 'B', away: 'A', recorded: 'B', events: [goal('g2', 'B', 'a')] }),
    match('first', 1, [appearance('a')], { events: [goal('g1', 'B', 'opponent')] }),
    match('old-season', 4, [appearance('a')], { season: 'S0', events: [goal('g0', 'A', 'a')] }),
  ]
  const form = teamForm('A', players, games, 'S1', 'all')
  assert.deepEqual(form.recent.map(row => row.match.id), ['latest', 'first'])
  assert.deepEqual(form.recent.map(row => row.outcome), ['W', 'L'])
  assert.equal(form.season.goalsFor, .5)
  assert.equal(form.season.goalsAgainst, .5)
  assert.equal(teamForm('A', players, games, 'S1', 'champions').count, 0)
})

test('Team Form uses five latest actual results and rating averages from the rating engine', () => {
  const striker = player('a')
  const games = Array.from({ length: 6 }, (_, index) => match(`m${index + 1}`, index + 1, [appearance('a')], { events: index === 5 ? [goal('sixth-goal', 'A', 'a')] : [] }))
  const form = teamForm('A', [striker], games.slice().reverse(), 'S1', 'all')
  assert.equal(form.recent.length, 5)
  assert.deepEqual(form.recent.map(row => row.match.id), ['m6', 'm5', 'm4', 'm3', 'm2'])
  const expected = form.recent.reduce((sum, row) => sum + ratePlayerMatch(row.match, striker).raw, 0) / 5
  assert.equal(form.lastFive.rating, expected)
  assert.equal(form.delta.rating, form.lastFive.rating - form.season.rating)
})

test('Team momentum treats a fall in goals against as improvement', () => {
  assert.equal(teamMomentumDirection('goalsAgainst', -.4), 'better')
  assert.equal(teamMomentumDirection('goalsAgainst', .4), 'worse')
  assert.equal(teamMomentumDirection('rating', .4), 'better')
  assert.equal(teamMomentumDirection('goalsFor', 0), 'flat')
})

test('Rank Trend follows existing ranking and historical team after transfer', () => {
  const players = [player('target', 'B', 'LB'), player('rival', 'A', 'RB'), player('b-rival', 'B', 'LB')]
  const games = [
    match('first', 1, [appearance('target', 'A', 'LB'), appearance('rival', 'A', 'RB'), appearance('b-rival', 'B', 'LB')], { events: [goal('first-goal', 'A', 'target')] }),
    match('second', 2, [appearance('target', 'B', 'LB'), appearance('rival', 'A', 'RB'), appearance('b-rival', 'B', 'LB')], { home: 'B', away: 'A', recorded: 'B', events: [goal('target-goal', 'B', 'target')] }),
  ]
  const trend = playerRankTrend('target', players, games, 'S1', 'league')
  assert.equal(trend.length, 2)
  assert.deepEqual(trend.map(row => row.teamId), ['A', 'B'])
  assert.equal(trend[0].team, 1)
  assert.equal(trend.at(-1).team, 1)
  assert.equal(playerRankTrend('target', players, games.slice(0, 1), 'S1', 'league').length, 1)
})

test('Rank Trend gives a sole qualifying player the official first rank', () => {
  const lone = player('solo')
  const games = [match('first', 1, [appearance('solo')]), match('second', 2, [appearance('solo')])]
  const trend = playerRankTrend('solo', [lone], games, 'S1', 'league')
  assert.deepEqual(trend.map(row => [row.overall, row.position, row.team]), [[1, 1, 1], [1, 1, 1]])
})

test('Rank Trend uses canonical same-date order, position aliases, and selected competition', () => {
  const players = [player('target', 'A', 'LB'), player('rival', 'A', 'RB')]
  const games = [
    { ...match('later', 1, [appearance('target', 'A', 'LWB'), appearance('rival', 'A', 'RB')]), recordedAt: '2026-01-01T20:00:00Z' },
    { ...match('earlier', 1, [appearance('target', 'A', 'LB'), appearance('rival', 'A', 'RB')]), recordedAt: '2026-01-01T10:00:00Z' },
    match('cup', 2, [appearance('target', 'A', 'LB')], { competition: 'cup' }),
  ]
  const league = playerRankTrend('target', players, games, 'S1', 'league')
  assert.deepEqual(league.map(row => row.match.id), ['earlier', 'later'])
  assert.equal(league.at(-1).position, 1)
  assert.equal(playerRankTrend('target', players, games, 'S1', 'cup').length, 1)
  assert.equal(playerRankTrend('target', players, games, 'S1', 'all').length, 3)
})

test('Rank Trend final point matches the official rating and scoped team ranking engines', () => {
  const players = [player('target', 'B', 'LB'), player('rival', 'A', 'RB'), player('teammate', 'B', 'LB')]
  const games = [
    match('first', 1, [appearance('target', 'A', 'LB'), appearance('rival', 'A', 'RB'), appearance('teammate', 'B', 'LB')]),
    match('second', 2, [appearance('target', 'B', 'LB'), appearance('rival', 'A', 'RB'), appearance('teammate', 'B', 'LB')], { home: 'B', away: 'A', recorded: 'B', events: [goal('rival-goal', 'A', 'rival')] }),
  ]
  const last = playerRankTrend('target', players, games, 'S1', 'league').at(-1)
  const ranked = rankGlobalRankingRows(buildGlobalRankingData(players, games, { seasons: ['S1'], teams: [], positions: [] }, 'rating'), players, 'rating')
  const family = scopedPositionFamilyByPlayer(players, games, {})
  const official = scopedMetricRanks(ranked, players, 'target', family)
  const teamRanked = rankGlobalRankingRows(buildGlobalRankingData(players, games, { seasons: ['S1'], teams: ['B'], positions: [] }, 'rating'), players, 'rating')
  const officialTeam = scopedMetricRanks(teamRanked, players, 'target').team
  assert.deepEqual([last.overall, last.position, last.team], [official.overall, official.position, officialTeam])
})

test('Rank Trend extends the existing final-ten results to every actual appearance', () => {
  const target = player('target')
  const rival = player('rival')
  const league = Array.from({ length: 13 }, (_, index) => match(`league-${index + 1}`, index + 1, [appearance('target'), appearance('rival')], { events: index % 2 ? [goal(`g-${index}`, 'A', 'target')] : [] }))
  const games = [...league, match('other-cup', 14, [appearance('target')], { competition: 'cup' }), match('old-season', 15, [appearance('target')], { season: 'S0' })]
  const full = playerRankTrend('target', [target, rival], games.slice().reverse(), 'S1', 'league')
  const historicalPrefix = playerRankTrend('target', [target, rival], league.slice(0, 10), 'S1', 'league')
  assert.deepEqual(full.map(row => row.match.id), league.map(row => row.id))
  assert.deepEqual(full.slice(0, 10).map(row => [row.overall, row.position, row.team]), historicalPrefix.map(row => [row.overall, row.position, row.team]))
})

test('Award Race uses official provisional candidates and leaves final awards unchanged', () => {
  const players = [player('a')]
  const games = [match('one', 1, [appearance('a')], { events: [goal('g', 'A', 'a')] })]
  const teams = ['A', 'B'].map(id => ({ id, name: id, shortName: id, abbreviation: id, visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' }))
  const before = awardsForCompetition('league', 'S1', teams, players, games, [])
  const race = competitionAwardResult('league', 'S1', teams, players, games, [])
  const after = awardsForCompetition('league', 'S1', teams, players, games, [])
  assert.deepEqual(after, before)
  assert.deepEqual(race.candidates, before.candidates)
  assert.deepEqual(race.bestXI, before.bestXI)
  assert.equal(race.candidates[0].selectionScore, before.mvp.awardScore)
})
