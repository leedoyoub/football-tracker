import type { CompetitionState, Match, Player, Team } from '../types'
import { lookupMatchChanges, type GroupedMatchChange } from './matchChangeIndex'

export type { GroupedMatchChange, GroupedMatchChangeItem } from './matchChangeIndex'

/** Retained as a presentation helper for legacy callers; Match Changes no longer uses rank movement. */
export function rankingTransitionLabel(before: Map<string, number>, after: Map<string, number>, playerId: string, metric: string, topLimit: number, scope: string) {
  if (!before.size) return undefined
  const previous = before.get(playerId) ?? Number.POSITIVE_INFINITY; const next = after.get(playerId) ?? Number.POSITIVE_INFINITY
  if (next > topLimit) return undefined
  const priorLeader = [...before.entries()].find(([, rank]) => rank === 1)?.[0]; const context = ` · ${scope}`
  if (next === 1 && priorLeader && priorLeader !== playerId) return `takes #1 in ${metric}${context}`
  if (previous > topLimit) return `enters the Top ${topLimit} in ${metric} at #${next}${context}`
  if (next < previous) return `climbs ${previous - next} place${previous - next === 1 ? '' : 's'} to #${next} in ${metric}${context}`
  return undefined
}

export function matchChangesForMatch(players: Player[], teams: Team[], matches: Match[], states: CompetitionState[] = [], matchId: string): GroupedMatchChange[] {
  return lookupMatchChanges(players, teams, matches, states, matchId)
}
