const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJS },
  }).outputText,
  filename,
)

test('a new edit does not silently assign a cloud base to a v2.5.3 offline queue row', async () => {
  const stores = {
    sync_queue: new Map([['legacy-row', {
      id: 'legacy-row', entityType: 'match', entityId: 'M1', operation: 'upsert',
      payload: { id: 'M1', opponentName: 'offline copy' }, timestamp: 1, status: 'pending',
    }]]),
    sync_metadata: new Map([['meta', {
      lastSyncedUserId: 'u1', lastSyncAt: 0, retryAt: 0,
      entityCloudRevision: { 'match:M1': 8 }, entityCloudUpdatedAt: {},
    }]]),
  }
  const db = {
    transaction(name) {
      const tx = { oncomplete: undefined, onerror: undefined }
      tx.objectStore = () => ({
        getAll() {
          const request = {}
          queueMicrotask(() => { request.result = [...stores[name].values()]; request.onsuccess?.() })
          return request
        },
        get(key) {
          const request = {}
          queueMicrotask(() => { request.result = stores[name].get(key); request.onsuccess?.() })
          return request
        },
        put(value, key) {
          stores[name].set(key ?? value.id, value)
          queueMicrotask(() => tx.oncomplete?.())
        },
        delete(key) { stores[name].delete(key) },
      })
      return tx
    },
  }
  const originalLoad = Module._load
  Module._load = function(request, parent, isMain) {
    if (request === './db') return { openDB: async () => db }
    if (request === './supabase') return { isCloudSyncEnabled: true, getSupabase: () => null }
    return originalLoad.call(this, request, parent, isMain)
  }
  const syncPath = require.resolve('../src/lib/sync.ts')
  delete require.cache[syncPath]
  try {
    const { SyncManager } = require('../src/lib/sync.ts')
    await SyncManager.queueOperation({
      entityType: 'match', entityId: 'M1', operation: 'upsert',
      payload: { id: 'M1', opponentName: 'offline copy plus latest edit' },
    })
    const [row] = [...stores.sync_queue.values()]
    assert.equal(stores.sync_queue.size, 1)
    assert.equal(row.baseRevision, undefined)
    assert.equal(row.payload.opponentName, 'offline copy plus latest edit')
  } finally {
    Module._load = originalLoad
    delete require.cache[syncPath]
  }
})
