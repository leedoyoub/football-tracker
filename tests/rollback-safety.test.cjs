const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText,
  filename,
)

test('startup and quota handling never remove existing recovery snapshots', () => {
  const main = fs.readFileSync('src/main.tsx', 'utf8')
  const repository = fs.readFileSync('src/lib/repository.ts', 'utf8')
  assert.doesNotMatch(main, /compactLegacyRecoveryStorage/)
  assert.doesNotMatch(repository, /removeItem\(BACKUP_KEY\)/)
  assert.doesNotMatch(repository, /removeItem\(`\$\{EMERGENCY_PREFIX\}/)
})

test('the canonical local storage key and REV13 rating engine remain unchanged', () => {
  const repository = fs.readFileSync('src/lib/repository.ts', 'utf8')
  const revision = fs.readFileSync('src/engine/ratingRevision.ts', 'utf8')
  const supabase = fs.readFileSync('src/lib/supabase.ts', 'utf8')
  assert.match(repository, /STORAGE_KEY\s*=\s*'football-tracker-v1'/)
  assert.match(revision, /RATING_ENGINE_REVISION\s*=\s*13/)
  assert.match(supabase, /isCloudSyncEnabled\s*=\s*false/)
  assert.match(supabase, /isSupabaseConfigured\s*=\s*Boolean\(supabaseUrl\s*&&\s*supabaseAnonKey\)/)
})

test('a v2.5.4 JSON backup loads without changing the backup bytes or stable IDs', async () => {
  const priorStorage = global.localStorage
  const priorIndexedDB = global.indexedDB
  const originalLoad = Module._load
  const legacyState = {
    teams: [{ id: 'home', name: 'Home' }, { id: 'away', name: 'Away' }],
    players: [{ id: 'transferred-player', name: 'Transferred', teamId: 'away', teamIds: ['away'] }],
    matches: [{
      id: 'historic', season: 'S1', matchDay: 1, date: '2026-01-01', duration: 90,
      teamId: 'home', homeTeamId: 'home', awayTeamId: 'away', competitionType: 'league', competitionStage: 'regular',
      kickoffConfirmed: true, fulltimeOpponentSotAutoLinked: true,
      competitionAssignment: { competitionType: 'league', season: 'S1', teamId: 'home', stage: 'regular', matchDay: 1 },
      appearances: [
        { playerId: 'departed-player', teamId: 'home', position: 'ST', matchPosition: 'ST', role: 'starter' },
        { playerId: 'transferred-player', teamId: 'home', position: 'CM', matchPosition: 'CM', role: 'starter' },
      ],
      events: [{ id: 'goal-1', type: 'goal', teamId: 'home', minute: 20, playerId: 'departed-player' }],
    }],
    competitionStates: [],
  }
  const backupBytes = JSON.stringify(legacyState)
  const entries = { 'football-tracker-v1-backup': backupBytes }
  global.localStorage = {
    getItem: key => entries[key] ?? null,
    setItem: (key, value) => { entries[key] = value },
    removeItem: key => { delete entries[key] },
  }
  delete global.indexedDB
  const repositoryPath = require.resolve('../src/lib/repository.ts')
  delete require.cache[repositoryPath]
  Module._load = function(request, parent, isMain) {
    if (request === './db') return { getFromIndexedDB: async () => null, saveToIndexedDB: async () => {} }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const { LocalRepository } = require('../src/lib/repository.ts')
    const loaded = await LocalRepository.getAppState()
    assert.equal(loaded.matches[0].appearances[0].playerId, 'departed-player')
    assert.equal(loaded.matches[0].appearances[1].playerId, 'transferred-player')
    assert.equal(loaded.matches[0].events[0].playerId, 'departed-player')
    assert.equal(loaded.matches[0].kickoffConfirmed, true)
    assert.equal(loaded.matches[0].fulltimeOpponentSotAutoLinked, true)
    const exported = JSON.parse(await LocalRepository.exportData())
    assert.equal(exported.matches[0].events[0].playerId, 'departed-player')
    assert.deepEqual(entries, { 'football-tracker-v1-backup': backupBytes })
  } finally {
    Module._load = originalLoad
    global.localStorage = priorStorage
    global.indexedDB = priorIndexedDB
    delete require.cache[repositoryPath]
  }
})

test('quota failure leaves the existing primary and every JSON recovery copy byte-for-byte intact', async () => {
  const priorStorage = global.localStorage
  const priorIndexedDB = global.indexedDB
  const backupBytes = JSON.stringify({ teams: [], players: [], matches: [], competitionStates: [] })
  const entries = {
    'football-tracker-v1': backupBytes,
    'football-tracker-v1-backup': backupBytes,
    ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`football-tracker-emergency-${index + 1}`, backupBytes])),
  }
  global.localStorage = {
    getItem: key => entries[key] ?? null,
    setItem: (key, value) => {
      if (key === 'football-tracker-v1') { const error = new Error('QuotaExceededError'); error.name = 'QuotaExceededError'; throw error }
      entries[key] = value
    },
    removeItem: key => { delete entries[key] },
  }
  delete global.indexedDB
  const repositoryPath = require.resolve('../src/lib/repository.ts')
  delete require.cache[repositoryPath]
  try {
    const { LocalRepository } = require('../src/lib/repository.ts')
    await assert.rejects(() => LocalRepository.saveAppState({ teams: [], players: [], matches: [{ id: 'new', appearances: [], events: [] }], competitionStates: [] }), /Primary storage save failed/)
    assert.deepEqual(entries, {
      'football-tracker-v1': backupBytes,
      'football-tracker-v1-backup': backupBytes,
      ...Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`football-tracker-emergency-${index + 1}`, backupBytes])),
    })
  } finally {
    global.localStorage = priorStorage
    global.indexedDB = priorIndexedDB
    delete require.cache[repositoryPath]
  }
})

test('disabled Cloud Sync does not call Supabase or read, write, or schedule the durable queue', async () => {
  const originalLoad = Module._load
  const originalSetTimeout = global.setTimeout
  const calls = { client: 0, db: 0, timers: 0 }
  const db = { transaction() { calls.db++; throw new Error('offline queue must remain untouched') } }
  Module._load = function(request, parent, isMain) {
    if (request === './db') return { openDB: async () => db }
    if (request === './supabase') return {
      isCloudSyncEnabled: false,
      getSupabase: () => { calls.client++; throw new Error('Supabase must remain untouched') },
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  global.setTimeout = (...args) => { calls.timers++; return originalSetTimeout(...args) }
  const syncPath = require.resolve('../src/lib/sync.ts')
  delete require.cache[syncPath]
  try {
    const { SyncManager } = require('../src/lib/sync.ts')
    assert.equal((await SyncManager.syncNow()).status, 'local-only')
    await SyncManager.queueOperation({ entityType: 'match', entityId: 'M1', operation: 'delete' })
    const state = { teams: [], players: [], matches: [], competitionStates: [] }
    await SyncManager.queueStateChange(state, { ...state, matches: [{ id: 'M1', appearances: [], events: [] }] })
    assert.deepEqual(calls, { client: 0, db: 0, timers: 0 })
  } finally {
    Module._load = originalLoad
    global.setTimeout = originalSetTimeout
    delete require.cache[syncPath]
  }
})
