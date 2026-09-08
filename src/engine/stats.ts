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
import { ratePlayerMatch, getMatchManOfTheMatch, matchScore, pitchWindow, matchPositionAt, matchPositionSegments } from './rating'
import { FORMATION_SLOTS } from '../components/Pitch'


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
      : Math.round(
          (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10,
        ) / 10
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

export type LeaderboardMetric =
  | 'rating' | 'goals' | 'assists' | 'g+a' | 'minutes' | 'mom'
  | 'goals/90' | 'assists/90' | 'g+a/90' | 'ga/90' | 'cleanSheets' | 'saves'

export function getLeaderboard(
  players: Player[],
  matches: Match[],
  filters: { seasons: string[], teams: string[], positions: Position[] },
  metric: LeaderboardMetric,
): (PlayerSeasonStats & { value: number })[] {
  const { seasons, teams, positions } = filters
  
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
        case 'ga/90': value = 0; break // TODO
        case 'cleanSheets': value = 0; break // TODO
        case 'saves': value = s.saves; break
      }
      return { ...s, value }
    })
    .filter(s => s.matches > 0)
    .filter(s => metric !== 'saves' || s.ratings.some(rating => {
      const match = matches.find(item => item.id === rating.matchId)
      const appearance = match?.appearances.find(item => item.playerId === s.playerId)
      return match && appearance && matchPositionSegments(match, appearance).some(segment => segment.position === 'GK')
    }))
    .sort((a, b) => {
      if (metric === 'ga/90') return a.value - b.value // Ascending
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
  const tacticalSlots = match.formation ? FORMATION_SLOTS[match.formation] : undefined
  const remaining = [...unique]
  const slots = (tacticalSlots ?? []).flatMap(tactical => {
    const index = remaining.findIndex(item => (item.matchPosition ?? item.position) === tactical.matchPosition)
    if (index < 0) return []
    const appearance = remaining.splice(index, 1)[0]; const player = players.find(item => item.id === appearance.playerId); const rating = player ? ratePlayerMatch(match, player) : null
    return [{ slot: tactical.slot, position: tactical.position, matchPosition: appearance.matchPosition ?? appearance.position, playerId: appearance.playerId, teamId, avgRating: rating?.raw ?? 0, matches: 1 }]
  })
  // Unknown/malformed formations retain valid historical starters without filling from the roster.
  remaining.forEach((appearance, index) => { const player = players.find(item => item.id === appearance.playerId); const rating = player ? ratePlayerMatch(match, player) : null; const position = (appearance.matchPosition ?? appearance.position) as Position; slots.push({ slot: `${position}-${index}`, position, matchPosition: position, playerId: appearance.playerId, teamId, avgRating: rating?.raw ?? 0, matches: 1 }) })
  return { formation: match.formation ?? null, slots, match }
}
