import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set(['https://leedoyoub.github.io', 'http://127.0.0.1:5174', 'http://localhost:5174'])
const FETCH_TIMEOUT_MS = 8_000

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin')
  return { 'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://leedoyoub.github.io', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' }
}
function jsonResponse(request: Request, body: unknown, status = 200): Response { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } }) }
type ErrorCode = 'AUTHENTICATION_REQUIRED' | 'INVALID_REQUEST' | 'API_FOOTBALL_NOT_CONFIGURED' | 'API_FOOTBALL_RATE_LIMIT' | 'API_FOOTBALL_NOT_FOUND' | 'UPSTREAM_AUTH_ERROR' | 'UPSTREAM_ACCESS_DENIED' | 'UPSTREAM_API_ERROR' | 'UPSTREAM_NETWORK_ERROR' | 'UPSTREAM_TIMEOUT' | 'INVALID_UPSTREAM_JSON' | 'INVALID_UPSTREAM_RESPONSE' | 'NO_SQUAD_RETURNED' | 'INTERNAL_ERROR'
function failure(request: Request, error: ErrorCode, message: string, status: number) { return jsonResponse(request, { error, message }, status) }

// Never log request data, headers, upstream bodies, or secrets.
function logFailure(stage: string, details: Record<string, string | number | undefined> = {}) { console.error('[api-football-squad] failure', { stage, ...details }) }
function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return sanitizeMessage(message)
}
function sanitizeMessage(message: string): string {
  return message.replace(/https?:\/\/\S+/gi, '[url]').replace(/bearer\s+\S+/gi, 'Bearer [redacted]').replace(/(?:api[_-]?key|token|authorization)\s*[:=]\s*\S+/gi, '[redacted]').slice(0, 160)
}
function logProviderFailure(stage: string, upstreamStatus: number, apiErrorType: string, sanitizedMessage: string) {
  logFailure(stage, { upstreamStatus, apiErrorType, sanitizedMessage })
}
function providerErrorDetails(payload: unknown): { apiErrorType: string; sanitizedMessage: string } {
  const errors = payload && typeof payload === 'object' ? (payload as { errors?: unknown }).errors : undefined
  if (typeof errors === 'string') return { apiErrorType: 'errors', sanitizedMessage: sanitizeMessage(errors) || 'API-Football reported an error.' }
  if (Array.isArray(errors)) {
    const first = errors.find((entry): entry is string => typeof entry === 'string')
    return { apiErrorType: 'errors', sanitizedMessage: first ? sanitizeMessage(first) : 'API-Football reported an error.' }
  }
  if (errors && typeof errors === 'object') {
    const entry = Object.entries(errors as Record<string, unknown>)[0]
    const apiErrorType = entry ? entry[0].replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 64) || 'unknown' : 'unknown'
    const value = entry?.[1]
    return { apiErrorType, sanitizedMessage: typeof value === 'string' ? sanitizeMessage(value) : 'API-Football reported an error.' }
  }
  return { apiErrorType: 'unknown', sanitizedMessage: 'API-Football reported an error.' }
}
function upstreamFailure(request: Request, status: number) {
  logProviderFailure('api-football-http-error', status, `http-${status}`, 'API-Football returned an HTTP error.')
  if (status === 401) return failure(request, 'UPSTREAM_AUTH_ERROR', 'API-Football could not authorize the squad request.', 502)
  if (status === 403) return failure(request, 'UPSTREAM_ACCESS_DENIED', 'API-Football denied the squad request.', 502)
  if (status === 429) return failure(request, 'API_FOOTBALL_RATE_LIMIT', 'API-Football request limit reached. Try again later.', 429)
  if (status === 404) return failure(request, 'API_FOOTBALL_NOT_FOUND', 'API-Football could not find this team squad.', 404)
  return failure(request, 'UPSTREAM_API_ERROR', 'API-Football could not complete the squad request.', 502)
}
function hasProviderError(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const errors = (payload as { errors?: unknown }).errors
  if (Array.isArray(errors)) return errors.length > 0
  if (typeof errors === 'string') return errors.length > 0
  return Boolean(errors && typeof errors === 'object' && Object.keys(errors).length)
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return failure(request, 'INVALID_REQUEST', 'Method not allowed.', 405)
  const auth = request.headers.get('Authorization')
  if (!auth) return failure(request, 'AUTHENTICATION_REQUIRED', 'Authentication is required to import a squad.', 401)
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) { logFailure('auth-check', { errorType: error?.name }); return failure(request, 'AUTHENTICATION_REQUIRED', 'Your session has expired. Please sign in again.', 401) }
  } catch (error) {
    logFailure('auth-check', { errorType: error instanceof Error ? error.name : 'UnknownError', errorMessage: safeErrorMessage(error) })
    return failure(request, 'INTERNAL_ERROR', 'Could not verify your session. Please try again.', 500)
  }
  let externalTeamId: unknown
  try { externalTeamId = (await request.json()).externalTeamId } catch { logFailure('request-parse'); return failure(request, 'INVALID_REQUEST', 'Request body must be valid JSON.', 400) }
  if (!Number.isInteger(externalTeamId) || Number(externalTeamId) <= 0) { logFailure('request-validation'); return failure(request, 'INVALID_REQUEST', 'externalTeamId must be a positive integer.', 400) }
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')
  if (!apiKey) { logFailure('api-key-check'); return failure(request, 'API_FOOTBALL_NOT_CONFIGURED', 'Squad import is not configured.', 503) }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  let providerResponse: Response
  try {
    const url = new URL('https://v3.football.api-sports.io/players/squads')
    url.searchParams.set('team', String(externalTeamId))
    providerResponse = await fetch(url, { headers: { 'x-apisports-key': apiKey }, signal: controller.signal })
  } catch (error) {
    const timedOut = controller.signal.aborted
    logFailure(timedOut ? 'api-football-timeout' : 'api-football-fetch', { errorType: error instanceof Error ? error.name : 'UnknownError', errorMessage: safeErrorMessage(error) })
    return failure(request, timedOut ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK_ERROR', timedOut ? 'API-Football did not respond in time.' : 'Could not reach API-Football.', timedOut ? 504 : 502)
  } finally { clearTimeout(timeout) }
  if (!providerResponse.ok) return upstreamFailure(request, providerResponse.status)
  let payload: unknown
  try { payload = await providerResponse.json() } catch (error) { logProviderFailure('api-football-invalid-json', providerResponse.status, 'invalid-json', safeErrorMessage(error)); return failure(request, 'INVALID_UPSTREAM_JSON', 'API-Football returned an invalid response.', 502) }
  if (hasProviderError(payload)) { const details = providerErrorDetails(payload); logProviderFailure('api-football-api-error', providerResponse.status, details.apiErrorType, details.sanitizedMessage); return failure(request, 'UPSTREAM_API_ERROR', 'API-Football could not complete the squad request.', 502) }
  const response = payload && typeof payload === 'object' ? (payload as { response?: unknown }).response : undefined
  if (!Array.isArray(response)) { logProviderFailure('api-football-response-shape', providerResponse.status, 'invalid-response-shape', 'Expected an array response from API-Football.'); return failure(request, 'INVALID_UPSTREAM_RESPONSE', 'API-Football returned an unexpected squad response.', 502) }
  const players = response[0] && typeof response[0] === 'object' ? (response[0] as { players?: unknown }).players : undefined
  if (!Array.isArray(players)) { logProviderFailure('api-football-empty-squad', providerResponse.status, 'empty-squad', 'API-Football returned no squad players.'); return failure(request, 'NO_SQUAD_RETURNED', 'No squad was returned for this team.', 404) }
  return jsonResponse(request, { players: players.map((player: { id?: number; name?: string; age?: number; number?: number | null; position?: string; photo?: string }) => ({ id: player.id, name: player.name, age: player.age, number: player.number ?? null, position: player.position, photo: player.photo })).filter((player: { id?: number; name?: string }) => Number.isInteger(player.id) && Boolean(player.name)) })
})
