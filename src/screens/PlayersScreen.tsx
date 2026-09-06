import { useMemo, useState } from 'react'
import { playerDisplayName, ratingTone } from '../components/ui'
import { playerSeasonStats, seasonsFromMatches } from '../engine/stats'
import { useStore } from '../store'
import type { View } from '../types'

export function PlayersScreen({
  season,
  onNavigate,
}: {
  season: string
  onNavigate: (view: View) => void
}) {
  const { players, teams, matches } = useStore()
  const [q, setQ] = useState('')
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase()
    return players
      .filter((p) => !query || playerDisplayName(p).toLowerCase().includes(query) || p.fullName?.toLowerCase().includes(query) || p.position.toLowerCase() === query)
      .map((player) => ({
        player,
        team: teams.find((t) => t.id === player.teamId),
        stats: playerSeasonStats(player, matches, activeSeason),
      }))
      .sort((a, b) => b.stats.avgRating - a.stats.avgRating || playerDisplayName(a.player).localeCompare(playerDisplayName(b.player)))
  }, [players, teams, matches, q, activeSeason])

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
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search name or position"
        className="mb-4 w-full rounded-2xl border border-white/10 bg-zinc-900 px-3 py-2.5 text-sm outline-none placeholder:text-zinc-500"
      />
      <div className="space-y-2">
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
