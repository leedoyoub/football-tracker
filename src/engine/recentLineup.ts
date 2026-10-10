
import type { Match } from '../types.ts'
import { kickoffLineupForMatch, validateKickoffLineup } from './kickoffLineup.ts'
import { newestMatches } from './matchChronology.ts'
import { isRecordedForTeam } from './matchPerspective.ts'

export function getMostRecentStartingLineup(matches: Match[], teamId: string): Record<string, string> | null {
  return getMostRecentMatchLineup(matches, teamId)?.starters ?? null
}

/** Bench order belongs to the same valid match that supplied the kickoff XI. */
export function getMostRecentMatchLineup(matches: Match[], teamId: string): { starters: Record<string, string>; bench: string[] } | null {
  const teamMatches = newestMatches(matches.filter(match => isRecordedForTeam(match, teamId)))
  for (const match of teamMatches) {
    const kickoff = kickoffLineupForMatch(match, teamId)
    if (!validateKickoffLineup(kickoff).valid) continue
    const starters = Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
    const starterIds = new Set(Object.values(starters))
    const bench = [...new Set((match.appearances ?? []).filter(appearance => appearance.teamId === teamId && appearance.role === 'bench' && !starterIds.has(appearance.playerId)).map(appearance => appearance.playerId))]
    return { starters, bench }
  }
  return null
}
