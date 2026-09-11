const assert = require('node:assert/strict')
const fs = require('node:fs')
const test = require('node:test')
const ts = require('typescript')

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename)
const { squadImportErrorCode, squadImportErrorMessage } = require('../src/lib/apiFootballError.ts')
const edge = fs.readFileSync(require.resolve('../supabase/functions/api-football-squad/index.ts'), 'utf8')

test('squad function keeps the frontend request contract', () => {
  assert(edge.includes("(await request.json()).externalTeamId"))
  assert(edge.includes("url.searchParams.set('team', String(externalTeamId))"))
  assert(edge.includes("'https://v3.football.api-sports.io/players/squads'"))
})

test('squad function has explicit safe failure paths', () => {
  for (const code of ['INVALID_REQUEST', 'AUTHENTICATION_REQUIRED', 'API_FOOTBALL_NOT_CONFIGURED', 'API_FOOTBALL_RATE_LIMIT', 'UPSTREAM_AUTH_ERROR', 'UPSTREAM_ACCESS_DENIED', 'UPSTREAM_NETWORK_ERROR', 'UPSTREAM_TIMEOUT', 'INVALID_UPSTREAM_JSON', 'INVALID_UPSTREAM_RESPONSE', 'NO_SQUAD_RETURNED']) assert(edge.includes(`'${code}'`))
  for (const status of ['status === 401', 'status === 403', 'status === 429', 'status === 404']) assert(edge.includes(status))
  assert(edge.includes("'http://localhost:5173'"))
  assert(edge.includes('for (let attempt = 0; attempt < 2; attempt++)'))
  assert(edge.includes('providerResponse.status < 500'))
})

test('provider response failures use safe structured diagnostics', () => {
  assert(edge.includes("logProviderFailure('api-football-http-error', status, `http-${status}`"))
  assert(edge.includes("logProviderFailure('api-football-api-error', providerResponse.status, details.apiErrorType, details.sanitizedMessage)"))
  assert(edge.includes("logProviderFailure('api-football-response-shape', providerResponse.status"))
  assert(edge.includes("logProviderFailure('api-football-empty-squad', providerResponse.status"))
  assert(edge.includes('function providerErrorDetails(payload: unknown)'))
  assert(edge.includes('function logProviderFailure(stage: string, upstreamStatus: number, apiErrorType: string, sanitizedMessage: string)'))
})

test('diagnostic logging never includes credentials, headers, or entire provider responses', () => {
  assert(edge.includes("logFailure('api-key-check')"))
  assert(!edge.includes('console.error(request'))
  assert(!edge.includes('console.error(apiKey'))
  assert(!edge.includes('console.error(auth'))
  assert(!edge.includes('API_FOOTBALL_KEY:'))
  assert(!edge.includes('console.error(payload'))
  assert(!edge.includes('console.error(providerResponse'))
})

test('frontend turns a structured edge error into a concise safe message', async () => {
  const error = { context: new Response(JSON.stringify({ error: 'API_FOOTBALL_RATE_LIMIT', message: 'ignored' }), { headers: { 'Content-Type': 'application/json' } }) }
  assert.equal(await squadImportErrorMessage(error), 'API-Football request limit reached. Try again later.')
  assert.equal(await squadImportErrorMessage({ context: new Response('not json') }), 'Could not load the squad. Check your connection and try again.')
})

test('frontend keeps actionable structured squad failures distinct', async () => {
  for (const [code, message] of [
    ['AUTHENTICATION_REQUIRED', 'Your session expired. Please sign in again.'],
    ['API_FOOTBALL_NOT_CONFIGURED', 'Squad import is unavailable: API-Football is not configured on the server.'],
    ['UPSTREAM_AUTH_ERROR', 'API-Football rejected the server credentials. Please contact the app administrator.'],
    ['UPSTREAM_ACCESS_DENIED', 'API-Football access was denied. Check the server subscription or permissions.'],
    ['UPSTREAM_TIMEOUT', 'API-Football took too long to respond. Try again.'],
    ['INVALID_UPSTREAM_RESPONSE', 'API-Football returned an unexpected squad response. Please try again later.'],
    ['NO_SQUAD_RETURNED', 'No squad was returned for this team.'],
  ]) {
    const error = { context: new Response(JSON.stringify({ error: code }), { headers: { 'Content-Type': 'application/json' } }) }
    assert.equal(await squadImportErrorCode(error), code)
    assert.equal(await squadImportErrorMessage(error), message)
  }
})
