const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { test } = require('node:test')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, filename)

const { LAST_ROUTE_STORAGE_KEY, clearLastRoute, loadLastRoute, saveLastRoute, validRestoredView } = require('../src/lib/lastRoute.ts')
const state = {
  teams: [{ id: 'real-madrid', name: 'Real Madrid' }],
  players: [{ id: 'player-7', name: 'Player Seven' }],
  matches: [{ id: 'match-1', appearances: [], events: [] }],
}
const memory = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key), data }
}

test('last route uses stable IDs and restores valid team, player, results, and draft match routes', () => {
  const storage = memory()
  saveLastRoute({ name: 'team', id: 'real-madrid' }, undefined, storage)
  assert.deepEqual(JSON.parse(storage.getItem(LAST_ROUTE_STORAGE_KEY)), { name: 'team', id: 'real-madrid' })
  assert.deepEqual(loadLastRoute(state, storage), { name: 'team', id: 'real-madrid' })
  saveLastRoute({ name: 'player', id: 'player-7' }, undefined, storage)
  assert.deepEqual(loadLastRoute(state, storage), { name: 'player', id: 'player-7' })
  saveLastRoute({ name: 'results' }, undefined, storage)
  assert.deepEqual(loadLastRoute(state, storage), { name: 'results' })
  saveLastRoute({ name: 'new-match' }, { id: 'draft-1', teamId: 'real-madrid', homeTeamId: 'real-madrid', appearances: [], events: [] }, storage)
  assert.deepEqual(loadLastRoute(state, storage), { name: 'new-match', teamId: 'real-madrid' })
})

test('corrupt, unknown, and missing-reference routes safely return Home', () => {
  const storage = memory()
  storage.setItem(LAST_ROUTE_STORAGE_KEY, '{bad json')
  assert.deepEqual(loadLastRoute(state, storage), { name: 'home' })
  storage.setItem(LAST_ROUTE_STORAGE_KEY, JSON.stringify({ name: 'not-a-screen' }))
  assert.deepEqual(loadLastRoute(state, storage), { name: 'home' })
  assert.equal(validRestoredView({ name: 'team', id: 'missing' }, state), null)
  assert.equal(validRestoredView({ name: 'player', id: 'missing' }, state), null)
  assert.equal(validRestoredView({ name: 'match', id: 'missing' }, state), null)
})

test('logout cleanup removes device-only navigation state', () => {
  const storage = memory()
  saveLastRoute({ name: 'player', id: 'player-7' }, undefined, storage)
  clearLastRoute(storage)
  assert.equal(storage.getItem(LAST_ROUTE_STORAGE_KEY), null)
})

test('route state is local-only and logout calls its cleanup', () => {
  const routeSource = fs.readFileSync(require.resolve('../src/lib/lastRoute.ts'), 'utf8')
  const authSource = fs.readFileSync(require.resolve('../src/lib/auth.tsx'), 'utf8')
  assert(!routeSource.includes('SyncManager') && !routeSource.includes('supabase'))
  assert(authSource.includes('clearLastRoute()'))
})
