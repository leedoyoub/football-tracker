import type { Player } from '../types'

export const TEAM_ROSTER_LIMIT = 23

export function currentTeamIds(player: Pick<Player, 'teamId' | 'teamIds'>): string[] {
  return [...new Set((player.teamIds ?? (player.teamId ? [player.teamId] : [])).filter(Boolean))]
}

export function rosterCount(players: Player[], teamId: string, exceptPlayerId?: string): number {
  return players.filter(player => player.id !== exceptPlayerId && currentTeamIds(player).includes(teamId)).length
}

export class RosterCapacityError extends Error {
  readonly teamId: string
  constructor(teamId: string) { super(`Team roster is full: ${teamId}`); this.teamId = teamId }
}

/** Only new memberships are guarded: imported over-capacity history remains untouched. */
export function assertRosterCapacity(players: Player[], playerId: string, previousIds: string[], requestedIds: string[]) {
  for (const teamId of requestedIds) {
    if (previousIds.includes(teamId)) continue
    if (rosterCount(players, teamId, playerId) >= TEAM_ROSTER_LIMIT) throw new RosterCapacityError(teamId)
  }
}
