
import type { Match } from '../types.ts'
import { kickoffLineupForMatch, validateKickoffLineup } from './kickoffLineup.ts'
import { newestMatches } from './matchChronology.ts'
import { isRecordedForTeam } from './matchPerspective.ts'

export function getMostRecentStartingLineup(matches: Match[], teamId: string): Record<string, string> | null {
  const teamMatches = newestMatches(matches
    .filter((match) => isRecordedForTeam(match, teamId)))

  for (const match of teamMatches) {
    const kickoff = kickoffLineupForMatch(match, teamId)
    if (!validateKickoffLineup(kickoff).valid) continue
    return Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
  }
  return null
}
