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

test('disabled Cloud Sync does not use Supabase, schedule retries, or touch the existing offline queue', async () => {
  const originalLoad = Module._load
  const originalSetTimeout = global.setTimeout
  const queue = new Map([['legacy-q', { id: 'legacy-q', entityType: 'match', entityId: 'M1', status: 'failed' }]])
  const calls = { client: 0, db: 0, retry: 0 }
  const db = {
    transaction(_name) {
      calls.db++
      const tx = { objectStore: () => ({ getAll: () => ({ result: [...queue.values()] }) }) }
      return tx
    },
  }
  Module._load = function(request, parent, isMain) {
    if (request === './db') return { openDB: async () => db }
    if (request === './supabase') return {
      isCloudSyncEnabled: false,
      getSupabase: () => { calls.client++; throw new Error('Supabase must not be touched while Cloud Sync is disabled') },
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  global.setTimeout = (...args) => { calls.retry++; return originalSetTimeout(...args) }
  const syncPath = require.resolve('../src/lib/sync.ts')
  delete require.cache[syncPath]
  try {
    const { SyncManager } = require('../src/lib/sync.ts')
    const state = { teams: [], players: [], matches: [], competitionStates: [] }
    const disabled = await SyncManager.syncNow()
    await SyncManager.queueOperation({ entityType: 'match', entityId: 'M2', operation: 'delete' })
    await SyncManager.queueStateChange(state, { ...state, matches: [{ id: 'M2' }] })
    assert.equal(disabled.status, 'local-only')
    assert.equal(calls.client, 0)
    assert.equal(calls.db, 0)
    assert.equal(calls.retry, 0)
    assert.deepEqual([...queue.keys()], ['legacy-q'])
  } finally {
    Module._load = originalLoad
    global.setTimeout = originalSetTimeout
    delete require.cache[syncPath]
  }
})

test('Cloud Sync requires an explicit opt-in build flag', () => {
  const source = fs.readFileSync(require.resolve('../src/lib/supabase.ts'), 'utf8')
  assert.match(source, /VITE_ENABLE_CLOUD_SYNC\s*===\s*['"]true['"]/, 'the build must default Cloud Sync off')
})

test('GitHub Pages build pins the production Supabase URL and cannot target Staging', () => {
  const workflow = fs.readFileSync(require.resolve('../.github/workflows/deploy.yml'), 'utf8')
  assert.match(workflow, /VITE_ENABLE_CLOUD_SYNC:\s*['"]false['"]?/)
  assert.match(workflow, /VITE_SUPABASE_URL:\s*https:\/\/mztsniphpalgwdpvcqor\.supabase\.co/)
  assert.doesNotMatch(workflow, /jpmgxogvoxavoesepikv/)
})
