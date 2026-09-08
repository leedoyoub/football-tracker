import { useState } from 'react'
import { recentMatches } from './recentMatches'
import { Pitch } from '../components/Pitch'
import { TeamIcon } from '../components/TeamIcon'
import { formatDate, SubstitutePlayerCard } from '../components/ui'
import { matchScore, ratePlayerMatch } from '../engine/rating'
import { aggregatePlayerStats, playerSeasonStats, seasonsFromMatches, teamBestEleven } from '../engine/stats'
import { seasonStandings, standingForTeam } from '../engine/standings'
import { useStore } from '../store'
import type { View } from '../types'

export function TeamDetailScreen({ teamId, season, onNavigate, onBack }: { teamId: string; season: string; onNavigate: (view: View) => void; onBack: () => void }) {
  const { teams, players, matches } = useStore()
  const [expandedContext, setExpandedContext] = useState<string | null>(null)
  const team = teams.find((item) => item.id === teamId)
  const seasons = seasonsFromMatches(matches)
  const activeSeason = seasons.includes(season) ? season : seasons[0] ?? season
  if (!team) return <div className="p-6 text-sm text-zinc-400">Team not found.</div>

  const best = teamBestEleven(players, matches, teamId, activeSeason)
  const standing = standingForTeam(seasonStandings(teams, matches, activeSeason), teamId)
  const statsByPlayer = Object.fromEntries(players.filter((player) => (player.teamIds ?? [player.teamId]).includes(teamId)).map((player) => {
    const stats = playerSeasonStats(player, players, matches, activeSeason, teamId)
    return [player.id, { goals: stats.goals, assists: stats.assists }]
  }))
  const recent = recentMatches(matches.filter((match) => match.season === activeSeason && (match.homeTeamId === teamId || match.awayTeamId === teamId)))
  const context = JSON.stringify([teamId, activeSeason])
  const showAll = expandedContext === context
  const visibleMatches = showAll ? recent : recent.slice(0, 5)
  const starterIds = new Set(best.slots.flatMap(slot => slot.playerId ? [slot.playerId] : []))
  const latestBench = (best.match?.appearances.filter((appearance) => appearance.teamId === teamId && appearance.role === 'bench' && !starterIds.has(appearance.playerId)) ?? [])
    .filter((appearance, index, list) => list.findIndex(item => item.playerId === appearance.playerId) === index)
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
    <button type="button" onClick={onBack} className="mb-3 text-xs font-semibold text-emerald-400">← Back</button>
    <header className="mb-5 flex items-center gap-3">
      <TeamIcon team={team} className="h-12 w-12 text-sm font-black">{team.shortName}</TeamIcon>
      <div><h1 className="text-xl font-bold">{team.name}</h1><p className="text-[10px] uppercase tracking-widest text-zinc-500">{activeSeason} · Season stats</p></div>
      <div className="ml-auto"><button type="button" onClick={() => onNavigate({ name: 'new-match', teamId })} className="rounded-full bg-emerald-500 px-3 py-2 text-xs font-bold text-black">Log match</button></div>
    </header>
    <section aria-label="Roster management" className="mb-5 rounded-xl border border-white/10 bg-zinc-900 p-3"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Roster management</h2><p className="mt-0.5 text-[11px] text-zinc-400">Import official squad and player photos</p></div><button type="button" onClick={() => onNavigate({ name: 'import-squad', teamId })} className="shrink-0 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300">Import Squad</button></div></section>
    <div className="mb-5 grid grid-cols-4 gap-2 text-center">
      {[['Position', standing ? `${standing.rank}${standing.rank === 1 ? 'st' : standing.rank === 2 ? 'nd' : standing.rank === 3 ? 'rd' : 'th'}` : '—'], ['Matches', recent.length], ['W-D-L', `${record.wins}-${record.draws}-${record.losses}`], ['Pts', standing?.points ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-zinc-900 px-1 py-2"><div className="text-sm font-black">{value}</div><div className="text-[9px] uppercase text-zinc-500">{label}</div></div>)}
    </div>
    <div className="mb-3 flex items-end justify-between"><div><h2 className="text-lg font-semibold">Starting XI</h2><p className="text-xs text-zinc-400">Latest match kickoff XI · {best.formation ?? 'Saved formation unavailable'}</p></div><span className="text-[10px] text-zinc-500">match rating</span></div>
    {best.match && best.slots.length ? <Pitch slots={best.slots} players={players} teams={teams} statsByPlayer={statsByPlayer} showPositionBadge={false} onSlotClick={(slot) => { if (slot.playerId) onNavigate({ name: 'player', id: slot.playerId }) }} /> : <div className="rounded-2xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">No match data yet</div>}
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-semibold">Substitutes</h2>
      {latestBench.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {latestBench.map((appearance) => {
            const player = players.find((item) => item.id === appearance.playerId)
            const ratingBreakdown = best.match && player ? ratePlayerMatch(best.match, player) : null
            const entered = best.match?.events.some((event) => event.type === 'sub' && event.teamId === teamId && event.playerInId === appearance.playerId)
            const rating = entered ? ratingBreakdown?.raw : undefined
            if (!player) return null
            const stats = ratingBreakdown && best.match ? aggregatePlayerStats(player, players, [best.match]) : undefined
            return (
              <SubstitutePlayerCard
                key={player.id}
                player={player}
                team={team}
                rating={rating}
                position={appearance.position}
                stats={stats}
                onClick={() => onNavigate({ name: 'player', id: player.id })}
              />
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-zinc-900 p-3 text-xs text-zinc-500">No substitutes recorded for the latest match.</p>
      )}
    </section>

    <section className="mt-6"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent matches</h2>{recent.length > 5 && <button type="button" aria-expanded={showAll} onClick={() => setExpandedContext(showAll ? null : context)} className="secondary-view-all">{showAll ? 'Show Less' : 'View All'}</button>}</div>{visibleMatches.map((match) => { const score = matchScore(match); const home = teams.find((item) => item.id === match.homeTeamId); const away = teams.find((item) => item.id === match.awayTeamId); return <button key={match.id} type="button" onClick={() => onNavigate({ name: 'match', id: match.id })} className="mb-2 flex w-full items-center justify-between rounded-xl bg-zinc-900 px-3 py-3 text-left"><span className="text-[10px] text-zinc-500">MD{match.matchDay}</span><span className="text-sm font-bold">{home?.shortName} {score.home}–{score.away} {away?.shortName}</span><span className="text-[10px] text-zinc-500">{formatDate(match.date)}</span></button> })}</section>
  </div>
}
