import type { CompetitionType, Match, Player } from '../types'
import { buildGlobalRankingData, rankGlobalRankingRows, type GlobalLeaderboardRow } from './stats'
import { scopedPositionFamilyByPlayer, positionFamily } from './positionScope'
import { matchCompetitionType } from './competitionContext'
import { RATING_ENGINE_REVISION } from './ratingRevision'

type Ranks = { overall: number | null; position: number | null; team: number | null }
type Metric = 'rating' | 'goals' | 'assists'
const METRICS: Metric[] = ['rating', 'goals', 'assists']
const absent = (): Ranks => ({ overall: null, position: null, team: null })
function createScope(players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all') {
  const games = matches.filter(m => m.season === season && (competition === 'all' || matchCompetitionType(m) === competition))
  const families = scopedPositionFamilyByPlayer(players, games, {})
  const index = buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating')
  const playerById = new Map(players.map(p => [p.id, p]))
  const orderedRanks = (rows: GlobalLeaderboardRow[]) => {
    const counts = new Map<string, number>(), result = new Map<string, Ranks>()
    rows.forEach((row, i) => {
      const family = families.get(row.playerId) ?? positionFamily(playerById.get(row.playerId)?.position ?? 'ST')
      const key = family ?? ''
      const position = (counts.get(key) ?? 0) + 1; counts.set(key, position)
      result.set(row.playerId, { overall: i + 1, position, team: null })
    })
    return result
  }
  const ranks = Object.fromEntries(METRICS.map(metric => [metric, orderedRanks(rankGlobalRankingRows(index, players, metric))])) as Record<Metric, Map<string, Ranks>>
  const teamRanks = new Map<string, Record<Metric, Map<string, number>>>()
  return { games, families, ranksFor(playerId: string, teamId?: string): Record<Metric, Ranks> {
    let team = teamId ? teamRanks.get(teamId) : undefined
    if (teamId && !team) {
      const rows = buildGlobalRankingData(players, games, { seasons: [season], teams: [teamId], positions: [] }, 'rating')
      team = Object.fromEntries(METRICS.map(metric => [metric, new Map(rankGlobalRankingRows(rows, players, metric).map((row, i) => [row.playerId, i + 1]))])) as Record<Metric, Map<string, number>>
      teamRanks.set(teamId, team)
    }
    return Object.fromEntries(METRICS.map(metric => [metric, { ...(ranks[metric].get(playerId) ?? absent()), team: team?.[metric].get(playerId) ?? null }])) as Record<Metric, Ranks>
  } }
}
type Scope = ReturnType<typeof createScope>
const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, Scope>>>()
/** Every player in a season/scope shares facts, canonical ordering and team lookups. */
export function playerDetailRankingScope(players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all'): Scope {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players); if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = `${RATING_ENGINE_REVISION}:${season}:${competition}`
  let scope = byScope.get(key)
  if (!scope) { if (byScope.size >= 24) byScope.delete(byScope.keys().next().value!); scope = createScope(players, matches, season, competition); byScope.set(key, scope) }
  return scope
}
