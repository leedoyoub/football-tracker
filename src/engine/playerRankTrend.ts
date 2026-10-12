import type { CompetitionType, Match, Player } from '../types'
import { matchCompetitionType } from './competitionContext'
import { oldestMatches } from './matchChronology'
import { dominantPositionFamily, positionFamily, type PositionFamily } from './positionScope'
import { compareCoreLeaderboardRows } from './stats'
import { ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { playerAssistEvents, playerGoalEvents, playerGoalkeeperFacts } from './playerMatchFacts'
import { addDefensiveRankingFacts, appendRecordedTeamOpportunities, defensiveMatchFacts, defensiveRankingValue, emptyDefensiveRankingFacts, emptyTeamOpportunityIndex, teamOpportunityMinutesFromIndex, type DefensiveRankingFacts, type TeamAppearance } from './defensiveRanking'
import { creditedPositionSegments } from './timeline'

export type RankTrendMetric = 'rating' | 'goals' | 'assists' | 'g+a' | 'sotAllowed' | 'defenderGaPer90' | 'cleanSheets' | 'saves' | 'goalkeeperGaPer90'
export type PlayerRankPoint = { match: Match; teamId: string; overall: number | null; position: number | null; team: number | null }
const cache = new WeakMap<Match[], WeakMap<Player[], Map<string, PlayerRankPoint[]>>>()
const outfieldOptions = [{ value: 'rating', label: 'Rating' }, { value: 'goals', label: 'Goals' }, { value: 'assists', label: 'Assists' }, { value: 'g+a', label: 'G+A' }] as const
const defenderOptions = [{ value: 'rating', label: 'Rating' }, { value: 'g+a', label: 'G+A' }, { value: 'sotAllowed', label: 'SOT Allowed/90' }, { value: 'defenderGaPer90', label: 'Defender GA/90' }] as const
const goalkeeperOptions = [{ value: 'rating', label: 'Rating' }, { value: 'cleanSheets', label: 'Clean Sheets' }, { value: 'saves', label: 'Saves' }, { value: 'goalkeeperGaPer90', label: 'GK GA/90' }] as const

export function rankTrendMetricOptions(position?: string): readonly { value: RankTrendMetric; label: string }[] {
  const family = positionFamily(position)
  return family === 'GK' ? goalkeeperOptions : family === 'CB' || family === 'LB' || family === 'RB' ? defenderOptions : outfieldOptions
}

type Running = { playerId: string; teamId: string; sum: number; apps: number; goals: number; assists: number; cleanSheets: number; saves: number; representedTeams: Set<string>; defensive: DefensiveRankingFacts }
const running = (playerId: string, teamId: string): Running => ({ playerId, teamId, sum: 0, apps: 0, goals: 0, assists: 0, cleanSheets: 0, saves: 0, representedTeams: new Set(), defensive: emptyDefensiveRankingFacts() })
const lowerIsBetter = (metric: RankTrendMetric) => metric === 'sotAllowed' || metric === 'defenderGaPer90' || metric === 'goalkeeperGaPer90'
const core = (metric: RankTrendMetric): metric is 'rating' | 'goals' | 'assists' | 'g+a' => metric === 'rating' || metric === 'goals' || metric === 'assists' || metric === 'g+a'

/** One pass through matches; only the selected player's actual appearances produce points. */
export function playerRankTrend(playerId: string, players: Player[], matches: Match[], season: string, competition: CompetitionType | 'all', metric: RankTrendMetric = 'rating'): PlayerRankPoint[] {
  let byPlayers = cache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players)
  if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const key = `${RATING_ENGINE_REVISION}:${playerId}:${season}:${competition}:${metric}`
  const cached = byScope.get(key)
  if (cached) return cached
  if (!players.some(row => row.id === playerId)) return []
  const ordered = oldestMatches(matches.filter(match => match.season === season && (competition === 'all' || matchCompetitionType(match) === competition)))
  const playerById = new Map(players.map(item => [item.id, item]))
  const totals = new Map<string, Running>()
  const byTeam = new Map<string, Map<string, Running>>()
  const opportunityIndex = emptyTeamOpportunityIndex()
  const appearancesByPlayer = new Map<string, TeamAppearance[]>()
  const positionMinutes = new Map<string, Map<PositionFamily, number>>()
  const result: PlayerRankPoint[] = []
  const needsOpportunities = metric === 'defenderGaPer90' || metric === 'goalkeeperGaPer90'
  const valueFor = (row: Running, availableTeamMinutes: number) => {
    if (metric === 'rating') return row.sum / row.apps
    if (metric === 'goals') return row.goals
    if (metric === 'assists') return row.assists
    if (metric === 'g+a') return row.goals + row.assists
    if (metric === 'cleanSheets') return row.defensive.goalkeeperMinutes > 0 ? row.cleanSheets : null
    if (metric === 'saves') return row.defensive.goalkeeperMinutes > 0 ? row.saves : null
    return defensiveRankingValue(metric, { ...row.defensive, availableTeamMinutes })
  }
  const presented = (rows: Iterable<Running>) => [...rows].flatMap(row => {
    const available = needsOpportunities ? teamOpportunityMinutesFromIndex(opportunityIndex, row.representedTeams, appearancesByPlayer.get(row.playerId) ?? []) : 0
    const value = valueFor(row, available)
    return value === null ? [] : [{ playerId: row.playerId, teamId: row.teamId, historicalTeamId: row.teamId, avgRating: row.sum / row.apps, goals: row.goals, assists: row.assists, mom: 0, value }]
  })
  // The comparator is unchanged. Only the target's rank is needed at each point.
  const targetRanks = (rows: ReturnType<typeof presented>, families?: Map<string, PositionFamily>) => {
    const target = rows.find(row => row.playerId === playerId)
    if (!target) return { overall: null, position: null, team: null }
    const member = playerById.get(playerId)!
    const family = families?.get(playerId) ?? positionFamily(member.position)
    const rowFamily = (id: string) => families?.get(id) ?? positionFamily(playerById.get(id)?.position ?? 'ST')
    let overall = 1; let position = rowFamily(playerId) === family ? 1 : null; let team = 1
    for (const row of rows) {
      const comparison = core(metric) ? compareCoreLeaderboardRows(row, target, metric) : (lowerIsBetter(metric) ? row.value - target.value : target.value - row.value) || target.avgRating - row.avgRating || row.playerId.localeCompare(target.playerId)
      if (!(comparison < 0)) continue
      overall++
      if (position !== null && rowFamily(row.playerId) === family) position++
      if (row.historicalTeamId === target.historicalTeamId) team++
    }
    return { overall, position, team }
  }
  for (const [matchIndex, match] of ordered.entries()) {
    if (needsOpportunities) appendRecordedTeamOpportunities(opportunityIndex, match, matchIndex)
    let targetTeamId: string | undefined
    for (const appearance of match.appearances) {
      const member = playerById.get(appearance.playerId)
      if (member) {
        const minutes = positionMinutes.get(member.id) ?? new Map<PositionFamily, number>()
        for (const segment of creditedPositionSegments(match, appearance)) {
          const family = positionFamily(segment.position)
          if (family) minutes.set(family, (minutes.get(family) ?? 0) + segment.exit - segment.enter)
        }
        positionMinutes.set(member.id, minutes)
      }
      const rating = member && ratePlayerMatch(match, member)
      if (!rating) continue
      if (needsOpportunities) {
        const history = appearancesByPlayer.get(member.id) ?? []
        history.push({ season: match.season, teamId: appearance.teamId, matchIndex })
        appearancesByPlayer.set(member.id, history)
      }
      if (member.id === playerId) targetTeamId = appearance.teamId
      const goalkeeper = core(metric) ? null : playerGoalkeeperFacts(match, appearance)
      const facts = goalkeeper && defensiveMatchFacts(match, appearance, goalkeeper)
      const goals = playerGoalEvents(match, appearance).length
      const assists = playerAssistEvents(match, appearance).length
      const add = (row: Running) => {
        row.sum += rating.raw; row.apps++; row.teamId = appearance.teamId
        row.goals += goals; row.assists += assists
        if (goalkeeper) { row.cleanSheets += Number(goalkeeper.cleanSheet); row.saves += goalkeeper.saves }
        if (needsOpportunities) row.representedTeams.add(appearance.teamId)
        if (facts) addDefensiveRankingFacts(row.defensive, facts)
      }
      const overall = totals.get(member.id) ?? running(member.id, appearance.teamId)
      add(overall); totals.set(member.id, overall)
      let teamRows = byTeam.get(appearance.teamId)
      if (!teamRows) { teamRows = new Map(); byTeam.set(appearance.teamId, teamRows) }
      const stint = teamRows.get(member.id) ?? running(member.id, appearance.teamId)
      add(stint); teamRows.set(member.id, stint)
    }
    if (!targetTeamId) continue
    const families = new Map(players.flatMap(member => {
      const family = dominantPositionFamily(positionMinutes.get(member.id) ?? new Map()) ?? positionFamily(member.position)
      return family ? [[member.id, family] as const] : []
    }))
    const rank = targetRanks(presented(totals.values()), families)
    const team = targetRanks(presented(byTeam.get(targetTeamId)?.values() ?? [])).team
    result.push({ match, teamId: targetTeamId, overall: rank.overall, position: rank.position, team })
  }
  if (byScope.size >= 64) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, result)
  return result
}
