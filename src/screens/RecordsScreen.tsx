import { useMemo, useState } from 'react'
import { combinationStats, goalPartnerships } from '../engine/analytics'
import { getMatchManOfTheMatch, matchPositionSegments, matchScore } from '../engine/rating'
import { aggregatePlayerStats, seasonsFromMatches } from '../engine/stats'
import { playerStreaks } from '../engine/seasonInsights'
import { playerFullName } from '../components/ui'
import { useStore } from '../store'
import { emptyFilters, matchesForPlayer, RankingFilterButton, type RankingFilters } from './RankingFilters'
import type { Match, Player, Team, View } from '../types'

type Category = 'player' | 'combination' | 'team'
type Row = { id: string; name: string; value: string; numeric: number; detail: string }
type RankedRow = Row & { rank: number }
type Group = { id: string; title: string; rows: RankedRow[] }

/** Competition ranking: tied values share a rank and the following rank skips. */
const rank = (rows: Row[]): RankedRow[] => {
  let previous: number | undefined; let previousRank = 0
  return rows.slice().sort((a, b) => b.numeric - a.numeric || a.name.localeCompare(b.name)).map((row, index) => {
    const nextRank = previous === row.numeric ? previousRank : index + 1
    previous = row.numeric; previousRank = nextRank
    return { ...row, rank: nextRank }
  })
}
const playerMatches = (player: Player, matches: Match[], filters: RankingFilters) => matchesForPlayer(player, matches, filters).filter(match => !filters.positions.length || match.appearances.some(appearance => appearance.playerId === player.id && matchPositionSegments(match, appearance).some(segment => filters.positions.includes(segment.position))))
const teamMatches = (teamId: string, matches: Match[], filters: RankingFilters) => matches.filter(match => (!filters.seasons.length || filters.seasons.includes(match.season)) && (!filters.teams.length || filters.teams.includes(teamId)) && (match.homeTeamId === teamId || match.awayTeamId === teamId))
function teamStat(team: Team, matches: Match[], filters: RankingFilters) {
  const games = teamMatches(team.id, matches, filters); let wins = 0; let goals = 0; let conceded = 0; let cleanSheets = 0
  for (const match of games) { const score = matchScore(match); const ours = match.homeTeamId === team.id ? score.home : score.away; const theirs = match.homeTeamId === team.id ? score.away : score.home; goals += ours; conceded += theirs; wins += Number(ours > theirs); cleanSheets += Number(theirs === 0) }
  return { games, wins, goals, conceded, cleanSheets }
}
function bestWinningStreak(teamId: string, matches: Match[], filters: RankingFilters) {
  let current = 0; let best = 0
  for (const match of teamMatches(teamId, matches, filters).slice().sort((a, b) => a.date.localeCompare(b.date) || a.matchDay - b.matchDay || a.id.localeCompare(b.id))) { const score = matchScore(match); const won = match.homeTeamId === teamId ? score.home > score.away : score.away > score.home; current = won ? current + 1 : 0; best = Math.max(best, current) }
  return best
}

export function RecordsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { players, teams, matches } = useStore(); const [category, setCategory] = useState<Category>('player'); const [all, setAll] = useState<string | null>(null); const [limit, setLimit] = useState(20); const [filters, setFilters] = useState<RankingFilters>(emptyFilters)
  const selectedSeasons = filters.seasons.length ? filters.seasons : seasonsFromMatches(matches)
  const scopedMatches = useMemo(() => matches.filter(match => selectedSeasons.includes(match.season) && (!filters.teams.length || filters.teams.includes(match.homeTeamId) || filters.teams.includes(match.awayTeamId))), [matches, selectedSeasons, filters.teams])
  const playerRows = useMemo(() => players.map(player => { const games = playerMatches(player, matches, filters); return { player, games, stats: aggregatePlayerStats(player, players, games) } }), [players, matches, filters])
  const playerGroups = useMemo<Group[]>(() => {
    const group = (id: string, title: string, metric: (row: typeof playerRows[number]) => number, value: (number: number) => string, detail: (row: typeof playerRows[number]) => string): Group => ({ id, title, rows: rank(playerRows.map(row => ({ id: row.player.id, name: playerFullName(row.player), numeric: metric(row), value: value(metric(row)), detail: detail(row) }))) })
    return [
      group('goals', 'All-time Goals', row => row.stats.goals, value => `${value} goals`, row => `${row.stats.assists} assists · ${row.stats.matches} apps`),
      group('assists', 'All-time Assists', row => row.stats.assists, value => `${value} assists`, row => `${row.stats.goals} goals · ${row.stats.matches} apps`),
      group('ga', 'All-time G+A', row => row.stats.goals + row.stats.assists, value => `${value} G+A`, row => `${row.stats.goals} goals · ${row.stats.assists} assists`),
      group('mom', 'Most MOM Awards', row => row.games.filter(match => getMatchManOfTheMatch(match, players) === row.player.id).length, value => `${value} MOM`, row => `${row.stats.matches} appearances`),
      group('apps', 'Most Appearances', row => row.stats.matches, value => `${value} apps`, row => `${row.stats.minutes}' · ${row.stats.starts} starts`),
      group('minutes', 'Most Minutes', row => row.stats.minutes, value => `${value}'`, row => `${row.stats.matches} appearances`),
      group('rating', 'Highest Average Rating', row => row.stats.matches >= 3 ? row.stats.avgRating : 0, value => value ? value.toFixed(2) : '—', row => `${row.stats.matches} rated appearances · min. 3`),
      group('goal-streak', 'Longest Scoring Streak', row => playerStreaks(row.player, row.games).find(item => item.key === 'goals')?.best ?? 0, value => `${value} matches`, () => 'Consecutive matches with a goal'),
      group('rating-streak', 'Longest 7.5+ Rating Streak', row => playerStreaks(row.player, row.games).find(item => item.key === 'rating75')?.best ?? 0, value => `${value} matches`, () => 'Consecutive rated appearances'),
      group('saves', 'Most Career Saves', row => row.stats.saves, value => `${value} saves`, row => `${row.stats.minutes}' played`),
    ]
  }, [playerRows, players])
  const combinationGroups = useMemo<Group[]>(() => {
    const filter = { teamId: filters.teams.length === 1 ? filters.teams[0] : undefined }; const names = (ids: string[]) => ids.map(id => playerFullName(players.find(player => player.id === id))).join(' + ')
    const combos = (id: string, title: string, kind: Parameters<typeof combinationStats>[3], metric: (row: ReturnType<typeof combinationStats>[number]) => number, value: (number: number) => string, detail: (row: ReturnType<typeof combinationStats>[number]) => string): Group => ({ id, title, rows: rank(combinationStats(players, scopedMatches, filter, kind).filter(row => row.eligible).map(row => ({ id: row.key, name: names(row.playerIds), numeric: metric(row), value: value(metric(row)), detail: detail(row) }))) })
    return [
      { id: 'partnerships', title: 'Most Goal Connections', rows: rank(goalPartnerships(players, scopedMatches, filter).map(row => ({ id: row.key, name: `${playerFullName(players.find(player => player.id === row.assisterId))} → ${playerFullName(players.find(player => player.id === row.scorerId))}`, numeric: row.assistedGoals, value: `${row.assistedGoals} assists`, detail: 'Directional assist → scorer connection' }))) },
      combos('attack', 'Best Attack Trio', 'attack', row => row.combinedGA, value => `${value} G+A`, row => `${row.togetherMinutes}' shared · ${row.goalsFor} GF`),
      combos('midfield', 'Best Midfield Trio', 'midfield', row => row.goalDifference, value => `${value > 0 ? '+' : ''}${value} GD`, row => `${row.togetherMinutes}' shared · ${row.combinedGA} G+A`),
      combos('cb', 'Best CB Partnership', 'cb', row => row.cleanSheets, value => `${value} CS`, row => `${(row.goalsAgainst / row.togetherMinutes * 90).toFixed(2)} GA/90 · ${row.togetherMinutes}'`),
      combos('back-four', 'Best Back Four', 'backFour', row => row.cleanSheets, value => `${value} CS`, row => `${(row.goalsAgainst / row.togetherMinutes * 90).toFixed(2)} GA/90 · ${row.togetherMinutes}'`),
    ]
  }, [players, scopedMatches, filters.teams, selectedSeasons, season])
  const teamGroups = useMemo<Group[]>(() => {
    const group = (id: string, title: string, metric: (stats: ReturnType<typeof teamStat>, team: Team) => number, value: (number: number) => string): Group => ({ id, title, rows: rank(teams.map(team => { const stats = teamStat(team, matches, filters); const number = metric(stats, team); return { id: team.id, name: team.name, numeric: number, value: value(number), detail: `${stats.games.length} matches · ${stats.goals} GF / ${stats.conceded} GA` } })) })
    return [group('wins', 'Most Wins', stats => stats.wins, value => `${value} wins`), group('goals', 'Most Goals', stats => stats.goals, value => `${value} goals`), group('clean-sheets', 'Most Clean Sheets', stats => stats.cleanSheets, value => `${value} CS`), group('win-streak', 'Longest Winning Streak', (_stats, team) => bestWinningStreak(team.id, matches, filters), value => `${value} matches`)]
  }, [teams, matches, filters])
  const groups = category === 'player' ? playerGroups : category === 'combination' ? combinationGroups : teamGroups
  const renderGroup = (group: Group) => { const expanded = all === group.id; const rows = expanded ? group.rows.slice(0, limit) : group.rows.slice(0, 3); return <section key={group.id} className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{group.title}</h2>{!expanded && group.rows.length > 3 && <button type="button" onClick={() => { setAll(group.id); setLimit(20) }} className="text-xs font-semibold text-emerald-400">View All</button>}</div><div className="overflow-hidden rounded-xl bg-zinc-900">{rows.map(row => <button key={row.id} type="button" onClick={() => category === 'player' ? onNavigate({ name: 'player', id: row.id }) : undefined} className="grid w-full grid-cols-[24px_1fr_auto] gap-2 border-b border-white/5 px-3 py-2.5 text-left text-xs last:border-0"><b className="text-zinc-500">{row.rank}</b><span className="min-w-0"><b className="block truncate">{row.name}</b><span className="block truncate text-[10px] text-zinc-500">{row.detail}</span></span><b className="text-emerald-400">{row.value}</b></button>)}</div>{expanded && rows.length < group.rows.length && <button type="button" onClick={() => setLimit(value => value + 20)} className="mt-2 w-full rounded-xl bg-zinc-900 py-2 text-xs font-bold text-emerald-400">Load more</button>}</section> }
  return <div className="px-4 pb-8 pt-6"><div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Records</h1><RankingFilterButton applied={filters} onApply={setFilters} seasons={seasonsFromMatches(matches)} teams={teams} /></div><div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">{([['player', 'Player Records'], ['combination', 'Combination Records'], ['team', 'Team Records']] as [Category, string][]).map(([id, label]) => <button key={id} type="button" onClick={() => { setCategory(id); setAll(null) }} className={`rounded-lg px-1 py-2 text-[10px] font-bold ${category === id ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>{label}</button>)}</div>{groups.map(renderGroup)}</div>
}
