import type { Match, MatchEvent } from '../types'
import { orderedEvents, scoringTeamId } from './timeline'

export type GoalType = 'opening' | 'equalizer' | 'goAhead' | 'comeback' | 'winning' | 'lateDrama'
export type ClassifiedGoal = { event: Extract<MatchEvent, { type: 'goal' }>; teamId: string; tags: GoalType[] }
export type GoalTypeTotals = Record<GoalType, number>

const empty = (): GoalTypeTotals => ({ opening: 0, equalizer: 0, goAhead: 0, comeback: 0, winning: 0, lateDrama: 0 })
const relation = (ours: number, theirs: number) => ours > theirs ? 1 : ours < theirs ? -1 : 0

/** Replays the stable shared event timeline; it never stores tags in match data. */
export function classifyGoalTypes(match: Match): ClassifiedGoal[] {
  const goals = orderedEvents(match).flatMap(({ event }) => event.type === 'goal' ? [event] : [])
  const home = 0; const away = 0
  const score = { home, away }
  const wasBehind = new Set<string>()
  const rows: ClassifiedGoal[] = []
  for (const event of goals) {
    const teamId = scoringTeamId(match, event)
    const opponentId = teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId
    const oursBefore = teamId === match.homeTeamId ? score.home : score.away
    const theirsBefore = teamId === match.homeTeamId ? score.away : score.home
    if (oursBefore < theirsBefore) wasBehind.add(teamId)
    const before = relation(oursBefore, theirsBefore)
    if (teamId === match.homeTeamId) score.home++; else score.away++
    const oursAfter = teamId === match.homeTeamId ? score.home : score.away
    const theirsAfter = teamId === match.homeTeamId ? score.away : score.home
    const after = relation(oursAfter, theirsAfter)
    const tags: GoalType[] = []
    if (rows.length === 0) tags.push('opening')
    if (before < 0 && after === 0) tags.push('equalizer')
    if (before === 0 && after > 0) {
      tags.push('goAhead')
      if (wasBehind.has(teamId)) tags.push('comeback')
    }
    // A late goal must change the outcome state, not merely inflate a lead.
    if (event.minute >= 85 && before !== after && (before === -1 && after >= 0 || before === 0 && after > 0)) tags.push('lateDrama')
    rows.push({ event, teamId, tags })
    // Retaining the variable makes the opponent/team relationship explicit for
    // future event forms and avoids treating an own goal as the raw event team.
    void opponentId
  }
  const finalHome = score.home; const finalAway = score.away
  const winningTeam = finalHome === finalAway ? undefined : finalHome > finalAway ? match.homeTeamId : match.awayTeamId
  if (!winningTeam) return rows
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]
    if (row.teamId !== winningTeam) continue
    let replayHome = 0; let replayAway = 0
    for (let prior = 0; prior <= index; prior++) {
      if (rows[prior].teamId === match.homeTeamId) replayHome++; else replayAway++
    }
    const leadsNow = winningTeam === match.homeTeamId ? replayHome > replayAway : replayAway > replayHome
    if (!leadsNow) continue
    let neverRelinquished = true
    for (let later = index + 1; later < rows.length; later++) {
      if (rows[later].teamId === match.homeTeamId) replayHome++; else replayAway++
      if (winningTeam === match.homeTeamId ? replayHome <= replayAway : replayAway <= replayHome) { neverRelinquished = false; break }
    }
    if (neverRelinquished) { row.tags.push('winning'); break }
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
