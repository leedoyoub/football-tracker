import { currentTeamIds } from './roster'
import { TACTICAL_SLOT_DEFINITIONS, tacticalSlotById } from '../engine/tacticalSlots'
import type { Lineup } from '../screens/matchLineup'
import type { Player } from '../types'

export const STARTING_XI_LIMIT = 11
export const MATCH_BENCH_LIMIT = 12

/** Keep the exact tactical positions of recent starters who are still eligible. */
export function sanitizeRecentAssignments(assignments: Record<string, string>, roster: Player[]): Record<string, string> {
  const eligible = new Set(roster.map(player => player.id))
  const next: Record<string, string> = {}
  const used = new Set<string>()
  for (const slot of TACTICAL_SLOT_DEFINITIONS) {
    const playerId = assignments[slot.id]
    if (!playerId || !eligible.has(playerId) || used.has(playerId)) continue
    if (Object.keys(next).length >= STARTING_XI_LIMIT) break
    next[slot.id] = playerId
    used.add(playerId)
  }
  return next
}

/** Derive the three match-day groups from current membership and the two saved assignment lists. */
export function matchdayGroups(roster: Player[], lineup: Lineup): { starters: string[]; bench: string[]; available: Player[] } {
  const byId = new Map(roster.map(player => [player.id, player]))
  const used = new Set<string>()
  const starters: string[] = []
  for (const slot of TACTICAL_SLOT_DEFINITIONS) {
    const playerId = lineup.slotAssignments[slot.id]
    if (!playerId || !byId.has(playerId) || used.has(playerId) || starters.length >= STARTING_XI_LIMIT) continue
    starters.push(playerId)
    used.add(playerId)
  }
  const bench: string[] = []
  for (const playerId of lineup.homeBench) {
    if (!playerId || !byId.has(playerId) || used.has(playerId) || bench.length >= MATCH_BENCH_LIMIT) continue
    bench.push(playerId)
    used.add(playerId)
  }
  return { starters, bench, available: roster.filter(player => !used.has(player.id)) }
}

/** Current roster is the only source for a new match's available player list. */
export function currentMatchdayRoster(players: Player[], teamId: string): Player[] {
  return players.filter(player => currentTeamIds(player).includes(teamId))
}

/** Reject invalid stored or proposed lineup data without changing it. */
export function isValidMatchdayLineup(lineup: Lineup): boolean {
  const assignments = Object.entries(lineup.slotAssignments)
  const starters = assignments.map(([, playerId]) => playerId).filter(Boolean)
  const all = [...starters, ...lineup.homeBench]
  return assignments.length <= STARTING_XI_LIMIT
    && assignments.every(([slotId, playerId]) => Boolean(tacticalSlotById[slotId]) && typeof playerId === 'string' && Boolean(playerId))
    && lineup.homeBench.length <= MATCH_BENCH_LIMIT
    && lineup.homeBench.every(playerId => typeof playerId === 'string' && Boolean(playerId))
    && new Set(all).size === all.length
}
