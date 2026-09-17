import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { currentStaticTeams } from '../data/teams'
import { competitionSeasonStatus } from './competition'
import { awardsForCompetition, seasonAwards } from './awards'
import { buildGlobalRankingData, unifiedBestEleven } from './stats'
import { monthlyAwardForBlock, type MonthlyAwards } from './seasonAnalytics'

export type HistoryTimeline = {
  season: string
  league?: string
  cup?: string
  champions?: string
  scorer?: { playerId: string; goals: number }
  assists?: { playerId: string; assists: number }
  rating?: { playerId: string; avgRating: number }
  mom?: { playerId: string; mom: number }
  bestXI: string[]
}

export type HistoryAwards = {
  season: string
  competition: CompetitionType
  player?: ReturnType<typeof awardsForCompetition>['mvp']
  goalkeeper?: ReturnType<typeof awardsForCompetition>['goalkeeper']
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
  const current = cached.get(season); if (current) return current
  diagnostics.timelineBuilds++
  const tournamentTeams = currentStaticTeams(teams)
  const draw = states.find(state => state.kind === 'champions-draw' && state.season === season)
  const status = competitionSeasonStatus(tournamentTeams, matches, season, players, draw)
  const rows = buildGlobalRankingData(players, matches, { seasons: [season], teams: [], positions: [] }, 'rating')
  const scorer = rows.slice().sort((left, right) => right.goals - left.goals || left.playerId.localeCompare(right.playerId))[0]
  const assister = rows.slice().sort((left, right) => right.assists - left.assists || left.playerId.localeCompare(right.playerId))[0]
  const mom = rows.slice().sort((left, right) => right.mom - left.mom || left.playerId.localeCompare(right.playerId))[0]
  const xi = unifiedBestEleven(players, matches, season).slots.flatMap(slot => slot.playerId ? [slot.playerId] : [])
  const result: HistoryTimeline = { season, league: status.league.championId, cup: status.cup.championId, champions: status.champions.championId, scorer: scorer ? { playerId: scorer.playerId, goals: scorer.goals } : undefined, assists: assister ? { playerId: assister.playerId, assists: assister.assists } : undefined, rating: rows[0] ? { playerId: rows[0].playerId, avgRating: rows[0].avgRating } : undefined, mom: mom ? { playerId: mom.playerId, mom: mom.mom } : undefined, bestXI: xi }
  cached.set(season, result)
  return result
}

export function historyAwardsForSeason(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], season: string, scope: CompetitionType | 'all'): HistoryAwards[] {
  const cached = stateMap(awardsCache, matches, players, teams, states)
  const key = `${season}:${scope}`; const current = cached.get(key); if (current) return current
  diagnostics.awardBuilds++
  const tournamentTeams = currentStaticTeams(teams)
  const types = scope === 'all' ? ['league', 'cup', 'champions'] as CompetitionType[] : [scope]
  const seasonal = seasonAwards(season, tournamentTeams, players, matches, states)
  const result = types.map(competition => {
    const award = awardsForCompetition(competition, season, tournamentTeams, players, matches, states)
    return { season, competition, player: award.mvp, goalkeeper: award.goalkeeper, goldenGlove: competition === 'league' ? seasonal.goldenGlove : undefined }
  })
  cached.set(key, result)
  return result
}

export function historyMonthlyAward(teams: Team[], players: Player[], matches: Match[], season: string, block: number) {
  const cached = monthlyMap(matches, players, teams)
  const key = `${season}:${block}`
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
