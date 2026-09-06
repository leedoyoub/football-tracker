import type {
  Best11Slot,
  Match,
  Player,
  PlayerSeasonStats,
  Position,
  RankSort,
  RatingBreakdown,
} from '../types'
import { ratePlayerMatch } from './rating'

export function seasonsFromMatches(matches: Match[]): string[] {
  return [...new Set(matches.map((m) => m.season))].sort((a, b) => {
    const aNumber = Number(a.match(/\d+/)?.[0] ?? 0)
    const bNumber = Number(b.match(/\d+/)?.[0] ?? 0)
    return bNumber - aNumber || b.localeCompare(a)
  })
}

export function playerSeasonStats(
  player: Player,
  matches: Match[],
  season: string,
  teamId?: string,
): PlayerSeasonStats {
  const seasonMatches = matches.filter((m) =>
    m.season === season && (!teamId || m.appearances.some((appearance) =>
      appearance.playerId === player.id && appearance.teamId === teamId,
    )),
  )
  const ratings: RatingBreakdown[] = []
  for (const match of seasonMatches) {
    const row = ratePlayerMatch(match, player)
    if (row) ratings.push(row)
  }
  const goals = seasonMatches.reduce((sum, match) => {
    return (
      sum +
      match.events.filter(
        (e) => e.type === 'goal' && !e.ownGoal && e.playerId === player.id,
      ).length
    )
  }, 0)
  const assists = seasonMatches.reduce((sum, match) => {
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
  const mom = seasonMatches.filter((match) => match.manOfMatchPlayerId === player.id).length
  return {
    playerId: player.id,
    teamId: teamId ?? player.teamId,
    season,
    matches: ratings.length,
    minutes,
    goals,
    assists,
    avgRating,
    mom,
    ratings,
  }
}

export function globalRankings(
  players: Player[],
  matches: Match[],
  season: string,
  sort: RankSort = 'rating',
): PlayerSeasonStats[] {
  const seasonMatches = matches.filter((m) => m.season === season)
  const rows = players
    .map((player) => playerSeasonStats(player, matches, season))
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
  { slot: 'LB', position: 'LB', group: ['LB'], fallback: ['CB', 'RB'] },
  { slot: 'LCB', position: 'CB', group: ['CB'], fallback: ['LB', 'RB'] },
  { slot: 'RCB', position: 'CB', group: ['CB'], fallback: ['LB', 'RB'] },
  { slot: 'RB', position: 'RB', group: ['RB'], fallback: ['CB', 'LB'] },
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
    const stats = playerSeasonStats(player, matches, season)
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

const TEAM_BEST_XI: { slot: string; position: Position; pool: Position[] }[] = [
  { slot: 'GK', position: 'GK', pool: ['GK'] },
  { slot: 'LB', position: 'LB', pool: ['LB', 'LM', 'CB'] },
  { slot: 'LCB', position: 'CB', pool: ['CB', 'LB', 'RB'] },
  { slot: 'RCB', position: 'CB', pool: ['CB', 'LB', 'RB'] },
  { slot: 'RB', position: 'RB', pool: ['RB', 'RM', 'CB'] },
  { slot: 'LCM', position: 'CM', pool: ['CM', 'CDM', 'CAM', 'LM'] },
  { slot: 'CM', position: 'CM', pool: ['CM', 'CDM', 'CAM', 'LM', 'RM'] },
  { slot: 'RCM', position: 'CAM', pool: ['CAM', 'CM', 'CDM', 'LM', 'RM'] },
  { slot: 'LW', position: 'LW', pool: ['LW', 'LM', 'CAM', 'ST'] },
  { slot: 'ST', position: 'ST', pool: ['ST', 'LW', 'RW', 'CAM'] },
  { slot: 'RW', position: 'RW', pool: ['RW', 'RM', 'CAM', 'ST'] },
]

export function teamBestEleven(
  players: Player[],
  matches: Match[],
  teamId: string,
  season: string,
): { formation: string | null; slots: Best11Slot[]; match: Match | undefined } {
  const match = latestTeamMatch(matches, teamId, season)
  const candidates = players
    .map((player) => ({ player, stats: playerSeasonStats(player, matches, season, teamId) }))
    .filter((row) => row.stats.matches > 0)
    .sort((a, b) => b.stats.avgRating - a.stats.avgRating || b.stats.minutes - a.stats.minutes)
  const used = new Set<string>()
  const slots = TEAM_BEST_XI.map((role) => {
    const pick = candidates.find((row) => !used.has(row.player.id) && role.pool.includes(row.player.position))
    if (!pick) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(pick.player.id)
    return { slot: role.slot, position: role.position, playerId: pick.player.id, teamId, avgRating: pick.stats.avgRating, matches: pick.stats.matches }
  })
  return { formation: formationForMatch(match), slots, match }
}
