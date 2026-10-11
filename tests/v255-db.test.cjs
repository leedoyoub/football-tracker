require('./helpers/register-ts.cjs')
const assert = require('node:assert/strict')
const { test, afterEach } = require('node:test')
const originalFactory = global.indexedDB
afterEach(() => { global.indexedDB = originalFactory })

function database() {
  const data = new Map()
  return {
    closed: false, transactions: 0, abortWrites: false, abortReads: false,
    objectStoreNames: { contains: () => true },
    close() { this.closed = true },
    transaction() {
      this.transactions++
      const db = this
      const tx = { error: null, objectStore: () => ({
        put(value, key) { queueMicrotask(() => { if (db.abortWrites) tx.onabort?.(); else { data.set(key, structuredClone(value)); tx.oncomplete?.() } }) },
        get(key) { const request = {}; queueMicrotask(() => { if (db.abortReads) tx.onabort?.(); else { request.result = data.get(key); request.onsuccess?.() } }); return request },
      }) }
      return tx
    },
  }
}
function setup() {
  const requests = []
  global.indexedDB = { open(name, version) { assert.equal(name, 'FootballTrackerDB'); assert.equal(version, 2); const request = {}; requests.push(request); return request } }
  delete require.cache[require.resolve('../src/lib/db.ts')]
  return { api: require('../src/lib/db.ts'), requests }
}
function succeed(request, db = database()) { request.result = db; request.onsuccess(); return db }

test('concurrent IndexedDB opens share one connection and independent transactions keep every saved state', async () => {
  const { api, requests } = setup()
  const first = api.openDB(); const second = api.openDB()
  assert.equal(requests.length, 1)
  const db = succeed(requests[0])
  assert.equal(await first, db); assert.equal(await second, db); assert.equal(await api.openDB(), db)
  const states = [{ teams: [], players: [], matches: [] }, { teams: [{ id: 'a', name: 'A' }], players: [], matches: [] }]
  await api.saveToIndexedDB('state', states[0]); await api.saveToIndexedDB('state', states[1])
  assert.deepEqual(await api.getFromIndexedDB('state'), states[1])
  assert.equal(db.transactions, 3); assert.equal(requests.length, 1)
})

test('versionchange closes the cached connection and the next read opens again', async () => {
  const { api, requests } = setup(); const first = api.openDB(); const db = succeed(requests[0]); await first
  assert.equal(typeof db.onversionchange, 'function')
  db.onversionchange()
  assert(db.closed)
  const next = api.openDB(); assert.equal(requests.length, 2); const replacement = succeed(requests[1]); assert.equal(await next, replacement)
})

test('unexpected connection close clears the cache', async () => {
  const { api, requests } = setup(); const first = api.openDB(); const db = succeed(requests[0]); await first
  assert.equal(typeof db.onclose, 'function'); db.onclose()
  const next = api.openDB(); assert.equal(requests.length, 2); succeed(requests[1]); await next
})

test('explicit close invalidates the connection without relying on a close event', async () => {
  const { api, requests } = setup(); const pending = api.openDB(); const db = succeed(requests[0]); await pending
  db.close(); assert(db.closed)
  const next = api.openDB(); assert.equal(requests.length, 2); succeed(requests[1]); await next
})

test('an aborted IndexedDB read rejects instead of remaining pending', { timeout: 2000 }, async () => {
  const { api, requests } = setup(); const pending = api.openDB(); const db = succeed(requests[0]); await pending
  db.abortReads = true
  await assert.rejects(api.getFromIndexedDB('state'), /abort/i)
})

test('failed open retries and a blocked late success closes its orphan without replacing a newer connection', async () => {
  const { api, requests } = setup(); const failed = api.openDB()
  requests[0].error = new Error('open failed'); requests[0].onerror()
  await assert.rejects(failed, /open failed/)
  const blocked = api.openDB(); assert.equal(requests.length, 2); requests[1].onblocked()
  await assert.rejects(blocked, /blocked/)
  const next = api.openDB(); assert.equal(requests.length, 3)
  const orphan = succeed(requests[1]); assert(orphan.closed)
  const db = succeed(requests[2]); assert.equal(await next, db); assert.equal(await api.openDB(), db)
})

test('synchronous open failures and unavailable IndexedDB do not poison retries', async () => {
  const { api } = setup()
  global.indexedDB = { open() { throw new Error('privacy failure') } }
  await assert.rejects(api.openDB(), /privacy failure/)
  delete global.indexedDB; await assert.rejects(api.openDB(), /unavailable/)
  const requests = []; global.indexedDB = { open() { const request = {}; requests.push(request); return request } }
  const pending = api.openDB(); succeed(requests[0]); await pending
})

test('an aborted IndexedDB write rejects instead of remaining pending', { timeout: 2000 }, async () => {
  const { api, requests } = setup(); const pending = api.openDB(); const db = succeed(requests[0]); await pending
  db.abortWrites = true
  global.indexedDB.open = () => { const request = {}; queueMicrotask(() => succeed(request, db)); return request }
  await assert.rejects(api.saveToIndexedDB('state', { teams: [], players: [], matches: [] }), /abort/i)
})
