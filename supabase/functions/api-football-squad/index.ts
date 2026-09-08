import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set([
  'https://leedoyoub.github.io',
  'http://127.0.0.1:5174',
  'http://localhost:5174',
])

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get('Origin')
  // An unrecognised origin receives a non-matching value, never a reflected origin.
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://leedoyoub.github.io'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
}

Deno.serve(async request => {
  // Preflight must complete before checking the Authorization header.
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return jsonResponse(request, { error: 'Method not allowed' }, 405)
  const auth = request.headers.get('Authorization')
  if (!auth) return jsonResponse(request, { error: 'Authentication required' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return jsonResponse(request, { error: 'Authentication required' }, 401)
  let externalTeamId: unknown
  try { externalTeamId = (await request.json()).externalTeamId } catch { return jsonResponse(request, { error: 'Invalid JSON body' }, 400) }
  if (!Number.isInteger(externalTeamId) || Number(externalTeamId) <= 0) return jsonResponse(request, { error: 'externalTeamId must be a positive integer' }, 400)
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')
  if (!apiKey) return jsonResponse(request, { error: 'Squad import is not configured' }, 503)
  try {
    const providerResponse = await fetch(`https://v3.football.api-sports.io/players/squads?team=${externalTeamId}`, { headers: { 'x-apisports-key': apiKey } })
    if (!providerResponse.ok) return jsonResponse(request, { error: 'Squad provider unavailable' }, providerResponse.status === 429 ? 429 : 502)
    const payload = await providerResponse.json(); const players = payload?.response?.[0]?.players
    if (!Array.isArray(players)) return jsonResponse(request, { error: 'Malformed squad response' }, 502)
    return jsonResponse(request, { players: players.map((player: { id?: number; name?: string; age?: number; number?: number | null; position?: string; photo?: string }) => ({ id: player.id, name: player.name, age: player.age, number: player.number ?? null, position: player.position, photo: player.photo })).filter((player: { id?: number; name?: string }) => Number.isInteger(player.id) && Boolean(player.name)) })
  } catch { return jsonResponse(request, { error: 'Could not reach squad provider' }, 502) }
})
