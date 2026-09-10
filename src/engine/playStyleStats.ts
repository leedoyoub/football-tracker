import { teamPlayStyle } from '../data/teams'
import { TEAM_PLAY_STYLES, type Match, type Team, type TeamPlayStyle } from '../types'
import { matchScore } from './rating'

const PLAY_STYLE_LABELS: Record<TeamPlayStyle, string> = {
  possession: 'Possession',
  'short-pass-counter': 'Short-Pass Counter',
  'long-pass-counter': 'Long-Pass Counter',
}

export type PlayStylePerformance = {
  style: TeamPlayStyle
  label: string
  matches: number
  goalsFor: number
  goalsAgainst: number
  averageGoalsFor: number | null
  averageGoalsAgainst: number | null
}

function completedMatch(match: Match): boolean {
  return Boolean(match.id && match.homeTeamId && match.awayTeamId && match.homeTeamId !== match.awayTeamId && Array.isArray(match.events) && Array.isArray(match.appearances))
}

/** Derived from saved, valid matches only; never persisted as a stale aggregate. */
export function opponentPlayStylePerformance(matches: Match[], teams: Team[]): PlayStylePerformance[] {
  const byId = new Map(teams.map(team => [team.id, team]))
  const totals = new Map<TeamPlayStyle, { matches: number; goalsFor: number; goalsAgainst: number }>(TEAM_PLAY_STYLES.map(style => [style, { matches: 0, goalsFor: 0, goalsAgainst: 0 }]))
  const uniqueMatches = [...new Map(matches.map(match => [match.id, match])).values()]

  for (const match of uniqueMatches) {
    if (!completedMatch(match)) continue
    const trackedTeamId = match.teamId && byId.has(match.teamId) ? match.teamId : byId.has(match.homeTeamId) ? match.homeTeamId : undefined
    if (!trackedTeamId) continue
    const opponentId = trackedTeamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    const style = teamPlayStyle(byId.get(opponentId))
    if (!style) continue
    const score = matchScore(match)
    const goalsFor = trackedTeamId === match.homeTeamId ? score.home : score.away
    const goalsAgainst = trackedTeamId === match.homeTeamId ? score.away : score.home
    const total = totals.get(style)!
    total.matches++
    total.goalsFor += goalsFor
    total.goalsAgainst += goalsAgainst
  }

  return TEAM_PLAY_STYLES.map(style => {
    const total = totals.get(style)!
    return { style, label: PLAY_STYLE_LABELS[style], ...total, averageGoalsFor: total.matches ? total.goalsFor / total.matches : null, averageGoalsAgainst: total.matches ? total.goalsAgainst / total.matches : null }
  })
}

export function formatPlayStyleAverage(value: number | null): string { return value === null ? '—' : value.toFixed(2) }
