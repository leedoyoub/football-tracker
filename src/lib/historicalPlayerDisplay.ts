import type { Player } from '../types'

/** Presentation only: retain the saved ID without inventing a roster entity,
 * name, shirt number, registration position, or current team membership. */
export function historicalPlayerLabel(playerId: string, player?: Player): string {
  return player?.displayName?.trim() || player?.name || `Historical player (${playerId})`
}
