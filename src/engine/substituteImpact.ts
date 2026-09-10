import type { Match, Player, RatingBreakdown } from '../types'
import { matchScore, ratePlayerMatch } from './rating'
import { compareEvents, isOnPitchAtEvent, orderedEvents, scoringTeamId } from './timeline'

export type SubstituteImpactAppearance = {
  match: Match; teamId: string; entryMinute: number; scoreAtEntry: { home: number; away: number }; finalScore: { home: number; away: number }
  minutes: number; goalsFor: number; goalsAgainst: number; goalDifference: number; goals: number; assists: number; rating: RatingBreakdown; result: 'W' | 'D' | 'L'
}
export type SubstituteImpactSummary = {
  apps: number; minutes: number; goals: number; assists: number; gaPer90: number; goalsFor: number; goalsAgainst: number; goalDifference: number; gdPer90: number; averageRating: number
}

const zero = (): SubstituteImpactSummary => ({ apps: 0, minutes: 0, goals: 0, assists: 0, gaPer90: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, gdPer90: 0, averageRating: 0 })

/** Uses the shared event ordering, not a separate minute-only interpretation. */
export function substituteImpact(player: Player, matches: Match[]): { appearances: SubstituteImpactAppearance[]; summary: SubstituteImpactSummary } {
  const rows: SubstituteImpactAppearance[] = []
  for (const match of matches) {
    const appearance = match.appearances.find(item => item.playerId === player.id)
    if (!appearance || appearance.role !== 'bench') continue
    const rating = ratePlayerMatch(match, player)
    const entry = match.events.find((event): event is Extract<Match['events'][number], { type: 'sub' }> => event.type === 'sub' && event.playerInId === player.id && event.teamId === appearance.teamId)
    if (!rating || !entry || rating.minutes <= 0) continue
    let home = 0; let away = 0
    for (const { event } of orderedEvents(match)) {
      if (event.type !== 'goal' || compareEvents(match, event, entry) >= 0) continue
      if (scoringTeamId(match, event) === match.homeTeamId) home++; else away++
    }
    let goalsFor = 0; let goalsAgainst = 0; let goals = 0; let assists = 0
    for (const event of match.events) {
      if (event.type !== 'goal' || compareEvents(match, event, entry) < 0 || !isOnPitchAtEvent(match, appearance, event)) continue
      if (scoringTeamId(match, event) === appearance.teamId) goalsFor++; else goalsAgainst++
      if (!event.ownGoal && event.playerId === player.id) goals++
      if (!event.ownGoal && event.assistPlayerId === player.id) assists++
    }
    const finalScore = matchScore(match); const ours = appearance.teamId === match.homeTeamId ? finalScore.home : finalScore.away; const theirs = appearance.teamId === match.homeTeamId ? finalScore.away : finalScore.home
    rows.push({ match, teamId: appearance.teamId, entryMinute: entry.minute, scoreAtEntry: { home, away }, finalScore, minutes: rating.minutes, goalsFor, goalsAgainst, goalDifference: goalsFor - goalsAgainst, goals, assists, rating, result: ours > theirs ? 'W' : ours === theirs ? 'D' : 'L' })
  }
  const summary = rows.reduce((total, row) => ({ ...total, apps: total.apps + 1, minutes: total.minutes + row.minutes, goals: total.goals + row.goals, assists: total.assists + row.assists, goalsFor: total.goalsFor + row.goalsFor, goalsAgainst: total.goalsAgainst + row.goalsAgainst, goalDifference: total.goalDifference + row.goalDifference, averageRating: total.averageRating + row.rating.raw }), zero())
  if (summary.apps) summary.averageRating /= summary.apps
  summary.gaPer90 = summary.minutes ? (summary.goals + summary.assists) / summary.minutes * 90 : 0
  summary.gdPer90 = summary.minutes ? summary.goalDifference / summary.minutes * 90 : 0
  return { appearances: rows.sort((left, right) => right.match.date.localeCompare(left.match.date) || right.match.matchDay - left.match.matchDay || right.match.id.localeCompare(left.match.id)), summary }
}
