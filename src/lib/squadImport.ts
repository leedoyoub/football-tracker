import type { Player, Position } from '../types'
import { assertRosterCapacity, currentTeamIds, rosterCount, TEAM_ROSTER_LIMIT } from './roster'

export type SquadImportItem = {
  teamId: string
  externalPlayerId: number
  name: string
  number: number
  position: Position
  photoUrl?: string
}

/** API-Football only exposes broad roles. CM is the existing editable new-player default. */
export function importedPosition(apiPosition?: string): Position {
  return apiPosition === 'Goalkeeper' ? 'GK' : 'CM'
}

export function sameExternalPlayer(player: Player, externalPlayerId: number): boolean {
  return player.externalPlayerId !== undefined && String(player.externalPlayerId) === String(externalPlayerId)
}

export function availableRosterSlots(players: Player[], teamId: string): number {
  return Math.max(0, TEAM_ROSTER_LIMIT - rosterCount(players, teamId))
}

export function addsNewMembership(player: Player | undefined, teamId: string): boolean {
  return !player || !currentTeamIds(player).includes(teamId)
}

export function validImportedNumber(value: number | null | undefined): number {
  return Number.isInteger(value) && value! >= 0 && value! <= 99 ? value! : 10
}

/** Builds the complete result before any state persistence, so an invalid batch cannot partially save. */
export function applySquadImport(players: Player[], imports: SquadImportItem[], createId: () => string): Player[] {
  const nextPlayers = [...players]
  const seenExternalIds = new Set<number>()
  for (const item of imports) {
    if (seenExternalIds.has(item.externalPlayerId)) continue
    seenExternalIds.add(item.externalPlayerId)
    const existingIndex = nextPlayers.findIndex((player) => sameExternalPlayer(player, item.externalPlayerId))
    if (existingIndex >= 0) {
      const existing = nextPlayers[existingIndex]
      const previousIds = currentTeamIds(existing)
      const teamIds = [...new Set([...previousIds, item.teamId])]
      assertRosterCapacity(nextPlayers, existing.id, previousIds, teamIds)
      // Existing app identity and user-managed tactical details remain authoritative.
      nextPlayers[existingIndex] = { ...existing, teamIds, teamId: teamIds[0] ?? '', externalPlayerId: item.externalPlayerId, photoUrl: item.photoUrl ?? existing.photoUrl }
      continue
    }
    const id = createId()
    assertRosterCapacity(nextPlayers, id, [], [item.teamId])
    nextPlayers.push({ id, teamId: item.teamId, teamIds: [item.teamId], name: item.name, fullName: item.name, displayName: item.name, number: item.number, position: item.position, externalPlayerId: item.externalPlayerId, photoUrl: item.photoUrl })
  }
  return nextPlayers
}
