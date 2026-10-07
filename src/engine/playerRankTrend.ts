import type { CompetitionType, Match, Player } from '../types'
import { matchCompetitionType } from './competitionContext'
import { oldestMatches, newestMatches } from './matchChronology'
import { scopedPositionFamilyByPlayer } from './positionScope'
import { scopedMetricRanks } from './seasonAnalytics'
import { compareCoreLeaderboardRows } from './stats'
import { ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'

export type PlayerRankPoint = { match: Match; teamId: string; overall: number | null; position: number | null; team: number | null }
const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRankPoint[]>>>()

/** Rank at each of the player's latest ten actual appearances, using canonical ranking rows. */
export function playerRankTrend(playerId: string, players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all'): PlayerRankPoint[] {
  let byPlayers = cache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players)
  if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = `${RATING_ENGINE_REVISION}:${playerId}:${season}:${competition}`
  const cached = byScope.get(key)
  if (cached) return cached
  const player = players.find(row => row.id === playerId)
  if (!player) return []
  const ordered = oldestMatches(matches.filter(match => match.season === season && (competition === 'all' || matchCompetitionType(match) === competition)))
  const appearances = newestMatches(ordered.filter(match => match.appearances.some(appearance => appearance.playerId === playerId) && ratePlayerMatch(match, player))).slice(0, 10).reverse()
  if (appearances.length < 2) return []
  type Running = { playerId: string; teamId: string; sum: number; apps: number }
  const playerById = new Map(players.map(item => [item.id, item]))
  const totals = new Map<string, Running>()
  const byTeam = new Map<string, Map<string, Running>>()
  const selected = new Set(appearances)
  const prefix: Match[] = []
  const result: PlayerRankPoint[] = []
  const ranked = (rows: Iterable<Running>) => [...rows].map(row => ({ playerId: row.playerId, teamId: row.teamId, historicalTeamId: row.teamId, avgRating: row.sum / row.apps, goals: 0, assists: 0, mom: 0 })).sort((left, right) => compareCoreLeaderboardRows(left, right, 'rating'))
  for (const match of ordered) {
    prefix.push(match)
    for (const appearance of match.appearances) {
      const member = playerById.get(appearance.playerId)
      const rating = member && ratePlayerMatch(match, member)
      if (!rating) continue
      const overall = totals.get(member.id) ?? { playerId: member.id, teamId: appearance.teamId, sum: 0, apps: 0 }
      overall.sum += rating.raw; overall.apps++; overall.teamId = appearance.teamId
      totals.set(member.id, overall)
      let teamRows = byTeam.get(appearance.teamId)
      if (!teamRows) { teamRows = new Map(); byTeam.set(appearance.teamId, teamRows) }
      const stint = teamRows.get(member.id) ?? { playerId: member.id, teamId: appearance.teamId, sum: 0, apps: 0 }
      stint.sum += rating.raw; stint.apps++
      teamRows.set(member.id, stint)
    }
    if (!selected.has(match)) continue
    const teamId = match.appearances.find(appearance => appearance.playerId === playerId)!.teamId
    const families = scopedPositionFamilyByPlayer(players, prefix, {})
    const rank = scopedMetricRanks(ranked(totals.values()), players, playerId, families)
    const team = scopedMetricRanks(ranked(byTeam.get(teamId)?.values() ?? []), players, playerId).team
    result.push({ match, teamId, overall: rank.overall, position: rank.position, team })
  }
  byScope.set(key, result)
  return result
}
