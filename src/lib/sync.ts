import { supabase } from './supabase'
import { getFromIndexedDB, openDB } from './db'
import { LocalRepository } from './repository'
import { validateState } from './validation'
import type { AppState, Match, Player, Team } from '../types'

const DATA_KEY = 'football-tracker-v1'
const QUEUE_STORE = 'sync_queue'
const META_STORE = 'sync_metadata'
export type SyncEntity = 'team' | 'player' | 'match'
export type SyncItem = { id: string; entityType: SyncEntity; entityId: string; operation: 'upsert' | 'delete'; payload?: Team | Player | Match; timestamp: number; status: 'pending' | 'failed' }
export type SyncMetadata = { lastSyncedUserId: string | null; lastSyncAt: number; retryAt: number; entityUpdatedAt: Record<string, number>; lastError?: string }
export const TABLE_FOR: Record<SyncEntity, 'teams' | 'players' | 'matches'> = { team: 'teams', player: 'players', match: 'matches' }
const emptyMeta = (): SyncMetadata => ({ lastSyncedUserId: null, lastSyncAt: 0, retryAt: 0, entityUpdatedAt: {} })
const key = (type: SyncEntity, id: string) => `${type}:${id}`
const entities = (state: AppState, type: SyncEntity) => type === 'team' ? state.teams : type === 'player' ? state.players : state.matches
let retryTimer: ReturnType<typeof setTimeout> | undefined
function scheduleRetry(delay: number) {
  if (retryTimer) return
  retryTimer = setTimeout(() => { retryTimer = undefined; void SyncManager.syncNow() }, delay)
}

async function allQueue(): Promise<SyncItem[]> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll(); req.onsuccess = () => resolve(req.result ?? []); req.onerror = () => reject(req.error) }) }
async function metadata(): Promise<SyncMetadata> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get('meta'); req.onsuccess = () => resolve(req.result ?? emptyMeta()); req.onerror = () => reject(req.error) }) }
async function putMetadata(value: SyncMetadata) { const db = await openDB(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(META_STORE, 'readwrite'); tx.objectStore(META_STORE).put(value, 'meta'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
export const serializeCloudEntity = (entity: Team | Player | Match) => {
  if ('position' in entity && 'number' in entity) {
    const { externalPlayerId, photoUrl, ...player } = entity
    // Supabase uses snake_case columns; retain the app's camelCase shape locally.
    return { ...player, external_player_id: externalPlayerId === undefined ? null : String(externalPlayerId), photo_url: photoUrl ?? null }
  }
  return { ...entity }
}
export const deserializeCloudEntity = <T extends Team | Player | Match>(row: T & { user_id?: string; created_at?: string; updated_at?: string; external_player_id?: string | number | null; photo_url?: string | null }) => {
  const { user_id: _user, created_at: _created, updated_at: _updated, external_player_id, photo_url, ...entity } = row
  return { ...entity, ...(external_player_id === undefined || external_player_id === null ? {} : { externalPlayerId: external_player_id }), ...(photo_url === undefined || photo_url === null ? {} : { photoUrl: photo_url }) } as T
}

export const SyncManager = {
  async queueOperation(item: Omit<SyncItem, 'id' | 'timestamp' | 'status'>) {
    const existing = await allQueue(); const db = await openDB(); const now = Date.now(); const tx = db.transaction(QUEUE_STORE, 'readwrite'); const store = tx.objectStore(QUEUE_STORE)
    // Coalesce a pending entity into one latest, idempotent operation.
    existing.filter(row => row.entityType === item.entityType && row.entityId === item.entityId).forEach(row => store.delete(row.id))
    store.put({ ...item, id: crypto.randomUUID(), timestamp: now, status: 'pending' } satisfies SyncItem)
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    const meta = await metadata(); meta.entityUpdatedAt[key(item.entityType, item.entityId)] = now; await putMetadata(meta)
  },
  async queueStateChange(previous: AppState, next: AppState) {
    for (const type of ['team', 'player', 'match'] as const) {
      const before = new Map(entities(previous, type).map(entity => [entity.id, entity])); const after = new Map(entities(next, type).map(entity => [entity.id, entity]))
      for (const [id, entity] of after) if (JSON.stringify(before.get(id)) !== JSON.stringify(entity)) await this.queueOperation({ entityType: type, entityId: id, operation: 'upsert', payload: entity })
      for (const id of before.keys()) if (!after.has(id)) await this.queueOperation({ entityType: type, entityId: id, operation: 'delete' })
    }
  },
  async syncNow(): Promise<{ status: 'local-only' | 'synced' | 'pending' | 'error'; message: string }> {
    if (!supabase || !navigator.onLine) { scheduleRetry(30000); return { status: 'local-only', message: 'Cloud unavailable; local data is safe.' } }
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return { status: 'local-only', message: 'Signed out; using local storage.' }
    const local = await getFromIndexedDB(DATA_KEY); if (!local) return { status: 'error', message: 'No local state to sync.' }
    const meta = await metadata(); const pending = await allQueue(); const pendingKeys = new Set(pending.map(item => key(item.entityType, item.entityId)))
    // Never upload one account's durable local queue into a different account.
    if (meta.lastSyncedUserId && meta.lastSyncedUserId !== user.id) return { status: 'pending', message: 'Account changed; local data was kept and cloud upload is paused.' }
    try {
      const [teams, players, matches] = await Promise.all([supabase.from('teams').select('*'), supabase.from('players').select('*'), supabase.from('matches').select('*')])
      if (teams.error) throw teams.error; if (players.error) throw players.error; if (matches.error) throw matches.error
      const cloud: AppState = { teams: (teams.data ?? []).map(deserializeCloudEntity), players: (players.data ?? []).map(deserializeCloudEntity), matches: (matches.data ?? []).map(deserializeCloudEntity), draftMatch: local.draftMatch }
      const merge = <T extends { id: string }>(type: SyncEntity, localRows: T[], cloudRows: T[]) => {
        const out = new Map(localRows.map(row => [row.id, row])); for (const row of cloudRows) if (!pendingKeys.has(key(type, row.id))) out.set(row.id, row); return [...out.values()]
      }
      const merged: AppState = { teams: merge('team', local.teams, cloud.teams), players: merge('player', local.players, cloud.players), matches: merge('match', local.matches, cloud.matches), draftMatch: local.draftMatch }
      if (validateState(merged)) await LocalRepository.saveAppState(merged)
      // First sign-in / remote-empty safety: every local-only entity gets an upload.
      for (const type of ['team', 'player', 'match'] as const) { const remoteIds = new Set(entities(cloud, type).map(row => row.id)); for (const entity of entities(merged, type)) if (!remoteIds.has(entity.id) && !pendingKeys.has(key(type, entity.id))) await this.queueOperation({ entityType: type, entityId: entity.id, operation: 'upsert', payload: entity }) }
      for (const item of await allQueue()) {
        const table = TABLE_FOR[item.entityType]
        const result = item.operation === 'delete' ? await supabase.from(table).delete().eq('id', item.entityId).eq('user_id', user.id) : await supabase.from(table).upsert({ ...serializeCloudEntity(item.payload!), user_id: user.id })
        if (result.error) throw result.error
        const db = await openDB(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(QUEUE_STORE, 'readwrite'); tx.objectStore(QUEUE_STORE).delete(item.id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
      }
      await putMetadata({ ...meta, lastSyncedUserId: user.id, lastSyncAt: Date.now(), retryAt: 0, lastError: undefined }); return { status: 'synced', message: 'Cloud backup is up to date.' }
    } catch (error) { const delay = Math.min(300000, 5000 * 2 ** Math.min(6, pending.length)); const next = Date.now() + delay; const message = error instanceof Error ? error.message : String(error); console.error('[Football Tracker sync] Cloud operation failed; queue retained for retry.', error); await putMetadata({ ...meta, retryAt: next, lastError: message }); scheduleRetry(delay); return { status: 'pending', message: `Cloud sync pending: ${message}` } }
  },
}
