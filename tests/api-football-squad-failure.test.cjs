const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)
const { squadImportErrorMessage } = require('../src/lib/apiFootballError.ts')
const edge = fs.readFileSync(require.resolve('../supabase/functions/api-football-squad/index.ts'), 'utf8')

test('squad function keeps the frontend request contract', () => {
  assert(edge.includes("(await request.json()).externalTeamId"))
  assert(edge.includes("url.searchParams.set('team', String(externalTeamId))"))
  assert(edge.includes("'https://v3.football.api-sports.io/players/squads'"))
})

test('squad function has explicit safe failure paths', () => {
  for (const code of ['INVALID_REQUEST', 'AUTHENTICATION_REQUIRED', 'API_FOOTBALL_NOT_CONFIGURED', 'API_FOOTBALL_RATE_LIMIT', 'UPSTREAM_AUTH_ERROR', 'UPSTREAM_ACCESS_DENIED', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_TIMEOUT', 'INVALID_UPSTREAM_JSON', 'INVALID_UPSTREAM_RESPONSE', 'NO_SQUAD_RETURNED']) assert(edge.includes(`'${code}'`))
  for (const status of ['status === 401', 'status === 403', 'status === 429', 'status === 404']) assert(edge.includes(status))
})

test('diagnostic logging never includes credentials or request headers', () => {
  assert(edge.includes("logFailure('api-key-check')"))
  assert(!edge.includes('console.error(request'))
  assert(!edge.includes('console.error(apiKey'))
  assert(!edge.includes('console.error(auth'))
  assert(!edge.includes('API_FOOTBALL_KEY:'))
})

test('frontend turns a structured edge error into a concise safe message', async () => {
  const error = { context: new Response(JSON.stringify({ error: 'API_FOOTBALL_RATE_LIMIT', message: 'ignored' }), { headers: { 'Content-Type': 'application/json' } }) }
  assert.equal(await squadImportErrorMessage(error), 'API-Football request limit reached. Try again later.')
  assert.equal(await squadImportErrorMessage({ context: new Response('not json') }), 'Could not load the squad. Check your connection and try again.')
})
