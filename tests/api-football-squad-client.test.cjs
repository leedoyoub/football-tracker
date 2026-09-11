const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const { test } = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)
let invoke
const load = Module._load
Module._load = function(request, parent, isMain) {
  if (request === './supabase' && parent?.filename.endsWith('apiFootball.ts')) return { getSupabase: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } } }) }, functions: { invoke: (...args) => invoke(...args) } }) }
  return load.call(this, request, parent, isMain)
}
const { apiFootballPlayerPhotoUrl, clearApiFootballSquadCache, fetchApiFootballSquad } = require('../src/lib/apiFootball.ts')

test('squad client uses API player photo and falls back to the documented player image route', () => {
  assert.equal(apiFootballPlayerPhotoUrl({ id: 42, photo: 'https://example.test/42.png' }), 'https://example.test/42.png')
  assert.equal(apiFootballPlayerPhotoUrl({ id: 42, photo: ' ' }), 'https://media.api-sports.io/football/players/42.png')
})

test('a rejected cached squad request is cleared so Retry can load a later valid response', async () => {
  clearApiFootballSquadCache()
  let calls = 0
  invoke = async () => {
    calls++
    return calls === 1
      ? { error: { context: new Response(JSON.stringify({ error: 'UPSTREAM_NETWORK_ERROR' }), { headers: { 'Content-Type': 'application/json' } }) } }
      : { data: { players: [{ id: 99, name: 'Recovered player', photo: '' }] }, error: null }
  }
  await assert.rejects(fetchApiFootballSquad(541), /Could not reach API-Football/)
  const players = await fetchApiFootballSquad(541, { forceRefresh: true })
  assert.equal(calls, 2)
  assert.equal(players[0].photo, 'https://media.api-sports.io/football/players/99.png')
})
