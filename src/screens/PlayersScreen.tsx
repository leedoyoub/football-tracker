import { useMemo, useState } from 'react'
import { playerDisplayName, ratingTone } from '../components/ui'
import { aggregatePlayerStats, seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import { emptyFilters, matchesForPlayer, RankingFilterButton } from './RankingFilters'
import type { View } from '../types'


export function PlayersScreen({
  onNavigate,
}: {
  onNavigate: (view: View) => void
}) {
  const { players, teams, matches } = useStore()
  const seasons = useMemo(() => seasonsFromMatches(matches), [matches])
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return players
      .filter(p => !appliedFilters.positions.length || appliedFilters.positions.includes(p.position))
      .filter(p => [p.displayName, p.fullName, p.name].some(name => name?.toLowerCase().includes(query)))
      .map(player => {
        const playerMatches = matchesForPlayer(player, matches, appliedFilters)
        const historicalTeamId = [...playerMatches].sort((a, b) => b.date.localeCompare(a.date) || b.matchDay - a.matchDay)[0]?.appearances.find(a => a.playerId === player.id)?.teamId
        return {
          player,
          team: teams.find(t => t.id === (historicalTeamId ?? player.teamId)),
          stats: aggregatePlayerStats(player, players, playerMatches),
          matchesFilter: (!appliedFilters.seasons.length && !appliedFilters.teams.length) || playerMatches.length > 0 ||
            (!appliedFilters.seasons.length && [player.teamId, ...(player.teamIds ?? [])].some(id => appliedFilters.teams.includes(id))),
        }
      })
      .filter(row => row.matchesFilter)
      .sort((a, b) => b.stats.avgRating - a.stats.avgRating || playerDisplayName(a.player).localeCompare(playerDisplayName(b.player)))
  }, [players, teams, matches, appliedFilters, search])

  return (
    <div className="px-4 pb-8 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Players</h1>
        <button
          type="button"
          onClick={() => onNavigate({ name: 'new-player' })}
          className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black"
        >
          Add
        </button>
      </div>
      
      <div className="mb-4 flex gap-2">
        <input type="search" aria-label="Search players" placeholder="Search players" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-900 px-3 py-2 text-sm" />
        <RankingFilterButton applied={appliedFilters} onApply={setAppliedFilters} seasons={seasons} teams={teams} />
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="py-4 text-sm text-zinc-400">No players found.</p>}
        {rows.map(({ player, team, stats }) => (
          <button
            key={player.id}
            type="button"
            onClick={() => onNavigate({ name: 'player', id: player.id })}
            className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 px-3 py-2.5 text-left"
          >
            <span className="w-8 text-center text-xs font-bold text-zinc-500">{player.number}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{playerDisplayName(player)}</span>
              <span className="text-[11px] text-zinc-400">
                {team?.shortName} · {player.position}
              </span>
            </span>
            <span className={`text-sm font-bold ${ratingTone(stats.avgRating || 6.5)}`}>
              {stats.matches ? stats.avgRating.toFixed(1) : '—'}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
