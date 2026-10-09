const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)

const sampleMatch = {
  id: 'M1', recordedAt: 1767484800000, season: 'S1', matchDay: 4, date: '2026-01-04T00:00:00.000Z', duration: 90,
  formation: '4-3-3', homeAway: 'home', homeTeamId: 'T1', awayTeamId: 'T2', teamId: 'T1', opponentName: 'Away', manOfMatchPlayerId: 'P1',
  halftimeOpponentSot: 2, fulltimeOpponentSot: 5, fulltimeOpponentSotAutoLinked: true,
  competitionType: 'cup', competitionStage: 'final', competitionPairingId: 'final:0', competitionSeriesGame: 2,
  competitionAssignment: { competitionType: 'cup', season: 'S1', teamId: 'T1', stage: 'final', pairingId: 'final:0', seriesGame: 2, opponentTeamId: 'T2', matchDay: 4 },
  appearances: [{ playerId: 'P1', teamId: 'T1', position: 'ST', matchPosition: 'ST', positionHistory: [{ minute: 72, position: 'CAM', sequence: 2, tacticalSlotId: 'CAM', sourceSubstitutionIds: ['S1'] }], kickoffX: 53, kickoffY: 20, x: 52, y: 18, role: 'starter' }],
  events: [
    { id: 'G1', type: 'goal', minute: 83, sequence: 4, teamId: 'T1', playerId: 'P1', assistPlayerId: 'P2', goalType: 'wonder', concededGoalCausePlayerId: 'P3' },
    { id: 'SV1', type: 'save', minute: 61, sequence: 3, teamId: 'T1', playerId: 'P4', count: 2 },
    { id: 'S1', type: 'sub', minute: 72, sequence: 2, teamId: 'T1', playerOutId: 'P5', playerInId: 'P1', position: 'CAM', tacticalSlotId: 'CAM' },
  ],
  kickoffLineup: [{ id: 'ST', matchPosition: 'ST', ratingPosition: 'ST', displayPosition: 'ST', playerId: 'P1', x: 53, y: 20 }],
}
const sampleState = () => ({
  teams: [{ id: 'T1', name: 'Team', shortName: 'TM', abbreviation: 'TM', logo: 'team-logo', externalTeamId: 123, visualStyle: 'striped', primaryColor: 'blue', secondaryColor: 'white', jerseyNumberColor: 'black' }],
  players: [{ id: 'P1', teamId: 'T1', teamIds: ['T1'], name: 'Player', fullName: 'Player One', displayName: 'One', position: 'ST', number: 9, externalPlayerId: 42, photoUrl: 'https://example.test/p.png', image: 'data:image/png;base64,a' }],
  matches: [sampleMatch],
  competitionStates: [{ id: 'C1', season: 'S1', kind: 'champions-draw', teamIds: ['T1', 'T2'] }],
  draftMatch: { ...sampleMatch, id: 'draft' },
})

test('cloud entity round-trip preserves every persisted record field and excludes the local-only draft', () => {
  const { stateToCloudEntities, cloudRecordsToState } = require('../src/lib/cloudSyncProtocol.ts')
  const source = sampleState()
  const records = stateToCloudEntities(source).map(entity => ({ ...entity, revision: 1, deleted: false }))
  const restored = cloudRecordsToState(records)
  assert.deepEqual(restored.teams, source.teams)
  assert.deepEqual(restored.players, source.players)
  assert.deepEqual(restored.matches, source.matches)
  assert.deepEqual(restored.competitionStates, source.competitionStates)
  assert.equal('draftMatch' in restored, false)
})

test('a server tombstone defeats an older queued upsert and is not re-uploaded', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const local = { teams: [], players: [], matches: [sampleMatch], competitionStates: [] }
  const result = resolveCloudMerge(local, [{ entityType: 'match', entityId: 'M1', revision: 9, deleted: true }], [
    { id: 'q-old', entityType: 'match', entityId: 'M1', baseRevision: 4, operation: 'upsert', payload: sampleMatch },
  ], { 'match:M1': 4 })
  assert.deepEqual(result.state.matches, [])
  assert.deepEqual(result.mutations, [])
  assert.deepEqual(result.acknowledgedQueueIds, ['q-old'])
})

test('an explicit edit based on the current tombstone revision can restore the imported stable ID', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const importedMatch = { ...sampleMatch, id: 'M1', opponentName: 'Imported opponent' }
  const result = resolveCloudMerge({ teams: [], players: [], matches: [importedMatch], competitionStates: [] }, [
    { entityType: 'match', entityId: 'M1', revision: 9, deleted: true },
  ], [{ id: 'q-import', entityType: 'match', entityId: 'M1', baseRevision: 4, operation: 'upsert', payload: importedMatch, intent: 'import' }], { 'match:M1': 4 })
  assert.deepEqual(result.state.matches, [importedMatch])
  assert.equal(result.mutations[0].operation, 'upsert')
  assert.equal(result.mutations[0].baseRevision, 9)
})

test('a local edit is sent only against its base entity revision while an unrelated cloud edit is restored', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const local = { teams: [], players: [{ id: 'P1', teamId: 'T', name: 'Local edit', position: 'ST', number: 9 }], matches: [], competitionStates: [] }
  const remotePlayer = { id: 'P1', teamId: 'T', name: 'Server edit', position: 'ST', number: 9 }
  const remoteMatch = { ...sampleMatch, id: 'M2' }
  const result = resolveCloudMerge(local, [
    { entityType: 'player', entityId: 'P1', revision: 7, deleted: false, payload: remotePlayer },
    { entityType: 'match', entityId: 'M2', revision: 6, deleted: false, payload: remoteMatch },
  ], [
    { id: 'q-player', entityType: 'player', entityId: 'P1', baseRevision: 5, operation: 'upsert', payload: local.players[0] },
  ], { 'player:P1': 5 })
  assert.deepEqual(result.state.players, [remotePlayer])
  assert.deepEqual(result.state.matches.map(match => match.id), ['M2'])
  assert.deepEqual(result.mutations, [])
  assert.deepEqual(result.acknowledgedQueueIds, ['q-player'])
})

test('a v2.5.3 offline queue without baseRevision is preserved when cloud has a conflicting row', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const localMatch = { ...sampleMatch, id: 'M1', opponentName: 'Offline edit' }
  const cloudMatch = { ...sampleMatch, id: 'M1', opponentName: 'Another device edit' }
  const result = resolveCloudMerge(
    { teams: [], players: [], matches: [localMatch], competitionStates: [] },
    [{ entityType: 'match', entityId: 'M1', revision: 8, deleted: false, payload: cloudMatch }],
    [{ id: 'v253-offline', entityType: 'match', entityId: 'M1', operation: 'upsert', payload: localMatch }],
    {},
  )
  assert.deepEqual(result.state.matches, [localMatch])
  assert.deepEqual(result.mutations, [])
  assert.deepEqual(result.acknowledgedQueueIds, [])
  assert.deepEqual(result.blockedQueueIds, ['v253-offline'])
})

test('a v2.5.3 queued value already equal to cloud can be acknowledged safely', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const result = resolveCloudMerge(
    { teams: [], players: [], matches: [sampleMatch], competitionStates: [] },
    [{ entityType: 'match', entityId: 'M1', revision: 8, deleted: false, payload: sampleMatch }],
    [{ id: 'v253-already-synced', entityType: 'match', entityId: 'M1', operation: 'upsert', payload: sampleMatch }],
    {},
  )
  assert.deepEqual(result.mutations, [])
  assert.deepEqual(result.acknowledgedQueueIds, ['v253-already-synced'])
  assert.deepEqual(result.blockedQueueIds, [])
})
