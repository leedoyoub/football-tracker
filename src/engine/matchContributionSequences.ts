import type { Match } from '../types'
import { matchCompetitionType } from './competitionContext'
import { oldestMatches } from './matchChronology'

export type MatchContributionSequence = { goals: number[]; assists: number[] }

/** Derives this match's contribution ordinals from canonical season/competition history. */
export function matchContributionSequences(matches: Match[], matchId: string): Record<string, MatchContributionSequence> {
  const target = matches.find(match => match.id === matchId)
  if (!target) return {}
  const scope = `${target.season}:${matchCompetitionType(target)}`
  const goalCounts = new Map<string, number>()
  const assistCounts = new Map<string, number>()
  const result: Record<string, MatchContributionSequence> = {}
  const rowFor = (playerId: string) => result[playerId] ??= { goals: [], assists: [] }

  for (const match of oldestMatches(matches)) {
    if (`${match.season}:${matchCompetitionType(match)}` !== scope) continue
    for (const event of match.events) {
      if (event.type !== 'goal' || event.ownGoal) continue
      if (event.playerId) {
        const ordinal = (goalCounts.get(event.playerId) ?? 0) + 1
        goalCounts.set(event.playerId, ordinal)
        if (match.id === matchId) rowFor(event.playerId).goals.push(ordinal)
      }
      if (event.assistPlayerId) {
        const ordinal = (assistCounts.get(event.assistPlayerId) ?? 0) + 1
        assistCounts.set(event.assistPlayerId, ordinal)
        if (match.id === matchId) rowFor(event.assistPlayerId).assists.push(ordinal)
      }
    }
  }
  return result
}
