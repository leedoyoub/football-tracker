import type { CompetitionState, Match, Player, Team } from '../types'
import { officialAwardSeasons, officialSeasonModel, type OfficialAwardEvent, type TeamSeasonResult, awardEventDetail } from './officialAwards'
import { positionFilterFamilies } from './positionScope'
import type { RecordsLeaderboardGroup, RecordsLeaderboardRow, RecordsScope } from '../screens/recordsLeaderboards'

type Metric = { id: string; title: string; accepts: (event: OfficialAwardEvent) => boolean }
const individual = (e: OfficialAwardEvent) => e.category === 'individual'
export const AWARD_RECORD_METRICS: Metric[] = [
  { id: 'individual', title: 'Most Individual Awards', accepts: individual },
  { id: 'total', title: 'Most Total Honors', accepts: e => e.category !== 'runner-up' },
  { id: 'championships', title: 'Most Championships', accepts: e => e.category === 'championship' },
  { id: 'runner-ups', title: 'Most Runner-up Finishes', accepts: e => e.category === 'runner-up' },
  { id: 'monthly', title: 'Most Monthly Awards', accepts: e => e.kind.startsWith('monthly-') },
  { id: 'mvps', title: 'Most Competition MVPs', accepts: e => ['league-mvp', 'cup-mvp', 'champions-mvp'].includes(e.kind) },
  { id: 'xi', title: 'Most Best XI Selections', accepts: e => e.kind.endsWith('-xi') },
  { id: 'finals', title: 'Most Final MVPs', accepts: e => e.kind.endsWith('-final') },
  ...[
    ['monthly-player', 'Player of the Month'], ['monthly-xi', 'Team of the Month'],
    ['league-mvp', 'Player of the League'], ['cup-mvp', 'Player of the Cup'], ['champions-mvp', 'Player of the Tournament'], ['season-mvp', 'Player of the Season'],
    ['league-gk', 'League Golden Gloves'], ['cup-gk', 'Goalkeeper of the Cup'], ['champions-gk', 'Goalkeeper of the Tournament'], ['season-gk', 'Goalkeeper of the Season'],
    ['league-xi', 'League Best XI'], ['cup-xi', 'Cup Best XI'], ['champions-xi', 'Champions Best XI'], ['season-xi', 'Season Best XI'],
    ['champions-round-player', 'Champions Player of the Round'], ['champions-round-xi', 'Champions Team of the Round'],
    ['cup-final', 'Cup Final MVPs'], ['champions-final', 'Champions Final MVPs'],
  ].map(([id, title]) => ({ id, title: `Most ${title}`, accepts: (e: OfficialAwardEvent) => e.kind === id })),
  { id: 'scorers', title: 'Most Top Scorer Awards', accepts: e => e.kind.endsWith('-scorer') },
  { id: 'assisters', title: 'Most Assist King Awards', accepts: e => e.kind.endsWith('-assists') },
  ...(['league', 'cup', 'champions', 'season'] as const).flatMap(type => [
    { id: `${type}-scorer`, title: `Most ${type === 'season' ? 'Season' : type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'} Top Scorer Awards`, accepts: (e: OfficialAwardEvent) => e.kind === `${type}-scorer` },
    { id: `${type}-assists`, title: `Most ${type === 'season' ? 'Season' : type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'} Assist King Awards`, accepts: (e: OfficialAwardEvent) => e.kind === `${type}-assists` },
  ]),
]

function ranked(rows: Omit<RecordsLeaderboardRow, 'rank'>[], ascending = false): RecordsLeaderboardRow[] {
  let previous: number | undefined, rank = 0
  return rows.sort((a, b) => (ascending ? a.numeric - b.numeric : b.numeric - a.numeric) || a.id.localeCompare(b.id)).map((row, i) => { if (previous !== row.numeric) rank = i + 1; previous = row.numeric; return { ...row, rank } })
}
export function awardRecordGroups(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], scope: RecordsScope): RecordsLeaderboardGroup[] {
  const families = positionFilterFamilies(scope.positionFilter)
  const events = officialAwardSeasons(matches, states).filter(season => !scope.seasons.length || scope.seasons.includes(season)).flatMap(season => officialSeasonModel(teams, players, matches, states, season).events).filter(e => (scope.competition === 'all' || e.competition === scope.competition) && (!scope.teamIds.length || scope.teamIds.includes(e.teamId)) && (!families.length || e.position && families.includes(e.position)))
  const byPlayer = new Map<string, OfficialAwardEvent[]>()
  for (const event of events) { const list = byPlayer.get(event.playerId) ?? []; list.push(event); byPlayer.set(event.playerId, list) }
  const byId = new Map(players.map(player => [player.id, player]))
  return AWARD_RECORD_METRICS.map(metric => ({ id: `awards-${metric.id}`, title: metric.title, kind: 'player', applicableFilters: { position: true, team: true }, rows: ranked([...byPlayer].flatMap(([id, awards]) => {
    const selected = awards.filter(metric.accepts)
    if (!selected.length) return []
    const player = byId.get(id)
    return [{ id, name: player?.displayName ?? player?.name ?? `Historical player ${id}`, numeric: selected.length, value: String(selected.length), detail: selected.map(e => awardEventDetail(e, teams)).join(' · ') }]
  })) }))
}

export function teamHistoryRecordGroups(teams: Team[], players: Player[], matches: Match[], states: CompetitionState[], scope: RecordsScope): RecordsLeaderboardGroup[] {
  const results = officialAwardSeasons(matches, states).filter(season => !scope.seasons.length || scope.seasons.includes(season)).flatMap(season => officialSeasonModel(teams, players, matches, states, season).teamResults).filter(r => (scope.competition === 'all' || r.competition === scope.competition) && (!scope.teamIds.length || scope.teamIds.includes(r.teamId)))
  const group = (id: string, title: string, predicate: (r: TeamSeasonResult) => boolean, measure?: (r: TeamSeasonResult) => number, ascending = false): RecordsLeaderboardGroup => ({ id: `history-${id}`, title, kind: 'team', applicableFilters: { position: false, team: true }, rows: ranked(teams.flatMap(team => {
    const selected = results.filter(r => r.teamId === team.id && predicate(r))
    if (!selected.length) return []
    const best = measure ? selected.slice().sort((a, b) => (ascending ? 1 : -1) * (measure(a) - measure(b)))[0] : undefined
    const numeric = best && measure ? measure(best) : selected.length
    return [{ id: team.id, name: team.name, numeric, value: best && id.endsWith('finish') ? best.finishLabel : String(numeric), detail: (best ? selected.filter(r => measure!(r) === numeric) : selected).map(r => `${r.season} · ${r.finishLabel}`).join(' · ') }]
  }), ascending) })
  return [
    group('titles', 'Most Total Championships', r => r.champion),
    ...(['league', 'cup', 'champions'] as const).map(type => group(`${type}-titles`, `Most ${type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'} Titles`, r => r.competition === type && r.champion)),
    group('runner-ups', 'Most Total Runner-up Finishes', r => r.runnerUp),
    ...(['league', 'cup', 'champions'] as const).map(type => group(`${type}-runner-ups`, `Most ${type === 'league' ? 'League' : type === 'cup' ? 'Cup' : 'Champions'} Runner-ups`, r => r.competition === type && r.runnerUp)),
    group('finals', 'Most Final Appearances', r => r.finalAppearance),
    ...(['cup', 'champions'] as const).map(type => group(`${type}-finals`, `Most ${type === 'cup' ? 'Cup' : 'Champions'} Final Appearances`, r => r.competition === type && r.finalAppearance)),
    group('league-finish', 'Best League Finish', r => r.competition === 'league', r => r.finish, true),
    group('league-points', 'Most League Points in a Season', r => r.competition === 'league', r => r.points ?? 0),
    group('league-wins', 'Most League Wins in a Season', r => r.competition === 'league', r => r.wins ?? 0),
    group('league-gd', 'Best League Goal Difference in a Season', r => r.competition === 'league', r => r.goalDifference ?? 0),
    group('cup-finish', 'Best Cup Finish', r => r.competition === 'cup', r => r.finish, true),
    group('champions-finish', 'Best Champions Finish', r => r.competition === 'champions', r => r.finish, true),
  ]
}
