import type { CompetitionState, Match, Player, Team } from '../types'
import { championsCompetition, cupCompetition, leagueCompetition } from './competition'

export type LeagueCacheDiagnostic = {
  key: string
  hit: boolean
  reason: 'unchanged-revision' | 'cold' | 'league-revision-changed' | 'team-catalog-changed' | 'players-changed'
  durationMs: number
}

type LeagueValue = ReturnType<typeof leagueCompetition>
type LeagueEntry = { revision: number; teamCatalogRevision: number; players: Player[]; value: LeagueValue }
type LeagueTeamScope = 'all' | 'tournament'
type CupValue = ReturnType<typeof cupCompetition>
type CupEntry = { revision: number; teamCatalogRevision: number; players: Player[]; value: CupValue }
type ChampionsValue = ReturnType<typeof championsCompetition>
type ChampionsEntry = { revision: number; draw: CompetitionState | undefined; players: Player[]; value: ChampionsValue }
type CompetitionCacheDiagnostic = { key: string; hit: boolean; reason: string; durationMs: number }
const caches = new WeakMap<object, Map<string, LeagueEntry | CupEntry | ChampionsEntry>>()
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
  teamScope: LeagueTeamScope = 'all',
): LeagueValue {
  const start = clock()
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  const key = `${season}:league:${teamScope}`
  const prior = cache.get(key) as LeagueEntry | undefined
  if (prior?.revision === revision && prior.teamCatalogRevision === teamCatalogRevision && prior.players === players) {
    onDiagnostic?.({ key: `${season}:league:${teamScope}:r${revision}:t${teamCatalogRevision}`, hit: true, reason: 'unchanged-revision', durationMs: clock() - start })
    return prior.value
  }
  const reason: LeagueCacheDiagnostic['reason'] = !prior ? 'cold' : prior.revision !== revision ? 'league-revision-changed' : prior.teamCatalogRevision !== teamCatalogRevision ? 'team-catalog-changed' : 'players-changed'
  const value = leagueCompetition(teams, matches, season, players)
  cache.set(key, { revision, teamCatalogRevision, players, value })
  onDiagnostic?.({ key: `${season}:league:${teamScope}:r${revision}:t${teamCatalogRevision}`, hit: false, reason, durationMs: clock() - start })
  return value
}

/** O(1) cache hit keyed by mutation-time Cup revision and semantic identities. */
export function selectCupCompetition(
  owner: object,
  teams: Team[],
  matches: Match[],
  season: string,
  revision: number,
  teamCatalogRevision: number,
  players: Player[] = EMPTY_PLAYERS,
  onDiagnostic?: (diagnostic: CompetitionCacheDiagnostic) => void,
): CupValue {
  const start = clock()
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  const key = `${season}:cup`
  const prior = cache.get(key) as CupEntry | undefined
  if (prior?.revision === revision && prior.teamCatalogRevision === teamCatalogRevision && prior.players === players) {
    onDiagnostic?.({ key: `${season}:cup:r${revision}:t${teamCatalogRevision}`, hit: true, reason: 'unchanged-revision', durationMs: clock() - start })
    return prior.value
  }
  const reason = !prior ? 'cold' : prior.revision !== revision ? 'cup-revision-changed' : prior.teamCatalogRevision !== teamCatalogRevision ? 'team-catalog-changed' : 'players-changed'
  const value = cupCompetition(teams, matches, season, players)
  cache.set(key, { revision, teamCatalogRevision, players, value })
  onDiagnostic?.({ key: `${season}:cup:r${revision}:t${teamCatalogRevision}`, hit: false, reason, durationMs: clock() - start })
  return value
}

/** O(1) cache hit keyed by mutation-time Champions revision, draw identity, and players. */
export function selectChampionsCompetition(
  owner: object,
  draw: CompetitionState | undefined,
  matches: Match[],
  season: string,
  revision: number,
  players: Player[] = EMPTY_PLAYERS,
  onDiagnostic?: (diagnostic: CompetitionCacheDiagnostic) => void,
): ChampionsValue {
  const start = clock()
  let cache = caches.get(owner)
  if (!cache) { cache = new Map(); caches.set(owner, cache) }
  const key = `${season}:champions`
  const prior = cache.get(key) as ChampionsEntry | undefined
  if (prior?.revision === revision && prior.draw === draw && prior.players === players) {
    onDiagnostic?.({ key: `${season}:champions:r${revision}`, hit: true, reason: 'unchanged-revision', durationMs: clock() - start })
    return prior.value
  }
  const reason = !prior ? 'cold' : prior.revision !== revision ? 'champions-revision-changed' : prior.draw !== draw ? 'draw-changed' : 'players-changed'
  const value = championsCompetition(draw, matches, season, players)
  cache.set(key, { revision, draw, players, value })
  onDiagnostic?.({ key: `${season}:champions:r${revision}`, hit: false, reason, durationMs: clock() - start })
  return value
}

/** Preserve the historical completion fast path while reading any needed model through selectors. */
export function selectCompetitionSeasonComplete(
  owner: object,
  teams: Team[],
  matches: Match[],
  season: string,
  leagueRevision: number,
  cupRevision: number,
  championsRevision: number,
  teamCatalogRevision: number,
  players: Player[],
  draw: CompetitionState | undefined,
): boolean {
  const league = selectLeagueCompetition(owner, teams, matches, season, leagueRevision, teamCatalogRevision, undefined, players, 'tournament')
  if (!league.complete) return false
  const cup = selectCupCompetition(owner, teams, matches, season, cupRevision, teamCatalogRevision, players)
  if (!cup.championId) return false
  return Boolean(selectChampionsCompetition(owner, draw, matches, season, championsRevision, players).championId)
}

