import type { CompetitionType, Match } from '../types'
import { matchCompetitionType } from './competitionContext'
import { teamsCreditedWithResult } from './matchPerspective'
import { arrayItemRevision } from './arrayItemRevision'

export type RecordsMatchFilters = { seasons: string[]; teamIds: string[]; competition: CompetitionType | 'all' }
const scopedCache = new WeakMap<Match[], { revision: number; scopes: Map<string, Match[]> }>()

export function recordsScopedMatches(matches: Match[], filters: RecordsMatchFilters, category: 'player' | 'team' | 'combination' | 'insights'): Match[] {
  const revision = arrayItemRevision(matches)
  let entry = scopedCache.get(matches)
  if (!entry || entry.revision !== revision) { entry = { revision, scopes: new Map() }; scopedCache.set(matches, entry) }
  const key = JSON.stringify([category, filters.competition, [...filters.seasons].sort(), [...filters.teamIds].sort()])
  const cached = entry.scopes.get(key)
  if (cached) return cached
  const result = matches.filter(match => {
    if (filters.competition !== 'all' && matchCompetitionType(match) !== filters.competition) return false
    if (category === 'insights') return true
    if (filters.seasons.length && !filters.seasons.includes(match.season)) return false
    if (!filters.teamIds.length) return true
    if (category === 'team') return filters.teamIds.some(teamId => teamsCreditedWithResult(match).includes(teamId))
    return filters.teamIds.some(teamId => match.appearances.some(appearance => appearance.teamId === teamId))
  })
  // A metric change must preserve the source identity used by the existing
  // combination engine's timeline cache.
  if (entry.scopes.size >= 24) entry.scopes.delete(entry.scopes.keys().next().value!)
  entry.scopes.set(key, result)
  return result
}
