import { useState } from 'react'
import { APP_VERSION } from '../config'
import { Pitch } from '../components/Pitch'
import { PlayerIcon } from '../components/PlayerIcon'
import { playerFullName, ratingTone } from '../components/ui'
import { globalRankings, seasonsFromMatches, unifiedBestEleven } from '../engine/stats'
import { seasonStandings } from '../engine/standings'
import { homeDataStories, isSeasonComplete } from '../engine/seasonInsights'
import { StandingsTable } from '../components/StandingsTable'
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
  const standings = seasonStandings(teams, matches, season)
  const stories = homeDataStories(players, matches, season)
  const seasonComplete = isSeasonComplete(matches, season)
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
        <div className="flex items-center gap-2"><button type="button" onClick={() => onNavigate({ name: 'data-management' })} className="rounded-full bg-zinc-900 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300">Account</button><select
          value={season}
          onChange={(e) => onSeason(e.target.value)}
          className="rounded-full border border-white/10 bg-zinc-900 px-3 py-1.5 text-xs"
        >
          {(seasons.length ? seasons : [season]).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select></div>
      </div>

      {(stories.length > 0 || seasonComplete) && <section className="mb-6">
        <div className="mb-2 flex items-center justify-between"><div><h2 className="text-lg font-semibold">Season stories</h2><p className="text-xs text-zinc-400">The signals that matter right now</p></div>{seasonComplete && <button type="button" onClick={() => onNavigate({ name: 'season-recap', season })} className="rounded-full bg-emerald-500 px-3 py-1.5 text-[10px] font-black text-black">RECAP</button>}</div>
        <div className="space-y-1.5">{stories.map(story => <button key={story.id} type="button" onClick={() => story.playerIds[0] && onNavigate({ name: 'player', id: story.playerIds[0] })} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-zinc-900 px-3 py-2.5 text-left"><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wide text-emerald-400">{story.eyebrow}</span><span className="block truncate text-sm font-semibold">{story.title}</span></span><span className="max-w-40 text-right text-[11px] text-zinc-400">{story.detail}</span></button>)}</div>
      </section>}

      <section className="mb-6">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold">Global ranking</h2>
            <p className="text-xs text-zinc-400">All teams · {season}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate({ name: 'rankings', sort: activeCategory })}
            className="secondary-view-all"
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
                  <span className="block truncate text-sm font-semibold">{playerFullName(player)}</span>
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

      <section className="mb-7">
        <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Standings</h2><p className="text-xs text-zinc-400">{season}</p></div>{standings.length > 7 && <button type="button" onClick={() => onNavigate({ name: 'standings' })} className="secondary-view-all">View All</button>}</div>
        <StandingsTable standings={standings.slice(0, 7)} teams={teams} compact />
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
      <footer className="mt-8 text-center text-[10px] text-zinc-600">Football Tracker · v{APP_VERSION}</footer>
    </div>
  )
}
