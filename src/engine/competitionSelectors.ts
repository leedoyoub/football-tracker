import type { Match, Team } from '../types'
import { leagueCompetition } from './competition'

export type LeagueCacheDiagnostic = {
  key: string
  hit: boolean
  reason: 'unchanged-revision' | 'cold' | 'league-revision-changed' | 'team-catalog-changed'
  durationMs: number
}

type LeagueValue = ReturnType<typeof leagueCompetition>
type LeagueEntry = { revision: number; teamCatalogRevision: number; value: LeagueValue }
const caches = new WeakMap<object, Map<string, LeagueEntry>>()

const clock = () => typeof performance === 'undefined' ? 0 : performance.now()

/** O(1) lookup. The caller supplies mutation-time tokens; no Match/Event data
 * is serialized, hashed, sorted, or scanned before a cache hit. */
export function selectLeagueCompetition(
  owner: object,
  teams: Team[],
  matches: Match[],
  season: string,
  revision: number,
  teamCatalogRevision: number,
  onDiagnostic?: (diagnostic: LeagueCacheDiagnostic) => void,
): LeagueValue {
  const start = clock()
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  const prior = cache.get(season)
  if (prior?.revision === revision && prior.teamCatalogRevision === teamCatalogRevision) {
    onDiagnostic?.({ key: `${season}:league:r${revision}:t${teamCatalogRevision}`, hit: true, reason: 'unchanged-revision', durationMs: clock() - start })
    return prior.value
  }
  const reason: LeagueCacheDiagnostic['reason'] = !prior ? 'cold' : prior.revision !== revision ? 'league-revision-changed' : 'team-catalog-changed'
  const value = leagueCompetition(teams, matches, season)
  cache.set(season, { revision, teamCatalogRevision, value })
  onDiagnostic?.({ key: `${season}:league:r${revision}:t${teamCatalogRevision}`, hit: false, reason, durationMs: clock() - start })
  return value
}

