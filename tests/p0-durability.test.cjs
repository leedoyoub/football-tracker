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

test('Cloud Sync is disabled before any automatic merge or queue access', () => {
  const sync = fs.readFileSync(require.resolve('../src/lib/sync.ts'), 'utf8')
  const disabledGuard = sync.indexOf('if (!isCloudSyncEnabled) return')
  assert(disabledGuard >= 0)
  assert(disabledGuard < sync.indexOf('getSupabase()'))
  assert(disabledGuard < sync.indexOf('const pending = await allQueue()'))
  assert(disabledGuard < sync.indexOf('const meta = await metadata()'))
})

test('store serializes durable saves and restores the queue after a rejected write', () => {
  const store = fs.readFileSync(require.resolve('../src/store.tsx'), 'utf8')
  assert(store.includes('createPersistenceQueue(LocalRepository.saveAppState)'))
  assert(store.includes('persistenceQueue.current.enqueue(next, () => epoch === persistenceEpoch.current && (!valid || valid()))'))
})

test('match editor waits for durable save, preserves a failed form, and exposes explicit feedback', () => {
  const editor = fs.readFileSync(require.resolve('../src/screens/NewMatchScreen.tsx'), 'utf8')
  assert(editor.includes('await saveMatchDurably(finalMatchData)'))
  assert(editor.includes('Save failed. Your match was not safely stored. Please retry.'))
  assert(editor.indexOf('await saveMatchDurably(finalMatchData)') < editor.indexOf('clearDraftMatch()'))
  assert(editor.indexOf('await saveMatchDurably(finalMatchData)') < editor.indexOf("onComplete({ name: 'match', id: draftId })"))
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

test('quota failure keeps the full recovery footprint and never retries by deleting snapshots', async () => {
  const previousStorage = global.localStorage; const previousIndexedDB = global.indexedDB; const old = JSON.stringify(state(['A', 'B', 'C'])); const fresh = JSON.stringify(state(['A', 'B', 'C', 'D']))
  const entries = { 'football-tracker-v1': old, 'football-tracker-v1-backup': old, 'football-tracker-emergency-1': old, 'football-tracker-emergency-2': old, 'football-tracker-emergency-3': old, 'football-tracker-emergency-4': old, 'football-tracker-emergency-5': old, 'sb-test-project-auth-token': 'session', unrelated: 'keep' }; const quota = fresh.length + 32
  const used = () => Object.values(entries).reduce((sum, value) => sum + String(value).length, 0)
  global.localStorage = { getItem: key => entries[key] ?? null, setItem: (key, value) => { const prior = entries[key] ?? ''; if (used() - prior.length + value.length > quota) { const error = new Error('QuotaExceededError'); error.name = 'QuotaExceededError'; throw error } entries[key] = value }, removeItem: key => delete entries[key] }; delete global.indexedDB
  delete require.cache[require.resolve('../src/lib/repository.ts')]; const { LocalRepository } = require('../src/lib/repository.ts')
  const previous = { ...entries }
  try { await assert.rejects(() => LocalRepository.saveAppState(state(['A', 'B', 'C', 'D'])), /Primary storage save failed/); assert.deepEqual(entries, previous) } finally { global.localStorage = previousStorage; global.indexedDB = previousIndexedDB }
})

test('startup code has no call path that compacts existing recovery snapshots', () => {
  const main = fs.readFileSync(require.resolve('../src/main.tsx'), 'utf8')
  const repository = fs.readFileSync(require.resolve('../src/lib/repository.ts'), 'utf8')
  assert.doesNotMatch(main, /compactLegacyRecoveryStorage/)
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
