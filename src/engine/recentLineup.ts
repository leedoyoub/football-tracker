
import type { Match } from '../types.ts'
import { kickoffLineupForMatch, validateKickoffLineup } from './kickoffLineup.ts'
import { compareMatchChronology } from './matchChronology.ts'

export function getMostRecentStartingLineup(matches: Match[], teamId: string): Record<string, string> | null {
  const teamMatches = matches
    .filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)))
    .slice().sort((a, b) => compareMatchChronology(b, a))

  for (const match of teamMatches) {
    const kickoff = kickoffLineupForMatch(match, teamId)
    if (!validateKickoffLineup(kickoff).valid) continue
    return Object.fromEntries(kickoff.map(slot => [slot.id, slot.playerId!]))
  }
  return null
}
