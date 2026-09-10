import { useMemo, useState } from 'react'
import { playerFullName, ratingTone } from '../components/ui'
import { PlayerIcon } from '../components/PlayerIcon'
import { aggregatePlayerStats, seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import { emptyFilters, matchesForPlayer, playerHasNoCurrentTeam, RankingFilterButton } from './RankingFilters'
import type { View } from '../types'
import type { RankingFilters } from './RankingFilters'

export function PlayersScreen({ onNavigate, appliedFilters = emptyFilters, onFiltersChange = () => {} }: { onNavigate: (view: View) => void; appliedFilters: RankingFilters; onFiltersChange: (filters: RankingFilters) => void }) {
  const { players, teams, matches } = useStore()
  const seasons = useMemo(() => seasonsFromMatches(matches), [matches])
  const [search, setSearch] = useState('')
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return players
      .filter(player => !appliedFilters.positions.length || appliedFilters.positions.includes(player.position))
      .filter(player => [player.displayName, player.fullName, player.name].some(name => name?.toLowerCase().includes(query)))
      .map(player => {
        const playerMatches = matchesForPlayer(player, matches, appliedFilters)
        return { player, team: teams.find(team => team.id === player.teamId), stats: aggregatePlayerStats(player, players, playerMatches), matchesFilter: (!appliedFilters.seasons.length && !appliedFilters.teams.length) || playerMatches.length > 0 || (appliedFilters.teams.includes('__no-team__') && playerHasNoCurrentTeam(player)) || (!appliedFilters.seasons.length && [player.teamId, ...(player.teamIds ?? [])].some(id => appliedFilters.teams.includes(id))) }
      })
      .filter(row => row.matchesFilter)
      .sort((left, right) => right.stats.avgRating - left.stats.avgRating || playerFullName(left.player).localeCompare(playerFullName(right.player)))
  }, [players, teams, matches, appliedFilters, search])
  return <div className="px-4 pb-8 pt-6"><div className="mb-4 flex items-center justify-between"><h1 className="text-2xl font-semibold">Players</h1><button type="button" onClick={() => onNavigate({ name: 'new-player' })} className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black">Add</button></div><div className="mb-4 flex gap-2"><input type="search" aria-label="Search players" placeholder="Search players" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" /><RankingFilterButton applied={appliedFilters} onApply={onFiltersChange} seasons={seasons} teams={teams} /></div><div className="space-y-2">{rows.length === 0 && <p className="py-4 text-sm text-zinc-400">No players found.</p>}{rows.map(({ player, team, stats }) => <button key={player.id} type="button" onClick={() => onNavigate({ name: 'player', id: player.id })} className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 px-3 py-2.5 text-left"><PlayerIcon player={player} team={team} className="h-10 w-10 text-[10px]" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{playerFullName(player)}</span><span className="text-[11px] text-zinc-400">{team?.shortName ?? (playerHasNoCurrentTeam(player) ? 'No Team' : 'Unassigned')} · {player.position}</span></span><span className={`text-sm font-bold ${ratingTone(stats.avgRating || 6.5)}`}>{stats.matches ? stats.avgRating.toFixed(2) : '-'}</span></button>)}</div></div>
}
