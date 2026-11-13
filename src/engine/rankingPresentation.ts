import type { Match } from '../types'
import { arrayItemRevision } from './arrayItemRevision'
import { hasPitchAppearance } from './timeline'

export function normalizeRankingTeamIds(value: unknown, validIds: readonly string[]): string[] {
  const values = Array.isArray(value) ? value : [value]
  const valid = new Set(validIds)
  return [...new Set(values.filter((id): id is string => typeof id === 'string' && valid.has(id)))]
}

const membershipCache = new WeakMap<Match[], { revision: number; value: ReadonlyMap<string, ReadonlySet<string>> }>()

/** Recorded stints belong to the football scope, independently of today's roster. */
export function historicalRankingTeams(matches: Match[]): ReadonlyMap<string, ReadonlySet<string>> {
  const revision = arrayItemRevision(matches)
  const cached = membershipCache.get(matches)
  if (cached?.revision === revision) return cached.value
  const value = new Map<string, Set<string>>()
  for (const match of matches) for (const appearance of match.appearances) {
    if (!hasPitchAppearance(match, appearance)) continue
    let teams = value.get(appearance.playerId)
    if (!teams) { teams = new Set(); value.set(appearance.playerId, teams) }
    teams.add(appearance.teamId)
  }
  membershipCache.set(matches, { revision, value })
  return value
}

export function playerInRankingTeams(playerId: string, teamIds: readonly string[], membership: ReadonlyMap<string, ReadonlySet<string>>) {
  return !teamIds.length || teamIds.some(id => membership.get(playerId)?.has(id))
}
