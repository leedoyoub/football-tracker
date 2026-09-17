import type { Best11Slot, CompetitionType, Match, Player, Position, Team } from '../types'
import { GOOD_RATING_THRESHOLD } from './constants'
import { competitionMatches, leagueCompetition, matchCompetitionType } from './competition'
import { LEAGUE_MATCHES_PER_TEAM } from './leagueFormat'
import { newestMatches } from './matchChronology'
import { getMatchManOfTheMatch, isOnPitchAtEvent, matchScore, ratePlayerMatch } from './rating'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { compareStandings, type Standing } from './standings'
import type { LeaderboardMetric } from './stats'
import { AWARD_433, awardPositionFamily, isAwardEligible, monthlyAwardScore } from './awardRules'

export type RankMovement = number | null
export type RankedStanding = Standing & { movement: RankMovement }
export type LeagueSnapshot = { matchDay: number; complete: boolean; matches: Match[]; standings: RankedStanding[] }
export type PlayerSnapshotRow = {
  playerId: string
  teamId: string
  appearances: number
  minutes: number
  goals: number
  assists: number
  mom: number
  goodMatches: number
  ratingTotal: number
  avgRating: number
}
export type PlayerRankingSnapshot = { matchDay: number; rows: Map<LeaderboardMetric, PlayerSnapshotRow[]> }
export type RacePoint = { matchDay: number; value: number }
export type RaceSeries = { playerId: string; points: RacePoint[] }
export type MonthlyBlock = { id: number; startMatchDay: number; endMatchDay: number }
export type MonthlyAwards = {
  block: MonthlyBlock
  finalized: boolean
  playerOfMonth?: PlayerSnapshotRow
  bestXI: Best11Slot[]
  statsByPlayer: Record<string, { goals: number; assists: number }>
}
export type MatchdayReview = {
  matchDay: number
  highestRated?: { playerId: string; rating: number }
  biggestWin?: { matchId: string; margin: number }
  biggestMover?: { teamId: string; movement: number }
}
export type SeasonAnalytics = {
  season: string
  leagueMatches: Match[]
  currentMatchDay: number
  latestCompletedMatchDay: number
  leagueSnapshots: Map<number, LeagueSnapshot>
  playerSnapshots: Map<number, PlayerRankingSnapshot>
  formTable: Standing[]
  monthlyAwards: Map<number, MonthlyAwards>
  latestMonthlyAwards?: MonthlyAwards
  latestReview?: MatchdayReview
}

const METRICS: LeaderboardMetric[] = ['rating', 'goals', 'assists', 'g+a', 'minutes', 'mom']
const cache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], Map<string, SeasonAnalytics>>>>()

export function monthlyBlockForMatchday(matchDay: number): number | null {
  if (!Number.isInteger(matchDay) || matchDay < 1 || matchDay > LEAGUE_MATCHES_PER_TEAM) return null
  return Math.floor((matchDay - 1) / 3) + 1
}

export function monthlyBlockRange(block: number): MonthlyBlock | null {
  if (!Number.isInteger(block) || block < 1 || block > 10) return null
  return { id: block, startMatchDay: (block - 1) * 3 + 1, endMatchDay: block * 3 }
}

function recordedTeams(match: Match, registered: Set<string>): string[] {
  if (match.teamId && registered.has(match.teamId)) return [match.teamId]
  return [match.homeTeamId, match.awayTeamId].filter(id => registered.has(id))
}

/** The sole League Matchday-completion rule. A Matchday is complete only when
 * every active League team has one canonical recorded result for that day. */
export function isLeagueMatchdayComplete(teams: Team[], matches: Match[], season: string, matchDay: number): boolean {
  if (!teams.length || matchDay < 1 || matchDay > LEAGUE_MATCHES_PER_TEAM) return false
  const registered = new Set(teams.map(team => team.id))
  const completed = new Set<string>()
  for (const match of matches) {
    if (match.season !== season || matchCompetitionType(match) !== 'league' || match.matchDay !== matchDay) continue
    for (const id of recordedTeams(match, registered)) completed.add(id)
  }
  return teams.every(team => completed.has(team.id))
}

export function positionFamily(position: Position): 'GK' | 'CB' | 'LB' | 'RB' | 'CDM' | 'CM' | 'CAM' | 'WIDE' | 'ATT' {
  if (position === 'GK') return 'GK'
  if (['CB', 'LCB', 'RCB'].includes(position)) return 'CB'
  if (['LB', 'LWB'].includes(position)) return 'LB'
  if (['RB', 'RWB'].includes(position)) return 'RB'
  if (['CDM', 'LDM', 'RDM'].includes(position)) return 'CDM'
  if (['CM', 'LCM', 'RCM'].includes(position)) return 'CM'
  if (['CAM'].includes(position)) return 'CAM'
  if (['LM', 'RM'].includes(position)) return 'WIDE'
  return 'ATT'
}

export function rankMovement(currentRank: number | undefined, previousRank: number | undefined): RankMovement {
  return currentRank === undefined || previousRank === undefined ? null : previousRank - currentRank
}

function standingsWithMovement(current: Standing[], previous?: Standing[]): RankedStanding[] {
  const prior = new Map((previous ?? []).map(row => [row.teamId, row.rank]))
  return current.map(row => ({ ...row, movement: rankMovement(row.rank, prior.get(row.teamId)) }))
}

function emptyStanding(teamId: string): Standing {
  return { rank: 0, teamId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 }
}

function formTable(teams: Team[], leagueMatches: Match[]): Standing[] {
  const rows = teams.map(team => {
    const recent = newestMatches(leagueMatches.filter(match => recordedTeams(match, new Set([team.id])).includes(team.id))).slice(0, 3)
    const row = emptyStanding(team.id)
    for (const match of recent) {
      const score = matchScore(match)
      const home = match.homeTeamId === team.id
      const scored = home ? score.home : score.away
      const conceded = home ? score.away : score.home
      row.played++; row.goalsFor += scored; row.goalsAgainst += conceded
      if (scored > conceded) { row.wins++; row.points += 3 } else if (scored === conceded) { row.draws++; row.points++ } else row.losses++
    }
    row.goalDifference = row.goalsFor - row.goalsAgainst
    return row
  }).sort(compareStandings)
  return rows.map((row, index) => ({ ...row, rank: index + 1 }))
}

function playerRowOrder(metric: LeaderboardMetric) {
  const value = (row: PlayerSnapshotRow) => metric === 'goals' ? row.goals : metric === 'assists' ? row.assists : metric === 'g+a' ? row.goals + row.assists : metric === 'minutes' ? row.minutes : metric === 'mom' ? row.mom : row.avgRating
  return (left: PlayerSnapshotRow, right: PlayerSnapshotRow) => value(right) - value(left) || right.avgRating - left.avgRating || left.playerId.localeCompare(right.playerId)
}

function clonePlayerRows(rows: Map<string, PlayerSnapshotRow>, teamMatches: Map<string, number>): Map<LeaderboardMetric, PlayerSnapshotRow[]> {
  const all = [...rows.values()].map(row => ({ ...row, avgRating: row.appearances ? row.ratingTotal / row.appearances : 0 }))
  return new Map(METRICS.map(metric => [metric, all.filter(row => metric !== 'rating' || row.appearances >= Math.ceil((teamMatches.get(row.teamId) ?? 0) * .5)).sort(playerRowOrder(metric))]))
}

function buildPlayerSnapshots(players: Player[], teams: Team[], games: Match[]): Map<number, PlayerRankingSnapshot> {
  const rows = new Map<string, PlayerSnapshotRow>()
  const teamMatches = new Map<string, number>()
  const registered = new Set(teams.map(team => team.id))
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const result = new Map<number, PlayerRankingSnapshot>()
  for (let day = 1; day <= LEAGUE_MATCHES_PER_TEAM; day++) {
    for (const match of games.filter(item => item.matchDay === day)) {
      for (const teamId of recordedTeams(match, registered)) teamMatches.set(teamId, (teamMatches.get(teamId) ?? 0) + 1)
      const mom = getMatchManOfTheMatch(match, players)
      for (const appearance of match.appearances) {
        const player = byPlayer.get(appearance.playerId)
        if (!player) continue
        const rating = ratePlayerMatch(match, player)
        if (!rating) continue
        const row = rows.get(player.id) ?? { playerId: player.id, teamId: appearance.teamId, appearances: 0, minutes: 0, goals: 0, assists: 0, mom: 0, goodMatches: 0, ratingTotal: 0, avgRating: 0 }
        row.teamId = appearance.teamId; row.appearances++; row.minutes += rating.minutes; row.ratingTotal += rating.raw; row.avgRating = row.ratingTotal / row.appearances
        row.goals += match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.playerId === player.id && isOnPitchAtEvent(match, appearance, event)).length
        row.assists += match.events.filter(event => event.type === 'goal' && !event.ownGoal && event.assistPlayerId === player.id && isOnPitchAtEvent(match, appearance, event)).length
        row.mom += Number(mom === player.id); row.goodMatches += Number(rating.raw >= GOOD_RATING_THRESHOLD)
        rows.set(player.id, row)
      }
    }
    if (games.some(match => match.matchDay === day)) result.set(day, { matchDay: day, rows: clonePlayerRows(rows, teamMatches) })
  }
  return result
}

function monthlyAwardsFor(block: MonthlyBlock, teams: Team[], players: Player[], games: Match[], finalized: boolean): MonthlyAwards {
  const selected = games.filter(match => match.matchDay >= block.startMatchDay && match.matchDay <= block.endMatchDay)
  const snapshot = buildPlayerSnapshots(players, teams, selected)
  const snapshots = [...snapshot.values()]
  const last = snapshots[snapshots.length - 1]
  const teamCounts = new Map<string, number>()
  const registered = new Set(teams.map(team => team.id))
  for (const match of selected) for (const teamId of recordedTeams(match, registered)) teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1)
  const rows = [...(last?.rows.get('rating') ?? [])].filter(row => isAwardEligible(row.appearances, teamCounts.get(row.teamId) ?? 0))
  const ordered = rows.slice().sort((a, b) => monthlyAwardScore(b.avgRating) - monthlyAwardScore(a.avgRating) || b.mom - a.mom || (b.goals + b.assists) - (a.goals + a.assists) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
  const byPlayer = new Map(players.map(player => [player.id, player]))
  const used = new Set<string>()
  const slots = AWARD_433.map(role => {
    const pool = ordered.filter(row => awardPositionFamily(byPlayer.get(row.playerId)?.position) === role.family)
    const candidate = pool.find(row => !used.has(row.playerId))
    if (!candidate) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(candidate.playerId)
    return { slot: role.slot, position: role.position, playerId: candidate.playerId, teamId: candidate.teamId, avgRating: candidate.avgRating, matches: candidate.appearances }
  })
  return { block, finalized, playerOfMonth: ordered[0], bestXI: slots, statsByPlayer: Object.fromEntries(ordered.map(row => [row.playerId, { goals: row.goals, assists: row.assists }])) }
}

/** Lazily derives one finalized monthly award block without materializing the full season. */
export function monthlyAwardForBlock(teams: Team[], players: Player[], matches: Match[], season: string, blockId: number): MonthlyAwards | undefined {
  const block = monthlyBlockRange(blockId)
  if (!block) return undefined
  const leagueMatches = competitionMatches(matches, season, 'league')
  if (!isLeagueMatchdayComplete(teams, leagueMatches, season, block.endMatchDay)) return undefined
  return monthlyAwardsFor(block, teams, players, leagueMatches, true)
}

function buildReview(day: number, snapshots: Map<number, LeagueSnapshot>, playerSnapshots: Map<number, PlayerRankingSnapshot>): MatchdayReview {
  const snapshot = snapshots.get(day)
  const ratings = playerSnapshots.get(day)?.rows.get('rating') ?? []
  const previousRatings = playerSnapshots.get(day - 1)?.rows.get('rating') ?? []
  const previousValues = new Map(previousRatings.map(row => [row.playerId, row.ratingTotal]))
  const daily = ratings.map(row => ({ playerId: row.playerId, rating: row.ratingTotal - (previousValues.get(row.playerId) ?? 0) })).sort((a, b) => b.rating - a.rating || a.playerId.localeCompare(b.playerId))[0]
  const biggestWin = snapshot?.matches.map(match => { const score = matchScore(match); return { matchId: match.id, margin: Math.abs(score.home - score.away) } }).sort((a, b) => b.margin - a.margin || a.matchId.localeCompare(b.matchId))[0]
  const biggestMover = snapshot?.standings.filter(row => (row.movement ?? 0) > 0).sort((a, b) => (b.movement ?? 0) - (a.movement ?? 0) || a.teamId.localeCompare(b.teamId))[0]
  return { matchDay: day, highestRated: daily, biggestWin, biggestMover: biggestMover ? { teamId: biggestMover.teamId, movement: biggestMover.movement! } : undefined }
}

export function buildSeasonAnalytics(teams: Team[], players: Player[], matches: Match[], season: string): SeasonAnalytics {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let bySeason = byTeams.get(teams); if (!bySeason) { bySeason = new Map(); byTeams.set(teams, bySeason) }
  const key = `${RATING_ENGINE_REVISION}:${season}`
  const existing = bySeason.get(key); if (existing) return existing
  const leagueMatches = competitionMatches(matches, season, 'league')
  const currentMatchDay = Math.max(0, ...leagueMatches.map(match => match.matchDay))
  const leagueSnapshots = new Map<number, LeagueSnapshot>()
  let previous: Standing[] | undefined
  for (let day = 1; day <= currentMatchDay; day++) {
    const through = leagueMatches.filter(match => match.matchDay <= day)
    const standings = leagueCompetition(teams, through, season, players).standings
    const ranked = standingsWithMovement(standings, previous)
    leagueSnapshots.set(day, { matchDay: day, complete: isLeagueMatchdayComplete(teams, leagueMatches, season, day), matches: leagueMatches.filter(match => match.matchDay === day), standings: ranked })
    previous = standings
  }
  const completedSnapshots = [...leagueSnapshots.values()].filter(snapshot => snapshot.complete)
  const latestCompletedMatchDay = completedSnapshots[completedSnapshots.length - 1]?.matchDay ?? 0
  const playerSnapshots = buildPlayerSnapshots(players, teams, leagueMatches)
  const monthlyAwards = new Map<number, MonthlyAwards>()
  for (let blockId = 1; blockId <= 10; blockId++) {
    const block = monthlyBlockRange(blockId)!
    const finalized = isLeagueMatchdayComplete(teams, leagueMatches, season, block.endMatchDay)
    if (finalized) monthlyAwards.set(blockId, monthlyAwardsFor(block, teams, players, leagueMatches, true))
  }
  const monthlyResults = [...monthlyAwards.values()]
  const latestMonthlyAwards = monthlyResults[monthlyResults.length - 1]
  const result: SeasonAnalytics = {
    season, leagueMatches, currentMatchDay, latestCompletedMatchDay, leagueSnapshots, playerSnapshots,
    formTable: formTable(teams, leagueMatches), monthlyAwards, latestMonthlyAwards,
    latestReview: latestCompletedMatchDay ? buildReview(latestCompletedMatchDay, leagueSnapshots, playerSnapshots) : undefined,
  }
  bySeason.set(key, result)
  return result
}

export function rankingMovement(snapshot: PlayerRankingSnapshot | undefined, previous: PlayerRankingSnapshot | undefined, metric: LeaderboardMetric): Map<string, RankMovement> {
  const current = snapshot?.rows.get(metric) ?? []
  const prior = new Map((previous?.rows.get(metric) ?? []).map((row, index) => [row.playerId, index + 1]))
  return new Map(current.map((row, index) => [row.playerId, rankMovement(index + 1, prior.get(row.playerId))]))
}

export function raceHistory(analytics: SeasonAnalytics, metric: 'goals' | 'assists' | 'mom' | 'rating', playerIds?: string[]): RaceSeries[] {
  const snapshots = [...analytics.playerSnapshots.values()]
  const latest = snapshots[snapshots.length - 1]?.rows.get(metric) ?? []
  const selected = playerIds?.length ? playerIds.slice(0, 4) : latest.slice(0, 3).map(row => row.playerId)
  return selected.map(playerId => ({ playerId, points: snapshots.flatMap(snapshot => {
    const row = snapshot.rows.get(metric)?.find(item => item.playerId === playerId)
    if (!row) return []
    const value = metric === 'rating' ? row.avgRating : row[metric]
    return [{ matchDay: snapshot.matchDay, value }]
  }) }))
}

export function scopedPlayerRanks(rows: PlayerSnapshotRow[], players: Player[], playerId: string) {
  const player = players.find(item => item.id === playerId)
  const overall = rows.findIndex(row => row.playerId === playerId)
  const familyRows = player ? rows.filter(row => positionFamily(players.find(item => item.id === row.playerId)?.position ?? 'ST') === positionFamily(player.position)) : []
  const teamRows = rows.filter(row => row.teamId === rows.find(item => item.playerId === playerId)?.teamId)
  const position = familyRows.findIndex(row => row.playerId === playerId)
  const team = teamRows.findIndex(row => row.playerId === playerId)
  return { overall: overall < 0 ? null : overall + 1, position: position < 0 ? null : position + 1, team: team < 0 ? null : team + 1 }
}

/** Rank within the supplied, already-scoped leaderboard population. */
export function scopedMetricRanks(rows: { playerId: string; teamId: string; historicalTeamId?: string }[], players: Player[], playerId: string) {
  const target = rows.find(row => row.playerId === playerId)
  const player = players.find(item => item.id === playerId)
  const teamId = target?.historicalTeamId ?? target?.teamId ?? player?.teamId
  const overall = rows.findIndex(row => row.playerId === playerId)
  const familyRows = player ? rows.filter(row => positionFamily(players.find(item => item.id === row.playerId)?.position ?? 'ST') === positionFamily(player.position)) : []
  const teamRows = rows.filter(row => (row.historicalTeamId ?? row.teamId) === teamId)
  const position = familyRows.findIndex(row => row.playerId === playerId)
  const team = teamRows.findIndex(row => row.playerId === playerId)
  return { overall: overall < 0 ? null : overall + 1, position: position < 0 ? null : position + 1, team: team < 0 ? null : team + 1 }
}

export function competitionScope(matches: Match[], season: string, type: CompetitionType | 'all'): Match[] {
  return matches.filter(match => match.season === season && (type === 'all' || matchCompetitionType(match) === type))
}
