// Run separately: node --test tests/audit/phase1-sync-risk-repros.test.cjs
// The phase-1 safety assertions are now regression tests for the revisioned protocol.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJS } }).outputText, filename)

const state = matches => ({ teams: [{ id: 'T', name: 'Team', shortName: 'TM', abbreviation: 'TM', visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' }], players: [], matches, competitionStates: [] })
const match = { id: 'M', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, homeTeamId: 'T', awayTeamId: 'O', teamId: 'T', appearances: [], events: [] }

function harness({ initial, legacyTeams = [], legacyMatches = [], initialRecords, initialRevision = 0, holdStateRead, conflictFirst = false, rpcFailure = false, userSequence } = {}) {
  const Module = require('node:module'); const originalLoad = Module._load
  const stores = { sync_queue: new Map(), sync_metadata: new Map([['meta', { lastSyncedUserId: 'u1', lastSyncAt: 1, retryAt: 0, entityCloudRevision: {}, entityCloudUpdatedAt: {} }]]) }
  const db = { transaction(name) { const values = stores[name]; let oncomplete; return { objectStore() { return {
    get(key) { const req = {}; queueMicrotask(() => { req.result = values.get(key); req.onsuccess?.() }); return req },
    getAll() { const req = {}; queueMicrotask(() => { req.result = [...values.values()]; req.onsuccess?.() }); return req },
    put(value, key) { values.set(key ?? value.id, value); queueMicrotask(() => oncomplete?.()) },
    delete(key) { values.delete(key); queueMicrotask(() => oncomplete?.()) },
  } }, get oncomplete() { return oncomplete }, set oncomplete(fn) { oncomplete = fn }, set onerror(_) {} } } }
  const remote = { initialized: Boolean(initialRecords), revision: initialRevision, records: initialRecords ?? [] }
  const commits = []
  let stateReadStarted = false
  let stateReadCount = 0
  let userReadCount = 0
  let conflictUsed = false
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userSequence?.[userReadCount++] ?? 'u1' } }, error: null }) },
    from: table => {
      let start = 0; let end = Number.MAX_SAFE_INTEGER
      const query = {
        select() { return this },
        eq() { return this },
        order() { return this },
        range(from, to) { start = from; end = to; return this },
        async maybeSingle() {
          if (table === 'cloud_sync_state') {
            stateReadCount++
            stateReadStarted = true
            if (holdStateRead) await holdStateRead
            return { data: remote.initialized ? { revision: remote.revision } : null, error: null }
          }
          return { data: null, error: null }
        },
        then(resolve, reject) {
          const result = table === 'cloud_sync_entities'
            ? { data: remote.records.map(record => ({ entity_type: record.entityType, entity_id: record.entityId, revision: record.revision, deleted: record.deleted, payload: record.payload })), error: null }
            : { data: table === 'teams' ? legacyTeams : table === 'matches' ? legacyMatches : [], error: null }
          return Promise.resolve({ ...result, data: result.data.slice(start, end + 1) }).then(resolve, reject)
        },
      }
      return query
    },
    rpc: async (name, args) => {
      if (name === 'initialize_cloud_sync') {
        if (!remote.initialized) {
          remote.initialized = true
          remote.revision = 0
          remote.records = args.p_entities.map(entity => ({ ...entity, revision: remote.revision, deleted: false }))
        }
        return { data: { initialized: remote.revision > 0, revision: remote.revision }, error: null }
      }
      if (name === 'commit_cloud_sync') {
        commits.push(args)
        if (rpcFailure) return { data: null, error: new Error('simulated commit failure') }
        if (conflictFirst && !conflictUsed) {
          conflictUsed = true
          remote.revision++
          remote.records.push({ entityType: 'player', entityId: 'P2', revision: remote.revision, deleted: false, payload: { id: 'P2', teamId: 'T', teamIds: ['T'], name: 'Cloud player', position: 'CM', number: 8 } })
          return { data: { applied: false, revision: remote.revision }, error: null }
        }
        if (args.p_expected_revision !== remote.revision) return { data: { applied: false, revision: remote.revision }, error: null }
        if (args.p_mutations.length) {
          remote.revision++
          for (const mutation of args.p_mutations) {
            const record = { entityType: mutation.entityType, entityId: mutation.entityId, revision: remote.revision, deleted: mutation.operation === 'delete', payload: mutation.operation === 'delete' ? null : mutation.payload }
            const index = remote.records.findIndex(row => row.entityType === record.entityType && row.entityId === record.entityId)
            if (index < 0) remote.records.push(record)
            else remote.records[index] = record
          }
        }
        return { data: { applied: true, revision: remote.revision }, error: null }
      }
      return { data: null, error: new Error(`Unexpected RPC ${name}`) }
    },
  }
  const entries = { 'football-tracker-v1': JSON.stringify(initial) }
  if (!initial) delete entries['football-tracker-v1']
  const priorStorage = global.localStorage; const priorNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  global.localStorage = { getItem: key => entries[key] ?? null, setItem: (key, value) => { entries[key] = value }, removeItem: key => { delete entries[key] } }
  Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true })
  Module._load = function(request, parent, isMain) { if (request === './db') return { openDB: async () => db, saveToIndexedDB: async () => {}, getFromIndexedDB: async () => null }; if (request === './supabase') return { isCloudSyncEnabled: true, getSupabase: () => supabase }; return originalLoad.call(this, request, parent, isMain) }
  for (const file of ['../../src/lib/sync.ts', '../../src/lib/repository.ts', '../../src/lib/db.ts']) delete require.cache[require.resolve(file)]
  const { SyncManager } = require('../../src/lib/sync.ts')
  const { registerSyncStoreAdapter } = require('../../src/lib/sync.ts')
  return { SyncManager, registerSyncStoreAdapter, entries, stores, remote, commits, get stateReadStarted() { return stateReadStarted }, get stateReadCount() { return stateReadCount }, restore() { Module._load = originalLoad; global.localStorage = priorStorage; if (priorNavigator) Object.defineProperty(global, 'navigator', priorNavigator); else delete global.navigator } }
}

test('cloud tombstones prevent an old device from restoring a deleted match', async () => {
  const h = harness({ initial: state([match]), initialRevision: 4, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 4, deleted: false, payload: state([]).teams[0] },
    { entityType: 'match', entityId: 'M', revision: 4, deleted: true, payload: null },
  ] })
  try {
    const result = await h.SyncManager.syncNow()
    assert.equal(result.status, 'synced')
    assert.equal(JSON.parse(h.entries['football-tracker-v1']).matches.length, 0)
    assert.equal(h.commits.flatMap(call => call.p_mutations).some(item => item.entityType === 'match' && item.entityId === 'M' && item.operation === 'upsert'), false)
  } finally { h.restore() }
})

test('a match saved while cloud reads are pending survives the CAS merge', async () => {
  let release; const held = new Promise(resolve => { release = resolve })
  const h = harness({ initial: state([]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ], holdStateRead: held })
  try {
    const syncing = h.SyncManager.syncNow()
    while (!h.stateReadStarted) await new Promise(resolve => setImmediate(resolve))
    h.entries['football-tracker-v1'] = JSON.stringify(state([match]))
    release()
    await syncing
    assert.deepEqual(JSON.parse(h.entries['football-tracker-v1']).matches.map(row => row.id), ['M'])
    assert.ok(h.remote.records.some(row => row.entityType === 'match' && row.entityId === 'M' && !row.deleted))
  } finally { release(); h.restore() }
})

test('a fresh device atomically bootstraps and restores the complete legacy cloud history', async () => {
  const h = harness({ initial: null, legacyTeams: state([]).teams, legacyMatches: [match] })
  try {
    const result = await h.SyncManager.syncNow()
    assert.equal(result.status, 'synced')
    const restored = JSON.parse(h.entries['football-tracker-v1'])
    assert.deepEqual(restored.matches.map(row => row.id), ['M'])
    assert.deepEqual(restored.teams.map(row => row.id), ['T'])
    assert.ok(h.remote.records.some(row => row.entityType === 'match' && row.entityId === 'M'))
  } finally { h.restore() }
})

test('overlapping StrictMode sync calls share one read and one durable result', async () => {
  let release; const held = new Promise(resolve => { release = resolve })
  const h = harness({ initial: state([]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ], holdStateRead: held })
  try {
    const first = h.SyncManager.syncNow()
    while (!h.stateReadStarted) await new Promise(resolve => setImmediate(resolve))
    const second = h.SyncManager.syncNow()
    assert.equal(first, second)
    release()
    assert.equal((await first).status, 'synced')
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.stateReadCount, 1)
  } finally { release(); h.restore() }
})

test('CAS conflict re-reads cloud state and keeps an unrelated local and cloud edit', async () => {
  const h = harness({ initial: state([match]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ], conflictFirst: true })
  h.stores.sync_queue.set('q-match', { id: 'q-match', entityType: 'match', entityId: 'M', baseRevision: 0, operation: 'upsert', payload: match, timestamp: 1, status: 'pending' })
  try {
    assert.equal((await h.SyncManager.syncNow()).status, 'synced')
    const local = JSON.parse(h.entries['football-tracker-v1'])
    assert.deepEqual(local.matches.map(row => row.id), ['M'])
    assert.deepEqual(local.players.map(row => row.id), ['P2'])
    assert.ok(h.remote.records.some(row => row.entityType === 'match' && row.entityId === 'M' && !row.deleted))
  } finally { h.restore() }
})

test('failed server commit reports pending and retains the durable queue', async () => {
  const priorTimeout = global.setTimeout
  const priorError = console.error
  global.setTimeout = () => 0
  console.error = () => {}
  const h = harness({ initial: state([match]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ], rpcFailure: true })
  h.stores.sync_queue.set('q-match', { id: 'q-match', entityType: 'match', entityId: 'M', baseRevision: 0, operation: 'upsert', payload: match, timestamp: 1, status: 'pending' })
  try {
    const result = await h.SyncManager.syncNow()
    assert.equal(result.status, 'pending')
    assert.equal(h.stores.sync_queue.has('q-match'), true)
  } finally { h.restore(); global.setTimeout = priorTimeout; console.error = priorError }
})

test('an account switch during a delayed cloud read prevents commit and local restore', async () => {
  let release; const held = new Promise(resolve => { release = resolve })
  const h = harness({ initial: state([]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ], holdStateRead: held, userSequence: ['u1', 'u2', 'u2', 'u2'] })
  try {
    const syncing = h.SyncManager.syncNow()
    while (!h.stateReadStarted) await new Promise(resolve => setImmediate(resolve))
    release()
    const result = await syncing
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(result.status, 'pending')
    assert.equal(h.commits.length, 0)
    assert.deepEqual(JSON.parse(h.entries['football-tracker-v1']).teams, state([]).teams)
  } finally { release(); h.restore() }
})

test('the Store transaction adapter remains the publisher through StrictMode setup and cleanup', async () => {
  const h = harness({ initial: state([]), initialRevision: 4, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 4, deleted: false, payload: { ...state([]).teams[0], name: 'Cloud latest' } },
  ] })
  let snapshot = state([]); let revision = 0; let applied = 0
  const adapter = {
    read: () => ({ revision, snapshot }),
    apply: async (expectedRevision, value) => {
      if (expectedRevision !== revision) return false
      snapshot = value; revision++; applied++
      return true
    },
  }
  const cleanupFirst = h.registerSyncStoreAdapter(adapter)
  const cleanupSecond = h.registerSyncStoreAdapter(adapter)
  try {
    cleanupFirst()
    assert.equal((await h.SyncManager.syncNow()).status, 'synced')
    assert.equal(snapshot.teams[0].name, 'Cloud latest')
    assert.equal(applied, 1)
  } finally { cleanupSecond(); h.restore() }
})

test('a cloud merge persistence failure stays pending and the next sync durably retries the latest memory snapshot', async () => {
  const priorTimeout = global.setTimeout
  global.setTimeout = () => 0
  const h = harness({ initial: state([]), initialRevision: 4, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 4, deleted: false, payload: { ...state([]).teams[0], name: 'Cloud latest' } },
  ] })
  let memory = state([]); let durable = state([]); let revision = 0; let failFirstWrite = true
  const cleanup = h.registerSyncStoreAdapter({
    read: () => ({ revision, snapshot: memory }),
    apply: async (expected, next) => {
      if (expected !== revision) return false
      memory = next; revision++
      if (failFirstWrite) { failFirstWrite = false; throw new Error('simulated primary save failure') }
      durable = next
      return true
    },
  })
  const originalError = console.error
  console.error = () => {}
  try {
    assert.equal((await h.SyncManager.syncNow()).status, 'pending')
    assert.equal(memory.teams[0].name, 'Cloud latest')
    assert.equal(durable.teams[0].name, 'Team')
    assert.equal((await h.SyncManager.syncNow()).status, 'synced')
    assert.equal(durable.teams[0].name, 'Cloud latest')
  } finally { cleanup(); console.error = originalError; global.setTimeout = priorTimeout; h.restore() }
})

test('a process restart reuses the durable queue and server revision metadata', async () => {
  const h = harness({ initial: state([match]), initialRevision: 1, initialRecords: [
    { entityType: 'team', entityId: 'T', revision: 1, deleted: false, payload: state([]).teams[0] },
  ] })
  h.stores.sync_queue.set('q-restart', { id: 'q-restart', entityType: 'match', entityId: 'M', baseRevision: 0, operation: 'upsert', payload: match, timestamp: 1, status: 'pending' })
  try {
    delete require.cache[require.resolve('../../src/lib/sync.ts')]
    const { SyncManager: relaunchedSync } = require('../../src/lib/sync.ts')
    assert.equal((await relaunchedSync.syncNow()).status, 'synced')
    assert.ok(h.remote.records.some(row => row.entityType === 'match' && row.entityId === 'M' && !row.deleted))
    assert.equal(h.stores.sync_queue.size, 0)
  } finally { h.restore() }
})

test('an Import queues the full replacement state and rebases coalesced rows to the latest accepted revision', async () => {
  const imported = state([])
  const h = harness({ initial: imported })
  h.stores.sync_metadata.get('meta').entityCloudRevision['team:T'] = 9
  h.stores.sync_queue.set('q-old', { id: 'q-old', entityType: 'team', entityId: 'T', baseRevision: 4, operation: 'upsert', payload: imported.teams[0], timestamp: 1, status: 'pending' })
  try {
    await h.SyncManager.queueStateChange(imported, imported, { intent: 'import' })
    const rows = [...h.stores.sync_queue.values()]
    assert.equal(rows.length, 1)
    assert.equal(rows[0].baseRevision, 9)
    assert.equal(rows[0].intent, 'import')
    assert.equal(rows[0].operation, 'upsert')
  } finally { h.restore() }
})

test('a fresh device restores rows across multiple PostgREST pagination pages', async () => {
  const teams = Array.from({ length: 501 }, (_, index) => ({ id: `T${index}`, name: `Team ${index}`, shortName: `T${index}`, abbreviation: `T${index}`, visualStyle: 'solid', primaryColor: 'blue', jerseyNumberColor: 'white' }))
  const h = harness({ initial: { teams: [], players: [], matches: [], competitionStates: [] }, initialRevision: 1, initialRecords: teams.map(payload => ({ entityType: 'team', entityId: payload.id, revision: 1, deleted: false, payload })) })
  try {
    assert.equal((await h.SyncManager.syncNow()).status, 'synced')
    assert.equal(JSON.parse(h.entries['football-tracker-v1']).teams.length, 501)
  } finally { h.restore() }
})
