const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { compactTeamCompetitionProgress, compactTeamCompetitionProgressMap, competitionSeasonStatus } = require('../src/engine/competition.ts')
const { LEAGUE_MATCHES_PER_TEAM } = require('../src/engine/leagueFormat.ts')

const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index}`, name: `Team ${index}`, shortName: `T${index}`, abbreviation: `T${index}`, visualStyle: 'solid', primaryColor: 'red', jerseyNumberColor: 'white' }))
const emptyChampions = { drawn: false, drawCount: 0, currentStage: 'roundOf16', rounds: { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] } }
const status = (overrides = {}) => ({
  league: { standings: teams.map((team, index) => ({ teamId: team.id, played: index === 0 ? 18 : 0 })) },
  cup: { stage: 'stage4', stageMatches: [{}], eliminatedTeamIds: [], eliminatedAtByTeam: {}, championId: undefined, runnerUpId: undefined },
  champions: emptyChampions,
  complete: false,
  ...overrides,
})

test('compact Teams progress uses the canonical 30-match league format and compact Cup labels', () => {
  assert.equal(LEAGUE_MATCHES_PER_TEAM, 30)
  assert.equal(compactTeamCompetitionProgress('T0', status()).league, '18/30')
  assert.equal(compactTeamCompetitionProgress('T1', status()).league, '0/30')
  assert.equal(compactTeamCompetitionProgress('T0', status({ cup: { stage: 'stage4', stageMatches: [{}], eliminatedTeamIds: [], eliminatedAtByTeam: {}, championId: undefined } })).cup, 'S4')
  assert.equal(compactTeamCompetitionProgress('T0', status({ cup: { stage: 'stage4', stageMatches: [{}], eliminatedTeamIds: ['T0'], eliminatedAtByTeam: { T0: 3 }, championId: undefined } })).cup, 'Out S3')
  assert.equal(compactTeamCompetitionProgress('T0', status({ cup: { stage: 'final', stageMatches: [{}], eliminatedTeamIds: [], eliminatedAtByTeam: {}, championId: undefined, runnerUpId: 'T0' } })).cup, 'Out F')
  assert.equal(compactTeamCompetitionProgress('T0', status({ cup: { stage: 'final', stageMatches: [{}], eliminatedTeamIds: [], eliminatedAtByTeam: {}, championId: 'T0' } })).cup, 'Champ')
  assert.equal(compactTeamCompetitionProgress('T0', status({ cup: { stage: 'stage1', stageMatches: [], eliminatedTeamIds: [], eliminatedAtByTeam: {}, championId: undefined } })).cup, 'NS')
})

test('compact Teams Champions progress uses own comparison-series matches, not pairing totals', () => {
  const season = 'Season 1'
  const draw = { id: `champions:${season}`, kind: 'champions-draw', season, teamIds: teams.map(team => team.id) }
  const game = (id, teamId, number) => ({ id, teamId, season, competitionType: 'champions', competitionStage: 'roundOf16', competitionPairingId: 'roundOf16:0', competitionSeriesGame: number, matchDay: number, date: `2026-01-0${number}`, duration: 90, homeTeamId: teamId, awayTeamId: `O${id}`, appearances: [], events: [] })
  const derived = competitionSeasonStatus(teams, [game('a1', 'T0', 1), game('b1', 'T1', 1), game('b2', 'T1', 2)], season, [], draw)
  const progress = compactTeamCompetitionProgressMap(teams.map(team => team.id), derived)
  assert.equal(progress.get('T0').champions, 'R16 2/3')
  assert.equal(progress.get('T1').champions, 'R16 3/3')
  assert.equal(progress.get('T2').champions, 'R16 1/3')
})

test('compact Teams Champions formatter handles final, elimination, champion, and not-started states', () => {
  const r16 = [{ id: 'p', teamIds: ['T0', 'T1'], requiredMatches: 3, matches: [], teamGames: { T0: [{}], T1: [{}, {}] } }]
  const active = status({ champions: { drawn: true, drawCount: 16, currentStage: 'semiFinal', rounds: { roundOf16: r16, quarterFinal: [], semiFinal: [{ id: 'sf', teamIds: ['T0', 'T1'], requiredMatches: 3, matches: [], teamGames: { T0: [{}], T1: [{}, {}] } }], final: [] } } })
  assert.equal(compactTeamCompetitionProgress('T0', active).champions, 'SF 2/3')
  const final = status({ champions: { drawn: true, drawCount: 16, currentStage: 'final', rounds: { roundOf16: r16, quarterFinal: [], semiFinal: [], final: [{ id: 'f', teamIds: ['T0', 'T1'], requiredMatches: 2, matches: [], teamGames: { T0: [{}], T1: [] } }] } } })
  assert.equal(compactTeamCompetitionProgress('T0', final).champions, 'F 2/2')
  assert.equal(compactTeamCompetitionProgress('T1', final).champions, 'F 1/2')
  const eliminated = status({ champions: { drawn: true, drawCount: 16, currentStage: 'quarterFinal', rounds: { roundOf16: [{ id: 'r16', teamIds: ['T0', 'T1'], requiredMatches: 3, matches: [], winnerId: 'T1' }], quarterFinal: [], semiFinal: [], final: [] } } })
  assert.equal(compactTeamCompetitionProgress('T0', eliminated).champions, 'Out R16')
  const quarterFinalLoss = status({ champions: { drawn: true, drawCount: 16, currentStage: 'semiFinal', rounds: { roundOf16: r16, quarterFinal: [{ id: 'qf', teamIds: ['T0', 'T1'], requiredMatches: 3, matches: [], winnerId: 'T1' }], semiFinal: [], final: [] } } })
  assert.equal(compactTeamCompetitionProgress('T0', quarterFinalLoss).champions, 'Out QF')
  const champion = status({ champions: { drawn: true, drawCount: 16, currentStage: 'final', championId: 'T0', rounds: { roundOf16: r16, quarterFinal: [], semiFinal: [], final: [] } } })
  assert.equal(compactTeamCompetitionProgress('T0', champion).champions, 'Champ')
})

test('Teams card structure keeps a four-column grid, separate valid controls, and compact front/back content', () => {
  const source = fs.readFileSync(require.resolve('../src/screens/TeamsScreen.tsx'), 'utf8')
  assert(source.includes('grid-cols-4') && source.includes('aspect-[0.82]'))
  assert(source.includes('teamAbbreviation(team)') && source.includes('<TeamIcon team={team}'))
  assert(source.includes('<dt className="text-zinc-400">League</dt>') && source.includes('>Cup</dt>') && source.includes('>UCL</dt>'))
  assert(source.includes('aria-label={`Open ${team.name}`}') && source.includes('aria-label={flipLabel}'))
  assert(source.includes('motion-reduce:transition-none') && source.includes('pointer-events-none'))
  assert(!source.includes('competitionHistory') && !source.includes('players.filter'))
})
