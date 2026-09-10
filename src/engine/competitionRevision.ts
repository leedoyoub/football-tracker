import type { CompetitionType, Match } from '../types'

export type CompetitionRevisions = Record<string, Partial<Record<CompetitionType, number>>>

export function competitionRevision(revisions: CompetitionRevisions, season: string, type: CompetitionType): number {
  return revisions[season]?.[type] ?? 0
}

function scope(match: Match): [string, CompetitionType] {
  return [match.season, match.competitionType ?? 'league']
}

function bumpScopes(revisions: CompetitionRevisions, scopes: Iterable<string>): CompetitionRevisions {
  let next = revisions
  for (const value of scopes) {
    const separator = value.lastIndexOf('|')
    const season = value.slice(0, separator)
    const type = value.slice(separator + 1) as CompetitionType
    if (next === revisions) next = { ...revisions }
    const seasonRevisions = next[season] ?? {}
    next[season] = { ...seasonRevisions, [type]: (seasonRevisions[type] ?? 0) + 1 }
  }
  return next
}

/** Mutation-time invalidation. It never scans the Match collection. */
export function reviseChangedMatch(revisions: CompetitionRevisions, previous: Match | undefined, next: Match | undefined): CompetitionRevisions {
  const scopes = new Set<string>()
  if (previous) { const [season, type] = scope(previous); scopes.add(`${season}|${type}`) }
  if (next) { const [season, type] = scope(next); scopes.add(`${season}|${type}`) }
  return bumpScopes(revisions, scopes)
}

export function sameRawFootballValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true
  if (typeof left !== typeof right || left === null || right === null || typeof left !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => sameRawFootballValue(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(rightRecord, key) && sameRawFootballValue(leftRecord[key], rightRecord[key]))
}

export function sameRawMatch(left: Match, right: Match): boolean {
  return sameRawFootballValue(left, right)
}

/** Repository hydration/sync is the only bulk replacement path. The scan is
 * paid at sync time, never during Competition navigation, and semantically
 * identical cloud rows leave all revision tokens untouched. */
export function reconcileCompetitionRevisions(revisions: CompetitionRevisions, previous: Match[], next: Match[]): CompetitionRevisions {
  if (previous === next) return revisions
  const before = new Map(previous.map(match => [match.id, match]))
  const after = new Map(next.map(match => [match.id, match]))
  const changedScopes = new Set<string>()
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const oldMatch = before.get(id)
    const newMatch = after.get(id)
    if (oldMatch && newMatch && sameRawMatch(oldMatch, newMatch)) continue
    if (oldMatch) { const [season, type] = scope(oldMatch); changedScopes.add(`${season}|${type}`) }
    if (newMatch) { const [season, type] = scope(newMatch); changedScopes.add(`${season}|${type}`) }
  }
  return bumpScopes(revisions, changedScopes)
}
