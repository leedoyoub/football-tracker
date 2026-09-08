import { supabase } from './supabase'

export type ApiFootballSquadPlayer = { id: number; name: string; age?: number; number?: number | null; position?: string; photo?: string }
export type ApiFootballPlayerSearchResult = ApiFootballSquadPlayer & { firstname?: string; lastname?: string; nationality?: string; currentTeam?: string }
export async function fetchApiFootballSquad(externalTeamId: number): Promise<ApiFootballSquadPlayer[]> {
  if (!supabase) throw new Error('Sign in is required to import a squad.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in is required to import a squad.')
  const { data, error } = await supabase.functions.invoke('api-football-squad', { body: { externalTeamId } })
  if (error) throw error
  if (!Array.isArray(data?.players)) throw new Error('Invalid squad response.')
  return data.players
}

export async function searchApiFootballPlayers(query: string): Promise<ApiFootballPlayerSearchResult[]> {
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
  if (!supabase) throw new Error('Google sign-in is required to refresh an API player name.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Google sign-in is required to refresh an API player name.')
  const { data, error } = await supabase.functions.invoke('api-football-player-search', { body: { externalPlayerId } })
  if (error) throw error
  if (!data?.player || typeof data.player.id !== 'number' || typeof data.player.name !== 'string') throw new Error('Invalid player lookup response.')
  return data.player
}
