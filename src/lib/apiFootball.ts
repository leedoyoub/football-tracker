import { supabase } from './supabase'

export type ApiFootballSquadPlayer = { id: number; name: string; age?: number; number?: number | null; position?: string; photo?: string }
export async function fetchApiFootballSquad(externalTeamId: number): Promise<ApiFootballSquadPlayer[]> {
  if (!supabase) throw new Error('Sign in is required to import a squad.')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sign in is required to import a squad.')
  const { data, error } = await supabase.functions.invoke('api-football-squad', { body: { externalTeamId } })
  if (error) throw error
  if (!Array.isArray(data?.players)) throw new Error('Invalid squad response.')
  return data.players
}
