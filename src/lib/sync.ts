import { getSupabase } from './supabase'
import { openDB } from './db'
import { LocalRepository } from './repository'
import { validateState } from './validation'
import { deserializeCloudEntity, serializeCloudEntity } from './cloudMatch'
import type { AppState, CompetitionState, Match, Player, Team } from '../types'

const QUEUE_STORE = 'sync_queue'
const META_STORE = 'sync_metadata'
export type SyncEntity = 'team' | 'player' | 'match' | 'competition'
export type SyncItem = { id: string; entityType: SyncEntity; entityId: string; operation: 'upsert' | 'delete'; payload?: Team | Player | Match | CompetitionState; timestamp: number; status: 'pending' | 'failed' }
export type SyncMetadata = { lastSyncedUserId: string | null; lastSyncAt: number; retryAt: number; entityUpdatedAt: Record<string, number>; entityCloudUpdatedAt: Record<string, string>; lastError?: string }
export const TABLE_FOR: Record<SyncEntity, 'teams' | 'players' | 'matches' | 'competition_states'> = { team: 'teams', player: 'players', match: 'matches', competition: 'competition_states' }
const emptyMeta = (): SyncMetadata => ({ lastSyncedUserId: null, lastSyncAt: 0, retryAt: 0, entityUpdatedAt: {}, entityCloudUpdatedAt: {} })
const key = (type: SyncEntity, id: string) => `${type}:${id}`
const entities = (state: AppState, type: SyncEntity): (Team | Player | Match | CompetitionState)[] => type === 'team' ? state.teams : type === 'player' ? state.players : type === 'match' ? state.matches : state.competitionStates ?? []
let retryTimer: ReturnType<typeof setTimeout> | undefined
function scheduleRetry(delay: number) {
  if (retryTimer) return
  retryTimer = setTimeout(() => { retryTimer = undefined; void SyncManager.syncNow() }, delay)
}

async function allQueue(): Promise<SyncItem[]> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll(); req.onsuccess = () => resolve(req.result ?? []); req.onerror = () => reject(req.error) }) }
async function metadata(): Promise<SyncMetadata> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get('meta'); req.onsuccess = () => resolve({ ...emptyMeta(), ...(req.result ?? {}), entityUpdatedAt: (req.result?.entityUpdatedAt ?? {}), entityCloudUpdatedAt: (req.result?.entityCloudUpdatedAt ?? {}) }); req.onerror = () => reject(req.error) }) }
async function putMetadata(value: SyncMetadata) { const db = await openDB(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(META_STORE, 'readwrite'); tx.objectStore(META_STORE).put(value, 'meta'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
type CloudRow<T> = { entity: T; updatedAt?: string }
const durableTimestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : undefined
const isNewer = (candidate: string | undefined, baseline: string | undefined) => !!candidate && !!baseline && Date.parse(candidate) > Date.parse(baseline)

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
    for (const type of ['team', 'player', 'match', 'competition'] as const) {
      const before = new Map(entities(previous, type).map(entity => [entity.id, entity])); const after = new Map(entities(next, type).map(entity => [entity.id, entity]))
      for (const [id, entity] of after) if (JSON.stringify(before.get(id)) !== JSON.stringify(entity)) await this.queueOperation({ entityType: type, entityId: id, operation: 'upsert', payload: entity })
      for (const id of before.keys()) if (!after.has(id)) await this.queueOperation({ entityType: type, entityId: id, operation: 'delete' })
    }
  },
  async syncNow(): Promise<{ status: 'local-only' | 'synced' | 'pending' | 'error'; message: string }> {
    const supabase = getSupabase()
    if (!supabase || !navigator.onLine) { scheduleRetry(30000); return { status: 'local-only', message: 'Cloud unavailable; local data is safe.' } }
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return { status: 'local-only', message: 'Signed out; using local storage.' }
    // The verified localStorage primary is the authority. IndexedDB is only a
    // mirror and may be stale after an iOS/PWA teardown, so it must never be
    // used as the source for a merge which writes back over the primary.
    const local = await LocalRepository.getAppState(); if (!local) return { status: 'error', message: 'No local state to sync.' }
    const meta = await metadata(); const pending = await allQueue(); const pendingKeys = new Set(pending.map(item => key(item.entityType, item.entityId)))
    // Never upload one account's durable local queue into a different account.
    if (meta.lastSyncedUserId && meta.lastSyncedUserId !== user.id) return { status: 'pending', message: 'Account changed; local data was kept and cloud upload is paused.' }
    try {
      const [teams, players, matches, competitions] = await Promise.all([supabase.from('teams').select('*'), supabase.from('players').select('*'), supabase.from('matches').select('*'), supabase.from('competition_states').select('*')])
      if (teams.error) throw teams.error; if (players.error) throw players.error; if (matches.error) throw matches.error; if (competitions.error) throw competitions.error
      const cloudRows = <T extends Team | Player | Match | CompetitionState>(rows: T[]) => rows.map(row => ({ entity: deserializeCloudEntity(row), updatedAt: durableTimestamp((row as { updated_at?: unknown }).updated_at) }))
      const cloud = { teams: cloudRows(teams.data ?? []), players: cloudRows(players.data ?? []), matches: cloudRows(matches.data ?? []), competitionStates: cloudRows(competitions.data ?? []) as CloudRow<CompetitionState>[] }
      const merge = <T extends { id: string }>(type: SyncEntity, localRows: T[], remoteRows: CloudRow<T>[]) => {
        const out = new Map(localRows.map(row => [row.id, row]))
        for (const remote of remoteRows) {
          const localRow = out.get(remote.entity.id); const entityKey = key(type, remote.entity.id)
          if (!localRow) {
            if (!pendingKeys.has(entityKey)) {
              out.set(remote.entity.id, remote.entity)
              if (remote.updatedAt) meta.entityCloudUpdatedAt[entityKey] = remote.updatedAt
            }
            continue
          }
          // A queued device mutation is authoritative until it has reached the
          // server. Otherwise use the server-issued timestamp compared with
          // the last cloud version this device accepted. Missing legacy
          // metadata deliberately remains local-first.
          const cloudWon = !pendingKeys.has(entityKey) && isNewer(remote.updatedAt, meta.entityCloudUpdatedAt[entityKey])
          if (cloudWon) out.set(remote.entity.id, remote.entity)
          if (remote.updatedAt && (cloudWon || JSON.stringify(localRow) === JSON.stringify(remote.entity))) meta.entityCloudUpdatedAt[entityKey] = remote.updatedAt
        }
        return [...out.values()]
      }
      const merged: AppState = { teams: merge('team', local.teams, cloud.teams), players: merge('player', local.players, cloud.players), matches: merge('match', local.matches, cloud.matches), competitionStates: merge('competition', local.competitionStates ?? [], cloud.competitionStates ?? []), draftMatch: local.draftMatch }
      if (validateState(merged)) await LocalRepository.saveAppState(merged)
      // First sign-in / remote-empty safety: every local-only entity gets an upload.
      for (const type of ['team', 'player', 'match', 'competition'] as const) {
        const remoteRows = type === 'team' ? cloud.teams : type === 'player' ? cloud.players : type === 'match' ? cloud.matches : cloud.competitionStates
        const remoteById = new Map(remoteRows.map(row => [row.entity.id, row.entity]))
        for (const entity of entities(merged, type)) {
          const remote = remoteById.get(entity.id)
          // Queue local winners as well as cloud-missing rows. This repairs
          // legacy installations that predate the cloud watermark.
          if ((!remote || JSON.stringify(remote) !== JSON.stringify(entity)) && !pendingKeys.has(key(type, entity.id))) await this.queueOperation({ entityType: type, entityId: entity.id, operation: 'upsert', payload: entity })
        }
      }
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
