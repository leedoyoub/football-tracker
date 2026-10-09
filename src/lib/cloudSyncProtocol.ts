import type { AppState, CompetitionState, Match, Player, Team } from '../types'

export type SyncEntityType = 'team' | 'player' | 'match' | 'competition'
export type CloudSyncEntity = { entityType: SyncEntityType; entityId: string; payload: Team | Player | Match | CompetitionState }
export type CloudSyncRecord = { entityType: SyncEntityType; entityId: string; revision: number; deleted: boolean; payload: Team | Player | Match | CompetitionState | null }
export type CloudSyncQueueItem = { id: string; entityType: SyncEntityType; entityId: string; baseRevision?: number; operation: 'upsert' | 'delete'; payload?: Team | Player | Match | CompetitionState; intent?: 'import' }
export type CloudSyncMutation = { entityType: SyncEntityType; entityId: string; baseRevision: number; operation: 'upsert' | 'delete'; payload?: Team | Player | Match | CompetitionState; intent?: 'import' }

const key = (type: SyncEntityType, id: string) => `${type}:${id}`
const entityArrays = (state: AppState): Record<SyncEntityType, Array<Team | Player | Match | CompetitionState>> => ({
  team: state.teams,
  player: state.players,
  match: state.matches,
  competition: state.competitionStates ?? [],
})
const emptyState = (draftMatch?: Match): AppState => ({ teams: [], players: [], matches: [], competitionStates: [], ...(draftMatch ? { draftMatch } : {}) })

export function stateToCloudEntities(state: AppState): CloudSyncEntity[] {
  const arrays = entityArrays(state)
  return (Object.keys(arrays) as SyncEntityType[]).flatMap(entityType => arrays[entityType].map(payload => ({ entityType, entityId: payload.id, payload })))
}

export function cloudRecordsToState(records: CloudSyncRecord[]): AppState {
  const state = emptyState()
  for (const record of records) {
    if (record.deleted || !record.payload || record.entityId !== record.payload.id) continue
    if (record.entityType === 'team') state.teams.push(record.payload as Team)
    else if (record.entityType === 'player') state.players.push(record.payload as Player)
    else if (record.entityType === 'match') state.matches.push(record.payload as Match)
    else state.competitionStates?.push(record.payload as CompetitionState)
  }
  return state
}

export function resolveCloudMerge(
  local: AppState,
  records: CloudSyncRecord[],
  queue: CloudSyncQueueItem[],
  knownRevisions: Record<string, number>,
): { state: AppState; mutations: CloudSyncMutation[]; acknowledgedQueueIds: string[]; blockedQueueIds: string[] } {
  const arrays = entityArrays(local)
  const merged: Record<SyncEntityType, Map<string, Team | Player | Match | CompetitionState>> = {
    team: new Map(arrays.team.map(entity => [entity.id, entity])),
    player: new Map(arrays.player.map(entity => [entity.id, entity])),
    match: new Map(arrays.match.map(entity => [entity.id, entity])),
    competition: new Map(arrays.competition.map(entity => [entity.id, entity])),
  }
  const remote = new Map(records.map(record => [key(record.entityType, record.entityId), record]))
  const queued = new Map(queue.map(item => [key(item.entityType, item.entityId), item]))
  const all = new Set([...remote.keys(), ...queued.keys(), ...stateToCloudEntities(local).map(entity => key(entity.entityType, entity.entityId))])
  const mutations: CloudSyncMutation[] = []
  const acknowledgedQueueIds: string[] = []
  const blockedQueueIds: string[] = []

  for (const compound of all) {
    const separator = compound.indexOf(':')
    const entityType = compound.slice(0, separator) as SyncEntityType
    const entityId = compound.slice(separator + 1)
    const remoteRecord = remote.get(compound)
    const queuedItem = queued.get(compound)
    const localEntity = merged[entityType].get(entityId)
    const remoteRevision = remoteRecord?.revision ?? 0
    const expectedEntityRevision = queuedItem?.intent === 'import' ? remoteRevision : queuedItem?.baseRevision ?? 0

    // v2.5.3 queue rows have no baseRevision. If a ledger row already exists,
    // its intent cannot be safely ordered against another device's edit.
    // Keep the local snapshot and durable queue intact for explicit recovery.
    if (queuedItem && queuedItem.baseRevision === undefined && queuedItem.intent !== 'import' && remoteRecord) {
      const queuedPayload = localEntity ?? queuedItem.payload
      const alreadyMatches = queuedItem.operation === 'delete'
        ? remoteRecord.deleted
        : !remoteRecord.deleted && Boolean(queuedPayload) && JSON.stringify(queuedPayload) === JSON.stringify(remoteRecord.payload)
      if (alreadyMatches) acknowledgedQueueIds.push(queuedItem.id)
      else {
        blockedQueueIds.push(queuedItem.id)
        if (localEntity) merged[entityType].set(entityId, localEntity)
      }
      continue
    }

    if (remoteRecord?.deleted) {
      // A post-tombstone edit (for example an explicit Import) can restore the
      // same stable ID only when it was based on the current server revision.
      if (queuedItem?.operation === 'upsert' && expectedEntityRevision === remoteRevision) {
        const payload = localEntity ?? queuedItem.payload
        if (payload && payload.id === entityId) {
          merged[entityType].set(entityId, payload)
          mutations.push({ entityType, entityId, baseRevision: remoteRevision, operation: 'upsert', payload, ...(queuedItem.intent ? { intent: queuedItem.intent } : {}) })
          continue
        }
      }
      merged[entityType].delete(entityId)
      if (queuedItem) acknowledgedQueueIds.push(queuedItem.id)
      continue
    }

    if (queuedItem) {
      if (expectedEntityRevision !== remoteRevision) {
        if (remoteRecord?.payload) merged[entityType].set(entityId, remoteRecord.payload)
        else merged[entityType].delete(entityId)
        acknowledgedQueueIds.push(queuedItem.id)
        continue
      }
      if (queuedItem.operation === 'delete') {
        merged[entityType].delete(entityId)
        mutations.push({ entityType, entityId, baseRevision: remoteRevision, operation: 'delete', ...(queuedItem.intent ? { intent: queuedItem.intent } : {}) })
        continue
      }
      const payload = localEntity ?? queuedItem.payload
      if (!payload || payload.id !== entityId) {
        if (remoteRecord?.payload) merged[entityType].set(entityId, remoteRecord.payload)
        acknowledgedQueueIds.push(queuedItem.id)
        continue
      }
      merged[entityType].set(entityId, payload)
      if (!remoteRecord || JSON.stringify(remoteRecord.payload) !== JSON.stringify(payload)) mutations.push({ entityType, entityId, baseRevision: remoteRevision, operation: 'upsert', payload, ...(queuedItem.intent ? { intent: queuedItem.intent } : {}) })
      else acknowledgedQueueIds.push(queuedItem.id)
      continue
    }

    if (remoteRecord?.payload) {
      const acceptedRevision = knownRevisions[compound]
      const localIsKnownNewer = localEntity && acceptedRevision !== undefined && remoteRevision <= acceptedRevision
      if (localIsKnownNewer) {
        merged[entityType].set(entityId, localEntity)
        if (JSON.stringify(localEntity) !== JSON.stringify(remoteRecord.payload)) mutations.push({ entityType, entityId, baseRevision: remoteRevision, operation: 'upsert', payload: localEntity })
      } else {
        merged[entityType].set(entityId, remoteRecord.payload)
      }
    } else if (localEntity) {
      mutations.push({ entityType, entityId, baseRevision: 0, operation: 'upsert', payload: localEntity })
    }
  }

  return {
    state: {
      teams: [...merged.team.values()] as Team[],
      players: [...merged.player.values()] as Player[],
      matches: [...merged.match.values()] as Match[],
      competitionStates: [...merged.competition.values()] as CompetitionState[],
      ...(local.draftMatch ? { draftMatch: local.draftMatch } : {}),
    },
    mutations,
    acknowledgedQueueIds,
    blockedQueueIds,
  }
}
