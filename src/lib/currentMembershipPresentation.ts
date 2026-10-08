import type { Player, Team } from '../types'
import { currentTeamIds } from './roster'

/** Current-roster label for list and selector UI; historical rows use appearances. */
export function currentMembershipPresentation(player: Pick<Player, 'teamId' | 'teamIds'>, contextTeamIds: string[], teams: (Pick<Team, 'id'> & Partial<Pick<Team, 'shortName' | 'name'>>)[]): { teamId: string; label: string } {
  const membership = currentTeamIds(player)
  const contextual = contextTeamIds.find(id => membership.includes(id))
  const teamId = contextual ?? membership[0] ?? ''
  const team = teams.find(team => team.id === teamId)
  const label = team?.shortName ?? team?.name ?? (teamId || 'No Team')
  return { teamId, label: contextual ? label : membership.length > 1 ? `${label} +${membership.length - 1}` : label }
}
