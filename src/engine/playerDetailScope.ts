import type { Match } from '../types'
import { newestMatches } from './matchChronology'

export function latestAppearanceTeamId(playerId: string, scopedMatches: Match[]): string | undefined {
  for (const match of newestMatches(scopedMatches)) {
    const appearance = match.appearances.find(row => row.playerId === playerId)
    if (appearance) return appearance.teamId
  }
}
