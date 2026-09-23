const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { APP_VERSION } = require('../src/config.ts')
const { RATING_ENGINE_REVISION } = require('../src/engine/ratingRevision.ts')
const { teamCompetitionOverview } = require('../src/engine/competition.ts')
const { deriveNews } = require('../src/engine/news.ts')

const season = 'Season 1'
const teams = Array.from({ length: 16 }, (_, index) => ({ id: `t${index}`, name: `Team ${index}`, shortName: `T${index}` }))
const draw = { id: `champions:${season}`, kind: 'champions-draw', season, teamIds: teams.map(team => team.id) }
const game = (id, teamId, type, stage, pair, seriesGame, ours = 1, theirs = 0) => ({ id, teamId, season, matchDay: seriesGame, date: `2026-0${Math.min(seriesGame, 9)}-01`, duration: 90, homeTeamId: teamId, awayTeamId: `opponent:${id}`, competitionType: type, competitionStage: stage, competitionPairingId: pair, competitionSeriesGame: seriesGame, appearances: [], events: [...Array.from({ length: ours }, (_, index) => ({ id: `${id}:for:${index}`, type: 'goal', minute: index + 1, teamId })), ...Array.from({ length: theirs }, (_, index) => ({ id: `${id}:against:${index}`, type: 'goal', minute: index + 50, teamId: `opponent:${id}` }))] })
const series = (teamIds, stage, required = 3) => teamIds.flatMap(([left, right], index) => [...Array.from({ length: required }, (_, gameNumber) => game(`${stage}:${index}:${left}:${gameNumber}`, left, 'champions', stage, `${stage}:${index}`, gameNumber + 1, 1, 0)), ...Array.from({ length: required }, (_, gameNumber) => game(`${stage}:${index}:${right}:${gameNumber}`, right, 'champions', stage, `${stage}:${index}`, gameNumber + 1, 0, 1))])

test('v2.1.9 Team Detail summary uses canonical League data in the required order', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/TeamDetailScreen.tsx'), 'utf8')
  assert(source.includes('teamCompetitionOverview(teamId, teams, matches, activeSeason, players, competitionStates)'))
  assert(source.includes("['Rank'"))
  assert(source.indexOf("['Rank'") < source.indexOf("['W-D-L'") && source.indexOf("['W-D-L'") < source.indexOf("['GF-GA'") && source.indexOf("['GF-GA'") < source.indexOf("['Pts'"))
  assert(!source.includes("['Matches', recent.length]"))
  assert(!source.includes('const record = recent.reduce'))
  assert(source.includes('col-span-3') && source.includes('overview.champions.goalsFor') && source.includes('overview.cup.goalsFor'))
})

test('Champions progress uses own series games, waits at a completed round, and reports elimination without a game number', () => {
  const otherTeamGames = [game('other-1', 't1', 'champions', 'roundOf16', 'roundOf16:0', 1), game('other-2', 't1', 'champions', 'roundOf16', 'roundOf16:0', 2)]
  assert.equal(teamCompetitionOverview('t0', teams, otherTeamGames, season, [], [draw]).champions.status, 'Round of 16 · Game 1/3')
  for (const count of [1, 2]) {
    const own = Array.from({ length: count }, (_, index) => game(`own-${index}`, 't0', 'champions', 'roundOf16', 'roundOf16:0', index + 1))
    assert.equal(teamCompetitionOverview('t0', teams, own, season, [], [draw]).champions.status, `Round of 16 · Game ${count + 1}/3`)
  }
  const completeOwn = Array.from({ length: 3 }, (_, index) => game(`complete-${index}`, 't0', 'champions', 'roundOf16', 'roundOf16:0', index + 1))
  assert.equal(teamCompetitionOverview('t0', teams, completeOwn, season, [], [draw]).champions.status, 'Round of 16 · 3/3 Played')
  const eliminated = [...Array.from({ length: 3 }, (_, index) => game(`lost-${index}`, 't0', 'champions', 'roundOf16', 'roundOf16:0', index + 1, 0, 1)), ...Array.from({ length: 3 }, (_, index) => game(`won-${index}`, 't1', 'champions', 'roundOf16', 'roundOf16:0', index + 1, 1, 0))]
  assert.equal(teamCompetitionOverview('t0', teams, eliminated, season, [], [draw]).champions.status, 'Eliminated · Round of 16')
})

test('Champions Final uses its two-game format and competition GF-GA stays independently scoped', () => {
  const r16 = series([['t0', 't1'], ['t2', 't3'], ['t4', 't5'], ['t6', 't7'], ['t8', 't9'], ['t10', 't11'], ['t12', 't13'], ['t14', 't15']], 'roundOf16')
  const qf = series([['t0', 't2'], ['t4', 't6'], ['t8', 't10'], ['t12', 't14']], 'quarterFinal')
  const semi = series([['t0', 't4'], ['t8', 't12']], 'semiFinal')
  const finalOne = game('final-one', 't0', 'champions', 'final', 'final:0', 1, 2, 1)
  const finalTwo = game('final-two', 't0', 'champions', 'final', 'final:0', 2, 2, 1)
  assert.equal(teamCompetitionOverview('t0', teams, [...r16, ...qf, ...semi], season, [], [draw]).champions.status, 'Final · Game 1/2')
  assert.equal(teamCompetitionOverview('t0', teams, [...r16, ...qf, ...semi, finalOne], season, [], [draw]).champions.status, 'Final · Game 2/2')
  assert.equal(teamCompetitionOverview('t0', teams, [...r16, ...qf, ...semi, finalOne, finalTwo], season, [], [draw]).champions.status, 'Final · 2/2 Played')
  assert.equal(teamCompetitionOverview('t0', teams, [...r16, ...qf, ...semi, ...series([['t0', 't8']], 'final', 2)], season, [], [draw]).champions.status, 'Champion')
  const cup = game('cup', 't0', 'cup', 'stage1', undefined, undefined, 9, 5)
  const overview = teamCompetitionOverview('t0', teams, [...r16, ...qf, ...semi, finalOne, cup], season, [], [draw])
  assert.equal(`${overview.champions.goalsFor}-${overview.champions.goalsAgainst}`, '11-1')
  assert.equal(`${overview.cup.goalsFor}-${overview.cup.goalsAgainst}`, '9-5')
})

test('Home keeps stable source arrays for ranking and reuses News for immutable inputs', () => {
  const home = fs.readFileSync(require.resolve('../src/screens/HomeScreen.tsx'), 'utf8')
  assert(home.includes('const seasonMatches = useMemo(() => matches.filter(match => match.season === season)'))
  assert(home.includes('buildGlobalRankingData(players, seasonMatches, { seasons: [season]'))
  const players = [{ id: 'p', name: 'Player', displayName: 'Player', position: 'ST', number: 9, teamId: 't0' }]
  const matches = [game('news', 't0', 'league', 'regular', undefined, 1)]
  const states = [draw]
  assert.strictEqual(deriveNews(players, teams, matches, states), deriveNews(players, teams, matches, states))
  assert.notStrictEqual(deriveNews(players, teams, [...matches], states), deriveNews(players, teams, matches, states))
})

test('v2.2.1 version is consistent and rating revision advances once', () => {
  assert.equal(APP_VERSION, '2.3.3')
  assert.equal(require('../package.json').version, '2.3.3')
  assert.equal(require('../package-lock.json').version, '2.3.3')
  assert.equal(RATING_ENGINE_REVISION, 10)
})
