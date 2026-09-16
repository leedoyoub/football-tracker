import type { Best11Slot, ChampionsStage, CompetitionState, CompetitionType, CupStage, Match, Player, Team } from '../types'
import { championsCompetition, competitionMatches, competitionSeasonStatus, cupCompetition } from './competition'
import { buildGlobalRankingData, type GlobalLeaderboardRow } from './stats'
import { AWARD_433, awardPositionFamily, isAwardEligible } from './awardRules'

export { AWARD_433, awardPositionFamily, isAwardEligible } from './awardRules'

export type AwardWinner = { playerId: string; value: number; label: string; awardScore?: number }
export type CompetitionAwards = { complete: boolean; championId?: string; scorer?: AwardWinner; assists?: AwardWinner; mvp?: AwardWinner; bestXI?: Best11Slot[] }

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
  return { complete, championId, scorer: winner(stats, row => row.goals, 'Goals'), assists: winner(stats, row => row.assists, 'Assists'), mvp, bestXI: buildAwardBestXI(players, eligible) }
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
  return { complete, goldenBoot: winner(stats, row => row.goals, 'Goals'), assistLeader: winner(stats, row => row.assists, 'Assists'), ballon }
}
