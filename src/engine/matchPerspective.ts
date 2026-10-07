import type { Match } from '../types'
import { matchScore } from './rating'
import { matchCompetitionType } from './competitionContext'

/** A saved match belongs to the team whose roster was recorded. */
export function recordedTeamId(match: Match): string {
  return match.teamId ?? match.homeTeamId
}

/** Champions records are independent even when the logical opponent is registered. */
export function teamsCreditedWithResult(match: Match): string[] {
  if (matchCompetitionType(match) === 'champions') return [recordedTeamId(match)]
  return [...new Set([match.homeTeamId, match.awayTeamId])]
}

export function isRecordedForTeam(match: Match, teamId: string): boolean {
  return match.teamId ? match.teamId === teamId : teamsCreditedWithResult(match).includes(teamId)
}

export function recordedOpponentId(match: Match): string {
  return recordedTeamId(match) === match.homeTeamId ? match.awayTeamId : match.homeTeamId
}

export function teamPerspectiveScore(match: Match, teamId: string): { goalsFor: number; goalsAgainst: number; outcome: 'W' | 'D' | 'L' } | undefined {
  if (!teamsCreditedWithResult(match).includes(teamId) || (match.homeTeamId !== teamId && match.awayTeamId !== teamId)) return undefined
  const score = matchScore(match)
  const goalsFor = match.homeTeamId === teamId ? score.home : score.away
  const goalsAgainst = match.homeTeamId === teamId ? score.away : score.home
  return { goalsFor, goalsAgainst, outcome: goalsFor > goalsAgainst ? 'W' : goalsFor === goalsAgainst ? 'D' : 'L' }
}
