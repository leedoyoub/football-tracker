import type {
  Best11Slot,
  Match,
  Player,
  PlayerSeasonStats,
  Position,
  RankSort,
  RatingBreakdown,
  TeamSeasonStats,
  PartnershipStats,
} from '../types'
import { ratePlayerMatch, getMatchManOfTheMatch, isOnPitchAtEvent, matchScore, pitchWindow, matchPositionAtEvent, matchPositionSegments, scoringTeamId } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision.ts'
import { kickoffLineupForMatch } from './kickoffLineup'
import { newestMatches, oldestMatches } from './matchChronology'


export function seasonsFromMatches(matches: Match[]): string[] {
  return [...new Set(matches.map((m) => m.season))].sort((a, b) => {
    const aNumber = Number(a.match(/\d+/)?.[0] ?? 0)
    const bNumber = Number(b.match(/\d+/)?.[0] ?? 0)
    return bNumber - aNumber || b.localeCompare(a)
  })
}

export function aggregatePlayerStats(
  player: Player,
  allPlayers: Player[],
  matches: Match[],
): PlayerSeasonStats {
  const ratings: RatingBreakdown[] = []
  let wins = 0
  let draws = 0
  let losses = 0
  const recentForm: ('W' | 'D' | 'L')[] = []
  let starts = 0
  let subs = 0
  let saves = 0

  for (const match of oldestMatches(matches)) {
    const appearance = match.appearances.find((a) => a.playerId === player.id)
    if (!appearance) continue

    const rating = ratePlayerMatch(match, player)
    if (!rating) continue // Unused sub (or no rating for some reason)
    
    ratings.push(rating)
    if (actuallyPlayed(match, player.id)) {
      // Counts are raw events, not the weighted saves contribution in RatingBreakdown.
      saves += match.events.reduce((total, event) => {
        if (event.type !== 'save' || event.playerId !== player.id || event.teamId !== appearance.teamId) return total
        if (event.minute === undefined ? !matchPositionSegments(match, appearance).some(segment => segment.position === 'GK') : matchPositionAtEvent(match, appearance, event) !== 'GK') return total
        const count = event.count ?? 1
        return Number.isInteger(count) && count > 0 ? total + count : total
      }, 0)
    }
    if (appearance.role === 'starter') starts++
    else subs++

    const score = matchScore(match)
    const ours = appearance.teamId === match.homeTeamId ? score.home : score.away
    const theirs = appearance.teamId === match.homeTeamId ? score.away : score.home
    
    if (ours > theirs) { wins++; recentForm.push('W') }
    else if (ours === theirs) { draws++; recentForm.push('D') }
    else { losses++; recentForm.push('L') }
  }

  const goals = matches.reduce((sum, match) => {
    return (
      sum +
      match.events.filter(
        (e) => e.type === 'goal' && !e.ownGoal && e.playerId === player.id,
      ).length
    )
  }, 0)
  const assists = matches.reduce((sum, match) => {
    return (
      sum +
      match.events.filter(
        (e) => e.type === 'goal' && !e.ownGoal && e.assistPlayerId === player.id,
      ).length
    )
  }, 0)
  const minutes = ratings.reduce((sum, r) => sum + r.minutes, 0)
  const avgRating =
    ratings.length === 0
      ? 0
      : ratings.reduce((sum, r) => sum + r.raw, 0) / ratings.length
  const mom = matches.filter((match) => getMatchManOfTheMatch(match, allPlayers) === player.id).length
  
  return {
    playerId: player.id,
    teamId: player.teamId, // This might need to be more context-aware
    season: 'All', // This might need to be more context-aware
    matches: ratings.length,
    starts,
    subs,
    minutes,
    goals,
    assists,
    avgRating,
    saves,
    mom,
    wins,
    draws,
    losses,
    recentForm: recentForm.slice(-5).reverse(),
    ratings,
  }
}

export function playerSeasonStats(
  player: Player,
  allPlayers: Player[],
  matches: Match[],
  season: string,
  teamId?: string,
): PlayerSeasonStats {
  const seasonMatches = matches.filter((m) =>
    m.season === season && (!teamId || m.appearances.some((appearance) =>
      appearance.playerId === player.id && appearance.teamId === teamId,
    )),
  )
  return aggregatePlayerStats(player, allPlayers, seasonMatches)
}

export function teamSeasonStats(
  teamId: string,
  matches: Match[],
  season: string,
): TeamSeasonStats {
  const teamMatches = oldestMatches(matches.filter((m) =>
    m.season === season && (m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId))),
  ))
  
  let wins = 0
  let draws = 0
  let losses = 0
  let goalsFor = 0
  let goalsAgainst = 0
  let cleanSheets = 0
  const recentForm: ('W' | 'D' | 'L')[] = []
  
  for (const match of teamMatches) {
    const score = matchScore(match)
    const isHome = match.homeTeamId === teamId
    const ours = isHome ? score.home : score.away
    const theirs = isHome ? score.away : score.home
    
    goalsFor += ours
    goalsAgainst += theirs
    if (theirs === 0) cleanSheets++

    if (ours > theirs) { wins++; recentForm.push('W') }
    else if (ours === theirs) { draws++; recentForm.push('D') }
    else { losses++; recentForm.push('L') }
  }

  return {
    teamId,
    season,
    matches: teamMatches.length,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    cleanSheets,
    recentForm: recentForm.slice(-5).reverse(),
  }
}

export function partnershipStats(
  playerAId: string,
  playerBId: string,
  matches: Match[],
  season: string,
): PartnershipStats {
  const sharedMatches = matches.filter((m) =>
    m.season === season && 
    m.appearances.some(a => a.playerId === playerAId) &&
    m.appearances.some(a => a.playerId === playerBId)
  )

  let matchesTogether = 0
  let winsTogether = 0
  let goalsTogether = 0
  let assistsAtoB = 0
  let assistsBtoA = 0

  for (const match of sharedMatches) {
    const appA = match.appearances.find(a => a.playerId === playerAId)!
    const appB = match.appearances.find(a => a.playerId === playerBId)!
    
    const windowA = pitchWindow(match, appA)
    const windowB = pitchWindow(match, appB)

    // Unused subs check
    if (!windowA || !windowB) continue

    matchesTogether++
    
    const score = matchScore(match)
    const isHome = appA.teamId === match.homeTeamId
    const ours = isHome ? score.home : score.away
    const theirs = isHome ? score.away : score.home
    if (ours > theirs) winsTogether++

    // Goals together: overlap of windows
    const enter = Math.max(windowA.enter, windowB.enter)
    const exit = Math.min(windowA.exit, windowB.exit)
    if (enter < exit) {
      goalsTogether += match.events.filter(e => 
        e.type === 'goal' && 
        !e.ownGoal && 
        e.teamId === appA.teamId && 
        isOnPitchAtEvent(match, appA, e) && isOnPitchAtEvent(match, appB, e)
      ).length
    }

    // Assists
    assistsAtoB += match.events.filter(e => 
      e.type === 'goal' && 
      !e.ownGoal && 
      e.assistPlayerId === playerAId && 
      e.playerId === playerBId && isOnPitchAtEvent(match, appA, e) && isOnPitchAtEvent(match, appB, e)
    ).length
    assistsBtoA += match.events.filter(e => 
      e.type === 'goal' && 
      !e.ownGoal && 
      e.assistPlayerId === playerBId && 
      e.playerId === playerAId && isOnPitchAtEvent(match, appA, e) && isOnPitchAtEvent(match, appB, e)
    ).length
  }

  return {
    playerAId,
    playerBId,
    matchesTogether,
    winsTogether,
    goalsTogether,
    assistsAtoB,
    assistsBtoA,
  }
}

export type LeaderboardMetric = RankSort

export type GlobalLeaderboardRow = PlayerSeasonStats & {
  value: number
  historicalTeamId?: string
  playedGoalkeeper?: boolean
  sotAllowedAppearances?: number
  sotAllowedTotal?: number
  concededOnPitch?: number
  qualifyingGoalkeeperAppearances?: number
  qualifyingSaves?: number
}

const defenderRankingPosition = (position: Position) => ['CB', 'LB', 'RB'].includes(position)
const goalkeeperPosition = (position: Position) => position === 'GK'

/** Derived-only cache. A new store match/player array naturally invalidates
 * it, so lookup never serializes or hashes raw Match/Event payloads. */
type CompetitionStatsCacheEntry = { rows: GlobalLeaderboardRow[]; presented: Map<LeaderboardMetric, GlobalLeaderboardRow[]> }
let competitionStatsCache = new WeakMap<Match[], WeakMap<Player[], Map<string, CompetitionStatsCacheEntry>>>()

export function clearGlobalRankingCache() {
  competitionStatsCache = new WeakMap<Match[], WeakMap<Player[], Map<string, CompetitionStatsCacheEntry>>>()
}
function presentMetric(rows: GlobalLeaderboardRow[], metric: LeaderboardMetric) {
  const value = (row: GlobalLeaderboardRow) => metric === 'goals' ? row.goals : metric === 'assists' ? row.assists : metric === 'g+a' ? row.goals + row.assists : metric === 'minutes' ? row.minutes : metric === 'mom' ? row.mom : metric === 'goals/90' ? row.goals / row.minutes * 90 : metric === 'assists/90' ? row.assists / row.minutes * 90 : metric === 'g+a/90' ? (row.goals + row.assists) / row.minutes * 90 : row.avgRating
  return rows.map(row => ({ ...row, value: value(row) })).sort((a, b) => b.value - a.value)
}

/**
 * One-pass player competition index. Every ranking category and Best XI caller
 * can share the same rows; only sorting is repeated. The optional filters are
 * part of the cache key and do not mutate raw football data.
 */
export function buildGlobalRankingData(
  players: Player[],
  matches: Match[],
  filters: { seasons: string[], teams: string[], positions: Position[] },
  _metric: LeaderboardMetric,
): GlobalLeaderboardRow[] {
  const cacheKey = `${RATING_ENGINE_REVISION}|${filters.seasons.slice().sort().join(',')}|${filters.teams.slice().sort().join(',')}|${filters.positions.slice().sort().join(',')}`
  let byPlayers = competitionStatsCache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); competitionStatsCache.set(matches, byPlayers) }
  let byFilter = byPlayers.get(players)
  if (!byFilter) { byFilter = new Map(); byPlayers.set(players, byFilter) }
  const cached = byFilter.get(cacheKey)
  if (cached) {
    const presented = cached.presented.get(_metric)
    if (presented) return presented
    const rows = presentMetric(cached.rows, _metric)
    cached.presented.set(_metric, rows)
    return rows
  }
  const selected = matches.filter(match => (!filters.seasons.length || filters.seasons.includes(match.season)))
  const playerById = new Map(players.map(player => [player.id, player]))
  const matchesByPlayer = new Map<string, Match[]>()
  for (const match of selected) {
    for (const appearance of match.appearances) {
      if (!playerById.has(appearance.playerId) || (filters.teams.length && !filters.teams.includes(appearance.teamId))) continue
      const entries = matchesByPlayer.get(appearance.playerId) ?? []
      if (!entries.includes(match)) entries.push(match)
      matchesByPlayer.set(appearance.playerId, entries)
    }
  }

  const ratings = new Map<string, RatingBreakdown | null>()
  const ratingFor = (match: Match, player: Player): RatingBreakdown | null => {
    const key = `${match.id}:${player.id}`
    if (!ratings.has(key)) ratings.set(key, ratePlayerMatch(match, player))
    return ratings.get(key) ?? null
  }
  const moms = new Map<string, string | undefined>()
  const momFor = (match: Match): string | undefined => {
    if (moms.has(match.id)) return moms.get(match.id)
    const winner = getMatchManOfTheMatch(match, players)
    moms.set(match.id, winner)
    return winner
  }

  const rows = players.flatMap(player => {
    if (filters.positions.length && !filters.positions.includes(player.position)) return []
    const playerMatches = oldestMatches(matchesByPlayer.get(player.id) ?? [])
    const ratingRows: RatingBreakdown[] = []
    let starts = 0; let subs = 0; let saves = 0; let wins = 0; let draws = 0; let losses = 0
    let sotAllowedTotal = 0; let sotAllowedAppearances = 0; let concededOnPitch = 0; let qualifyingGoalkeeperAppearances = 0; let qualifyingSaves = 0
    const recentForm: ('W' | 'D' | 'L')[] = []
    for (const match of playerMatches) {
      const appearance = match.appearances.find(item => item.playerId === player.id)
      if (!appearance) continue
      const rating = ratingFor(match, player)
      if (!rating) continue
      ratingRows.push(rating)
      if (appearance.role === 'starter') starts++; else subs++
      const matchSaves = match.events.reduce((total, event) => {
        if (event.type !== 'save' || event.playerId !== player.id || event.teamId !== appearance.teamId) return total
        if (event.minute === undefined ? !matchPositionSegments(match, appearance).some(segment => segment.position === 'GK') : matchPositionAtEvent(match, appearance, event) !== 'GK') return total
        const count = event.count ?? 1
        return Number.isInteger(count) && count > 0 ? total + count : total
      }, 0)
      saves += matchSaves
      const window = pitchWindow(match, appearance)
      // Ranking eligibility follows the historical match role, just like the
      // rating engine; a later transfer or role change cannot rewrite it.
      const playedPositions = matchPositionSegments(match, appearance).map(segment => segment.position)
      const isDefender = playedPositions.some(defenderRankingPosition)
      const isGoalkeeper = playedPositions.some(goalkeeperPosition)
      if (window && isDefender && rating.minutes >= 60) {
        const score = matchScore(match)
        const conceded = appearance.teamId === match.homeTeamId ? score.away : score.home
        const teamSaves = match.events.reduce((total, event) => total + (event.type === 'save' && event.teamId === appearance.teamId ? event.count ?? 1 : 0), 0)
        sotAllowedTotal += conceded + teamSaves
        sotAllowedAppearances++
      }
      if (window && isGoalkeeper && rating.minutes >= 60) {
        qualifyingGoalkeeperAppearances++
        qualifyingSaves += matchSaves
        concededOnPitch += match.events.filter(event => event.type === 'goal' && scoringTeamId(match, event) !== appearance.teamId && isOnPitchAtEvent(match, appearance, event)).length
      }
      const score = matchScore(match); const ours = appearance.teamId === match.homeTeamId ? score.home : score.away; const theirs = appearance.teamId === match.homeTeamId ? score.away : score.home
      if (ours > theirs) { wins++; recentForm.push('W') } else if (ours === theirs) { draws++; recentForm.push('D') } else { losses++; recentForm.push('L') }
    }
    if (!ratingRows.length) return []
    const goals = playerMatches.reduce((sum, match) => { const appearance = match.appearances.find(item => item.playerId === player.id); return sum + (appearance ? match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id && isOnPitchAtEvent(match, appearance, event)).length : 0) }, 0)
    const assists = playerMatches.reduce((sum, match) => { const appearance = match.appearances.find(item => item.playerId === player.id); return sum + (appearance ? match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && isOnPitchAtEvent(match, appearance, event)).length : 0) }, 0)
    const minutes = ratingRows.reduce((sum, rating) => sum + rating.minutes, 0)
    const avgRating = ratingRows.reduce((sum, rating) => sum + rating.raw, 0) / ratingRows.length
    const latest = newestMatches(playerMatches)[0]
    const stats: PlayerSeasonStats = { playerId: player.id, teamId: player.teamId, season: 'All', matches: ratingRows.length, starts, subs, minutes, goals, assists, avgRating, mom: playerMatches.filter(match => momFor(match) === player.id).length, saves, wins, draws, losses, recentForm: recentForm.slice(-5).reverse(), ratings: ratingRows }
    const playedGoalkeeper = ratingRows.some(rating => {
      const match = playerMatches.find(item => item.id === rating.matchId)
      const appearance = match?.appearances.find(item => item.playerId === player.id)
      return match && appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
    })
    const value = _metric === 'goals' ? stats.goals : _metric === 'assists' ? stats.assists : _metric === 'g+a' ? stats.goals + stats.assists : _metric === 'minutes' ? stats.minutes : _metric === 'mom' ? stats.mom : _metric === 'goals/90' ? stats.goals / stats.minutes * 90 : _metric === 'assists/90' ? stats.assists / stats.minutes * 90 : _metric === 'g+a/90' ? (stats.goals + stats.assists) / stats.minutes * 90 : stats.avgRating
    return [{ ...stats, value, historicalTeamId: latest?.appearances.find(item => item.playerId === player.id)?.teamId, playedGoalkeeper, sotAllowedAppearances, sotAllowedTotal, concededOnPitch, qualifyingGoalkeeperAppearances, qualifyingSaves }]
  })
  const presented = presentMetric(rows, _metric)
  byFilter.set(cacheKey, { rows, presented: new Map([[_metric, presented]]) })
  return presented
}

/** Re-sorts an already-derived player index without recalculating any ratings. */
const rankedRowsCache = new WeakMap<GlobalLeaderboardRow[], WeakMap<Player[], Map<LeaderboardMetric, GlobalLeaderboardRow[]>>>()
export function rankGlobalRankingRows(rows: GlobalLeaderboardRow[], players: Player[], metric: LeaderboardMetric): GlobalLeaderboardRow[] {
  let byPlayers = rankedRowsCache.get(rows)
  if (!byPlayers) { byPlayers = new WeakMap(); rankedRowsCache.set(rows, byPlayers) }
  let byMetric = byPlayers.get(players)
  if (!byMetric) { byMetric = new Map(); byPlayers.set(players, byMetric) }
  const cached = byMetric.get(metric)
  if (cached) return cached
  const playerById = new Map(players.map(player => [player.id, player]))
  const valueFor = (row: GlobalLeaderboardRow) => {
    switch (metric) {
      case 'rating': return row.avgRating
      case 'goals': return row.goals
      case 'assists': return row.assists
      case 'g+a': return row.goals + row.assists
      case 'minutes': return row.minutes
      case 'mom': return row.mom
      case 'goals/90': return row.minutes ? row.goals / row.minutes * 90 : 0
      case 'assists/90': return row.minutes ? row.assists / row.minutes * 90 : 0
      case 'g+a/90': return row.minutes ? (row.goals + row.assists) / row.minutes * 90 : 0
      case 'sotAllowed': return row.sotAllowedAppearances ? (row.sotAllowedTotal ?? 0) / row.sotAllowedAppearances : Number.NaN
      case 'cleanSheets': return row.ratings.filter(rating => rating.minutes > 0 && rating.conceded === 0).length
      case 'saves': return row.saves
      case 'goalsConceded': return row.qualifyingGoalkeeperAppearances ? (row.concededOnPitch ?? 0) / row.qualifyingGoalkeeperAppearances : Number.NaN
      case 'savePercentage': { const saves = row.qualifyingSaves ?? 0; const denominator = saves + (row.concededOnPitch ?? 0); return denominator ? saves / denominator * 100 : Number.NaN }
    }
  }
  const ranked = rows.flatMap(row => {
    const player = playerById.get(row.playerId)
    const requiresDefensiveSample = metric === 'sotAllowed' && !row.sotAllowedAppearances
    const requiresGoalkeeperSample = (metric === 'saves' || metric === 'goalsConceded' || metric === 'savePercentage' || metric === 'cleanSheets') && !row.playedGoalkeeper
    if (!player || requiresDefensiveSample || requiresGoalkeeperSample) return []
    const value = valueFor(row)
    return Number.isFinite(value) ? [{ ...row, value }] : []
  }).sort((a, b) => (metric === 'sotAllowed' || metric === 'goalsConceded' ? a.value - b.value : b.value - a.value) || b.avgRating - a.avgRating || a.playerId.localeCompare(b.playerId))
  byMetric.set(metric, ranked)
  return ranked
}

export function getLeaderboard(
  players: Player[],
  matches: Match[],
  filters: { seasons: string[], teams: string[], positions: Position[] },
  metric: LeaderboardMetric,
): (PlayerSeasonStats & { value: number })[] {
  const { seasons, teams, positions } = filters
  const positionByPlayerId = new Map(players.map(player => [player.id, player.position]))
  
  const filteredMatches = matches.filter((m) =>
    (seasons.length === 0 || seasons.includes(m.season)) &&
    (teams.length === 0 || teams.includes(m.teamId || m.homeTeamId || m.awayTeamId || ''))
  )

  const stats = players
    .filter(p => positions.length === 0 || positions.includes(p.position))
    .map(p => {
      const playerMatches = metric === 'saves' ? matches.filter(match =>
        (!seasons.length || seasons.includes(match.season)) && match.appearances.some(appearance =>
          appearance.playerId === p.id && (!teams.length || teams.includes(appearance.teamId)),
        ),
      ) : filteredMatches
      const s = aggregatePlayerStats(p, players, playerMatches)
      let value = 0
      switch (metric) {
        case 'rating': value = s.avgRating; break
        case 'goals': value = s.goals; break
        case 'assists': value = s.assists; break
        case 'g+a': value = s.goals + s.assists; break
        case 'minutes': value = s.minutes; break
        case 'mom': value = s.mom; break
        case 'goals/90': value = s.minutes > 0 ? (s.goals / s.minutes * 90) : 0; break
        case 'assists/90': value = s.minutes > 0 ? (s.assists / s.minutes * 90) : 0; break
        case 'g+a/90': value = s.minutes > 0 ? ((s.goals + s.assists) / s.minutes * 90) : 0; break
        case 'sotAllowed': value = 0; break
        case 'cleanSheets': value = s.ratings.filter(rating => rating.minutes > 0 && rating.conceded === 0).length; break
        case 'saves': value = s.saves; break
        case 'goalsConceded': value = 0; break
        case 'savePercentage': value = 0; break
      }
      return { ...s, value }
    })
    .filter(s => s.matches > 0)
    .filter(s => metric !== 'sotAllowed' || defenderRankingPosition(positionByPlayerId.get(s.playerId) ?? 'ST'))
    .filter(s => (metric !== 'cleanSheets') || (positionByPlayerId.get(s.playerId) === 'GK' && s.ratings.some(rating => {
      const match = matches.find(item => item.id === rating.matchId)
      const appearance = match?.appearances.find(item => item.playerId === s.playerId)
      return match && appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
    })))
    .filter(s => metric !== 'saves' || s.ratings.some(rating => {
      const match = matches.find(item => item.id === rating.matchId)
      const appearance = match?.appearances.find(item => item.playerId === s.playerId)
      return match && appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
    }))
    .sort((a, b) => {
      if (metric === 'sotAllowed' || metric === 'goalsConceded') return a.value - b.value // Ascending
      return b.value - a.value // Descending
    })
  return stats
}

export function globalRankings(
  players: Player[],
  matches: Match[],
  season: string,
  sort: RankSort = 'rating',
): PlayerSeasonStats[] {
  const seasonMatches = matches.filter((m) => m.season === season)
  const rows = players
    .map((player) => playerSeasonStats(player, players, matches, season))
    .filter((row) => row.matches > 0)
    .filter((row) => {
      if (sort !== 'rating') return true
      const teamId = row.teamId
      const teamMatchesCount = seasonMatches.filter((match) => matchRecordedForTeam(match, teamId)).length
      return row.matches >= Math.ceil(teamMatchesCount * 0.5)
    })

  rows.sort((a, b) => {
    if (sort === 'goals') return b.goals - a.goals || b.avgRating - a.avgRating
    if (sort === 'assists') return b.assists - a.assists || b.avgRating - a.avgRating
    if (sort === 'minutes') return b.minutes - a.minutes || b.avgRating - a.avgRating
    return b.avgRating - a.avgRating || b.goals - a.goals
  })
  return rows
}

export function lastMatchDays(matches: Match[], season: string, count = 5): number[] {
  const days: number[] = []
  for (const match of newestMatches(matches.filter((m) => m.season === season))) {
    if (!days.includes(match.matchDay)) days.push(match.matchDay)
    if (days.length === count) break
  }
  return days
}

const FORMATION_433: { slot: string; position: Position; pool: Position[] }[] = [
  { slot: 'GK', position: 'GK', pool: ['GK'] },
  { slot: 'LB', position: 'LB', pool: ['LB', 'LM', 'CB'] },
  { slot: 'LCB', position: 'CB', pool: ['CB'] },
  { slot: 'RCB', position: 'CB', pool: ['CB'] },
  { slot: 'RB', position: 'RB', pool: ['RB', 'RM', 'CB'] },
  { slot: 'LCM', position: 'CM', pool: ['CM', 'CDM', 'CAM', 'LM'] },
  { slot: 'CM', position: 'CM', pool: ['CM', 'CDM', 'CAM'] },
  { slot: 'RCM', position: 'CM', pool: ['CM', 'CDM', 'CAM', 'RM'] },
  { slot: 'LW', position: 'LW', pool: ['LW', 'LM', 'ST'] },
  { slot: 'ST', position: 'ST', pool: ['ST', 'CAM', 'RW', 'LW'] },
  { slot: 'RW', position: 'RW', pool: ['RW', 'RM', 'ST'] },
]

const UNIFIED_433: { slot: string; position: Position; group: Position[]; fallback?: Position[] }[] = [
  { slot: 'GK', position: 'GK', group: ['GK'] },
  { slot: 'LB', position: 'LB', group: ['LB'] },
  { slot: 'LCB', position: 'CB', group: ['CB', 'LCB', 'RCB'] },
  { slot: 'RCB', position: 'CB', group: ['CB', 'LCB', 'RCB'] },
  { slot: 'RB', position: 'RB', group: ['RB'] },
  { slot: 'LCM', position: 'CM', group: ['CDM', 'CM', 'CAM', 'LM', 'RM'] },
  { slot: 'CM', position: 'CM', group: ['CDM', 'CM', 'CAM', 'LM', 'RM'] },
  { slot: 'RCM', position: 'CM', group: ['CDM', 'CM', 'CAM', 'LM', 'RM'] },
  { slot: 'LW', position: 'LW', group: ['ST', 'LW', 'RW'] },
  { slot: 'ST', position: 'ST', group: ['ST', 'LW', 'RW'] },
  { slot: 'RW', position: 'RW', group: ['ST', 'LW', 'RW'] },
]

type UnifiedCandidate = {
  player: Player
  teamId?: string
  average: number
  matches: number
  latestRating: number
}

type SeasonParticipation = {
  match: Match
  teamId: string
  rating: RatingBreakdown | null
}

function matchRecordedForTeam(match: Match, teamId: string): boolean {
  return match.teamId === teamId ||
    (!match.teamId && (match.homeTeamId === teamId || match.awayTeamId === teamId))
}

/** A bench listing is not an appearance until the player has a recorded sub-on. */
function actuallyPlayed(match: Match, playerId: string): boolean {
  const appearance = match.appearances.find((item) => item.playerId === playerId)
  if (!appearance) return false
  if (appearance.role === 'starter') return true
  return match.events.some((event) =>
    event.type === 'sub' &&
    event.playerInId === playerId &&
    event.teamId === appearance.teamId,
  )
}

function candidateOrder(a: UnifiedCandidate, b: UnifiedCandidate): number {
  return b.average - a.average || b.matches - a.matches || b.latestRating - a.latestRating || (a.player.displayName ?? a.player.name).localeCompare(b.player.displayName ?? b.player.name) || a.player.id.localeCompare(b.player.id)
}

function unifiedCandidates(players: Player[], matches: Match[], season: string, recentOnly: boolean): UnifiedCandidate[] {
  const seasonMatches = matches.filter((match) => match.season === season)
  return players.flatMap((player) => {
    const participations: SeasonParticipation[] = seasonMatches.flatMap((match) => {
      const appearance = match.appearances.find((item) => item.playerId === player.id)
      return appearance && actuallyPlayed(match, player.id)
        ? [{ match, teamId: appearance.teamId, rating: ratePlayerMatch(match, player) }]
        : []
    })
    const orderedParticipations = newestMatches(participations.map(item => item.match)).map(match => participations.find(item => item.match === match)!)

    const teamIds = [...new Set(orderedParticipations.map((item) => item.teamId))]
    return teamIds.flatMap((teamId) => {
      const teamParticipations = orderedParticipations.filter((item) => item.teamId === teamId)
      const ratings = teamParticipations.flatMap((item) => item.rating ? [item.rating] : [])
      const selectedRatings = recentOnly ? ratings.slice(0, 3) : ratings
      const completed = seasonMatches.filter((match) => matchRecordedForTeam(match, teamId)).length
      const eligible = teamParticipations.length >= Math.ceil(completed * 0.5)
      if ((recentOnly && selectedRatings.length < 3) || (!recentOnly && !eligible)) return []
      return [{ player, teamId, average: selectedRatings.reduce((sum, row) => sum + row.raw, 0) / selectedRatings.length, matches: selectedRatings.length, latestRating: selectedRatings[0]?.raw ?? 0 }]
    })
  }).filter((candidate) => candidate.matches > 0).sort(candidateOrder)
}

type UnifiedBestEleven = { slots: Best11Slot[]; statsByPlayer: Record<string, { goals: number; assists: number }> }
const bestElevenCache = new WeakMap<Match[], WeakMap<Player[], Map<string, UnifiedBestEleven>>>()

export function unifiedBestEleven(
  players: Player[],
  matches: Match[],
  season: string,
  recentOnly = false,
): UnifiedBestEleven {
  let byPlayers = bestElevenCache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); bestElevenCache.set(matches, byPlayers) }
  let byScope = byPlayers.get(players)
  if (!byScope) { byScope = new Map(); byPlayers.set(players, byScope) }
  const cacheKey = `${RATING_ENGINE_REVISION}:${season}:${recentOnly ? 'recent' : 'season'}`
  const cached = byScope.get(cacheKey)
  if (cached) return cached
  const candidates = unifiedCandidates(players, matches, season, recentOnly)
  const used = new Set<string>()
  const pick = (positions: Position[], fallback: Position[] = []): UnifiedCandidate | undefined => {
    const primary = candidates.find((candidate) => !used.has(candidate.player.id) && positions.includes(candidate.player.position))
    if (primary) return primary
    return candidates.find((candidate) => !used.has(candidate.player.id) && fallback.includes(candidate.player.position))
  }
  const slots = UNIFIED_433.map((role) => {
    const candidate = pick(role.group, role.fallback)
    if (!candidate) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(candidate.player.id)
    return { slot: role.slot, position: role.position, playerId: candidate.player.id, teamId: candidate.teamId, avgRating: candidate.average, matches: candidate.matches }
  })
  const statsByPlayer = Object.fromEntries(players.map((player) => {
    const stats = playerSeasonStats(player, players, matches, season)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  const result = { slots, statsByPlayer }
  byScope.set(cacheKey, result)
  return result
}

export function bestEleven(
  players: Player[],
  matches: Match[],
  season: string,
): { matchDays: number[]; slots: Best11Slot[] } {
  const days = lastMatchDays(matches, season, 5)
  const windowMatches = matches.filter(
    (m) => m.season === season && days.includes(m.matchDay),
  )
  const form = players
    .map((player) => {
      const ratings = windowMatches
        .map((match) => ratePlayerMatch(match, player))
        .filter((row): row is RatingBreakdown => row !== null)
      const avg =
        ratings.length === 0
          ? 0
          : ratings.reduce((sum, r) => sum + r.raw, 0) / ratings.length
      return { player, avg, matches: ratings.length }
    })
    .filter((row) => row.matches > 0)
    .sort((a, b) => b.avg - a.avg)

  const used = new Set<string>()
  const slots: Best11Slot[] = FORMATION_433.map((role) => {
    const pick = form.find(
      (row) =>
        !used.has(row.player.id) && role.pool.includes(row.player.position),
    )
    if (!pick) {
      return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    }
    used.add(pick.player.id)
    return {
      slot: role.slot,
      position: role.position,
      playerId: pick.player.id,
      avgRating: pick.avg,
      matches: pick.matches,
    }
  })

  return { matchDays: days, slots }
}

export function teamMatches(matches: Match[], teamId: string): Match[] {
  return newestMatches(matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId))
}

export function latestTeamMatch(matches: Match[], teamId: string, season: string): Match | undefined {
  return teamMatches(matches.filter((match) => match.season === season), teamId)[0]
}

export function formationForMatch(match: Match | undefined): string | null {
  return match?.formation || (match ? '4-3-3' : null)
}

export function teamBestEleven(
  players: Player[],
  matches: Match[],
  teamId: string,
  season: string,
): { formation: string | null; slots: Best11Slot[]; match: Match | undefined } {
  const match = latestTeamMatch(matches, teamId, season)
  if (!match) return { formation: null, slots: [], match }
  const slots = kickoffLineupForMatch(match, teamId).map((kickoff): Best11Slot => {
    const player = kickoff.playerId ? players.find(item => item.id === kickoff.playerId) : undefined
    const rating = player ? ratePlayerMatch(match, player) : null
    return { slot: kickoff.id, position: kickoff.ratingPosition ?? kickoff.matchPosition, matchPosition: kickoff.ratingPosition ?? kickoff.matchPosition, playerId: kickoff.playerId, teamId, avgRating: rating?.rating ?? 0, matches: rating ? 1 : 0, x: kickoff.x, y: kickoff.y }
  })
  return { formation: match.formation ?? null, slots, match }
}
