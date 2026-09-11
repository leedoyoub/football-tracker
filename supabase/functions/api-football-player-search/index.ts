import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set(['https://leedoyoub.github.io', 'http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174'])
const FETCH_TIMEOUT_MS = 8_000
const CURRENT_API_FOOTBALL_SEASON = new Date().getUTCFullYear()
const corsHeaders = (request: Request): HeadersInit => {
  const origin = request.headers.get('Origin')
  return { 'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://leedoyoub.github.io', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin' }
}
const json = (request: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(request), 'Content-Type': 'application/json' } })
type ProviderEntry = { player?: Record<string, unknown>; statistics?: { team?: { name?: string } }[] }
const normalizeForSearch = (value: unknown) => typeof value === 'string' ? value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ') : ''
const matchesQuery = (query: string, player: Record<string, unknown>) => {
  const needle = normalizeForSearch(query)
  const fields = [player.name, player.firstname, player.lastname, [player.firstname, player.lastname].filter(value => typeof value === 'string').join(' ')]
  return fields.some(value => normalizeForSearch(value).includes(needle))
}
const sanitizedPlayer = (entry: ProviderEntry) => {
  const player = entry.player ?? entry
  const statistics = Array.isArray(entry.statistics) ? entry.statistics : []
  return { id: player.id, name: player.name, firstname: player.firstname, lastname: player.lastname, age: player.age, nationality: player.nationality, position: player.position, number: player.number ?? null, photo: player.photo, currentTeam: statistics.find(row => row.team?.name)?.team?.name }
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) })
  if (request.method !== 'POST') return json(request, { error: 'Method not allowed' }, 405)
  const auth = request.headers.get('Authorization')
  if (!auth) return json(request, { error: 'Authentication required' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json(request, { error: 'Authentication required' }, 401)
  let body: { query?: unknown; externalPlayerId?: unknown }
  try { body = await request.json() } catch { return json(request, { error: 'Invalid JSON body' }, 400) }
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const externalPlayerId = typeof body.externalPlayerId === 'number' || typeof body.externalPlayerId === 'string' ? Number(body.externalPlayerId) : NaN
  const exactLookup = Number.isInteger(externalPlayerId) && externalPlayerId > 0
  if (!exactLookup && (query.length < 3 || query.length > 80)) return json(request, { error: 'Search must be between 3 and 80 characters.' }, 400)
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')
  if (!apiKey) return json(request, { error: 'Player search is not configured' }, 503)
  try {
    // API-Football's supported partial-name lookup is /players?search=…&season=….
    const url = new URL('https://v3.football.api-sports.io/players')
    if (exactLookup) url.searchParams.set('id', String(externalPlayerId))
    else url.searchParams.set('search', query)
    url.searchParams.set('season', String(CURRENT_API_FOOTBALL_SEASON))
    let providerResponse: Response | undefined
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
      try { providerResponse = await fetch(url, { headers: { 'x-apisports-key': apiKey }, signal: controller.signal }); if (providerResponse.ok || providerResponse.status < 500 || attempt === 1) break } catch (error) { if (attempt === 1) throw error } finally { clearTimeout(timeout) }
    }
    if (!providerResponse) return json(request, { error: 'Could not reach player provider' }, 502)
    if (!providerResponse.ok) {
      const message = providerResponse.status === 401 ? 'API-Football rejected the server credentials.' : providerResponse.status === 403 ? 'API-Football denied player-search access.' : providerResponse.status === 429 ? 'API-Football request limit reached. Try again later.' : 'Player provider is temporarily unavailable.'
      return json(request, { error: message }, providerResponse.status === 429 ? 429 : 502)
    }
    const payload = await providerResponse.json()
    const providerErrors = payload && typeof payload === 'object' ? (payload as { errors?: unknown }).errors : undefined
    if (providerErrors && (!Array.isArray(providerErrors) || providerErrors.length)) return json(request, { error: 'API-Football reported a player-search error.' }, 502)
    if (!Array.isArray(payload?.response)) return json(request, { error: 'Malformed player response' }, 502)
    const players = payload.response.map(sanitizedPlayer).filter((player: { id?: unknown; name?: unknown }) => Number.isInteger(player.id) && typeof player.name === 'string')
    if (exactLookup) {
      const player = players.find((item: { id: number }) => item.id === externalPlayerId)
      return player ? json(request, { player }) : json(request, { error: 'API player was not found' }, 404)
    }
    // API-Football search is provider-dependent for accents. Normalize only
    // comparisons, never the returned spelling, and keep a short safe list.
    return json(request, { players: players.filter((player: Record<string, unknown>) => matchesQuery(query, player)).slice(0, 20) })
  } catch { return json(request, { error: 'Could not reach player provider' }, 502) }
})
