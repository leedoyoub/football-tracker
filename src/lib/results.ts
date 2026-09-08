import { matchScore } from '../engine/rating'
import { recentMatches } from '../screens/recentMatches'
import type { Match, Team } from '../types'

export type DerivedResult = { match: Match; teamId: string; opponentId?: string; teamName: string; opponentName: string; goalsFor: number; goalsAgainst: number; outcome: 'W' | 'D' | 'L' }
export function derivedResults(matches: Match[], teams: Team[]): DerivedResult[] {
  const byId = new Map(teams.map(team => [team.id, team]))
  const unique = [...new Map(matches.map(match => [match.id, match])).values()]
  return recentMatches(unique).map(match => {
    const teamId = match.teamId && byId.has(match.teamId) ? match.teamId : match.homeTeamId
    const isHome = teamId === match.homeTeamId; const score = matchScore(match); const opponentId = isHome ? match.awayTeamId : match.homeTeamId
    const goalsFor = isHome ? score.home : score.away; const goalsAgainst = isHome ? score.away : score.home
    return { match, teamId, opponentId, teamName: byId.get(teamId)?.name ?? 'Tracked team', opponentName: match.opponentName || byId.get(opponentId)?.name || 'Opponent', goalsFor, goalsAgainst, outcome: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L' }
  })
}
