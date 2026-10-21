import { officialAwardsForSeason, officialSeasonModel } from './officialAwards'
import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { sharedStatAwardWinners, type seasonAwards, type awardsForCompetition } from './awards'
import { buildGlobalRankingData, rankGlobalRankingRows } from './stats'
import { monthlyAwardForBlock, type MonthlyAwards } from './seasonAnalytics'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { AWARD_POLICY_REVISION } from './awardPolicy'

export type HistoryTimeline = {
  season: string
  league?: string
  cup?: string
  champions?: string
  scorer?: { playerId: string; goals: number }
  assists?: { playerId: string; assists: number }
  scorers: { playerId: string; goals: number }[]
  assistLeaders: { playerId: string; assists: number }[]
  rating?: { playerId: string; avgRating: number }
  mom?: { playerId: string; mom: number }
  bestXI: string[]
}

export type HistoryAwards = {
  season: string
  competition: CompetitionType
  player?: ReturnType<typeof awardsForCompetition>['mvp']
  goalkeeper?: ReturnType<typeof awardsForCompetition>['goalkeeper']
  goalkeepers: ReturnType<typeof awardsForCompetition>['goalkeepers']
  goldenGlove?: ReturnType<typeof seasonAwards>['goldenGlove']
}

type TimelineCache = WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, HistoryTimeline>>>>>
type AwardsCache = WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, HistoryAwards[]>>>>>
type MonthlyCache = WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], Map<string, MonthlyAwards | undefined>>>>
let timelineCache: TimelineCache = new WeakMap()
let awardsCache: AwardsCache = new WeakMap()
let monthlyCache: MonthlyCache = new WeakMap()
const diagnostics = { timelineBuilds: 0, awardBuilds: 0, monthlyBuilds: 0 }

function seasons(matches: Match[], states: CompetitionState[]) {
  return [...new Set([...matches.map(match => match.season), ...states.map(state => state.season)])]
    .sort((left, right) => Number(left.match(/\d+/)?.[0] ?? 0) - Number(right.match(/\d+/)?.[0] ?? 0))
}

function stateMap<T>(cache: WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, T>>>>>, matches: Match[], players: Player[], teams: Team[], states: CompetitionState[]) {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams); if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  let values = byStates.get(states); if (!values) { values = new Map(); byStates.set(states, values) }
  return values
}

function monthlyMap(matches: Match[], players: Player[], teams: Team[]) {
  let byPlayers = monthlyCache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); monthlyCache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let values = byTeams.get(teams); if (!values) { values = new Map(); byTeams.set(teams, values) }
  return values
}

export function historySeasons(matches: Match[], states: CompetitionState[]) { return seasons(matches, states) }

export function historyTimelineForSeason(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], season: string): HistoryTimeline {
  const cached = stateMap(timelineCache, matches, players, teams, states)
  const key = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${season}`
  const current = cached.get(key); if (current) return current
  diagnostics.timelineBuilds++
  const model = officialSeasonModel(teams, players, matches, states, season)
  const status = model.status
  const rows = buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating')
  const scorers = sharedStatAwardWinners(rows, row => row.goals, 'Goals').map(winner => ({ playerId: winner.playerId, goals: winner.value }))
  const assistLeaders = sharedStatAwardWinners(rows, row => row.assists, 'Assists').map(winner => ({ playerId: winner.playerId, assists: winner.value }))
  const mom = rankGlobalRankingRows(rows, players, 'mom')[0]
  const rating = rankGlobalRankingRows(rows, players, 'rating')[0]
  const xi = model.events.filter(event => event.kind === 'season-xi').map(event => event.playerId)
  const result: HistoryTimeline = { season, league: status.league.championId, cup: status.cup.championId, champions: status.champions.championId, scorers, assistLeaders, scorer: scorers[0], assists: assistLeaders[0], rating: rating ? { playerId: rating.playerId, avgRating: rating.avgRating } : undefined, mom: mom ? { playerId: mom.playerId, mom: mom.mom } : undefined, bestXI: xi }
  cached.set(key, result)
  return result
}

export function historyAwardsForSeason(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], season: string, scope: CompetitionType | 'all'): HistoryAwards[] {
  const cached = stateMap(awardsCache, matches, players, teams, states)
  const key = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${season}:${scope}`; const current = cached.get(key); if (current) return current
  diagnostics.awardBuilds++
  const model = officialSeasonModel(teams, players, matches, states, season)
  const types = scope === 'all' ? ['league', 'cup', 'champions'] as CompetitionType[] : [scope]
  const result = types.map(competition => {
    const award = model.competitionAwards[competition]
    const published = award.complete ? award : undefined
    return { season, competition, player: published?.mvp, goalkeeper: published?.goalkeeper, goalkeepers: published?.goalkeepers ?? [], goldenGlove: undefined }
  })
  cached.set(key, result)
  return result
}

/** Historical team titles are derived from canonical champions plus recorded season membership. */
export function playerTeamTitles(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], playerId: string, season: string, scope: CompetitionType | 'all' = 'all'): string[] {
  return officialAwardsForSeason(teams, players, matches, states, season).filter(event => event.playerId === playerId && event.category === 'championship' && (scope === 'all' || event.competition === scope)).map(event => `${season} ${event.competition === 'league' ? 'League' : event.competition === 'cup' ? 'Cup' : 'Champions'}`)

}

export function historyMonthlyAward(teams: Team[], players: Player[], matches: Match[], season: string, block: number) {
  const cached = monthlyMap(matches, players, teams)
  const key = `${AWARD_POLICY_REVISION}:${RATING_ENGINE_REVISION}:${season}:${block}`
  if (cached.has(key)) return cached.get(key)
  diagnostics.monthlyBuilds++
  const result = monthlyAwardForBlock(teams, players, matches, season, block)
  cached.set(key, result)
  return result
}

export function clearHistoryReadModelCache() {
  timelineCache = new WeakMap(); awardsCache = new WeakMap(); monthlyCache = new WeakMap()
  diagnostics.timelineBuilds = 0; diagnostics.awardBuilds = 0; diagnostics.monthlyBuilds = 0
}

/** Test-only observable cache misses; production consumers never need polling. */
export function historyReadModelDiagnostics() { return { ...diagnostics } }
