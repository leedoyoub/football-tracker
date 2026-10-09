import { getSupabase, isCloudSyncEnabled } from './supabase'
import { openDB } from './db'
import { LocalRepository } from './repository'
import { validateState } from './validation'
import { deserializeCloudEntity } from './cloudMatch'
import type { AppState, CompetitionState, Match, Player, Team } from '../types'
import { sanitizeDraftLifecycle } from './draftLifecycle'
import { reconcileChampionsPairingIds } from '../engine/competition'
import {
  resolveCloudMerge,
  stateToCloudEntities,
  type CloudSyncMutation,
  type CloudSyncQueueItem,
  type CloudSyncRecord,
  type SyncEntityType,
} from './cloudSyncProtocol'

const QUEUE_STORE = 'sync_queue'
const META_STORE = 'sync_metadata'
export type SyncEntity = SyncEntityType
export type SyncItem = CloudSyncQueueItem & { timestamp: number; status: 'pending' | 'failed' }
export type SyncMetadata = {
  lastSyncedUserId: string | null
  lastSyncAt: number
  retryAt: number
  entityCloudRevision: Record<string, number>
  /** Read for compatibility with phase 2 metadata; no longer used for conflict resolution. */
  entityCloudUpdatedAt: Record<string, string>
  lastError?: string
}
export const TABLE_FOR: Record<SyncEntity, 'teams' | 'players' | 'matches' | 'competition_states'> = { team: 'teams', player: 'players', match: 'matches', competition: 'competition_states' }
const emptyMeta = (): SyncMetadata => ({ lastSyncedUserId: null, lastSyncAt: 0, retryAt: 0, entityCloudRevision: {}, entityCloudUpdatedAt: {} })
const key = (type: SyncEntity, id: string) => `${type}:${id}`
const entities = (state: AppState, type: SyncEntity): (Team | Player | Match | CompetitionState)[] => type === 'team' ? state.teams : type === 'player' ? state.players : type === 'match' ? state.matches : state.competitionStates ?? []
const emptyState = (): AppState => ({ teams: [], players: [], matches: [], competitionStates: [] })
const CLOUD_PAGE_SIZE = 500
const CLOUD_ENTITY_LIMIT = 100000
let retryTimer: ReturnType<typeof setTimeout> | undefined
let activeSync: Promise<{ status: 'local-only' | 'synced' | 'pending' | 'error'; message: string }> | undefined
let rerunRequested = false
let adapterSequence = 0
type StoreSnapshot = { revision: number; snapshot: AppState }
export type SyncStoreAdapter = { read: () => StoreSnapshot; apply: (expectedRevision: number, state: AppState) => Promise<boolean> }
let storeAdapter: SyncStoreAdapter | undefined

function scheduleRetry(delay: number) {
  if (retryTimer) return
  retryTimer = setTimeout(() => { retryTimer = undefined; void SyncManager.syncNow() }, delay)
}
function clearRetry() { if (retryTimer) { clearTimeout(retryTimer); retryTimer = undefined } }

async function allQueue(): Promise<SyncItem[]> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(QUEUE_STORE, 'readonly').objectStore(QUEUE_STORE).getAll(); req.onsuccess = () => resolve(req.result ?? []); req.onerror = () => reject(req.error) }) }
async function metadata(): Promise<SyncMetadata> { const db = await openDB(); return new Promise((resolve, reject) => { const req = db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get('meta'); req.onsuccess = () => resolve({ ...emptyMeta(), ...(req.result ?? {}), entityCloudRevision: (req.result?.entityCloudRevision ?? {}), entityCloudUpdatedAt: (req.result?.entityCloudUpdatedAt ?? {}) }); req.onerror = () => reject(req.error) }) }
async function putMetadata(value: SyncMetadata) { const db = await openDB(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(META_STORE, 'readwrite'); tx.objectStore(META_STORE).put(value, 'meta'); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
async function removeQueueItem(id: string) { const db = await openDB(); await new Promise<void>((resolve, reject) => { const tx = db.transaction(QUEUE_STORE, 'readwrite'); tx.objectStore(QUEUE_STORE).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) }) }
async function rebaseQueueItems(mutations: CloudSyncMutation[], oldRevision: number, newRevision: number) {
  if (!mutations.length) return
  const affected = new Set(mutations.map(mutation => key(mutation.entityType, mutation.entityId)))
  const rows = await allQueue()
  const changed = rows.filter(row => affected.has(key(row.entityType, row.entityId)) && row.baseRevision === oldRevision)
  if (!changed.length) return
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    for (const row of changed) tx.objectStore(QUEUE_STORE).put({ ...row, baseRevision: newRevision })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function allRows<T>(query: { range(from: number, to: number): PromiseLike<{ data: T[] | null; error: unknown }> }): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += CLOUD_PAGE_SIZE) {
    const to = Math.min(from + CLOUD_PAGE_SIZE - 1, CLOUD_ENTITY_LIMIT)
    const { data, error } = await query.range(from, to)
    if (error) throw error
    const page = data ?? []
    rows.push(...page)
    if (page.length < to - from + 1) return rows
    if (from >= CLOUD_ENTITY_LIMIT) break
  }
  throw new Error('Cloud sync row count exceeded the safe initialization limit.')
}

async function readLegacyEntities(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: string): Promise<CloudSyncRecord[]> {
  const [teams, players, matches, competitions] = await Promise.all([
    allRows<Team>(supabase.from('teams').select('*').eq('user_id', userId).order('id')),
    allRows<Player>(supabase.from('players').select('*').eq('user_id', userId).order('id')),
    allRows<Match>(supabase.from('matches').select('*').eq('user_id', userId).order('id')),
    allRows<CompetitionState>(supabase.from('competition_states').select('*').eq('user_id', userId).order('id')),
  ])
  const legacy = {
    teams: teams.map((row: Team) => deserializeCloudEntity(row)),
    players: players.map((row: Player) => deserializeCloudEntity(row)),
    matches: matches.map((row: Match) => deserializeCloudEntity(row)),
    competitionStates: competitions.map((row: CompetitionState) => deserializeCloudEntity(row)),
  }
  const normalized: AppState = {
    ...legacy,
    matches: reconcileChampionsPairingIds(legacy.matches, legacy.competitionStates),
  }
  if (!validateState(normalized)) throw new Error('Legacy cloud data failed validation; cloud bootstrap stopped without replacing local data.')
  return stateToCloudEntities(normalized).map(entity => ({ ...entity, revision: 0, deleted: false }))
}

async function readCloudRecords(supabase: NonNullable<ReturnType<typeof getSupabase>>, userId: string): Promise<{ revision: number; records: CloudSyncRecord[] }> {
  const stateResult = await supabase.from('cloud_sync_state').select('revision').eq('user_id', userId).maybeSingle()
  if (stateResult.error) throw stateResult.error
  if (!stateResult.data) {
    const legacy = await readLegacyEntities(supabase, userId)
    const { error } = await supabase.rpc('initialize_cloud_sync', { p_entities: legacy.map(({ entityType, entityId, payload }) => ({ entityType, entityId, payload })) })
    if (error) throw error
    const initialized = await supabase.from('cloud_sync_state').select('revision').eq('user_id', userId).maybeSingle()
    if (initialized.error) throw initialized.error
    if (!initialized.data) throw new Error('Cloud sync initialization did not create an account state.')
    return readCloudRecords(supabase, userId)
  }
  const entityRows = await allRows<{ entity_type: SyncEntity; entity_id: string; revision: number | string; deleted: boolean; payload: Team | Player | Match | CompetitionState | null }>(
    supabase.from('cloud_sync_entities').select('entity_type,entity_id,revision,deleted,payload').eq('user_id', userId).order('entity_type').order('entity_id'),
  )
  const records = entityRows.map((row: { entity_type: SyncEntity; entity_id: string; revision: number | string; deleted: boolean; payload: Team | Player | Match | CompetitionState | null }) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    revision: Number(row.revision),
    deleted: row.deleted,
    payload: row.payload,
  }))
  const revision = Number(stateResult.data.revision)
  if (!Number.isSafeInteger(revision) || revision < 0 || records.some(record => !Number.isSafeInteger(record.revision) || record.revision < 0 || record.revision > revision)) throw new Error('Cloud sync returned an invalid revision.')
  if (records.some(record => !['team', 'player', 'match', 'competition'].includes(record.entityType) || !record.entityId || (!record.deleted && (!record.payload || record.payload.id !== record.entityId)))) throw new Error('Cloud sync returned an invalid entity row.')
  return { revision, records }
}

async function currentLocal(): Promise<StoreSnapshot> {
  if (storeAdapter) return storeAdapter.read()
  const snapshot = await LocalRepository.getAppState()
  return { revision: 0, snapshot: snapshot ?? emptyState() }
}
async function applyLocal(expectedRevision: number, state: AppState): Promise<boolean> {
  if (storeAdapter) return storeAdapter.apply(expectedRevision, state)
  const current = await currentLocal()
  if (current.revision !== expectedRevision) return false
  await LocalRepository.saveAppState(state)
  return true
}
async function currentUserId(supabase: NonNullable<ReturnType<typeof getSupabase>>) {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data.user?.id ?? null
}

async function runSync(): Promise<{ status: 'local-only' | 'synced' | 'pending' | 'error'; message: string }> {
  if (!isCloudSyncEnabled) {
    clearRetry()
    return { status: 'local-only', message: 'Cloud Sync is disabled; local data is safe.' }
  }
  const supabase = getSupabase()
  if (!supabase || !navigator.onLine) { scheduleRetry(30000); return { status: 'local-only', message: 'Cloud unavailable; local data is safe.' } }
  let meta = emptyMeta()
  try {
    const userId = await currentUserId(supabase)
    if (!userId) return { status: 'local-only', message: 'Signed out; using local storage.' }
    meta = await metadata()
    if (meta.lastSyncedUserId && meta.lastSyncedUserId !== userId) return { status: 'pending', message: 'Account changed; local data was kept and cloud upload is paused.' }
    for (let attempt = 0; attempt < 5; attempt++) {
      const cloud = await readCloudRecords(supabase, userId)
      if (await currentUserId(supabase) !== userId) { rerunRequested = true; return { status: 'pending', message: 'Account changed during sync; local data was kept.' } }
      const local = await currentLocal()
      const queued = await allQueue()
      const merged = resolveCloudMerge(local.snapshot, cloud.records, queued, meta.entityCloudRevision)
      if (merged.blockedQueueIds.length) {
        const message = 'An offline change from an older app conflicts with cloud data. Local data and its sync queue were kept; export or review the local copy before continuing sync.'
        await putMetadata({ ...meta, retryAt: 0, lastError: message })
        return { status: 'pending', message }
      }
      const safeState = sanitizeDraftLifecycle({ ...merged.state, matches: reconcileChampionsPairingIds(merged.state.matches, merged.state.competitionStates) })
      if (!validateState(safeState)) throw new Error('Merged cloud data failed validation; sync stopped before local save or upload.')

      // Store state may change while IndexedDB or PostgREST calls are pending.
      // Recompute from the transaction coordinator before a cloud write.
      const latest = await currentLocal()
      if (latest.revision !== local.revision) continue
      const latestQueue = await allQueue()
      if (latestQueue.some(row => !queued.some(old => old.id === row.id))) continue
      if (await currentUserId(supabase) !== userId) { rerunRequested = true; return { status: 'pending', message: 'Account changed before cloud commit; local data was kept.' } }

      if (merged.mutations.length) {
        const { data, error } = await supabase.rpc('commit_cloud_sync', { p_expected_revision: cloud.revision, p_mutations: merged.mutations })
        if (error) throw error
        if (!data?.applied) continue
        if (await currentUserId(supabase) !== userId) { rerunRequested = true; return { status: 'pending', message: 'Account changed after cloud commit; local queue was kept for a later sync.' } }
        const nextRevision = Number(data.revision)
        if (!Number.isSafeInteger(nextRevision) || nextRevision < cloud.revision) throw new Error('Cloud sync returned an invalid committed revision.')
        for (const mutation of merged.mutations) meta.entityCloudRevision[key(mutation.entityType, mutation.entityId)] = nextRevision
        await putMetadata(meta)
        await rebaseQueueItems(merged.mutations, cloud.revision, nextRevision)
        continue
      }

      for (const record of cloud.records) meta.entityCloudRevision[key(record.entityType, record.entityId)] = record.revision
      if (await currentUserId(supabase) !== userId) { rerunRequested = true; return { status: 'pending', message: 'Account changed before local restore; local data was kept.' } }
      await putMetadata(meta)
      if (!await applyLocal(local.revision, safeState)) continue
      for (const id of merged.acknowledgedQueueIds) await removeQueueItem(id)
      const remaining = await allQueue()
      const finishedAt = Date.now()
      await putMetadata({ ...meta, lastSyncedUserId: userId, lastSyncAt: finishedAt, retryAt: 0, lastError: undefined })
      if (remaining.length) {
        rerunRequested = true
        continue
      }
      clearRetry()
      return { status: 'synced', message: 'Cloud backup is up to date.' }
    }
    scheduleRetry(1000)
    return { status: 'pending', message: 'Cloud changed repeatedly; sync will retry with the latest revision.' }
  } catch (error) {
    const delay = Math.min(300000, 5000 * 2 ** Math.min(6, (await allQueue().catch(() => [])).length))
    const message = error instanceof Error ? error.message : String(error)
    try { await putMetadata({ ...meta, retryAt: Date.now() + delay, lastError: message }) } catch { /* Preserve the durable queue even if retry metadata cannot be saved. */ }
    console.error('[Football Tracker sync] Cloud operation failed; queue retained for retry.', error)
    scheduleRetry(delay)
    return { status: 'pending', message: `Cloud sync pending: ${message}` }
  }
}

export function registerSyncStoreAdapter(adapter: SyncStoreAdapter): () => void {
  const registration = ++adapterSequence
  storeAdapter = adapter
  return () => { if (registration === adapterSequence) storeAdapter = undefined }
}

export const SyncManager = {
  async queueOperation(item: Omit<SyncItem, 'id' | 'timestamp' | 'status' | 'baseRevision'> & { baseRevision?: number }) {
    if (!isCloudSyncEnabled) return
    const existing = await allQueue()
    const prior = existing.find(row => row.entityType === item.entityType && row.entityId === item.entityId)
    const meta = await metadata()
    const db = await openDB()
    const now = Date.now()
    const tx = db.transaction(QUEUE_STORE, 'readwrite')
    const store = tx.objectStore(QUEUE_STORE)
    existing.filter(row => row.entityType === item.entityType && row.entityId === item.entityId).forEach(row => store.delete(row.id))
    const carriesUnknownLegacyBase = Boolean(prior && prior.baseRevision === undefined && item.intent !== 'import')
    const baseRevision = carriesUnknownLegacyBase
      ? undefined
      : item.intent === 'import'
        ? item.baseRevision ?? meta.entityCloudRevision[key(item.entityType, item.entityId)] ?? 0
        : prior?.baseRevision ?? item.baseRevision ?? meta.entityCloudRevision[key(item.entityType, item.entityId)] ?? 0
    store.put({ ...item, baseRevision, id: crypto.randomUUID(), timestamp: now, status: 'pending' } satisfies SyncItem)
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error) })
    if (activeSync) rerunRequested = true
  },
  async queueStateChange(previous: AppState, next: AppState, options?: { intent?: 'import' }) {
    if (!isCloudSyncEnabled) return
    for (const type of ['team', 'player', 'match', 'competition'] as const) {
      const before = new Map(entities(previous, type).map(entity => [entity.id, entity]))
      const after = new Map(entities(next, type).map(entity => [entity.id, entity]))
      for (const [id, entity] of after) if (options?.intent === 'import' || JSON.stringify(before.get(id)) !== JSON.stringify(entity)) await this.queueOperation({ entityType: type, entityId: id, operation: 'upsert', payload: entity, ...(options?.intent ? { intent: options.intent } : {}) })
      for (const id of before.keys()) if (!after.has(id)) await this.queueOperation({ entityType: type, entityId: id, operation: 'delete', ...(options?.intent ? { intent: options.intent } : {}) })
    }
  },
  syncNow(): Promise<{ status: 'local-only' | 'synced' | 'pending' | 'error'; message: string }> {
    if (activeSync) return activeSync
    activeSync = (async () => {
      try { return await runSync() }
      finally {
        activeSync = undefined
        if (rerunRequested) {
          rerunRequested = false
          queueMicrotask(() => { void SyncManager.syncNow() })
        }
      }
    })()
    return activeSync
  },
}
