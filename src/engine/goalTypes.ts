import type { Match, MatchEvent } from '../types'
import { orderedEvents, scoringTeamId } from './timeline'

export type BaseGoalType = 'opening' | 'equalizer' | 'goAhead' | 'leadExtending' | 'deficitReducing'
export type SpecialGoalType = 'gameWinning' | 'comeback' | 'stoppageTime'
export type GoalType = BaseGoalType | SpecialGoalType
export type ClassifiedGoal = { event: Extract<MatchEvent, { type: 'goal' }>; teamId: string; tags: GoalType[] }
export type GoalTypeTotals = Record<GoalType, number>

const empty = (): GoalTypeTotals => ({ opening: 0, equalizer: 0, goAhead: 0, leadExtending: 0, deficitReducing: 0, gameWinning: 0, comeback: 0, stoppageTime: 0 })
/** Replays the stable shared event timeline; it never stores tags in match data. */
export function classifyGoalTypes(match: Match): ClassifiedGoal[] {
  const goals = orderedEvents(match).flatMap(({ event }) => event.type === 'goal' ? [event] : [])
  const score = { home: 0, away: 0 }
  // An equalizer arms exactly one go-ahead opportunity. It is consumed on
  // conversion and reset if that team falls behind again, so an old deficit
  // can never label a later normal lead change as a comeback.
  const comebackArmed = new Map<string, boolean>([[match.homeTeamId, false], [match.awayTeamId, false]])
  const rows: ClassifiedGoal[] = []
  const rowForEvent = new Map<MatchEvent, ClassifiedGoal>()
  for (const event of goals) {
    const teamId = scoringTeamId(match, event)
    const opponentId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    const oursBefore = teamId === match.homeTeamId ? score.home : score.away
    const theirsBefore = teamId === match.homeTeamId ? score.away : score.home
    if (teamId === match.homeTeamId) score.home++; else score.away++
    const oursAfter = teamId === match.homeTeamId ? score.home : score.away
    const theirsAfter = teamId === match.homeTeamId ? score.away : score.home
    const base: BaseGoalType = oursBefore === 0 && theirsBefore === 0 ? 'opening'
      : oursBefore < theirsBefore ? (oursAfter === theirsAfter ? 'equalizer' : 'deficitReducing')
      : oursBefore === theirsBefore ? 'goAhead'
      : 'leadExtending'
    if (base === 'equalizer' && oursBefore < theirsBefore) comebackArmed.set(teamId, true)
    const comeback = base === 'goAhead' && comebackArmed.get(teamId) === true
    if (base === 'goAhead') comebackArmed.set(teamId, false)
    if (score.home < score.away) comebackArmed.set(match.homeTeamId, false)
    if (score.away < score.home) comebackArmed.set(match.awayTeamId, false)
    if (event.ownGoal) continue
    const tags: GoalType[] = [base]
    if (comeback) tags.push('comeback')
    if (event.minute > 90) tags.push('stoppageTime')
    const row = { event, teamId, tags }
    rows.push(row); rowForEvent.set(event, row)
    // Retaining the variable makes the opponent/team relationship explicit for
    // future event forms and avoids treating an own goal as the raw event team.
    void opponentId
  }
  const finalHome = score.home; const finalAway = score.away
  const winningTeam = finalHome === finalAway ? undefined : finalHome > finalAway ? match.homeTeamId : match.awayTeamId
  if (!winningTeam) return rows
  const opponentFinal = winningTeam === match.homeTeamId ? finalAway : finalHome
  let winnerGoals = 0
  for (const event of goals) {
    if (scoringTeamId(match, event) !== winningTeam) continue
    winnerGoals++
    if (winnerGoals === opponentFinal + 1) {
      const row = rowForEvent.get(event)
      if (row) row.tags.push('gameWinning')
      break
    }
  }
  return rows
}

export function goalTypeTotals(match: Match, playerId?: string, teamId?: string): GoalTypeTotals {
  const totals = empty()
  for (const row of classifyGoalTypes(match)) {
    if (playerId && row.event.playerId !== playerId) continue
    if (teamId && row.teamId !== teamId) continue
    for (const tag of row.tags) totals[tag]++
  }
  return totals
}

export function combineGoalTypeTotals(rows: GoalTypeTotals[]): GoalTypeTotals {
  return rows.reduce((total, row) => {
    for (const key of Object.keys(total) as GoalType[]) total[key] += row[key]
    return total
  }, empty())
}
