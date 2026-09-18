import type { Best11Slot, ChampionsStage, CompetitionState, CompetitionType, CupStage, Match, Player, Team } from '../types'
import { championsCompetition, competitionMatches, competitionSeasonStatus, cupCompetition } from './competition'
import { buildGlobalRankingData, unifiedBestEleven, type GlobalLeaderboardRow } from './stats'
import { AWARD_433, awardPositionFamily, isAwardEligible } from './awardRules'

export { AWARD_433, awardPositionFamily, isAwardEligible } from './awardRules'

export type AwardWinner = { playerId: string; value: number; label: string; awardScore?: number }
export type CompetitionAwards = { complete: boolean; championId?: string; scorer?: AwardWinner; assists?: AwardWinner; mvp?: AwardWinner; goalkeeper?: AwardWinner; bestXI?: Best11Slot[] }
export type CanonicalAwardResult = {
  scopeLabel: string
  playerLabel: string
  teamLabel: string
  bestPlayerId: string
  bestXI: Best11Slot[]
  statsByPlayer: Record<string, { goals: number; assists: number; avgRating?: number }>
  anchorMatch: Match
}

/** One competition-aware source for Team/Best XI wording. */
export function competitionAwardLabel(type: CompetitionType, scope: 'season' | 'monthly' = 'season'): string {
  if (type === 'league') return scope === 'monthly' ? 'Team of the Month' : 'Team of the Season'
  return type === 'cup' ? 'Team of the Cup' : 'Team of the Tournament'
}

export function monthlyCanonicalAwardResult(award: Pick<CanonicalAwardResult, 'scopeLabel' | 'bestPlayerId' | 'bestXI' | 'statsByPlayer'>, anchorMatch: Match): CanonicalAwardResult {
  return { ...award, playerLabel: 'Player of the Month', teamLabel: competitionAwardLabel('league', 'monthly'), anchorMatch }
}

/**
 * The canonical competition-wide award read model.  Its Best XI keeps the
 * established scoped selection while player award ranking remains the existing
 * official awards selector.  Every consumer receives one shared result.
 */
export function competitionAwardResult(type: CompetitionType, season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): CanonicalAwardResult | undefined {
  const official = awardsForCompetition(type, season, teams, players, matches, states)
  const scope = competitionMatches(matches, season, type)
  const anchorMatch = scope.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0]
  if (!official.complete || !official.mvp || !anchorMatch) return undefined
  const xi = unifiedBestEleven(players, scope, season)
  const playerLabel = type === 'league' ? 'Player of the Season' : type === 'cup' ? 'Player of the Cup' : 'Player of the Tournament'
  return { scopeLabel: season, playerLabel, teamLabel: competitionAwardLabel(type), bestPlayerId: official.mvp.playerId, bestXI: xi.slots, statsByPlayer: xi.statsByPlayer, anchorMatch }
}

const rawAverage = (row: GlobalLeaderboardRow) => row.ratings.length ? row.ratings.reduce((sum, rating) => sum + rating.raw, 0) / row.ratings.length : 0
const appearances = (row: GlobalLeaderboardRow) => row.ratings.length
const ordered = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number) => rows.slice().sort((a, b) => measure(b) - measure(a) || rawAverage(b) - rawAverage(a) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
const winner = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number, label: string): AwardWinner | undefined => {
  const row = ordered(rows, measure)[0]
  return row ? { playerId: row.playerId, value: measure(row), label } : undefined
}

export function leaguePositionBonus(rank: number): number {
  return rank === 1 ? .15 : rank === 2 ? .12 : rank === 3 ? .10 : rank === 4 ? .08 : rank <= 6 ? .05 : rank <= 8 ? .02 : 0
}

export function championsProgressBonus(stage: ChampionsStage | 'champion' | 'runnerUp'): number {
  return stage === 'champion' ? .30 : stage === 'runnerUp' || stage === 'final' || stage === 'finalReplay' ? .22 : stage === 'semiFinal' ? .14 : stage === 'quarterFinal' ? .07 : 0
}

export function cupProgressBonus(stage: CupStage | 'champion' | 'runnerUp'): number {
  if (stage === 'champion') return .30
  if (stage === 'runnerUp' || stage === 'final' || stage === 'finalReplay') return .22
  const number = Number(stage.replace('stage', ''))
  return Number.isFinite(number) ? [0, 0, .03, .06, .09, .12, .15, .18][number] ?? 0 : 0
}

export function participationRatio(minutes: number, teamMatches: number): number {
  return Math.max(0, Math.min(1, teamMatches ? minutes / (teamMatches * 90) : 0))
}

export function ratingAwardScore(avgRating: number, progressBonus: number, minutes: number, teamMatches: number): number {
  return avgRating + progressBonus * participationRatio(minutes, teamMatches)
}

export function buildAwardBestXI(players: Player[], ranked: { row: GlobalLeaderboardRow; score: number }[]): Best11Slot[] {
  const byId = new Map(players.map(player => [player.id, player]))
  const used = new Set<string>()
  return AWARD_433.map(role => {
    const selected = ranked.find(candidate => !used.has(candidate.row.playerId) && awardPositionFamily(byId.get(candidate.row.playerId)?.position) === role.family)
    if (!selected) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(selected.row.playerId)
    return { slot: role.slot, position: role.position, playerId: selected.row.playerId, teamId: selected.row.historicalTeamId ?? selected.row.teamId, avgRating: rawAverage(selected.row), matches: appearances(selected.row) }
  })
}

function teamIdFor(row: GlobalLeaderboardRow) { return row.historicalTeamId ?? row.teamId }

const goalkeeperRatings = (row: GlobalLeaderboardRow) => row.ratings.filter(rating => rating.position === 'GK')
const goalkeeperMinutes = (row: GlobalLeaderboardRow) => goalkeeperRatings(row).reduce((total, rating) => total + rating.minutes, 0)
const goalkeeperAverage = (row: GlobalLeaderboardRow) => {
  const ratings = goalkeeperRatings(row)
  return ratings.length ? ratings.reduce((total, rating) => total + rating.raw, 0) / ratings.length : 0
}
const goalkeeperCleanSheets = (row: GlobalLeaderboardRow) => goalkeeperRatings(row).filter(rating => rating.minutes > 0 && rating.conceded === 0).length
const goalkeeperSavePercentage = (row: GlobalLeaderboardRow) => {
  const saves = row.qualifyingSaves ?? 0
  const faced = saves + (row.concededOnPitch ?? 0)
  return faced ? saves / faced : 0
}
const goalkeeperSavesPer90 = (row: GlobalLeaderboardRow) => {
  const minutes = goalkeeperMinutes(row)
  return minutes ? (row.qualifyingSaves ?? 0) / minutes * 90 : 0
}
const goalkeeperGoalsAgainstPer90 = (row: GlobalLeaderboardRow) => {
  const minutes = goalkeeperMinutes(row)
  return minutes ? (row.concededOnPitch ?? 0) / minutes * 90 : Number.POSITIVE_INFINITY
}

function goalkeeperWinner(rows: { row: GlobalLeaderboardRow; score: number }[], label: string): AwardWinner | undefined {
  const best = rows.filter(candidate => candidate.row.playedGoalkeeper).slice().sort((a, b) =>
    b.score - a.score ||
    goalkeeperCleanSheets(b.row) - goalkeeperCleanSheets(a.row) ||
    goalkeeperSavePercentage(b.row) - goalkeeperSavePercentage(a.row) ||
    goalkeeperSavesPer90(b.row) - goalkeeperSavesPer90(a.row) ||
    goalkeeperGoalsAgainstPer90(a.row) - goalkeeperGoalsAgainstPer90(b.row) ||
    goalkeeperMinutes(b.row) - goalkeeperMinutes(a.row) ||
    a.row.playerId.localeCompare(b.row.playerId),
  )[0]
  return best ? { playerId: best.row.playerId, value: goalkeeperAverage(best.row), awardScore: best.score, label } : undefined
}

export function awardsForCompetition(type: CompetitionType, season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): CompetitionAwards {
  const games = competitionMatches(matches, season, type)
  const stats = buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating')
  const draw = states.find(state => state.kind === 'champions-draw' && state.season === season)
  const status = competitionSeasonStatus(teams, matches, season, players, draw)
  const complete = type === 'league' ? status.league.complete : type === 'cup' ? Boolean(status.cup.championId) : Boolean(status.champions.championId)
  const championId = type === 'league' ? status.league.championId : type === 'cup' ? status.cup.championId : status.champions.championId
  if (!complete) return { complete, championId }
  const cup = type === 'cup' ? cupCompetition(teams, matches, season, players) : undefined
  const champions = type === 'champions' ? championsCompetition(draw, matches, season, players) : undefined
  const bonusFor = (teamId: string) => {
    if (type === 'league') return leaguePositionBonus(status.league.standings.find(row => row.teamId === teamId)?.rank ?? 99)
    if (type === 'cup') {
      if (cup?.championId === teamId) return cupProgressBonus('champion')
      if (cup?.runnerUpId === teamId) return cupProgressBonus('runnerUp')
      const eliminated = cup?.eliminatedAtByTeam[teamId] ?? 1
      return cupProgressBonus(`stage${Math.max(1, Math.min(7, eliminated))}` as CupStage)
    }
    if (champions?.championId === teamId) return championsProgressBonus('champion')
    const final = champions?.rounds.final[0]
    if (final?.teamIds.includes(teamId)) return championsProgressBonus('runnerUp')
    const eliminated = (['semiFinal', 'quarterFinal', 'roundOf16'] as const).find(stage => champions?.rounds[stage].some(pair => pair.teamIds.includes(teamId) && pair.winnerId !== teamId)) ?? 'roundOf16'
    return championsProgressBonus(eliminated)
  }
  const eligible = stats.flatMap(row => {
    const teamId = teamIdFor(row)
    const teamGames = games.filter(match => match.teamId ? match.teamId === teamId : match.homeTeamId === teamId || match.awayTeamId === teamId).length
    if (!isAwardEligible(appearances(row), teamGames)) return []
    const average = rawAverage(row)
    return [{ row, score: ratingAwardScore(average, bonusFor(teamId), row.minutes, teamGames) }]
  }).sort((a, b) => b.score - a.score || rawAverage(b.row) - rawAverage(a.row) || appearances(b.row) - appearances(a.row) || b.row.minutes - a.row.minutes || a.row.playerId.localeCompare(b.row.playerId))
  const best = eligible[0]
  const mvp = best ? { playerId: best.row.playerId, value: rawAverage(best.row), awardScore: best.score, label: 'Avg Rating' } : undefined
  const goalkeeperLabel = type === 'league' ? 'Goalkeeper of the Season' : type === 'cup' ? 'Goalkeeper of the Cup' : 'Goalkeeper of the Tournament'
  const goalkeeperEligible = eligible.map(candidate => ({ ...candidate, score: ratingAwardScore(goalkeeperAverage(candidate.row), bonusFor(teamIdFor(candidate.row)), goalkeeperMinutes(candidate.row), games.filter(match => match.teamId ? match.teamId === teamIdFor(candidate.row) : match.homeTeamId === teamIdFor(candidate.row) || match.awayTeamId === teamIdFor(candidate.row)).length) }))
  return { complete, championId, scorer: winner(stats, row => row.goals, 'Goals'), assists: winner(stats, row => row.assists, 'Assists'), mvp, goalkeeper: goalkeeperWinner(goalkeeperEligible, goalkeeperLabel), bestXI: buildAwardBestXI(players, eligible) }
}

export function seasonAwards(season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]) {
  const status = competitionSeasonStatus(teams, matches, season, players, states.find(state => state.kind === 'champions-draw' && state.season === season))
  const complete = status.complete
  if (!complete) return { complete }
  const stats = buildGlobalRankingData(players, matches.filter(match => match.season === season), { seasons: [season], teams: [], positions: [] }, 'rating')
  const eligible = stats.filter(row => {
    const teamId = teamIdFor(row)
    const teamMatches = matches.filter(match => match.season === season && (match.teamId ? match.teamId === teamId : match.homeTeamId === teamId || match.awayTeamId === teamId)).length
    return isAwardEligible(appearances(row), teamMatches)
  }).sort((a, b) => rawAverage(b) - rawAverage(a) || appearances(b) - appearances(a) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
  const ballon = eligible[0] ? { playerId: eligible[0].playerId, value: rawAverage(eligible[0]), label: 'Avg Rating' } : undefined
  const goldenGlove = stats.filter(row => row.playedGoalkeeper).slice().sort((a, b) =>
    goalkeeperCleanSheets(b) - goalkeeperCleanSheets(a) ||
    goalkeeperCleanSheets(b) / Math.max(1, goalkeeperRatings(b).length) - goalkeeperCleanSheets(a) / Math.max(1, goalkeeperRatings(a).length) ||
    goalkeeperSavePercentage(b) - goalkeeperSavePercentage(a) ||
    goalkeeperGoalsAgainstPer90(a) - goalkeeperGoalsAgainstPer90(b) ||
    goalkeeperSavesPer90(b) - goalkeeperSavesPer90(a) ||
    goalkeeperMinutes(b) - goalkeeperMinutes(a) ||
    a.playerId.localeCompare(b.playerId),
  )[0]
  return { complete, goldenBoot: winner(stats, row => row.goals, 'Goals'), assistLeader: winner(stats, row => row.assists, 'Assists'), ballon, goldenGlove: goldenGlove ? { playerId: goldenGlove.playerId, value: goalkeeperCleanSheets(goldenGlove), label: 'Golden Glove' } : undefined }
}
