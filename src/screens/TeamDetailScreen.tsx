import { Pitch } from '../components/Pitch'
import { PlayerIcon } from '../components/PlayerIcon'
import { TeamIcon } from '../components/TeamIcon'
import { formatDate, playerDisplayName, StatIcons } from '../components/ui'
import { matchScore } from '../engine/rating'
import { playerSeasonStats, seasonsFromMatches, teamBestEleven, teamMatches } from '../engine/stats'
import { useStore } from '../store'
import type { View } from '../types'

export function TeamDetailScreen({ teamId, season, onNavigate }: { teamId: string; season: string; onNavigate: (view: View) => void }) {
  const { teams, players, matches } = useStore()
  const team = teams.find((item) => item.id === teamId)
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season
  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const best = teamBestEleven(players, matches, teamId, activeSeason)
  const statsByPlayer = Object.fromEntries(players.filter((player) => (player.teamIds ?? [player.teamId]).includes(teamId)).map((player) => {
    const stats = playerSeasonStats(player, matches, activeSeason, teamId)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  const recent = teamMatches(matches.filter((match) => match.season === activeSeason), teamId)
  const latestBench = best.match?.appearances.filter((appearance) => appearance.teamId === teamId && appearance.role === 'bench') ?? []
  const record = recent.reduce((acc, match) => {
    const score = matchScore(match)
    const won = match.homeTeamId === teamId ? score.home > score.away : score.away > score.home
    const drawn = score.home === score.away
    if (won) acc.wins += 1
    else if (drawn) acc.draws += 1
    else acc.losses += 1
    acc.for += match.homeTeamId === teamId ? score.home : score.away
    acc.against += match.homeTeamId === teamId ? score.away : score.home
    return acc
  }, { wins: 0, draws: 0, losses: 0, for: 0, against: 0 })

  return <div className="px-4 pb-8 pt-6">
    <button type="button" onClick={() => onNavigate({ name: 'teams' })} className="mb-3 text-xs font-semibold text-emerald-400">← Teams</button>
    <header className="mb-5 flex items-center gap-3">
      <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName}</TeamIcon>
      <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">{activeSeason} · Season stats</p></div>
      <div className="ml-auto flex gap-2"><button type="button" onClick={() => onNavigate({ name: 'edit-team', id: teamId })} className="rounded-full bg-zinc-800 px-3 py-2 text-xs font-bold">Edit</button><button type="button" onClick={() => onNavigate({ name: 'new-match', teamId })} className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Log match</button></div>
    </header>
    <div className="mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Matches', recent.length], ['W-D-L', `${record.wins}-${record.draws}-${record.losses}`], ['GF', record.for], ['GA', record.against]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div>
    <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Best XI</h2><p className="text-xs text-zinc-400">Last starting XI shape · {best.formation ?? 'No recent match'}</p></div><span className="text-[10px] text-zinc-500">season average rating</span></div>
    {best.match ? <Pitch slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No recent match</div>}
    <section className="mt-6"><h2 className="mb-2 text-sm font-semibold">Substitutes</h2>{latestBench.length ? <div className="grid gap-1.5">{latestBench.map((appearance) => { const player = players.find((item) => item.id === appearance.playerId); const stat = statsByPlayer[appearance.playerId]; return player ? <button key={player.id} type="button" onClick={() => onNavigate({ name: 'player', id: player.id })} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-3 py-2 text-left"><span className="w-7 text-[10px] font-black text-zinc-400">{appearance.position}</span><PlayerIcon player={player} team={team} className="h-8 w-8 text-[10px]" /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{playerDisplayName(player)}</span><StatIcons goals={stat?.goals ?? 0} assists={stat?.assists ?? 0} className="text-[10px] text-zinc-400" /></button> : null })}</div> : <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No substitutes recorded for the latest match.</p>}</section>
    <section className="mt-6"><h2 className="mb-2 text-sm font-semibold">Recent matches</h2>{recent.map((match) => { const score = matchScore(match); const home = teams.find((item) => item.id === match.homeTeamId); const away = teams.find((item) => item.id === match.awayTeamId); return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="mb-2 flex w-full items-center justify-between rounded-xl bg-zinc-900 px-3 py-3 text-left"><span className="text-[10px] text-zinc-500">MD{match.matchDay}</span><span className="text-sm font-bold">{home?.shortName} {score.home}–{score.away} {away?.shortName}</span><span className="text-[10px] text-zinc-500">{formatDate(match.date)}</span></button> })}</section>
  </div>
}
