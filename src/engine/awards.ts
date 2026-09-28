import type { Best11Slot, ChampionsStage, CompetitionState, CompetitionType, CupStage, Match, Player, Team } from '../types'
import { competitionMatches, competitionSeasonStatus, type CompetitionSeasonStatus } from './competition'
import { buildGlobalRankingData, type GlobalLeaderboardRow } from './stats'
import { AWARD_433, isAwardEligible, rankAwardCandidates, seasonChampionsProgressBonus, seasonCupProgressBonus, seasonLeaguePositionBonus, selectAwardBestXI, type AwardCandidate } from './awardRules'
import { scopedAwardFamilyByPlayer } from './positionScope'

export { AWARD_433, awardPositionFamily, isAwardEligible } from './awardRules'

export type AwardWinner = { playerId: string; value: number; label: string; awardScore?: number }
export type CompetitionAwards = { complete: boolean; championId?: string; scorer?: AwardWinner; assists?: AwardWinner; mvp?: AwardWinner; goalkeeper?: AwardWinner; bestXI?: Best11Slot[]; candidates?: AwardCandidate[] }
export type CompetitionAwardModels = Partial<Pick<CompetitionSeasonStatus, 'league' | 'cup' | 'champions'>>
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
 * One competition-wide selection source for Best Player and Best XI. A live
 * result is display-only; official News remains gated by canonical champions.
 */
export function competitionAwardResult(type: CompetitionType, season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], models?: CompetitionAwardModels): CanonicalAwardResult | undefined {
  const official = awardsForCompetition(type, season, teams, players, matches, states, models)
  const scope = competitionMatches(matches, season, type)
  const anchorMatch = scope.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0]
  if (!official.mvp || !official.bestXI || !anchorMatch) return undefined
  const playerLabel = type === 'league' ? 'Player of the Season' : type === 'cup' ? 'Player of the Cup' : 'Player of the Tournament'
  const selected = official.bestXI.flatMap(slot => slot.playerId ? [official.candidates?.find(candidate => candidate.playerId === slot.playerId && candidate.teamId === slot.teamId)] : [])
  const statsByPlayer = Object.fromEntries(selected.flatMap(candidate => candidate ? [[candidate.playerId, { goals: candidate.goals, assists: candidate.assists, avgRating: candidate.average }]] : []))
  return { scopeLabel: season, playerLabel, teamLabel: competitionAwardLabel(type), bestPlayerId: official.mvp.playerId, bestXI: official.bestXI, statsByPlayer, anchorMatch }
}

const rawAverage = (row: GlobalLeaderboardRow) => row.ratings.length ? row.ratings.reduce((sum, rating) => sum + rating.raw, 0) / row.ratings.length : 0
const appearances = (row: GlobalLeaderboardRow) => row.ratings.length
const ordered = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number) => rows.slice().sort((a, b) => measure(b) - measure(a) || rawAverage(b) - rawAverage(a) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
const winner = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number, label: string): AwardWinner | undefined => {
  const row = ordered(rows, measure)[0]
  return row ? { playerId: row.playerId, value: measure(row), label } : undefined
}

export function leaguePositionBonus(rank: number): number {
  return rank === 1 ? .20 : rank === 2 ? .08 : rank === 3 ? .035 : rank === 4 ? .025 : rank <= 8 ? .015 : 0
}

export function championsProgressBonus(stage: ChampionsStage | 'champion' | 'runnerUp'): number {
  return stage === 'champion' ? .20 : stage === 'runnerUp' ? .08 : stage === 'semiFinal' ? .035 : stage === 'quarterFinal' ? .020 : 0
}

export function cupProgressBonus(stage: CupStage | 'champion' | 'runnerUp'): number {
  if (stage === 'champion') return .20
  if (stage === 'runnerUp') return .08
  const number = Number(stage.replace('stage', ''))
  return Number.isFinite(number) ? [0, 0, 0, 0, .015, .025, .030, .035][number] ?? 0 : 0
}

export function participationRatio(minutes: number, teamMatches: number): number {
  return Math.max(0, Math.min(1, teamMatches ? minutes / (teamMatches * 90) : 0))
}

export function ratingAwardScore(avgRating: number, progressBonus: number, _minutes: number, _teamMatches: number): number {
  return avgRating + progressBonus
}

export function buildAwardBestXI(players: Player[], ranked: { row: GlobalLeaderboardRow; score: number }[], matches: Match[]): Best11Slot[] {
  const historicalFamilies = scopedAwardFamilyByPlayer(players, matches, {})
  const used = new Set<string>()
  return AWARD_433.map(role => {
    const selected = ranked.find(candidate => !used.has(candidate.row.playerId) && historicalFamilies.get(candidate.row.playerId) === role.family)
    if (!selected) return { slot: role.slot, position: role.position, playerId: null, avgRating: 0, matches: 0 }
    used.add(selected.row.playerId)
    return { slot: role.slot, position: role.position, playerId: selected.row.playerId, teamId: selected.row.historicalTeamId ?? selected.row.teamId, avgRating: rawAverage(selected.row), matches: appearances(selected.row) }
  })
}

function teamIdFor(row: GlobalLeaderboardRow) { return row.historicalTeamId ?? row.teamId }
function matchPlayedByTeam(match: Match, teamId: string) { return match.teamId === teamId || match.homeTeamId === teamId || match.awayTeamId === teamId }

type ScoredAwardCandidate = { row: GlobalLeaderboardRow; candidate: AwardCandidate }

function scoredCandidatesForScope(players: Player[], games: Match[], bonusFor: (teamId: string) => number, mode: 'cumulative' | 'monthly' = 'cumulative'): ScoredAwardCandidate[] {
  const teamIds = [...new Set(games.flatMap(match => match.appearances.map(appearance => appearance.teamId)))]
  const candidates = teamIds.flatMap(teamId => {
    const teamMatches = games.filter(match => matchPlayedByTeam(match, teamId)).length
    const families = scopedAwardFamilyByPlayer(players, games, { teams: [teamId] })
    return buildGlobalRankingData(players, games, { seasons: [], teams: [teamId], positions: [] }, 'rating').flatMap(row => {
      const family = families.get(row.playerId)
      if (!isAwardEligible(appearances(row), teamMatches)) return []
      const average = rawAverage(row)
      return [{ row, candidate: { playerId: row.playerId, teamId, family, average, appearances: appearances(row), mom: row.mom, minutes: row.minutes, latestRating: row.ratings[row.ratings.length - 1]?.raw ?? 0, goals: row.goals, assists: row.assists, selectionScore: ratingAwardScore(average, bonusFor(teamId), row.minutes, teamMatches) } }]
    })
  })
  const order = rankAwardCandidates(candidates.map(item => item.candidate), mode)
  return order.map(candidate => candidates.find(item => item.candidate === candidate)!)
}

/** Shared derived selection input for zero-bonus cumulative award scopes. */
export function awardCandidatesForScope(players: Player[], games: Match[], mode: 'cumulative' | 'monthly' = 'cumulative'): AwardCandidate[] {
  return scoredCandidatesForScope(players, games, () => 0, mode).map(item => item.candidate)
}

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

export function awardsForCompetition(type: CompetitionType, season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], models?: CompetitionAwardModels): CompetitionAwards {
  const games = competitionMatches(matches, season, type)
  const stats = buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating')
  const draw = states.find(state => state.kind === 'champions-draw' && state.season === season)
  const hasCurrentModel = type === 'league' ? Boolean(models?.league) : type === 'cup' ? Boolean(models?.cup) : Boolean(models?.champions)
  const fallbackStatus = hasCurrentModel ? undefined : competitionSeasonStatus(teams, matches, season, players, draw)
  const league = models?.league ?? fallbackStatus?.league
  const cup = models?.cup ?? fallbackStatus?.cup
  const champions = models?.champions ?? fallbackStatus?.champions
  const complete = type === 'league' ? Boolean(league?.complete) : type === 'cup' ? Boolean(cup?.championId) : Boolean(champions?.championId)
  const championId = type === 'league' ? league?.championId : type === 'cup' ? cup?.championId : champions?.championId
  const bonusFor = (teamId: string) => {
    if (type === 'league') return leaguePositionBonus(league?.standings.find(row => row.teamId === teamId)?.rank ?? 99)
    if (type === 'cup') {
      if (cup?.championId === teamId) return cupProgressBonus('champion')
      if (cup?.runnerUpId === teamId) return cupProgressBonus('runnerUp')
      const eliminated = cup?.eliminatedAtByTeam[teamId]
      if (eliminated) return cupProgressBonus(`stage${Math.max(1, Math.min(7, eliminated))}` as CupStage)
      if (!cup?.activeTeamIds.includes(teamId)) return 0
      const stage = cup.stage
      return stage === 'final' || stage === 'finalReplay' ? cupProgressBonus('stage7') : stage ? cupProgressBonus(stage) : 0
    }
    if (champions?.championId === teamId) return championsProgressBonus('champion')
    const final = champions?.rounds.final[0]
    if (champions?.runnerUpId === teamId) return championsProgressBonus('runnerUp')
    const eliminated = (['semiFinal', 'quarterFinal', 'roundOf16'] as const).find(stage => champions?.rounds[stage].some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
    if (eliminated) return championsProgressBonus(eliminated)
    if (!final?.teamIds.includes(teamId) && !champions?.rounds.roundOf16.some(pair => pair.teamIds.includes(teamId))) return 0
    const stage = champions?.currentStage
    return championsProgressBonus(stage === 'final' || stage === 'finalReplay' ? 'semiFinal' : stage ?? 'roundOf16')
  }
  const scored = scoredCandidatesForScope(players, games, bonusFor)
  const eligible = scored.map(item => ({ row: item.row, score: item.candidate.selectionScore }))
  const best = eligible[0]
  const mvp = best ? { playerId: best.row.playerId, value: rawAverage(best.row), awardScore: best.score, label: 'Avg Rating' } : undefined
  const goalkeeperLabel = type === 'league' ? 'Goalkeeper of the Season' : type === 'cup' ? 'Goalkeeper of the Cup' : 'Goalkeeper of the Tournament'
  const goalkeeperEligible = eligible.map(candidate => ({ ...candidate, score: ratingAwardScore(goalkeeperAverage(candidate.row), bonusFor(teamIdFor(candidate.row)), goalkeeperMinutes(candidate.row), games.filter(match => match.teamId ? match.teamId === teamIdFor(candidate.row) : match.homeTeamId === teamIdFor(candidate.row) || match.awayTeamId === teamIdFor(candidate.row)).length) }))
  return { complete, championId, scorer: winner(stats, row => row.goals, 'Goals'), assists: winner(stats, row => row.assists, 'Assists'), mvp, goalkeeper: goalkeeperWinner(goalkeeperEligible, goalkeeperLabel), bestXI: selectAwardBestXI(scored.map(item => item.candidate)), candidates: scored.map(item => item.candidate) }
}

export function seasonAwards(season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]) {
  const status = competitionSeasonStatus(teams, matches, season, players, states.find(state => state.kind === 'champions-draw' && state.season === season))
  const complete = status.complete
  const games = matches.filter(match => match.season === season)
  const stats = buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating')
  const championsRounds = status.champions.rounds ?? { roundOf16: [], quarterFinal: [], semiFinal: [], final: [] }
  const bonusFor = (teamId: string) => {
    const league = seasonLeaguePositionBonus(status.league.standings.find(row => row.teamId === teamId)?.rank ?? 99)
    const cup = status.cup.championId === teamId ? seasonCupProgressBonus('champion')
      : status.cup.runnerUpId === teamId ? seasonCupProgressBonus('runnerUp')
        : status.cup.eliminatedAtByTeam[teamId] ? seasonCupProgressBonus(`stage${Math.max(1, Math.min(7, status.cup.eliminatedAtByTeam[teamId]))}` as CupStage)
          : !status.cup.activeTeamIds.includes(teamId) ? 0
            : status.cup.stage === 'final' || status.cup.stage === 'finalReplay' ? seasonCupProgressBonus('stage7')
              : seasonCupProgressBonus(status.cup.stage)
    const eliminated = (['semiFinal', 'quarterFinal', 'roundOf16'] as const).find(stage => championsRounds[stage].some(pair => pair.teamIds.includes(teamId) && pair.winnerId && pair.winnerId !== teamId))
    const champions = status.champions.championId === teamId ? seasonChampionsProgressBonus('champion')
      : status.champions.runnerUpId === teamId ? seasonChampionsProgressBonus('runnerUp')
        : eliminated ? seasonChampionsProgressBonus(eliminated)
          : championsRounds.roundOf16.some(pair => pair.teamIds.includes(teamId)) ? seasonChampionsProgressBonus(status.champions.currentStage === 'final' || status.champions.currentStage === 'finalReplay' ? 'semiFinal' : status.champions.currentStage ?? 'roundOf16')
            : 0
    return league + cup + champions
  }
  const scored = scoredCandidatesForScope(players, games, bonusFor)
  const best = scored[0]?.candidate
  const ballon = best ? { playerId: best.playerId, value: best.average, awardScore: best.selectionScore, label: 'Avg Rating' } : undefined
  const goldenGlove = stats.filter(row => row.playedGoalkeeper).slice().sort((a, b) =>
    goalkeeperCleanSheets(b) - goalkeeperCleanSheets(a) ||
    goalkeeperCleanSheets(b) / Math.max(1, goalkeeperRatings(b).length) - goalkeeperCleanSheets(a) / Math.max(1, goalkeeperRatings(a).length) ||
    goalkeeperSavePercentage(b) - goalkeeperSavePercentage(a) ||
    goalkeeperGoalsAgainstPer90(a) - goalkeeperGoalsAgainstPer90(b) ||
    goalkeeperSavesPer90(b) - goalkeeperSavesPer90(a) ||
    goalkeeperMinutes(b) - goalkeeperMinutes(a) ||
    a.playerId.localeCompare(b.playerId),
  )[0]
  return { complete, goldenBoot: winner(stats, row => row.goals, 'Goals'), assistLeader: winner(stats, row => row.assists, 'Assists'), ballon, bestXI: selectAwardBestXI(scored.map(item => item.candidate)), candidates: scored.map(item => item.candidate), goldenGlove: goldenGlove ? { playerId: goldenGlove.playerId, value: goalkeeperCleanSheets(goldenGlove), label: 'Golden Glove' } : undefined }
}
