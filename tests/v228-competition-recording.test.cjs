const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { competitionAssignment, competitionMutationSafety, reconcileSeasonCompletionMarkers } = require('../src/engine/competition.ts')
const { getNextMatchDayForTeam } = require('../src/engine/match.ts')
const { freezeCompetitionAssignment, formatCompetitionContext, formatCompactCompetitionContext, assignmentSnapshotForMatch } = require('../src/engine/competitionContext.ts')
const { serializeCloudEntity, deserializeCloudEntity } = require('../src/lib/cloudMatch.ts')
const { playerSeasonStats } = require('../src/engine/stats.ts')

const season = 'Season 1'
const teams = Array.from({ length: 16 }, (_, index) => ({ id: `T${index + 1}`, name: `Team ${index + 1}`, shortName: `T${index + 1}` }))
const players = [{ id: 'P1', name: 'Player 1', displayName: 'Player 1', position: 'ST', number: 9, teamId: 'T1' }]
const draw = { id: `champions:${season}`, season, kind: 'champions-draw', teamIds: teams.map(team => team.id) }
const game = (id, overrides = {}) => ({ id, season, competitionType: 'champions', competitionStage: 'roundOf16', competitionPairingId: 'roundOf16:0', competitionSeriesGame: 1, matchDay: 1, date: '2026-09-18', duration: 90, teamId: 'T1', homeTeamId: 'T1', awayTeamId: `opponent:${id}`, appearances: [], events: [], ...overrides })

test('v2.2.8 freezes an accepted Champions slot and formats the frozen context without raw ids', () => {
  const snapshot = freezeCompetitionAssignment({ competitionType: 'champions', season, teamId: 'T1', stage: 'roundOf16', pairingId: 'roundOf16:0', seriesGame: 2, opponentTeamId: 'T2', matchDay: 2 })
  const restored = assignmentSnapshotForMatch({ ...game('frozen'), competitionAssignment: snapshot, competitionStage: 'quarterFinal', competitionPairingId: 'quarterFinal:0', competitionSeriesGame: 1 })
  assert.deepEqual(restored, snapshot)
  assert.equal(formatCompetitionContext(snapshot), 'Season 1 · Champions · Round of 16 · Game 2/3')
  assert.equal(formatCompactCompetitionContext(snapshot), 'R16 · G2/3')
})

test('v2.2.8 keeps Cup stage availability and message truthful using player-aware canonical inputs', () => {
  const assignment = competitionAssignment('cup', season, 'T1', teams, [], undefined, players)
  assert.equal(assignment.available, true)
  assert.equal(assignment.message, 'Stage 1 · Ready to play')
  assert.equal(assignment.stage, 'stage1')
})

test('v2.2.8 scopes next match number to the requested season and competition', () => {
  const oldLeague = { ...game('old', { season: 'Season 4', competitionType: 'league', competitionStage: 'regular', matchDay: 30 }) }
  const targetCup = { ...game('cup', { season: 'Season 3', competitionType: 'cup', competitionStage: 'stage2', matchDay: 2 }) }
  assert.deepEqual(getNextMatchDayForTeam('T1', [oldLeague, targetCup], [], 'cup', 'Season 3'), { season: 'Season 3', matchDay: 3 })
  assert.deepEqual(getNextMatchDayForTeam('T1', [oldLeague, targetCup], [], 'league', 'Season 3'), { season: 'Season 3', matchDay: 1 })
})

test('v2.2.8 assigns Champions game 1 through 3 but fails closed on duplicate, gap, and out-of-range rows', () => {
  assert.equal(competitionAssignment('champions', season, 'T1', teams, [], draw, players).seriesGame, 1)
  assert.equal(competitionAssignment('champions', season, 'T1', teams, [game('one')], draw, players).seriesGame, 2)
  assert.equal(competitionAssignment('champions', season, 'T1', teams, [game('one'), game('two', { competitionSeriesGame: 2 })], draw, players).seriesGame, 3)
  for (const corrupt of [
    [game('a'), game('b')],
    [game('a'), game('b', { competitionSeriesGame: 3 })],
    [game('a', { competitionSeriesGame: 4 })],
  ]) {
    const assignment = competitionAssignment('champions', season, 'T1', teams, corrupt, draw, players)
    assert.equal(assignment.available, false)
    assert.match(assignment.message, /data-integrity/i)
  }
})

test('v2.2.8 serializes and restores frozen series-game identity through the cloud boundary', () => {
  const snapshot = freezeCompetitionAssignment({ competitionType: 'champions', season, teamId: 'T1', stage: 'final', pairingId: 'final:0', seriesGame: 2, opponentTeamId: 'T2', matchDay: 2 })
  const match = { ...game('cloud', { competitionStage: 'final', competitionPairingId: 'final:0', competitionSeriesGame: 2 }), competitionAssignment: snapshot }
  const roundTrip = deserializeCloudEntity(serializeCloudEntity(match))
  assert.equal(roundTrip.competitionSeriesGame, 2)
  assert.deepEqual(roundTrip.competitionAssignment, snapshot)
})

test('v2.2.8 blocks only edits that would invalidate already-recorded Cup or Champions downstream rounds', () => {
  const cupStageOne = teams.map((team, index) => game(`cup-stage-one-${team.id}`, { competitionType: 'cup', competitionStage: 'stage1', competitionSeriesGame: undefined, competitionPairingId: undefined, homeTeamId: team.id, teamId: team.id, awayTeamId: `opponent:${team.id}`, events: Array.from({ length: 16 - index }, (_, goal) => ({ id: `${team.id}:${goal}`, type: 'goal', minute: goal + 1, teamId: team.id })) }))
  const cupMatches = [...cupStageOne, game('cup-later', { competitionType: 'cup', competitionStage: 'stage2', competitionSeriesGame: undefined, competitionPairingId: undefined, homeTeamId: 'T1', teamId: 'T1' })]
  assert.equal(competitionMutationSafety(cupMatches, cupMatches[0], { ...cupMatches[0], opponentName: 'Corrected opponent label' }, teams, players, undefined).safe, true)
  assert.equal(competitionMutationSafety(cupMatches, cupMatches[0], undefined, teams, players, undefined).safe, false)
  const championsMatches = [game('r16'), game('qf', { competitionStage: 'quarterFinal', competitionPairingId: 'quarterFinal:0' })]
  assert.equal(competitionMutationSafety(championsMatches, championsMatches[0], undefined, teams, players, draw).safe, false)
})

test('v2.2.8 removes only stale season-complete markers after a tournament mutation', () => {
  const markers = [{ id: 'complete:Season 1', season, kind: 'season-complete', teamIds: [] }]
  assert.deepEqual(reconcileSeasonCompletionMarkers(markers, teams, [], players), [])
})

test('v2.2.8 Cup Final audit keeps the one-match rule and proves the direct opponent has no independently recorded player facts', () => {
  const finalPlayers = [players[0], { id: 'P2', name: 'Player 2', displayName: 'Player 2', position: 'ST', number: 10, teamId: 'T2' }]
  const final = game('cup-final-audit', { competitionType: 'cup', competitionStage: 'final', competitionSeriesGame: undefined, competitionPairingId: undefined, awayTeamId: 'T2', appearances: [{ playerId: 'P1', teamId: 'T1', role: 'starter', position: 'ST', minuteIn: 0, minuteOut: 90 }], events: [{ id: 'P1-goal', type: 'goal', minute: 10, teamId: 'T1', playerId: 'P1' }] })
  assert.equal(playerSeasonStats(finalPlayers[0], finalPlayers, [final], season, 'T1', 'cup').goals, 1)
  assert.equal(playerSeasonStats(finalPlayers[1], finalPlayers, [final], season, 'T2', 'cup').matches, 0)
})
