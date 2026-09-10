import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { competitionMatches, competitionSeasonStatus, cupCompetition } from './competition'
import { buildGlobalRankingData, type GlobalLeaderboardRow } from './stats'

export type AwardWinner = { playerId: string; value: number; label: string }
export type CompetitionAwards = { complete: boolean; championId?: string; scorer?: AwardWinner; assists?: AwardWinner; mvp?: AwardWinner }

const rawAverage = (row: GlobalLeaderboardRow) => row.ratings.length ? row.ratings.reduce((sum, rating) => sum + rating.raw, 0) / row.ratings.length : 0
const played = (row: GlobalLeaderboardRow) => row.ratings.filter(rating => rating.minutes > 0).length
const ordered = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number) => rows.slice().sort((a, b) => measure(b) - measure(a) || rawAverage(b) - rawAverage(a) || a.minutes - b.minutes || a.playerId.localeCompare(b.playerId))
const winner = (rows: GlobalLeaderboardRow[], measure: (row: GlobalLeaderboardRow) => number, label: string): AwardWinner | undefined => {
  const row = ordered(rows, measure)[0]
  return row ? { playerId: row.playerId, value: measure(row), label } : undefined
}

export function awardsForCompetition(type: CompetitionType, season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]): CompetitionAwards {
  const games = competitionMatches(matches, season, type)
  const stats = buildGlobalRankingData(players, games, { seasons: [season], teams: [], positions: [] }, 'rating')
  const draw = states.find(state => state.kind === 'champions-draw' && state.season === season)
  const status = competitionSeasonStatus(teams, matches, season, players, draw)
  const complete = type === 'league' ? status.league.complete : type === 'cup' ? Boolean(status.cup.championId) : Boolean(status.champions.championId)
  const championId = type === 'league' ? status.league.championId : type === 'cup' ? status.cup.championId : status.champions.championId
  if (!complete) return { complete, championId }
  let allowedTeams: string[] = []
  if (type === 'league') allowedTeams = status.league.standings.slice(0, 3).map(row => row.teamId)
  if (type === 'cup') {
    const cup = cupCompetition(teams, matches, season, players)
    allowedTeams = teams.filter(team => !cup.eliminatedAtByTeam[team.id] || cup.eliminatedAtByTeam[team.id] >= 7).map(team => team.id)
  }
  if (type === 'champions') allowedTeams = status.champions.rounds.semiFinal.flatMap(pair => pair.teamIds)
  const mvpRows = stats.filter(row => {
    const teamId = row.historicalTeamId ?? row.teamId
    const teamMatches = games.filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId).length
    return allowedTeams.includes(teamId) && played(row) >= Math.ceil(teamMatches * .5)
  }).sort((a, b) => rawAverage(b) - rawAverage(a) || played(b) - played(a) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
  const mvp = mvpRows[0] ? { playerId: mvpRows[0].playerId, value: rawAverage(mvpRows[0]), label: 'Avg Rating' } : undefined
  return { complete, championId, scorer: winner(stats, row => row.goals, 'Goals'), assists: winner(stats, row => row.assists, 'Assists'), mvp }
}

export function seasonAwards(season: string, teams: Team[], players: Player[], matches: Match[], states: CompetitionState[]) {
  const status = competitionSeasonStatus(teams, matches, season, players, states.find(state => state.kind === 'champions-draw' && state.season === season))
  const complete = status.complete
  if (!complete) return { complete }
  const stats = buildGlobalRankingData(players, matches.filter(match => match.season === season), { seasons: [season], teams: [], positions: [] }, 'rating')
  const eligible = stats.filter(row => {
    const byTeam = new Map<string, number>()
    row.ratings.filter(rating => rating.minutes > 0).forEach(rating => {
      const match = matches.find(item => item.id === rating.matchId); const appearance = match?.appearances.find(item => item.playerId === row.playerId)
      if (appearance) byTeam.set(appearance.teamId, (byTeam.get(appearance.teamId) ?? 0) + 1)
    })
    return [...byTeam.entries()].some(([teamId, appearances]) => appearances >= Math.ceil(matches.filter(match => match.season === season && (match.homeTeamId === teamId || match.awayTeamId === teamId)).length * .5))
  }).sort((a, b) => rawAverage(b) - rawAverage(a) || played(b) - played(a) || b.minutes - a.minutes || a.playerId.localeCompare(b.playerId))
  const ballon = eligible[0] ? { playerId: eligible[0].playerId, value: rawAverage(eligible[0]), label: 'Avg Rating' } : undefined
  return { complete, goldenBoot: winner(stats, row => row.goals, 'Goals'), assistLeader: winner(stats, row => row.assists, 'Assists'), ballon }
}
