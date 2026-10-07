import { recordedOpponentId, recordedTeamId, teamPerspectiveScore } from '../engine/matchPerspective'
import { recentMatches } from '../screens/recentMatches'
import type { Match, Team } from '../types'

export type DerivedResult = { match: Match; teamId: string; opponentId?: string; teamName: string; opponentName: string; goalsFor: number; goalsAgainst: number; outcome: 'W' | 'D' | 'L' }
/** Valid saved results are shared by Results and Home; legacy extra fields are ignored. */
export function isCompletedRecordedMatch(match: Match): boolean {
  return Boolean(match.id && match.homeTeamId && match.awayTeamId && match.homeTeamId !== match.awayTeamId && Array.isArray(match.events) && Array.isArray(match.appearances))
}
export function derivedResults(matches: Match[], teams: Team[]): DerivedResult[] {
  const byId = new Map(teams.map(team => [team.id, team]))
  const unique = [...new Map(matches.map(match => [match.id, match])).values()]
  return recentMatches(unique).map(match => deriveResult(match, byId))
}
export function recentDerivedResults(matches: Match[], teams: Team[], limit = 5): DerivedResult[] {
  const byId = new Map(teams.map(team => [team.id, team]))
  const unique = [...new Map(matches.map(match => [match.id, match])).values()]
  return recentMatches(unique).slice(0, limit).map(match => deriveResult(match, byId))
}
function deriveResult(match: Match, byId: Map<string, Team>): DerivedResult {
    const teamId = recordedTeamId(match)
    const opponentId = recordedOpponentId(match)
    const perspective = teamPerspectiveScore(match, teamId)!
    return { match, teamId, opponentId, teamName: byId.get(teamId)?.name ?? 'Tracked team', opponentName: match.opponentName || byId.get(opponentId)?.name || 'Opponent', ...perspective }
}
