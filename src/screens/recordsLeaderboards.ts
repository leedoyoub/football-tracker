import { combinationGroups } from '../engine/combinationLeaderboards'
export { combinationBestUnitOptions, combinationPairPresentation } from '../engine/combinationLeaderboards'
import { buildPlayerRecordLeaderboards, playerRecordsNeedMom } from '../engine/playerRecords'
import { awardRecordGroups, teamHistoryRecordGroups } from '../engine/awardRecords'
import { scopedIndividualAwardEvents, teamIndividualAwardRecordGroups } from '../engine/teamAwardRecords'
import { AWARD_POLICY_REVISION, officialSeasonModel } from '../engine/officialAwards'
import { RATING_ENGINE_REVISION } from '../engine/ratingRevision'
import { MOM_POLICY_REVISION } from '../engine/momPolicy'
import { teamMetrics } from '../engine/teamMetrics'
import { teamHistoricMatchRecords } from '../engine/teamHistoricMatches'
import { teamSeasonRecords } from '../engine/teamCompetitionResults'
import { recordsScopedMatches } from '../engine/recordsScope'
import { arrayItemRevision } from '../engine/arrayItemRevision'
import { positionFilterFamilies, scopedPositionFamilyByPlayer } from '../engine/positionScope'
import { historicalRankingTeams, playerInRankingTeams } from '../engine/rankingPresentation'
import { RECORDS_POLICY_REVISION } from '../engine/participation'
import { playerFullName } from '../components/ui'
import { formatSignedTwoDecimals } from '../lib/signedNumber'
import type { CompetitionState, CompetitionType, Match, Player, PositionFilterKey, RankingRankMode, Team } from '../types'

export type RecordsLeaderboardKind = 'player' | 'team' | 'combination'
export type CombinationConnector = '→' | '↔' | '&' | '+'
export type CombinationPairPresentation = { playerIds: string[]; connector: CombinationConnector; directional: boolean }
export type RecordsLeaderboardRow = {
  id: string; name: string; value: string; numeric: number; detail: string; rank: number
  playerIds?: string[]; combinationPair?: CombinationPairPresentation; combinationTeamId?: string
  matchId?: string; streakMatchIds?: string[][]; teamIds?: string[]; season?: string; inProgress?: boolean; opponentId?: string
  goalsFor?: number; goalsAgainst?: number; competition?: CompetitionType | 'all'; comparisonGroup?: number
  totals?: { played: number; wins: number; draws: number; losses: number }
}
export type RecordsLeaderboardGroup = { id: string; title: string; kind: RecordsLeaderboardKind; rows: RecordsLeaderboardRow[]; applicableFilters: { position: boolean; team: boolean } }
export const recordRowKey = (row: RecordsLeaderboardRow) => JSON.stringify([row.id, row.matchId, row.season, row.competition, row.comparisonGroup])
export type RecordsScope = { seasons: string[]; teamIds: string[]; competition: CompetitionType | 'all'; positionFilter: PositionFilterKey; positionFilters?: PositionFilterKey[]; rankMode?: RankingRankMode }
type RecordsInput = { category: RecordsLeaderboardKind; players: Player[]; teams: Team[]; matches: Match[]; scope: RecordsScope; selectedIds?: string[]; section?: 'performance' | 'awards'; states?: CompetitionState[] }

export const EMPTY_RECORDS_SCOPE: RecordsScope = { seasons: [], teamIds: [], competition: 'all', positionFilter: 'all' }
export const EMPTY_COMPETITION_STATES: CompetitionState[] = []
export const TEAM_SEASON_RECORD_IDS = ['history-league-points', 'history-league-wins', 'history-league-gd', 'history-league-finish', 'history-cup-finish', 'history-champions-finish', 'season-goals', 'season-conceded', 'season-win-rate']
const TEAM_SEASON_RECORDS = new Set(TEAM_SEASON_RECORD_IDS)
const recordsCache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, RecordsLeaderboardGroup[]>>>>>()

export function recordsLeaderboardSection(category: RecordsLeaderboardKind, id: string): 'performance' | 'awards' {
  return id.startsWith('awards-') || id.startsWith('history-') || id.startsWith('team-awards') || category === 'team' && TEAM_SEASON_RECORDS.has(id) ? 'awards' : 'performance'
}

function rankSorted(rows: Omit<RecordsLeaderboardRow, 'rank'>[]): RecordsLeaderboardRow[] {
  let prior: number | undefined
  let previousCohort: number | undefined
  let rank = 0
  let indexInCohort = 0
  return rows.map(row => {
    if (row.comparisonGroup !== previousCohort) { indexInCohort = 0; prior = undefined }
    indexInCohort++
    if (prior !== row.numeric) rank = indexInCohort
    prior = row.numeric
    previousCohort = row.comparisonGroup
    return { ...row, rank }
  })
}

function rank(rows: Omit<RecordsLeaderboardRow, 'rank'>[], ascending = false) {
  return rankSorted(rows.sort((a, b) => (b.comparisonGroup ?? 0) - (a.comparisonGroup ?? 0)
    || (ascending ? a.numeric - b.numeric : b.numeric - a.numeric)
    || a.name.localeCompare(b.name) || a.id.localeCompare(b.id) || (a.season ?? '').localeCompare(b.season ?? '') || (a.matchId ?? '').localeCompare(b.matchId ?? '')))
}

export function recordsLeaderboardGroups(input: RecordsInput): RecordsLeaderboardGroup[] {
  const { category, players, teams, matches, scope, selectedIds, states = EMPTY_COMPETITION_STATES, section } = input
  const families = category === 'player' ? positionFilterFamilies(scope.positionFilters ?? scope.positionFilter) : []
  // Award counts are scoped by the position recorded on each official event.
  // Career performances use position to select players after aggregation.
  const positionProjection = section !== 'awards' && scope.rankMode !== undefined && families.length > 0
  if (category !== 'combination' && (scope.teamIds.length || positionProjection)) {
    const populationScope = { ...scope, teamIds: [], ...(positionProjection ? { positionFilter: 'all' as const, positionFilters: undefined } : {}), rankMode: undefined }
    const source = recordsLeaderboardGroups({ ...input, scope: populationScope })
    const selected = category === 'player' ? recordsScopedMatches(matches, populationScope, 'player') : []
    const membership = category === 'player' && scope.teamIds.length ? historicalRankingTeams(selected) : undefined
    const positions = positionProjection ? scopedPositionFamilyByPlayer(players, selected, {}) : undefined
    return source.map(group => {
      const rows = group.rows.filter(row => {
        if (positions && !families.some(family => family === positions.get(row.id))) return false
        if (!scope.teamIds.length) return true
        if (category === 'team') return scope.teamIds.includes(row.id)
        if (row.teamIds) return row.teamIds.some(id => scope.teamIds.includes(id))
        return membership && playerInRankingTeams(row.id, scope.teamIds, membership)
      })
      return { ...group, rows: scope.rankMode === 'filtered' || (scope.rankMode === undefined && category === 'team') ? rankSorted(rows) : rows }
    })
  }

  let byPlayers = recordsCache.get(matches)
  if (!byPlayers) { byPlayers = new WeakMap(); recordsCache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players)
  if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams)
  if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  let byScope = byStates.get(states)
  if (!byScope) { byScope = new Map(); byStates.set(states, byScope) }
  const key = JSON.stringify([
    RECORDS_POLICY_REVISION, RATING_ENGINE_REVISION, AWARD_POLICY_REVISION,
    category !== 'player' || section === 'awards' || playerRecordsNeedMom(selectedIds) ? MOM_POLICY_REVISION : null,
    [matches, players, teams, states].map(value => arrayItemRevision<unknown>(value)),
    category, section, scope.competition, scope.seasons.slice().sort(), scope.teamIds.slice().sort(), families.slice().sort(), selectedIds,
  ])
  const cached = byScope.get(key)
  if (cached) return cached
  const needs = (id: string) => !selectedIds || selectedIds.includes(id)
  let groups: RecordsLeaderboardGroup[]
  if (category === 'combination') groups = combinationGroups(players, teams, matches, scope, selectedIds)
  else if (category === 'player' && section === 'awards') groups = awardRecordGroups(teams, players, matches, states, scope, selectedIds)
  else if (category === 'team' && section === 'awards') groups = [
    ...(!selectedIds || selectedIds.some(id => id.startsWith('history-') && !TEAM_SEASON_RECORDS.has(id)) ? teamHistoryRecordGroups(teams, players, matches, states, scope).filter(group => !TEAM_SEASON_RECORDS.has(group.id)) : []),
    ...(!selectedIds || selectedIds.some(id => TEAM_SEASON_RECORDS.has(id)) ? teamSeasonGroups(teams, players, matches, states, scope, selectedIds) : []),
    ...(!selectedIds || selectedIds.some(id => id.startsWith('team-awards')) ? teamIndividualAwardRecordGroups(scopedIndividualAwardEvents(teams, players, matches, states, scope), teams, selectedIds) : []),
  ]
  else if (category === 'team') groups = teamGroups(teams, recordsScopedMatches(matches, scope, 'team'), selectedIds)
  else {
    const byId = new Map(players.map(player => [player.id, player]))
    const completion = new Map<string, boolean>()
    const inProgress = (season: string) => {
      if (!completion.has(season)) {
        const { status } = officialSeasonModel(teams, players, matches, states, season)
        completion.set(season, scope.competition === 'all' ? status.complete : scope.competition === 'league' ? status.league.complete : Boolean(status[scope.competition].championId))
      }
      return !completion.get(season)
    }
    groups = buildPlayerRecordLeaderboards(players, matches, scope, selectedIds).map(group => ({
      id: group.id, title: group.title, kind: 'player', applicableFilters: { position: true, team: true },
      rows: group.rows.map(({ playerId, ...row }) => ({ ...row, id: playerId, name: playerFullName(byId.get(playerId)), ...(row.season && !row.matchId ? { inProgress: inProgress(row.season) } : {}) })),
    }))
  }
  groups = groups.filter(group => needs(group.id))
  if (byScope.size >= 32) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, groups)
  return groups
}

function teamSeasonGroups(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], scope: RecordsScope, selectedIds?: string[]) {
  const names = new Map(teams.map(team => [team.id, team.name]))
  return teamSeasonRecords(teams, players, matches, states, scope, selectedIds).map(({ id, title, ascending, rows }) =>
    teamGroup(id, title, rank(rows.map(({ teamId, ...row }) => ({
      ...row, id: teamId, name: names.get(teamId) ?? teamId, detail: `${row.season} · ${row.detail}`,
    })), ascending)))
}

function teamGroup(id: string, title: string, rows: RecordsLeaderboardRow[]): RecordsLeaderboardGroup {
  return { id, title, kind: 'team', rows, applicableFilters: { position: false, team: true } }
}

function teamGroups(teams: Team[], matches: Match[], selectedIds?: string[]): RecordsLeaderboardGroup[] {
  const needs = (id: string) => !selectedIds || selectedIds.includes(id)
  const names = new Map(teams.map(team => [team.id, team.name]))
  const historic = teamHistoricMatchRecords(matches, [...names.keys()], selectedIds).map(({ id, title, rows }) =>
    teamGroup(id, title, rank(rows.map(({ teamId, opponentId, match, goalsFor, goalsAgainst, numeric }) => ({
      id: teamId, name: names.get(teamId) ?? teamId, value: `${numeric} goals`, numeric, detail: match.season,
      matchId: match.id, season: match.season, opponentId, goalsFor, goalsAgainst,
    })))))
  if (selectedIds && selectedIds.every(id => historic.some(group => group.id === id))) return historic
  const rows = teams.map(team => ({ id: team.id, name: team.name, ...teamMetrics(team, matches) })).filter(row => row.played)
  const group = (id: string, title: string, measure: (row: typeof rows[number]) => number, format: (n: number) => string = String, ascending = false) => {
    if (!needs(id)) return []
    return [teamGroup(id, title, rank(rows.map(row => {
      const numeric = measure(row)
      const { played, wins, draws, losses } = row
      return { id: row.id, name: row.name, numeric, value: format(numeric),
        detail: `${played} matches · ${row.goals} GF / ${row.conceded} GA`,
        ...(['played', 'wins', 'draws', 'losses'].includes(id) ? { totals: { played, wins, draws, losses } } : {}) }
    }), ascending))]
  }
  const decimal = (n: number) => n.toFixed(2)
  const percent = (n: number) => `${decimal(n)}%`
  const goals = (n: number) => `${n} goals`
  const streak = (id: string, title: string, key: keyof ReturnType<typeof teamMetrics>['streaks']) => !needs(id) ? [] : [teamGroup(id, title, rank(rows.map(row => ({
    id: row.id, name: row.name, numeric: row.streaks[key], value: `${row.streaks[key]} matches`,
    detail: `${row.played} matches · ${row.goals} GF / ${row.conceded} GA`, streakMatchIds: row.streakMatchIds[key],
  }))))]
  return [
    ...group('played', 'Most Matches Played', row => row.played), ...group('wins', 'Most Wins', row => row.wins, n => `${n} wins`),
    ...group('draws', 'Most Draws', row => row.draws), ...group('losses', 'Most Losses', row => row.losses),
    ...group('win-rate', 'Highest Win Percentage', row => row.winRate, percent), ...group('ppg', 'Highest Points per Match', row => row.ppg, decimal),
    ...group('goal-difference', 'Best Goal Difference', row => row.goalDifference, n => `${n} GD`),
    ...group('goal-difference-per-match', 'Best Goal Difference per Match', row => row.goalDifference / row.played, formatSignedTwoDecimals),
    ...group('comeback-wins', 'Most Comeback Wins', row => row.comebackWins, n => `${n} wins`),
    ...group('team-goals', 'Most Goals', row => row.goals, goals), ...group('gf-rate', 'Highest GF per Match', row => row.goals / row.played, decimal),
    ...group('opening-goals', 'Most Opening Goals', row => row.openingGoals, goals),
    ...group('clean', 'Most Clean Sheets', row => row.cleanSheets, n => `${n} CS`), ...group('clean-rate', 'Highest Clean Sheet Percentage', row => row.cleanSheets / row.played * 100, percent),
    ...group('ga-rate', 'Lowest Goals Conceded per Match', row => row.conceded / row.played, decimal, true),
    ...group('opponent-sot-rate', 'Lowest Opponent SOT per Match', row => row.opponentSot / row.played, decimal, true),
    ...group('saves', 'Most Team Saves', row => row.saves, n => `${n} saves`), ...group('conceded', 'Most Goals Conceded', row => row.conceded, goals),
    ...streak('win-streak', 'Longest Winning Streak', 'winning'), ...streak('unbeaten-streak', 'Longest Undefeated Streak', 'unbeaten'),
    ...streak('scoring-streak', 'Longest Scoring Streak', 'scoring'), ...streak('clean-streak', 'Longest Clean Sheet Streak', 'cleanSheet'),
    ...streak('losing-streak', 'Longest Losing Streak', 'losing'), ...streak('winless-streak', 'Longest Winless Streak', 'winless'),
    ...historic,
  ]
}
