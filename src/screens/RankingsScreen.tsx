import { useMemo, useRef, useState } from 'react'
import { playerDisplayName } from '../components/ui'
import { getLeaderboard, seasonsFromMatches, type LeaderboardMetric } from '../engine/stats'
import { useStore } from '../store'
import { emptyFilters, matchesForPlayer, RankingFilterButton } from './RankingFilters'
import type { View } from '../types'

const CATEGORIES: { id: LeaderboardMetric; label: string }[] = [
  { id: 'rating', label: 'Rating' },
  { id: 'goals', label: 'Goals' },
  { id: 'assists', label: 'Assists' },
  { id: 'g+a', label: 'G+A' },
  { id: 'minutes', label: 'Minutes' },
  { id: 'mom', label: 'MOM' },
  { id: 'goals/90', label: 'G/90' },
  { id: 'assists/90', label: 'A/90' },
  { id: 'g+a/90', label: 'G+A/90' },
  { id: 'ga/90', label: 'GA/90' },
  { id: 'cleanSheets', label: 'CS' },
  { id: 'saves', label: 'Saves' },
]


export function RankingsScreen({
  onNavigate,
}: {
  onNavigate: (view: View) => void
}) {
  const { players, teams, matches } = useStore()
  const [metric, setMetric] = useState<LeaderboardMetric>('rating')
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const drag = useRef({ x: 0, left: 0, active: false, moved: false })
  const rows = useMemo(() => {
    // Scope each player's matches by historical team before using the existing engine.
    return players.flatMap(player => getLeaderboard(
      players, matchesForPlayer(player, matches, appliedFilters),
      { ...appliedFilters, teams: [] }, metric,
    ).filter(row => row.playerId === player.id)).sort((a, b) => metric === 'ga/90' ? a.value - b.value : b.value - a.value)
  }, [players, matches, metric, appliedFilters])

  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))

  return (
    <div className="px-4 pb-8 pt-6 max-w-md mx-auto h-screen relative bg-black text-white shadow-2xl overflow-hidden flex flex-col">
      <button
        type="button"
        onClick={() => onNavigate({ name: 'home' })}
        className="mb-3 text-xs font-semibold text-emerald-400"
      >
        ← Home
      </button>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rankings</h1>
        <RankingFilterButton applied={appliedFilters} onApply={setAppliedFilters} seasons={seasonsFromMatches(matches)} teams={teams} />
      </div>
      
      {/* Category Selector */}
      <div className="no-scrollbar flex shrink-0 overflow-x-auto gap-2 pb-2 mb-4 touch-pan-x"
        onPointerDown={event => {
          if (event.pointerType !== 'mouse') return
          drag.current = { x: event.clientX, left: event.currentTarget.scrollLeft, active: true, moved: false }
        }}
        onPointerMove={event => {
          if (!drag.current.active) return
          const delta = event.clientX - drag.current.x
          if (Math.abs(delta) > 5) {
            drag.current.moved = true
            event.currentTarget.setPointerCapture(event.pointerId)
            event.currentTarget.scrollLeft = drag.current.left - delta
          }
        }}
        onPointerUp={() => { drag.current.active = false }}
        onPointerCancel={() => { drag.current.active = false }}
        onClickCapture={event => { if (drag.current.moved) { event.preventDefault(); event.stopPropagation(); drag.current.moved = false } }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setMetric(cat.id)}
            className={`basis-[calc((100%-1.5rem)/4)] shrink-0 select-none whitespace-nowrap px-1 py-2 rounded-full text-xs font-semibold ${
              metric === cat.id ? 'bg-emerald-500 text-black' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto space-y-2">
        {rows.length === 0 && <p className="py-4 text-sm text-zinc-400">No players found.</p>}
        {rows.map((row, i) => {
          const player = byId[row.playerId]
          const playerMatches = matchesForPlayer(player, matches, appliedFilters)
          const historicalTeamId = [...playerMatches].sort((a, b) => b.date.localeCompare(a.date) || b.matchDay - a.matchDay)[0]?.appearances.find(a => a.playerId === player.id)?.teamId
          const team = teamById[historicalTeamId ?? row.teamId]
          return (
            <button
              key={row.playerId}
              type="button"
              onClick={() => onNavigate({ name: 'player', id: row.playerId })}
              className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 px-3 py-2.5 text-left"
            >
              <span className="w-5 text-center text-xs font-bold text-zinc-500">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{playerDisplayName(player)}</span>
                <span className="text-[11px] text-zinc-400">
                  {team?.shortName} · {player?.position}
                </span>
              </span>
              <span className="text-sm font-bold">
                {row.value.toFixed(metric === 'rating' || metric.endsWith('/90') ? 2 : 0)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
