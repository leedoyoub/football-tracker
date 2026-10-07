import type { Match } from '../types'
import { competitionIdentityForMatch, matchCompetitionType } from './competitionContext'
import { recordedTeamId } from './matchPerspective'
import { LEAGUE_MATCHES_PER_TEAM } from './leagueFormat'

/** Explicitly owned records occupy one team's slot; old direct fixtures occupy both. */
export function leagueSlotTeamIds(match: Match): string[] {
  return match.teamId ? [recordedTeamId(match)] : [...new Set([match.homeTeamId, match.awayTeamId])]
}

export function leagueSlotCounts(matches: Match[], season: string): Map<string, Map<number, number>> {
  const counts = new Map<string, Map<number, number>>()
  for (const match of matches) {
    if (match.season !== season || matchCompetitionType(match) !== 'league') continue
    const day = competitionIdentityForMatch(match).matchDay
    for (const teamId of leagueSlotTeamIds(match)) {
      const days = counts.get(teamId) ?? new Map<number, number>()
      days.set(day, (days.get(day) ?? 0) + 1)
      counts.set(teamId, days)
    }
  }
  return counts
}

export function firstMissingLeagueSlot(days: ReadonlyMap<number, number> | undefined): number {
  for (let day = 1; day <= LEAGUE_MATCHES_PER_TEAM; day++) if (!days?.has(day)) return day
  return LEAGUE_MATCHES_PER_TEAM
}

export function hasCompleteLeagueSlots(days: ReadonlyMap<number, number> | undefined): boolean {
  return Boolean(days && days.size === LEAGUE_MATCHES_PER_TEAM && [...days].every(([day, count]) => day >= 1 && day <= LEAGUE_MATCHES_PER_TEAM && count === 1))
}
