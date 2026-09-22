import type { CompetitionType, Match } from '../types'
import { LEAGUE_MATCHES_PER_TEAM } from './leagueFormat'
import { competitionIdentityForMatch } from './competitionContext'
import { oldestMatches } from './matchChronology'

export function getTeamMatches(matches: Match[], teamId: string): Match[] {
  return oldestMatches(matches.filter((m) => m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId))))
}

/** MatchDay is a competition-scoped schedule number, never actual chronology. */
export function getNextMatchDayForTeam(teamId: string, matches: Match[], completedSeasons: string[] = [], competitionType: CompetitionType = 'league', targetSeason?: string): { season: string; matchDay: number } {
  const teamMatches = getTeamMatches(matches, teamId)
  if (targetSeason) {
    const scopedDays = teamMatches.filter(match => match.season === targetSeason && competitionIdentityForMatch(match).competitionType === competitionType).map(match => competitionIdentityForMatch(match).matchDay).filter(Number.isInteger)
    const next = Math.max(0, ...scopedDays) + 1
    return { season: targetSeason, matchDay: competitionType === 'league' ? Math.min(next, LEAGUE_MATCHES_PER_TEAM) : next }
  }
  if (teamMatches.length === 0) {
    return { season: 'Season 1', matchDay: 1 }
  }

  const lastMatch = teamMatches[teamMatches.length - 1]
  const lastSeasonNum = parseInt(lastMatch.season.replace('Season ', '')) || 1
  
  if (completedSeasons.includes(lastMatch.season)) {
    return { season: `Season ${lastSeasonNum + 1}`, matchDay: 1 }
  }
  // Reaching the League limit alone does not roll the app into a new season. Cup and
  // Champions may still need matches in this season before explicit completion.
  const competitionMatchDays = teamMatches
    .filter(match => match.season === lastMatch.season && competitionIdentityForMatch(match).competitionType === competitionType)
    .map(match => competitionIdentityForMatch(match).matchDay)
    .filter(Number.isInteger)
  const next = Math.max(0, ...competitionMatchDays) + 1
  return { season: `Season ${lastSeasonNum}`, matchDay: competitionType === 'league' ? Math.min(next, LEAGUE_MATCHES_PER_TEAM) : next }
}
