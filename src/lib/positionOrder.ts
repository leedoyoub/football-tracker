import type { Appearance, Player, Position } from '../types'

/** Shared presentation order for match-day player lists. */
export const POSITION_ORDER: readonly Position[] = [
  'GK', 'CB', 'LCB', 'RCB', 'LB', 'LWB', 'RB', 'RWB',
  'CDM', 'LDM', 'RDM', 'CM', 'LCM', 'RCM', 'LM', 'RM',
  'CAM', 'LW', 'RW', 'SS', 'LST', 'RST', 'ST',
]

const ranks = new Map(POSITION_ORDER.map((position, index) => [position, index]))

export function positionRank(position?: string): number {
  return ranks.get(position as Position) ?? POSITION_ORDER.length
}

/** Returns a new array; player records and their stored positions are never changed. */
export function sortPlayersByPosition<T extends Player>(players: readonly T[], appearances?: readonly Appearance[]): T[] {
  const matchPositions = new Map(appearances?.map(appearance => [appearance.playerId, appearance.matchPosition ?? appearance.position]))
  return players
    .map((player, index) => ({ player, index, rank: positionRank(matchPositions.get(player.id) ?? player.position) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ player }) => player)
}
