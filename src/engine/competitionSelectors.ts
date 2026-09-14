import type { Match, Player, Team } from '../types'
import { leagueCompetition } from './competition'

export type LeagueCacheDiagnostic = {
  key: string
  hit: boolean
  reason: 'unchanged-revision' | 'cold' | 'league-revision-changed' | 'team-catalog-changed' | 'players-changed'
  durationMs: number
}

type LeagueValue = ReturnType<typeof leagueCompetition>
type LeagueEntry = { revision: number; teamCatalogRevision: number; players: Player[]; value: LeagueValue }
const caches = new WeakMap<object, Map<string, LeagueEntry>>()
const EMPTY_PLAYERS: Player[] = []

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
  players: Player[] = EMPTY_PLAYERS,
): LeagueValue {
  const start = clock()
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  const prior = cache.get(season)
  if (prior?.revision === revision && prior.teamCatalogRevision === teamCatalogRevision && prior.players === players) {
    onDiagnostic?.({ key: `${season}:league:r${revision}:t${teamCatalogRevision}`, hit: true, reason: 'unchanged-revision', durationMs: clock() - start })
    return prior.value
  }
  const reason: LeagueCacheDiagnostic['reason'] = !prior ? 'cold' : prior.revision !== revision ? 'league-revision-changed' : prior.teamCatalogRevision !== teamCatalogRevision ? 'team-catalog-changed' : 'players-changed'
  const value = leagueCompetition(teams, matches, season, players)
  cache.set(season, { revision, teamCatalogRevision, players, value })
  onDiagnostic?.({ key: `${season}:league:r${revision}:t${teamCatalogRevision}`, hit: false, reason, durationMs: clock() - start })
  return value
}

