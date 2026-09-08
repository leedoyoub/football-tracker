import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const auth = request.headers.get('Authorization')
  if (!auth) return json({ error: 'Authentication required' }, 401)
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return json({ error: 'Authentication required' }, 401)
  let externalTeamId: unknown
  try { externalTeamId = (await request.json()).externalTeamId } catch { return json({ error: 'Invalid JSON body' }, 400) }
  if (!Number.isInteger(externalTeamId) || Number(externalTeamId) <= 0) return json({ error: 'externalTeamId must be a positive integer' }, 400)
  const apiKey = Deno.env.get('API_FOOTBALL_KEY')
  if (!apiKey) return json({ error: 'Squad import is not configured' }, 503)
  try {
    const response = await fetch(`https://v3.football.api-sports.io/players/squads?team=${externalTeamId}`, { headers: { 'x-apisports-key': apiKey } })
    if (!response.ok) return json({ error: 'Squad provider unavailable' }, response.status === 429 ? 429 : 502)
    const payload = await response.json(); const players = payload?.response?.[0]?.players
    if (!Array.isArray(players)) return json({ error: 'Malformed squad response' }, 502)
    return json({ players: players.map((player: { id?: number; name?: string; age?: number; number?: number | null; position?: string; photo?: string }) => ({ id: player.id, name: player.name, age: player.age, number: player.number ?? null, position: player.position, photo: player.photo })).filter((player: { id?: number; name?: string }) => Number.isInteger(player.id) && Boolean(player.name)) })
  } catch { return json({ error: 'Could not reach squad provider' }, 502) }
})
