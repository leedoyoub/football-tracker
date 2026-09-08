import { useState } from 'react'
import { Pitch } from '../components/Pitch'
import { PlayerIcon } from '../components/PlayerIcon'
import { playerDisplayName, ratingTone } from '../components/ui'
import { globalRankings, seasonsFromMatches, unifiedBestEleven } from '../engine/stats'
import { useStore } from '../store'
import type { RankSort, View } from '../types'

export function HomeScreen({
  season,
  onSeason,
  onNavigate,
}: {
  season: string
  onSeason: (season: string) => void
  onNavigate: (view: View) => void
}) {
  const { players, teams, matches } = useStore()
  const [activeCategory, setActiveCategory] = useState<RankSort>('rating')
  const seasons = seasonsFromMatches(matches)
  const ranking = globalRankings(players, matches, season, activeCategory)
  const top3 = ranking.slice(0, 3)
  const tots = unifiedBestEleven(players, matches, season)
  const teamOfWeek = unifiedBestEleven(players, matches, season, true)
  const byId = Object.fromEntries(players.map((p) => [p.id, p]))
  const teamById = Object.fromEntries(teams.map((t) => [t.id, t]))
  const teamForSeasonPlayer = (playerId: string, fallback?: string) => {
    const participation = matches.filter((match) => match.season === season).flatMap((match) => {
      const appearance = match.appearances.find((item) => item.playerId === playerId)
      return appearance ? [{ match, teamId: appearance.teamId }] : []
    }).sort((a, b) => b.match.matchDay - a.match.matchDay || b.match.date.localeCompare(a.match.date))[0]
    return teamById[participation?.teamId ?? fallback ?? '']
  }

  return (
    <div className="px-4 pb-8 pt-6">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-400">
        Season
      </div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Match Center</h1>
        <select
          value={season}
          onChange={(e) => onSeason(e.target.value)}
          className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs"
        >
          {(seasons.length ? seasons : [season]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Global ranking</h2>
            <p className="text-xs text-zinc-400">All teams · {season}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'rankings', sort: activeCategory })}
            className="text-xs font-semibold text-emerald-400"
          >
            View all
          </button>
        </div>

        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {([
            ['rating', 'Rating'],
            ['goals', 'Goals'],
            ['assists', 'Assists'],
            ['minutes', 'Minutes'],
          ] as [RankSort, string][]).map(([sort, label]) => (
            <button
              key={sort}
              type="button"
              onClick={() => setActiveCategory(sort)}
              className={`rounded-xl py-1.5 text-[11px] font-semibold border transition-all ${
                activeCategory === sort
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-900 border-transparent text-zinc-400 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {top3.length === 0 && (
            <p className="rounded-2xl bg-zinc-900 p-4 text-sm text-zinc-400">
              No rated appearances yet this season.
            </p>
          )}
          {top3.map((row, i) => {
            const player = byId[row.playerId]
            const team = teamForSeasonPlayer(row.playerId, row.teamId)
            return (
              <div
                key={row.playerId}
                className="flex w-full items-center gap-3 rounded-2xl bg-zinc-900 px-3 py-3 text-left animate-fade-in"
              >
                <span className="w-6 text-center text-sm font-bold text-zinc-500">{i + 1}</span>
                <PlayerIcon player={player} team={team} onClick={() => onNavigate({ name: 'player', id: row.playerId })} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{playerDisplayName(player)}</span>
                  <span className="text-[11px] text-zinc-400">
                    {team?.shortName} · {player?.position}
                  </span>
                </span>
                <span className={`text-lg font-bold ${activeCategory === 'rating' ? ratingTone(row.avgRating) : 'text-zinc-200'}`}>
                  {activeCategory === 'rating' ? row.avgRating.toFixed(1) :
                   activeCategory === 'goals' ? `${row.goals} G` :
                   activeCategory === 'assists' ? `${row.assists} A` :
                   `${row.minutes}m`}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Team of the Week</h2>
          <p className="text-xs text-zinc-400">Recent 3 Match Average Rating · 4-3-3</p>
        </div>
        <Pitch slots={teamOfWeek.slots} players={players} teams={teams} statsByPlayer={teamOfWeek.statsByPlayer} layout="free" showPositionBadge={false} onSlotClick={(slot) => onNavigate({ name: 'player', id: slot.playerId! })} />
      </section>

      <section className="mt-7">
        <div className="mb-3">
          <h2 className="text-lg font-semibold">Team of the Year</h2>
          <p className="text-xs text-zinc-400">Season Average Rating · 4-3-3</p>
        </div>
        <Pitch slots={tots.slots} players={players} teams={teams} statsByPlayer={tots.statsByPlayer} layout="free" showPositionBadge={false} onSlotClick={(slot) => onNavigate({ name: 'player', id: slot.playerId! })} />
      </section>
    </div>
  )
}
