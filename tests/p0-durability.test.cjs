const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const state = ids => ({ teams: [{ id: 'a', name: 'Alpha' }], players: [], matches: ids.map(id => ({ id, appearances: [], events: [] })), competitionStates: [] })
const memoryStorage = (entries, failWrites = false) => ({ getItem: key => entries[key] ?? null, setItem: (key, value) => { if (failWrites) throw new Error('quota'); entries[key] = value }, removeItem: key => { delete entries[key] } })

test('verified primary save survives a fresh repository launch even when IndexedDB is unavailable', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  const entries = { 'football-tracker-v1': JSON.stringify(state(['A', 'B', 'C'])) }
  global.localStorage = memoryStorage(entries); delete global.indexedDB
  const { LocalRepository, STORAGE_KEY } = require('../src/lib/repository.ts')
  try {
    const result = await LocalRepository.saveAppState(state(['A', 'B', 'C', 'D']))
    assert.equal(result.primarySaved, true); assert.equal(result.mirrorSaved, false)
    assert.deepEqual(JSON.parse(entries[STORAGE_KEY]).matches.map(match => match.id), ['A', 'B', 'C', 'D'])
    delete require.cache[require.resolve('../src/lib/repository.ts')]
    const { LocalRepository: RelaunchedRepository } = require('../src/lib/repository.ts')
    const relaunch = await RelaunchedRepository.getAppState()
    assert.deepEqual(relaunch.matches.map(match => match.id), ['A', 'B', 'C', 'D'])
  } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('local save, fresh launch, and Export preserve historical match references to a missing player entity', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  const legacy = state([])
  legacy.teams = [{ id: 'home', name: 'Home' }, { id: 'away', name: 'Away' }]
  legacy.matches = [{ id: 'historic', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90, teamId: 'home', homeTeamId: 'home', awayTeamId: 'away', appearances: [{ playerId: 'departed-player', teamId: 'home', position: 'ST', matchPosition: 'ST', role: 'starter' }], events: [] }]
  const entries = {}
  global.localStorage = memoryStorage(entries); delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]
  const { LocalRepository, STORAGE_KEY } = require('../src/lib/repository.ts')
  const { validateState } = require('../src/lib/validation.ts')
  try {
    assert.equal(validateState(legacy), false)
    const result = await LocalRepository.saveAppState(legacy)
    assert.equal(result.primarySaved, true)
    delete require.cache[require.resolve('../src/lib/repository.ts')]
    const { LocalRepository: RelaunchedRepository } = require('../src/lib/repository.ts')
    const relaunched = await RelaunchedRepository.getAppState()
    assert.equal(relaunched.matches[0].appearances[0].playerId, 'departed-player')
    assert.equal(JSON.parse(entries[STORAGE_KEY]).matches[0].appearances[0].position, 'ST')
    const exported = JSON.parse(await RelaunchedRepository.exportData())
    assert.equal(exported.matches[0].appearances[0].playerId, 'departed-player')
  } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('a primary read-back mismatch rejects and leaves the last verified payload recoverable', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  const entries = { 'football-tracker-v1': JSON.stringify(state(['A'])) }
  global.localStorage = {
    getItem: key => entries[key] ?? null,
    setItem: (key, value) => { entries[key] = key === 'football-tracker-v1' ? `${value}corrupt` : value },
    removeItem: key => { delete entries[key] },
  }; delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]
  const { LocalRepository, STORAGE_KEY } = require('../src/lib/repository.ts')
  try {
    await assert.rejects(() => LocalRepository.saveAppState(state(['B'])), /read-back did not match/)
    assert.equal(entries[STORAGE_KEY], JSON.stringify(state(['B'])) + 'corrupt')
    assert.equal(JSON.parse(entries['football-tracker-v1-backup']).matches[0].id, 'A')
  } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('an empty IndexedDB secondary cannot hide a valid primary history', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  global.localStorage = memoryStorage({ 'football-tracker-v1': JSON.stringify(state(['A', 'B', 'C', 'D'])) }); delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]
  const { LocalRepository } = require('../src/lib/repository.ts')
  try { assert.deepEqual((await LocalRepository.getAppState()).matches.map(match => match.id), ['A', 'B', 'C', 'D']) } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('a primary write failure rejects before a caller can report a saved match', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  global.localStorage = memoryStorage({}, true); delete global.indexedDB
  const { LocalRepository } = require('../src/lib/repository.ts')
  try { await assert.rejects(() => LocalRepository.saveAppState(state(['D'])), /Primary storage save failed/) } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('server revision wins over local state based on an older accepted revision', () => {
  const { resolveCloudMerge } = require('../src/lib/cloudSyncProtocol.ts')
  const local = { teams: [{ id: 'X', name: 'Local old' }], players: [], matches: [], competitionStates: [] }
  const remote = { entityType: 'team', entityId: 'X', revision: 8, deleted: false, payload: { id: 'X', name: 'Cloud new' } }
  const merged = resolveCloudMerge(local, [remote], [], { 'team:X': 7 })
  assert.equal(merged.state.teams[0].name, 'Cloud new')
  assert.deepEqual(merged.mutations, [])
})

test('store coordinates latest snapshots and exposes an explicit persistence retry', () => {
  const store = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(store.includes('createStoreTransactions<StoreSnapshot, DurableSaveResult>'))
  assert(store.includes('transactions.retryLatest()'))
  assert(store.includes('transactions.commit(current =>'))
  assert(!store.includes('setSnapshot(current =>'))
})

test('match editor waits for durable save, preserves a failed form, and exposes explicit feedback', () => {
  const editor = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(editor.includes('await saveMatchDurably(finalMatchData)'))
  assert(editor.includes('Save failed. Your match was not safely stored. Please retry.'))
  assert(editor.indexOf('await saveMatchDurably(finalMatchData)') < editor.indexOf('clearDraftMatch()'))
  assert(editor.indexOf('await saveMatchDurably(finalMatchData)') < editor.indexOf("onComplete({ name: 'match', id: draftId })"))
})

const tick = callback => queueMicrotask(callback)
const syncHarness = ({ initial, cloudTeams = [], initialRecords, initialRevision = 0, meta = {}, queue = [] }) => {
  const Module = require('node:module'); const originalLoad = Module._load
  const stores = { data: new Map(), sync_queue: new Map(queue.map(row => [row.id, row])), sync_metadata: new Map([['meta', { lastSyncedUserId: null, lastSyncAt: 0, retryAt: 0, entityUpdatedAt: {}, entityCloudUpdatedAt: {}, ...meta }]]) }
  const db = { transaction(name) { const tx = { error: null, oncomplete: null, onerror: null }; const store = stores[name]; return { objectStore() { return {
    get(key) { const req = {}; tick(() => { req.result = store.get(key); req.onsuccess?.() }); return req },
    getAll() { const req = {}; tick(() => { req.result = [...store.values()]; req.onsuccess?.() }); return req },
    put(value, key) { store.set(key ?? value.id, value); tick(() => tx.oncomplete?.()) },
    delete(key) { store.delete(key); tick(() => tx.oncomplete?.()) },
  } }, get oncomplete() { return tx.oncomplete }, set oncomplete(fn) { tx.oncomplete = fn }, get onerror() { return tx.onerror }, set onerror(fn) { tx.onerror = fn }, get error() { return tx.error } } } }
  const uploaded = []; const remote = { initialized: Boolean(initialRecords), revision: initialRevision, records: initialRecords ?? [] }
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: table => { let start = 0; let end = Number.MAX_SAFE_INTEGER; const query = { select() { return this }, eq() { return this }, order() { return this }, range(from, to) { start = from; end = to; return this }, maybeSingle: async () => ({ data: remote.initialized ? { revision: remote.revision } : null, error: null }), then(resolve, reject) { const rows = table === 'cloud_sync_entities' ? remote.records.map(row => ({ entity_type: row.entityType, entity_id: row.entityId, revision: row.revision, deleted: row.deleted, payload: row.payload })) : table === 'teams' ? cloudTeams : []; return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve, reject) } }; return query },
    rpc: async (name, args) => {
      if (name === 'initialize_cloud_sync') { if (!remote.initialized) { remote.initialized = true; remote.revision = 0; remote.records = args.p_entities.map(item => ({ ...item, revision: 0, deleted: false })) }; return { data: { revision: remote.revision }, error: null } }
      if (name === 'commit_cloud_sync') { uploaded.push(...args.p_mutations); if (args.p_expected_revision !== remote.revision) return { data: { applied: false, revision: remote.revision }, error: null }; if (args.p_mutations.length) { remote.revision++; for (const mutation of args.p_mutations) { const row = { entityType: mutation.entityType, entityId: mutation.entityId, revision: remote.revision, deleted: mutation.operation === 'delete', payload: mutation.operation === 'delete' ? null : mutation.payload }; const index = remote.records.findIndex(item => item.entityType === row.entityType && item.entityId === row.entityId); if (index < 0) remote.records.push(row); else remote.records[index] = row } }; return { data: { applied: true, revision: remote.revision }, error: null } }
      return { data: null, error: new Error('unexpected rpc') }
    },
  }
  const priorStorage = global.localStorage; const priorNavigator = Object.getOwnPropertyDescriptor(global, 'navigator')
  const entries = { 'football-tracker-v1': JSON.stringify(initial) }; global.localStorage = memoryStorage(entries); Object.defineProperty(global, 'navigator', { value: { onLine: true }, configurable: true })
  Module._load = function(request, parent, isMain) { if (request === './db') return { openDB: async () => db, saveToIndexedDB: async () => {}, getFromIndexedDB: async () => null }; if (request === './supabase') return { isCloudSyncEnabled: true, getSupabase: () => supabase }; return originalLoad.call(this, request, parent, isMain) }
  for (const file of ['../src/lib/sync.ts', '../src/lib/repository.ts', '../src/lib/db.ts']) delete require.cache[require.resolve(file)]
  const { SyncManager } = require('../src/lib/sync.ts')
  return { SyncManager, entries, stores, uploaded, remote, restore: () => { Module._load = originalLoad; global.localStorage = priorStorage; if (priorNavigator) Object.defineProperty(global, 'navigator', priorNavigator); else delete global.navigator } }
}

test('integration: same ID pending local mutation wins over older cloud row', async () => {
  const local = state([]); local.teams = [{ id: 'X', name: 'Local' }]
  const h = syncHarness({ initial: local, cloudTeams: [{ id: 'X', name: 'Cloud old' }], queue: [{ id: 'q1', entityType: 'team', entityId: 'X', operation: 'upsert', baseRevision: 0, payload: local.teams[0], timestamp: Date.now(), status: 'pending' }] })
  try { await h.SyncManager.syncNow(); assert.equal(JSON.parse(h.entries['football-tracker-v1']).teams[0].name, 'Local'); assert.equal(h.uploaded[0].payload.name, 'Local') } finally { h.restore() }
})

test('integration: a newer cloud entity revision replaces synchronized local state', async () => {
  const local = state([]); local.teams = [{ id: 'X', name: 'Local old' }]
  const h = syncHarness({ initial: local, initialRevision: 8, initialRecords: [{ entityType: 'team', entityId: 'X', revision: 8, deleted: false, payload: { id: 'X', name: 'Cloud new' } }], meta: { entityCloudRevision: { 'team:X': 7 } } })
  try { await h.SyncManager.syncNow(); assert.equal(JSON.parse(h.entries['football-tracker-v1']).teams[0].name, 'Cloud new'); assert.equal(h.stores.sync_metadata.get('meta').entityCloudRevision['team:X'], 8) } finally { h.restore() }
})

test('invalid cloud merge cannot save, enqueue, upload, or delete; a later valid sync recovers', async () => {
  const local = state([]); local.teams = [{ id: 'A', name: 'Local' }]
  const cloudTeams = [{ id: 'B', name: 42 }]
  const h = syncHarness({ initial: local, initialRevision: 1, initialRecords: [{ entityType: 'team', entityId: 'B', revision: 1, deleted: false, payload: cloudTeams[0] }], queue: [{ id: 'queued', entityType: 'team', entityId: 'A', operation: 'upsert', baseRevision: 0, payload: local.teams[0], timestamp: Date.now(), status: 'pending' }] })
  const before = h.entries['football-tracker-v1']; const oldSetTimeout = global.setTimeout
  const oldConsoleError = console.error
  global.setTimeout = () => 1
  console.error = () => {}
  try {
    const invalid = await h.SyncManager.syncNow()
    assert.equal(invalid.status, 'pending')
    assert.equal(h.entries['football-tracker-v1'], before)
    assert.deepEqual([...h.stores.sync_queue.keys()], ['queued'])
    assert.equal(h.uploaded.length, 0)
    h.remote.records[0].payload = { id: 'B', name: 'Recovered' }
    const recovered = await h.SyncManager.syncNow()
    assert.equal(recovered.status, 'synced')
    assert.equal(JSON.parse(h.entries['football-tracker-v1']).teams.find(team => team.id === 'B').name, 'Recovered')
  } finally { global.setTimeout = oldSetTimeout; console.error = oldConsoleError; h.restore() }
})

test('integration: durable save failure does not block the next serialized save', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB; let writes = 0; const entries = {}
  global.localStorage = { getItem: key => entries[key] ?? null, setItem: (key, value) => { if (key === 'football-tracker-v1' && ++writes === 1) throw new Error('quota'); entries[key] = value }, removeItem: key => delete entries[key] }; delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]
  const { LocalRepository } = require('../src/lib/repository.ts')
  try { await assert.rejects(() => LocalRepository.saveAppState(state(['one']))); await LocalRepository.saveAppState(state(['two'])); assert.deepEqual(JSON.parse(entries['football-tracker-v1']).matches.map(row => row.id), ['two']) } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('quota recovery prioritizes a fitting primary save and preserves unrelated auth storage', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB
  const entries = { 'football-tracker-v1': JSON.stringify(state(['A', 'B', 'C'])), 'sb-auth-token': 'session' }; const quota = JSON.stringify(state(['A', 'B', 'C', 'D'])).length + 40
  const used = () => Object.values(entries).reduce((sum, value) => sum + String(value).length, 0)
  global.localStorage = { getItem: key => entries[key] ?? null, setItem: (key, value) => { const prior = entries[key] ?? ''; if (used() - prior.length + value.length > quota) throw new Error('QuotaExceededError'); entries[key] = value }, removeItem: key => delete entries[key] }; delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]; const { LocalRepository } = require('../src/lib/repository.ts')
  try { await LocalRepository.saveAppState(state(['A', 'B', 'C', 'D'])); assert.deepEqual(JSON.parse(entries['football-tracker-v1']).matches.map(row => row.id), ['A', 'B', 'C', 'D']); assert.equal(entries['sb-auth-token'], 'session') } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('quota failure preserves the canonical save and every existing recovery snapshot', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB; const old = JSON.stringify(state(['A', 'B', 'C'])); const fresh = JSON.stringify(state(['A', 'B', 'C', 'D']))
  const entries = { 'football-tracker-v1': old, 'football-tracker-v1-backup': old, 'football-tracker-emergency-1': old, 'football-tracker-emergency-2': old, 'football-tracker-emergency-3': old, 'football-tracker-emergency-4': old, 'football-tracker-emergency-5': old, 'sb-test-project-auth-token': 'session', unrelated: 'keep' }; const quota = fresh.length + 32
  const used = () => Object.values(entries).reduce((sum, value) => sum + String(value).length, 0)
  global.localStorage = { getItem: key => entries[key] ?? null, setItem: (key, value) => { const prior = entries[key] ?? ''; if (used() - prior.length + value.length > quota) { const error = new Error('QuotaExceededError'); error.name = 'QuotaExceededError'; throw error } entries[key] = value }, removeItem: key => delete entries[key] }; delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]; const { LocalRepository } = require('../src/lib/repository.ts')
  try {
    await assert.rejects(() => LocalRepository.saveAppState(state(['A', 'B', 'C', 'D'])), /Primary storage save failed/)
    assert.equal(entries['football-tracker-v1'], old)
    assert.equal(entries['sb-test-project-auth-token'], 'session')
    assert.equal(entries.unrelated, 'keep')
    for (const key of ['football-tracker-v1-backup', ...Array.from({ length: 5 }, (_, index) => `football-tracker-emergency-${index + 1}`)]) assert.equal(entries[key], old)
  } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('startup does not automatically remove local recovery snapshots', () => {
  const main = fs.readFileSync(require.resolve('../src/main.tsx'), 'utf8')
  assert.doesNotMatch(main, /compactLegacyRecoveryStorage/)
  const repository = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  assert.doesNotMatch(repository, /removeItem\(BACKUP_KEY\)/)
  assert.doesNotMatch(repository, /removeItem\(`\$\{EMERGENCY_PREFIX\}/)
})

test('verified primary save resolves while the IndexedDB mirror never resolves', async () => {
  const Module = require('node:module'); const originalLoad = Module._load; const previousStorage = global.localStorage
  global.localStorage = memoryStorage({}); Module._load = function(request, parent, isMain) { if (request === './db') return { getFromIndexedDB: async () => null, saveToIndexedDB: () => new Promise(() => {}) }; return originalLoad.call(this, request, parent, isMain) }
  delete require.cache[require.resolve('../src/lib/repository.ts')]; const { LocalRepository } = require('../src/lib/repository.ts')
  try { const result = await Promise.race([LocalRepository.saveAppState(state(['D'])), new Promise((_, reject) => setTimeout(() => reject(new Error('blocked')), 50))]); assert.equal(result.primarySaved, true) } finally { Module._load = originalLoad; global.localStorage = previousStorage }
})

test('verified primary getAppState resolves while the IndexedDB mirror never resolves', async () => {
  const Module = require('node:module'); const originalLoad = Module._load; const previousStorage = global.localStorage
  const canonical = state(['A', 'B', 'C', 'D'])
  global.localStorage = memoryStorage({ 'football-tracker-v1': JSON.stringify(canonical) })
  Module._load = function(request, parent, isMain) { if (request === './db') return { getFromIndexedDB: async () => null, saveToIndexedDB: () => new Promise(() => {}) }; return originalLoad.call(this, request, parent, isMain) }
  delete require.cache[require.resolve('../src/lib/repository.ts')]; const { LocalRepository } = require('../src/lib/repository.ts')
  try { const restored = await Promise.race([LocalRepository.getAppState(), new Promise((_, reject) => setTimeout(() => reject(new Error('blocked')), 50))]); assert.deepEqual(restored.matches.map(match => match.id), ['A', 'B', 'C', 'D']) } finally { Module._load = originalLoad; global.localStorage = previousStorage }
})

test('all four ranking surfaces consume the one canonical sixteen-metric catalog', () => {
  const metrics = require('../src/lib/rankingMetrics.ts').RANKING_METRICS
  assert.deepEqual(metrics.map(metric => metric.label), ['Rating', 'Goals', 'Assists', 'G+A', 'Minutes', 'MOM', '7.2+ Matches', 'Goals/90', 'Assists/90', 'G+A/90', 'SOT Allowed/90', 'Defender GA/90', 'Clean Sheets', 'Saves', 'GK GA/90', 'Qualifying GK Save %'])
  for (const file of ['HomeScreen.tsx', 'TeamDetailScreen.tsx', 'CompetitionScreen.tsx', 'GlobalRankingScreen.tsx']) {
    const screen = fs.readFileSync(`src/screens/${file}`, 'utf8')
    assert(screen.includes("from '../lib/rankingMetrics'"))
    assert(screen.includes('RANKING_METRICS'))
    assert(screen.includes('RankingMetricTabs'))
    assert(screen.includes('RankingRow'))
  }
  const home = fs.readFileSync('src/screens/HomeScreen.tsx', 'utf8'); const team = fs.readFileSync('src/screens/TeamDetailScreen.tsx', 'utf8'); const league = fs.readFileSync('src/screens/CompetitionScreen.tsx', 'utf8')
  assert(home.includes('leaderRows.slice(0, 10)')); assert(home.includes("competitionType: 'all', rankingMetric: metric"))
  assert(team.includes('slice(0, 5)')); assert(team.includes('competitionType: bestCompetition, rankingMetric: metric, teamId'))
  assert(league.includes('slice(0, 10)')); assert(league.includes('subtitle="Top 10"')); assert(league.includes("competitionType: 'league', rankingMetric: playerMetric"))
})

test('integration: final save waits for an in-flight draft and remains canonical after reload', async () => {
  const { createPersistenceQueue } = require('../src/lib/persistenceQueue.ts'); let release; const held = new Promise(resolve => { release = resolve }); const writes = []; const primary = {}
  const queue = createPersistenceQueue(async value => { writes.push(value); if (value.kind === 'draft') await held; primary.value = value })
  const draft = queue.enqueue({ kind: 'draft', id: 'A' }); let finalResolved = false; const final = queue.enqueue({ kind: 'final', id: 'D', matches: ['D'] }).then(() => { finalResolved = true })
  await Promise.resolve(); assert.equal(finalResolved, false); release(); await draft; await final; await queue.drain()
  assert.deepEqual(writes.map(row => row.kind), ['draft', 'final']); assert.deepEqual(primary.value, { kind: 'final', id: 'D', matches: ['D'] }); assert.equal(finalResolved, true)
  await queue.enqueue({ kind: 'later', id: 'E' }); assert.equal(primary.value.id, 'E')
})

test('integration: obsolete queued draft is skipped and a failed draft does not poison final save', async () => {
  const { createPersistenceQueue } = require('../src/lib/persistenceQueue.ts'); const writes = []; let epoch = 1
  const queue = createPersistenceQueue(async value => { if (value.kind === 'failed') throw new Error('draft failure'); writes.push(value) })
  await assert.rejects(() => queue.enqueue({ kind: 'failed' })); const stale = queue.enqueue({ kind: 'draft' }, () => epoch === 1); epoch++; await assert.rejects(() => stale, /Obsolete/); await queue.enqueue({ kind: 'final', id: 'D' }); assert.deepEqual(writes, [{ kind: 'final', id: 'D' }])
})
