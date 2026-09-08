import { matchScore } from './rating'
import type { Match, Team } from '../types'

export type Standing = {
  rank: number
  teamId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

/** Builds the table directly from saved results; no standings state is persisted. */
export function seasonStandings(teams: Team[], matches: Match[], season: string): Standing[] {
  const rows = new Map(teams.map((team) => [team.id, {
    rank: 0, teamId: team.id, played: 0, wins: 0, draws: 0, losses: 0,
    goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
  }]))

  for (const match of matches) {
    if (match.season !== season) continue
    const score = matchScore(match)
    const apply = (teamId: string, scored: number, conceded: number) => {
      const row = rows.get(teamId)
      if (!row) return
      row.played += 1; row.goalsFor += scored; row.goalsAgainst += conceded
      if (scored > conceded) { row.wins += 1; row.points += 3 }
      else if (scored === conceded) { row.draws += 1; row.points += 1 }
      else row.losses += 1
    }
    apply(match.homeTeamId, score.home, score.away)
    apply(match.awayTeamId, score.away, score.home)
  }

  const ordered = [...rows.values()].map((row) => ({ ...row, goalDifference: row.goalsFor - row.goalsAgainst }))
    .sort((a, b) => b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor)
  let previous: Standing | undefined
  return ordered.map((row, index) => {
    const tied = previous && row.points === previous.points && row.goalDifference === previous.goalDifference && row.goalsFor === previous.goalsFor
    const ranked = { ...row, rank: tied ? previous!.rank : index + 1 }
    previous = ranked
    return ranked
  })
}

export function standingForTeam(standings: Standing[], teamId: string): Standing | undefined {
  return standings.find((standing) => standing.teamId === teamId)
}
