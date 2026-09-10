import { getSupabase } from './supabase'
import { squadImportErrorMessage } from './apiFootballError'
import { playerSearchMatches } from './normalizedSearch'

export type ApiFootballSquadPlayer = { id: number; name: string; age?: number; number?: number | null; position?: string; photo?: string }
export type ApiFootballPlayerSearchResult = ApiFootballSquadPlayer & { firstname?: string; lastname?: string; nationality?: string; currentTeam?: string }
const squadCache = new Map<number, Promise<ApiFootballSquadPlayer[]>>()

/** Numeric input is an exact API-Football player ID, never a name-search term. */
export function apiFootballPlayerIdQuery(query: string): number | undefined {
  const trimmed = query.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const id = Number(trimmed)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
export async function fetchApiFootballSquad(externalTeamId: number): Promise<ApiFootballSquadPlayer[]> {
  const cached = squadCache.get(externalTeamId)
  if (cached) return cached
  const request = fetchApiFootballSquadUncached(externalTeamId).catch(error => { squadCache.delete(externalTeamId); throw error })
  squadCache.set(externalTeamId, request)
  return request
}
async function fetchApiFootballSquadUncached(externalTeamId: number): Promise<ApiFootballSquadPlayer[]> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Sign in is required to import a squad.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in is required to import a squad.')
  const { data, error } = await supabase.functions.invoke('api-football-squad', { body: { externalTeamId } })
  if (error) throw new Error(await squadImportErrorMessage(error))
  if (!Array.isArray(data?.players)) throw new Error('Invalid squad response.')
  return data.players
}

export async function searchApiFootballPlayers(query: string, options: { externalTeamId?: number } = {}): Promise<ApiFootballPlayerSearchResult[]> {
  const exactId = apiFootballPlayerIdQuery(query)
  if (exactId !== undefined) return [await fetchApiFootballPlayer(exactId)]
  if (options.externalTeamId) {
    try {
      const squad = await fetchApiFootballSquad(options.externalTeamId)
      const local = squad.filter(player => playerSearchMatches(query, player))
      if (local.length) return local
    } catch { /* A global authenticated search remains a safe fallback. */ }
  }
  const supabase = getSupabase()
  if (!supabase) throw new Error('Google sign-in is required to search API-Football players.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Google sign-in is required to search API-Football players.')
  const { data, error } = await supabase.functions.invoke('api-football-player-search', { body: { query } })
  if (error) throw error
  if (!Array.isArray(data?.players)) throw new Error('Invalid player search response.')
  return data.players
}

/** Exact lookup is for an already-linked player; it never guesses by name. */
export async function fetchApiFootballPlayer(externalPlayerId: string | number): Promise<ApiFootballPlayerSearchResult> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Google sign-in is required to refresh an API player name.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Google sign-in is required to refresh an API player name.')
  const { data, error } = await supabase.functions.invoke('api-football-player-search', { body: { externalPlayerId } })
  if (error) throw error
  if (!data?.player || typeof data.player.id !== 'number' || typeof data.player.name !== 'string') throw new Error('Invalid player lookup response.')
  return data.player
}

/** Keeps numeric-ID not-found feedback specific without exposing provider details. */
export async function apiFootballPlayerSearchErrorMessage(error: unknown, exactId?: number): Promise<string> {
  const response = error && typeof error === 'object' ? (error as { context?: unknown }).context : undefined
  if (response instanceof Response) {
    if (exactId !== undefined && response.status === 404) return `No API player found for ID ${exactId}.`
    try {
      const body = await response.clone().json() as { error?: unknown }
      if (exactId !== undefined && typeof body.error === 'string' && /not found/i.test(body.error)) return `No API player found for ID ${exactId}.`
      if (typeof body.error === 'string' && body.error.length <= 160) return body.error
    } catch { /* Fall through to a safe client message. */ }
  }
  return exactId !== undefined ? `Could not look up API player ID ${exactId}. Try again later.` : 'Could not search players. Try again later.'
}
