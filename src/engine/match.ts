import type { Match } from '../types'

export function getTeamMatches(matches: Match[], teamId: string): Match[] {
  return matches
    .filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId)))
    .sort((a, b) => {
      const seasonA = parseInt(a.season.replace('Season ', '')) || 0
      const seasonB = parseInt(b.season.replace('Season ', '')) || 0
      return seasonA - seasonB || a.matchDay - b.matchDay
    })
}

export function getNextMatchDayForTeam(teamId: string, matches: Match[]): { season: string; matchDay: number } {
  const teamMatches = getTeamMatches(matches, teamId)
  if (teamMatches.length === 0) {
    return { season: 'Season 1', matchDay: 1 }
  }

  const lastMatch = teamMatches[teamMatches.length - 1]
  const lastSeasonNum = parseInt(lastMatch.season.replace('Season ', '')) || 1
  
  if (lastMatch.matchDay < 38) {
    return { season: `Season ${lastSeasonNum}`, matchDay: lastMatch.matchDay + 1 }
  } else {
    return { season: `Season ${lastSeasonNum + 1}`, matchDay: 1 }
  }
}
