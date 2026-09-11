import { getSupabase } from './supabase'
import { squadImportErrorMessage } from './apiFootballError'

export type ApiFootballSquadPlayer = { id: number; name: string; age?: number; number?: number | null; position?: string; photo?: string }
export type ApiFootballPlayerSearchResult = ApiFootballSquadPlayer & { firstname?: string; lastname?: string; nationality?: string; currentTeam?: string }
const squadCache = new Map<number, Promise<ApiFootballSquadPlayer[]>>()

/** API-Sports documents this stable image route for players without a photo field. */
export function apiFootballPlayerPhotoUrl(player: Pick<ApiFootballSquadPlayer, 'id' | 'photo'>): string | undefined {
  const photo = player.photo?.trim()
  if (photo) return photo
  return Number.isSafeInteger(player.id) && player.id > 0 ? `https://media.api-sports.io/football/players/${player.id}.png` : undefined
}

/** Numeric input is an exact API-Football player ID, never a name-search term. */
export function apiFootballPlayerIdQuery(query: string): number | undefined {
  const trimmed = query.trim()
  if (!/^\d+$/.test(trimmed)) return undefined
  const id = Number(trimmed)
  return Number.isSafeInteger(id) && id > 0 ? id : undefined
}
export function clearApiFootballSquadCache(externalTeamId?: number) { if (externalTeamId === undefined) squadCache.clear(); else squadCache.delete(externalTeamId) }
export async function fetchApiFootballSquad(externalTeamId: number, options: { forceRefresh?: boolean } = {}): Promise<ApiFootballSquadPlayer[]> {
  if (options.forceRefresh) squadCache.delete(externalTeamId)
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
  return data.players.map((player: ApiFootballSquadPlayer) => ({ ...player, photo: apiFootballPlayerPhotoUrl(player) }))
}

export async function searchApiFootballPlayers(query: string): Promise<ApiFootballPlayerSearchResult[]> {
  const exactId = apiFootballPlayerIdQuery(query)
  if (exactId === undefined) return []
  return [await fetchApiFootballPlayer(exactId)]
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
  return { ...data.player, photo: apiFootballPlayerPhotoUrl(data.player) }
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
