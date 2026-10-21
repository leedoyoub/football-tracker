import type { CompetitionState, CompetitionType, Match, Player, Team } from '../types'
import { AWARD_POLICY_REVISION, officialAwardSeasons, officialSeasonModel, type OfficialAwardEvent } from './officialAwards'
import { RATING_ENGINE_REVISION } from './ratingRevision'
import type { RecordsLeaderboardGroup, RecordsLeaderboardRow } from '../screens/recordsLeaderboards'

type AwardScope = { seasons: string[]; competition: CompetitionType | 'all'; teamIds: string[] }
const cache = new WeakMap<Match[], WeakMap<Player[], WeakMap<Team[], WeakMap<CompetitionState[], Map<string, OfficialAwardEvent[]>>>>>()
const sortedIds = (ids: string[]) => [...new Set(ids)].sort()

/** One immutable scoped event index for team History and team award rankings. */
export function scopedIndividualAwardEvents(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], scope: AwardScope): OfficialAwardEvent[] {
  let byPlayers = cache.get(matches); if (!byPlayers) { byPlayers = new WeakMap(); cache.set(matches, byPlayers) }
  let byTeams = byPlayers.get(players); if (!byTeams) { byTeams = new WeakMap(); byPlayers.set(players, byTeams) }
  let byStates = byTeams.get(teams); if (!byStates) { byStates = new WeakMap(); byTeams.set(teams, byStates) }
  let byScope = byStates.get(states); if (!byScope) { byScope = new Map(); byStates.set(states, byScope) }
  const key = JSON.stringify([AWARD_POLICY_REVISION, RATING_ENGINE_REVISION, sortedIds(scope.seasons), scope.competition, sortedIds(scope.teamIds)])
  const cached = byScope.get(key); if (cached) return cached
  const events = new Map<string, OfficialAwardEvent>()
  for (const season of officialAwardSeasons(matches, states)) {
    if (scope.seasons.length && !scope.seasons.includes(season)) continue
    for (const event of officialSeasonModel(teams, players, matches, states, season).events) {
      if (event.category !== 'individual' || !event.finalized || scope.competition !== 'all' && event.competition !== scope.competition || scope.teamIds.length && !scope.teamIds.includes(event.teamId)) continue
      events.set(event.id, event)
    }
  }
  const result = [...events.values()]
  if (byScope.size >= 32) byScope.delete(byScope.keys().next().value!)
  byScope.set(key, result)
  return result
}

function teamAwardTitle(kind: string, label: string) {
  return `Most ${label}${kind.endsWith('-xi') ? ' Selections' : /Awards?$|MVPs?$/.test(label) ? '' : ' Awards'}`
}

/** Single-pass counting includes future official kinds without another award rule. */
export function teamIndividualAwardRecordGroups(events: OfficialAwardEvent[], teams: Team[], selectedIds?: string[]): RecordsLeaderboardGroup[] {
  const byKind = new Map<string, { label: string; teams: Map<string, number> }>()
  const totals = new Map<string, number>(), seen = new Set<string>()
  for (const event of events) {
    if (!event.finalized || event.category !== 'individual' || seen.has(event.id)) continue
    seen.add(event.id)
    totals.set(event.teamId, (totals.get(event.teamId) ?? 0) + 1)
    let kind = byKind.get(event.kind)
    if (!kind) { kind = { label: event.label, teams: new Map() }; byKind.set(event.kind, kind) }
    kind.teams.set(event.teamId, (kind.teams.get(event.teamId) ?? 0) + 1)
  }
  const teamById = new Map(teams.map(team => [team.id, team]))
  const group = (id: string, title: string, counts: Map<string, number>): RecordsLeaderboardGroup => {
    let previous: number | undefined, rank = 0
    const rows: RecordsLeaderboardRow[] = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([teamId, count], i) => {
      if (previous !== count) rank = i + 1
      previous = count
      return { id: teamId, name: teamById.get(teamId)?.name ?? teamId, numeric: count, value: String(count), rank, detail: 'Finalized individual awards · team at award time' }
    })
    return { id, title, kind: 'team', applicableFilters: { position: false, team: true }, rows }
  }
  const result = [group('team-awards-individual', 'Most Individual Awards', totals), ...[...byKind].sort((a, b) => a[1].label.localeCompare(b[1].label) || a[0].localeCompare(b[0])).map(([kind, data]) => group(`team-awards:${kind}`, teamAwardTitle(kind, data.label), data.teams))]
  // Keep a directly opened kind's filters usable after switching to an empty scope.
  for (const id of selectedIds ?? []) if (id.startsWith('team-awards:') && !result.some(item => item.id === id)) result.push(group(id, teamAwardTitle(id.slice(12), id.slice(12).split('-').map(word => word[0]?.toUpperCase() + word.slice(1)).join(' ')), new Map()))
  return selectedIds ? result.filter(item => selectedIds.includes(item.id)) : result
}
