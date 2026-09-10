import type {
  Best11Slot,
  Appearance,
  FormationSlot,
  Match,
  Player,
  PlayerSeasonStats,
  Position,
  RankSort,
  RatingBreakdown,
  TeamSeasonStats,
  PartnershipStats,
} from '../types'
import { ratePlayerMatch, getMatchManOfTheMatch, matchScore, pitchWindow, matchPositionAt, matchPositionSegments } from './rating'
import { FORMATION_SLOTS, formationSlotsFor, type TacticalSlot } from '../components/Pitch'


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

  for (const match of matches) {
    const appearance = match.appearances.find((a) => a.playerId === player.id)
    if (!appearance) continue

    const rating = ratePlayerMatch(match, player)
    if (!rating) continue // Unused sub (or no rating for some reason)
    
    ratings.push(rating)
    if (actuallyPlayed(match, player.id)) {
      // Counts are raw events, not the weighted saves contribution in RatingBreakdown.
      saves += match.events.reduce((total, event) => {
        if (event.type !== 'save' || event.playerId !== player.id || event.teamId !== appearance.teamId) return total
        if (matchPositionAt(match, appearance, event.minute) !== 'GK') return total
        if (event.minute !== undefined && !(event.minute >= rating.enter && event.minute < rating.exit)) return total
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
      : Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 100) / 100
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
  const teamMatches = matches.filter((m) =>
    m.season === season && (m.teamId === teamId || (!m.teamId && (m.homeTeamId === teamId || m.awayTeamId === teamId))),
  )
  
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
        e.minute >= enter && e.minute < exit
      ).length
    }

    // Assists
    assistsAtoB += match.events.filter(e => 
      e.type === 'goal' && 
      !e.ownGoal && 
      e.assistPlayerId === playerAId && 
      e.playerId === playerBId
    ).length
    assistsBtoA += match.events.filter(e => 
      e.type === 'goal' && 
      !e.ownGoal && 
      e.assistPlayerId === playerBId && 
      e.playerId === playerAId
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

/** A small module cache, deliberately never persisted.  Its key includes the
 * relevant raw match revision, so a Cup write cannot invalidate League data. */
const competitionStatsCache = new Map<string, GlobalLeaderboardRow[]>()
function presentMetric(rows: GlobalLeaderboardRow[], metric: LeaderboardMetric) {
  const value = (row: GlobalLeaderboardRow) => metric === 'goals' ? row.goals : metric === 'assists' ? row.assists : metric === 'g+a' ? row.goals + row.assists : metric === 'minutes' ? row.minutes : metric === 'mom' ? row.mom : metric === 'goals/90' ? row.goals / row.minutes * 90 : metric === 'assists/90' ? row.assists / row.minutes * 90 : metric === 'g+a/90' ? (row.goals + row.assists) / row.minutes * 90 : row.avgRating
  return rows.map(row => ({ ...row, value: value(row) })).sort((a, b) => b.value - a.value)
}
function matchRevision(matches: Match[]) {
  return matches.map(match => `${match.id}:${match.date}:${match.events.map(event => `${event.id}:${event.type}:${event.minute ?? ''}:${event.type === 'save' ? event.count ?? '' : ''}`).join(',')}:${match.appearances.map(app => `${app.playerId}:${app.role}:${app.positionHistory?.map(change => `${change.minute}${change.position}`).join('.') ?? ''}`).join(',')}`).sort().join('|')
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
  const selected = matches.filter(match => (!filters.seasons.length || filters.seasons.includes(match.season)))
  const cacheKey = `${filters.seasons.slice().sort().join(',')}|${filters.teams.slice().sort().join(',')}|${filters.positions.slice().sort().join(',')}|${players.map(player => `${player.id}:${player.position}`).join(',')}|${matchRevision(selected)}`
  const cached = competitionStatsCache.get(cacheKey)
  if (cached) return presentMetric(cached, _metric)
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
    const rows = match.appearances.flatMap(appearance => {
      const player = playerById.get(appearance.playerId)
      const rating = player ? ratingFor(match, player) : null
      return rating ? [rating] : []
    })
    const winner = rows.sort((a, b) => b.raw - a.raw || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))[0]?.playerId
    moms.set(match.id, winner)
    return winner
  }

  const rows = players.flatMap(player => {
    if (filters.positions.length && !filters.positions.includes(player.position)) return []
    const playerMatches = matchesByPlayer.get(player.id) ?? []
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
        if (matchPositionAt(match, appearance, event.minute) !== 'GK') return total
        if (event.minute !== undefined && !(event.minute >= rating.enter && event.minute < rating.exit)) return total
        const count = event.count ?? 1
        return Number.isInteger(count) && count > 0 ? total + count : total
      }, 0)
      saves += matchSaves
      const window = pitchWindow(match, appearance)
      const isDefender = defenderRankingPosition(player.position)
      const isGoalkeeper = goalkeeperPosition(player.position)
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
        concededOnPitch += match.events.filter(event => event.type === 'goal' && event.teamId !== appearance.teamId && event.minute >= window.enter && event.minute < window.exit).length
      }
      const score = matchScore(match); const ours = appearance.teamId === match.homeTeamId ? score.home : score.away; const theirs = appearance.teamId === match.homeTeamId ? score.away : score.home
      if (ours > theirs) { wins++; recentForm.push('W') } else if (ours === theirs) { draws++; recentForm.push('D') } else { losses++; recentForm.push('L') }
    }
    if (!ratingRows.length) return []
    const goals = playerMatches.reduce((sum, match) => sum + match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id).length, 0)
    const assists = playerMatches.reduce((sum, match) => sum + match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id).length, 0)
    const minutes = ratingRows.reduce((sum, rating) => sum + rating.minutes, 0)
    const avgRating = Math.round(ratingRows.reduce((sum, rating) => sum + rating.rating, 0) / ratingRows.length * 100) / 100
    const latest = playerMatches.reduce<Match | undefined>((current, match) => !current || match.date > current.date || (match.date === current.date && match.matchDay > current.matchDay) ? match : current, undefined)
    const stats: PlayerSeasonStats = { playerId: player.id, teamId: player.teamId, season: 'All', matches: ratingRows.length, starts, subs, minutes, goals, assists, avgRating, mom: playerMatches.filter(match => momFor(match) === player.id).length, saves, wins, draws, losses, recentForm: recentForm.slice(-5).reverse(), ratings: ratingRows }
    const playedGoalkeeper = ratingRows.some(rating => {
      const match = playerMatches.find(item => item.id === rating.matchId)
      const appearance = match?.appearances.find(item => item.playerId === player.id)
      return match && appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
    })
    const value = _metric === 'goals' ? stats.goals : _metric === 'assists' ? stats.assists : _metric === 'g+a' ? stats.goals + stats.assists : _metric === 'minutes' ? stats.minutes : _metric === 'mom' ? stats.mom : _metric === 'goals/90' ? stats.goals / stats.minutes * 90 : _metric === 'assists/90' ? stats.assists / stats.minutes * 90 : _metric === 'g+a/90' ? (stats.goals + stats.assists) / stats.minutes * 90 : stats.avgRating
    return [{ ...stats, value, historicalTeamId: latest?.appearances.find(item => item.playerId === player.id)?.teamId, playedGoalkeeper, sotAllowedAppearances, sotAllowedTotal, concededOnPitch, qualifyingGoalkeeperAppearances, qualifyingSaves }]
  })
  competitionStatsCache.set(cacheKey, rows)
  return presentMetric(rows, _metric)
}

/** Re-sorts an already-derived player index without recalculating any ratings. */
export function rankGlobalRankingRows(rows: GlobalLeaderboardRow[], players: Player[], metric: LeaderboardMetric): GlobalLeaderboardRow[] {
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
  return rows.flatMap(row => {
    const player = playerById.get(row.playerId)
    if (!player || (metric === 'sotAllowed' && (!defenderRankingPosition(player.position) || !row.sotAllowedAppearances)) || ((metric === 'saves' || metric === 'goalsConceded' || metric === 'savePercentage') && (!goalkeeperPosition(player.position) || !row.playedGoalkeeper))) return []
    const value = valueFor(row)
    return Number.isFinite(value) ? [{ ...row, value }] : []
  }).sort((a, b) => (metric === 'sotAllowed' || metric === 'goalsConceded' ? a.value - b.value : b.value - a.value) || b.avgRating - a.avgRating || a.playerId.localeCompare(b.playerId))
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
  const days = [...new Set(matches.filter((m) => m.season === season).map((m) => m.matchDay))]
  days.sort((a, b) => b - a)
  return days.slice(0, count).sort((a, b) => a - b)
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

function compareMostRecentMatch(a: SeasonParticipation, b: SeasonParticipation): number {
  return b.match.matchDay - a.match.matchDay ||
    b.match.date.localeCompare(a.match.date) ||
    b.match.id.localeCompare(a.match.id)
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
    }).sort(compareMostRecentMatch)

    const teamIds = [...new Set(participations.map((item) => item.teamId))]
    return teamIds.flatMap((teamId) => {
      const teamParticipations = participations.filter((item) => item.teamId === teamId)
      const ratings = teamParticipations.flatMap((item) => item.rating ? [item.rating] : [])
      const selectedRatings = recentOnly ? ratings.slice(0, 3) : ratings
      const completed = seasonMatches.filter((match) => matchRecordedForTeam(match, teamId)).length
      const eligible = teamParticipations.length >= Math.ceil(completed * 0.5)
      if ((recentOnly && selectedRatings.length < 3) || (!recentOnly && !eligible)) return []
      return [{ player, teamId, average: selectedRatings.reduce((sum, row) => sum + row.rating, 0) / selectedRatings.length, matches: selectedRatings.length, latestRating: selectedRatings[0]?.rating ?? 0 }]
    })
  }).filter((candidate) => candidate.matches > 0).sort(candidateOrder)
}

export function unifiedBestEleven(
  players: Player[],
  matches: Match[],
  season: string,
  recentOnly = false,
): { slots: Best11Slot[]; statsByPlayer: Record<string, { goals: number; assists: number }> } {
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
    return { slot: role.slot, position: role.position, playerId: candidate.player.id, teamId: candidate.teamId, avgRating: Math.round(candidate.average * 10) / 10, matches: candidate.matches }
  })
  const statsByPlayer = Object.fromEntries(players.map((player) => {
    const stats = playerSeasonStats(player, players, matches, season)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  return { slots, statsByPlayer }
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
          : ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
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
      avgRating: Math.round(pick.avg * 10) / 10,
      matches: pick.matches,
    }
  })

  return { matchDays: days, slots }
}

export function teamMatches(matches: Match[], teamId: string): Match[] {
  return matches
    .filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)
    .sort((a, b) => b.matchDay - a.matchDay || b.date.localeCompare(a.date))
}

export function latestTeamMatch(matches: Match[], teamId: string, season: string): Match | undefined {
  return teamMatches(matches.filter((match) => match.season === season), teamId)[0]
}

export function formationForMatch(match: Match | undefined): string | null {
  return match?.formation || (match ? '4-3-3' : null)
}

type TacticalFamily = 'goalkeeper' | 'defender' | 'deep-midfield' | 'midfield' | 'advanced-midfield' | 'wide-attack' | 'central-attack'

const POSITION_ALIASES: Partial<Record<Position, Position>> = {
  LCB: 'CB', RCB: 'CB', LWB: 'LB', RWB: 'RB', LDM: 'CDM', RDM: 'CDM',
  LCM: 'CM', RCM: 'CM', LST: 'ST', RST: 'ST',
}

function tacticalPosition(position: string | undefined): Position | undefined {
  if (!position) return undefined
  const candidate = position.toUpperCase() as Position
  const valid: Position[] = ['GK', 'CB', 'LCB', 'RCB', 'LB', 'LWB', 'RB', 'RWB', 'LDM', 'CDM', 'RDM', 'LCM', 'CM', 'RCM', 'CAM', 'LM', 'RM', 'LW', 'LST', 'RW', 'RST', 'SS', 'ST']
  return valid.includes(candidate) ? candidate : undefined
}

function tacticalFamily(position: Position): TacticalFamily {
  const base = POSITION_ALIASES[position] ?? position
  if (base === 'GK') return 'goalkeeper'
  if (['CB', 'LB', 'RB'].includes(base)) return 'defender'
  if (base === 'CDM') return 'deep-midfield'
  if (['CM', 'LM', 'RM'].includes(base)) return 'midfield'
  if (base === 'CAM') return 'advanced-midfield'
  if (['LW', 'RW'].includes(base)) return 'wide-attack'
  return 'central-attack'
}

function tacticalSide(position: string): -1 | 0 | 1 {
  if (position.startsWith('L')) return -1
  if (position.startsWith('R')) return 1
  return 0
}

function normalizedCoordinate(value: number): number | undefined {
  if (!Number.isFinite(value) || value < 0 || value > 100) return undefined
  return value <= 1 ? value * 100 : value
}

function savedPoint(appearance: Appearance, saved: FormationSlot | undefined): { x: number; y: number; rawX: number; rawY: number } | undefined {
  const rawX = saved?.x ?? appearance.kickoffX ?? appearance.x
  const rawY = saved?.y ?? appearance.kickoffY ?? appearance.y
  if (rawX === undefined || rawY === undefined) return undefined
  const x = normalizedCoordinate(rawX)
  const y = normalizedCoordinate(rawY)
  return x === undefined || y === undefined ? undefined : { x, y, rawX, rawY }
}

function familyCost(player: TacticalFamily, slot: TacticalFamily): number {
  if (player === slot) return 0
  if (player === 'goalkeeper' || slot === 'goalkeeper') return 5000
  if (player === 'defender' || slot === 'defender') return 900
  const midfield = ['deep-midfield', 'midfield', 'advanced-midfield']
  if (midfield.includes(player) && midfield.includes(slot)) {
    const order = ['deep-midfield', 'midfield', 'advanced-midfield']
    return Math.abs(order.indexOf(player) - order.indexOf(slot)) * 70
  }
  const attack = ['wide-attack', 'central-attack']
  if (attack.includes(player) && attack.includes(slot)) return 45
  if ((player === 'advanced-midfield' && attack.includes(slot)) || (slot === 'advanced-midfield' && attack.includes(player))) return 150
  if ((player === 'midfield' && slot === 'wide-attack') || (slot === 'midfield' && player === 'wide-attack')) return 220
  return 500
}

function assignmentCost(position: Position, slot: TacticalSlot, savedSlotId: string | undefined, point: ReturnType<typeof savedPoint>): number {
  const slotPosition = tacticalPosition(slot.matchPosition) ?? slot.matchPosition
  const samePosition = (POSITION_ALIASES[position] ?? position) === (POSITION_ALIASES[slotPosition] ?? slotPosition)
  const sideDistance = Math.abs(tacticalSide(position) - tacticalSide(slot.slot))
  let cost = samePosition ? 0 : familyCost(tacticalFamily(position), tacticalFamily(slotPosition)) + 25
  cost += sideDistance * (samePosition ? 6 : 12)
  // A saved slot decides between tactically compatible choices, but cannot overrule kickoff matchPosition.
  if (savedSlotId === slot.slot && samePosition) cost -= 60
  if (point) cost += Math.hypot(point.x - slot.x, point.y - slot.y) / 20
  return cost
}

function minimumCostAssignment(costs: number[][]): number[] {
  const memo = new Map<string, { cost: number; slots: number[] }>()
  const visit = (playerIndex: number, used: number): { cost: number; slots: number[] } => {
    if (playerIndex === costs.length) return { cost: 0, slots: [] }
    const key = `${playerIndex}:${used}`
    const cached = memo.get(key)
    if (cached) return cached
    let best = { cost: Number.POSITIVE_INFINITY, slots: [] as number[] }
    for (let slotIndex = 0; slotIndex < costs[playerIndex].length; slotIndex += 1) {
      if (used & (1 << slotIndex)) continue
      const rest = visit(playerIndex + 1, used | (1 << slotIndex))
      const cost = costs[playerIndex][slotIndex] + rest.cost
      if (cost < best.cost) best = { cost, slots: [slotIndex, ...rest.slots] }
    }
    memo.set(key, best)
    return best
  }
  return visit(0, 0).slots
}

export function teamBestEleven(
  players: Player[],
  matches: Match[],
  teamId: string,
  season: string,
): { formation: string | null; slots: Best11Slot[]; match: Match | undefined } {
  const match = latestTeamMatch(matches, teamId, season)
  if (!match) return { formation: null, slots: [], match }
  // Team Main is a historical match view: never manufacture an XI from roster/base positions.
  const starters = match.appearances.filter(item => item.teamId === teamId && item.role === 'starter')
  const unique = starters.filter((item, index) => starters.findIndex(other => other.playerId === item.playerId) === index)
  const tacticalSlots = formationSlotsFor(match.formation) ?? FORMATION_SLOTS['4-3-3']
  const savedKickoffSlot = (playerId: string) => match.kickoffLineup?.find(slot => slot.playerId === playerId)
  const kickoff = unique.slice(0, tacticalSlots.length).map(appearance => {
    const saved = savedKickoffSlot(appearance.playerId)
    const point = savedPoint(appearance, saved)
    const coordinatePosition = point
      ? tacticalPosition(tacticalSlots.reduce((closest, slot) => Math.hypot(point.x - slot.x, point.y - slot.y) < Math.hypot(point.x - closest.x, point.y - closest.y) ? slot : closest).matchPosition)
      : undefined
    const player = players.find(item => item.id === appearance.playerId)
    const position = tacticalPosition(appearance.matchPosition) ?? tacticalPosition(saved?.matchPosition) ?? coordinatePosition ?? tacticalPosition(appearance.position) ?? tacticalPosition(player?.position) ?? 'CM'
    return { appearance, saved, point, player, position }
  })
  const assignment = minimumCostAssignment(kickoff.map(item => tacticalSlots.map(slot => assignmentCost(item.position, slot, item.saved?.id, item.point))))
  const slots = kickoff.map((item, index): Best11Slot => {
    const tactical = tacticalSlots[assignment[index]]
    const rating = item.player ? ratePlayerMatch(match, item.player) : null
    return { slot: tactical.slot, position: tactical.position, matchPosition: item.position, playerId: item.appearance.playerId, teamId, avgRating: rating?.rating ?? 0, matches: 1 }
  })
  // Keep only valid saved points that do not collide with another saved/default rendered point.
  const acceptedPoints = new Set<number>()
  const collides = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 7
  kickoff.forEach((item, index) => {
    if (item.point && ![...acceptedPoints].some(other => collides(item.point!, kickoff[other].point!))) acceptedPoints.add(index)
  })
  for (const index of [...acceptedPoints]) {
    const conflictsWithDefault = kickoff.some((_, otherIndex) => otherIndex !== index && !acceptedPoints.has(otherIndex) && collides(kickoff[index].point!, tacticalSlots[assignment[otherIndex]]))
    if (conflictsWithDefault) acceptedPoints.delete(index)
  }
  for (const index of acceptedPoints) {
    const point = kickoff[index].point!
    slots[index].x = point.rawX
    slots[index].y = point.rawY
  }
  return { formation: match.formation ?? null, slots, match }
}
