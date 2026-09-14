import type { CompetitionType, Match } from '../types'

export function getTeamMatches(matches: Match[], teamId: string): Match[] {
  return matches
    .filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)))
    .sort((a, b) => {
      const seasonA = parseInt(a.season.replace('Season ', '')) || 0
      const seasonB = parseInt(b.season.replace('Season ', '')) || 0
      return seasonA - seasonB || a.matchDay - b.matchDay
    })
}

/** MatchDay is a competition-scoped schedule number, never actual chronology. */
export function getNextMatchDayForTeam(teamId: string, matches: Match[], completedSeasons: string[] = [], competitionType: CompetitionType = 'league'): { season: string; matchDay: number } {
  const teamMatches = getTeamMatches(matches, teamId)
  if (teamMatches.length === 0) {
    return { season: 'Season 1', matchDay: 1 }
  }

  const lastMatch = teamMatches[teamMatches.length - 1]
  const lastSeasonNum = parseInt(lastMatch.season.replace('Season ', '')) || 1
  
  if (completedSeasons.includes(lastMatch.season)) {
    return { season: `Season ${lastSeasonNum + 1}`, matchDay: 1 }
  }
  // League MD38 alone no longer rolls the app into a new season. Cup and
  // Champions may still need matches in this season before explicit completion.
  const competitionMatchDays = teamMatches
    .filter(match => match.season === lastMatch.season && (match.competitionType ?? 'league') === competitionType)
    .map(match => match.matchDay)
    .filter(Number.isInteger)
  return { season: `Season ${lastSeasonNum}`, matchDay: Math.max(0, ...competitionMatchDays) + 1 }
}
