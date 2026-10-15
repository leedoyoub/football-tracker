const assert = require('node:assert/strict')
const fs = require('node:fs')
const { test } = require('node:test')
const Module = require('node:module')
const ts = require('typescript')
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)

const initial = () => ({ teams: [{ id: 'a', name: 'Alpha' }], players: [{ id: 'p', name: 'Before', position: 'CM', teamId: 'a', teamIds: ['a'] }], matches: [match('old')], competitionStates: [] })
const match = id => ({ id, teamId: 'a', homeTeamId: 'a', awayTeamId: 'b', season: 'Season 1', competitionType: 'league', matchDay: 1, date: '2026-10-16', duration: 90, appearances: [], events: [] })
const flush = () => new Promise(resolve => setImmediate(resolve))

// Run the real Store and Repository. Only the browser, auth/network boundary,
// and React hook scheduler are substituted; updater replay models StrictMode.
async function harness({ cloudFailure = false } = {}) {
  const originalLoad = Module._load; const originalStorage = global.localStorage; const originalTimer = global.setTimeout; const originalClear = global.clearTimeout
  const entries = { 'football-tracker-v1': JSON.stringify(initial()) }; const slots = []; const effects = []; const timers = new Map(); const clouds = []; let cursor = 0; let timerId = 0; let writes = 0; let fail = false
  const React = require('react')
  const hooks = { ...React, useState: initialValue => {
    const index = cursor++; if (!(index in slots)) slots[index] = typeof initialValue === 'function' ? initialValue() : initialValue
    return [slots[index], next => { if (typeof next === 'function') { next(slots[index]); slots[index] = next(slots[index]) } else slots[index] = next }]
  }, useRef: value => { const index = cursor++; return slots[index] ??= { current: value } }, useMemo: (fn, deps) => {
    const index = cursor++; const old = slots[index]
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) slots[index] = { deps, value: fn() }
    return slots[index].value
  }, useCallback: (fn, deps) => hooks.useMemo(() => fn, deps), useEffect: (fn, deps) => {
    const index = cursor++; const old = slots[index]; if (!old || deps.some((value, i) => !Object.is(value, old[i]))) { slots[index] = deps; effects.push(fn) }
  } }
  global.localStorage = { getItem: key => { if (fail === 'access') throw new Error('SecurityError'); return entries[key] ?? null }, setItem: (key, value) => { if (key === 'football-tracker-v1') { writes++; if (fail) throw new Error(fail === 'access' ? 'SecurityError' : 'QuotaExceededError') } entries[key] = value } }
  global.setTimeout = (fn, delay) => { assert.equal(delay, 450); timers.set(++timerId, fn); return timerId }
  global.clearTimeout = id => timers.delete(id)
  Module._load = function(request, parent, main) {
    if (request === 'react') return hooks
    if (request === './lib/auth') return { useAuth: () => ({ user: null }) }
    if (request === './lib/sync') return { SyncManager: { queueStateChange: async (prev, next) => { clouds.push({ prev, next }); if (cloudFailure) throw new Error('Network unavailable') }, syncNow: async () => {} } }
    if (request === './components/StartupBoundary') return { BootstrapShell: () => null, StartupRecovery: () => null }
    return originalLoad.call(this, request, parent, main)
  }
  delete require.cache[require.resolve('../src/store.tsx')]
  const { StoreProvider } = require('../src/store.tsx')
  const render = () => { cursor = 0; const tree = StoreProvider({ children: null }); while (effects.length) effects.shift()(); return tree }
  render(); await flush(); let tree = render(); await flush(); tree = render(); clouds.length = 0
  return {
    value: () => { tree = render(); return tree.props.value },
    text: () => { tree = render(); const texts = []; const visit = node => { if (typeof node === 'string') texts.push(node); else if (Array.isArray(node)) node.forEach(visit); else if (node?.props) visit(node.props.children) }; visit(tree); return texts.join(' ') },
    durable: () => JSON.parse(entries['football-tracker-v1']), writes: () => writes, clouds, fail: value => { fail = value },
    checkpoint: () => { for (const [id, fn] of timers) { timers.delete(id); fn() } },
    close: () => { Module._load = originalLoad; global.localStorage = originalStorage; global.setTimeout = originalTimer; global.clearTimeout = originalClear },
  }
}

test('ordinary mutation failure is visible across navigation and retry saves the newest edit', async () => {
  const app = await harness()
  try {
    app.fail(true); app.value().updatePlayer('p', { name: 'Failed edit' }); await flush()
    assert.match(app.text(), /Save failed/)
    assert.equal(app.durable().players[0].name, 'Before')
    assert.equal(app.clouds.length, 0)
    app.value().updatePlayer('p', { name: 'Newest edit' }); await flush()
    app.fail(false); await app.value().retryPersistence(); await flush()
    assert.equal(app.durable().players[0].name, 'Newest edit')
    assert.doesNotMatch(app.text(), /Save failed/)
  } finally { app.close() }
})

test('StrictMode updater replay writes one ordinary mutation once', async () => {
  const app = await harness()
  try { const before = app.writes(); app.value().updatePlayer('p', { name: 'One edit' }); await flush(); assert.equal(app.writes() - before, 1) } finally { app.close() }
})

test('Squad Import failure retains the whole batch for retry and syncs only after verified primary save', async () => {
  const app = await harness()
  try {
    app.fail(true)
    app.value().importPlayers([{ teamId: 'a', externalPlayerId: 42, name: 'Imported', number: 7, position: 'RW' }])
    await flush()
    const importedId = app.value().players.find(p => p.externalPlayerId === 42).id
    assert.equal(app.durable().players.length, 1); assert.equal(app.clouds.length, 0)
    assert.match(app.text(), /Save failed/)
    app.fail(false); await app.value().retryPersistence(); await flush()
    assert.equal(app.durable().players.find(p => p.externalPlayerId === 42).id, importedId)
    assert.equal(app.clouds.at(-1).next.players.find(p => p.externalPlayerId === 42).id, importedId)
    assert.doesNotMatch(app.text(), /Save failed/)
  } finally { app.close() }
})

test('a pending draft checkpoint cannot restore a player edit from an older snapshot', async () => {
  const app = await harness()
  try {
    app.value().saveDraftMatch(match('draft'))
    app.value().updatePlayer('p', { name: 'After draft' }); await flush(); app.checkpoint(); await flush()
    assert.equal(app.durable().players[0].name, 'After draft')
    assert.equal(app.durable().draftMatch.id, 'draft')
  } finally { app.close() }
})

test('final save followed immediately by a player edit preserves both in durable storage', async () => {
  const app = await harness()
  try {
    const saved = app.value().saveMatchDurably(match('new'))
    app.value().updatePlayer('p', { name: 'During final save' })
    await saved; await flush()
    assert.deepEqual(app.durable().matches.map(row => row.id), ['old', 'new'])
    assert.equal(app.durable().players[0].name, 'During final save')
  } finally { app.close() }
})

test('a same-turn match deletion writes primary storage before navigation can exit', async () => {
  const app = await harness()
  try { app.value().deleteAllMatches(); assert.deepEqual(app.durable().matches, []) } finally { await flush(); app.close() }
})

test('rapid edits without a React render retain the first mutation and latest fields', async () => {
  const app = await harness()
  try {
    const store = app.value(); store.updatePlayer('p', { name: 'New name' }); store.updatePlayer('p', { number: 7 }); await flush()
    assert.equal(app.durable().players[0].name, 'New name'); assert.equal(app.durable().players[0].number, 7)
  } finally { app.close() }
})

test('failed import preserves live edits and a later retry saves those edits', async () => {
  const app = await harness()
  try {
    app.fail(true); app.value().updatePlayer('p', { name: 'Unsaved name' }); await flush()
    await assert.rejects(() => app.value().importAppState(JSON.stringify({ ...initial(), players: [] })), /Primary storage save failed/)
    assert.equal(app.value().players[0].name, 'Unsaved name')
    app.fail(false); await app.value().retryPersistence()
    assert.equal(app.durable().players[0].name, 'Unsaved name')
  } finally { app.close() }
})

test('unavailable browser storage does not hydrate as an empty usable app', async () => {
  const oldStorage = global.localStorage; const oldDB = global.indexedDB
  global.localStorage = { getItem: () => { throw new Error('Access denied') } }; delete global.indexedDB
  const { LocalRepository } = require('../src/lib/repository.ts')
  try { await assert.rejects(() => LocalRepository.getAppState(), /recover|storage/i) } finally { global.localStorage = oldStorage; global.indexedDB = oldDB }
})

test('an empty readable mirror cannot turn an inaccessible primary into a fresh install', async () => {
  const { sourceModule } = require('./helpers/v259-harness.cjs')
  const path = require('node:path')
  const oldStorage = global.localStorage
  const { LocalRepository } = sourceModule(path.resolve(__dirname, '..'), 'lib/repository.ts', {
    './db': { getFromIndexedDB: async () => null, saveToIndexedDB: async () => {} },
  })
  global.localStorage = { getItem: () => { throw new Error('SecurityError') } }
  try { await assert.rejects(() => LocalRepository.getAppState(), /recover|storage/i) } finally { global.localStorage = oldStorage }
})

test('a player edit requested during import is applied to the imported snapshot', async () => {
  const app = await harness()
  try {
    const imported = { ...initial(), players: [{ ...initial().players[0], name: 'Imported', number: 10 }] }
    const pending = app.value().importAppState(JSON.stringify(imported))
    app.value().updatePlayer('p', { name: 'Edited during import' })
    await pending; await flush()
    assert.equal(app.value().players[0].name, 'Edited during import')
    assert.equal(app.durable().players[0].name, 'Edited during import')
    assert.equal(app.durable().players[0].number, 10)
  } finally { app.close() }
})

test('failed import exposes retry for a draft checkpoint cancelled by that import', async () => {
  const app = await harness()
  try {
    app.value().saveDraftMatch(match('draft')); app.fail(true)
    await assert.rejects(() => app.value().importAppState(JSON.stringify(initial())))
    assert.match(app.text(), /Save failed/)
    app.fail(false); await app.value().retryPersistence()
    assert.equal(app.durable().draftMatch.id, 'draft')
  } finally { app.close() }
})

test('an import started during final save remains the last authoritative replacement', async () => {
  const app = await harness()
  try {
    const saving = app.value().saveMatchDurably(match('new'))
    const importing = app.value().importAppState(JSON.stringify({ ...initial(), matches: [] }))
    await saving; await importing; await flush()
    assert.deepEqual(app.value().matches, []); assert.deepEqual(app.durable().matches, [])
  } finally { app.close() }
})

test('a final save requested during import uses the completed imported snapshot', async () => {
  const app = await harness()
  try {
    const importing = app.value().importAppState(JSON.stringify({ ...initial(), players: [{ ...initial().players[0], number: 10 }] }))
    const saving = app.value().saveMatchDurably(match('new'))
    await importing; await saving; await flush()
    assert.deepEqual(app.value().matches.map(row => row.id), ['old', 'new'])
    assert.deepEqual(app.durable().matches.map(row => row.id), ['old', 'new'])
    assert.equal(app.durable().players[0].number, 10)
  } finally { app.close() }
})

test('browser access errors preserve the prior verified state and permit an explicit retry', async () => {
  const app = await harness()
  try {
    app.fail('access'); app.value().updatePlayer('p', { name: 'Access error edit' }); await flush()
    assert.match(app.text(), /Save failed/); assert.equal(app.durable().players[0].name, 'Before'); assert.equal(app.clouds.length, 0)
    app.fail(false); await app.value().retryPersistence()
    assert.equal(app.durable().players[0].name, 'Access error edit')
  } finally { app.close() }
})

test('cloud network failure cannot turn a verified ordinary save into a local failure', async () => {
  const app = await harness({ cloudFailure: true })
  try {
    app.value().updatePlayer('p', { name: 'Local success' }); await flush()
    assert.equal(app.durable().players[0].name, 'Local success'); assert.equal(app.value().persistenceStatus, 'saved')
    assert.doesNotMatch(app.text(), /Save failed/)
  } finally { app.close() }
})

test('draft remains debounced and clearing it during final save cannot resurrect it', async () => {
  const app = await harness()
  try {
    const before = app.writes(); app.value().saveDraftMatch(match('new')); assert.equal(app.writes(), before)
    app.checkpoint(); await flush(); assert.equal(app.writes(), before + 1)
    const saved = app.value().saveMatchDurably(match('new')); app.value().clearDraftMatch(); await saved; await flush()
    assert.equal(app.durable().draftMatch, undefined); assert.deepEqual(app.durable().matches.map(row => row.id), ['old', 'new'])
  } finally { app.close() }
})
