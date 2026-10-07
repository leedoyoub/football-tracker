import type { CompetitionType, Match, Player } from '../types'
import { matchCompetitionType } from './competitionContext'
import { newestMatches } from './matchChronology'
import { teamPerspectiveScore } from './matchPerspective'
import { ratePlayerMatch } from './rating'

type Metric = { rating: number | null; goalsFor: number | null; goalsAgainst: number | null }
type TeamFormRow = { match: Match; outcome: 'W' | 'D' | 'L'; goalsFor: number; goalsAgainst: number; rating: number | null }
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
const metrics = (rows: TeamFormRow[]): Metric => ({ rating: average(rows.flatMap(row => row.rating === null ? [] : [row.rating])), goalsFor: average(rows.map(row => row.goalsFor)), goalsAgainst: average(rows.map(row => row.goalsAgainst)) })

export function teamMomentumDirection(metric: keyof Metric, delta: number | null): 'better' | 'worse' | 'flat' {
  if (delta === null || Math.abs(delta) < .005) return 'flat'
  return (metric === 'goalsAgainst' ? -delta : delta) > 0 ? 'better' : 'worse'
}

export function teamForm(teamId: string, players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all') {
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const ordered = newestMatches(matches.filter(match => match.season === season && (competition === 'all' || matchCompetitionType(match) === competition)))
  const rows = ordered.flatMap(match => {
    const score = teamPerspectiveScore(match, teamId)
    if (!score) return []
    const ratings = match.appearances.flatMap(appearance => {
      if (appearance.teamId !== teamId) return []
      const player = byPlayer.get(appearance.playerId)
      const rating = player && ratePlayerMatch(match, player)
      return rating ? [rating.raw] : []
    })
    return [{ match, ...score, rating: average(ratings) }]
  })
  const recent = rows.slice(0, 5)
  const seasonMetrics = metrics(rows)
  const recentMetrics = metrics(recent)
  return { count: rows.length, recent, season: seasonMetrics, lastFive: recentMetrics, delta: {
    rating: recentMetrics.rating === null || seasonMetrics.rating === null ? null : recentMetrics.rating - seasonMetrics.rating,
    goalsFor: recentMetrics.goalsFor === null || seasonMetrics.goalsFor === null ? null : recentMetrics.goalsFor - seasonMetrics.goalsFor,
    goalsAgainst: recentMetrics.goalsAgainst === null || seasonMetrics.goalsAgainst === null ? null : recentMetrics.goalsAgainst - seasonMetrics.goalsAgainst,
  } }
}
