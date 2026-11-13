import type { CompetitionType, Match, Player } from '../types'
import { buildGlobalRankingData, compareCoreLeaderboardRows, rankGlobalRankingRows, type CoreLeaderboardRow } from './stats'
import { scopedPositionFamilyByPlayer, positionFamily } from './positionScope'
import { matchCompetitionType } from './competitionContext'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { ratePlayerMatch } from './rating'
import { oldestMatches } from './matchChronology'
import { playerAssistEvents, playerGoalEvents } from './playerMatchFacts'
import { arrayItemRevision } from './arrayItemRevision'

type Ranks = { overall: number | null; position: number | null; team: number | null }
type Metric = 'rating' | 'goals' | 'assists'
const METRICS: Metric[] = ['rating', 'goals', 'assists']
const absent = (): Ranks => ({ overall: null, position: null, team: null })
type Running = CoreLeaderboardRow & { ratingTotal: number; appearances: number }
function createScope(players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all') {
  const games = matches.filter(m => m.season === season && (competition === 'all' || matchCompetitionType(m) === competition))
  const families = scopedPositionFamilyByPlayer(players, games, {})
  const playerById = new Map(players.map(p => [p.id, p]))
  // Legacy ranking preserves duplicate roster rows and memoizes ratings by IDs.
  // Retain those historical semantics for duplicate IDs; valid data stays lean.
  const compatibilityRows = playerById.size !== players.length || new Set(games.map(match => match.id)).size !== games.length
    ? buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating') : null
  const overall = new Map<string, Running>(), byTeam = new Map<string, Map<string, Running>>()
  // Overview ranks need three core values. Accumulate their official facts once,
  // including unrated goals/assists, without deriving unrelated defensive/MOM rows.
  for (const match of compatibilityRows ? [] : oldestMatches(games)) {
    const firstAppearance = new Map<string, Match['appearances'][number]>()
    const teamsByPlayer = new Map<string, Set<string>>()
    for (const appearance of match.appearances) {
      if (!playerById.has(appearance.playerId)) continue
      if (!firstAppearance.has(appearance.playerId)) firstAppearance.set(appearance.playerId, appearance)
      const teams = teamsByPlayer.get(appearance.playerId) ?? new Set<string>()
      teams.add(appearance.teamId); teamsByPlayer.set(appearance.playerId, teams)
    }
    for (const [playerId, appearance] of firstAppearance) {
      const rating = ratePlayerMatch(match, playerById.get(playerId)!)
      const goals = playerGoalEvents(match, appearance).length, assists = playerAssistEvents(match, appearance).length
      const add = (rows: Map<string, Running>) => {
        const row = rows.get(playerId) ?? { playerId, avgRating: 0, goals: 0, assists: 0, mom: 0, ratingTotal: 0, appearances: 0 }
        row.goals += goals; row.assists += assists
        if (rating) { row.ratingTotal += rating.raw; row.appearances++; row.avgRating = row.ratingTotal / row.appearances }
        rows.set(playerId, row)
      }
      add(overall)
      for (const teamId of teamsByPlayer.get(playerId)!) {
        const rows = byTeam.get(teamId) ?? new Map<string, Running>()
        add(rows); byTeam.set(teamId, rows)
      }
    }
  }
  const ordered = (rows: Map<string, Running>, metric: Metric) => [...rows.values()].filter(row => row.appearances > 0).sort((a, b) => compareCoreLeaderboardRows(a, b, metric))
  const orderedRanks = (rows: CoreLeaderboardRow[]) => {
    const counts = new Map<string, number>(), result = new Map<string, Ranks>()
    rows.forEach((row, i) => {
      const family = families.get(row.playerId) ?? positionFamily(playerById.get(row.playerId)?.position ?? 'ST')
      const key = family ?? ''
      const position = (counts.get(key) ?? 0) + 1; counts.set(key, position)
      result.set(row.playerId, { overall: i + 1, position, team: null })
    })
    return result
  }
  const ranks = Object.fromEntries(METRICS.map(metric => [metric, orderedRanks(compatibilityRows ? rankGlobalRankingRows(compatibilityRows, players, metric) : ordered(overall, metric))])) as Record<Metric, Map<string, Ranks>>
  const teamRanks = new Map<string, Record<Metric, Map<string, number>>>()
  return { games, families, ranksFor(playerId: string, teamId?: string): Record<Metric, Ranks> {
    let team = teamId ? teamRanks.get(teamId) : undefined
    if (teamId && !team) {
      const compatibilityTeamRows = compatibilityRows ? buildGlobalRankingData(players, games, { seasons: [season], teams: [teamId], positions: [] }, 'rating') : null
      const rows = byTeam.get(teamId) ?? new Map<string, Running>()
      team = Object.fromEntries(METRICS.map(metric => [metric, new Map((compatibilityTeamRows ? rankGlobalRankingRows(compatibilityTeamRows, players, metric) : ordered(rows, metric)).map((row, i) => [row.playerId, i + 1]))])) as Record<Metric, Map<string, number>>
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
  const key = `${RATING_ENGINE_REVISION}:${arrayItemRevision(players)}:${arrayItemRevision(matches)}:${season}:${competition}`
  let scope = byScope.get(key)
  if (!scope) { if (byScope.size >= 24) byScope.delete(byScope.keys().next().value!); scope = createScope(players, matches, season, competition); byScope.set(key, scope) }
  return scope
}
