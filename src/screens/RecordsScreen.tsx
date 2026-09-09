import { useMemo, useState } from 'react'
import { combinationStats, goalPartnerships } from '../engine/analytics'
import { competitionHistory } from '../engine/competition'
import { getMatchManOfTheMatch, matchScore } from '../engine/rating'
import { playerForm } from '../engine/seasonInsights'
import { aggregatePlayerStats, buildGlobalRankingData, seasonsFromMatches, unifiedBestEleven } from '../engine/stats'
import { currentStaticTeams } from '../data/teams'
import { playerFullName } from '../components/ui'
import { useStore } from '../store'
import { emptyFilters, matchesForPlayer, RankingFilterButton, type RankingFilters } from './RankingFilters'
import type { Match, Team, View } from '../types'

type Category = 'player' | 'combination' | 'team' | 'history' | 'insights'
type Row = { id: string; name: string; value: string; numeric: number; detail: string }
type Group = { id: string; title: string; rows: (Row & { rank: number })[] }
const rank = (rows: Row[]) => { let prior: number | undefined; let priorRank = 0; return rows.slice().sort((a, b) => b.numeric - a.numeric || a.name.localeCompare(b.name)).map((row, index) => { const next = prior === row.numeric ? priorRank : index + 1; prior = row.numeric; priorRank = next; return { ...row, rank: next } }) }

function teamGames(teamId: string, matches: Match[]) { return matches.filter(match => match.homeTeamId === teamId || match.awayTeamId === teamId) }
function teamMetrics(team: Team, matches: Match[]) {
  const games = teamGames(team.id, matches).sort((a, b) => a.date.localeCompare(b.date) || a.matchDay - b.matchDay)
  let wins = 0; let goals = 0; let conceded = 0; let cleanSheets = 0; let opponentSot = 0
  const form = games.map(match => { const score = matchScore(match); const ours = match.homeTeamId === team.id ? score.home : score.away; const theirs = match.homeTeamId === team.id ? score.away : score.home; wins += Number(ours > theirs); goals += ours; conceded += theirs; cleanSheets += Number(theirs === 0); opponentSot += theirs + match.events.reduce((sum, event) => sum + (event.type === 'save' && event.teamId === team.id ? event.count ?? 1 : 0), 0); return ours > theirs ? 'W' : ours === theirs ? 'D' : 'L' })
  return { games, wins, goals, conceded, cleanSheets, opponentSot, form: form.slice(-5).reverse() }
}

export function RecordsScreen({ season, onNavigate }: { season: string; onNavigate: (view: View) => void }) {
  const { players, teams, matches, competitionStates = [] } = useStore()
  const [category, setCategory] = useState<Category>('player')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState<RankingFilters>(emptyFilters)
  const availableSeasons = seasonsFromMatches(matches)
  const scoped = useMemo(() => matches.filter(match => (!filters.seasons.length || filters.seasons.includes(match.season)) && (!filters.teams.length || filters.teams.includes(match.homeTeamId) || filters.teams.includes(match.awayTeamId))), [matches, filters])
  const playerRows = useMemo(() => players.map(player => { const games = matchesForPlayer(player, scoped, filters); return { player, games, stats: aggregatePlayerStats(player, players, games) } }), [players, scoped, filters])
  const playerGroups = useMemo<Group[]>(() => {
    const group = (id: string, title: string, metric: (row: typeof playerRows[number]) => number, suffix: string, detail: (row: typeof playerRows[number]) => string): Group => ({ id, title, rows: rank(playerRows.map(row => ({ id: row.player.id, name: playerFullName(row.player), numeric: metric(row), value: `${metric(row)}${suffix}`, detail: detail(row) }))) })
    return [group('goals', 'All-time Goals', row => row.stats.goals, ' goals', row => `${row.stats.assists} assists · ${row.stats.matches} apps`), group('assists', 'All-time Assists', row => row.stats.assists, ' assists', row => `${row.stats.goals} goals`), group('ga', 'All-time G+A', row => row.stats.goals + row.stats.assists, ' G+A', row => `${row.stats.matches} apps`), group('mom', 'Most MOM', row => row.games.filter(match => getMatchManOfTheMatch(match, players) === row.player.id).length, ' MOM', row => `${row.stats.matches} apps`), group('apps', 'Most Appearances', row => row.stats.matches, ' apps', row => `${row.stats.minutes}'`), group('saves', 'Most Career Saves', row => row.stats.saves, ' saves', row => `${row.stats.matches} apps`)]
  }, [playerRows, players])
  const combinationGroups = useMemo<Group[]>(() => {
    const filter = { teamId: filters.teams.length === 1 ? filters.teams[0] : undefined }
    return [{ id: 'connections', title: 'Most Goal Connections', rows: rank(goalPartnerships(players, scoped, filter).map(row => ({ id: row.key, name: `${playerFullName(players.find(player => player.id === row.assisterId))} → ${playerFullName(players.find(player => player.id === row.scorerId))}`, numeric: row.assistedGoals, value: `${row.assistedGoals} goals`, detail: 'Direct assist-to-scorer connection' }))) }, { id: 'duos', title: 'Best Duos', rows: rank(combinationStats(players, scoped, filter, 'duo').filter(row => row.eligible).map(row => ({ id: row.key, name: row.playerIds.map(id => playerFullName(players.find(player => player.id === id))).join(' + '), numeric: row.goalDifference, value: `${row.goalDifference > 0 ? '+' : ''}${row.goalDifference} GD`, detail: `${row.togetherMinutes}' together` }))) }]
  }, [players, scoped, filters.teams])
  const teamGroups = useMemo<Group[]>(() => {
    const stats = teams.map(team => ({ team, stats: teamMetrics(team, scoped) })); const group = (id: string, title: string, metric: (row: typeof stats[number]) => number, suffix: string): Group => ({ id, title, rows: rank(stats.map(row => ({ id: row.team.id, name: row.team.name, numeric: metric(row), value: `${metric(row)}${suffix}`, detail: `${row.stats.games.length} matches · ${row.stats.goals} GF / ${row.stats.conceded} GA` }))) }); return [group('wins', 'Most Wins', row => row.stats.wins, ' wins'), group('team-goals', 'Most Goals', row => row.stats.goals, ' goals'), group('clean', 'Most Clean Sheets', row => row.stats.cleanSheets, ' CS')]
  }, [teams, scoped])
  const groups = category === 'player' ? playerGroups : category === 'combination' ? combinationGroups : teamGroups
  const tournamentTeams = useMemo(() => currentStaticTeams(teams), [teams])
  const champions = useMemo(() => competitionHistory(tournamentTeams, matches, players, competitionStates), [tournamentTeams, matches, players, competitionStates])
  const history = useMemo(() => category !== 'history' ? [] : champions.map(entry => {
    const games = matches.filter(match => match.season === entry.season)
    const stats = buildGlobalRankingData(players, games, { seasons: [entry.season], teams: [], positions: [] }, 'rating')
    const scorer = stats.slice().sort((a, b) => b.goals - a.goals)[0]; const assists = stats.slice().sort((a, b) => b.assists - a.assists)[0]; const rating = stats[0]; const mom = stats.slice().sort((a, b) => b.mom - a.mom)[0]
    const xi = unifiedBestEleven(players, games, entry.season).slots.flatMap(slot => slot.playerId ? [playerFullName(players.find(player => player.id === slot.playerId))] : [])
    return { ...entry, scorer, assists, rating, mom, xi }
  }), [category, champions, matches, players])
  const trophies = useMemo(() => teams.map(team => { const league = champions.filter(row => row.league === team.id).length; const cup = champions.filter(row => row.cup === team.id).length; const championsTitles = champions.filter(row => row.champions === team.id).length; return { team, league, cup, champions: championsTitles, total: league + cup + championsTitles } }).filter(row => row.total).sort((a, b) => b.total - a.total), [teams, champions])
  const insights = useMemo(() => {
    if (category !== 'insights') return { teams: [], players: [] }
    const games = matches.filter(match => match.season === season)
    const teamRows = teams.map(team => ({ team, ...teamMetrics(team, games) })).filter(row => row.games.length).sort((a, b) => b.form.filter(result => result === 'W').length - a.form.filter(result => result === 'W').length).slice(0, 5)
    const playerRows = players.map(player => ({ player, form: playerForm(player, games) })).filter(row => row.form.ratings.length >= 3).sort((a, b) => b.form.last5Average - a.form.last5Average).slice(0, 5)
    return { teams: teamRows, players: playerRows }
  }, [category, teams, players, matches, season])
  const name = (id?: string) => id ? teams.find(team => team.id === id)?.name ?? '—' : '—'
  const playerName = (id?: string) => id ? playerFullName(players.find(player => player.id === id)) : '—'
  const renderGroup = (group: Group) => { const rows = expanded === group.id ? group.rows.slice(0, 50) : group.rows.slice(0, 3); return <section key={group.id} className="mb-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">{group.title}</h2>{group.rows.length > 3 && <button type="button" onClick={() => setExpanded(expanded === group.id ? null : group.id)} className="secondary-view-all">{expanded === group.id ? 'Show Less' : 'View All'}</button>}</div><div className="overflow-hidden rounded-xl bg-zinc-900">{rows.map(row => <button key={row.id} type="button" onClick={() => category === 'player' && onNavigate({ name: 'player', id: row.id })} className="grid w-full grid-cols-[24px_1fr_auto] gap-2 border-b border-white/5 px-3 py-2.5 text-left text-xs last:border-0"><b className="text-zinc-500">{row.rank}</b><span className="min-w-0"><b className="block truncate">{row.name}</b><small className="block truncate text-zinc-500">{row.detail}</small></span><b className="text-emerald-400">{row.value}</b></button>)}</div></section> }

  return <div className="px-4 pb-8 pt-6"><div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Records</h1>{!['history', 'insights'].includes(category) && <RankingFilterButton applied={filters} onApply={setFilters} seasons={availableSeasons} teams={teams} />}</div><div className="no-scrollbar mb-5 flex gap-1 overflow-x-auto rounded-xl bg-zinc-900 p-1">{([['player', 'Player'], ['combination', 'Combination'], ['team', 'Team'], ['history', 'History'], ['insights', 'Insights']] as [Category, string][]).map(([id, label]) => <button key={id} type="button" onClick={() => { setCategory(id); setExpanded(null) }} className={`shrink-0 rounded-lg px-3 py-2 text-[10px] font-bold ${category === id ? 'bg-emerald-500 text-black' : 'text-zinc-400'}`}>{label}</button>)}</div>
    {category !== 'history' && category !== 'insights' && groups.map(renderGroup)}
    {category === 'history' && <><section className="mb-6"><h2 className="mb-2 text-sm font-semibold">Season History</h2><div className="space-y-3">{history.slice().reverse().map(row => <details key={row.season} className="rounded-xl bg-zinc-900 p-3"><summary className="cursor-pointer text-sm font-black">{row.season}</summary><div className="mt-3 grid grid-cols-3 gap-2 text-[10px]"><Award label="League Champion" value={name(row.league)} /><Award label="Cup Champion" value={name(row.cup)} /><Award label="Champions Champion" value={name(row.champions)} /><Award label="Golden Boot" value={`${playerName(row.scorer?.playerId)} · ${row.scorer?.goals ?? 0}`} /><Award label="Assist Leader" value={`${playerName(row.assists?.playerId)} · ${row.assists?.assists ?? 0}`} /><Award label="Best Avg Rating" value={`${playerName(row.rating?.playerId)} · ${row.rating?.avgRating.toFixed(2) ?? '—'}`} /><Award label="Most MOM" value={`${playerName(row.mom?.playerId)} · ${row.mom?.mom ?? 0}`} /></div>{row.xi.length > 0 && <p className="mt-3 text-[10px] leading-relaxed text-zinc-400"><b className="text-zinc-200">Team of the Season:</b> {row.xi.join(', ')}</p>}</details>)}</div></section><section><h2 className="mb-2 text-sm font-semibold">Trophy Cabinet</h2><div className="overflow-hidden rounded-xl bg-zinc-900">{trophies.map(row => <div key={row.team.id} className="grid grid-cols-[1fr_repeat(4,32px)] border-b border-white/5 px-3 py-2.5 text-[10px] last:border-0"><b className="truncate">{row.team.name}</b><span>{row.league}</span><span>{row.cup}</span><span>{row.champions}</span><b className="text-emerald-300">{row.total}</b></div>)}</div></section></>}
    {category === 'insights' && <><section className="mb-6"><h2 className="mb-2 text-sm font-semibold">Team Form · {season}</h2><div className="space-y-2">{insights.teams.map(row => <div key={row.team.id} className="rounded-xl bg-zinc-900 p-3"><div className="flex justify-between"><b className="text-xs">{row.team.name}</b><span className="text-[10px] tracking-widest">{row.form.join(' ')}</span></div><p className="mt-1 text-[10px] text-zinc-500">{(row.goals / row.games.length).toFixed(2)} GF/match · {(row.conceded / row.games.length).toFixed(2)} GA/match · {(row.opponentSot / row.games.length).toFixed(2)} opponent SOT</p></div>)}</div></section><section><h2 className="mb-2 text-sm font-semibold">In-form Players</h2><div className="space-y-2">{insights.players.map(row => <button key={row.player.id} type="button" onClick={() => onNavigate({ name: 'player', id: row.player.id })} className="flex w-full justify-between rounded-xl bg-zinc-900 p-3 text-left text-xs"><b>{playerFullName(row.player)}</b><span className="text-emerald-300">Last 5 · {row.form.last5Average.toFixed(2)}</span></button>)}</div></section></>}
  </div>
}

function Award({ label, value }: { label: string; value: string }) { return <div className="rounded-lg bg-black/30 p-2"><small className="block text-zinc-500">{label}</small><b className="mt-1 block break-words">{value}</b></div> }
