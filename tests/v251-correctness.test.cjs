const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const { awardRaceCandidates } = require('../src/engine/awardRacePresentation.ts')
const { startedMonthlyAwardBlocks } = require('../src/engine/awardScopes.ts')
const { playerForm, seasonRecap } = require('../src/engine/seasonInsights.ts')
const { validateState } = require('../src/lib/validation.ts')
const { deriveNews } = require('../src/engine/news.ts')
const { currentMembershipPresentation } = require('../src/lib/currentMembershipPresentation.ts')
const { currentTeamIds } = require('../src/lib/roster.ts')
const { awardsForCompetition } = require('../src/engine/awards.ts')
const { liveGoalAssistCounts } = require('../src/screens/liveEventStats.ts')
const { defaultScreenState } = require('../src/lib/navigation.ts')
const { loadLastNavigationEntry, LAST_ROUTE_STORAGE_KEY } = require('../src/lib/lastRoute.ts')
const { auditDataIntegrity } = require('../src/engine/integrity.ts')

const game = (id, day, assignedDay = day) => ({ id, season: 'S1', competitionType: 'league', competitionStage: 'regular', matchDay: day, competitionAssignment: { competitionType: 'league', season: 'S1', teamId: 'A', stage: 'regular', matchDay: assignedDay, opponentTeamId: 'O' }, date: '2026-01-01', duration: 90, teamId: 'A', homeTeamId: 'A', awayTeamId: 'O', appearances: [], events: [] })

test('Award Race shows the highest official historical candidate once and labels its score', () => {
  const candidates = [
    { playerId: 'p', teamId: 'B', selectionScore: 8.5, average: 7.3 },
    { playerId: 'q', teamId: 'A', selectionScore: 8.2, average: 8.1 },
    { playerId: 'p', teamId: 'A', selectionScore: 7.7, average: 7.5 },
  ]
  const before = structuredClone(candidates)
  assert.deepEqual(awardRaceCandidates(candidates).map(row => [row.playerId, row.teamId]), [['p', 'B'], ['q', 'A']])
  assert.deepEqual(candidates, before)
})

test('monthly selector and Season Recap use frozen logical League slots', () => {
  const matches = [game('one', 4, 3), game('two', 4, 3), game('three', 7, 4)]
  assert.deepEqual(startedMonthlyAwardBlocks(matches, 'S1'), [1, 2])
  assert.equal(seasonRecap([], matches, 'S1').matchDays, 2)
  const withPlayer = { ...matches[0], appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'CM' }] }
  assert.equal(playerForm({ id: 'p', name: 'P', teamId: 'A', position: 'CM' }, [withPlayer]).ratings[0].matchDay, 3)
})

test('validation rejects contradictory modern membership and invalid references', () => {
  const state = { teams: [{ id: 'A', name: 'A' }], players: [{ id: 'p', name: 'P', teamId: 'A', teamIds: [] }], matches: [] }
  assert.equal(validateState(state), false)
  state.players[0] = { id: 'p', name: 'P', teamId: 'A', teamIds: ['A'] }
  assert.equal(validateState(state), true)
  assert.deepEqual(currentTeamIds(state.players[0]), ['A'])
  state.players[0] = { id: 'p', name: 'P', teamId: 'A' }
  assert.equal(validateState(state), true)
  assert.deepEqual(currentTeamIds(state.players[0]), ['A'])
  state.matches = [{ ...game('bad', 1), appearances: [{ playerId: 'missing', teamId: 'A', role: 'starter', position: 'CM' }] }]
  assert.equal(validateState(state), true, 'historical match facts keep a deleted player stable ID')
  state.matches[0].appearances[0].playerId = ''
  assert.equal(validateState(state), false, 'malformed player IDs remain rejected')
})

test('malformed nested import rows are rejected as data, without throwing', () => {
  const state = { teams: [{ id: 'A', name: 'A' }], players: [{ id: 'p', name: 'P', teamId: 'A' }], matches: [game('valid', 1)] }
  for (const changed of [
    { ...state, teams: [null] },
    { ...state, players: [null] },
    { ...state, matches: [null] },
    { ...state, matches: [{ ...state.matches[0], appearances: [null] }] },
    { ...state, matches: [{ ...state.matches[0], appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: 'CM', positionHistory: [null] }] }] },
    { ...state, matches: [{ ...state.matches[0], events: [null] }] },
    { ...state, competitionStates: [null] },
  ]) assert.equal(validateState(changed), false)
})

test('same-date Cup progress is anchored to the deciding recorded match', () => {
  const teams = Array.from({ length: 16 }, (_, i) => ({ id: `T${i}`, name: `Team ${i}`, shortName: `T${i}` }))
  const matches = teams.map((team, i) => ({ ...game(`cup-${i}`, 1), competitionType: 'cup', competitionStage: 'stage1', competitionAssignment: { competitionType: 'cup', season: 'S1', teamId: team.id, stage: 'stage1', matchDay: 1, opponentTeamId: 'O' }, teamId: team.id, homeTeamId: team.id, awayTeamId: 'O', recordedAt: i + 1, events: i >= 14 ? [{ id: `against-${i}`, type: 'goal', teamId: 'O', minute: 20 }] : [{ id: `for-${i}`, type: 'goal', teamId: team.id, minute: 20 }] }))
  const eliminations = deriveNews([], teams, matches, []).filter(item => item.id.startsWith('cup-eliminated:'))
  assert.equal(eliminations.length, 2)
  assert(eliminations.every(item => item.matchId === 'cup-15'))
})

test('same-date Champions independent series anchors elimination to its last row', () => {
  const teams = Array.from({ length: 16 }, (_, i) => ({ id: `T${i}`, name: `Team ${i}`, shortName: `T${i}` }))
  const draw = { id: 'draw', kind: 'champions-draw', season: 'S1', teamIds: teams.map(team => team.id) }
  const matches = Array.from({ length: 6 }, (_, i) => {
    const owner = i < 3 ? 'T0' : 'T1'
    const gameNumber = i % 3 + 1
    return { ...game(`series-${i}`, gameNumber), competitionType: 'champions', competitionStage: 'roundOf16', competitionPairingId: 'roundOf16:0', competitionSeriesGame: gameNumber, competitionAssignment: { competitionType: 'champions', season: 'S1', teamId: owner, stage: 'roundOf16', pairingId: 'roundOf16:0', seriesGame: gameNumber, matchDay: gameNumber, opponentTeamId: owner === 'T0' ? 'T1' : 'T0' }, teamId: owner, homeTeamId: owner, awayTeamId: owner === 'T0' ? 'T1' : 'T0', recordedAt: i + 1, events: owner === 'T0' ? [{ id: `winner-${i}`, type: 'goal', teamId: owner, minute: 20 }] : [] }
  })
  const eliminations = deriveNews([], teams, matches, [draw]).filter(item => item.id.startsWith('champions-eliminated:'))
  assert.equal(eliminations.length, 1)
  assert.equal(eliminations[0].matchId, 'series-5')
})

test('Rare Performance defender classification follows actual position segments and aliases', () => {
  for (const [initial, later] of [['CM', 'CB'], ['CB', 'CM'], ['CM', 'LCB'], ['CM', 'RCB'], ['CM', 'LWB'], ['CM', 'RWB']]) {
    const player = { id: 'p', name: 'P', teamId: 'A', position: initial }
    const match = { ...game(`roles-${initial}-${later}`, 1), appearances: [{ playerId: 'p', teamId: 'A', role: 'starter', position: initial, positionHistory: [{ minute: 60, position: later }] }], events: [10, 20].map((minute, i) => ({ id: `g${i}`, type: 'goal', teamId: 'A', playerId: 'p', minute })) }
    const rare = deriveNews([player], [{ id: 'A', name: 'A' }], [match], []).find(item => item.id.startsWith('rare:'))
    assert.match(rare?.title ?? '', /clean sheet/, `${initial} to ${later}`)
  }
})

test('multi-team current roster presentation respects the selected team without rewriting history', () => {
  const player = { teamId: 'A', teamIds: ['A', 'B'] }
  assert.deepEqual(currentMembershipPresentation(player, [], [{ id: 'A', shortName: 'A' }, { id: 'B', shortName: 'B' }]), { teamId: 'A', label: 'A +1' })
  assert.deepEqual(currentMembershipPresentation(player, ['B'], [{ id: 'A', shortName: 'A' }, { id: 'B', shortName: 'B' }]), { teamId: 'B', label: 'B' })
})

test('Goalkeeper Award requires enough actual GK role appearances', () => {
  const teams = [{ id: 'A', name: 'A', shortName: 'A' }]
  const players = [{ id: 'field', name: 'Field', teamId: 'A', position: 'CM' }, { id: 'keeper', name: 'Keeper', teamId: 'A', position: 'GK' }]
  const matches = Array.from({ length: 20 }, (_, i) => ({ ...game(`gk-${i}`, i + 1), date: `2026-01-${String(i + 1).padStart(2, '0')}`, appearances: [
    { playerId: 'field', teamId: 'A', role: 'starter', position: 'CM', ...(i === 19 ? { positionHistory: [{ minute: 60, position: 'GK' }] } : {}) },
    ...(i < 12 ? [{ playerId: 'keeper', teamId: 'A', role: 'starter', position: 'GK' }] : []),
  ], events: i === 19 ? [{ id: 'saves', type: 'save', teamId: 'A', playerId: 'field', minute: 80, count: 10 }] : [] }))
  const award = awardsForCompetition('league', 'S1', teams, players, matches, [])
  assert.equal(award.goalkeeper?.playerId, 'keeper')
})

test('live goal and assist preview excludes edited event and includes the pending goal', () => {
  const events = [{ id: 'one', type: 'goal', playerId: 'p', assistPlayerId: 'q' }, { id: 'editing', type: 'goal', playerId: 'q', assistPlayerId: 'p' }, { id: 'other', type: 'save', playerId: 'p' }]
  const counts = liveGoalAssistCounts(events, 'editing', 'q', 'p')
  assert.deepEqual(counts.get('p'), { goals: 1, assists: 1 })
  assert.deepEqual(counts.get('q'), { goals: 1, assists: 1 })
})

test('obsolete hidden filters are absent from default and restored navigation state', () => {
  const deadCompetition = ['positionFilter', 'viewAllMetric', 'compareMode', 'comparedPlayerIds', 'rankingTeamIds']
  const competition = defaultScreenState({ name: 'competition' })
  for (const key of deadCompetition) assert.equal(Object.hasOwn(competition, key), false, key)
  assert.equal(Object.hasOwn(defaultScreenState({ name: 'global-ranking' }), 'viewAll'), false)
  assert.equal(Object.hasOwn(defaultScreenState({ name: 'player', id: 'p', teamId: 'A' }), 'teamId'), false)
  const state = { teams: [{ id: 'A', name: 'A' }], players: [{ id: 'p', name: 'P' }], matches: [] }
  const storage = { getItem: key => key === LAST_ROUTE_STORAGE_KEY ? JSON.stringify({ version: 2, view: { name: 'competition' }, screenState: { ...competition, positionFilter: 'gk', viewAllMetric: 'goals', compareMode: true, comparedPlayerIds: ['p'], rankingTeamIds: ['A'] } }) : null }
  const restored = loadLastNavigationEntry(state, storage).screenState
  for (const key of deadCompetition) assert.equal(Object.hasOwn(restored, key), false, key)
})

test('integrity reports contradictory and duplicate current memberships without changing the player', () => {
  const player = { id: 'p', name: 'P', teamId: 'A', teamIds: ['B', 'B'] }
  const before = structuredClone(player)
  const report = auditDataIntegrity([], [player], [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }])
  assert(report.issues.some(issue => /teamId.*teamIds/.test(issue.message)))
  assert(report.issues.some(issue => /Duplicate current team/.test(issue.message)))
  assert.deepEqual(player, before)
})

test('import validation rejects malformed frozen slots and cross-team event references', () => {
  const state = { teams: [{ id: 'A', name: 'A' }], players: [{ id: 'p', name: 'P', teamId: 'A' }], matches: [game('fixture', 4, 3)] }
  assert.equal(validateState(state), true)
  state.matches[0].competitionAssignment.matchDay = 31
  assert.equal(validateState(state), false)
  state.matches[0].competitionAssignment.matchDay = 3
  state.matches[0].events = [{ id: 'bad', type: 'goal', teamId: 'O', minute: 20, playerId: 'p' }]
  assert.equal(validateState(state), false)
})
