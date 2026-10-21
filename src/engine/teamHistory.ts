import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { selectTeamHistoryBestXI } from './teamHistorySelection'
import { teamHistoryLayout } from './teamHistoryLayout'
import { placeTeamHistoryPlayers } from './teamHistoryPlacement'
import { arrayItemRevision } from './arrayItemRevision'
import { matchCompetitionType, teamCompetitionOverview } from './competition'
import { isRecordedForTeam, teamsCreditedWithResult } from './matchPerspective'
import { officialAwardSeasons, officialSeasonModel, type OfficialAwardEvent, type TeamSeasonResult } from './officialAwards'
import { scopedIndividualAwardEvents } from './teamAwardRecords'
import { buildGlobalRankingData } from './stats'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import { AWARD_POLICY_REVISION } from './awardPolicy'

export type TeamHistoryScope = { teamId: string; season: string | null; competition: CompetitionType | 'all' }
export type TeamHistoryRecordMetric = 'goals' | 'assists' | 'appearances' | 'cleanSheets'
export type TeamHistoryRecordRow = { playerId: string; value: number; rank: number; position?: string }
export type TeamHistoryRecordGroup = { metric: TeamHistoryRecordMetric; label: string; rows: TeamHistoryRecordRow[] }
export type TeamIndividualHonors = { kind: string; label: string; count: number; players: { playerId: string; count: number; events: OfficialAwardEvent[] }[] }
const periodOrder = (event: OfficialAwardEvent) => typeof event.period === 'number' ? event.period : event.period ? ['roundOf16', 'quarterFinal', 'semiFinal'].indexOf(event.period) + 1 : 20
export const compareTeamAwardMoments = (left: OfficialAwardEvent, right: OfficialAwardEvent) => right.season.localeCompare(left.season, undefined, { numeric: true }) || periodOrder(right) - periodOrder(left) || left.id.localeCompare(right.id)

/** Events are already official; category and ID checks keep this helper safe for all consumers. */
export function groupTeamIndividualHonors(events: OfficialAwardEvent[]): TeamIndividualHonors[] {
  const unique = [...new Map(events.filter(event => event.category === 'individual' && event.finalized).map(event => [event.id, event])).values()]
  const kinds = new Map<string, OfficialAwardEvent[]>()
  for (const event of unique) { const rows = kinds.get(event.kind) ?? []; rows.push(event); kinds.set(event.kind, rows) }
  return [...kinds].map(([kind, rows]) => {
    const byPlayer = new Map<string, OfficialAwardEvent[]>()
    for (const event of rows) { const entries = byPlayer.get(event.playerId) ?? []; entries.push(event); byPlayer.set(event.playerId, entries) }
    const players = [...byPlayer].map(([playerId, events]) => ({ playerId, count: events.length, events: events.slice().sort(compareTeamAwardMoments) }))
      .sort((a, b) => b.count - a.count || compareTeamAwardMomentsWithoutId(a.events[0], b.events[0]) || a.playerId.localeCompare(b.playerId))
    return { kind, label: rows[0].label, count: rows.length, players }
  }).sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind))
}
function compareTeamAwardMomentsWithoutId(left: OfficialAwardEvent, right: OfficialAwardEvent) { return right.season.localeCompare(left.season, undefined, { numeric: true }) || periodOrder(right) - periodOrder(left) }

export function teamAwardMomentLabel(event: OfficialAwardEvent): string {
  const season = `Season ${event.season.match(/\d+/)?.[0] ?? event.season}`
  if (typeof event.period === 'number') return `${season}-${event.period}`
  if (event.period) return `${season} · ${{ roundOf16: 'R16', quarterFinal: 'QF', semiFinal: 'SF' }[event.period]}`
  return event.kind.endsWith('-final') ? `${season} · Final` : season
}

// Cache by immutable source arrays; bounded scopes avoid retaining arbitrary filter histories.
const scopeCache = new WeakMap<Match[], WeakMap<Player[], Map<string, unknown>>>()
function cachedScope<T>(players: Player[], matches: Match[], scope: TeamHistoryScope, menu: string, compute: () => T): T {
  let byPlayers = scopeCache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); scopeCache.set(matches, byPlayers) }
  let entries = byPlayers.get(players); if (!entries) { entries = new Map(); byPlayers.set(players, entries) }
  const key = JSON.stringify([menu, RATING_ENGINE_REVISION, AWARD_POLICY_REVISION, arrayItemRevision(players), arrayItemRevision(matches), scope.teamId, scope.season, scope.competition])
  if (entries.has(key)) return entries.get(key) as T
  const result = compute(); if (entries.size >= 48) entries.delete(entries.keys().next().value!)
  entries.set(key, result); return result
}
const scopeMatches = (matches: Match[], scope: TeamHistoryScope) => matches.filter(match => (!scope.season || match.season === scope.season) && (scope.competition === 'all' || matchCompetitionType(match) === scope.competition))

/** No award eligibility gate applies to career totals, including appearances. */
export function teamHistoryRecords(players: Player[], matches: Match[], scope: TeamHistoryScope): TeamHistoryRecordGroup[] {
  return cachedScope(players, matches, scope, 'records', () => {
    const rows = buildGlobalRankingData(players, scopeMatches(matches, scope), { seasons: [], teams: [scope.teamId], positions: [] }, 'rating')
    return ([['goals', 'Most Goals'], ['assists', 'Most Assists'], ['appearances', 'Most Appearances'], ['cleanSheets', 'Most Clean Sheets']] as const).map(([metric, label]) => {
      const sorted = rows.filter(row => metric !== 'cleanSheets' || row.playedGoalkeeper).map(row => ({ playerId: row.playerId, value: metric === 'appearances' ? row.matches : metric === 'cleanSheets' ? row.cleanSheets ?? 0 : row[metric], rank: 0, position: row.scopedPositionFamily }))
        .sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId))
      let rank = 0
      return { metric, label, rows: sorted.map((row, index) => { if (!index || row.value !== sorted[index - 1].value) rank = index + 1; return { ...row, rank } }) }
    })
  })
}

/** A team-only, season-derived selection; this projection never publishes award events. */
export function teamHistoryBestXI(players: Player[], matches: Match[], scope: TeamHistoryScope & { season: string }) {
  return cachedScope(players, matches, scope, 'best-xi', () => {
    const games = scopeMatches(matches, scope).filter(match => isRecordedForTeam(match, scope.teamId))
    const result = selectTeamHistoryBestXI(players, games, scope.teamId)
    return { ...result, bestXI: teamHistoryLayout(placeTeamHistoryPlayers(result.bestXI, players, games, scope.teamId), result.statsByPlayer) }
  })
}

export type TeamHistorySeason = { season: string; results: { competition: CompetitionType; status: string; result?: TeamSeasonResult }[] }
type TeamHonorsResult = ReturnType<typeof buildTeamHonors>
const honorCache = new WeakMap<Team[], WeakMap<Player[], WeakMap<Match[], WeakMap<CompetitionState[], Map<string, TeamHonorsResult>>>>>()
function buildTeamHonors(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], teamId: string, competition: CompetitionType | 'all') {
  const seasons = officialAwardSeasons(matches, states)
  const allResults: TeamSeasonResult[] = []
  const seasonHistory: TeamHistorySeason[] = seasons.map(season => {
    const model = officialSeasonModel(teams, players, matches, states, season)
    const results = model.teamResults.filter(result => result.teamId === teamId && (competition === 'all' || result.competition === competition))
    allResults.push(...results)
    const overview = teamCompetitionOverview(teamId, teams, matches, season, players, states, model.status)
    return { season, results: (['league', 'cup', 'champions'] as const).filter(kind => competition === 'all' || kind === competition).map(kind => {
      const result = results.find(row => row.competition === kind)
      const played = matches.some(match => match.season === season && matchCompetitionType(match) === kind && teamsCreditedWithResult(match).includes(teamId))
      const progress = kind === 'league' ? played ? `${overview.league.rank ? `#${overview.league.rank} · ` : ''}In progress` : 'Not Started' : overview[kind].status
      const status = result?.champion ? 'Champion' : result?.runnerUp ? 'Runner-up' : kind === 'league' && result ? result.finishLabel : result?.finalAppearance ? 'Final · In progress' : progress
      return { competition: kind, status, result }
    }) }
  })
  const individual = groupTeamIndividualHonors(scopedIndividualAwardEvents(teams, players, matches, states, { seasons: [], competition, teamIds: [teamId] }))
  return { seasonHistory, individual, championships: allResults.filter(row => row.champion).length, runnerUps: allResults.filter(row => row.runnerUp).length, finals: allResults.filter(row => row.finalAppearance).length }
}
export function teamHistoryHonors(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], teamId: string, competition: CompetitionType | 'all') {
  let byPlayers = honorCache.get(teams); if (!byPlayers) { byPlayers = new WeakMap(); honorCache.set(teams, byPlayers) }
  let byMatches = byPlayers.get(players); if (!byMatches) { byMatches = new WeakMap(); byPlayers.set(players, byMatches) }
  let byStates = byMatches.get(matches); if (!byStates) { byStates = new WeakMap(); byMatches.set(matches, byStates) }
  let byScope = byStates.get(states); if (!byScope) { byScope = new Map(); byStates.set(states, byScope) }
  const key = JSON.stringify([teamId, competition, AWARD_POLICY_REVISION, RATING_ENGINE_REVISION, arrayItemRevision(teams), arrayItemRevision(players), arrayItemRevision(matches), arrayItemRevision(states)])
  const cached = byScope.get(key); if (cached) return cached
  const result = buildTeamHonors(teams, players, matches, states, teamId, competition)
  if (byScope.size >= 48) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, result); return result
}
