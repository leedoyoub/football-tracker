import { playerDisplayName, ratingTone } from '../components/ui'
import { globalRankings } from '../engine/stats'
import { useStore } from '../store'
import type { RankSort, View } from '../types'

const SORTS: { id: RankSort; label: string }[] = [
  { id: 'rating', label: 'Avg' },
  { id: 'goals', label: 'G' },
  { id: 'assists', label: 'A' },
  { id: 'minutes', label: 'Min' },
]

export function RankingsScreen({
  season,
  sort,
  onSort,
  onNavigate,
}: {
  season: string
  sort: RankSort
  onSort: (sort: RankSort) => void
  onNavigate: (view: View) => void
}) {
  const { players, teams, matches } = useStore()
  const rows = globalRankings(players, matches, season, sort)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))

  return (
    <div className="px-4 pb-8 pt-6">
      <button
        type="button"
        onClick={() => onNavigate({ name: 'home' })}
        className="mb-3 text-xs font-semibold text-emerald-400"
      >
        ← Home
      </button>
      <h1 className="text-2xl font-semibold">Unified ranking</h1>
      <p className="mb-4 text-xs text-zinc-400">{season} · every team</p>
      <div className="mb-4 grid grid-cols-4 gap-1 rounded-full bg-zinc-900 p-1">
        {SORTS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSort(item.id)}
            className={`rounded-full py-1.5 text-xs font-semibold ${
              sort === item.id ? 'bg-emerald-500 text-black' : 'text-zinc-400'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const player = byId[row.playerId]
          const team = teamById[row.teamId]
          const stat =
            sort === 'goals'
              ? row.goals
              : sort === 'assists'
                ? row.assists
                : sort === 'minutes'
                  ? row.minutes
                  : row.avgRating.toFixed(1)
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
                  {team?.shortName} · {player?.position} · {row.matches} apps
                </span>
              </span>
              <span
                className={`text-sm font-bold ${sort === 'rating' ? ratingTone(row.avgRating) : 'text-white'}`}
              >
                {stat}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
